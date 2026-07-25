import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
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
	configuredTargetNames,
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
	readStateForConfig,
	sessionDirForApply,
	sessionTokenWarnings,
	stateDir,
	syncSessionsWarnings,
	writeLocalConfigObject,
	writeStateForConfig,
} from "./config.js";
import { showFileSelection } from "./file-selection.js";
import { inspectLock, isLockGuardHeld, isStaleLock, unlock, withLock } from "./lock.js";
import { showSetupWizard, showSyncManager } from "./manager-ui.js";
import {
	historyKey,
	latestKey,
	pointerFor,
	profilePrefix,
	S3Client,
	snapshotKey,
} from "./s3-client.js";
import {
	createSnapshot,
	filterSnapshotForConfigPolicy,
	mergeRemotePreservedFiles,
	scanSnapshot,
	sessionSnapshotPathFromAbsolute,
	snapshotIncludesSessions,
	snapshotWithoutSessions,
} from "./snapshot.js";
import { applySnapshot } from "./snapshot-apply.js";
import { recoverSnapshotTransactionsOnStartup } from "./snapshot-transaction.js";
import {
	countPreservedRemoteFiles,
	errorMessage,
	formatDestination,
	formatDiff,
	formatPullSummary,
	formatPushSummary,
	formatRollbackSummary,
	formatSnapshotOnlyDiff,
	redact,
	remoteIdentity,
	safeTerminalText,
	sha256,
} from "./sync-format.js";
import {
	canPullRemoteSessionsOnFirstSync,
	canPullRemoteSettingsOnFirstSync,
	fileHashMap,
	hasLocalChanges,
	hasRemoteChanges,
	remoteChangedSinceState,
	sameHashes,
	shouldRefreshSyncedState,
	snapshotHashesMatchState,
	snapshotsMatch,
	syncPolicyChanged,
} from "./sync-state.js";
import { TargetPullRequiresUiError, useSyncTarget } from "./target-switch.js";
import type {
	CommandOptions,
	LatestPointer,
	RemoteObject,
	Snapshot,
	SnapshotOptions,
	SyncConfig,
	SyncState,
} from "./types.js";

const [gzipAsync, gunzipAsync] = [promisify(gzip), promisify(gunzip)];
const STATUS_KEY = "sync";
const VERSION = 1;
const DEFAULT_PROFILE = "default";
const DEFAULT_PREFIX = "pi-sync";
const DEFAULT_REGION = "auto";

