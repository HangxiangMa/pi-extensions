import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { BTW_THINKING_LEVELS, type BtwThinkingLevel } from "./side-thread.js";

export const BTW_SETTINGS_FILE = "pi-btw.json";
export const DEFAULT_REMEMBER_THINKING_LEVEL_CHANGES = true;

export interface BtwSettings {
	model?: string;
	thinkingLevel?: BtwThinkingLevel;
	rememberThinkingLevelChanges?: boolean;
}

export type BtwSettingsLoadResult =
	| { kind: "missing" }
	| { kind: "invalid"; reason: string }
	| { kind: "loaded"; settings: BtwSettings };

export interface UpdateBtwSettingsOptions {
	settingsPath?: string;
	signal?: AbortSignal;
	beforeRename?: (temporaryPath: string, settingsPath: string) => Promise<void>;
}

type SettingsDocument = Record<string, unknown>;

const mutationQueues = new Map<string, Promise<void>>();

export function btwSettingsPath(): string {
	return join(getAgentDir(), BTW_SETTINGS_FILE);
}

export function normalizeBtwSettings(value: unknown): BtwSettings | undefined {
	if (!isSettingsDocument(value)) return undefined;

	const settings: BtwSettings = {};
	if (Object.hasOwn(value, "model")) {
		const model = Reflect.get(value, "model");
		if (typeof model !== "string" || !parseBtwModelReference(model)) return undefined;
		settings.model = model;
	}
	if (Object.hasOwn(value, "thinkingLevel")) {
		const thinkingLevel = Reflect.get(value, "thinkingLevel");
		if (!isBtwThinkingLevel(thinkingLevel)) return undefined;
		settings.thinkingLevel = thinkingLevel;
	}
	if (Object.hasOwn(value, "rememberThinkingLevelChanges")) {
		const remember = Reflect.get(value, "rememberThinkingLevelChanges");
		if (typeof remember !== "boolean") return undefined;
		settings.rememberThinkingLevelChanges = remember;
	}
	return settings;
}

export function parseBtwModelReference(
	reference: string,
): { provider: string; modelId: string } | undefined {
	if (/\s/.test(reference)) return undefined;
	const separator = reference.indexOf("/");
	if (separator <= 0 || separator === reference.length - 1) return undefined;
	return { provider: reference.slice(0, separator), modelId: reference.slice(separator + 1) };
}

export function effectiveRememberThinkingLevelChanges(settings: BtwSettings): boolean {
	return settings.rememberThinkingLevelChanges ?? DEFAULT_REMEMBER_THINKING_LEVEL_CHANGES;
}

export async function readBtwSettings(
	settingsPath = btwSettingsPath(),
): Promise<BtwSettingsLoadResult> {
	await awaitBtwSettingsWrites(settingsPath);
	return readBtwSettingsUncoordinated(settingsPath);
}

export function updateBtwSettings(
	patch: Partial<Pick<BtwSettings, "thinkingLevel" | "rememberThinkingLevelChanges">>,
	options: UpdateBtwSettingsOptions = {},
): Promise<BtwSettings> {
	const settingsPath = options.settingsPath ?? btwSettingsPath();
	return enqueueMutation(settingsPath, async () => {
		options.signal?.throwIfAborted();
		const current = await readSettingsDocumentForUpdate(settingsPath);
		const updated: SettingsDocument = { ...current, ...patch };
		const settings = normalizeBtwSettings(updated);
		if (!settings) throw invalidSettingsError(settingsPath, "invalid settings shape");
		await publishSettings(settingsPath, updated, options.signal, options.beforeRename);
		return settings;
	});
}

export async function awaitBtwSettingsWrites(settingsPath = btwSettingsPath()): Promise<void> {
	await mutationQueues.get(settingsPath);
}

function enqueueMutation<T>(settingsPath: string, mutation: () => Promise<T>): Promise<T> {
	const previous = mutationQueues.get(settingsPath) ?? Promise.resolve();
	const result = previous.then(mutation, mutation);
	const settled = result.then(
		() => undefined,
		() => undefined,
	);
	mutationQueues.set(settingsPath, settled);
	void settled.finally(() => {
		if (mutationQueues.get(settingsPath) === settled) mutationQueues.delete(settingsPath);
	});
	return result;
}

async function readBtwSettingsUncoordinated(settingsPath: string): Promise<BtwSettingsLoadResult> {
	let contents: string;
	try {
		contents = await readFile(settingsPath, "utf8");
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") return { kind: "missing" };
		return { kind: "invalid", reason: `${settingsPath}: ${formatError(error)}` };
	}

	try {
		const settings = normalizeBtwSettings(JSON.parse(contents) as unknown);
		return settings
			? { kind: "loaded", settings }
			: { kind: "invalid", reason: `${settingsPath}: invalid settings shape` };
	} catch (error: unknown) {
		return { kind: "invalid", reason: `${settingsPath}: invalid JSON (${formatError(error)})` };
	}
}

async function readSettingsDocumentForUpdate(settingsPath: string): Promise<SettingsDocument> {
	let contents: string;
	try {
		contents = await readFile(settingsPath, "utf8");
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") return {};
		throw invalidSettingsError(settingsPath, formatError(error));
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(contents) as unknown;
	} catch (error: unknown) {
		throw invalidSettingsError(settingsPath, `invalid JSON (${formatError(error)})`);
	}
	if (!isSettingsDocument(parsed) || !normalizeBtwSettings(parsed)) {
		throw invalidSettingsError(settingsPath, "invalid settings shape");
	}
	return parsed;
}

async function publishSettings(
	settingsPath: string,
	document: SettingsDocument,
	signal?: AbortSignal,
	beforeRename?: (temporaryPath: string, settingsPath: string) => Promise<void>,
): Promise<void> {
	signal?.throwIfAborted();
	const directory = dirname(settingsPath);
	await mkdir(directory, { recursive: true });
	signal?.throwIfAborted();
	const temporaryPath = join(
		directory,
		`.${basename(settingsPath)}.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
			encoding: "utf8",
			flag: "wx",
			mode: 0o600,
			signal,
		});
		await beforeRename?.(temporaryPath, settingsPath);
		signal?.throwIfAborted();
		await rename(temporaryPath, settingsPath);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

function isSettingsDocument(value: unknown): value is SettingsDocument {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBtwThinkingLevel(value: unknown): value is BtwThinkingLevel {
	return BTW_THINKING_LEVELS.includes(value as BtwThinkingLevel);
}

function invalidSettingsError(settingsPath: string, reason: string): Error {
	return new Error(`pi-btw settings at ${settingsPath} are invalid: ${reason}`);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
