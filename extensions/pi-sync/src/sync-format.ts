import { createHash } from "node:crypto";
import { agentDir } from "./config.js";
import { fileHashMap } from "./sync-state.js";
import type { LatestPointer, RemoteObject, Snapshot, SyncConfig } from "./types.js";

export function formatDiff(local: Snapshot, remote: Snapshot) {
	const localMap = fileHashMap(local);
	const remoteMap = fileHashMap(remote);
	const allPaths = [...new Set([...Object.keys(localMap), ...Object.keys(remoteMap)])].sort();
	const lines = [
		`local: ${local.files.length} files`,
		`remote: ${remote.id} (${remote.files.length} files)`,
		"",
	];
	let changed = 0;
	for (const filePath of allPaths) {
		if (!localMap[filePath]) {
			lines.push(`Remote only: ${filePath}`);
			changed += 1;
		} else if (!remoteMap[filePath]) {
			lines.push(`Local only: ${filePath}`);
			changed += 1;
		} else if (localMap[filePath] !== remoteMap[filePath]) {
			lines.push(`Different: ${filePath}`);
			changed += 1;
		}
	}
	if (changed === 0) lines.push("No file differences.");
	return lines.join("\n");
}

export function formatSnapshotOnlyDiff(title: string, snapshot: Snapshot) {
	return [`${title}: ${snapshot.id}`, ...snapshot.files.map((file) => `Add: ${file.path}`)].join(
		"\n",
	);
}

export function formatPushSummary(
	config: SyncConfig,
	upload: Snapshot,
	latest: RemoteObject<LatestPointer>,
	preservedRemoteFileCount = 0,
	remote?: Snapshot,
) {
	return [
		`Target: ${safeTerminalText(config.target ?? "default")}`,
		`Destination: ${formatDestination(config)}`,
		`Upload ${upload.files.length} files from ${safeTerminalText(agentDir())}.`,
		`Sessions: ${upload.syncSessions ? "included — may contain private conversations" : "not included"}`,
		latest.value ? `Remote latest: ${latest.value.snapshot}` : "Remote latest: empty",
		"Publication effect: latest.json will point to the new immutable snapshot.",
		formatPublicationPreview(remote, upload),
		preservedRemoteFileCount > 0
			? `Possible secrets in locally managed files were scanned before this prompt; ${preservedRemoteFileCount} preserved remote file(s) were not rescanned.`
			: "Possible secrets were scanned before this prompt.",
	].join("\n");
}

export function formatApplyPreview(local: Snapshot, remote: Snapshot) {
	return formatDirectionalChanges(local, remote, {
		add: "Add locally",
		update: "Update locally",
		remove: "Remove locally",
	});
}

export function formatPullSummary(
	config: SyncConfig,
	local: Snapshot,
	remote: Snapshot,
	protectedSessionCount: number,
) {
	return [
		`Target: ${safeTerminalText(config.target ?? "default")}`,
		`Destination: ${formatDestination(config)}`,
		`Snapshot: ${safeTerminalText(remote.id)}`,
		`Sessions: ${remote.syncSessions ? "included — may contain private conversations" : "not included"}`,
		`Protected live sessions: ${protectedSessionCount || "none"}`,
		formatApplyPreview(local, remote),
		"A local backup is created before these writes/deletes. The remote active snapshot is unchanged.",
	].join("\n");
}

export function formatRollbackSummary(
	config: SyncConfig,
	local: Snapshot,
	remote: Snapshot,
	requestedSnapshot: string,
	protectedSessionCount: number,
) {
	return [
		`Target: ${safeTerminalText(config.target ?? "default")}`,
		`Destination: ${formatDestination(config)}`,
		`Snapshot: ${safeTerminalText(requestedSnapshot)}`,
		`Sessions: ${remote.syncSessions ? "included — may contain private conversations" : "not included"}`,
		`Protected live sessions: ${protectedSessionCount || "none"}`,
		formatApplyPreview(local, remote),
		"A local backup is created before applying; the remote latest pointer will change.",
	].join("\n");
}

function formatPublicationPreview(remote: Snapshot | undefined, upload: Snapshot) {
	if (!remote) {
		return ["Remote is empty.", ...upload.files.map((file) => `Add remotely: ${file.path}`)].join(
			"\n",
		);
	}
	return formatDirectionalChanges(remote, upload, {
		add: "Add remotely",
		update: "Update remotely",
		remove: "Remove remotely",
	});
}

function formatDirectionalChanges(
	before: Snapshot,
	after: Snapshot,
	labels: { add: string; update: string; remove: string },
) {
	const beforeMap = fileHashMap(before);
	const afterMap = fileHashMap(after);
	const paths = [...new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])].sort();
	const lines: string[] = [];
	for (const filePath of paths) {
		if (!beforeMap[filePath]) lines.push(`${labels.add}: ${filePath}`);
		else if (!afterMap[filePath]) lines.push(`${labels.remove}: ${filePath}`);
		else if (beforeMap[filePath] !== afterMap[filePath])
			lines.push(`${labels.update}: ${filePath}`);
	}
	if (lines.length === 0) lines.push("No file changes.");
	return lines.join("\n");
}

export function formatDestination(config: SyncConfig) {
	let host = config.endpoint;
	try {
		host = new URL(config.endpoint).hostname;
	} catch {
		// Preserve a sanitized invalid endpoint for actionable repair output.
	}
	return safeTerminalText(`${host} · ${config.bucket}/${config.prefix}/profiles/${config.profile}`);
}

export function countPreservedRemoteFiles(local: Snapshot, upload: Snapshot) {
	const localPaths = new Set(local.files.map((file) => file.path));
	return upload.files.filter((file) => !localPaths.has(file.path)).length;
}

export function safeTerminalText(value: string) {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Escape untrusted terminal controls.
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "?");
}

export function redact(value: string) {
	return value.length <= 8 ? "configured" : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function remoteIdentity(remote: RemoteObject<LatestPointer>) {
	return remote.missing ? "missing" : (remote.value?.snapshot ?? "unknown");
}

export function sha256(value: Buffer) {
	return createHash("sha256").update(value).digest("hex");
}

export function errorMessage(error: unknown) {
	return safeTerminalText(error instanceof Error ? error.message : String(error));
}
