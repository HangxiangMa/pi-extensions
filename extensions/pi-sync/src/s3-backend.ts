import { createHash } from "node:crypto";
import { sessionTokenWarnings } from "./config.js";
import { encodeKey, posixJoin } from "./paths.js";
import { S3Client } from "./s3-client.js";
import { decodeSnapshot, encodeSnapshot } from "./snapshot-codec.js";
import {
	type BackendDiagnostic,
	type ExpectedRemoteHead,
	type PublishSnapshotOptions,
	type PublishSnapshotResult,
	type RemoteHead,
	type RemoteHistoryEntry,
	type SyncBackend,
	SyncBackendConflictError,
	SyncBackendPublicationOutcomeUnknownError,
} from "./sync-backend.js";
import type { LatestPointer, RemoteObject, ResolvedS3Backend, Snapshot } from "./types.js";

const VERSION = 1;
const POST_COMMIT_TIMEOUT_MS = 30_000;

export class S3SyncBackend implements SyncBackend {
	readonly identity: string;
	readonly destination: string;
	readonly capability = "read-check-write-verify" as const;
	private readonly checksums = new Map<string, string>();

	constructor(
		private readonly config: ResolvedS3Backend,
		private readonly postCommitTimeoutMs = POST_COMMIT_TIMEOUT_MS,
	) {
		this.identity = s3BackendIdentity(config);
		this.destination = s3Destination(config);
	}

	sameRevision(left: string, right: string) {
		return left === right;
	}

	async readHead(signal?: AbortSignal): Promise<RemoteHead | undefined> {
		const object = await new S3Client(this.config, signal).getJson<LatestPointer>(
			latestKey(this.config),
		);
		throwIfAborted(signal);
		if (object.missing) return undefined;
		const pointer = requirePointer(object.value, "Remote latest pointer is malformed.");
		this.checksums.set(pointer.snapshot, pointer.sha256);
		return remoteHead(pointer, this.identity, object.etag);
	}

	async readSnapshot(reference: string, signal?: AbortSignal): Promise<Snapshot> {
		const expectedChecksum =
			this.checksums.get(reference) ?? (await this.resolveChecksum(reference, signal));
		if (!expectedChecksum) {
			throw new Error(
				`Snapshot ${reference} is not present in the active head or retained history; integrity cannot be verified.`,
			);
		}
		const object = await new S3Client(this.config, signal).getBuffer(
			snapshotKey(this.config, reference),
		);
		throwIfAborted(signal);
		if (!object.value) throw new Error(`Snapshot not found: ${reference}`);
		if (sha256(object.value) !== expectedChecksum) {
			throw new Error("Remote snapshot checksum mismatch.");
		}
		return decodeSnapshot(object.value, { signal });
	}

	async publishSnapshot(
		snapshot: Snapshot,
		expected: ExpectedRemoteHead,
		options: PublishSnapshotOptions = {},
	): Promise<PublishSnapshotResult> {
		throwIfAborted(options.signal);
		const encoded = await encodeSnapshot(snapshot);
		throwIfAborted(options.signal);
		const pointer = pointerFor(this.config, snapshot, sha256(encoded));
		const cancellableClient = new S3Client(this.config, options.signal);
		await cancellableClient.putBuffer(
			snapshotKey(this.config, snapshot.id),
			encoded,
			"application/gzip",
		);
		const currentObject = await cancellableClient.getJson<LatestPointer>(latestKey(this.config));
		throwIfAborted(options.signal);
		const current = currentObject.missing
			? undefined
			: remoteHead(
					requirePointer(currentObject.value, "Remote latest pointer is malformed."),
					this.identity,
					currentObject.etag,
				);
		if (!matchesExpected(current, expected)) {
			throw new SyncBackendConflictError(
				"Remote changed while pushing. Run /sync pull first, then retry.",
				{ currentHead: current },
			);
		}
		throwIfAborted(options.signal);
		options.onCommit?.();

		// The active-head PUT is the publication boundary. Do not bind it or its
		// verification to a user-cancellation signal after the boundary begins.
		const commitClient = new S3Client(this.config, AbortSignal.timeout(this.postCommitTimeoutMs));
		try {
			await commitClient.putJson(latestKey(this.config), pointer);
		} catch (error) {
			throw new SyncBackendPublicationOutcomeUnknownError(
				`Remote publication outcome is unknown: ${errorMessage(error)}`,
				{ cause: error },
			);
		}

		let verifiedObject: RemoteObject<LatestPointer>;
		try {
			verifiedObject = await commitClient.getJson<LatestPointer>(latestKey(this.config));
		} catch (error) {
			throw new SyncBackendPublicationOutcomeUnknownError(
				`Remote snapshot may be active, but publication could not be verified: ${errorMessage(error)}`,
				{ cause: error },
			);
		}
		let verifiedPointer: LatestPointer;
		try {
			verifiedPointer = requirePointer(
				verifiedObject.value,
				"Remote latest pointer is malformed after publication.",
			);
		} catch (error) {
			throw new SyncBackendPublicationOutcomeUnknownError(
				`Remote snapshot may be active, but publication verification was malformed: ${errorMessage(error)}`,
				{ cause: error },
			);
		}
		if (!samePointer(verifiedPointer, pointer)) {
			throw new SyncBackendConflictError(
				"Remote latest changed immediately after push. Run /sync status before continuing.",
				{
					phase: "after-commit",
					currentHead: remoteHead(verifiedPointer, this.identity, verifiedObject.etag),
					candidateMayHaveBeenActive: true,
				},
			);
		}
		this.checksums.set(verifiedPointer.snapshot, verifiedPointer.sha256);
		const head = remoteHead(verifiedPointer, this.identity, verifiedObject.etag);
		const warning = await this.updateHistorySafely(commitClient, pointer);
		return { head, warnings: warning ? [warning] : [] };
	}

