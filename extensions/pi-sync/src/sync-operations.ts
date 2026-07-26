import fs from "node:fs/promises";
import path from "node:path";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createSyncBackend, type SyncBackendFactory } from "./backend-factory.js";
import {
	deprecatedPiSyncEnvironmentWarnings,
	loadConfig,
	normalizeSyncFiles,
	readStateForConfig,
	sessionDirForApply,
	stateDir,
	syncSessionsWarnings,
	writeStateForConfig,
} from "./config.js";
import { inspectLock, isLockGuardHeld, isStaleLock, withLock } from "./lock.js";
import {
	createSnapshot,
	filterSnapshotForConfigPolicy,
	mergeRemotePreservedFiles,
	regenerateSnapshotIdentity,
	scanSnapshot,
	sessionSnapshotPathFromAbsolute,
	snapshotIncludesSessions,
	snapshotWithoutSessions,
} from "./snapshot.js";
import { applySnapshot } from "./snapshot-apply.js";
import { encodeSnapshot } from "./snapshot-codec.js";
import {
	expectedRemoteHead,
	type PublishSnapshotResult,
	type RemoteHead,
	type SyncBackend,
} from "./sync-backend.js";
import {
	countPreservedRemoteFiles,
	errorMessage,
	formatDiff,
	formatPullSummary,
	formatPushSummary,
	formatRollbackSummary,
	formatSnapshotOnlyDiff,
	safeTerminalText,
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
import type { CommandOptions, Snapshot, SnapshotOptions, SyncConfig, SyncState } from "./types.js";

const STATUS_KEY = "sync";
const VERSION = 1;
const DEFAULT_PROFILE = "default";
const POST_LOCAL_COMMIT_TIMEOUT_MS = 30_000;

export class RollbackPublicationError extends Error {
	readonly backupPath: string;

	constructor(backupPath: string, cause: unknown) {
		super(
			`Rollback applied locally with backup ${backupPath}, but remote publication failed: ${errorMessage(cause)}`,
			{ cause },
		);
		this.name = "RollbackPublicationError";
		this.backupPath = backupPath;
	}
}

interface PushInput {
	config: SyncConfig;
	state: SyncState;
	local: Snapshot;
	backend?: SyncBackend;
}

function backendFor(config: SyncConfig, factory: SyncBackendFactory) {
	return factory(config);
}

export async function status(
	ctx: ExtensionCommandContext,
	options: CommandOptions,
	factory: SyncBackendFactory = createSyncBackend,
) {
	const config = await loadConfig(options.target);
	ctx.ui.setStatus(STATUS_KEY, `checking ${config.target ?? "default"}`);
	const backend = backendFor(config, factory);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
	const state = await readStateForConfig(config);
	const head = await backend.readHead(options.signal);
	throwIfAborted(options.signal);
	const localChanged = hasLocalChanges(local, state, config);

	const remoteText = head
		? `remote: ${head.snapshotId} from ${head.machine} at ${head.createdAt}`
		: "remote: empty";
	const remoteChanged = remoteChangedSinceState(head, state, config, (left, right) =>
		backend.sameRevision(left, right),
	);
	const warnings = [...deprecatedPiSyncEnvironmentWarnings(), ...syncSessionsWarnings(config)];
	ctx.ui.setStatus(STATUS_KEY, undefined);
	ctx.ui.notify(
		[
			`target: ${config.target ?? "default"}`,
			`storage profile: ${config.storageProfile ?? "default"}`,
			`destination: ${safeTerminalText(backend.destination)}`,
			`publication safety: ${backend.capability}`,
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

export async function diff(
	ctx: ExtensionCommandContext,
	options: CommandOptions,
	factory: SyncBackendFactory = createSyncBackend,
) {
	const config = await loadConfig(options.target);
	ctx.ui.setStatus(STATUS_KEY, `checking ${config.target ?? "default"}`);
	const backend = backendFor(config, factory);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
	const { snapshot: remote } = await readRemoteSnapshot(backend, config, options.signal);
	throwIfAborted(options.signal);
	ctx.ui.setStatus(STATUS_KEY, undefined);

	const warnings = [...deprecatedPiSyncEnvironmentWarnings(), ...syncSessionsWarnings(config)];
	const header = [
		`target: ${config.target ?? "default"}`,
		`storage profile: ${config.storageProfile ?? "default"}`,
		`destination: ${safeTerminalText(backend.destination)}`,
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

export async function doctor(
	ctx: ExtensionCommandContext,
	options: CommandOptions,
	factory: SyncBackendFactory = createSyncBackend,
) {
	const messages: string[] = [];
	let level: "info" | "warning" = "info";
	let snapshotOptions: SnapshotOptions = {};
	let profile = DEFAULT_PROFILE;

	try {
		const config = await loadConfig(options.target);
		const backend = backendFor(config, factory);
		profile = config.profile;
		snapshotOptions = snapshotOptionsForContext(ctx, config);
		messages.push(
			`config: ok (target ${config.target ?? "default"}; ${safeTerminalText(backend.destination)})`,
		);
		messages.push(`publication safety: ${backend.capability}`);
		const diagnostics = await backend.diagnose(options.signal);
		throwIfAborted(options.signal);
		for (const diagnostic of diagnostics) {
			messages.push(diagnostic.message);
			if (diagnostic.level !== "info") level = "warning";
		}
		messages.push(`sync files: ${normalizeSyncFiles(config.syncFiles).join(", ") || "none"}`);
		messages.push(`extra files: ${config.extraFiles.join(", ") || "none"}`);
		messages.push(`sessions: ${config.syncSessions ? "included" : "excluded"}`);
		const warnings = [...deprecatedPiSyncEnvironmentWarnings(), ...syncSessionsWarnings(config)];
		if (warnings.length > 0) {
			level = "warning";
			messages.push(...warnings);
		}
	} catch (error) {
		level = "warning";
		messages.push(`config: ${errorMessage(error)}`);
	}

	const local = await createSnapshot(profile, snapshotOptions);
	throwIfAborted(options.signal);
	const secrets = scanSnapshot(local);
	if (secrets.length > 0) {
		level = "warning";
		messages.push("secret scan: possible secrets found:");
		messages.push(...secrets.map((secret) => `- ${secret}`));
	} else {
		messages.push(`secret scan: ok (${local.files.length} files checked)`);
	}

	const lock = await inspectLock();
	throwIfAborted(options.signal);
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
		throwIfAborted(options.signal);
		level = "warning";
		messages.push("lock: guard active while metadata is missing or still being initialized");
	} else {
		messages.push("lock: free");
	}
	ctx.ui.notify(messages.join("\n"), level);
}

export async function push(
	ctx: ExtensionCommandContext | ExtensionContext,
	options: CommandOptions,
	input?: PushInput,
	factory: SyncBackendFactory = createSyncBackend,
) {
	const config = input?.config ?? (await loadConfig(options.target));
	ctx.ui.setStatus(STATUS_KEY, `pushing ${config.target ?? "default"}`);
	const backend = input?.backend ?? backendFor(config, factory);
	const state = input?.state ?? (await readStateForConfig(config));
	const local =
		input?.local ?? (await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config)));

	let head = await backend.readHead(options.signal);
	let remoteForUpload = await readRemoteSnapshotForUpload(
		backend,
		config,
		head,
		state,
		options.signal,
	);
	if (
		remoteChangedSinceState(head, state, config, (left, right) =>
			backend.sameRevision(left, right),
		) &&
		!options.force
	) {
		const remoteForConflict = remoteForUpload
			? filterSnapshotForConfigPolicy(remoteForUpload, config)
			: undefined;
		if (!remoteForConflict || !snapshotHashesMatchState(remoteForConflict, state, config)) {
			throw new Error(
				"Remote or sync policy changed since last sync. Run /sync pull first or /sync push --force.",
			);
		}
	}

	let upload = await snapshotForUpload(
		backend,
		config,
		local,
		head,
		remoteForUpload,
		options.signal,
	);
	const secrets = scanSnapshot(local);
	if (secrets.length > 0) {
		throw new Error(
			`Refusing to push possible secrets:\n${secrets.map((s) => `- ${s}`).join("\n")}`,
		);
	}

	if (!(await confirmPush(ctx, options, config, backend, local, upload, head, remoteForUpload))) {
		return;
	}

	if (options.force) {
		const refreshedHead = await backend.readHead(options.signal);
		if (!sameRemoteHead(backend, head, refreshedHead)) {
			head = refreshedHead;
			remoteForUpload = head
				? await backend.readSnapshot(head.snapshotRef, options.signal)
				: undefined;
			upload = await snapshotForUpload(
				backend,
				config,
				local,
				head,
				remoteForUpload,
				options.signal,
			);
			if (
				!(await confirmPush(
					ctx,
					options,
					config,
					backend,
					local,
					upload,
					head,
					remoteForUpload,
					"Remote changed during review. Push the refreshed plan?",
				))
			) {
				return;
			}
		}
	}

	const result = await backend.publishSnapshot(upload, expectedRemoteHead(head), {
		signal: options.signal,
		onCommit: options.onCommit,
	});
	await writeStateForConfig(config, {
		version: VERSION,
		profile: config.profile,
		lastAppliedSnapshot: result.head.snapshotId,
		lastRemoteRevision: result.head.revision,
		lastFileHashes: fileHashMap(local),
		syncFiles: config.syncFiles,
		syncSessions: config.syncSessions,
		extraFiles: config.extraFiles,
	});
	if (options.signal?.aborted) return;
	ctx.ui.setStatus(STATUS_KEY, undefined);
	if (!options.silent) {
		ctx.ui.notify(
			[
				`Pushed ${upload.files.length} files from target “${config.target ?? "default"}” as ${result.head.snapshotId}.`,
				...result.warnings,
			]
				.filter(Boolean)
				.join("\n"),
			result.warnings.length > 0 ? "warning" : "info",
		);
	}
}

export async function pull(
	ctx: ExtensionCommandContext | ExtensionContext,
	options: CommandOptions,
	factory: SyncBackendFactory = createSyncBackend,
) {
	const config = await loadConfig(options.target);
	ctx.ui.setStatus(STATUS_KEY, `pulling ${config.target ?? "default"}`);
	const backend = backendFor(config, factory);
	const state = await readStateForConfig(config);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
	const { head, snapshot: remote } = await readRemoteSnapshot(backend, config, options.signal);
	throwIfAborted(options.signal);
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
			formatPullSummary(
				config,
				backend.destination,
				local,
				remote,
				protectedSessionPaths(ctx).size,
			),
		))
	) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.notify("Pull cancelled.", "info");
		return "cancelled" as const;
	}

	throwIfAborted(options.signal);
	const backup = await backupLocal(
		config.profile,
		snapshotOptionsForContext(ctx, config),
		options.signal,
	);
	const applySessionDir = await sessionDirForApply(ctx, remote);
	throwIfAborted(options.signal);
	options.onCommit?.();
	const lastFileHashes = await applySnapshot(remote, protectedSessionPaths(ctx), {
		syncFiles: config.syncFiles,
		sessionDir: applySessionDir,
		extraFiles: config.extraFiles,
	});
	await writeStateForConfig(config, {
		version: VERSION,
		profile: config.profile,
		lastAppliedSnapshot: remote.id,
		lastRemoteRevision: head?.revision,
		lastFileHashes,
		syncFiles: config.syncFiles,
		syncSessions: config.syncSessions,
		extraFiles: config.extraFiles,
	});
	if (options.signal?.aborted) return "applied" as const;
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
	if (options.reload) await maybeReload(ctx, options.signal);
	return "applied" as const;
}

