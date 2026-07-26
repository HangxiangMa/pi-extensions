import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	type ExtensionCommandContext,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import {
	activeLocalConfigPath,
	consumeLocalConfigMigrationNotice,
	legacyLocalConfigPath,
	localConfigPath,
	quarantineAndRemoveConfigIfMatches,
	readMigratingLocalConfigDocument,
	replaceLocalConfigDocument,
	withLocalConfigFileLock,
} from "./config-file.js";
import { safeName } from "./paths.js";
import { DEFAULT_SYNC_FILES, normalizeExtraFiles, normalizeSyncFiles } from "./sync-policy.js";
import type {
	PartialConfig,
	Snapshot,
	SyncConfig,
	SyncState,
	TargetSwitchAction,
} from "./types.js";

export { extraFilePathsByLower, normalizeExtraFiles, normalizeSyncFiles } from "./sync-policy.js";

const VERSION = 1;
const DEFAULT_PROFILE = "default";
const DEFAULT_PREFIX = "pi-sync";
const DEFAULT_REGION = "auto";
export const DEFAULT_TARGET_SWITCH_ACTION: TargetSwitchAction = "ask";

export {
	activeLocalConfigPath,
	consumeLocalConfigMigrationNotice,
	legacyLocalConfigPath,
	localConfigPath,
	quarantineAndRemoveConfigIfMatches,
	replaceLocalConfigDocument,
};

export const DEPRECATED_PI_SYNC_ENV_NAMES = [
	"PI_SYNC_ENDPOINT",
	"PI_SYNC_BUCKET",
	"PI_SYNC_REGION",
	"PI_SYNC_ACCESS_KEY_ID",
	"PI_SYNC_SECRET_ACCESS_KEY",
	"PI_SYNC_SESSION_TOKEN",
	"PI_SYNC_PROFILE",
	"PI_SYNC_PREFIX",
	"PI_SYNC_AUTO_SYNC",
	"PI_SYNC_SESSIONS",
] as const;

function trimSlashes(value: string) {
	return value.replace(/^\/+|\/+$/g, "");
}

function decodeBase64Strict(value: string, filePath: string) {
	if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
		throw new Error(`Invalid base64 content in snapshot file: ${filePath}`);
	}
	return Buffer.from(value, "base64");
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

export async function loadConfigInternal(targetName?: string): Promise<SyncConfig> {
	const partial = await loadPartialConfig(targetName);
	const endpoint = normalizeConfiguredString(partial.endpoint);
	const bucket = normalizeConfiguredString(partial.bucket);
	const accessKeyId = normalizeConfiguredString(partial.accessKeyId);
	const secretAccessKey = normalizeConfiguredString(partial.secretAccessKey);
	const missing = [
		["endpoint", endpoint],
		["bucket", bucket],
		["accessKeyId", accessKeyId],
		["secretAccessKey", secretAccessKey],
	]
		.filter(([, value]) => !value)
		.map(([name]) => name);
	if (missing.length > 0) {
		throw new Error(
			`Missing pi-sync config: ${missing.join(", ")}. Use /sync setup or edit ${localConfigPath()}.`,
		);
	}
	if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
		throw new Error("Missing pi-sync config after validation.");
	}

	const namespace = normalizeOptionalString(partial.profile) ?? DEFAULT_PROFILE;
	const prefix = trimSlashes(normalizeOptionalString(partial.prefix) ?? DEFAULT_PREFIX);
	return {
		backend: {
			type: "s3",
			profile: {
				kind: partial.storageKind ?? (isCloudflareR2Endpoint(endpoint) ? "r2" : "s3-compatible"),
				endpoint,
				region: normalizeOptionalString(partial.region) ?? DEFAULT_REGION,
				accessKeyId,
				secretAccessKey,
				sessionToken: normalizeOptionalString(partial.sessionToken),
			},
			destination: { bucket, prefix, namespace },
		},
		profile: namespace,
		target: partial.target ?? DEFAULT_PROFILE,
		storageProfile: partial.storageProfile ?? DEFAULT_PROFILE,
		autoSync: isEnabled(partial.autoSync, true),
		settingsVersion: partial.settingsVersion ?? 1,
		syncFiles: normalizeSyncFiles(partial.syncFiles),
		syncSessions: isExplicitlyEnabled(partial.syncSessions),
		extraFiles: normalizeExtraFiles(partial.extraFiles),
	};
}

