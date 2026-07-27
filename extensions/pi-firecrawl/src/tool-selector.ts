import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { configuredApiUrl, hasApiKey } from "./client.js";
import {
	loadSettings,
	type SettingsLoadResult,
	saveSettings,
	settingsFilePath,
} from "./settings.js";
import { FIRECRAWL_TOOL_NAMES, type FirecrawlToolName } from "./tools.js";

type CommandContext = ExtensionCommandContext;

const TOOL_SELECTOR_DONE = "Done";
const TOOL_SELECTOR_ENABLE_ALL = "Enable all Firecrawl tools";
const TOOL_SELECTOR_DISABLE_ALL = "Disable all Firecrawl tools";
type ToolRuntimeStatus = "enabled" | "disabled" | "partial";
type ToolSelectorAction = "enableAll" | "disableAll" | "done";
type ToolSelectorRow =
	| { kind: "tool"; toolName: FirecrawlToolName }
	| { kind: "action"; action: ToolSelectorAction; label: string };
interface ToolStatusSummary {
	runtimeStatus: ToolRuntimeStatus;
	activeFirecrawlToolCount: number;
	activeNonFirecrawlToolCount: number;
}

let settingsNotice: string | undefined;
let sessionGeneration = 0;

export function advanceFirecrawlSessionGeneration(): number {
	return ++sessionGeneration;
}

export function currentFirecrawlSessionGeneration(): number {
	return sessionGeneration;
}

export function isCurrentFirecrawlSession(generation: number): boolean {
	return generation === sessionGeneration;
}

export function clearSettingsNotice() {
	settingsNotice = undefined;
}

export function recordSettingsNotice(settings: SettingsLoadResult) {
	if (settings.notice) settingsNotice = settings.notice;
}

export async function showToolSelector(pi: ExtensionAPI, ctx: CommandContext) {
	const generation = sessionGeneration;
	if (!ctx.hasUI) return;
	if (ctx.mode !== "tui") {
		await showDialogToolSelector(pi, ctx, generation);
		return;
	}

	let selectedTools = new Set<FirecrawlToolName>(getActiveFirecrawlTools(pi));
	let persistQueue = Promise.resolve();
	let requestedRevision = 0;
	let requestRender: () => void = () => undefined;
	const commitSelectedTools = () => {
		const nextSelectedTools = orderedFirecrawlTools(selectedTools);
		const revision = ++requestedRevision;
		persistQueue = persistQueue.then(async () => {
			const saved = await transactSelectedTools(pi, ctx, nextSelectedTools, generation);
			if (!saved && isCurrentFirecrawlSession(generation) && revision === requestedRevision) {
				selectedTools = new Set(getActiveFirecrawlTools(pi));
				requestRender();
			}
		});
	};

	const customResult = await ctx.ui.custom<"closed" | undefined>(
		(tui, theme, keybindings, done) => {
			requestRender = () => tui.requestRender();
			const rows = firecrawlToolSelectorRows();
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
					selectedTools = new Set(allFirecrawlTools());
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
				render() {
					return [
						theme.fg("accent", theme.bold(toolSelectorTitle(selectedTools))),
						"",
						...rows.map((row, index) => {
							const label = formatToolSelectorRow(row, selectedTools);
							if (index === selectedIndex) {
								return `${theme.fg("accent", "›")} ${theme.fg("accent", label)}`;
							}
							return `  ${label}`;
						}),
						"",
						theme.fg("dim", "↑↓ navigate • Enter/Space toggle • Esc close"),
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
					if (keybindings.matches(data, "tui.select.cancel")) {
						done("closed");
					}
				},
			};
		},
	);

	if (!isCurrentFirecrawlSession(generation)) return;
	if (customResult !== "closed") {
		await showDialogToolSelector(pi, ctx, generation);
		return;
	}

	await persistQueue;
	if (!isCurrentFirecrawlSession(generation)) return;
	const status = await buildStatusMessage(pi);
	if (!isCurrentFirecrawlSession(generation)) return;
	ctx.ui.notify(status, hasApiKey() ? "info" : "warning");
}