export async function syncBoth(
	ctx: ExtensionCommandContext | ExtensionContext,
	options: CommandOptions,
	factory: SyncBackendFactory = createSyncBackend,
) {
	const config = await loadConfig(options.target);
	const backend = backendFor(config, factory);
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
	const { head, snapshot: remote } = await readRemoteSnapshot(backend, config, options.signal);
	throwIfAborted(options.signal);
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
			await pull(ctx, options, factory);
			return;
		}
		await writeStateForConfig(config, {
			version: VERSION,
			profile: config.profile,
			lastAppliedSnapshot: remote.id,
			lastRemoteRevision: head?.revision,
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
			lastRemoteRevision: head?.revision,
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
		await pull(ctx, options, factory);
		return;
	}
	if (localChanged || !remote) {
		await push(ctx, options, undefined, factory);
		return;
	}
	if (
		shouldRefreshSyncedState(remote, head, state, config, (left, right) =>
			backend.sameRevision(left, right),
		)
	) {
		await writeStateForConfig(config, {
			version: VERSION,
			profile: config.profile,
			lastAppliedSnapshot: remote.id,
			lastRemoteRevision: head?.revision,
			lastFileHashes: fileHashMap(remote),
			syncFiles: config.syncFiles,
			syncSessions: config.syncSessions,
			extraFiles: config.extraFiles,
		});
	}
	if (!options.silent) ctx.ui.notify("pi-sync is already up to date.", "info");
}

