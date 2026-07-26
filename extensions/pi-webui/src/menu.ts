import { keyHint, type Theme } from "@earendil-works/pi-coding-agent";
import {
	Container,
	type KeybindingsManager,
	type SelectItem,
	SelectList,
	Text,
} from "@earendil-works/pi-tui";

export type WebUIMenuAction = "open" | "settings" | "repair" | "status" | "help";

export interface WebUIMenuState {
	serverRunning: boolean;
	startupAutomatic: boolean;
	settingsSource: string;
	settingsPath: string;
	settingsInvalid: boolean;
}

export interface WebUIMenuItem extends SelectItem {
	value: WebUIMenuAction;
}

interface TuiRenderHost {
	requestRender(): void;
}

export function webUIMenuItems(state: WebUIMenuState): WebUIMenuItem[] {
	const primary: WebUIMenuItem = state.serverRunning
		? {
				value: "open",
				label: "Get a fresh link",
				description: "Keep the current server and invalidate any unused earlier bootstrap link.",
			}
		: {
				value: "open",
				label: "Open WebUI",
				description:
					"Start a private browser companion for this Pi session and create a one-time link.",
			};
	const settings: WebUIMenuItem = state.settingsInvalid
		? {
				value: "repair",
				label: "Repair settings file",
				description:
					"Safe defaults are active; inspect the preserved invalid JSON before reloading.",
			}
		: {
				value: "settings",
				label: "Settings",
				description: `Startup: ${startupLabel(state)}. Changes save immediately and apply on the next session initialization.`,
			};
	return [
		primary,
		settings,
		{
			value: "status",
			label: "Status & diagnostics",
			description: "Review effective startup, settings source, image limits, and server state.",
		},
		{
			value: "help",
			label: "Help",
			description: "Review the browser workflow, direct commands, and advanced settings path.",
		},
	];
}

export function webUIMenuTitle(state: WebUIMenuState): string {
	const lines = [
		"Pi WebUI",
		`Server: ${state.serverRunning ? "Running" : "Stopped"} · Startup: ${startupLabel(state)} · Source: ${safeTerminalText(state.settingsSource)}`,
	];
	if (state.settingsInvalid) {
		lines.push(
			"Settings need repair · Safe defaults are active",
			`File: ${safeTerminalText(state.settingsPath)}`,
		);
	}
	return lines.join("\n");
}

export function createWebUIMenuComponent(
	state: WebUIMenuState,
	tui: TuiRenderHost,
	theme: Theme,
	done: (action: WebUIMenuAction | undefined) => void,
	selectedAction?: WebUIMenuAction,
) {
	const items = webUIMenuItems(state);
	const container = new Container();
	const title = new Text(theme.fg("accent", theme.bold("Pi WebUI")), 1, 1);
	container.addChild(title);
	container.addChild(
		new Text(
			[
				`Server: ${state.serverRunning ? "Running" : "Stopped"}`,
				`Startup: ${startupLabel(state)} · Source: ${safeTerminalText(state.settingsSource)}`,
				...(state.settingsInvalid
					? [
							"Settings need repair · Safe defaults are active",
							`File: ${safeTerminalText(state.settingsPath)}`,
						]
					: []),
			].join("\n"),
			1,
			0,
		),
	);
	const preview = new Text("", 1, 1);
	const list = new SelectList(items, items.length, {
		selectedPrefix: (text) => theme.fg("accent", text),
		selectedText: (text) => theme.fg("accent", text),
		description: (text) => theme.fg("muted", text),
		scrollInfo: (text) => theme.fg("dim", text),
		noMatch: (text) => theme.fg("warning", text),
	});
	const updatePreview = (item: SelectItem) => {
		preview.setText(`Effect: ${safeTerminalText(item.description ?? item.label)}`);
	};
	const selectedIndex = Math.max(
		0,
		items.findIndex((item) => item.value === selectedAction),
	);
	list.setSelectedIndex(selectedIndex);
	updatePreview(items[selectedIndex]);
	list.onSelectionChange = updatePreview;
	list.onSelect = (item) => done(item.value as WebUIMenuAction);
	list.onCancel = () => done(undefined);
	container.addChild(list);
	container.addChild(preview);
	const hintText = () =>
		theme.fg(
			"dim",
			`${keyHint("tui.select.confirm", "select")} · ${keyHint("tui.select.cancel", "close")}`,
		);
	const hint = new Text(hintText(), 1, 0);
	container.addChild(hint);
	return {
		render: (width: number) => container.render(width),
		invalidate: () => {
			title.setText(theme.fg("accent", theme.bold("Pi WebUI")));
			hint.setText(hintText());
			container.invalidate();
		},
		handleInput(data: string) {
			list.handleInput(data);
			tui.requestRender();
		},
	};
}

export function createWebUIDetailComponent(
	title: string,
	lines: readonly string[],
	tui: TuiRenderHost,
	theme: Theme,
	keybindings: KeybindingsManager,
	done: () => void,
) {
	const container = new Container();
	const heading = new Text(theme.fg("accent", theme.bold(safeTerminalText(title))), 1, 1);
	const hint = new Text(theme.fg("dim", keyHint("tui.select.cancel", "back")), 1, 1);
	container.addChild(heading);
	container.addChild(new Text(lines.map((line) => safeTerminalText(line)).join("\n"), 1, 0));
	container.addChild(hint);
	return {
		render: (width: number) => container.render(width),
		invalidate: () => {
			heading.setText(theme.fg("accent", theme.bold(safeTerminalText(title))));
			hint.setText(theme.fg("dim", keyHint("tui.select.cancel", "back")));
			container.invalidate();
		},
		handleInput(data: string) {
			if (keybindings.matches(data, "tui.select.cancel")) done();
			tui.requestRender();
		},
	};
}

export function safeTerminalText(value: unknown): string {
	return [...String(value)]
		.map((character) => {
			const code = character.charCodeAt(0);
			return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
}

function startupLabel(state: WebUIMenuState): string {
	return state.startupAutomatic ? "Every session" : "Manual";
}