interface PushInput {
	config: SyncConfig;
	state: SyncState;
	local: Snapshot;
	client?: S3Client;
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
	pi.registerCommand("sync", {
		description: "Sync Pi settings through Cloudflare R2 or S3-compatible storage",
		getArgumentCompletions: completeSyncArguments,
		handler: async (args, ctx) => {
			await handleCommand(args, ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		try {
			await recoverSnapshotTransactionsOnStartup();
		} catch (error) {
			ctx.ui.notify(`pi-sync recovery required: ${errorMessage(error)}`, "error");
			return;
		}
		try {
			setSyncTargetCompletions(await configuredTargetNames());
		} catch {
			setSyncTargetCompletions([]);
		}
		const warnings = deprecatedPiSyncEnvironmentWarnings();
		if (warnings.length > 0) ctx.ui.notify(warnings.join("\n"), "warning");
		await autoSync(ctx);
	});

	pi.on("session_shutdown", async (event, ctx) => {
		const reason =
			typeof event === "object" && event ? (event as { reason?: string }).reason : undefined;
		if (reason !== "reload") await autoPushSessions(ctx);
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}

async function handleCommand(rawArgs: string, ctx: ExtensionCommandContext) {
	if (!rawArgs.trim()) {
		try {
			await showSyncManager(ctx, (route, signal, onCommit, target) =>
				executeCommand(route, ctx, signal, onCommit, target),
			);
		} catch (error) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.notify(errorMessage(error), "error");
		}
		return;
	}
	await executeCommand(rawArgs, ctx);
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
		if (!command) return;
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
		ctx.ui.setStatus(STATUS_KEY, undefined);
		if (signal?.aborted && error instanceof Error && error.name === "AbortError") return;
		if (error instanceof TargetPullRequiresUiError) throw error;
		ctx.ui.notify(errorMessage(error), "error");
	}
}

async function autoSync(ctx: ExtensionContext) {
	try {
		const partial = await loadPartialConfig();
		if (!isEnabled(partial.autoSync ?? process.env.PI_SYNC_AUTO_SYNC, true)) return;
		await ensureStateDir();
		await loadConfig();
		await withLock("auto-sync", () => syncBoth(ctx, AUTO_SYNC_OPTIONS));
	} catch (error) {
		if (isMissingConfigError(error)) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.notify(`pi-sync auto sync skipped: ${errorMessage(error)}`, "warning");
	}
}

async function autoPushSessions(ctx: ExtensionContext) {
	try {
		const partial = await loadPartialConfig();
		if (!isEnabled(partial.autoSync ?? process.env.PI_SYNC_AUTO_SYNC, true)) return;
		if (!isExplicitlyEnabled(partial.syncSessions)) return;
		await ensureStateDir();
		const config = await loadConfig();
		if (!config.syncSessions) return;
		await withLock("auto-session-push", async () => {
			const state = await readStateForConfig(config);
			const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
			if (!hasLocalChanges(local, state, config)) return;
			await push(ctx, AUTO_SYNC_OPTIONS, { config, state, local });
		});
	} catch (error) {
		if (isMissingConfigError(error)) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.notify(`pi-sync session push skipped: ${errorMessage(error)}`, "warning");
	}
}

async function initConfig(ctx: ExtensionCommandContext) {
	const configPath = localConfigPath();
	try {
		await fs.access(configPath, fsConstants.F_OK);
		ctx.ui.notify(`Config already exists: ${configPath}`, "info");
		return;
	} catch {
		// Create or guide setup below.
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
	const syncSessions = isExplicitlyEnabled(partial.syncSessions);
	const warnings = [
		...deprecatedPiSyncEnvironmentWarnings(),
		...sessionTokenWarnings(partial),
		...syncSessionsWarnings({ syncSessions }),
	];
	ctx.ui.notify(
		[
			"pi-sync config:",
			`target: ${partial.target ?? "default"}`,
			`storage profile: ${partial.storageProfile ?? "default"}`,
			`endpoint: ${partial.endpoint ?? "missing"}`,
			`bucket: ${partial.bucket ?? "missing"}`,
			`region: ${partial.region ?? DEFAULT_REGION}`,
			`accessKeyId: ${partial.accessKeyId ? redact(partial.accessKeyId) : "missing"}`,
			`secretAccessKey: ${partial.secretAccessKey ? "configured" : "missing"}`,
			`sessionToken: ${partial.sessionToken ? "configured" : "not configured"}`,
			`profile: ${partial.profile ?? DEFAULT_PROFILE}`,
			`prefix: ${partial.prefix ?? DEFAULT_PREFIX}`,
			`autoSync: ${isEnabled(partial.autoSync ?? process.env.PI_SYNC_AUTO_SYNC, true) ? "enabled" : "disabled"}`,
			`syncFiles: ${normalizeSyncFiles(partial.syncFiles).join(", ") || "none"}`,
			`syncSessions: ${syncSessions ? "enabled" : "disabled"}`,
			`extraFiles: ${normalizeExtraFiles(partial.extraFiles).join(", ") || "none"}`,
			`local config: ${localConfigPath()}`,
			...warnings,
		].join("\n"),
		warnings.length > 0 ? "warning" : "info",
	);
}

async function status(ctx: ExtensionCommandContext, options: CommandOptions) {
	const config = await loadConfig(options.target);
	ctx.ui.setStatus(STATUS_KEY, `checking ${config.target ?? "default"}`);
	const client = new S3Client(config, options.signal);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
	const state = await readStateForConfig(config);
	const latest = await client.getJson<LatestPointer>(latestKey(config));
	const localChanged = hasLocalChanges(local, state, config);

	let remoteText = "remote: empty";
	const remoteChanged = remoteChangedSinceState(latest, state, config);
	if (!latest.missing && latest.value) {
		remoteText = `remote: ${latest.value.snapshot} from ${latest.value.machine} at ${latest.value.createdAt}`;
	}

	const warnings = [...deprecatedPiSyncEnvironmentWarnings(), ...syncSessionsWarnings(config)];
	ctx.ui.setStatus(STATUS_KEY, undefined);
	ctx.ui.notify(
		[
			`target: ${config.target ?? "default"}`,
			`storage profile: ${config.storageProfile ?? "default"}`,
			`destination: ${formatDestination(config)}`,
			`remote namespace: ${config.profile}`,
			`sync files: ${normalizeSyncFiles(config.syncFiles).join(", ") || "none"}`,
			`extra files: ${config.extraFiles.join(", ") || "none"}`,
			`sessions: ${config.syncSessions ? "included" : "excluded"}`,
			remoteText,
			`local files: ${local.files.length}`,
			`local changed since last sync: ${localChanged ? "yes" : "no"}`,
			`remote changed since last sync: ${remoteChanged ? "yes" : "no"}`,
			...warnings,
		].join("\n"),
		localChanged || remoteChanged || warnings.length > 0 ? "warning" : "info",
	);
}

async function diff(ctx: ExtensionCommandContext, options: CommandOptions) {
	const config = await loadConfig(options.target);
	ctx.ui.setStatus(STATUS_KEY, `checking ${config.target ?? "default"}`);
	const client = new S3Client(config, options.signal);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
	const remote = await readRemoteSnapshot(client, config);
	ctx.ui.setStatus(STATUS_KEY, undefined);

	const warnings = [...deprecatedPiSyncEnvironmentWarnings(), ...syncSessionsWarnings(config)];
	const header = [
		`target: ${config.target ?? "default"}`,
		`storage profile: ${config.storageProfile ?? "default"}`,
		`destination: ${formatDestination(config)}`,
		`sync files: ${normalizeSyncFiles(config.syncFiles).join(", ") || "none"}`,
		`extra files: ${config.extraFiles.join(", ") || "none"}`,
		`sessions: ${config.syncSessions ? "included" : "excluded"}`,
		...warnings,
	].join("\n");
	const level = warnings.length > 0 ? "warning" : "info";
	if (!remote) {
		ctx.ui.notify(
			`${header}\n\n${formatSnapshotOnlyDiff("Remote is empty. Local push would upload", local)}`,
			level,
		);
		return;
	}

	ctx.ui.notify(`${header}\n\n${formatDiff(local, remote)}`, level);
}

async function doctor(ctx: ExtensionCommandContext, options: CommandOptions) {
	const messages: string[] = [];
	let level: "info" | "warning" = "info";
	let snapshotOptions: SnapshotOptions = {};
	let profile = DEFAULT_PROFILE;

	try {
		const config = await loadConfig(options.target);
		profile = config.profile;
		snapshotOptions = snapshotOptionsForContext(ctx, config);
		messages.push(
			`config: ok (target ${config.target ?? "default"}; ${config.bucket}/${profilePrefix(config)})`,
		);
		messages.push(`sync files: ${normalizeSyncFiles(config.syncFiles).join(", ") || "none"}`);
		messages.push(`extra files: ${config.extraFiles.join(", ") || "none"}`);
		messages.push(`sessions: ${config.syncSessions ? "included" : "excluded"}`);
		const warnings = [
			...deprecatedPiSyncEnvironmentWarnings(),
			...sessionTokenWarnings(config),
			...syncSessionsWarnings(config),
		];
		if (warnings.length > 0) {
			level = "warning";
			messages.push(...warnings);
		}
	} catch (error) {
		level = "warning";
		messages.push(`config: ${errorMessage(error)}`);
	}

	const local = await createSnapshot(profile, snapshotOptions);
	const secrets = scanSnapshot(local);
	if (secrets.length > 0) {
		level = "warning";
		messages.push("secret scan: possible secrets found:");
		messages.push(...secrets.map((secret) => `- ${secret}`));
	} else {
		messages.push(`secret scan: ok (${local.files.length} files checked)`);
	}

	const lock = await inspectLock();
	if (lock.status === "valid" && isStaleLock(lock.lock)) {
		level = "warning";
		messages.push(
			`lock: stale (pid ${lock.lock.pid}); run /sync unlock after verifying no sync is running`,
		);
	} else if (lock.status === "valid") {
		messages.push(`lock: held by pid ${lock.lock.pid} since ${lock.lock.startedAt}`);
	} else if (lock.status === "unreadable") {
		level = "warning";
		messages.push(
			"lock: unreadable; use /sync unlock --stale only after verifying no sync is running",
		);
	} else if (await isLockGuardHeld()) {
		level = "warning";
		messages.push("lock: guard active while metadata is missing or still being initialized");
	} else {
		messages.push("lock: free");
	}
	ctx.ui.notify(messages.join("\n"), level);
}

async function push(
	ctx: ExtensionCommandContext | ExtensionContext,
	options: CommandOptions,
	input?: PushInput,
) {
	const config = input?.config ?? (await loadConfig(options.target));
	ctx.ui.setStatus(STATUS_KEY, `pushing ${config.target ?? "default"}`);
	const client = input?.client ?? new S3Client(config, options.signal);
	const state = input?.state ?? (await readStateForConfig(config));
	const local =
		input?.local ?? (await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config)));

	const latest = await client.getJson<LatestPointer>(latestKey(config));
	const remoteForUpload = await readRemoteSnapshotForUpload(client, config, latest, state);
	if (remoteChangedSinceState(latest, state, config) && !options.force) {
		const remoteForConflict = remoteForUpload
			? filterSnapshotForConfigPolicy(remoteForUpload, config)
			: undefined;
		if (!remoteForConflict || !snapshotHashesMatchState(remoteForConflict, state, config)) {
			throw new Error(
				"Remote or sync policy changed since last sync. Run /sync pull first or /sync push --force.",
			);
		}
	}

	const upload = await snapshotForUpload(client, config, local, latest, remoteForUpload);
	const secrets = scanSnapshot(local);
	if (secrets.length > 0) {
		throw new Error(
			`Refusing to push possible secrets:\n${secrets.map((s) => `- ${s}`).join("\n")}`,
		);
	}

	const preservedRemoteFileCount = countPreservedRemoteFiles(local, upload);
	if (
		!options.yes &&
		!(await ctx.ui.confirm(
			snapshotIncludesSessions(upload) ? "Push pi settings and sessions?" : "Push pi settings?",
			formatPushSummary(config, upload, latest, preservedRemoteFileCount, remoteForUpload),
		))
	) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.notify("Push cancelled.", "info");
		return;
	}

