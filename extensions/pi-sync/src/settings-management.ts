import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	effectiveTargetRemoteIdentity,
	localConfigPath,
	readLocalConfigObject,
	resolveLegacyPartialConfig,
	resolveV2PartialConfig,
	stateDir,
	statePathForPartialConfig,
	writeLocalConfigObject,
} from "./config.js";
import { withLock } from "./lock.js";
import type { PartialConfig, StorageProfileSettings, SyncTargetSettings } from "./types.js";

const LEGACY_FIELDS = new Set([
	"endpoint",
	"bucket",
	"region",
	"accessKeyId",
	"secretAccessKey",
	"sessionToken",
	"profile",
	"prefix",
	"autoSync",
	"syncFiles",
	"syncSessions",
	"extraFiles",
]);

export interface MigrationResult {
	settings: Record<string, unknown>;
	backupPath: string;
}

export async function migrateLegacySettings(
	targetName: string,
	storageProfileName: string,
): Promise<MigrationResult> {
	validateName(targetName, "target");
	validateName(storageProfileName, "storage profile");
	return withLock("settings-migration", async () => {
		const configPath = localConfigPath();
		const originalBytes = await fs.readFile(configPath);
		const current = await readLocalConfigObject();
		if (!current) throw new Error("No legacy pi-sync settings are available to migrate.");
		if (current.version === 2) {
			throw new Error("pi-sync settings already use profiles and targets.");
		}
		const next = legacySettingsAsV2(current, targetName, storageProfileName);
		const backupPath = await writeMigrationBackup(originalBytes);
		await adoptLegacyState(current, next, targetName);
		const latestBytes = await fs.readFile(configPath);
		if (!latestBytes.equals(originalBytes)) {
			throw new Error("pi-sync settings changed during migration; no settings were replaced.");
		}
		await writeLocalConfigObject(next);
		return { settings: next, backupPath };
	});
}

export function legacySettingsAsV2(
	legacy: Record<string, unknown>,
	targetName: string,
	storageProfileName: string,
) {
	validateName(targetName, "target");
	validateName(storageProfileName, "storage profile");
	const unknown = Object.fromEntries(
		Object.entries(legacy).filter(([key]) => !LEGACY_FIELDS.has(key) && key !== "version"),
	);
	const profile = compactObject({
		kind: inferKind(legacy.endpoint),
		endpoint: legacy.endpoint,
		region: legacy.region,
		accessKeyId: legacy.accessKeyId,
		secretAccessKey: legacy.secretAccessKey,
		sessionToken: legacy.sessionToken,
	});
	const target = compactObject({
		profile: storageProfileName,
		bucket: legacy.bucket,
		prefix: legacy.prefix,
		namespace: legacy.profile ?? targetName,
		autoSync: legacy.autoSync,
		syncFiles: legacy.syncFiles,
		syncSessions: legacy.syncSessions,
		extraFiles: legacy.extraFiles,
		legacyStateProfile: legacy.profile ?? "default",
	});
	return {
		...unknown,
		version: 2,
		activeTarget: targetName,
		profiles: { [storageProfileName]: profile },
		targets: { [targetName]: target },
	};
}

export async function saveNewV2Settings(input: {
	targetName: string;
	storageProfileName: string;
	profile: StorageProfileSettings;
	target: SyncTargetSettings;
}) {
	validateName(input.targetName, "target");
	validateName(input.storageProfileName, "storage profile");
	const current = (await readLocalConfigObject()) ?? {};
	if (Object.keys(current).length > 0)
		throw new Error(`Settings already exist: ${localConfigPath()}`);
	const settings = {
		version: 2,
		activeTarget: input.targetName,
		profiles: { [input.storageProfileName]: { ...input.profile } },
		targets: {
			[input.targetName]: { ...input.target, profile: input.storageProfileName },
		},
	};
	await writeLocalConfigObject(settings);
	return settings;
}

export async function addStorageProfile(name: string, profile: StorageProfileSettings) {
	validateName(name, "storage profile");
	await updateV2Settings((settings) => {
		const profiles = requireObject(settings.profiles, "profiles");
		if (Object.hasOwn(profiles, name)) throw new Error(`Storage profile already exists: ${name}`);
		return { ...settings, profiles: { ...profiles, [name]: { ...profile } } };
	});
}

export async function updateStorageProfile(
	name: string,
	update: (profile: Record<string, unknown>) => Record<string, unknown>,
) {
	validateName(name, "storage profile");
	await updateV2Settings((settings) => {
		const profiles = requireObject(settings.profiles, "profiles");
		const profile = requireObject(profiles[name], "storage profile");
		return { ...settings, profiles: { ...profiles, [name]: update(profile) } };
	});
}

