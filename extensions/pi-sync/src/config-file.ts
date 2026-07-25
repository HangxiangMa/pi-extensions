import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_FILE_NAME = "pi-sync.json";
const LEGACY_CONFIG_FILE_NAME = "pi-sync.local.json";
const configMigrationNotices = new Map<string, string>();
const legacyPresenceNoticed = new Set<string>();

export type FileIdentity = { dev: number; ino: number };

type ConfigSnapshot = {
	bytes: Buffer;
	identity: FileIdentity;
	parsed: Record<string, unknown>;
};

export function localConfigPath() {
	return path.join(getAgentDir(), CONFIG_FILE_NAME);
}

export function legacyLocalConfigPath() {
	return path.join(getAgentDir(), LEGACY_CONFIG_FILE_NAME);
}

export function consumeLocalConfigMigrationNotice() {
	const configPath = localConfigPath();
	const notice = configMigrationNotices.get(configPath);
	configMigrationNotices.delete(configPath);
	return notice;
}

export async function readMigratingLocalConfig(
	validateForMigration: (settings: Record<string, unknown>) => void,
) {
	const configPath = await prepareLocalConfigPath(validateForMigration);
	const snapshot = await readConfigSnapshotIfExists(configPath);
	return snapshot?.parsed;
}

async function prepareLocalConfigPath(
	validateForMigration: (settings: Record<string, unknown>) => void,
) {
	const canonicalPath = localConfigPath();
	const legacyPath = legacyLocalConfigPath();
	if (await pathExists(canonicalPath)) {
		const legacyStatus = await secureIgnoredLegacyIfPresent(legacyPath);
		if (legacyStatus !== "missing" && !legacyPresenceNoticed.has(canonicalPath)) {
			legacyPresenceNoticed.add(canonicalPath);
			recordConfigMigrationNotice(
				canonicalPath,
				legacyStatus === "private"
					? `${LEGACY_CONFIG_FILE_NAME} legacy settings were ignored because ${CONFIG_FILE_NAME} takes precedence. Delete ${LEGACY_CONFIG_FILE_NAME} after confirming your settings.`
					: `${LEGACY_CONFIG_FILE_NAME} legacy settings were ignored because ${CONFIG_FILE_NAME} takes precedence, but pi-sync could not verify them as a private regular file. Secure or delete the legacy path after confirming your settings.`,
			);
		}
		return canonicalPath;
	}

	const legacy = await readConfigSnapshotIfExists(legacyPath);
	if (!legacy) return canonicalPath;
	validateForMigration(legacy.parsed);

	let installedIdentity: FileIdentity;
	try {
		installedIdentity = await installPrivateConfigExclusively(canonicalPath, legacy.bytes);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			recordConfigMigrationNotice(
				canonicalPath,
				`${LEGACY_CONFIG_FILE_NAME} legacy settings were ignored because ${CONFIG_FILE_NAME} was created concurrently and takes precedence.`,
			);
			return canonicalPath;
		}
		recordConfigMigrationNotice(
			canonicalPath,
			`Could not migrate ${LEGACY_CONFIG_FILE_NAME} to ${CONFIG_FILE_NAME}; the legacy settings were used for this session and were not changed.`,
		);
		return legacyPath;
	}

	if (!(await configSnapshotStillMatches(legacyPath, legacy))) {
		const removed = await quarantineAndRemoveConfigIfMatches(
			canonicalPath,
			installedIdentity,
			legacy.bytes,
		);
		recordConfigMigrationNotice(
			canonicalPath,
			removed
				? `${LEGACY_CONFIG_FILE_NAME} changed during migration; the stale ${CONFIG_FILE_NAME} copy was removed and the legacy settings were used for this session.`
				: `${LEGACY_CONFIG_FILE_NAME} changed during migration, but ${CONFIG_FILE_NAME} was replaced concurrently and takes precedence.`,
		);
		return removed ? legacyPath : canonicalPath;
	}

	legacyPresenceNoticed.add(canonicalPath);
	recordConfigMigrationNotice(
		canonicalPath,
		`pi-sync settings migrated from ${LEGACY_CONFIG_FILE_NAME} to ${CONFIG_FILE_NAME}; the private legacy file was retained as a recovery copy and can be deleted after verification.`,
	);
	return canonicalPath;
}