export async function loadConfig(targetName?: string): Promise<SyncConfig> {
	return loadConfigInternal(targetName);
}

export async function configuredTargetNames() {
	const settings = await readLocalConfigObject();
	if (!settings) return [];
	if (!isV2SettingsObject(settings)) return [];
	return Object.keys(requireNamedObjectMap(settings.targets, "targets")).sort((left, right) =>
		left.localeCompare(right),
	);
}

export async function loadPartialConfig(targetName?: string): Promise<PartialConfig> {
	const fileConfig = (await readLocalConfigObject()) ?? {};
	if (isV2SettingsObject(fileConfig)) return resolveV2PartialConfig(fileConfig, targetName);
	if (targetName !== undefined) {
		throw new Error("--target requires version 2 pi-sync settings with named targets.");
	}
	return resolveLegacyPartialConfig(fileConfig as PartialConfig);
}

export async function loadTargetSwitchAction(): Promise<TargetSwitchAction> {
	const settings = await readLocalConfigObject();
	if (!settings || !isV2SettingsObject(settings)) return DEFAULT_TARGET_SWITCH_ACTION;
	return normalizeTargetSwitchAction(settings.targetSwitchAction);
}

export function normalizeTargetSwitchAction(value: unknown): TargetSwitchAction {
	if (value === undefined) return DEFAULT_TARGET_SWITCH_ACTION;
	if (value === "ask" || value === "pull" || value === "switch-only") return value;
	throw new Error(
		'Invalid pi-sync settings: targetSwitchAction must be "ask", "pull", or "switch-only".',
	);
}

export function deprecatedPiSyncEnvironmentNames() {
	return DEPRECATED_PI_SYNC_ENV_NAMES.filter((name) => hasEnv(name));
}

export function deprecatedPiSyncEnvironmentWarnings() {
	const names = deprecatedPiSyncEnvironmentNames();
	if (names.length === 0) return [];
	return [
		`deprecated environment: ${names.join(", ")} still override pi-sync settings but will be removed in a future major version. Move them to ${localConfigPath()}; values are not shown.`,
	];
}

export function resolveLegacyPartialConfig(fileConfig: PartialConfig): PartialConfig {
	return {
		...fileConfig,
		target: DEFAULT_PROFILE,
		storageProfile: DEFAULT_PROFILE,
		settingsVersion: 1,
		endpoint: process.env.PI_SYNC_ENDPOINT ?? process.env.R2_ENDPOINT ?? fileConfig.endpoint,
		bucket: process.env.PI_SYNC_BUCKET ?? process.env.R2_BUCKET ?? fileConfig.bucket,
		region: process.env.PI_SYNC_REGION ?? process.env.AWS_REGION ?? fileConfig.region,
		accessKeyId:
			process.env.PI_SYNC_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? fileConfig.accessKeyId,
		secretAccessKey:
			process.env.PI_SYNC_SECRET_ACCESS_KEY ??
			process.env.AWS_SECRET_ACCESS_KEY ??
			fileConfig.secretAccessKey,
		sessionToken: selectSessionToken(fileConfig.sessionToken),
		profile: process.env.PI_SYNC_PROFILE ?? fileConfig.profile,
		prefix: process.env.PI_SYNC_PREFIX ?? fileConfig.prefix,
		autoSync: process.env.PI_SYNC_AUTO_SYNC ?? fileConfig.autoSync,
		syncSessions: process.env.PI_SYNC_SESSIONS ?? fileConfig.syncSessions,
	};
}