	options.onCommit?.();
	const publicationClient = options.onCommit ? new S3Client(config) : client;
	const pointer = await uploadSnapshot(publicationClient, config, upload, latest, options.force);
	const historyWarning = await updateHistorySafely(publicationClient, config, pointer);
	await writeStateForConfig(config, {
		version: VERSION,
		profile: config.profile,
		lastAppliedSnapshot: pointer.snapshot,
		lastRemoteEtag: undefined,
		lastFileHashes: fileHashMap(local),
		syncFiles: config.syncFiles,
		syncSessions: config.syncSessions,
		extraFiles: config.extraFiles,
	});
	ctx.ui.setStatus(STATUS_KEY, undefined);
	if (!options.silent) {
		ctx.ui.notify(
			[
				`Pushed ${upload.files.length} files from target “${config.target ?? "default"}” as ${pointer.snapshot}.`,
				historyWarning,
			]
				.filter(Boolean)
				.join("\n"),
			historyWarning ? "warning" : "info",
		);
	}
}

async function pull(ctx: ExtensionCommandContext | ExtensionContext, options: CommandOptions) {
	const config = await loadConfig(options.target);
	ctx.ui.setStatus(STATUS_KEY, `pulling ${config.target ?? "default"}`);
	const client = new S3Client(config, options.signal);
	const state = await readStateForConfig(config);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
	const remote = await readRemoteSnapshot(client, config);
	if (!remote) throw new Error("Remote is empty. Run /sync push from a configured machine first.");

	const localChanged = hasLocalChanges(local, state, config);
	const remoteChanged = hasRemoteChanges(remote, state, config, protectedSessionPaths(ctx));
	if (localChanged && remoteChanged && state.lastAppliedSnapshot && !options.force) {
		throw new Error(
			"Both local and remote changed since last sync. Run /sync diff, then choose /sync pull --force or /sync push --force.",
		);
	}

	if (
		!options.yes &&
		!(await ctx.ui.confirm(
			snapshotIncludesSessions(remote) ? "Pull pi settings and sessions?" : "Pull pi settings?",
			formatPullSummary(config, local, remote, protectedSessionPaths(ctx).size),
		))
	) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.notify("Pull cancelled.", "info");
		return "cancelled" as const;
	}

	options.onCommit?.();
	const backup = await backupLocal(config.profile, snapshotOptionsForContext(ctx, config));
	const applySessionDir = await sessionDirForApply(ctx, remote);
	const lastFileHashes = await applySnapshot(remote, protectedSessionPaths(ctx), {
		syncFiles: config.syncFiles,
		sessionDir: applySessionDir,
		extraFiles: config.extraFiles,
	});
	await writeStateForConfig(config, {
		version: VERSION,
		profile: config.profile,
		lastAppliedSnapshot: remote.id,
		lastRemoteEtag: undefined,
		lastFileHashes,
		syncFiles: config.syncFiles,
		syncSessions: config.syncSessions,
		extraFiles: config.extraFiles,
	});
	ctx.ui.setStatus(STATUS_KEY, undefined);
	if (!options.silent) {
		ctx.ui.notify(
			`Pulled ${remote.files.length} files from ${remote.id}. Backup: ${backup}`,
			"info",
		);
	} else if (options.auto && config.syncSessions && snapshotIncludesSessions(remote)) {
		ctx.ui.notify(
			"Pulled Pi sessions after startup selected the current session. Restart Pi or resume a pulled session to use newly synced conversations.",
			"warning",
		);
	}
	if (options.reload) await maybeReload(ctx);
	return "applied" as const;
}

