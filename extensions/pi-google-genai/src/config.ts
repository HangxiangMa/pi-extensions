import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent";

export const DEFAULT_MODEL = "gemini-3.5-flash";
export const DEFAULT_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_TIMEOUT_MS = 2_147_483_647;
export const GOOGLE_GENAI_TOOL_NAMES = [
	"google_search",
	"google_maps",
	"google_url_context",
] as const;
const CONFIG_FILE_NAME = "pi-google-genai.json";
const LEGACY_CONFIG_FILE_NAME = "google-genai.json";
export type GoogleGenaiToolName = (typeof GOOGLE_GENAI_TOOL_NAMES)[number];
export interface GoogleGenaiConfig {
	apiKey?: string;
	model: string;
	apiUrl: string;
	timeoutMs: number;
	tools: GoogleGenaiToolName[];
}
export interface LoadedGoogleGenaiConfig {
	config: GoogleGenaiConfig;
	path: string;
	warnings: string[];
	configLoaded: boolean;
}

export function googleGenaiConfigPath() {
	return join(getAgentDir(), CONFIG_FILE_NAME);
}

export function normalizeGoogleGenaiSettings(value: unknown): GoogleGenaiConfig {
	return normalizeConfigWithWarnings(value).config;
}

export async function loadGoogleGenaiConfig(): Promise<LoadedGoogleGenaiConfig> {
	await configSaveQueue;
	const path = googleGenaiConfigPath();
	const warnings: string[] = [];
	const readPath = await prepareGoogleGenaiConfigPath(path, warnings);
	await ensureConfigPermissions(readPath, warnings);
	const raw = await readJsonIfExists(readPath, warnings);
	const configLoaded = isObject(raw);
	if (raw !== undefined && !configLoaded) {
		warnings.push(`${basename(readPath)} must contain a JSON object; ignoring config.`);
	}
	const normalized = normalizeConfigWithWarnings(configLoaded ? raw : undefined);
	return {
		config: normalized.config,
		path,
		warnings: [...warnings, ...normalized.warnings],
		configLoaded,
	};
}

export async function resolveGoogleGenaiAuth(
	config: Pick<GoogleGenaiConfig, "apiKey">,
	ctx: Pick<ExtensionContext, "modelRegistry">,
) {
	if (config.apiKey) {
		if (isUnsupportedConfigApiKey(config.apiKey)) {
			throw new Error(
				`Interpolation and command syntax are not supported in ${CONFIG_FILE_NAME} apiKey. Use a literal key, /login google, or GEMINI_API_KEY.`,
			);
		}
		return config.apiKey;
	}

	const apiKey = await ctx.modelRegistry.getApiKeyForProvider("google");
	if (apiKey) return apiKey;

	throw new Error(
		`Missing Google GenAI API key. Run /google-genai init, run /login google, or set GEMINI_API_KEY. Config path: ${googleGenaiConfigPath()}`,
	);
}

export function isUnsupportedConfigApiKey(apiKey: string) {
	return apiKey.startsWith("$") || apiKey.startsWith("!");
}