export function resolveV2PartialConfig(
	settings: Record<string, unknown>,
	targetName?: string,
): PartialConfig {
	normalizeTargetSwitchAction(settings.targetSwitchAction);
	const targets = requireNamedObjectMap(settings.targets, "targets");
	const profiles = requireNamedObjectMap(settings.profiles, "profiles");
	validateUniqueRemoteTargets(targets, profiles);
	const selectedTarget =
		targetName ?? normalizeOptionalString(asOptionalString(settings.activeTarget));
	if (!selectedTarget) throw new Error("Invalid pi-sync settings: activeTarget is required.");
	validateConfigName(selectedTarget, "target");
	const target = ownObject(targets, selectedTarget);
	if (!target)
		throw new Error(`Invalid pi-sync settings: target "${selectedTarget}" was not found.`);
	const storageProfile = normalizeOptionalString(asOptionalString(target.profile));
	if (!storageProfile) {
		throw new Error(`Invalid pi-sync settings: target "${selectedTarget}" is missing profile.`);
	}
	validateConfigName(storageProfile, "storage profile");
	const profile = ownObject(profiles, storageProfile);
	if (!profile) {
		throw new Error(
			`Invalid pi-sync settings: target "${selectedTarget}" references missing profile "${storageProfile}".`,
		);
	}
	const kind = asOptionalString(profile.kind);
	if (kind !== undefined && kind !== "r2" && kind !== "s3-compatible") {
		throw new Error(
			`Invalid pi-sync settings: profile "${storageProfile}" has unsupported kind "${kind}".`,
		);
	}
	return {
		target: selectedTarget,
		storageProfile,
		storageKind: kind,
		settingsVersion: 2,
		endpoint:
			process.env.PI_SYNC_ENDPOINT ?? process.env.R2_ENDPOINT ?? asOptionalString(profile.endpoint),
		bucket: process.env.PI_SYNC_BUCKET ?? process.env.R2_BUCKET ?? asOptionalString(target.bucket),
		region:
			process.env.PI_SYNC_REGION ?? process.env.AWS_REGION ?? asOptionalString(profile.region),
		accessKeyId:
			process.env.PI_SYNC_ACCESS_KEY_ID ??
			process.env.AWS_ACCESS_KEY_ID ??
			asOptionalString(profile.accessKeyId),
		secretAccessKey:
			process.env.PI_SYNC_SECRET_ACCESS_KEY ??
			process.env.AWS_SECRET_ACCESS_KEY ??
			asOptionalString(profile.secretAccessKey),
		sessionToken: selectSessionToken(asOptionalString(profile.sessionToken)),
		profile: process.env.PI_SYNC_PROFILE ?? asOptionalString(target.namespace) ?? selectedTarget,
		prefix: process.env.PI_SYNC_PREFIX ?? asOptionalString(target.prefix),
		autoSync: process.env.PI_SYNC_AUTO_SYNC ?? asOptionalBoolean(target.autoSync),
		syncFiles: target.syncFiles,
		syncSessions: process.env.PI_SYNC_SESSIONS ?? asOptionalBoolean(target.syncSessions),
		extraFiles: target.extraFiles,
	};
}

function isV2SettingsObject(value: Record<string, unknown>) {
	const hasV2Fields =
		Object.hasOwn(value, "profiles") ||
		Object.hasOwn(value, "targets") ||
		Object.hasOwn(value, "activeTarget");
	if (!hasV2Fields) return false;
	if (value.version !== 2) {
		throw new Error("Invalid pi-sync settings: version must be 2 for profiles and targets.");
	}
	return true;
}

export function validateUniqueRemoteTargets(
	targets: Record<string, unknown>,
	profiles: Record<string, unknown>,
) {
	const identities = new Map<string, string>();
	for (const name of Object.keys(targets)) {
		const target = ownObject(targets, name);
		if (!target || typeof target.profile !== "string" || typeof target.bucket !== "string")
			continue;
		const identity = effectiveTargetRemoteIdentity(target, name, profiles);
		const existing = identities.get(identity);
		if (existing) {
			throw new Error(
				`Invalid pi-sync settings: targets "${existing}" and "${name}" use the same remote destination.`,
			);
		}
		identities.set(identity, name);
	}
}

