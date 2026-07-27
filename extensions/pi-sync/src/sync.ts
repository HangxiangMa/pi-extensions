import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	completeSyncArguments,
	parseOptions,
	resolveSyncCommand,
	setSyncTargetCompletions,
	usage,
	validateCommandOptions,
} from "./command.js";
import {
	activeLocalConfigPath,
	configuredTargetNames,
	consumeLocalConfigMigrationNotice,
	deprecatedPiSyncEnvironmentWarnings,
	ensureStateDir,
	isEnabled,
	isExplicitlyEnabled,
	isMissingConfigError,
	loadConfig,
	loadPartialConfig,
	localConfigPath,
	localConfigTemplate,
	normalizeExtraFiles,
	normalizeSyncFiles,
	readLocalConfigObject,
	readStateForConfig,
	sessionTokenWarnings,
	syncSessionsWarnings,
	writeLocalConfigObject,
} from "./config.js";
import { showFileSelection } from "./file-selection.js";
import { unlock, withLock } from "./lock.js";
import { showSetupWizard, showSyncManager } from "./manager-ui.js";
import { createSnapshot } from "./snapshot.js";
import { recoverSnapshotTransactionsOnStartup } from "./snapshot-transaction.js";
import { errorMessage, redact } from "./sync-format.js";
import {
	diff,
	doctor,
	history,
	pull,
	push,
	rollback,
	status,
	syncBoth,
} from "./sync-operations.js";
import { hasLocalChanges } from "./sync-state.js";
import { TargetPullRequiresUiError, useSyncTarget } from "./target-switch.js";
import type { AnySyncConfig, CommandOptions, SnapshotOptions } from "./types.js";

const STATUS_KEY = "sync";
const DEFAULT_PROFILE = "default";
const DEFAULT_PREFIX = "pi-sync";
const DEFAULT_REGION = "auto";