async function secureIgnoredLegacyIfPresent(filePath: string) {
	let pathStat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		pathStat = await fs.lstat(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing" as const;
		return "unsafe" as const;
	}
	if (pathStat.isSymbolicLink() || !pathStat.isFile()) return "unsafe" as const;

	let handle: fs.FileHandle | undefined;
	try {
		handle = await fs.open(filePath, "r");
		const openedStat = await handle.stat();
		if (openedStat.dev !== pathStat.dev || openedStat.ino !== pathStat.ino) {
			return "unsafe" as const;
		}
		if (process.platform !== "win32" && (openedStat.mode & 0o777) !== 0o600) {
			await handle.chmod(0o600);
		}
		return "private" as const;
	} catch {
		return "unsafe" as const;
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

async function readConfigSnapshotIfExists(filePath: string): Promise<ConfigSnapshot | undefined> {
	let pathStat: Awaited<ReturnType<typeof fs.lstat>>;
	try {
		pathStat = await fs.lstat(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	if (pathStat.isSymbolicLink()) {
		throw new Error(`Refusing to read symlinked pi-sync config: ${filePath}`);
	}
	if (!pathStat.isFile()) throw new Error(`pi-sync config is not a regular file: ${filePath}`);

	const handle = await fs.open(filePath, "r");
	try {
		const openedStat = await handle.stat();
		if (openedStat.dev !== pathStat.dev || openedStat.ino !== pathStat.ino) {
			throw new Error(`pi-sync config changed while opening: ${filePath}`);
		}
		if (process.platform !== "win32" && (openedStat.mode & 0o777) !== 0o600) {
			await handle.chmod(0o600);
		}
		const bytes = await handle.readFile();
		return {
			bytes,
			identity: { dev: openedStat.dev, ino: openedStat.ino },
			parsed: parseConfigObject(bytes, filePath),
		};
	} finally {
		await handle.close();
	}
}

function parseConfigObject(bytes: Buffer, filePath: string) {
	let parsed: unknown;
	try {
		parsed = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new SyntaxError(`Invalid JSON in pi-sync config: ${filePath}`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`pi-sync config must contain a JSON object: ${filePath}`);
	}
	return parsed as Record<string, unknown>;
}

async function installPrivateConfigExclusively(filePath: string, bytes: Buffer) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	const temporaryPath = path.join(
		path.dirname(filePath),
		`.${path.basename(filePath)}.${process.pid}.${randomUUID()}.migrate`,
	);
	let handle: fs.FileHandle | undefined;
	try {
		handle = await fs.open(temporaryPath, "wx", 0o600);
		await handle.writeFile(bytes);
		if (process.platform !== "win32") await handle.chmod(0o600);
		await handle.sync();
		await handle.close();
		handle = undefined;
		const identity = await fs.lstat(temporaryPath);
		await fs.link(temporaryPath, filePath);
		await syncParentDirectory(filePath).catch(() => undefined);
		return { dev: identity.dev, ino: identity.ino };
	} finally {
		await handle?.close().catch(() => undefined);
		await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

async function configSnapshotStillMatches(filePath: string, snapshot: ConfigSnapshot) {
	return fileIdentityAndContentsMatch(filePath, snapshot.identity, snapshot.bytes);
}

export async function quarantineAndRemoveConfigIfMatches(
	filePath: string,
	identity: FileIdentity,
	expectedBytes: Buffer,
) {
	const quarantinePath = path.join(
		path.dirname(filePath),
		`.${path.basename(filePath)}.${randomUUID()}.migration-retired`,
	);
	try {
		await fs.rename(filePath, quarantinePath);
	} catch {
		return false;
	}
	try {
		await syncParentDirectory(filePath);
	} catch {
		await restoreQuarantinedConfig(filePath, quarantinePath);
		return false;
	}

	const matches = await fileIdentityAndContentsMatch(quarantinePath, identity, expectedBytes);
	if (!matches) {
		await restoreQuarantinedConfig(filePath, quarantinePath);
		return false;
	}
	if (await pathExists(filePath)) {
		await fs.rm(quarantinePath, { force: true });
		await syncParentDirectory(filePath);
		return false;
	}
	await fs.rm(quarantinePath);
	await syncParentDirectory(filePath);
	return true;
}

async function fileIdentityAndContentsMatch(
	filePath: string,
	identity: FileIdentity,
	expectedBytes: Buffer,
) {
	try {
		const current = await fs.lstat(filePath);
		if (current.isSymbolicLink()) return false;
		if (current.dev !== identity.dev || current.ino !== identity.ino) return false;
		return (await fs.readFile(filePath)).equals(expectedBytes);
	} catch {
		return false;
	}
}

async function restoreQuarantinedConfig(filePath: string, quarantinePath: string) {
	try {
		await fs.link(quarantinePath, filePath);
		await fs.rm(quarantinePath);
		await syncParentDirectory(filePath);
		return;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") return;
	}
	try {
		const [current, quarantined] = await Promise.all([
			fs.readFile(filePath),
			fs.readFile(quarantinePath),
		]);
		if (current.equals(quarantined)) await fs.rm(quarantinePath);
		else if (process.platform !== "win32") await fs.chmod(quarantinePath, 0o600);
		await syncParentDirectory(filePath);
	} catch {
		// Preserve the quarantine rather than risk deleting settings that changed concurrently.
	}
}

async function syncParentDirectory(filePath: string) {
	if (process.platform === "win32") return;
	let handle: fs.FileHandle | undefined;
	try {
		handle = await fs.open(path.dirname(filePath), "r");
		await handle.sync();
	} finally {
		await handle?.close().catch(() => undefined);
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

function recordConfigMigrationNotice(configPath: string, notice: string) {
	if (!configMigrationNotices.has(configPath)) configMigrationNotices.set(configPath, notice);
}