	async listHistory(signal?: AbortSignal): Promise<RemoteHistoryEntry[]> {
		const object = await new S3Client(this.config, signal).getJson<{
			version: number;
			snapshots: LatestPointer[];
		}>(historyKey(this.config));
		throwIfAborted(signal);
		if (object.missing) return [];
		if (!object.value || !Array.isArray(object.value.snapshots)) {
			throw new Error("Remote history is malformed.");
		}
		return object.value.snapshots.map((pointer) => {
			const validated = requirePointer(pointer, "Remote history entry is malformed.");
			this.checksums.set(validated.snapshot, validated.sha256);
			return remoteHead(validated, this.identity);
		});
	}

	async diagnose(signal?: AbortSignal): Promise<BackendDiagnostic[]> {
		throwIfAborted(signal);
		return [
			{
				key: "s3-config",
				level: "info",
				message: `s3 config: ok (${this.config.destination.bucket}/${profilePrefix(this.config)})`,
			},
			...sessionTokenWarnings(this.config.profile).map((message) => ({
				key: "s3-session-token",
				level: "warning" as const,
				message,
			})),
		];
	}

	private async resolveChecksum(reference: string, signal?: AbortSignal) {
		await this.readHead(signal);
		const headChecksum = this.checksums.get(reference);
		if (headChecksum) return headChecksum;
		await this.listHistory(signal);
		return this.checksums.get(reference);
	}

	private async updateHistorySafely(client: S3Client, pointer: LatestPointer) {
		try {
			await this.updateHistory(client, pointer);
			return undefined;
		} catch (error) {
			return `Remote snapshot is active, but history could not be updated: ${errorMessage(error)}. Run /sync doctor before relying on history.`;
		}
	}

	private async updateHistory(client: S3Client, pointer: LatestPointer) {
		const object = await client.getJson<{ version: number; snapshots: LatestPointer[] }>(
			historyKey(this.config),
		);
		const snapshots = object.value?.snapshots ?? [];
		const next = [
			...snapshots.filter((snapshot) => snapshot.snapshot !== pointer.snapshot),
			pointer,
		].slice(-100);
		await client.putJson(historyKey(this.config), { version: VERSION, snapshots: next });
	}
}

export function latestKey(config: ResolvedS3Backend) {
	return posixJoin(profilePrefix(config), "latest.json");
}

export function historyKey(config: ResolvedS3Backend) {
	return posixJoin(profilePrefix(config), "history.json");
}

export function snapshotKey(config: ResolvedS3Backend, id: string) {
	return posixJoin(profilePrefix(config), "snapshots", `${id}.json.gz`);
}

export function profilePrefix(config: ResolvedS3Backend) {
	return posixJoin(config.destination.prefix, "profiles", config.destination.namespace);
}

export function pointerFor(
	config: ResolvedS3Backend,
	snapshot: Snapshot,
	checksum: string,
): LatestPointer {
	return {
		version: VERSION,
		profile: config.destination.namespace,
		snapshot: snapshot.id,
		sha256: checksum,
		createdAt: snapshot.createdAt,
		machine: snapshot.machine,
		syncSessions:
			snapshot.syncSessions === true ||
			snapshot.files.some((file) => file.path.startsWith("sessions/")),
	};
}

export function s3BackendIdentity(config: ResolvedS3Backend) {
	const destination = JSON.stringify([
		secretFreeEndpoint(config.profile.endpoint),
		trimSlashes(config.destination.bucket),
		trimSlashes(config.destination.prefix),
		trimSlashes(config.destination.namespace),
	]);
	return `s3:${sha256(Buffer.from(destination))}`;
}

function s3Destination(config: ResolvedS3Backend) {
	let host = secretFreeEndpoint(config.profile.endpoint);
	try {
		host = new URL(host).hostname;
	} catch {
		host = "invalid S3 endpoint";
	}
	return `${host} · ${config.destination.bucket}/${profilePrefix(config)}`;
}

function secretFreeEndpoint(value: string) {
	const normalized = value.trim();
	try {
		const url = new URL(normalized);
		url.username = "";
		url.password = "";
		return url.toString();
	} catch {
		return normalized.replace(/\/\/[^/@\s]+@/u, "//");
	}
}

function trimSlashes(value: string) {
	return value.replace(/^\/+|\/+$/g, "");
}

function remoteHead(pointer: LatestPointer, identity: string, etag?: string): RemoteHead {
	return {
		snapshotRef: pointer.snapshot,
		snapshotId: pointer.snapshot,
		revision: `s3:${sha256(Buffer.from(canonicalJson([identity, etag ?? null, pointer])))}`,
		createdAt: pointer.createdAt,
		machine: pointer.machine,
		syncSessions: pointer.syncSessions === true,
	};
}

function samePointer(left: LatestPointer, right: LatestPointer) {
	return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown) {
	return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]),
	);
}

function matchesExpected(head: RemoteHead | undefined, expected: ExpectedRemoteHead) {
	if (expected.kind === "missing") return head === undefined;
	return head?.revision === expected.revision;
}

function requirePointer(value: LatestPointer | undefined, message: string) {
	if (
		!value ||
		value.version !== VERSION ||
		typeof value.profile !== "string" ||
		typeof value.snapshot !== "string" ||
		typeof value.sha256 !== "string" ||
		typeof value.createdAt !== "string" ||
		typeof value.machine !== "string"
	) {
		throw new Error(message);
	}
	return value;
}

function throwIfAborted(signal?: AbortSignal) {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error
		? signal.reason
		: new DOMException("The operation was aborted", "AbortError");
}

function sha256(value: Buffer) {
	return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export { encodeKey };