const AUTO_SYNC_OPTIONS: CommandOptions = {
	yes: true,
	force: false,
	stale: false,
	silent: true,
	reload: false,
	auto: true,
	args: [],
};
export default function sync(pi: ExtensionAPI) {
	let sessionAbort = new AbortController();
	let shutdownAbort: AbortController | undefined;

	pi.registerCommand("sync", {
		description: "Sync Pi settings through Cloudflare R2 or S3-compatible storage",
		getArgumentCompletions: completeSyncArguments,
		handler: async (args, ctx) => {
			await handleCommand(args, ctx, sessionAbort.signal);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		shutdownAbort?.abort(new DOMException("Session replaced", "AbortError"));
		shutdownAbort = undefined;
		sessionAbort.abort(new DOMException("Session replaced", "AbortError"));
		sessionAbort = new AbortController();
		const signal = sessionAbort.signal;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		try {
			await recoverSnapshotTransactionsOnStartup();
			if (signal.aborted) return;
		} catch (error) {
			if (signal.aborted) return;
			ctx.ui.notify(`pi-sync recovery required: ${errorMessage(error)}`, "error");
			return;
		}
		try {
			setSyncTargetCompletions(await configuredTargetNames());
			if (signal.aborted) return;
		} catch {
			if (signal.aborted) return;
			setSyncTargetCompletions([]);
		}
		const migrationNotice = consumeLocalConfigMigrationNotice();
		if (migrationNotice) ctx.ui.notify(migrationNotice, "warning");
		const warnings = deprecatedPiSyncEnvironmentWarnings();
		if (warnings.length > 0) ctx.ui.notify(warnings.join("\n"), "warning");
		await autoSync(ctx, signal);
	});

	pi.on("session_shutdown", async (event, ctx) => {
		sessionAbort.abort(new DOMException("Session shut down", "AbortError"));
		shutdownAbort?.abort(new DOMException("Session shut down again", "AbortError"));
		const controller = new AbortController();
		shutdownAbort = controller;
		const signal = combineSignals(controller.signal, AbortSignal.timeout(30_000));
		const reason =
			typeof event === "object" && event ? (event as { reason?: string }).reason : undefined;
		try {
			if (reason !== "reload") await autoPushSessions(ctx, signal);
		} finally {
			if (shutdownAbort === controller) shutdownAbort = undefined;
		}
		if (signal.aborted) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}

async function handleCommand(
	rawArgs: string,
	ctx: ExtensionCommandContext,
	sessionSignal: AbortSignal,
) {
	if (!rawArgs.trim()) {
		try {
			await showSyncManager(ctx, (route, signal, onCommit, target) =>
				executeCommand(route, ctx, combineSignals(sessionSignal, signal), onCommit, target),
			);
		} catch (error) {
			if (sessionSignal.aborted) return;
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.notify(errorMessage(error), "error");
		}
		return;
	}
	await executeCommand(rawArgs, ctx, sessionSignal);
}

async function executeCommand(
	rawArgs: string,
	ctx: ExtensionCommandContext,
	signal?: AbortSignal,
	onCommit?: () => void,
	target?: string,
) {
	try {
		const command = await resolveSyncCommand(rawArgs, ctx);
		if (signal?.aborted || !command) return;
		const { subcommand, rest } = command;
		const options = parseOptions(rest);
		if (target !== undefined) options.target = target;
		if (signal) options.signal = signal;
		if (onCommit) options.onCommit = onCommit;
		validateCommandOptions(subcommand, options);

		switch (subcommand) {
			case "help":
				ctx.ui.notify(usage(), "info");
				return;
			case "use":
				await useSyncTarget(ctx, options.args[0] ?? "", (selectedTarget) =>
					withLock("pull", () => pull(ctx, { ...options, target: selectedTarget })),
				);
				return;
			case "init":
				await initConfig(ctx);
				return;
			case "config":
				await showConfig(ctx, options);
				return;
			case "files":
				await showFileSelection(ctx, options.target);
				return;
			case "status":
				await status(ctx, options);
				return;
			case "diff":
				await diff(ctx, options);
				return;
			case "doctor":
				await doctor(ctx, options);
				return;
			case "push":
				await withLock("push", () => push(ctx, options));
				return;
			case "pull":
				return await withLock("pull", () => pull(ctx, options));
			case "sync":
				await withLock("sync", () => syncBoth(ctx, options));
				return;
			case "history":
				await history(ctx, options);
				return;
			case "rollback":
				await withLock("rollback", () => rollback(ctx, options));
				return;
			case "unlock":
				await unlock(ctx, options);
				return;
			default:
				ctx.ui.notify(`Unknown /sync command: ${subcommand}\n\n${usage()}`, "warning");
		}
	} catch (error) {
		if (signal?.aborted) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		if (error instanceof TargetPullRequiresUiError) throw error;
		ctx.ui.notify(errorMessage(error), "error");
	}
}

async function autoSync(ctx: ExtensionContext, signal: AbortSignal) {
	try {
		const partial = await loadPartialConfig();
		throwIfAborted(signal);
		if (!isEnabled(partial.autoSync ?? process.env.PI_SYNC_AUTO_SYNC, true)) return;
		await ensureStateDir();
		throwIfAborted(signal);
		await loadConfig();
		throwIfAborted(signal);
		await withLock("auto-sync", () => {
			throwIfAborted(signal);
			return syncBoth(ctx, { ...AUTO_SYNC_OPTIONS, signal });
		});
	} catch (error) {
		if (signal.aborted || isMissingConfigError(error)) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.notify(`pi-sync auto sync skipped: ${errorMessage(error)}`, "warning");
	}
}

async function autoPushSessions(ctx: ExtensionContext, signal: AbortSignal) {
	try {
		const partial = await loadPartialConfig();
		throwIfAborted(signal);
		if (!isEnabled(partial.autoSync ?? process.env.PI_SYNC_AUTO_SYNC, true)) return;
		if (!isExplicitlyEnabled(partial.syncSessions)) return;
		await ensureStateDir();
		throwIfAborted(signal);
		const config = await loadConfig();
		throwIfAborted(signal);
		if (!config.syncSessions) return;
		await withLock("auto-session-push", async () => {
			throwIfAborted(signal);
			const state = await readStateForConfig(config);
			throwIfAborted(signal);
			const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
			throwIfAborted(signal);
			if (!hasLocalChanges(local, state, config)) return;
			await push(ctx, { ...AUTO_SYNC_OPTIONS, signal }, { config, state, local });
		});
	} catch (error) {
		if (signal.aborted || isMissingConfigError(error)) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.notify(`pi-sync session push skipped: ${errorMessage(error)}`, "warning");
	}
}

async function initConfig(ctx: ExtensionCommandContext) {
	const configPath = localConfigPath();
	if (await readLocalConfigObject()) {
		ctx.ui.notify(`Config already exists: ${await activeLocalConfigPath()}`, "info");
		return;
	}

	if (ctx.mode === "tui") {
		await showSetupWizard(ctx);
		return;
	}
	await writeLocalConfigObject(localConfigTemplate());
	ctx.ui.notify(`Created ${configPath}. Fill in R2 credentials, then run /sync doctor.`, "info");
}

async function showConfig(ctx: ExtensionCommandContext, options: CommandOptions) {
	const partial = await loadPartialConfig(options.target);
	const webdav = partial.storageKind === "webdav";
	const syncSessions = isExplicitlyEnabled(partial.syncSessions);
	const warnings = [
		...(webdav ? [] : deprecatedPiSyncEnvironmentWarnings()),
		...(webdav ? [] : sessionTokenWarnings(partial)),
		...syncSessionsWarnings({ syncSessions }),
	];
	const storageLines = webdav
		? [
				`kind: webdav`,
				`url: ${displayWebDavUrl(partial.url, partial.username)}`,
				`username: ${partial.username ? "configured (value hidden)" : "missing"}`,
				`password: ${partial.password ? "configured" : "missing"}`,
				`path: ${partial.path ?? DEFAULT_PREFIX}`,
				`namespace: ${partial.profile ?? DEFAULT_PROFILE}`,
			]
		: [
				`endpoint: ${partial.endpoint ?? "missing"}`,
				`bucket: ${partial.bucket ?? "missing"}`,
				`region: ${partial.region ?? DEFAULT_REGION}`,
				`accessKeyId: ${partial.accessKeyId ? redact(partial.accessKeyId) : "missing"}`,
				`secretAccessKey: ${partial.secretAccessKey ? "configured" : "missing"}`,
				`sessionToken: ${partial.sessionToken ? "configured" : "not configured"}`,
				`profile: ${partial.profile ?? DEFAULT_PROFILE}`,
				`prefix: ${partial.prefix ?? DEFAULT_PREFIX}`,
			];
	ctx.ui.notify(
		[
			"pi-sync config:",
			`target: ${partial.target ?? "default"}`,
			`storage profile: ${partial.storageProfile ?? "default"}`,
			...storageLines,
			`autoSync: ${isEnabled(webdav ? partial.autoSync : (partial.autoSync ?? process.env.PI_SYNC_AUTO_SYNC), true) ? "enabled" : "disabled"}`,
			`syncFiles: ${normalizeSyncFiles(partial.syncFiles).join(", ") || "none"}`,
			`syncSessions: ${syncSessions ? "enabled" : "disabled"}`,
			`extraFiles: ${normalizeExtraFiles(partial.extraFiles).join(", ") || "none"}`,
			`local config: ${localConfigPath()}`,
			...warnings,
		].join("\n"),
		warnings.length > 0 ? "warning" : "info",
	);
}

function displayWebDavUrl(value: string | undefined, username: string | undefined) {
	if (!value) return "missing";
	try {
		const url = new URL(value);
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		const pathname = username ? url.pathname.split(username).join("[redacted]") : url.pathname;
		return `${url.origin}${pathname}`;
	} catch {
		return "invalid (value hidden)";
	}
}

function throwIfAborted(signal: AbortSignal) {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error
		? signal.reason
		: new DOMException("The operation was aborted", "AbortError");
}

function combineSignals(primary: AbortSignal, secondary?: AbortSignal) {
	return secondary ? AbortSignal.any([primary, secondary]) : primary;
}

function snapshotOptionsForContext(
	ctx: ExtensionCommandContext | ExtensionContext,
	config: AnySyncConfig,
): SnapshotOptions {
	return {
		syncFiles: config.syncFiles,
		syncSessions: config.syncSessions,
		sessionDir: sessionDirFromContext(ctx),
		extraFiles: config.extraFiles,
	};
}

function sessionDirFromContext(ctx: ExtensionCommandContext | ExtensionContext) {
	const manager = ctx.sessionManager as typeof ctx.sessionManager & {
		usesDefaultSessionDir?: () => boolean;
	};
	const usesDefaultSessionDir = manager.usesDefaultSessionDir;
	if (typeof usesDefaultSessionDir === "function" && usesDefaultSessionDir.call(manager)) {
		return undefined;
	}
	const getSessionDir = manager.getSessionDir;
	return typeof getSessionDir === "function"
		? (getSessionDir.call(manager) as string | undefined)
		: undefined;
}

export { completeSyncArguments, parseOptions, splitArgs } from "./command.js";
export {
	isCloudflareR2Endpoint,
	isEnabled,
	isExplicitlyEnabled,
	loadConfig,
	sessionTokenWarnings,
} from "./config.js";
export { encodeKey, posixJoin, safeJoin, safeName } from "./paths.js";
export {
	canonicalSnapshotPathForConfig,
	collectFiles,
	filterSnapshotForConfigPolicy,
	isConfiguredSnapshotPath,
	isDeniedPath,
	isSessionPath,
	mergeRemotePreservedFiles,
	mergeRemoteSessionFiles,
	scanSnapshot,
	sessionSnapshotPathFromAbsolute,
	snapshotWithoutSessions,
} from "./snapshot.js";
export {
	addTopLevelCaseVariantDeletes,
	appliedFileHashMap,
	preflightSnapshotApply,
	protectSnapshotApplyPlan,
} from "./snapshot-apply.js";
export { backupLocal } from "./sync-operations.js";
export {
	canPullRemoteSessionsOnFirstSync,
	canPullRemoteSettingsOnFirstSync,
	hasRemoteChanges,
	sessionHashMap,
	settingsHashesMatchState,
	settingsHashMap,
	settingsHashMapFromState,
} from "./sync-state.js";
