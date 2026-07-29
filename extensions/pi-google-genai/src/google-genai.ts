import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";
import {
	DEFAULT_MODEL,
	GOOGLE_GENAI_TOOL_NAMES,
	type GoogleGenaiConfig,
	type GoogleGenaiToolName,
	googleGenaiConfigPath,
	isGoogleGenaiToolName,
	isUnsupportedConfigApiKey,
	type LoadedGoogleGenaiConfig,
	loadGoogleGenaiConfig,
	saveToolSelection,
	updateGoogleGenaiSetup,
	waitForGoogleGenaiConfigWrites,
} from "./config.js";
import { cleanupRawResponseDirectory } from "./response-format.js";
import { googleMapsTool, googleSearchTool, googleUrlContextTool } from "./tools.js";

const STATUS_KEY = "google-genai";
const COMMAND_COMPLETIONS = [
	{ value: "init", label: "init", description: "Create or update Google GenAI config" },
	{ value: "status", label: "status", description: "Show Google GenAI config status" },
	{ value: "config", label: "config", description: "Show Google GenAI config status" },
	{ value: "help", label: "help", description: "Show Google GenAI command usage" },
	{ value: "tools", label: "tools", description: "Select Google GenAI tools" },
	{ value: "enable", label: "enable", description: "Enable all Google GenAI tools" },
	{ value: "disable", label: "disable", description: "Disable all Google GenAI tools" },
];
type CommandAction = "status" | "init" | "help" | "tools" | "enable" | "disable" | "unknown";

