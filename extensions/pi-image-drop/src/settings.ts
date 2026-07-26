import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const SETTINGS_FILE = "pi-image-drop.json";
const MIB = 1024 * 1024;

export interface ImageDropLimits {
	maxImages: number;
	maxImageBytes: number;
	maxBatchBytes: number;
	maxImagePixels: number;
	maxRetainedImages: number;
	maxRetainedBytes: number;
}

export interface ImageDropSettings extends ImageDropLimits {
	startOnSessionStart: boolean;
}

export const DEFAULT_SETTINGS: Readonly<ImageDropSettings> = Object.freeze({
	maxImages: 8,
	maxImageBytes: 10 * MIB,
	maxBatchBytes: 40 * MIB,
	maxImagePixels: 50_000_000,
	maxRetainedImages: 128,
	maxRetainedBytes: 512 * MIB,
	startOnSessionStart: false,
});

export const HARD_LIMITS: Readonly<ImageDropLimits> = Object.freeze({
	maxImages: 32,
	maxImageBytes: 50 * MIB,
	maxBatchBytes: 200 * MIB,
	maxImagePixels: 100_000_000,
	maxRetainedImages: 256,
	maxRetainedBytes: 1024 * MIB,
});

const LIMIT_KEYS = new Set<keyof ImageDropLimits>([
	"maxImages",
	"maxImageBytes",
	"maxBatchBytes",
	"maxImagePixels",
	"maxRetainedImages",
	"maxRetainedBytes",
]);
const saveQueues = new Map<string, Promise<void>>();

export type SettingsLoadResult =
	| { kind: "missing"; settings: ImageDropSettings }
	| { kind: "loaded"; settings: ImageDropSettings; warning?: string }
	| { kind: "invalid"; settings: ImageDropSettings; warning: string };

export function normalizeSettings(value: unknown): ImageDropSettings | undefined {
	if (!isRecord(value)) return undefined;
	const settings: ImageDropSettings = { ...DEFAULT_SETTINGS };
	for (const key of LIMIT_KEYS) {
		if (!Object.hasOwn(value, key)) continue;
		const candidate = Reflect.get(value, key);
		if (
			typeof candidate !== "number" ||
			!Number.isSafeInteger(candidate) ||
			candidate <= 0 ||
			candidate > HARD_LIMITS[key]
		) {
			return undefined;
		}
		settings[key] = candidate;
	}
	if (Object.hasOwn(value, "startOnSessionStart")) {
		if (typeof value.startOnSessionStart !== "boolean") return undefined;
		settings.startOnSessionStart = value.startOnSessionStart;
	}
	if (settings.maxImageBytes > settings.maxBatchBytes) return undefined;
	return settings;
}

export function settingsFilePath(): string {
	return join(getAgentDir(), SETTINGS_FILE);
}

export async function loadSettings(path = settingsFilePath()): Promise<SettingsLoadResult> {
	let text: string;
	try {
		const stats = await lstat(path);
		if (stats.isSymbolicLink()) return invalid(path, "symbolic links are not accepted");
		if (!stats.isFile()) return invalid(path, "settings path is not a regular file");
		text = await readFile(path, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return { kind: "missing", settings: { ...DEFAULT_SETTINGS } };
		}
		return invalid(path, formatError(error));
	}

	try {
		const settings = normalizeSettings(JSON.parse(text) as unknown);
		if (!settings) return invalid(path, "invalid settings shape or value");
		const raised = [...LIMIT_KEYS].filter((key) => settings[key] > DEFAULT_SETTINGS[key]);
		return {
			kind: "loaded",
			settings,
			warning:
				raised.length > 0
					? `${SETTINGS_FILE} raises ${raised.join(", ")} above the safe defaults; memory use or provider request size may increase.`
					: undefined,
		};
	} catch (error) {
		return invalid(path, formatError(error));
	}
}

export interface SettingsSaveOperations {
	writeFile?: typeof writeFile;
	rename?: typeof rename;
}

export async function saveSettings(
	settings: ImageDropSettings,
	path = settingsFilePath(),
	operations: SettingsSaveOperations = {},
): Promise<void> {
	if (!normalizeSettings(settings))
		throw new Error("Refusing to save invalid Image Drop settings.");
	const previous = saveQueues.get(path) ?? Promise.resolve();
	const next = previous
		.catch(() => undefined)
		.then(() => saveSettingsAtomic(settings, path, operations));
	saveQueues.set(path, next);
	try {
		await next;
	} finally {
		if (saveQueues.get(path) === next) saveQueues.delete(path);
	}
}

async function saveSettingsAtomic(
	settings: ImageDropSettings,
	path: string,
	operations: SettingsSaveOperations,
): Promise<void> {
	let document: Record<string, unknown> = {};
	try {
		const stats = await lstat(path);
		if (stats.isSymbolicLink()) throw new Error("symbolic links are not accepted");
		if (!stats.isFile()) throw new Error("settings path is not a regular file");
		const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
		if (!isRecord(parsed) || !normalizeSettings(parsed)) {
			throw new Error("existing settings are malformed or invalid");
		}
		document = parsed;
	} catch (error) {
		if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
	}
	await mkdir(dirname(path), { recursive: true });
	const temporaryPath = join(dirname(path), `.${SETTINGS_FILE}.${process.pid}.${randomUUID()}.tmp`);
	try {
		const contents = `${JSON.stringify({ ...document, ...settings }, null, "\t")}\n`;
		await (operations.writeFile ?? writeFile)(temporaryPath, contents, {
			encoding: "utf8",
			flag: "wx",
			mode: 0o600,
		});
		await (operations.rename ?? rename)(temporaryPath, path);
	} finally {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

function invalid(path: string, reason: string): SettingsLoadResult {
	return {
		kind: "invalid",
		settings: { ...DEFAULT_SETTINGS },
		warning: `${SETTINGS_FILE} ignored (${path}: ${reason}); using safe defaults.`,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