export function effectiveTargetRemoteIdentity(
	target: Record<string, unknown>,
	name: string,
	profiles: Record<string, unknown>,
) {
	const profileName = typeof target.profile === "string" ? target.profile.trim() : "";
	const profile = ownObject(profiles, profileName);
	const endpoint = normalizeEndpointIdentity(
		process.env.PI_SYNC_ENDPOINT ??
			process.env.R2_ENDPOINT ??
			(typeof profile?.endpoint === "string" ? profile.endpoint : ""),
	);
	const bucket = normalizeRemoteKeySegment(
		process.env.PI_SYNC_BUCKET ??
			process.env.R2_BUCKET ??
			(typeof target.bucket === "string" ? target.bucket : ""),
	);
	const prefix = normalizeRemoteKeySegment(
		process.env.PI_SYNC_PREFIX ??
			(typeof target.prefix === "string" ? target.prefix : DEFAULT_PREFIX),
	);
	const namespace = normalizeRemoteKeySegment(
		process.env.PI_SYNC_PROFILE ?? (typeof target.namespace === "string" ? target.namespace : name),
	);
	return JSON.stringify(["s3", endpoint, bucket, prefix, namespace]);
}

function normalizeRemoteKeySegment(value: string) {
	return trimSlashes(value.trim());
}

