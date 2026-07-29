export type WebUIMenuAction = "open" | "settings" | "repair" | "status" | "help";

export interface WebUIMenuState {
	serverRunning: boolean;
	startupAutomatic: boolean;
	settingsSource: string;
	settingsPath: string;
	settingsInvalid: boolean;
}

export interface WebUIMenuItem {
	value: WebUIMenuAction;
	label: string;
	description?: string;
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