async function showDialogToolSelector(pi: ExtensionAPI, ctx: CommandContext, generation: number) {
	let selectedTools = new Set<FirecrawlToolName>(getActiveFirecrawlTools(pi));
	while (true) {
		const rows = firecrawlToolSelectorRows();
		const choices = rows.map((row) => formatToolSelectorRow(row, selectedTools));
		const choice = await ctx.ui.select(toolSelectorTitle(selectedTools), choices);
		if (!isCurrentFirecrawlSession(generation) || !choice) break;

		const row = rows[choices.indexOf(choice)];
		if (!row) continue;
		if (row.kind === "action" && row.action === "done") break;

		if (row.kind === "tool") {
			if (selectedTools.has(row.toolName)) selectedTools.delete(row.toolName);
			else selectedTools.add(row.toolName);
		} else if (row.action === "enableAll") {
			selectedTools = new Set(allFirecrawlTools());
		} else if (row.action === "disableAll") {
			selectedTools = new Set();
		}

		const saved = await transactSelectedTools(
			pi,
			ctx,
			orderedFirecrawlTools(selectedTools),
			generation,
		);
		if (!isCurrentFirecrawlSession(generation)) return;
		if (!saved) selectedTools = new Set(getActiveFirecrawlTools(pi));
	}

	if (!isCurrentFirecrawlSession(generation)) return;
	const status = await buildStatusMessage(pi);
	if (!isCurrentFirecrawlSession(generation)) return;
	ctx.ui.notify(status, hasApiKey() ? "info" : "warning");
}

export async function updateFirecrawlTools(
	pi: ExtensionAPI,
	ctx: CommandContext,
	selectedTools: readonly FirecrawlToolName[],
	action: string,
) {
	const generation = sessionGeneration;
	const saved = await transactSelectedTools(pi, ctx, selectedTools, generation);
	if (!saved || !isCurrentFirecrawlSession(generation)) return;
	const status = await buildStatusMessage(pi);
	if (!isCurrentFirecrawlSession(generation)) return;
	ctx.ui.notify(`Firecrawl tools ${action}.\n\n${status}`, hasApiKey() ? "info" : "warning");
}

export async function setSelectedFirecrawlTools(
	pi: ExtensionAPI,
	ctx: CommandContext,
	selectedTools: readonly FirecrawlToolName[],
): Promise<boolean> {
	return transactSelectedTools(pi, ctx, selectedTools, sessionGeneration);
}

let toolTransactionQueue = Promise.resolve();

export async function waitForFirecrawlSettings(): Promise<void> {
	await toolTransactionQueue;
}

function transactSelectedTools(
	pi: ExtensionAPI,
	ctx: CommandContext,
	selectedTools: readonly FirecrawlToolName[],
	expectedGeneration: number,
): Promise<boolean> {
	const operation = toolTransactionQueue.then(() =>
		transactSelectedToolsNow(pi, ctx, selectedTools, expectedGeneration),
	);
	toolTransactionQueue = operation.then(
		() => undefined,
		() => undefined,
	);
	return operation;
}

async function transactSelectedToolsNow(
	pi: ExtensionAPI,
	ctx: CommandContext,
	selectedTools: readonly FirecrawlToolName[],
	expectedGeneration: number,
): Promise<boolean> {
	if (!isCurrentFirecrawlSession(expectedGeneration)) return false;
	const previousActiveTools = pi.getActiveTools();
	try {
		applyFirecrawlTools(pi, selectedTools);
		await persistSettings(selectedTools);
		return isCurrentFirecrawlSession(expectedGeneration);
	} catch (error) {
		if (!isCurrentFirecrawlSession(expectedGeneration)) return false;
		let rollbackError: unknown;
		try {
			const previousFirecrawlTools = previousActiveTools.filter((name) =>
				FIRECRAWL_TOOL_NAMES.includes(name as FirecrawlToolName),
			) as FirecrawlToolName[];
			applyFirecrawlTools(pi, previousFirecrawlTools);
		} catch (caught) {
			rollbackError = caught;
		}
		ctx.ui.notify(
			rollbackError
				? `Firecrawl settings save failed: ${formatError(error)}; active-tool rollback failed: ${formatError(rollbackError)}`
				: `Firecrawl settings save failed; active tools restored: ${formatError(error)}`,
			"warning",
		);
		return false;
	}
}

export function applyFirecrawlTools(pi: ExtensionAPI, selectedTools: readonly FirecrawlToolName[]) {
	const activeToolNames = pi.getActiveTools();
	const firecrawlToolNames = new Set<string>(FIRECRAWL_TOOL_NAMES);
	const activeNonFirecrawlToolNames = activeToolNames.filter(
		(name) => !firecrawlToolNames.has(name),
	);
	pi.setActiveTools(unique([...activeNonFirecrawlToolNames, ...selectedTools]));
}

function getToolStatusSummary(pi: ExtensionAPI): ToolStatusSummary {
	const firecrawlToolNames = new Set<string>(FIRECRAWL_TOOL_NAMES);
	const activeToolNames = new Set(pi.getActiveTools());
	const activeFirecrawlToolCount = FIRECRAWL_TOOL_NAMES.filter((name) =>
		activeToolNames.has(name),
	).length;
	const activeNonFirecrawlToolCount = Array.from(activeToolNames).filter(
		(name) => !firecrawlToolNames.has(name),
	).length;
	const runtimeStatus =
		activeFirecrawlToolCount === FIRECRAWL_TOOL_NAMES.length
			? "enabled"
			: activeFirecrawlToolCount === 0
				? "disabled"
				: "partial";

	return { runtimeStatus, activeFirecrawlToolCount, activeNonFirecrawlToolCount };
}

