import { randomUUID } from "node:crypto";
import { existsSync, linkSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SegmentName, StatuslineConfig, StatuslinePresetName } from "../presets/types.js";

const SETTINGS_FILE = "pi-statusline.json";
const LEGACY_SETTINGS_FILE = "pi-statusline-settings.json";
const DEFAULT_PRESET: StatuslinePresetName = "tokyo-night";
const DEFAULT_SEGMENTS: SegmentName[] = [
	"brand",
	"model",
	"thinking",
	"cwd",
	"branch",
	"tools",
	"context",
	"tokens",
	"cost",
	"time",
];
let pendingSettingsNotice: string | undefined;

export interface StatuslineSettings {
	extensionStatusIcons: Record<string, string>;
}

export function createDefaultConfig(): StatuslineConfig {
	return {
		preset: readStatuslinePreset(),
		palette: "candy",
		density: "compact",
		separator: "dot",
		showLabels: false,
		segments: [...DEFAULT_SEGMENTS],
		extensionStatusIcons: readStatuslineSettings().extensionStatusIcons,
	};
}

export function readStatuslineSettings(settingsPath?: string): StatuslineSettings {
	if (settingsPath) return readSettingsFile(settingsPath);
	const canonicalPath = join(getAgentDir(), SETTINGS_FILE);
	const legacyPath = join(getAgentDir(), LEGACY_SETTINGS_FILE);
	if (existsSync(canonicalPath)) {
		const canonical = readSettingsFileResult(canonicalPath);
		const notices: string[] = [];
		if (!canonical.valid) notices.push(`${SETTINGS_FILE} is invalid and was ignored.`);
		if (existsSync(legacyPath)) {
			notices.push(`${LEGACY_SETTINGS_FILE} ignored because ${SETTINGS_FILE} takes precedence.`);
		}
		if (notices.length > 0) pendingSettingsNotice = notices.join("\n");
		return canonical.settings;
	}
	if (!existsSync(legacyPath)) return { extensionStatusIcons: {} };
	const legacy = readSettingsFileResult(legacyPath);
	if (!legacy.valid) {
		pendingSettingsNotice = `${LEGACY_SETTINGS_FILE} is invalid and was ignored.`;
		return legacy.settings;
	}
	try {
		installFileExclusively(canonicalPath, `${JSON.stringify(legacy.settings, null, "\t")}\n`);
	} catch (error) {
		if (existsSync(canonicalPath)) return readSettingsFile(canonicalPath);
		pendingSettingsNotice = `Statusline settings migration failed: ${formatError(error)}. The legacy file was used for this session.`;
		return legacy.settings;
	}
	try {
		rmSync(legacyPath);
		pendingSettingsNotice = `Statusline settings migrated from ${LEGACY_SETTINGS_FILE} to ${SETTINGS_FILE}.`;
	} catch (error) {
		pendingSettingsNotice = `Statusline settings migrated to ${SETTINGS_FILE}, but ${LEGACY_SETTINGS_FILE} could not be removed: ${formatError(error)}.`;
	}
	return legacy.settings;
}

function installFileExclusively(filePath: string, contents: string) {
	const tempFile = join(dirname(filePath), `.${SETTINGS_FILE}.${randomUUID()}.tmp`);
	try {
		writeFileSync(tempFile, contents, { encoding: "utf8", flag: "wx" });
		linkSync(tempFile, filePath);
	} finally {
		rmSync(tempFile, { force: true });
	}
}

export function consumeStatuslineSettingsNotice() {
	const notice = pendingSettingsNotice;
	pendingSettingsNotice = undefined;
	return notice;
}

function readSettingsFile(settingsPath: string): StatuslineSettings {
	return readSettingsFileResult(settingsPath).settings;
}

function readSettingsFileResult(settingsPath: string): {
	settings: StatuslineSettings;
	valid: boolean;
} {
	try {
		const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { settings: { extensionStatusIcons: {} }, valid: false };
		}
		return { settings: normalizeStatuslineSettings(parsed), valid: true };
	} catch {
		return { settings: { extensionStatusIcons: {} }, valid: false };
	}
}

export function normalizeStatuslineSettings(value: unknown): StatuslineSettings {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return { extensionStatusIcons: {} };
	const icons = (value as { extensionStatusIcons?: unknown }).extensionStatusIcons;
	if (!icons || typeof icons !== "object" || Array.isArray(icons)) {
		return { extensionStatusIcons: {} };
	}
	return {
		extensionStatusIcons: Object.fromEntries(
			Object.entries(icons).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		),
	};
}

function readStatuslinePreset(): StatuslinePresetName {
	const value = process.env.PI_STATUSLINE_PRESET?.trim().toLowerCase();
	return value === "classic" || value === "tokyo-night" ? value : DEFAULT_PRESET;
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
