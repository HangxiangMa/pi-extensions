import { relative } from "node:path";
import { sanitizeTerminalText } from "./notebook.js";

export const MIN_PREVIEW_TERMINAL_WIDTH = 90;

export type JupyterMenuAction = "open" | "choose" | "focus" | "refresh" | "close" | "help";

export type JupyterMenuState = {
	cwd: string;
	path?: string;
	visible: boolean;
	focused: boolean;
	scroll: number;
	cellCount?: number;
	lastLoadedAt?: Date;
	lastError?: string;
};

export interface JupyterMenuItem {
	value: JupyterMenuAction;
	label: string;
	description?: string;
}

export function jupyterMenuItems(state: JupyterMenuState): JupyterMenuItem[] {
	if (!state.path) {
		return [
			{
				value: "choose",
				label: "Choose a notebook…",
				description: "Select a top-level notebook or enter an explicit path.",
			},
			helpItem(),
		];
	}
	if (!state.visible) {
		return [
			{
				value: "open",
				label: `Open ${displayPath(state)}`,
				description: "Open the selected notebook in the right-side preview.",
			},
			{
				value: "choose",
				label: "Choose another notebook…",
				description: "Keep the current selection unless another notebook loads successfully.",
			},
			helpItem(),
		];
	}
	return [
		{
			value: "focus",
			label: `Focus ${displayPath(state)}`,
			description: "Move keyboard scrolling to the preview; Escape returns to the editor.",
		},
		{
			value: "refresh",
			label: state.lastError ? "Retry refresh" : "Refresh from disk",
			description: "Keep the last valid preview if the notebook cannot be reloaded.",
		},
		{
			value: "choose",
			label: "Switch notebook…",
			description: "Replace the preview only after another notebook loads successfully.",
		},
		{
			value: "close",
			label: "Close preview",
			description: "Close the panel and stop watching the selected notebook.",
		},
		helpItem(),
	];
}

export function jupyterMenuSummary(state: JupyterMenuState, terminalWidth: number): string {
	if (!state.path) return "No notebook selected";
	const parts = [state.focused ? "Focused" : state.visible ? "Open" : "Closed", displayPath(state)];
	if (state.cellCount !== undefined) parts.push(`${state.cellCount} cells`);
	if (state.lastError) {
		parts.push("showing last valid version", sanitizeTerminalText(state.lastError));
	} else if (state.lastLoadedAt) parts.push(`loaded ${state.lastLoadedAt.toLocaleTimeString()}`);
	if (state.visible && terminalWidth < MIN_PREVIEW_TERMINAL_WIDTH) {
		parts.push(`hidden below ${MIN_PREVIEW_TERMINAL_WIDTH} columns`);
	}
	return parts.join(" · ");
}

export function jupyterHelpLines(): string[] {
	return [
		"F8 toggles the preview; Shift+F8 focuses it.",
		"Ctrl+Alt+J/K scroll; Ctrl+Alt+D/U page.",
		"While focused: arrows, PgUp/PgDn, Home, j/k/u/d/g; Escape returns.",
		"Direct routes: /jupyter open, focus, refresh, close, toggle, and scroll.",
	];
}

function helpItem(): JupyterMenuItem {
	return {
		value: "help",
		label: "Controls and shortcuts",
		description: "Review keyboard controls and advanced direct routes.",
	};
}

function displayPath(state: JupyterMenuState): string {
	if (!state.path) return "no notebook";
	const local = relative(state.cwd, state.path);
	return sanitizeTerminalText(local && !local.startsWith("..") ? local : state.path);
}