async function syncBoth(ctx: ExtensionCommandContext | ExtensionContext, options: CommandOptions) {
	const config = await loadConfig(options.target);
	const client = new S3Client(config, options.signal);
	const state = await readStateForConfig(config);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
	if (
		normalizeSyncFiles(config.syncFiles).length === 0 &&
		config.extraFiles.length === 0 &&
		!config.syncSessions
	) {
		if (!options.silent) {
			ctx.ui.notify(
				`Target “${config.target ?? "default"}” manages no files. Choose synced content in /sync Settings before syncing.`,
				"warning",
			);
		}
		return;
	}
	const remote = await readRemoteSnapshot(client, config);
	const localChanged = hasLocalChanges(local, state, config);
	const remoteChanged = remote
		? hasRemoteChanges(remote, state, config, protectedSessionPaths(ctx))
		: false;
	const firstSync = !state.lastAppliedSnapshot;

	if (firstSync && remote && remote.files.length > 0 && local.files.length > 0) {
		if (!canPullRemoteSettingsOnFirstSync(local, remote)) {
			throw new Error(
				"Remote settings exist and this machine has different local Pi settings. Run /sync diff, then manually choose /sync pull or /sync push.",
			);
		}
		if (!sameHashes(fileHashMap(local), fileHashMap(remote))) {
			if (!canPullRemoteSessionsOnFirstSync(local, remote)) {
				throw new Error(
					"Remote settings match, but local and remote Pi sessions differ. Run /sync diff, then manually choose /sync pull or /sync push.",
				);
			}
			await pull(ctx, options);
			return;
		}
		await writeStateForConfig(config, {
			version: VERSION,
			profile: config.profile,
			lastAppliedSnapshot: remote.id,
			lastRemoteEtag: undefined,
			lastFileHashes: fileHashMap(remote),
			syncFiles: config.syncFiles,
			syncSessions: config.syncSessions,
			extraFiles: config.extraFiles,
		});
		if (!options.silent)
			ctx.ui.notify("pi-sync state initialized; local settings already match remote.", "info");
		return;
	}
	if (localChanged && remoteChanged && remote && snapshotsMatch(local, remote)) {
		await writeStateForConfig(config, {
			version: VERSION,
			profile: config.profile,
			lastAppliedSnapshot: remote.id,
			lastRemoteEtag: undefined,
			lastFileHashes: fileHashMap(remote),
			syncFiles: config.syncFiles,
			syncSessions: config.syncSessions,
			extraFiles: config.extraFiles,
		});
		if (!options.silent) ctx.ui.notify("pi-sync is already up to date.", "info");
		return;
	}
	if (localChanged && remoteChanged && state.lastAppliedSnapshot) {
		throw new Error(
			"Both local and remote changed. Run /sync diff and resolve with push --force or pull --force.",
		);
	}
	if (remoteChanged) {
		await pull(ctx, options);
		return;
	}
	if (localChanged || !remote) {
		await push(ctx, options);
		return;
	}
	if (shouldRefreshSyncedState(remote, state, config)) {
		await writeStateForConfig(config, {
			version: VERSION,
			profile: config.profile,
			lastAppliedSnapshot: remote.id,
			lastRemoteEtag: undefined,
			lastFileHashes: fileHashMap(remote),
			syncFiles: config.syncFiles,
			syncSessions: config.syncSessions,
			extraFiles: config.extraFiles,
		});
	}
	if (!options.silent) ctx.ui.notify("pi-sync is already up to date.", "info");
}