function requireNamedObjectMap(value: unknown, field: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid pi-sync settings: ${field} must be an object.`);
	}
	for (const name of Object.keys(value)) validateConfigName(name, field.slice(0, -1));
	return value as Record<string, unknown>;
}

function ownObject(
	value: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined {
	if (!Object.hasOwn(value, key)) return undefined;
	const item = value[key];
	return item && typeof item === "object" && !Array.isArray(item)
		? (item as Record<string, unknown>)
		: undefined;
}

function validateConfigName(value: string, field: string) {
	if (
		!value.trim() ||
		value.length > 100 ||
		value === "__proto__" ||
		value === "prototype" ||
		value === "constructor" ||
		// biome-ignore lint/suspicious/noControlCharactersInRegex: Config identifiers cannot render terminal controls.
		/[\u0000-\u001f\u007f-\u009f]/u.test(value)
	) {
		throw new Error(`Invalid pi-sync settings: invalid ${field} name.`);
	}
}

function asOptionalString(value: unknown) {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new Error("Invalid pi-sync settings: expected a string.");
	return value;
}

function asOptionalBoolean(value: unknown) {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") throw new Error("Invalid pi-sync settings: expected a boolean.");
	return value;
}

export async function configuredSessionDir() {
	const envSessionDir = normalizeOptionalString(process.env.PI_CODING_AGENT_SESSION_DIR);
	if (envSessionDir) return expandHome(envSessionDir);
	const settings = await readJsonIfExists<{ sessionDir?: string }>(
		path.join(agentDir(), "settings.json"),
	);
	return settings?.sessionDir ? expandHome(settings.sessionDir) : undefined;
}

export async function sessionDirForApply(
	ctx: ExtensionCommandContext | ExtensionContext,
	snapshot: Snapshot,
) {
	const contextSessionDir = sessionDirFromContext(ctx);
	const envSessionDir = normalizeOptionalString(process.env.PI_CODING_AGENT_SESSION_DIR);
	if (envSessionDir) return contextSessionDir ?? expandHome(envSessionDir);

	const localSessionDir = await configuredSessionDir();
	if (
		contextSessionDir &&
		path.resolve(contextSessionDir) !== path.resolve(localSessionDir ?? "")
	) {
		return contextSessionDir;
	}
	return sessionDirFromSnapshot(snapshot) ?? contextSessionDir;
}

function sessionDirFromSnapshot(snapshot: Snapshot) {
	const settingsFile = snapshot.files.find((file) => file.path === "settings.json");
	if (!settingsFile) return undefined;
	try {
		const settings = JSON.parse(
			decodeBase64Strict(settingsFile.contentBase64, settingsFile.path).toString("utf8"),
		) as { sessionDir?: string };
		return settings.sessionDir ? expandHome(settings.sessionDir) : undefined;
	} catch {
		return undefined;
	}
}

export async function readState(profile: string): Promise<SyncState> {
	return (
		(await readJsonIfExists<SyncState>(statePath(profile))) ?? {
			version: VERSION,
			profile,
			lastFileHashes: {},
		}
	);
}

export async function writeState(profile: string, state: SyncState) {
	await writeJson(statePath(profile), state);
}

export async function readStateForConfig(config: SyncConfig): Promise<SyncState> {
	if (config.settingsVersion !== 2) return readState(config.profile);
	const destination = statePathForConfig(config);
	const state = await readJsonIfExists<SyncState>(destination);
	if (state) return state;
	return (
		(await migrateLegacyV2State(config, destination)) ?? {
			version: VERSION,
			profile: config.profile,
			lastFileHashes: {},
		}
	);
}

export async function writeStateForConfig(config: SyncConfig, state: SyncState) {
	await writeJson(statePathForConfig(config), state);
}

export function statePathForConfig(config: SyncConfig) {
	if (config.settingsVersion !== 2) return statePath(config.profile);
	const target = config.target ?? DEFAULT_PROFILE;
	const identity = JSON.stringify([
		target,
		normalizeEndpointIdentity(config.backend.profile.endpoint),
		normalizeRemoteKeySegment(config.backend.destination.bucket),
		normalizeRemoteKeySegment(config.backend.destination.prefix),
		normalizeRemoteKeySegment(config.profile),
	]);
	const hash = createHash("sha256").update(identity).digest("hex").slice(0, 10);
	return path.join(stateDir(), "targets", `${safeName(target)}-${hash}.state.json`);
}

export function statePathForPartialConfig(partial: PartialConfig) {
	const profile = normalizeOptionalString(partial.profile) ?? DEFAULT_PROFILE;
	if (partial.settingsVersion !== 2) return statePath(profile);
	return statePathForConfig({
		settingsVersion: 2,
		target: partial.target ?? DEFAULT_PROFILE,
		profile,
		backend: {
			type: "s3",
			profile: {
				endpoint: normalizeConfiguredString(partial.endpoint) ?? "",
			},
			destination: {
				bucket: normalizeConfiguredString(partial.bucket) ?? "",
				prefix: trimSlashes(normalizeOptionalString(partial.prefix) ?? DEFAULT_PREFIX),
				namespace: profile,
			},
		},
	} as SyncConfig);
}

async function migrateLegacyV2State(config: SyncConfig, destination: string) {
	const target = config.target ?? DEFAULT_PROFILE;
	const legacyHash = createHash("sha256").update(target).digest("hex").slice(0, 10);
	const legacyPath = path.join(
		stateDir(),
		"targets",
		`${safeName(target)}-${legacyHash}.state.json`,
	);
	const claimPath = `${legacyPath}.migrating-to-${path.basename(destination)}`;
	if (!(await pathExists(claimPath))) {
		try {
			await fs.rename(legacyPath, claimPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	if (!(await pathExists(claimPath))) return readJsonIfExists<SyncState>(destination);

	await fs.mkdir(path.dirname(destination), { recursive: true });
	try {
		await fs.link(claimPath, destination);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	const migrated = await readJsonIfExists<SyncState>(destination);
	if (migrated) await fs.rm(claimPath, { force: true });
	return migrated;
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

function normalizeEndpointIdentity(endpoint: string) {
	const normalized = endpoint.trim();
	try {
		return new URL(normalized).toString();
	} catch {
		return normalized;
	}
}

export function agentDir() {
	return getAgentDir();
}

function expandHome(value: string) {
	return value === "~" || value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

export function stateDir() {
	return path.join(agentDir(), ".pisync");
}

export function localConfigTemplate(): Record<string, unknown> {
	return {
		version: 2,
		activeTarget: DEFAULT_PROFILE,
		targetSwitchAction: DEFAULT_TARGET_SWITCH_ACTION,
		profiles: {
			[DEFAULT_PROFILE]: {
				kind: "r2",
				endpoint: "https://<account-id>.r2.cloudflarestorage.com",
				region: DEFAULT_REGION,
				accessKeyId: "<access-key-id>",
				secretAccessKey: "<secret-access-key>",
			},
		},
		targets: {
			[DEFAULT_PROFILE]: {
				profile: DEFAULT_PROFILE,
				bucket: "pi-sync",
				namespace: DEFAULT_PROFILE,
				prefix: DEFAULT_PREFIX,
				autoSync: true,
				syncFiles: [...DEFAULT_SYNC_FILES],
				syncSessions: false,
				extraFiles: [],
			},
		},
	};
}

export async function readLocalConfigDocument() {
	return readMigratingLocalConfigDocument(validateConfigDocumentForMigration);
}

export async function readLocalConfigObject(): Promise<Record<string, unknown> | undefined> {
	return (await readLocalConfigDocument())?.parsed;
}

function validateConfigDocumentForMigration(settings: Record<string, unknown>) {
	if (!isV2SettingsObject(settings)) {
		for (const field of [
			"endpoint",
			"bucket",
			"region",
			"accessKeyId",
			"secretAccessKey",
			"sessionToken",
			"profile",
			"prefix",
		] as const) {
			asOptionalString(settings[field]);
		}
		for (const field of ["autoSync", "syncSessions"] as const) {
			const value = settings[field];
			if (value !== undefined && typeof value !== "boolean" && typeof value !== "string") {
				throw new Error(`Invalid pi-sync settings: ${field} must be a boolean or string.`);
			}
		}
		normalizeSyncFiles(settings.syncFiles);
		normalizeExtraFiles(settings.extraFiles);
		return;
	}

	normalizeTargetSwitchAction(settings.targetSwitchAction);
	const profiles = requireNamedObjectMap(settings.profiles, "profiles");
	const targets = requireNamedObjectMap(settings.targets, "targets");
	validateUniqueRemoteTargets(targets, profiles);
	for (const [name, value] of Object.entries(profiles)) {
		const profile = ownObject(profiles, name);
		if (!profile || value !== profile) {
			throw new Error(`Invalid pi-sync settings: storage profile "${name}" must be an object.`);
		}
		const kind = asOptionalString(profile.kind);
		if (kind !== undefined && kind !== "r2" && kind !== "s3-compatible") {
			throw new Error(
				`Invalid pi-sync settings: profile "${name}" has unsupported kind "${kind}".`,
			);
		}
		for (const field of [
			"endpoint",
			"region",
			"accessKeyId",
			"secretAccessKey",
			"sessionToken",
		] as const) {
			asOptionalString(profile[field]);
		}
	}
	for (const [name, value] of Object.entries(targets)) {
		const target = ownObject(targets, name);
		if (!target || value !== target) {
			throw new Error(`Invalid pi-sync settings: target "${name}" must be an object.`);
		}
		const profileName = normalizeOptionalString(asOptionalString(target.profile));
		if (!profileName || !Object.hasOwn(profiles, profileName)) {
			throw new Error(`Invalid pi-sync settings: target "${name}" references a missing profile.`);
		}
		for (const field of ["bucket", "prefix", "namespace"] as const) {
			asOptionalString(target[field]);
		}
		asOptionalBoolean(target.autoSync);
		asOptionalBoolean(target.syncSessions);
		normalizeSyncFiles(target.syncFiles);
		normalizeExtraFiles(target.extraFiles);
	}
	const activeTarget = normalizeOptionalString(asOptionalString(settings.activeTarget));
	if (Object.keys(targets).length === 0) {
		if (activeTarget) {
			throw new Error("Invalid pi-sync settings: targetless settings cannot have activeTarget.");
		}
		return;
	}
	if (!activeTarget || !Object.hasOwn(targets, activeTarget)) {
		throw new Error("Invalid pi-sync settings: activeTarget must reference an existing target.");
	}
}

let configUpdateQueue: Promise<void> = Promise.resolve();

export function updateLocalConfig(
	update: (current: Record<string, unknown>) => Record<string, unknown>,
) {
	const operation = configUpdateQueue.then(() => performLocalConfigUpdate(update));
	configUpdateQueue = operation.then(
		() => undefined,
		() => undefined,
	);
	return operation;
}

async function performLocalConfigUpdate(
	update: (current: Record<string, unknown>) => Record<string, unknown>,
) {
	const current = (await readLocalConfigObject()) ?? localConfigTemplate();
	const next = update({ ...current });
	await writeLocalConfigObject(next);
	return next;
}

export function writeLocalConfigObject(value: Record<string, unknown>) {
	return withLocalConfigFileLock(() => writeLocalConfigObjectUnlocked(value));
}

async function writeLocalConfigObjectUnlocked(value: Record<string, unknown>) {
	const configPath = localConfigPath();
	await fs.mkdir(path.dirname(configPath), { recursive: true });
	try {
		const stat = await fs.lstat(configPath);
		if (stat.isSymbolicLink())
			throw new Error(`Refusing to overwrite symlinked pi-sync config: ${configPath}`);
		if (!stat.isFile()) throw new Error(`pi-sync config is not a regular file: ${configPath}`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	const temporaryPath = path.join(
		path.dirname(configPath),
		`.${path.basename(configPath)}.${process.pid}.${randomUUID()}.tmp`,
	);
	let handle: fs.FileHandle | undefined;
	try {
		handle = await fs.open(temporaryPath, "wx", 0o600);
		await handle.writeFile(`${JSON.stringify(value, null, "\t")}\n`, "utf8");
		if (process.platform !== "win32") await handle.chmod(0o600);
		await handle.sync();
		await handle.close();
		handle = undefined;
		await fs.rename(temporaryPath, configPath);
	} catch (error) {
		await handle?.close().catch(() => undefined);
		await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

function statePath(profile: string) {
	return path.join(stateDir(), `${safeName(profile)}.state.json`);
}

export function lockPath() {
	return path.join(stateDir(), "lock");
}

export async function ensureStateDir() {
	await fs.mkdir(stateDir(), { recursive: true });
}

async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

export async function writeJson(filePath: string, value: unknown) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(value, null, "\t")}\n`);
}

