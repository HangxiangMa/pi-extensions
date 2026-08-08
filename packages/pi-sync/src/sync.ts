import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { RunRouteResult } from "./cancellable-operation.js";
import {
	completeSyncArguments,
	parseOptions,
	resolveSyncCommand,
	setSyncSetupCompletions,
	splitArgs,
	usage,
	validateCommandOptions,
} from "./command.js";
import {
	activeLocalConfigPath,
	configuredSyncSetupNames,
	consumeLocalConfigMigrationNotice,
	createLocalConfigDocument,
	ensureStateDir,
	isMissingConfigError,
	loadConfig,
	loadPartialConfig,
	localConfigPath,
	localConfigTemplate,
	readLocalConfigObject,
	readStateForConfig,
	sessionTokenWarnings,
	syncSessionsWarnings,
} from "./config.js";
import { unlock, withLock } from "./lock.js";
import { SetupPullRequiresUiError, useSyncSetup } from "./setup-switch.js";
import { createSnapshot } from "./snapshot.js";
import { recoverSnapshotTransactionsOnStartup } from "./snapshot-transaction.js";
import {
	migrateLegacyStateDirectory,
	stateDirectoryMigrationNotice,
	withStateDirectoryAccess,
} from "./state-directory.js";
import { isSyncDecisionRequiredError } from "./sync-decision.js";
import { errorMessage } from "./sync-format.js";
import { hasLocalChanges } from "./sync-state.js";
import type { AnySyncConfig, CommandOptions, SnapshotOptions } from "./types.js";

const STATUS_KEY = "sync";

type SyncOperations = typeof import("./sync-operations.js");
let syncOperationsPromise: Promise<SyncOperations> | undefined;

function loadSyncOperations(): Promise<SyncOperations> {
	if (!syncOperationsPromise) {
		syncOperationsPromise = import("./sync-operations.js").catch((error) => {
			syncOperationsPromise = undefined;
			throw error;
		});
	}
	return syncOperationsPromise;
}

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
		description: "Sync Pi settings through Git, WebDAV, R2, or S3-compatible storage",
		getArgumentCompletions: completeSyncArguments,
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				throw new Error(
					"/sync requires TUI or RPC mode so results and safety prompts are observable.",
				);
			}
			const run = () => handleCommand(args, ctx, sessionAbort.signal);
			if (splitArgs(args)[0] === "migrate-state") await run();
			else await withStateDirectoryAccess(run);
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
			await withStateDirectoryAccess(() => startSession(ctx, signal));
		} catch (error) {
			if (signal.aborted) return;
			ctx.ui.notify(`pi-sync state access failed: ${errorMessage(error)}`, "error");
		}
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
			if (reason !== "reload") {
				await withStateDirectoryAccess(async () => {
					if (signal.aborted) return;
					await autoPushSessions(ctx, signal);
				});
			}
		} catch (error) {
			if (!signal.aborted) {
				ctx.ui.notify(`pi-sync session push skipped: ${errorMessage(error)}`, "warning");
			}
		} finally {
			if (shutdownAbort === controller) shutdownAbort = undefined;
		}
		if (signal.aborted) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}

async function startSession(ctx: ExtensionContext, signal: AbortSignal) {
	if (signal.aborted) return;
	try {
		const migrationNotice = stateDirectoryMigrationNotice();
		if (migrationNotice) ctx.ui.notify(migrationNotice, "warning");
	} catch (error) {
		ctx.ui.notify(`pi-sync state directory requires attention: ${errorMessage(error)}`, "error");
		return;
	}
	try {
		await recoverSnapshotTransactionsOnStartup();
		if (signal.aborted) return;
	} catch (error) {
		if (signal.aborted) return;
		ctx.ui.notify(`pi-sync recovery required: ${errorMessage(error)}`, "error");
		return;
	}
	try {
		setSyncSetupCompletions(await configuredSyncSetupNames());
		if (signal.aborted) return;
	} catch {
		if (signal.aborted) return;
		setSyncSetupCompletions([]);
	}
	const migrationNotice = consumeLocalConfigMigrationNotice();
	if (migrationNotice) ctx.ui.notify(migrationNotice, "warning");
	if (signal.aborted) return;
	await autoSync(ctx, signal);
}

async function handleCommand(
	rawArgs: string,
	ctx: ExtensionCommandContext,
	sessionSignal: AbortSignal,
) {
	if (!rawArgs.trim()) {
		try {
			const { showSyncManager } = await import("./manager-ui.js");
			if (sessionSignal.aborted) return;
			await showSyncManager(
				ctx,
				(route, signal, onCommit, target) =>
					executeCommand(route, ctx, combineSignals(sessionSignal, signal), onCommit, target),
				sessionSignal,
			);
		} catch (error) {
			if (sessionSignal.aborted) return;
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.notify(errorMessage(error), "error");
		}
		return;
	}
	const result = await executeCommand(rawArgs, ctx, sessionSignal);
	if (result.kind === "decision-required") {
		ctx.ui.notify(result.decision.directMessage, "error");
	}
}

