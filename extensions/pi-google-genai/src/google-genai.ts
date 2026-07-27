import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
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
type ToolSelectorAction = "enableAll" | "disableAll" | "done";
type ToolSelectorRow =
	| { kind: "tool"; toolName: GoogleGenaiToolName }
	| { kind: "action"; action: ToolSelectorAction; label: string };

export default function googleGenai(pi: ExtensionAPI) {
	let sessionGeneration = 0;
	pi.registerTool(googleSearchTool);
	pi.registerTool(googleMapsTool);
	pi.registerTool(googleUrlContextTool);

	pi.registerCommand("google-genai", {
		description: "Configure Google GenAI grounding tools",
		getArgumentCompletions: commandCompletions,
		handler: async (args, ctx) => {
			const generation = sessionGeneration;
			await handleCommand(args, ctx, pi, () => generation === sessionGeneration);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const generation = ++sessionGeneration;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		const loaded = await loadGoogleGenaiConfig();
		if (generation !== sessionGeneration) return;
		if (loaded.configLoaded) applyGoogleToolSelection(pi, loaded.config.tools);
		if (loaded.warnings.length > 0) ctx.ui.notify(loaded.warnings.join("\n"), "warning");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		sessionGeneration += 1;
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
) {
	const action = parseCommand(rawArgs);
	switch (action) {
		case "status":
			await showStatus(ctx, isCurrent);
			return;
		case "init":
			await initConfig(ctx, isCurrent);
			return;
		case "help":
			ctx.ui.notify(helpText(), "info");
			return;
		case "tools":
			await selectTools(ctx, pi, isCurrent);
			return;
		case "enable":
			if (
				await transactGoogleToolSelection(
					pi,
					ctx,
					[...GOOGLE_GENAI_TOOL_NAMES],
					() => saveToolSelection([...GOOGLE_GENAI_TOOL_NAMES]),
					isCurrent,
				)
			) {
				ctx.ui.notify("Enabled all Google GenAI tools.", "info");
			}
			return;
		case "disable":
			if (await transactGoogleToolSelection(pi, ctx, [], () => saveToolSelection([]), isCurrent)) {
				ctx.ui.notify(
					"Disabled all Google GenAI tools. Use /google-genai enable to restore them.",
					"info",
				);
			}
			return;
		case "unknown":
			ctx.ui.notify(helpText(), "warning");
			return;
	}
}

async function initConfig(ctx: ExtensionCommandContext, isCurrent: () => boolean) {
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
		await updateGoogleGenaiSetup({
			...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
			model: model.trim() || loaded.config.model || DEFAULT_MODEL,
		});
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
	ctx.ui.notify(buildStatusMessage(loaded, await authSource(loaded.config, ctx)), "info");
}

async function selectTools(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	isCurrent: () => boolean,
) {
	if (!ctx.hasUI) {
		ctx.ui.notify("/google-genai tools requires interactive UI.", "warning");
		return;
	}
	if (ctx.mode !== "tui") {
		await showDialogToolSelector(ctx, pi, isCurrent);
		return;
	}

	let selectedTools = new Set(currentGoogleTools(pi));
	let persistQueue = Promise.resolve();
	let requestedRevision = 0;
	let requestRender: () => void = () => undefined;
	const commitSelectedTools = () => {
		const nextTools = orderedGoogleTools(selectedTools);
		const revision = ++requestedRevision;
		persistQueue = persistQueue.then(async () => {
			const saved = await transactGoogleToolSelection(
				pi,
				ctx,
				nextTools,
				() => saveToolSelection(nextTools),
				isCurrent,
			);
			if (!saved && isCurrent() && revision === requestedRevision) {
				selectedTools = new Set(currentGoogleTools(pi));
				requestRender();
			}
		});
	};
	const customResult = await ctx.ui.custom<"closed" | undefined>(
		(tui, theme, keybindings, done) => {
			requestRender = () => tui.requestRender();
			const rows = googleToolSelectorRows();
			let selectedIndex = 0;
			const moveSelection = (delta: number) => {
				selectedIndex = (selectedIndex + delta + rows.length) % rows.length;
			};
			const activateSelectedRow = () => {
				const row = rows[selectedIndex];
				if (!row) return;
				if (row.kind === "tool") {
					if (selectedTools.has(row.toolName)) selectedTools.delete(row.toolName);
					else selectedTools.add(row.toolName);
					commitSelectedTools();
					return;
				}
				if (row.action === "enableAll") {
					selectedTools = new Set(GOOGLE_GENAI_TOOL_NAMES);
					commitSelectedTools();
					return;
				}
				if (row.action === "disableAll") {
					selectedTools = new Set();
					commitSelectedTools();
					return;
				}
				done("closed");
			};

			return {
				invalidate() {},
				render(width: number) {
					return [
						theme.fg("accent", theme.bold(clipLine(googleToolSelectorTitle(selectedTools), width))),
						"",
						...rows.map((row, index) => {
							const prefix = index === selectedIndex ? "› " : "  ";
							const line = clipLine(
								`${prefix}${formatGoogleToolSelectorRow(row, selectedTools)}`,
								width,
							);
							return index === selectedIndex ? theme.fg("accent", line) : line;
						}),
						"",
						theme.fg("dim", clipLine("↑↓ navigate • Enter/Space toggle • Esc close", width)),
					];
				},
				handleInput(data: string) {
					if (keybindings.matches(data, "tui.select.up")) {
						moveSelection(-1);
						tui.requestRender();
						return;
					}
					if (keybindings.matches(data, "tui.select.down")) {
						moveSelection(1);
						tui.requestRender();
						return;
					}
					if (keybindings.matches(data, "tui.select.pageUp")) {
						selectedIndex = 0;
						tui.requestRender();
						return;
					}
					if (keybindings.matches(data, "tui.select.pageDown")) {
						selectedIndex = rows.length - 1;
						tui.requestRender();
						return;
					}
					if (keybindings.matches(data, "tui.select.confirm") || data === " ") {
						activateSelectedRow();
						tui.requestRender();
						return;
					}
					if (keybindings.matches(data, "tui.select.cancel")) done("closed");
				},
			};
		},
	);

	if (!isCurrent()) return;
	if (customResult !== "closed") {
		await showDialogToolSelector(ctx, pi, isCurrent);
		return;
	}
	await persistQueue;
}

async function showDialogToolSelector(
	ctx: ExtensionCommandContext,
	pi: ExtensionAPI,
	isCurrent: () => boolean,
) {
	let selectedTools = new Set(currentGoogleTools(pi));
	while (true) {
		const rows = googleToolSelectorRows();
		const choices = rows.map((row) => formatGoogleToolSelectorRow(row, selectedTools));
		const choice = await ctx.ui.select(googleToolSelectorTitle(selectedTools), choices);
		if (!isCurrent() || !choice) return;
		const row = rows[choices.indexOf(choice)];
		if (!row || (row.kind === "action" && row.action === "done")) return;
		if (row.kind === "tool") {
			if (selectedTools.has(row.toolName)) selectedTools.delete(row.toolName);
			else selectedTools.add(row.toolName);
		} else if (row.action === "enableAll") {
			selectedTools = new Set(GOOGLE_GENAI_TOOL_NAMES);
		} else if (row.action === "disableAll") {
			selectedTools = new Set();
		}
		const ordered = orderedGoogleTools(selectedTools);
		const saved = await transactGoogleToolSelection(
			pi,
			ctx,
			ordered,
			() => saveToolSelection(ordered),
			isCurrent,
		);
		if (!isCurrent()) return;
		if (!saved) selectedTools = new Set(currentGoogleTools(pi));
	}
}

function googleToolSelectorRows(): ToolSelectorRow[] {
	return [
		...GOOGLE_GENAI_TOOL_NAMES.map((toolName) => ({ kind: "tool" as const, toolName })),
		{
			kind: "action",
			action: "enableAll",
			label: "Enable all Google GenAI tools",
		},
		{
			kind: "action",
			action: "disableAll",
			label: "Disable all Google GenAI tools",
		},
		{ kind: "action", action: "done", label: "Done" },
	];
}

function formatGoogleToolSelectorRow(
	row: ToolSelectorRow,
	selectedTools: ReadonlySet<GoogleGenaiToolName>,
) {
	if (row.kind === "action") return row.label;
	return `${selectedTools.has(row.toolName) ? "[x]" : "[ ]"} ${row.toolName}`;
}

function googleToolSelectorTitle(selectedTools: ReadonlySet<GoogleGenaiToolName>) {
	return `Google GenAI tools (${selectedTools.size}/${GOOGLE_GENAI_TOOL_NAMES.length})`;
}

function clipLine(value: string, width: number) {
	return Array.from(value).slice(0, Math.max(0, width)).join("");
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
		if (!isCurrent()) return false;
		let rollbackError: unknown;
		try {
			applyGoogleToolSelection(pi, previousActiveTools.filter(isGoogleGenaiToolName));
		} catch (caught) {
			rollbackError = caught;
		}
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
