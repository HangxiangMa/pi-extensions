import { basename, relative } from "node:path";
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
	Container,
	Key,
	matchesKey,
	type SelectItem,
	SelectList,
	Text,
} from "@earendil-works/pi-tui";
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

export interface JupyterMenuItem extends SelectItem {
	value: JupyterMenuAction;
}

export type NotebookPickerResult =
	| { action: "select"; path: string }
	| { action: "enter-path" }
	| { action: "back" }
	| { action: "close" };

type TuiRenderHost = { requestRender(): void };

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
	if (state.lastError)
		parts.push("showing last valid version", sanitizeTerminalText(state.lastError));
	else if (state.lastLoadedAt) parts.push(`loaded ${state.lastLoadedAt.toLocaleTimeString()}`);
	if (state.visible && terminalWidth < MIN_PREVIEW_TERMINAL_WIDTH) {
		parts.push(`hidden below ${MIN_PREVIEW_TERMINAL_WIDTH} columns`);
	}
	return parts.join(" · ");
}

export function createJupyterMenuComponent(
	state: JupyterMenuState,
	terminalWidth: number,
	tui: TuiRenderHost,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: (action: JupyterMenuAction | undefined) => void,
	selectedAction?: JupyterMenuAction,
) {
	const items = jupyterMenuItems(state);
	const container = new Container();
	const title = new Text(theme.fg("accent", theme.bold("Jupyter Preview")), 1, 1);
	const summary = new Text(jupyterMenuSummary(state, terminalWidth), 1, 0);
	const preview = new Text("", 1, 1);
	const list = createSelectList(items, theme);
	const selectedIndex = Math.max(
		0,
		items.findIndex((item) => item.value === selectedAction),
	);
	list.setSelectedIndex(selectedIndex);
	const updatePreview = (item: SelectItem) =>
		preview.setText(`Effect: ${item.description ?? item.label}`);
	updatePreview(items[selectedIndex]);
	list.onSelectionChange = updatePreview;
	list.onSelect = (item) => done(item.value as JupyterMenuAction);
	list.onCancel = () => done(undefined);
	container.addChild(title);
	container.addChild(summary);
	container.addChild(list);
	container.addChild(preview);
	container.addChild(
		new Text(
			theme.fg(
				"dim",
				`${keybindingHint(keybindings, "tui.select.confirm", "Enter", "select")} · ${keybindingHint(keybindings, "tui.select.cancel", "Esc", "close")}`,
			),
			1,
			0,
		),
	);
	return selectorComponent(container, list, tui, keybindings, {
		onCancel: () => done(undefined),
		onClose: () => done(undefined),
	});
}

export function createNotebookPickerComponent(
	paths: readonly string[],
	selectedPath: string | undefined,
	tui: TuiRenderHost,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: (result: NotebookPickerResult) => void,
) {
	const items: SelectItem[] = [
		...paths.map((path) => ({
			value: path,
			label: sanitizeTerminalText(basename(path)),
			description: path === selectedPath ? "Currently selected" : sanitizeTerminalText(path),
		})),
		{
			value: "__enter_path__",
			label: "Enter a path…",
			description: "Open an explicit .ipynb path, including a path outside this workspace.",
		},
	];
	const container = new Container();
	container.addChild(new Text(theme.fg("accent", theme.bold("Choose a notebook")), 1, 1));
	const list = createSelectList(items, theme);
	const preview = new Text("", 1, 1);
	const selectedIndex = Math.max(
		0,
		items.findIndex((item) => item.value === selectedPath),
	);
	list.setSelectedIndex(selectedIndex);
	const updatePreview = (item: SelectItem) => {
		preview.setText(
			item.value === "__enter_path__"
				? "Effect: enter and validate an explicit notebook path."
				: `Open after successful validation: ${sanitizeTerminalText(item.value)}`,
		);
	};
	updatePreview(items[selectedIndex]);
	list.onSelectionChange = updatePreview;
	list.onSelect = (item) => {
		if (item.value === "__enter_path__") done({ action: "enter-path" });
		else done({ action: "select", path: item.value });
	};
	list.onCancel = () => done({ action: "back" });
	container.addChild(list);
	container.addChild(preview);
	container.addChild(
		new Text(
			theme.fg(
				"dim",
				`${keybindingHint(keybindings, "tui.select.confirm", "Enter", "select")} · ${keybindingHint(keybindings, "tui.select.cancel", "Esc", "back")} · Ctrl+C close`,
			),
			1,
			1,
		),
	);
	return selectorComponent(container, list, tui, keybindings, {
		onCancel: () => done({ action: "back" }),
		onClose: () => done({ action: "close" }),
	});
}