async function executeCommand(
	rawArgs: string,
	ctx: ExtensionCommandContext,
	signal?: AbortSignal,
	onCommit?: () => void,
	setup?: string,
): Promise<RunRouteResult> {
	try {
		const command = await resolveSyncCommand(rawArgs, ctx);
		if (signal?.aborted || !command) return { kind: "completed" };
		const { subcommand, rest } = command;
		const options = parseOptions(rest);
		if (setup !== undefined) options.setup = setup;
		if (signal) options.signal = signal;
		if (onCommit) options.onCommit = onCommit;
		validateCommandOptions(subcommand, options);

		switch (subcommand) {
			case "help":
				ctx.ui.notify(usage(), "info");
				return { kind: "completed" };
			case "use":
				await useSyncSetup(
					ctx,
					options.args[0] ?? "",
					async (selectedSetup) => {
						const operations = await loadSyncOperations();
						throwIfAborted(options.signal);
						return withLock("pull", () =>
							operations.pull(ctx, { ...options, setup: selectedSetup }),
						);
					},
					undefined,
					options.signal,
				);
				return { kind: "completed" };
			case "init":
				await initConfig(ctx, signal);
				return { kind: "completed" };
			case "config":
				await showConfig(ctx, options);
				return { kind: "completed" };
			case "files":
				await (await import("./file-selection.js")).showFileSelection(
					ctx,
					options.setup,
					options.signal,
				);
				return { kind: "completed" };
			case "status":
				await (await loadSyncOperations()).status(ctx, options);
				return { kind: "completed" };
			case "diff":
				await (await loadSyncOperations()).diff(ctx, options);
				return { kind: "completed" };
			case "doctor":
				await (await loadSyncOperations()).doctor(ctx, options);
				return { kind: "completed" };
			case "push": {
				const operations = await loadSyncOperations();
				throwIfAborted(options.signal);
				const outcome = await withLock("push", () => operations.push(ctx, options));
				return { kind: "completed", ...(outcome ? { outcome } : {}) };
			}
			case "pull": {
				const operations = await loadSyncOperations();
				throwIfAborted(options.signal);
				const outcome = await withLock("pull", () => operations.pull(ctx, options));
				return { kind: "completed", ...(outcome ? { outcome } : {}) };
			}
			case "sync": {
				const operations = await loadSyncOperations();
				throwIfAborted(options.signal);
				await withLock("sync", () => operations.syncBoth(ctx, options));
				return { kind: "completed" };
			}
			case "history":
				await (await loadSyncOperations()).history(ctx, options);
				return { kind: "completed" };
			case "rollback": {
				const operations = await loadSyncOperations();
				throwIfAborted(options.signal);
				await withLock("rollback", () => operations.rollback(ctx, options));
				return { kind: "completed" };
			}
			case "migrate-state":
				await migrateStateDirectory(ctx, options);
				return { kind: "completed" };
			case "unlock":
				await unlock(ctx, options);
				return { kind: "completed" };
			default:
				ctx.ui.notify(`Unknown /sync command: ${subcommand}\n\n${usage()}`, "warning");
				return { kind: "failed" };
		}
	} catch (error) {
		if (signal?.aborted) return { kind: "failed" };
		ctx.ui.setStatus(STATUS_KEY, undefined);
		if (error instanceof SetupPullRequiresUiError) throw error;
		if (isSyncDecisionRequiredError(error)) {
			return { kind: "decision-required", decision: error.decision };
		}
		ctx.ui.notify(errorMessage(error), "error");
		return { kind: "failed" };
	}
}

async function migrateStateDirectory(ctx: ExtensionCommandContext, options: CommandOptions) {
	const notice = stateDirectoryMigrationNotice();
	if (!notice) {
		ctx.ui.notify("pi-sync already uses the canonical pi-sync/ state directory.", "info");
		return;
	}
	if (
		!options.yes &&
		!(await ctx.ui.confirm(
			"Migrate pi-sync state directory",
			"Confirm that every other Pi process is closed. pi-sync will atomically rename .pisync/ to pi-sync/ without merging or deleting either root.",
			{ signal: options.signal },
		))
	) {
		ctx.ui.notify("pi-sync state migration cancelled.", "info");
		return;
	}
	throwIfAborted(options.signal);
	const result = await migrateLegacyStateDirectory();
	throwIfAborted(options.signal);
	if (result.status === "ready") {
		ctx.ui.notify("pi-sync already uses the canonical pi-sync/ state directory.", "info");
		return;
	}
	ctx.ui.notify(result.message, result.status === "migrated" ? "info" : "warning");
}