export function assertSafeApiUrl(apiUrl: string) {
	let parsed: URL;
	try {
		parsed = new URL(apiUrl);
	} catch {
		throw new Error(`Google GenAI apiUrl must be a valid URL: ${apiUrl}`);
	}
	const localHttp =
		parsed.protocol === "http:" &&
		["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
	if (parsed.protocol !== "https:" && !localHttp) {
		throw new Error(
			`Google GenAI apiUrl must use https:// to protect the API key (http://localhost is allowed for local proxies): ${apiUrl}`,
		);
	}
}

function normalizeConfigWithWarnings(value: unknown): {
	config: GoogleGenaiConfig;
	warnings: string[];
} {
	const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
	const raw = input as Record<string, unknown>;
	const warnings: string[] = [];
	const tools = normalizeTools(raw.tools, warnings);
	const fileTimeoutMs = normalizeConfigTimeout(raw.timeoutMs, warnings);
	const config: GoogleGenaiConfig = {
		model: normalizeString(raw.model) ?? DEFAULT_MODEL,
		apiUrl: normalizeApiUrl(raw.apiUrl) ?? DEFAULT_API_URL,
		timeoutMs: fileTimeoutMs ?? DEFAULT_TIMEOUT_MS,
		tools,
	};
	const apiKey = normalizeString(raw.apiKey);
	if (apiKey) config.apiKey = apiKey;
	return { config, warnings };
}

function normalizeTools(value: unknown, warnings: string[]) {
	if (value === undefined) return [...GOOGLE_GENAI_TOOL_NAMES];
	if (!Array.isArray(value)) {
		warnings.push(`${CONFIG_FILE_NAME} tools must be an array; defaulting to all tools enabled.`);
		return [...GOOGLE_GENAI_TOOL_NAMES];
	}
	const selected: GoogleGenaiToolName[] = [];
	const unknown: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		if (isGoogleGenaiToolName(item)) {
			if (!selected.includes(item)) selected.push(item);
		} else {
			unknown.push(item);
		}
	}
	if (unknown.length > 0) {
		warnings.push(`Ignoring unknown Google GenAI tool name(s): ${unknown.join(", ")}.`);
	}
	return GOOGLE_GENAI_TOOL_NAMES.filter((toolName) => selected.includes(toolName));
}