export async function addSyncTarget(name: string, target: SyncTargetSettings) {
	validateName(name, "target");
	await updateV2Settings((settings) => {
		const targets = requireObject(settings.targets, "targets");
		const profiles = requireObject(settings.profiles, "profiles");
		if (Object.hasOwn(targets, name)) throw new Error(`Sync target already exists: ${name}`);
		if (!target.profile || !Object.hasOwn(profiles, target.profile)) {
			throw new Error(`Storage profile not found: ${target.profile ?? "missing"}`);
		}
		assertUniqueRemoteIdentity(targets, name, target);
		return { ...settings, targets: { ...targets, [name]: { ...target } } };
	});
}

export async function updateSyncTarget(
	name: string,
	update: (target: Record<string, unknown>) => Record<string, unknown>,
) {
	validateName(name, "target");
	await updateV2Settings((settings) => {
		const targets = requireObject(settings.targets, "targets");
		const target = requireObject(targets[name], "target");
		const nextTarget = update(target);
		assertUniqueRemoteIdentity(targets, name, nextTarget);
		return { ...settings, targets: { ...targets, [name]: nextTarget } };
	});
}

export async function removeSyncTarget(name: string) {
	validateName(name, "target");
	await updateV2Settings((settings) => {
		const targets = requireObject(settings.targets, "targets");
		if (!Object.hasOwn(targets, name)) throw new Error(`Sync target not found: ${name}`);
		if (settings.activeTarget === name && Object.keys(targets).length > 1) {
			throw new Error("Switch to another target before removing the current target.");
		}
		const nextTargets = { ...targets };
		delete nextTargets[name];
		return {
			...settings,
			targets: nextTargets,
			activeTarget:
				settings.activeTarget === name ? Object.keys(nextTargets)[0] : settings.activeTarget,
		};
	});
}

export async function removeStorageProfile(name: string) {
	validateName(name, "storage profile");
	await updateV2Settings((settings) => {
		const profiles = requireObject(settings.profiles, "profiles");
		const targets = requireObject(settings.targets, "targets");
		const referenced = Object.entries(targets).find(
			([, target]) => requireObject(target, "target").profile === name,
		)?.[0];
		if (referenced) throw new Error(`Storage profile “${name}” is used by target “${referenced}”.`);
		if (!Object.hasOwn(profiles, name)) throw new Error(`Storage profile not found: ${name}`);
		const nextProfiles = { ...profiles };
		delete nextProfiles[name];
		return { ...settings, profiles: nextProfiles };
	});
}

async function updateV2Settings(
	update: (settings: Record<string, unknown>) => Record<string, unknown>,
) {
	return withLock("settings", async () => {
		const current = await readLocalConfigObject();
		if (current?.version !== 2) {
			throw new Error("Profiles and targets require version 2 pi-sync settings.");
		}
		const next = update(current);
		await writeLocalConfigObject(next);
		return next;
	});
}

async function writeMigrationBackup(bytes: Buffer) {
	const directory = path.join(stateDir(), "backups", "config");
	await fs.mkdir(directory, { recursive: true });
	const backupPath = path.join(
		directory,
		`pi-sync.local.${new Date().toISOString().replace(/[:.]/gu, "-")}.${randomUUID().slice(0, 8)}.json`,
	);
	await fs.writeFile(backupPath, bytes, { flag: "wx", mode: 0o600 });
	if (process.platform !== "win32") await fs.chmod(backupPath, 0o600);
	return backupPath;
}

async function adoptLegacyState(
	legacy: Record<string, unknown>,
	next: Record<string, unknown>,
	targetName: string,
) {
	const legacyConfig = resolveLegacyPartialConfig(legacy as PartialConfig);
	const source = statePathForPartialConfig(legacyConfig);
	let bytes: Buffer;
	try {
		bytes = await fs.readFile(source);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	const destination = statePathForPartialConfig(resolveV2PartialConfig(next, targetName));
	await fs.mkdir(path.dirname(destination), { recursive: true });
	try {
		await fs.writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
}

function assertUniqueRemoteIdentity(
	targets: Record<string, unknown>,
	name: string,
	target: SyncTargetSettings,
) {
	const identity = effectiveTargetRemoteIdentity(target as Record<string, unknown>, name);
	for (const [otherName, value] of Object.entries(targets)) {
		if (
			otherName !== name &&
			effectiveTargetRemoteIdentity(requireObject(value, "target"), otherName) === identity
		) {
			throw new Error(`Target “${name}” duplicates the remote destination of “${otherName}”.`);
		}
	}
}

function compactObject(value: Record<string, unknown>) {
	return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function inferKind(endpoint: unknown) {
	return typeof endpoint === "string" && endpoint.includes(".r2.cloudflarestorage.com")
		? "r2"
		: "s3-compatible";
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid pi-sync settings: ${name} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function validateName(value: string, label: string) {
	if (
		!value.trim() ||
		value.length > 100 ||
		value === "__proto__" ||
		value === "prototype" ||
		value === "constructor" ||
		// biome-ignore lint/suspicious/noControlCharactersInRegex: Stored identifiers cannot contain controls.
		/[\u0000-\u001f\u007f-\u009f]/u.test(value)
	) {
		throw new Error(`Invalid ${label} name.`);
	}
}
