import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createMenuScreenComponent, type MenuScreenEvent } from "../src/screen-components.js";
import type { MenuScreen, MenuTransition } from "../src/types.js";

initTheme("dark", false);

type ScreenId = "main" | "detail";
type ActionId = "run" | "setting" | "toggle";

const actionScreen: MenuScreen<ScreenId, ActionId> = {
	kind: "actions",
	title: "Unsafe\u001b]8;;title\u0007",
	lines: ["A long summary that must wrap safely at narrow terminal widths."],
	items: [
		{ id: "run", label: "Run operation", action: "run" },
		{ id: "detail", label: "Open details", description: "Read-only state", to: "detail" },
		{ id: "close", label: "Close", close: true },
	],
	hint: "close",
};

const detailScreen: MenuScreen<ScreenId, ActionId> = {
	kind: "detail",
	title: "Details",
	lines: [
		"One very long detail line that must remain visible without crossing the terminal width.",
	],
	hint: "back",
};

const settingsScreen: MenuScreen<ScreenId, ActionId> = {
	kind: "settings",
	title: "Settings",
	lines: ["Changes save immediately."],
	items: [
		{
			id: "automatic",
			label: "Automatic start",
			description: "Start on every session",
			currentValue: "Off",
			values: ["Off", "On"],
			action: "setting",
		},
	],
};

const multiSelectScreen: MenuScreen<ScreenId, ActionId> = {
	kind: "multiSelect",
	title: "Tools",
	items: [
		{ id: "one", label: "tool_one", selected: true },
		{ id: "two", label: "tool_two", selected: false },
	],
	action: "toggle",
	actions: [{ id: "all", label: "Enable all", action: "run" }],
};

test("standard screens remain bounded and sanitize terminal controls", () => {
	for (const screen of [actionScreen, detailScreen, settingsScreen, multiSelectScreen]) {
		for (const width of [20, 40, 80, 120]) {
			const harness = componentHarness(screen);
			const lines = harness.component.render(width);
			assert.ok(lines.length > 0);
			assert.ok(
				lines.every((line) => visibleWidth(line) <= width),
				`${screen.kind} at ${width}`,
			);
			assert.equal(lines.join("\n").includes("\u001b]8;;title"), false);
			harness.component.dispose?.();
		}
	}
});

test("action screens honor injected navigation and distinguish Back from Ctrl+C Close", () => {
	const selected = componentHarness(actionScreen, { selectedItemId: "detail" });
	selected.component.handleInput("l");
	assert.deepEqual(selected.events, [{ kind: "activate", itemId: "detail" }]);

	const back = componentHarness({ ...actionScreen, hint: "back" });
	back.component.handleInput("q");
	assert.deepEqual(back.events, [{ kind: "back" }]);

	const close = componentHarness({ ...actionScreen, hint: "back" });
	close.component.handleInput("\u0003");
	assert.deepEqual(close.events, [{ kind: "close" }]);
});

test("theme invalidation rebuilds themed title content", () => {
	let accent = "first";
	const harness = componentHarness(actionScreen, {
		themePrefix: () => accent,
	});
	assert.match(harness.component.render(80).join("\n"), /first:Unsafe/);
	accent = "second";
	harness.component.invalidate();
	assert.match(harness.component.render(80).join("\n"), /second:Unsafe/);
});

test("settings changes serialize, roll back rejection, and drain before Back", async () => {
	let releaseFirst: (() => void) | undefined;
	const requests: string[] = [];
	const firstGate = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	const harness = componentHarness(settingsScreen, {
		onSettingChange: async ({ value }) => {
			requests.push(value);
			if (requests.length === 1) await firstGate;
			return value !== "Off";
		},
	});

	harness.component.handleInput("l");
	harness.component.handleInput("l");
	await Promise.resolve();
	assert.deepEqual(requests, ["On"]);
	harness.component.handleInput("q");
	assert.deepEqual(harness.events, []);
	releaseFirst?.();
	await harness.component.waitForPending();
	assert.deepEqual(requests, ["On", "Off"]);
	assert.deepEqual(harness.events, [{ kind: "back" }]);
	assert.match(harness.component.render(80).join("\n"), /On/);
});

test("accepted setting transitions fire only after pending state is settled", async () => {
	const harness = componentHarness(settingsScreen, {
		onSettingChange: async () => ({ accepted: true, transition: { kind: "close" } }),
	});
	harness.component.handleInput("l");
	assert.deepEqual(harness.transitions, []);
	await harness.component.waitForPending();
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.deepEqual(harness.transitions, [{ kind: "close" }]);
});

test("multi-select retains its cursor and restores a rejected optimistic toggle", async () => {
	const requests: Array<{ itemId: string; selected: boolean }> = [];
	const harness = componentHarness(multiSelectScreen, {
		selectedItemId: "two",
		onMultiSelectChange: async (request) => {
			requests.push(request);
			return false;
		},
	});
	harness.component.handleInput("l");
	await harness.component.waitForPending();
	assert.deepEqual(requests, [{ itemId: "two", selected: true, previousSelected: false }]);
	const rendered = harness.component.render(80).join("\n");
	assert.match(rendered, /› \[ \] tool_two/);
});

test("multi-select supports explicit bulk action rows", async () => {
	const harness = componentHarness(multiSelectScreen, { selectedItemId: "two" });
	harness.component.handleInput("j");
	assert.match(harness.component.render(80).join("\n"), /› Enable all/);
	harness.component.handleInput("l");
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.deepEqual(harness.events, [{ kind: "activate", itemId: "all" }]);
});

function componentHarness(
	screen: MenuScreen<ScreenId, ActionId>,
	options: {
		selectedItemId?: string;
		themePrefix?: () => string;
		onSettingChange?: (request: {
			itemId: string;
			value: string;
			previousValue: string;
		}) => Promise<boolean | { accepted: boolean; transition: MenuTransition<ScreenId> }>;
		onMultiSelectChange?: (request: {
			itemId: string;
			selected: boolean;
			previousSelected: boolean;
		}) => Promise<boolean | { accepted: boolean; transition: MenuTransition<ScreenId> }>;
	} = {},
) {
	const events: MenuScreenEvent[] = [];
	const transitions: MenuTransition<ScreenId>[] = [];
	const themePrefix = options.themePrefix ?? (() => "accent");
	const component = createMenuScreenComponent({
		screen,
		selectedItemId: options.selectedItemId,
		tui: { requestRender() {} },
		theme: {
			fg(color: string, text: string) {
				return color === "accent" ? `${themePrefix()}:${text}` : text;
			},
			bold(text: string) {
				return text;
			},
		},
		keybindings: {
			matches(data: string, binding: string) {
				const keys: Record<string, string> = {
					"tui.select.up": "k",
					"tui.select.down": "j",
					"tui.select.confirm": "l",
					"tui.select.cancel": "q",
				};
				return keys[binding] === data;
			},
			getKeys(binding: string) {
				const keys: Record<string, readonly string[]> = {
					"tui.select.up": ["k"],
					"tui.select.down": ["j"],
					"tui.select.confirm": ["l"],
					"tui.select.cancel": ["q", "ctrl+c"],
				};
				return keys[binding] ?? [];
			},
		},
		onEvent: (event) => events.push(event),
		onSettingChange: options.onSettingChange,
		onMultiSelectChange: options.onMultiSelectChange,
		onTransition: (transition) => transitions.push(transition),
	});
	return { component, events, transitions };
}