async function history(ctx: ExtensionCommandContext, options: CommandOptions) {
	const config = await loadConfig(options.target);
	const client = new S3Client(config, options.signal);
	const remote = await client.getJson<{ snapshots?: LatestPointer[] }>(historyKey(config));
	if (remote.missing || !remote.value?.snapshots?.length) {
		ctx.ui.notify("No remote pi-sync history found.", "info");
		return;
	}

	const snapshots = remote.value.snapshots.slice(-20).reverse();
	const currentSnapshot = snapshots[0]?.snapshot;
	if (ctx.mode === "tui") {
		const labels = snapshots.map(
			(item, index) =>
				`${index + 1}. ${item.createdAt} · ${safeTerminalText(item.machine)} · ${item.snapshot}${item.snapshot === currentSnapshot ? " (current)" : ""}${item.syncSessions ? " · sessions" : ""}`,
		);
		const selected = await ctx.ui.select(
			`History for target “${safeTerminalText(config.target ?? "default")}”\n\nChoose a snapshot to preview rollback.`,
			[...labels, "Back"],
		);
		if (!selected || selected === "Back") return;
		const index = labels.indexOf(selected);
		const snapshot = snapshots[index];
		if (!snapshot) return;
		await withLock("rollback", () =>
			rollback(ctx, { ...options, args: [snapshot.snapshot], yes: false }),
		);
		return;
	}
	ctx.ui.notify(
		snapshots
			.map((item) => `${item.snapshot} ${item.createdAt} ${safeTerminalText(item.machine)}`)
			.join("\n"),
		"info",
	);
}