async function autoSync(ctx: ExtensionContext, signal: AbortSignal) {
	try {
		const partial = await loadPartialConfig();
		throwIfAborted(signal);
		if (!partial.automatic) return;
		await ensureStateDir();
		throwIfAborted(signal);
		await loadConfig();
		throwIfAborted(signal);
		const operations = await loadSyncOperations();
		throwIfAborted(signal);
		await withLock("auto-sync", () => {
			throwIfAborted(signal);
			return operations.syncBoth(ctx, { ...AUTO_SYNC_OPTIONS, signal });
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
		if (!partial.automatic) return;
		if (!partial.include.includes("sessions")) return;
		await ensureStateDir();
		throwIfAborted(signal);
		const config = await loadConfig();
		throwIfAborted(signal);
		if (!config.include.includes("sessions")) return;
		const operations = await loadSyncOperations();
		throwIfAborted(signal);
		await withLock("auto-session-push", async () => {
			throwIfAborted(signal);
			const state = await readStateForConfig(config);
			throwIfAborted(signal);
			const local = await createSnapshot(
				config.snapshotIdentity,
				snapshotOptionsForContext(ctx, config),
			);
			throwIfAborted(signal);
			if (!hasLocalChanges(local, state, config)) return;
			await operations.push(ctx, { ...AUTO_SYNC_OPTIONS, signal }, { config, state, local });
		});
	} catch (error) {
		if (signal.aborted || isMissingConfigError(error)) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.notify(`pi-sync session push skipped: ${errorMessage(error)}`, "warning");
	}
}

async function initConfig(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	const configPath = localConfigPath();
	if (await readLocalConfigObject()) {
		ctx.ui.notify(`Config already exists: ${await activeLocalConfigPath()}`, "info");
		return;
	}

	if (ctx.mode === "tui") {
		const { showSetupWizard } = await import("./manager-ui.js");
		throwIfAborted(signal);
		await showSetupWizard(ctx, signal);
		return;
	}
	await createLocalConfigDocument(localConfigTemplate());
	ctx.ui.notify(
		`Created ${configPath}. Add a storage connection and sync setup before syncing.`,
		"info",
	);
}

async function showConfig(ctx: ExtensionCommandContext, options: CommandOptions) {
	const config = await loadConfig(options.setup);
	const warnings = [
		...(config.backend.type === "s3" ? sessionTokenWarnings(config.backend.profile) : []),
		...syncSessionsWarnings(config),
	];
	const storageLines = configStorageLines(config);
	ctx.ui.notify(
		[
			"pi-sync config:",
			`sync setup: ${config.setupName}`,
			`storage connection: ${config.connectionName}`,
			...storageLines,
			`storage path: ${config.storagePath}`,
			`automatic sync: ${config.automatic ? "enabled" : "disabled"}`,
			`included content: ${config.include.join(", ") || "none"}`,
			`sessions: ${config.include.includes("sessions") ? "included" : "not included"}`,
			`settings file: ${localConfigPath()}`,
			...warnings,
		].join("\n"),
		warnings.length > 0 ? "warning" : "info",
	);
}

function configStorageLines(config: AnySyncConfig) {
	switch (config.backend.type) {
		case "git":
			return [
				"kind: git",
				`remote: ${displayGitRemote(config.backend.profile.remote)}`,
				"authentication: existing Git/SSH credentials (not stored)",
				`branch: ${config.backend.destination.branch}`,
			];
		case "webdav":
			return [
				"kind: webdav",
				`url: ${displayWebDavUrl(config.backend.profile.url, config.backend.profile.username)}`,
				"username: configured (value hidden)",
				"password: configured",
			];
		case "s3":
			return [
				"kind: s3",
				`endpoint: ${config.backend.profile.endpoint}`,
				`bucket: ${config.backend.destination.bucket}`,
				`region: ${config.backend.profile.region}`,
				"access key id: configured",
				"secret access key: configured",
				`session token: ${config.backend.profile.sessionToken ? "configured" : "not configured"}`,
			];
	}
}

function displayGitRemote(value: string | undefined) {
	if (!value) return "missing";
	try {
		const url = new URL(value);
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		return url.toString();
	} catch {
		return value.replace(/^(?:[^@\s]+@)?(?<host>[^:]+):.+$/u, "$<host>:…");
	}
}

function displayWebDavUrl(value: string | undefined, username: string | undefined) {
	if (!value) return "missing";
	try {
		const url = new URL(value);
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		return username ? `${url.origin}/…` : `${url.origin}${url.pathname}`;
	} catch {
		return "invalid (value hidden)";
	}
}

function throwIfAborted(signal?: AbortSignal) {
	if (!signal?.aborted) return;
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
		include: config.include,
		sessionDir: sessionDirFromContext(ctx),
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
export {
	canPullRemoteSessionsOnFirstSync,
	canPullRemoteSettingsOnFirstSync,
	hasRemoteChanges,
	sessionHashMap,
	settingsHashesMatchState,
	settingsHashMap,
	settingsHashMapFromState,
} from "./sync-state.js";
