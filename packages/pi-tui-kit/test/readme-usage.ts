import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	defineMenu,
	type InputScreen,
	type MenuCloseReason,
	type MultiSelectScreen,
	type ReviewScreen,
	runMenu,
} from "../src/index.js";

type Screen = "main" | "profile" | "settings";
type Action = "refresh" | "setMode" | "setProfile";
interface State {
	mode: "Safe" | "Fast";
	profile: "Minimal" | "Balanced" | "Custom";
}

declare function refreshDomainState(signal: AbortSignal): Promise<void>;
declare function saveMode(mode: State["mode"], signal: AbortSignal): Promise<void>;
declare function saveProfile(profile: string, signal: AbortSignal): Promise<void>;
declare function loadState(signal: AbortSignal): Promise<State>;
declare function currentGeneration(): number;
declare function currentSessionSignal(): AbortSignal;
declare function formatError(error: unknown): string;

const searchableToolsScreen: MultiSelectScreen<Screen, Action> = {
	kind: "multiSelect",
	title: "Tool permissions",
	enableSearch: true,
	items: [
		{
			id: "read",
			label: "read",
			searchText: "built-in filesystem inspection",
			selected: true,
		},
	],
	action: "refresh",
};
void searchableToolsScreen;

const boundedInputScreen: InputScreen<Action> = {
	kind: "input",
	title: "Refresh label",
	placeholder: "Label",
	action: "refresh",
};
void boundedInputScreen;

const reviewChangesScreen: ReviewScreen<Action> = {
	kind: "review",
	title: "Review changes",
	content: "+1 enabled=true",
	format: { kind: "diff", filePath: "settings.json" },
	viewportSize: "adaptive",
	confirm: { id: "apply", label: "Apply", action: "refresh" },
};
void reviewChangesScreen;

const menu = defineMenu<State, Screen, Action>({
	start: "main",
	screens: {
		main: ({ state }) => ({
			kind: "actions",
			title: "Example extension",
			lines: [`Current mode: ${state.mode}`],
			items: [
				{ id: "refresh", label: "Refresh", action: "refresh", busyLabel: "Refreshing" },
				{ id: "profile", label: "Profile", to: "profile" },
				{ id: "settings", label: "Settings", to: "settings" },
				{ id: "close", label: "Close", close: true },
			],
			hint: "close",
		}),
		profile: ({ state }) => ({
			kind: "choice",
			title: "Profile",
			items: [
				{ id: "minimal", label: "Minimal", details: ["Only essential information"] },
				{ id: "balanced", label: "Balanced", details: ["Recommended information"] },
			],
			action: "setProfile",
			currentItemId: state.profile.toLowerCase(),
			initialItemId: state.profile === "Custom" ? "balanced" : state.profile.toLowerCase(),
		}),
		settings: ({ state }) => ({
			kind: "settings",
			title: "Settings",
			items: [
				{
					id: "mode",
					label: "Mode",
					currentValue: state.mode,
					values: ["Safe", "Fast"],
					action: "setMode",
				},
			],
		}),
	},
	actions: {
		refresh: async ({ signal }) => {
			await refreshDomainState(signal);
			return { kind: "stay" };
		},
		setMode: async ({ value, signal }) => {
			await saveMode(value === "Fast" ? "Fast" : "Safe", signal);
			return { kind: "stay" };
		},
		setProfile: async ({ itemId, signal }) => {
			await saveProfile(itemId, signal);
			return { kind: "back" };
		},
	},
});

export async function showMenu(ctx: ExtensionCommandContext, generation: number) {
	const result = await runMenu(ctx, menu, {
		getState: ({ signal }) => loadState(signal),
		signal: currentSessionSignal(),
		isCurrent: () => generation === currentGeneration(),
		onError: (_ctx, error) => ctx.ui.notify(formatError(error), "error"),
		onUnsupportedMode: (_ctx, mode) => {
			ctx.ui.notify(`The menu is unavailable in ${mode} mode.`, "warning");
		},
	});
	if (result.kind === "closed") {
		const reason: MenuCloseReason = result.reason;
		if (reason === "back") ctx.ui.notify("Returned from the root menu", "info");
	}
	return result;
}
