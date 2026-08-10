import { readFile } from "node:fs/promises";
import type { KeyId } from "@earendil-works/pi-tui";

export interface FileContextSettings {
	openShortcut: KeyId | null;
}

export interface LoadedFileContextSettings {
	settings: FileContextSettings;
	warning?: string;
}

export const DEFAULT_FILE_CONTEXT_SETTINGS: FileContextSettings = {
	openShortcut: "ctrl+alt+f",
};

const MODIFIERS = new Set(["ctrl", "shift", "alt", "super"]);
const BASE_KEYS = new Set([
	..."abcdefghijklmnopqrstuvwxyz0123456789",
	"`",
	"-",
	"=",
	"[",
	"]",
	"\\",
	";",
	"'",
	",",
	".",
	"/",
	"!",
	"@",
	"#",
	"$",
	"%",
	"^",
	"&",
	"*",
	"(",
	")",
	"_",
	"+",
	"|",
	"~",
	"{",
	"}",
	":",
	"<",
	">",
	"?",
	"escape",
	"esc",
	"enter",
	"return",
	"tab",
	"space",
	"backspace",
	"delete",
	"insert",
	"clear",
	"home",
	"end",
	"pageup",
	"pagedown",
	"up",
	"down",
	"left",
	"right",
	...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
]);

export async function loadFileContextSettings(
	settingsPath: string,
): Promise<LoadedFileContextSettings> {
	let source: string;
	try {
		source = await readFile(settingsPath, "utf8");
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return { settings: { ...DEFAULT_FILE_CONTEXT_SETTINGS } };
		}
		return defaultWithWarning(`Cannot read File Context settings: ${formatError(error)}`);
	}

	let document: unknown;
	try {
		document = JSON.parse(source);
	} catch (error: unknown) {
		return defaultWithWarning(`Cannot parse File Context settings: ${formatError(error)}`);
	}
	if (!isRecord(document)) {
		return defaultWithWarning("File Context settings must contain a JSON object.");
	}
	if (!("openShortcut" in document)) {
		return { settings: { ...DEFAULT_FILE_CONTEXT_SETTINGS } };
	}
	if (document.openShortcut === null) {
		return { settings: { openShortcut: null } };
	}
	if (typeof document.openShortcut !== "string") {
		return defaultWithWarning('File Context setting "openShortcut" must be a key string or null.');
	}
	const shortcut = normalizeKeyId(document.openShortcut);
	if (!shortcut) {
		return defaultWithWarning(
			`File Context setting "openShortcut" is invalid: ${JSON.stringify(document.openShortcut)}.`,
		);
	}
	return { settings: { openShortcut: shortcut } };
}

function normalizeKeyId(value: string): KeyId | undefined {
	const normalized = value.trim().toLowerCase();
	const base = [...BASE_KEYS]
		.sort((left, right) => right.length - left.length)
		.find((candidate) => normalized === candidate || normalized.endsWith(`+${candidate}`));
	if (!base) return undefined;
	const prefix = normalized.slice(0, normalized.length - base.length);
	if (!prefix) return base as KeyId;
	if (/^f(?:[1-9]|1[0-2])$/.test(base) || !prefix.endsWith("+")) return undefined;
	const modifiers = prefix.slice(0, -1).split("+");
	if (
		modifiers.length === 0 ||
		modifiers.some((modifier) => !MODIFIERS.has(modifier)) ||
		new Set(modifiers).size !== modifiers.length
	) {
		return undefined;
	}
	return normalized as KeyId;
}

function defaultWithWarning(warning: string): LoadedFileContextSettings {
	return { settings: { ...DEFAULT_FILE_CONTEXT_SETTINGS }, warning };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