export async function history(
	ctx: ExtensionCommandContext,
	options: CommandOptions,
	factory: SyncBackendFactory = createSyncBackend,
) {
	const config = await loadConfig(options.target);
	const backend = backendFor(config, factory);
	const snapshots = (await backend.listHistory(options.signal)).slice(-20).reverse();
	throwIfAborted(options.signal);
	if (snapshots.length === 0) {
		ctx.ui.notify("No remote pi-sync history found.", "info");
		return;
	}

	const currentSnapshot = snapshots[0]?.snapshotId;
	if (ctx.mode === "tui") {
		const labels = snapshots.map(
			(item, index) =>
				`${index + 1}. ${item.createdAt} · ${safeTerminalText(item.machine)} · ${item.snapshotId}${item.snapshotId === currentSnapshot ? " (current)" : ""}${item.syncSessions ? " · sessions" : ""}`,
		);
		const selected = await ctx.ui.select(
			`History for target “${safeTerminalText(config.target ?? "default")}”\n\nChoose a snapshot to preview rollback.`,
			[...labels, "Back"],
		);
		if (!selected || selected === "Back") return;
		throwIfAborted(options.signal);
		const index = labels.indexOf(selected);
		const snapshot = snapshots[index];
		if (!snapshot) return;
		await withLock("rollback", () =>
			rollback(ctx, { ...options, args: [snapshot.snapshotRef], yes: false }, factory, backend),
		);
		return;
	}
	ctx.ui.notify(
		snapshots
			.map((item) => `${item.snapshotRef} ${item.createdAt} ${safeTerminalText(item.machine)}`)
			.join("\n"),
		"info",
	);
}

