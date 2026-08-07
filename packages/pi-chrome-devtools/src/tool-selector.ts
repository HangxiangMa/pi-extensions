import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	browserCandidateHint,
	devToolsEndpoint,
	endpointConfigHint,
	endpointSourceLabel,
	launchAttemptLines,
	launchHint,
	launchModeLabel,
} from "./browser-manager.js";
import { state } from "./runtime.js";
import { loadSettings, saveSettings, settingsFilePath } from "./settings.js";
import { CHROME_DEVTOOLS_TOOL_NAMES, type ChromeDevToolsToolName } from "./tool-names.js";

type CommandContext = ExtensionCommandContext;
type ToolSelectorScreen = "tools";
type ToolSelectorAction = "toggle" | "enableAll" | "disableAll";

function unique<T>(values: T[]) {
	return Array.from(new Set(values));
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

interface ToolStatusSummary {
	runtimeStatus: "enabled" | "disabled" | "partial";
	activeChromeToolCount: number;
	activeNonChromeToolCount: number;
}

export async function showToolSelector(pi: ExtensionAPI, ctx: CommandContext) {
	const generation = state.sessionGeneration;
	if (!ctx.hasUI) return;
	const menuSignal = state.sessionController.signal;
	const isCurrent = () => generation === state.sessionGeneration && !menuSignal.aborted;
	const { defineMenu, runMenu } = await import("@narumitw/pi-tui-kit");
	if (!isCurrent()) return;
	const menu = defineMenu<undefined, ToolSelectorScreen, ToolSelectorAction>({
		start: "tools",
		screens: {
			tools: () => {
				const selectedTools = new Set(getActiveChromeDevtoolsTools(pi));
				return {
					kind: "multiSelect",
					title: toolSelectorTitle(selectedTools),
					items: CHROME_DEVTOOLS_TOOL_NAMES.map((toolName) => ({
						id: toolName,
						label: toolName,
						selected: selectedTools.has(toolName),
					})),
					action: "toggle",
					actions: [
						{
							id: "enable-all",
							label: "Enable all Chrome DevTools tools",
							action: "enableAll",
						},
						{
							id: "disable-all",
							label: "Disable all Chrome DevTools tools",
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
				if (!isChromeDevtoolsToolName(itemId)) return { kind: "rejected" };
				const selectedTools = new Set(getActiveChromeDevtoolsTools(pi));
				if (selected) selectedTools.add(itemId);
				else selectedTools.delete(itemId);
				const saved = await transactSelectedTools(
					pi,
					ctx,
					orderedChromeDevtoolsTools(selectedTools),
					generation,
				);
				return saved ? { kind: "stay" } : { kind: "rejected" };
			},
			enableAll: async () => {
				const saved = await transactSelectedTools(pi, ctx, allChromeDevtoolsTools(), generation);
				return saved ? { kind: "stay" } : { kind: "rejected" };
			},
			disableAll: async () => {
				const saved = await transactSelectedTools(pi, ctx, [], generation);
				return saved ? { kind: "stay" } : { kind: "rejected" };
			},
		},
	});
	const result = await runMenu(ctx, menu, {
		getState: () => undefined,
		signal: menuSignal,
		isCurrent,
	});
	if (result.kind !== "closed" || generation !== state.sessionGeneration) return;
	const status = await buildToolStatusMessage(pi);
	if (generation !== state.sessionGeneration) return;
	ctx.ui.notify(status, "info");
}

export async function updateChromeDevtoolsTools(
	pi: ExtensionAPI,
	ctx: CommandContext,
	selectedTools: readonly ChromeDevToolsToolName[],
	action: string,
) {
	const generation = state.sessionGeneration;
	const saved = await transactSelectedTools(pi, ctx, selectedTools, generation);
	if (!saved || generation !== state.sessionGeneration) return;
	const status = await buildToolStatusMessage(pi);
	if (generation !== state.sessionGeneration) return;
	ctx.ui.notify(`Chrome DevTools tools ${action}.\n\n${status}`, "info");
}

export async function setSelectedChromeDevtoolsTools(
	pi: ExtensionAPI,
	ctx: CommandContext,
	selectedTools: readonly ChromeDevToolsToolName[],
): Promise<boolean> {
	return transactSelectedTools(pi, ctx, selectedTools, state.sessionGeneration);
}

let toolTransactionQueue = Promise.resolve();

export async function waitForChromeDevtoolsSettings(): Promise<void> {
	await toolTransactionQueue;
}

function transactSelectedTools(
	pi: ExtensionAPI,
	ctx: CommandContext,
	selectedTools: readonly ChromeDevToolsToolName[],
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
	selectedTools: readonly ChromeDevToolsToolName[],
	expectedGeneration: number,
): Promise<boolean> {
	if (expectedGeneration !== state.sessionGeneration) return false;
	const previousActiveTools = pi.getActiveTools();
	try {
		applyChromeDevtoolsTools(pi, selectedTools);
		await persistSettings(selectedTools);
		return expectedGeneration === state.sessionGeneration;
	} catch (error) {
		let rollbackError: unknown;
		try {
			const previousChromeTools = previousActiveTools.filter((name) =>
				CHROME_DEVTOOLS_TOOL_NAMES.includes(name as ChromeDevToolsToolName),
			) as ChromeDevToolsToolName[];
			applyChromeDevtoolsTools(pi, previousChromeTools);
		} catch (caught) {
			rollbackError = caught;
		}
		if (expectedGeneration !== state.sessionGeneration) return false;
		ctx.ui.notify(
			sanitizeChromeDevtoolsDisplay(
				rollbackError
					? `Chrome DevTools settings save failed: ${formatError(error)}; active-tool rollback failed: ${formatError(rollbackError)}`
					: `Chrome DevTools settings save failed; active tools restored: ${formatError(error)}`,
			),
			"warning",
		);
		return false;
	}
}

export function applyChromeDevtoolsTools(
	pi: ExtensionAPI,
	selectedTools: readonly ChromeDevToolsToolName[],
) {
	const activeToolNames = pi.getActiveTools();
	const chromeToolNames = new Set<string>(CHROME_DEVTOOLS_TOOL_NAMES);
	const activeNonChromeToolNames = activeToolNames.filter((name) => !chromeToolNames.has(name));
	pi.setActiveTools(unique([...activeNonChromeToolNames, ...selectedTools]));
}

function getToolStatusSummary(pi: ExtensionAPI): ToolStatusSummary {
	const chromeToolNames = new Set<string>(CHROME_DEVTOOLS_TOOL_NAMES);
	const activeToolNames = new Set(pi.getActiveTools());
	const activeChromeToolCount = CHROME_DEVTOOLS_TOOL_NAMES.filter((name) =>
		activeToolNames.has(name),
	).length;
	const activeNonChromeToolCount = Array.from(activeToolNames).filter(
		(name) => !chromeToolNames.has(name),
	).length;
	const runtimeStatus =
		activeChromeToolCount === CHROME_DEVTOOLS_TOOL_NAMES.length
			? "enabled"
			: activeChromeToolCount === 0
				? "disabled"
				: "partial";

	return { runtimeStatus, activeChromeToolCount, activeNonChromeToolCount };
}

export async function buildToolStatusMessage(pi: ExtensionAPI) {
	const summary = getToolStatusSummary(pi);
	const persistedSetting = await persistedSettingLabel();
	return sanitizeChromeDevtoolsDisplay(
		[
			`Chrome DevTools tools: ${formatRuntimeStatus(summary)}`,
			`Persisted selection: ${persistedSetting}`,
			...browserSettingsStatusLines(),
			...(state.settingsNotice ? [`Settings note: ${state.settingsNotice}`] : []),
			`Other active tools preserved: ${summary.activeNonChromeToolCount}`,
			`Endpoint: ${devToolsEndpoint()}`,
			`Endpoint source: ${endpointSourceLabel()}`,
			`Launch mode: ${launchModeLabel()}`,
			...launchAttemptLines(),
		].join("\n"),
	);
}

export function buildQuickstartMessage() {
	return sanitizeChromeDevtoolsDisplay(
		[
			`Chrome DevTools endpoint: ${devToolsEndpoint()}`,
			`Endpoint source: ${endpointSourceLabel()}`,
			`Launch mode: ${launchModeLabel()}`,
			...browserSettingsStatusLines(),
			launchHint(),
			browserCandidateHint(),
			...launchAttemptLines(),
			endpointConfigHint(),
		].join("\n"),
	);
}

export function sanitizeChromeDevtoolsDisplay(value: string, maxCharacters = 50_000) {
	const sanitized = Array.from(stripVTControlCharacters(value), (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		const unsafeControl =
			(codePoint >= 0 && codePoint <= 8) ||
			(codePoint >= 11 && codePoint <= 31) ||
			(codePoint >= 127 && codePoint <= 159);
		return unsafeControl ? "�" : character;
	}).join("");
	if (sanitized.length <= maxCharacters) return sanitized;
	return `${sanitized.slice(0, Math.max(0, maxCharacters - 1))}…`;
}

function browserSettingsStatusLines() {
	const extensionLines =
		state.extensionPaths.length > 0
			? state.extensionPaths.map((extensionPath) => `  - ${extensionPath}`)
			: ["  - none"];
	return [
		`Settings file: ${state.settingsFilePath ?? settingsFilePath()} (user)`,
		...(state.projectSettingsFilePath
			? [
					`Project settings: ${state.projectSettingsFilePath} (${state.projectSettingsTrusted ? "trusted" : "untrusted; ignored"})`,
				]
			: []),
		`Browser executable: ${state.browserExecutable ?? "automatic discovery"} (${state.browserExecutableSource})`,
		`Unpacked extensions (${state.extensionPathsSource}):`,
		...extensionLines,
		"Settings changes apply to a new managed browser after /reload or session replacement.",
		...(state.extensionPaths.length > 0
			? [
					"Unpacked extensions require Chrome for Testing or Chromium and execute trusted browser code.",
				]
			: []),
	];
}

export function buildCommandGuide() {
	return [
		"Chrome DevTools commands:",
		"/chrome-devtools — open this menu",
		"/chrome-devtools help — show command usage",
		"/chrome-devtools quickstart — show endpoint and launch help",
		"/chrome-devtools status — show tool and settings status",
		"/chrome-devtools tools — select individual Chrome DevTools tools",
		"/chrome-devtools toggle — alias for /chrome-devtools tools",
		"/chrome-devtools enable — enable all Chrome DevTools tools",
		"/chrome-devtools disable — disable all Chrome DevTools tools",
	].join("\n");
}

function toolSelectorTitle(selectedTools: ReadonlySet<ChromeDevToolsToolName>) {
	return `Chrome DevTools tools (${selectedTools.size}/${CHROME_DEVTOOLS_TOOL_NAMES.length}). Non-built-in tools run at user risk.`;
}

function isChromeDevtoolsToolName(value: string): value is ChromeDevToolsToolName {
	return CHROME_DEVTOOLS_TOOL_NAMES.includes(value as ChromeDevToolsToolName);
}

function getActiveChromeDevtoolsTools(pi: ExtensionAPI) {
	const activeToolNames = new Set(pi.getActiveTools());
	return CHROME_DEVTOOLS_TOOL_NAMES.filter((toolName) => activeToolNames.has(toolName));
}

export function allChromeDevtoolsTools() {
	return [...CHROME_DEVTOOLS_TOOL_NAMES];
}

export function orderedChromeDevtoolsTools(selectedTools: ReadonlySet<ChromeDevToolsToolName>) {
	return CHROME_DEVTOOLS_TOOL_NAMES.filter((toolName) => selectedTools.has(toolName));
}

function formatRuntimeStatus(summary: ToolStatusSummary) {
	return `${summary.runtimeStatus} (${summary.activeChromeToolCount}/${CHROME_DEVTOOLS_TOOL_NAMES.length} active)`;
}

async function persistedSettingLabel() {
	const settings = await loadSettings();
	if (settings.kind === "loaded" && settings.settings.tools) {
		return formatPersistedSelection(settings.settings.tools);
	}
	if (settings.kind === "invalid") {
		return `none; current active-tool policy preserved (invalid settings ignored: ${settings.reason})`;
	}
	return "none; current active-tool policy preserved";
}

function formatPersistedSelection(tools: readonly ChromeDevToolsToolName[]) {
	if (tools.length === CHROME_DEVTOOLS_TOOL_NAMES.length) {
		return `all enabled (${tools.length}/${CHROME_DEVTOOLS_TOOL_NAMES.length} selected)`;
	}
	if (tools.length === 0) return `all disabled (0/${CHROME_DEVTOOLS_TOOL_NAMES.length} selected)`;
	return `${tools.length}/${CHROME_DEVTOOLS_TOOL_NAMES.length} selected: ${tools.join(", ")}`;
}

async function persistSettings(selectedTools: readonly ChromeDevToolsToolName[]) {
	await saveSettings({ tools: [...selectedTools], updatedAt: Date.now() });
}
