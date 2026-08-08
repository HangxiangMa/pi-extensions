import { lstatSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import { LOCK_GUARD_STALE_MS } from "./lock-policy.js";
import { LOCKFILE_FS_ADAPTER } from "./lockfile-fs.js";

const CANONICAL_DIRECTORY_NAME = "pi-sync";
const LEGACY_DIRECTORY_NAME = ".pisync";
const MIGRATION_LOCK_NAME = ".pi-sync-state-migration.lock";
const MIGRATION_LOCK_STALE_MS = 30_000;
const MIGRATION_LOCK_UPDATE_MS = 10_000;

export type StateDirectoryPreparation =
	| { status: "ready" }
	| { status: "migrated"; message: string }
	| { status: "deferred"; message: string };

export function stateDir() {
	const roots = inspectStateRoots();
	if (roots.canonical) return canonicalStateDir();
	if (roots.legacy) return legacyStateDir();
	return canonicalStateDir();
}

export function legacyStateDir() {
	return path.join(getAgentDir(), LEGACY_DIRECTORY_NAME);
}

export function stateDirectoryMigrationNotice() {
	const roots = inspectStateRoots();
	if (!roots.legacy) return undefined;
	return "Legacy pi-sync state is still stored in .pisync. Close other Pi sessions, then run /sync migrate-state to move it to pi-sync/.";
}

export async function migrateLegacyStateDirectory(): Promise<StateDirectoryPreparation> {
	const initial = inspectStateRoots();
	if (initial.canonical || !initial.legacy) return { status: "ready" };

	let compromisedError: Error | undefined;
	const release = await lockfile.lock(getAgentDir(), {
		fs: LOCKFILE_FS_ADAPTER,
		lockfilePath: migrationLockPath(),
		realpath: false,
		stale: MIGRATION_LOCK_STALE_MS,
		update: MIGRATION_LOCK_UPDATE_MS,
		retries: { retries: 20, minTimeout: 10, maxTimeout: 50 },
		onCompromised: (error) => {
			compromisedError = error;
		},
	});
	try {
		const roots = inspectStateRoots();
		if (roots.canonical || !roots.legacy) return { status: "ready" };

		const legacyLock = path.join(legacyStateDir(), "lock");
		const legacyGuardHeld = await lockfile.check(legacyLock, {
			fs: LOCKFILE_FS_ADAPTER,
			lockfilePath: `${legacyLock}.guard`,
			realpath: false,
			stale: LOCK_GUARD_STALE_MS,
		});
		if (legacyGuardHeld || (await pathExists(legacyLock))) {
			return {
				status: "deferred",
				message:
					"pi-sync state migration was deferred because the legacy directory is busy. Close other Pi sessions, clear any confirmed stale sync lock, and restart Pi.",
			};
		}
		if (compromisedError) throw compromisedError;
		await fs.rename(legacyStateDir(), canonicalStateDir());
		if (compromisedError) throw compromisedError;
		inspectStateRoots();
		return {
			status: "migrated",
			message: `Migrated pi-sync state from ${legacyStateDir()} to ${canonicalStateDir()}.`,
		};
	} finally {
		await release();
	}
}

function canonicalStateDir() {
	return path.join(getAgentDir(), CANONICAL_DIRECTORY_NAME);
}

function migrationLockPath() {
	return path.join(getAgentDir(), MIGRATION_LOCK_NAME);
}

function inspectStateRoots() {
	const canonical = isDirectoryRoot(canonicalStateDir(), "canonical");
	const legacy = isDirectoryRoot(legacyStateDir(), "legacy");
	if (canonical && legacy) {
		throw new Error(
			`Both legacy ${legacyStateDir()} and canonical ${canonicalStateDir()} pi-sync state directories exist. Close all Pi sessions and reconcile the directories manually; pi-sync will not merge or delete either directory.`,
		);
	}
	return { canonical, legacy };
}

function isDirectoryRoot(directory: string, label: string) {
	try {
		const entry = lstatSync(directory);
		if (entry.isSymbolicLink()) {
			throw new Error(
				`Refusing to use ${label} pi-sync state directory symbolic link: ${directory}`,
			);
		}
		if (!entry.isDirectory()) {
			throw new Error(`${label} pi-sync state path is not a directory: ${directory}`);
		}
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

async function pathExists(filePath: string) {
	try {
		await fs.lstat(filePath);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}