export default function googleGenai(pi: ExtensionAPI) {
	let sessionGeneration = 0;
	let menuController = new AbortController();
	pi.registerTool(googleSearchTool);
	pi.registerTool(googleMapsTool);
	pi.registerTool(googleUrlContextTool);

	pi.registerCommand("google-genai", {
		description: "Configure Google GenAI grounding tools",
		getArgumentCompletions: commandCompletions,
		handler: async (args, ctx) => {
			const generation = sessionGeneration;
			await handleCommand(
				args,
				ctx,
				pi,
				() => generation === sessionGeneration,
				menuController.signal,
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const generation = ++sessionGeneration;
		menuController.abort(new DOMException("Google GenAI session replaced", "AbortError"));
		menuController = new AbortController();
		ctx.ui.setStatus(STATUS_KEY, undefined);
		const loaded = await loadGoogleGenaiConfig();
		if (generation !== sessionGeneration) return;
		if (loaded.configLoaded) applyGoogleToolSelection(pi, loaded.config.tools);
		if (loaded.warnings.length > 0) ctx.ui.notify(loaded.warnings.join("\n"), "warning");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		sessionGeneration += 1;
		menuController.abort(new DOMException("Google GenAI session shut down", "AbortError"));
		ctx.ui.setStatus(STATUS_KEY, undefined);
		const cleanup = cleanupRawResponseDirectory();
		await waitForGoogleToolSettings();
		await waitForGoogleGenaiConfigWrites();
		await cleanup;
	});
}

export function parseCommand(rawArgs: string): CommandAction {
	const [command = ""] = splitArgs(rawArgs);
	switch (command) {
		case "":
		case "status":
		case "config":
			return "status";
		case "init":
			return "init";
		case "help":
			return "help";
		case "tools":
		case "toggle":
		case "select":
			return "tools";
		case "enable":
		case "on":
			return "enable";
		case "disable":
		case "off":
			return "disable";
		default:
			return "unknown";
	}
}

export function commandCompletions(prefix: string) {
	if (/\s/.test(prefix.trimStart())) return null;
	const token = prefix.trimStart();
	const matches = COMMAND_COMPLETIONS.filter((item) => item.value.startsWith(token));
	return matches.length > 0 ? matches : null;
}

export function buildStatusMessage(loaded: LoadedGoogleGenaiConfig, authSource: string) {
	const { config, path, warnings } = loaded;
	return [
		"Google GenAI config:",
		`path: ${path}`,
		`model: ${config.model}`,
		`apiUrl: ${config.apiUrl}`,
		`timeoutMs: ${config.timeoutMs}`,
		`auth: ${authSource}`,
		`configLoaded: ${loaded.configLoaded ? "yes" : "no"}`,
		`persisted tools: ${loaded.configLoaded ? formatPersistedTools(config.tools) : "none"}`,
		...(warnings.length > 0 ? ["warnings:", ...warnings.map((warning) => `- ${warning}`)] : []),
	].join("\n");
}

async function handleCommand(
	rawArgs: string,
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	isCurrent: () => boolean,
	menuSignal: AbortSignal,
) {
	const action = parseCommand(rawArgs);
	switch (action) {
		case "status":
			await showStatus(ctx, isCurrent);
			return;
		case "init":
			await initConfig(ctx, pi, isCurrent);
			return;
		case "help":
			ctx.ui.notify(helpText(), "info");
			return;
		case "tools":
			await selectTools(ctx, pi, isCurrent, menuSignal);
			return;
		case "enable": {
			const saved = await transactGoogleToolSelection(
				pi,
				ctx,
				[...GOOGLE_GENAI_TOOL_NAMES],
				() => saveToolSelection([...GOOGLE_GENAI_TOOL_NAMES]),
				isCurrent,
			);
			if (saved && isCurrent()) ctx.ui.notify("Enabled all Google GenAI tools.", "info");
			return;
		}
		case "disable": {
			const saved = await transactGoogleToolSelection(
				pi,
				ctx,
				[],
				() => saveToolSelection([]),
				isCurrent,
			);
			if (saved && isCurrent()) {
				ctx.ui.notify(
					"Disabled all Google GenAI tools. Use /google-genai enable to restore them.",
					"info",
				);
			}
			return;
		}
		case "unknown":
			ctx.ui.notify(helpText(), "warning");
			return;
	}
}

async function initConfig(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	isCurrent: () => boolean,
) {
	if (!ctx.hasUI) {
		ctx.ui.notify(
			"/google-genai init requires interactive UI. Edit pi-google-genai.json manually or use /login google.",
			"warning",
		);
		return;
	}
	const loaded = await loadGoogleGenaiConfig();
	if (!isCurrent()) return;
	const apiKey = await ctx.ui.input(
		"Google GenAI API key (leave blank to keep existing/use /login google/GEMINI_API_KEY):",
	);
	if (!isCurrent()) return;
	if (apiKey === undefined) {
		ctx.ui.notify("Cancelled", "info");
		return;
	}
	const model = await ctx.ui.input("Google GenAI model:", loaded.config.model);
	if (!isCurrent()) return;
	if (model === undefined) {
		ctx.ui.notify("Cancelled", "info");
		return;
	}

	try {
		const updated = await updateGoogleSetupAndTools(
			pi,
			{
				...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
				model: model.trim() || loaded.config.model || DEFAULT_MODEL,
			},
			isCurrent,
		);
		if (!updated) return;
	} catch (error) {
		if (!isCurrent()) return;
		ctx.ui.notify(
			`Google GenAI config save failed: ${error instanceof Error ? error.message : String(error)}`,
			"warning",
		);
		return;
	}
	if (!isCurrent()) return;
	ctx.ui.notify(`Saved Google GenAI config to ${googleGenaiConfigPath()}.`, "info");
}

async function showStatus(ctx: ExtensionCommandContext, isCurrent: () => boolean) {
	const loaded = await loadGoogleGenaiConfig();
	if (!isCurrent()) return;
	ctx.ui.notify(buildStatusMessage(loaded, authSource(loaded.config, ctx)), "info");
}

async function selectTools(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	isCurrent: () => boolean,
	menuSignal: AbortSignal,
) {
	if (!ctx.hasUI) throw new Error("/google-genai tools requires TUI or RPC mode.");
	type Screen = "tools";
	type Action = "toggle" | "enableAll" | "disableAll";
	const menu = defineMenu<undefined, Screen, Action, ExtensionCommandContext>({
		start: "tools",
		screens: {
			tools: () => {
				const selectedTools = new Set(currentGoogleTools(pi));
				return {
					kind: "multiSelect",
					title: googleToolSelectorTitle(selectedTools),
					items: GOOGLE_GENAI_TOOL_NAMES.map((toolName) => ({
						id: toolName,
						label: toolName,
						selected: selectedTools.has(toolName),
					})),
					action: "toggle",
					actions: [
						{ id: "enable-all", label: "Enable all Google GenAI tools", action: "enableAll" },
						{
							id: "disable-all",
							label: "Disable all Google GenAI tools",
							action: "disableAll",
						},
						{ id: "done", label: "Done", close: true },
					],
					hint: "close",
					doneLabel: "Done",
				};
			},
		},
		actions: {
			toggle: async ({ itemId, selected }) => {
				if (!isGoogleGenaiToolName(itemId) || selected === undefined) {
					return { kind: "rejected" };
				}
				const next = new Set(currentGoogleTools(pi));
				if (selected) next.add(itemId);
				else next.delete(itemId);
				const ordered = orderedGoogleTools(next);
				const saved = await transactGoogleToolSelection(
					pi,
					ctx,
					ordered,
					() => saveToolSelection(ordered),
					isCurrent,
				);
				return saved ? { kind: "stay" } : { kind: "rejected" };
			},
			enableAll: async () => {
				const selected = [...GOOGLE_GENAI_TOOL_NAMES];
				const saved = await transactGoogleToolSelection(
					pi,
					ctx,
					selected,
					() => saveToolSelection(selected),
					isCurrent,
				);
				return saved ? { kind: "stay" } : { kind: "rejected" };
			},
			disableAll: async () => {
				const saved = await transactGoogleToolSelection(
					pi,
					ctx,
					[],
					() => saveToolSelection([]),
					isCurrent,
				);
				return saved ? { kind: "stay" } : { kind: "rejected" };
			},
		},
	});
	await runMenu(ctx, menu, {
		getState: () => undefined,
		signal: menuSignal,
		isCurrent,
	});
}

function googleToolSelectorTitle(selectedTools: ReadonlySet<GoogleGenaiToolName>) {
	return `Google GenAI tools (${selectedTools.size}/${GOOGLE_GENAI_TOOL_NAMES.length})`;
}

function authSource(config: GoogleGenaiConfig, ctx: ExtensionCommandContext) {
	if (config.apiKey) {
		return isUnsupportedConfigApiKey(config.apiKey)
			? "invalid config apiKey (interpolation unsupported)"
			: "config apiKey";
	}
	const status = ctx.modelRegistry.getProviderAuthStatus("google");
	if (status.configured || status.source) {
		return status.label ? `Pi auth/google (${status.label})` : "Pi auth/google";
	}
	return "missing";
}

let toolTransactionQueue = Promise.resolve();

function updateGoogleSetupAndTools(
	pi: ExtensionAPI,
	patch: { model: string; apiKey?: string },
	isCurrent: () => boolean,
): Promise<GoogleGenaiConfig | undefined> {
	const operation = toolTransactionQueue.then(async () => {
		if (!isCurrent()) return undefined;
		const updated = await updateGoogleGenaiSetup(patch);
		if (!isCurrent()) return undefined;
		applyGoogleToolSelection(pi, updated.tools);
		return updated;
	});
	toolTransactionQueue = operation.then(
		() => undefined,
		() => undefined,
	);
	return operation;
}

async function waitForGoogleToolSettings(): Promise<void> {
	await toolTransactionQueue;
}

function transactGoogleToolSelection(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	selectedTools: readonly GoogleGenaiToolName[],
	persist: () => Promise<void>,
	isCurrent: () => boolean,
): Promise<boolean> {
	const operation = toolTransactionQueue.then(() =>
		transactGoogleToolSelectionNow(pi, ctx, selectedTools, persist, isCurrent),
	);
	toolTransactionQueue = operation.then(
		() => undefined,
		() => undefined,
	);
	return operation;
}

async function transactGoogleToolSelectionNow(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	selectedTools: readonly GoogleGenaiToolName[],
	persist: () => Promise<void>,
	isCurrent: () => boolean,
): Promise<boolean> {
	if (!isCurrent()) return false;
	const previousActiveTools = pi.getActiveTools();
	try {
		applyGoogleToolSelection(pi, selectedTools);
		await persist();
		return isCurrent();
	} catch (error) {
		let rollbackError: unknown;
		try {
			applyGoogleToolSelection(pi, previousActiveTools.filter(isGoogleGenaiToolName));
		} catch (caught) {
			rollbackError = caught;
		}
		if (!isCurrent()) return false;
		const message = error instanceof Error ? error.message : String(error);
		const rollbackMessage = rollbackError
			? `; active-tool rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
			: "; active tools restored";
		ctx.ui.notify(
			`Google GenAI tool selection save failed: ${message}${rollbackMessage}`,
			"warning",
		);
		return false;
	}
}

function applyGoogleToolSelection(pi: ExtensionAPI, selectedTools: readonly GoogleGenaiToolName[]) {
	const active = pi.getActiveTools();
	const nonGoogle = active.filter((toolName) => !isGoogleGenaiToolName(toolName));
	pi.setActiveTools([...nonGoogle, ...selectedTools]);
}

function currentGoogleTools(pi: ExtensionAPI) {
	const active = new Set(pi.getActiveTools());
	return GOOGLE_GENAI_TOOL_NAMES.filter((toolName) => active.has(toolName));
}

function orderedGoogleTools(tools: Set<GoogleGenaiToolName>) {
	return GOOGLE_GENAI_TOOL_NAMES.filter((toolName) => tools.has(toolName));
}

function splitArgs(rawArgs: string) {
	return rawArgs.trim().split(/\s+/).filter(Boolean);
}

function formatPersistedTools(tools: readonly GoogleGenaiToolName[]) {
	if (tools.length === GOOGLE_GENAI_TOOL_NAMES.length) return "all enabled";
	if (tools.length === 0) return "all disabled";
	return `${tools.length}/${GOOGLE_GENAI_TOOL_NAMES.length} selected: ${tools.join(", ")}`;
}

function helpText() {
	return [
		"Google GenAI commands:",
		"/google-genai init - create or update config",
		"/google-genai status|config - show config and auth status",
		"/google-genai tools - select enabled Google GenAI tools",
		"/google-genai enable - enable all Google GenAI tools",
		"/google-genai disable - disable all Google GenAI tools",
		"Auth: config apiKey, /login google, or GEMINI_API_KEY.",
	].join("\n");
}

export type { GoogleGenaiConfig, LoadedGoogleGenaiConfig } from "./config.js";
export {
	DEFAULT_API_URL,
	DEFAULT_MODEL,
	DEFAULT_TIMEOUT_MS,
	GOOGLE_GENAI_TOOL_NAMES,
	googleGenaiConfigPath,
	loadGoogleGenaiConfig,
	MAX_TIMEOUT_MS,
	normalizeGoogleGenaiSettings,
	resolveGoogleGenaiAuth,
} from "./config.js";
export { formatToolResult } from "./response-format.js";
export {
	validateMapsLocation,
	validateSearchTypes,
	validateTimeoutMs,
	validateUrls,
} from "./tools.js";