function normalizeString(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeApiUrl(value: unknown) {
	const url = normalizeString(value);
	if (!url) return undefined;
	return url.replace(/\/+$/, "");
}

function normalizeConfigTimeout(value: unknown, warnings: string[]) {
	if (value === undefined) return undefined;
	if (isValidTimeoutMs(value)) return value;
	warnings.push(
		`${CONFIG_FILE_NAME} timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS} milliseconds; ignoring value.`,
	);
	return undefined;
}

function isValidTimeoutMs(value: unknown): value is number {
	return (
		typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_TIMEOUT_MS
	);
}

async function prepareGoogleGenaiConfigPath(canonicalPath: string, warnings: string[]) {
	const legacyPath = join(dirname(canonicalPath), LEGACY_CONFIG_FILE_NAME);
	if (await exists(canonicalPath)) {
		if (await exists(legacyPath)) {
			await ensureConfigPermissions(legacyPath, warnings);
			warnings.push(
				`${LEGACY_CONFIG_FILE_NAME} ignored because ${CONFIG_FILE_NAME} takes precedence.`,
			);
		}
		return canonicalPath;
	}
	if (!(await exists(legacyPath))) return canonicalPath;

	await ensureConfigPermissions(legacyPath, warnings);
	warnings.push(
		`Using legacy ${LEGACY_CONFIG_FILE_NAME}; rename it to ${CONFIG_FILE_NAME}. Future saves write ${CONFIG_FILE_NAME} without modifying the legacy file.`,
	);
	return legacyPath;
}

async function exists(path: string) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function readJsonIfExists(path: string, warnings: string[]) {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		warnings.push(
			`Failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
		return undefined;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		warnings.push(`Failed to parse ${path} as JSON; ignoring config until it is repaired.`);
		return undefined;
	}
}

let configSaveQueue = Promise.resolve();

export async function waitForGoogleGenaiConfigWrites(): Promise<void> {
	await configSaveQueue;
}

export async function writeGoogleGenaiConfig(config: GoogleGenaiConfig): Promise<void> {
	await updateGoogleGenaiConfig(cleanObject(config));
}

export function updateGoogleGenaiSetup(patch: {
	model: string;
	apiKey?: string;
}): Promise<GoogleGenaiConfig> {
	const model = normalizeString(patch.model);
	if (!model) throw new Error(`${CONFIG_FILE_NAME} model must be a non-empty string.`);
	const apiKey = patch.apiKey === undefined ? undefined : normalizeString(patch.apiKey);
	if (patch.apiKey !== undefined && (!apiKey || isUnsupportedConfigApiKey(apiKey))) {
		throw new Error(`${CONFIG_FILE_NAME} apiKey must be a non-empty literal string.`);
	}
	return updateGoogleGenaiConfig({ model, ...(apiKey ? { apiKey } : {}) });
}

function updateGoogleGenaiConfig(patch: object): Promise<GoogleGenaiConfig> {
	const operation = configSaveQueue.then(() => writeGoogleGenaiConfigNow(patch));
	configSaveQueue = operation.then(
		() => undefined,
		() => undefined,
	);
	return operation;
}

async function writeGoogleGenaiConfigNow(patch: object): Promise<GoogleGenaiConfig> {
	const path = googleGenaiConfigPath();
	const currentDocument = await readDocumentForUpdate(path);
	const nextDocument = { ...currentDocument, ...patch };
	await mkdir(dirname(path), { recursive: true });
	const tempFile = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(tempFile, `${JSON.stringify(nextDocument, null, "\t")}\n`, {
			mode: 0o600,
		});
		await chmod(tempFile, 0o600);
		await rename(tempFile, path);
		return normalizeGoogleGenaiSettings(nextDocument);
	} catch (error) {
		await rm(tempFile, { force: true }).catch(() => undefined);
		throw error;
	}
}

async function readDocumentForUpdate(canonicalPath: string): Promise<Record<string, unknown>> {
	const legacyPath = join(dirname(canonicalPath), LEGACY_CONFIG_FILE_NAME);
	let text: string;
	try {
		text = await readFile(canonicalPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw new Error(
				`Cannot update ${CONFIG_FILE_NAME} because the existing file is unreadable; repair it first.`,
			);
		}
		try {
			text = await readFile(legacyPath, "utf8");
		} catch (legacyError) {
			if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") return {};
			throw new Error(
				`Cannot update ${CONFIG_FILE_NAME} because the legacy file is unreadable; repair it first.`,
			);
		}
	}

	let document: unknown;
	try {
		document = JSON.parse(text) as unknown;
	} catch {
		throw new Error(
			`Cannot update ${CONFIG_FILE_NAME} because the existing file is malformed; repair it first.`,
		);
	}
	if (!isValidGoogleGenaiDocument(document)) {
		throw new Error(
			`Cannot update ${CONFIG_FILE_NAME} because the existing file has invalid recognized fields; repair it first.`,
		);
	}
	return { ...document };
}

function isValidGoogleGenaiDocument(value: unknown): value is Record<string, unknown> {
	if (!isObject(value)) return false;
	if (value.model !== undefined && !normalizeString(value.model)) return false;
	if (value.apiUrl !== undefined && !normalizeString(value.apiUrl)) return false;
	if (value.apiKey !== undefined) {
		const apiKey = normalizeString(value.apiKey);
		if (!apiKey || isUnsupportedConfigApiKey(apiKey)) return false;
	}
	if (value.timeoutMs !== undefined && !isValidTimeoutMs(value.timeoutMs)) return false;
	if (value.tools !== undefined && !Array.isArray(value.tools)) return false;
	return true;
}

async function ensureConfigPermissions(path: string, warnings: string[]) {
	try {
		const current = await stat(path);
		if ((current.mode & 0o777) !== 0o600) await chmod(path, 0o600);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		warnings.push(
			`Failed to enforce 0600 permissions for ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function cleanObject<T>(value: T): T {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const result: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) result[key] = item;
	}
	return result as T;
}

export async function saveToolSelection(tools: GoogleGenaiToolName[]): Promise<void> {
	await updateGoogleGenaiConfig({ tools: [...tools] });
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGoogleGenaiToolName(value: string): value is GoogleGenaiToolName {
	return GOOGLE_GENAI_TOOL_NAMES.includes(value as GoogleGenaiToolName);
}