async function rollback(ctx: ExtensionCommandContext, options: CommandOptions) {
	const target = options.args[0];
	if (!target) throw new Error("Usage: /sync rollback <snapshot-id> [--yes]");

	const config = await loadConfig(options.target);
	const client = new S3Client(config, options.signal);
	const snapshot = await client.getBuffer(snapshotKey(config, target));
	if (!snapshot.value) throw new Error(`Snapshot not found: ${target}`);
	const decoded = await decodeSnapshot(snapshot.value);
	const remote = filterSnapshotForConfigPolicy(
		config.syncSessions ? decoded : snapshotWithoutSessions(decoded),
		config,
		{ regenerateId: true },
	);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));

	if (
		!options.yes &&
		!(await ctx.ui.confirm(
			snapshotIncludesSessions(remote)
				? "Rollback pi settings and sessions?"
				: "Rollback pi settings?",
			formatRollbackSummary(config, local, remote, target, protectedSessionPaths(ctx).size),
		))
	) {
		ctx.ui.notify("Rollback cancelled.", "info");
		return;
	}

	options.onCommit?.();
	const backup = await backupLocal(config.profile, snapshotOptionsForContext(ctx, config));
	const applySessionDir = await sessionDirForApply(ctx, remote);
	const lastFileHashes = await applySnapshot(remote, protectedSessionPaths(ctx), {
		syncFiles: config.syncFiles,
		sessionDir: applySessionDir,
		extraFiles: config.extraFiles,
	});
	const publicationClient = options.onCommit ? new S3Client(config) : client;
	const latest = await publicationClient.getJson<LatestPointer>(latestKey(config));
	const upload = await snapshotForUpload(publicationClient, config, remote, latest, undefined, {
		ignoreUnreadableRemote: true,
	});
	const encoded = upload.id === decoded.id ? snapshot.value : await encodeSnapshot(upload);
	if (upload.id !== decoded.id) {
		await publicationClient.putBuffer(snapshotKey(config, upload.id), encoded, "application/gzip");
	}
	const pointer = pointerFor(config, upload, sha256(encoded));
	await publicationClient.putJson(latestKey(config), pointer);
	const historyWarning = await updateHistorySafely(publicationClient, config, pointer);
	await writeStateForConfig(config, {
		version: VERSION,
		profile: config.profile,
		lastAppliedSnapshot: pointer.snapshot,
		lastRemoteEtag: undefined,
		lastFileHashes,
		syncFiles: config.syncFiles,
		syncSessions: config.syncSessions,
		extraFiles: config.extraFiles,
	});
	ctx.ui.notify(
		[
			`Rolled back target “${config.target ?? "default"}” to ${target}; latest: ${pointer.snapshot}. Backup: ${backup}`,
			historyWarning,
		]
			.filter(Boolean)
			.join("\n"),
		historyWarning ? "warning" : "info",
	);
	await maybeReload(ctx);
}

