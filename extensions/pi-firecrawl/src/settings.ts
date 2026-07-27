import { constants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { FIRECRAWL_TOOL_NAMES, type FirecrawlToolName } from "./tools.js";

const NEW_SETTINGS_FILE = "pi-firecrawl.json";
const LEGACY_SETTINGS_FILE = "pi-firecrawl-settings.json";

export interface FirecrawlSettings {
	tools: FirecrawlToolName[];
	updatedAt: number;
}

export type SettingsLoadResult =
	| { kind: "missing"; notice?: string }
	| { kind: "invalid"; reason: string; notice?: string }
	| { kind: "loaded"; settings: FirecrawlSettings; notice?: string };

export async function loadSettings(): Promise<SettingsLoadResult> {
	const newPath = settingsFilePath();
	const newSettings = await readSettingsFile(newPath);
	if (newSettings.kind !== "missing") {
		return withLegacyIgnoredNotice(newSettings);
	}

	const legacyPath = legacySettingsFilePath();
	const legacySettings = await readSettingsFile(legacyPath);
	const concurrentlyCreatedSettings = await readSettingsFile(newPath);
	if (concurrentlyCreatedSettings.kind !== "missing") {
		return withLegacyIgnoredNotice(concurrentlyCreatedSettings);
	}
	if (legacySettings.kind === "missing") return { kind: "missing" };
	if (legacySettings.kind === "invalid") return legacySettings;

	return {
		...legacySettings,
		notice: `Using legacy ${LEGACY_SETTINGS_FILE}; rename it to ${NEW_SETTINGS_FILE}. Future saves write ${NEW_SETTINGS_FILE} without modifying the legacy file.`,
	};
}

async function readSettingsFile(filePath: string): Promise<SettingsLoadResult> {
	let text: string;
	try {
		text = await readFile(filePath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return { kind: "missing" };
		return { kind: "invalid", reason: `${filePath}: ${formatError(error)}` };
	}

	try {
		const parsed = JSON.parse(text) as unknown;
		const settings = normalizeFirecrawlSettings(parsed);
		if (settings) return { kind: "loaded", settings };
		return {
			kind: "invalid",
			reason: `${filePath}: expected tools to be an array of Firecrawl tool names`,
		};
	} catch (error) {
		return { kind: "invalid", reason: `${filePath}: ${formatError(error)}` };
	}
}

async function withLegacyIgnoredNotice(settings: SettingsLoadResult): Promise<SettingsLoadResult> {
	if (!(await fileExists(legacySettingsFilePath()))) return settings;
	return {
		...settings,
		notice: `Firecrawl legacy settings ignored: ${legacySettingsFilePath()} exists, but ${settingsFilePath()} takes precedence. Delete ${LEGACY_SETTINGS_FILE} after confirming your settings.`,
	};
}

async function fileExists(filePath: string) {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export function normalizeFirecrawlSettings(value: unknown): FirecrawlSettings | undefined {
	if (!value || typeof value !== "object") return undefined;
	const settings = value as { tools?: unknown; updatedAt?: unknown };
	if (typeof settings.updatedAt !== "number") return undefined;
	if (!Array.isArray(settings.tools)) return undefined;
	if (!settings.tools.every(isFirecrawlToolName)) return undefined;
	return { tools: orderedUniqueFirecrawlTools(settings.tools), updatedAt: settings.updatedAt };
}

function isFirecrawlToolName(value: unknown): value is FirecrawlToolName {
	return typeof value === "string" && FIRECRAWL_TOOL_NAMES.includes(value as never);
}

function orderedUniqueFirecrawlTools(tools: readonly FirecrawlToolName[]) {
	const selectedTools = new Set(tools);
	return FIRECRAWL_TOOL_NAMES.filter((toolName) => selectedTools.has(toolName));
}

export async function saveSettings(settings: FirecrawlSettings) {
	const filePath = settingsFilePath();
	await mkdir(dirname(filePath), { recursive: true });
	const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	try {
		await writeFile(tempFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
		await rename(tempFile, filePath);
	} catch (error) {
		await rm(tempFile, { force: true }).catch(() => undefined);
		throw error;
	}
}

export function settingsFilePath() {
	return join(agentDir(), NEW_SETTINGS_FILE);
}

function legacySettingsFilePath() {
	return join(agentDir(), LEGACY_SETTINGS_FILE);
}

function agentDir() {
	return getAgentDir();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