export async function rollback(
	ctx: ExtensionCommandContext,
	options: CommandOptions,
	factory: SyncBackendFactory = createSyncBackend,
	existingBackend?: SyncBackend,
) {
	const target = options.args[0];
	if (!target) throw new Error("Usage: /sync rollback <snapshot-id> [--yes]");

	const config = await loadConfig(options.target);
	const backend = existingBackend ?? backendFor(config, factory);
	const decoded = await backend.readSnapshot(target, options.signal);
	const selected = filterSnapshotForConfigPolicy(
		config.syncSessions ? decoded : snapshotWithoutSessions(decoded),
		config,
	);
	const remote = regenerateSnapshotIdentity(selected);
	const local = await createSnapshot(config.profile, snapshotOptionsForContext(ctx, config));
	throwIfAborted(options.signal);

	if (
		!options.yes &&
		!(await ctx.ui.confirm(
			snapshotIncludesSessions(remote)
				? "Rollback pi settings and sessions?"
				: "Rollback pi settings?",
			formatRollbackSummary(
				config,
				backend.destination,
				local,
				remote,
				target,
				protectedSessionPaths(ctx).size,
			),
		))
	) {
		ctx.ui.notify("Rollback cancelled.", "info");
		return;
	}

	throwIfAborted(options.signal);
	const backup = await backupLocal(
		config.profile,
		snapshotOptionsForContext(ctx, config),
		options.signal,
	);
	const applySessionDir = await sessionDirForApply(ctx, remote);
	throwIfAborted(options.signal);
	options.onCommit?.();
	const lastFileHashes = await applySnapshot(remote, protectedSessionPaths(ctx), {
		syncFiles: config.syncFiles,
		sessionDir: applySessionDir,
		extraFiles: config.extraFiles,
	});
	let result: PublishSnapshotResult;
	try {
		const completionSignal = AbortSignal.timeout(POST_LOCAL_COMMIT_TIMEOUT_MS);
		const head = await backend.readHead(completionSignal);
		const upload = await snapshotForUpload(
			backend,
			config,
			remote,
			head,
			undefined,
			completionSignal,
			{ ignoreUnreadableRemote: true },
		);
		result = await backend.publishSnapshot(upload, expectedRemoteHead(head), {
			signal: completionSignal,
		});
	} catch (error) {
		throw new RollbackPublicationError(backup, error);
	}
	await writeStateForConfig(config, {
		version: VERSION,
		profile: config.profile,
		lastAppliedSnapshot: result.head.snapshotId,
		lastRemoteRevision: result.head.revision,
		lastFileHashes,
		syncFiles: config.syncFiles,
		syncSessions: config.syncSessions,
		extraFiles: config.extraFiles,
	});
	if (options.signal?.aborted) return;
	ctx.ui.notify(
		[
			`Rolled back target “${config.target ?? "default"}” to ${target}; latest: ${result.head.snapshotId}. Backup: ${backup}`,
			...result.warnings,
		]
			.filter(Boolean)
			.join("\n"),
		result.warnings.length > 0 ? "warning" : "info",
	);
	await maybeReload(ctx, options.signal);
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

async function maybeReload(ctx: ExtensionCommandContext | ExtensionContext, signal?: AbortSignal) {
	if (signal?.aborted || !("reload" in ctx)) return;
	if (
		ctx.hasUI &&
		(await ctx.ui.confirm(
			"Reload Pi resources now?",
			"This reloads extensions, skills, prompts, themes, and context files.",
		))
	) {
		if (signal?.aborted) return;
		await ctx.reload();
	}
}

async function readRemoteSnapshotForUpload(
	backend: SyncBackend,
	config: SyncConfig,
	head: RemoteHead | undefined,
	state: SyncState,
	signal?: AbortSignal,
) {
	if (
		!head ||
		(head.snapshotId === state.lastAppliedSnapshot &&
			!syncPolicyChanged(state, config) &&
			(!state.lastRemoteRevision || backend.sameRevision(head.revision, state.lastRemoteRevision)))
	) {
		return undefined;
	}
	return backend.readSnapshot(head.snapshotRef, signal);
}

async function snapshotForUpload(
	backend: SyncBackend,
	config: SyncConfig,
	local: Snapshot,
	head: RemoteHead | undefined,
	remote?: Snapshot,
	signal?: AbortSignal,
	options: { ignoreUnreadableRemote?: boolean } = {},
) {
	if (!head) return local;
	let snapshot = remote;
	if (!snapshot) {
		try {
			snapshot = await backend.readSnapshot(head.snapshotRef, signal);
		} catch (error) {
			if (options.ignoreUnreadableRemote) return local;
			throw error;
		}
	}
	return mergeRemotePreservedFiles(local, snapshot, config);
}

async function readRemoteSnapshot(backend: SyncBackend, config: SyncConfig, signal?: AbortSignal) {
	const head = await backend.readHead(signal);
	if (!head) return { head: undefined, snapshot: undefined };
	const snapshot = await backend.readSnapshot(head.snapshotRef, signal);
	if (snapshot.id !== head.snapshotId) {
		throw new Error(
			`Remote head ${head.snapshotId} resolved to unexpected snapshot ${snapshot.id}.`,
		);
	}
	return { head, snapshot: filterSnapshotForConfigPolicy(snapshot, config) };
}

async function confirmPush(
	ctx: ExtensionCommandContext | ExtensionContext,
	options: CommandOptions,
	config: SyncConfig,
	backend: SyncBackend,
	local: Snapshot,
	upload: Snapshot,
	head: RemoteHead | undefined,
	remote: Snapshot | undefined,
	title = snapshotIncludesSessions(upload) ? "Push pi settings and sessions?" : "Push pi settings?",
) {
	throwIfAborted(options.signal);
	if (options.yes) return true;
	const confirmed = await ctx.ui.confirm(
		title,
		formatPushSummary(
			config,
			backend.destination,
			upload,
			head,
			countPreservedRemoteFiles(local, upload),
			remote,
		),
	);
	throwIfAborted(options.signal);
	if (confirmed) return true;
	ctx.ui.setStatus(STATUS_KEY, undefined);
	ctx.ui.notify("Push cancelled.", "info");
	return false;
}

function throwIfAborted(signal?: AbortSignal) {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error
		? signal.reason
		: new DOMException("The operation was aborted", "AbortError");
}

function sameRemoteHead(
	backend: SyncBackend,
	left: RemoteHead | undefined,
	right: RemoteHead | undefined,
) {
	if (!left || !right) return left === right;
	return backend.sameRevision(left.revision, right.revision);
}

export async function backupLocal(
	profile: string,
	options: SnapshotOptions = {},
	signal?: AbortSignal,
) {
	throwIfAborted(signal);
	const snapshot = await createSnapshot(profile, options);
	throwIfAborted(signal);
	const backupDirectory = path.join(stateDir(), "backups");
	await fs.mkdir(backupDirectory, { recursive: true });
	throwIfAborted(signal);
	const backupPath = path.join(backupDirectory, `${snapshot.id}.json.gz`);
	const encoded = await encodeSnapshot(snapshot);
	throwIfAborted(signal);
	await fs.writeFile(backupPath, encoded, { signal });
	return backupPath;
}