function protectedSessionPaths(ctx: ExtensionCommandContext | ExtensionContext) {
	const getSessionFile = ctx.sessionManager.getSessionFile;
	if (typeof getSessionFile !== "function") return new Set<string>();
	const sessionFile = getSessionFile.call(ctx.sessionManager) as string | undefined;
	const snapshotPath = sessionFile
		? sessionSnapshotPathFromAbsolute(sessionFile, sessionDirFromContext(ctx))
		: undefined;
	return snapshotPath ? new Set([snapshotPath]) : new Set<string>();
}

function snapshotOptionsForContext(
	ctx: ExtensionCommandContext | ExtensionContext,
	config: SyncConfig,
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

async function maybeReload(ctx: ExtensionCommandContext | ExtensionContext) {
	if (!("reload" in ctx)) return;
	if (
		ctx.hasUI &&
		(await ctx.ui.confirm(
			"Reload Pi resources now?",
			"This reloads extensions, skills, prompts, themes, and context files.",
		))
	) {
		await ctx.reload();
	}
}

async function readRemoteSnapshotForUpload(
	client: S3Client,
	config: SyncConfig,
	latest: RemoteObject<LatestPointer>,
	state: SyncState,
) {
	if (
		latest.missing ||
		!latest.value ||
		(latest.value.snapshot === state.lastAppliedSnapshot && !syncPolicyChanged(state, config))
	) {
		return undefined;
	}
	return readRemoteSnapshotRaw(client, config);
}

async function snapshotForUpload(
	client: S3Client,
	config: SyncConfig,
	local: Snapshot,
	latest: RemoteObject<LatestPointer>,
	remote?: Snapshot,
	options: { ignoreUnreadableRemote?: boolean } = {},
) {
	if (latest.missing || !latest.value) return local;
	let snapshot = remote;
	if (!snapshot) {
		try {
			snapshot = await readRemoteSnapshotRaw(client, config);
		} catch (error) {
			if (options.ignoreUnreadableRemote) return local;
			throw error;
		}
	}
	return snapshot ? mergeRemotePreservedFiles(local, snapshot, config) : local;
}

async function uploadSnapshot(
	client: S3Client,
	config: SyncConfig,
	snapshot: Snapshot,
	latest: RemoteObject<LatestPointer>,
	force: boolean,
) {
	const encoded = await encodeSnapshot(snapshot);
	const pointer = pointerFor(config, snapshot, sha256(encoded));
	await client.putBuffer(snapshotKey(config, snapshot.id), encoded, "application/gzip");
	const current = await client.getJson<LatestPointer>(latestKey(config));
	if (!force && remoteIdentity(current) !== remoteIdentity(latest)) {
		throw new Error("Remote changed while pushing. Run /sync pull first, then retry.");
	}
	await client.putJson(latestKey(config), pointer);
	const verified = await client.getJson<LatestPointer>(latestKey(config));
	if (verified.value?.snapshot !== pointer.snapshot) {
		throw new Error(
			"Remote latest changed immediately after push. Run /sync status before continuing.",
		);
	}
	return pointer;
}

async function readRemoteSnapshot(client: S3Client, config: SyncConfig) {
	const snapshot = await readRemoteSnapshotRaw(client, config);
	return snapshot ? filterSnapshotForConfigPolicy(snapshot, config) : undefined;
}

async function readRemoteSnapshotRaw(client: S3Client, config: SyncConfig) {
	const latest = await client.getJson<LatestPointer>(latestKey(config));
	if (latest.missing || !latest.value) return undefined;
	const object = await client.getBuffer(snapshotKey(config, latest.value.snapshot));
	if (!object.value)
		throw new Error(`Remote latest points to missing snapshot: ${latest.value.snapshot}`);
	if (sha256(object.value) !== latest.value.sha256)
		throw new Error("Remote snapshot checksum mismatch.");
	return decodeSnapshot(object.value);
}

async function encodeSnapshot(snapshot: Snapshot) {
	return gzipAsync(Buffer.from(JSON.stringify(snapshot), "utf8"));
}

async function decodeSnapshot(buffer: Buffer): Promise<Snapshot> {
	const decoded = await gunzipAsync(buffer);
	const parsed = JSON.parse(decoded.toString("utf8")) as Snapshot;
	if (parsed.version !== VERSION || !Array.isArray(parsed.files))
		throw new Error("Unsupported snapshot format.");
	return parsed;
}

export async function backupLocal(profile: string, options: SnapshotOptions = {}) {
	const snapshot = await createSnapshot(profile, options);
	const backupDirectory = path.join(stateDir(), "backups");
	await fs.mkdir(backupDirectory, { recursive: true });
	const backupPath = path.join(backupDirectory, `${snapshot.id}.json.gz`);
	await fs.writeFile(backupPath, await encodeSnapshot(snapshot));
	return backupPath;
}

async function updateHistorySafely(client: S3Client, config: SyncConfig, pointer: LatestPointer) {
	try {
		await updateHistory(client, config, pointer);
		return undefined;
	} catch (error) {
		return `Remote snapshot is active, but history could not be updated: ${errorMessage(error)}. Run /sync doctor before relying on history.`;
	}
}

async function updateHistory(client: S3Client, config: SyncConfig, pointer: LatestPointer) {
	const object = await client.getJson<{ version: number; snapshots: LatestPointer[] }>(
		historyKey(config),
	);
	const snapshots = object.value?.snapshots ?? [];
	const next = [
		...snapshots.filter((snapshot) => snapshot.snapshot !== pointer.snapshot),
		pointer,
	].slice(-100);
	await client.putJson(historyKey(config), { version: VERSION, snapshots: next });
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