function selectSessionToken(fileSessionToken: string | undefined) {
	if (hasEnv("PI_SYNC_SESSION_TOKEN"))
		return normalizeOptionalString(process.env.PI_SYNC_SESSION_TOKEN);
	return (
		normalizeOptionalString(process.env.AWS_SESSION_TOKEN) ??
		normalizeOptionalString(fileSessionToken)
	);
}

export function sessionTokenWarnings(config: { endpoint?: string; sessionToken?: string }) {
	if (!isCloudflareR2Endpoint(config.endpoint) || !config.sessionToken) return [];
	return [
		"session token: configured for Cloudflare R2; if R2 rejects X-Amz-Security-Token, pi-sync retries once without it. R2 static access keys usually do not need a session token.",
	];
}

export function syncSessionsWarnings(config: { syncSessions?: boolean }) {
	if (!config.syncSessions) return [];
	return [
		"sessions: enabled; Pi session JSONL can contain prompts, tool output, file paths, images, and secrets. Sync sessions only to storage you trust.",
	];
}

export function isCloudflareR2Endpoint(endpoint: string | undefined) {
	const value = endpoint?.trim();
	if (!value) return false;
	try {
		const hostname = new URL(value).hostname.toLowerCase();
		return (
			hostname === "r2.cloudflarestorage.com" || hostname.endsWith(".r2.cloudflarestorage.com")
		);
	} catch {
		return false;
	}
}

function normalizeOptionalString(value: string | undefined) {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

function normalizeConfiguredString(value: string | undefined) {
	const normalized = normalizeOptionalString(value);
	return normalized && !/^<[^>]+>$/u.test(normalized) && !normalized.includes("<account-id>")
		? normalized
		: undefined;
}

function hasEnv(name: string) {
	return Object.hasOwn(process.env, name);
}

export function isEnabled(value: boolean | string | undefined, defaultValue: boolean) {
	if (value === undefined) return defaultValue;
	if (typeof value === "boolean") return value;
	return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

export function isExplicitlyEnabled(value: boolean | string | undefined) {
	if (typeof value === "boolean") return value;
	return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isMissingConfigError(error: unknown) {
	return error instanceof Error && error.message.startsWith("Missing pi-sync config:");
}