export function createJupyterHelpComponent(
	tui: TuiRenderHost,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: (result: "back" | "close") => void,
) {
	const container = new Container();
	container.addChild(new Text(theme.fg("accent", theme.bold("Jupyter controls")), 1, 1));
	container.addChild(new Text(jupyterHelpLines().join("\n"), 1, 0));
	container.addChild(
		new Text(
			theme.fg(
				"dim",
				`${keybindingHint(keybindings, "tui.select.cancel", "Esc", "back")} · Ctrl+C close`,
			),
			1,
			1,
		),
	);
	return {
		render: (width: number) => container.render(width),
		invalidate: () => container.invalidate(),
		handleInput(data: string) {
			if (matchesKey(data, Key.ctrl("c"))) done("close");
			else if (keybindings.matches(data, "tui.select.cancel")) done("back");
			tui.requestRender();
		},
	};
}

export function jupyterHelpLines(): string[] {
	return [
		"F8 toggles the preview; Shift+F8 focuses it.",
		"Ctrl+Alt+J/K scroll; Ctrl+Alt+D/U page.",
		"While focused: arrows, PgUp/PgDn, Home, j/k/u/d/g; Escape returns.",
		"Direct routes: /jupyter open, focus, refresh, close, toggle, and scroll.",
	];
}

function selectorComponent(
	container: Container,
	list: SelectList,
	tui: TuiRenderHost,
	keybindings: KeybindingsManager,
	actions: { onCancel(): void; onClose(): void },
) {
	return {
		render: (width: number) => container.render(width),
		invalidate: () => container.invalidate(),
		handleInput(data: string) {
			if (matchesKey(data, Key.ctrl("c"))) actions.onClose();
			else if (keybindings.matches(data, "tui.select.cancel")) actions.onCancel();
			else if (keybindings.matches(data, "tui.select.confirm")) {
				const item = list.getSelectedItem();
				if (item) list.onSelect?.(item);
			} else if (keybindings.matches(data, "tui.select.up")) list.handleInput(Key.up);
			else if (keybindings.matches(data, "tui.select.down")) list.handleInput(Key.down);
			else if (keybindings.matches(data, "tui.select.pageUp")) list.handleInput(Key.pageUp);
			else if (keybindings.matches(data, "tui.select.pageDown")) list.handleInput(Key.pageDown);
			else list.handleInput(data);
			tui.requestRender();
		},
	};
}

function createSelectList(items: SelectItem[], theme: Theme): SelectList {
	return new SelectList(items, Math.min(items.length, 8), {
		selectedPrefix: (text) => theme.fg("accent", text),
		selectedText: (text) => theme.fg("accent", text),
		description: (text) => theme.fg("muted", text),
		scrollInfo: (text) => theme.fg("dim", text),
		noMatch: (text) => theme.fg("warning", text),
	});
}

function helpItem(): JupyterMenuItem {
	return {
		value: "help",
		label: "Controls and shortcuts",
		description: "Review keyboard controls and advanced direct routes.",
	};
}

function keybindingHint(
	keybindings: KeybindingsManager,
	id: "tui.select.confirm" | "tui.select.cancel",
	fallback: string,
	action: string,
): string {
	const keys = (
		keybindings as KeybindingsManager & { getKeys?: (key: string) => string[] }
	).getKeys?.(id);
	return `${keys?.[0] ?? fallback} ${action}`;
}

function displayPath(state: JupyterMenuState): string {
	if (!state.path) return "no notebook";
	const local = relative(state.cwd, state.path);
	return sanitizeTerminalText(local && !local.startsWith("..") ? local : state.path);
}