export async function buildStatusMessage(pi: ExtensionAPI) {
	const summary = getToolStatusSummary(pi);
	const persistedSetting = await persistedSettingLabel();
	return [
		`Firecrawl tools: ${formatRuntimeStatus(summary)}`,
		`Persisted selection: ${persistedSetting}`,
		`Settings file: ${settingsFilePath()}`,
		...(settingsNotice ? [`Settings note: ${settingsNotice}`] : []),
		`Other active tools preserved: ${summary.activeNonFirecrawlToolCount}`,
		`API key: ${hasApiKey() ? "present" : "missing"} (FIRECRAWL_API_KEY)`,
		`API URL: ${configuredApiUrl()}`,
	].join("\n");
}

export function buildConfigMessage() {
	return [
		"Firecrawl configuration:",
		`API key: ${hasApiKey() ? "present" : "missing"} (FIRECRAWL_API_KEY)`,
		`API URL: ${configuredApiUrl()}`,
		"Override API URL with FIRECRAWL_API_URL or FIRECRAWL_BASE_URL.",
		"This extension never logs, displays, or stores your Firecrawl API key.",
	].join("\n");
}

export function buildCommandGuide() {
	return [
		"Firecrawl commands:",
		"/firecrawl — open this menu",
		"/firecrawl help — show command usage",
		"/firecrawl config — show API key presence and API URL",
		"/firecrawl quickstart — alias for /firecrawl config",
		"/firecrawl status — show tool and settings status",
		"/firecrawl tools — select individual Firecrawl tools",
		"/firecrawl toggle — alias for /firecrawl tools",
		"/firecrawl enable — enable all Firecrawl tools",
		"/firecrawl disable — disable all Firecrawl tools",
	].join("\n");
}

function toolSelectorTitle(selectedTools: ReadonlySet<FirecrawlToolName>) {
	return `Firecrawl tools (${selectedTools.size}/${FIRECRAWL_TOOL_NAMES.length}). Non-built-in tools run at user risk.`;
}

function firecrawlToolSelectorRows(): ToolSelectorRow[] {
	return [
		...FIRECRAWL_TOOL_NAMES.map((toolName) => ({ kind: "tool" as const, toolName })),
		{ kind: "action", action: "enableAll", label: TOOL_SELECTOR_ENABLE_ALL },
		{ kind: "action", action: "disableAll", label: TOOL_SELECTOR_DISABLE_ALL },
		{ kind: "action", action: "done", label: TOOL_SELECTOR_DONE },
	];
}

function formatToolSelectorRow(
	row: ToolSelectorRow,
	selectedTools: ReadonlySet<FirecrawlToolName>,
) {
	if (row.kind === "action") return row.label;
	return `${selectedTools.has(row.toolName) ? "[x]" : "[ ]"} ${row.toolName}`;
}

function getActiveFirecrawlTools(pi: ExtensionAPI) {
	const activeToolNames = new Set(pi.getActiveTools());
	return FIRECRAWL_TOOL_NAMES.filter((toolName) => activeToolNames.has(toolName));
}

export function allFirecrawlTools() {
	return [...FIRECRAWL_TOOL_NAMES];
}

function unique<T>(values: T[]) {
	return Array.from(new Set(values));
}

export function orderedFirecrawlTools(selectedTools: ReadonlySet<FirecrawlToolName>) {
	return FIRECRAWL_TOOL_NAMES.filter((toolName) => selectedTools.has(toolName));
}

function formatRuntimeStatus(summary: ToolStatusSummary) {
	return `${summary.runtimeStatus} (${summary.activeFirecrawlToolCount}/${FIRECRAWL_TOOL_NAMES.length} active)`;
}

async function persistedSettingLabel() {
	const settings = await loadSettings();
	recordSettingsNotice(settings);
	if (settings.kind === "loaded") return formatPersistedSelection(settings.settings.tools);
	if (settings.kind === "invalid") {
		return `none; current active-tool policy preserved (invalid settings ignored: ${settings.reason})`;
	}
	return "none; current active-tool policy preserved";
}

export function formatPersistedSelection(tools: readonly FirecrawlToolName[]) {
	if (tools.length === FIRECRAWL_TOOL_NAMES.length) {
		return `all enabled (${tools.length}/${FIRECRAWL_TOOL_NAMES.length} selected)`;
	}
	if (tools.length === 0) return `all disabled (0/${FIRECRAWL_TOOL_NAMES.length} selected)`;
	return `${tools.length}/${FIRECRAWL_TOOL_NAMES.length} selected: ${tools.join(", ")}`;
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

async function persistSettings(selectedTools: readonly FirecrawlToolName[]) {
	await saveSettings({ tools: [...selectedTools], updatedAt: Date.now() });
}
