import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import {
	KeybindingsManager,
	setKeybindings,
	TUI_KEYBINDINGS,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { createMenuScreenComponent, type MenuScreenEvent } from "../src/screen-components.js";
import type { MenuScreen, MenuTransition } from "../src/types.js";

initTheme("dark", false);
const testKeybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
	"tui.select.up": "k",
	"tui.select.down": "j",
	"tui.select.pageUp": "u",
	"tui.select.pageDown": "d",
	"tui.select.confirm": "l",
	"tui.select.cancel": "q",
});
setKeybindings(testKeybindings);

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
		{
			id: "manual",
			label: "Manual mode",
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

test("settings restore a selected row when the screen is reopened", () => {
	const harness = componentHarness(settingsScreen, { selectedItemId: "manual" });
	assert.match(harness.component.render(80).join("\n"), /→ .*Manual mode/);
});

test("disabled settings cannot invoke their action", async () => {
	let changes = 0;
	const firstSetting = settingsScreen.items[0];
	assert.ok(firstSetting);
	const harness = componentHarness(
		{
			...settingsScreen,
			items: [{ ...firstSetting, disabled: true }],
		},
		{
			onSettingChange: async () => {
				changes += 1;
				return true;
			},
		},
	);
	harness.component.handleInput("l");
	await harness.component.waitForPending();
	assert.equal(changes, 0);
});

test("settings sanitize display values without changing action payloads", async () => {
	const currentValue = "Off\u001b]8;;unsafe\u0007\nvalue";
	const nextValue = "On\u001b[31m\nraw";
	let receivedValue = "";
	const harness = componentHarness(
		{
			kind: "settings",
			title: "Settings",
			items: [
				{
					id: "unsafe",
					label: "Unsafe",
					currentValue,
					values: [currentValue, nextValue],
					action: "setting",
				},
			],
		},
		{
			onSettingChange: async ({ value }) => {
				receivedValue = value;
				return true;
			},
		},
	);
	assert.equal(harness.component.render(80).join("\n").includes("\u001b]8"), false);
	harness.component.handleInput("l");
	await harness.component.waitForPending();
	assert.equal(receivedValue, nextValue);
	assert.equal(harness.component.render(80).join("\n").includes("\u001b[31m"), false);
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

test("multi-select rejection restores the last committed value after rapid toggles", async () => {
	let releaseFirst: (() => void) | undefined;
	let calls = 0;
	const firstGate = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	const harness = componentHarness(
		{
			...multiSelectScreen,
			items: [{ id: "one", label: "tool_one", selected: false }],
			actions: [],
		},
		{
			onMultiSelectChange: async () => {
				calls += 1;
				if (calls === 1) await firstGate;
				return false;
			},
		},
	);
	harness.component.handleInput("l");
	harness.component.handleInput("l");
	releaseFirst?.();
	await harness.component.waitForPending();
	assert.equal(calls, 2);
	assert.match(harness.component.render(80).join("\n"), /› \[ \] tool_one/);
});

test("multi-select supports explicit bulk action rows", async () => {
	const harness = componentHarness(multiSelectScreen, { selectedItemId: "two" });
	harness.component.handleInput("j");
	assert.match(harness.component.render(80).join("\n"), /› Enable all/);
	harness.component.handleInput("l");
	await new Promise<void>((resolve) => setImmediate(resolve));
	assert.deepEqual(harness.events, [{ kind: "activate", itemId: "all" }]);
});

test("bounded multi-select keeps first, middle, last, and paged selections visible", () => {
	const screen = largeMultiSelectScreen();
	const middle = componentHarness(screen, { selectedItemId: "tool-10" });
	const middleText = middle.component.render(80).join("\n");
	assert.match(middleText, /tool_8/);
	assert.match(middleText, /› \[ \] tool_10/);
	assert.match(middleText, /tool_12/);
	assert.doesNotMatch(middleText, /tool_7|tool_13/);
	assert.match(middleText, /11\/21/);
	assert.match(middleText, /Description for tool 10/);

	const first = componentHarness(screen, { selectedItemId: "tool-0" });
	assert.match(first.component.render(80).join("\n"), /tool_0[\s\S]*tool_4/);
	assert.doesNotMatch(first.component.render(80).join("\n"), /tool_5/);

	const last = componentHarness(screen, { selectedItemId: "all" });
	const lastText = last.component.render(80).join("\n");
	assert.match(lastText, /tool_16[\s\S]*› Enable all/);
	assert.doesNotMatch(lastText, /tool_15/);

	const pageDown = testKeybindings.getKeys("tui.select.pageDown")[0];
	const pageUp = testKeybindings.getKeys("tui.select.pageUp")[0];
	assert.ok(pageDown);
	assert.ok(pageUp);
	first.component.handleInput(pageDown);
	assert.match(first.component.render(80).join("\n"), /› \[ \] tool_5/);
	first.component.handleInput(pageDown);
	first.component.handleInput(pageDown);
	first.component.handleInput(pageDown);
	assert.match(first.component.render(80).join("\n"), /› Enable all/);
	first.component.handleInput(pageUp);
	assert.match(first.component.render(80).join("\n"), /› \[ \] tool_15/);
});

test("bounded multi-select remains width-safe and small lists stay visually unchanged", () => {
	const small = componentHarness({ ...multiSelectScreen, viewportSize: 5 });
	const original = componentHarness(multiSelectScreen);
	assert.deepEqual(small.component.render(80), original.component.render(80));

	const narrow = componentHarness(largeMultiSelectScreen(), { selectedItemId: "tool-10" });
	for (const line of narrow.component.render(18)) assert.ok(visibleWidth(line) <= 18);
});

test("off-screen multi-select rollback settles by stable id before Back", async () => {
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const harness = componentHarness(largeMultiSelectScreen(), {
		selectedItemId: "tool-0",
		onMultiSelectChange: async () => {
			await gate;
			return false;
		},
	});
	harness.component.handleInput("l");
	harness.component.handleInput("d");
	assert.match(harness.component.render(80).join("\n"), /› \[ \] tool_5/);
	release?.();
	await harness.component.waitForPending();
	harness.component.handleInput("u");
	assert.match(harness.component.render(80).join("\n"), /› \[ \] tool_0/);
	harness.component.handleInput("l");
	harness.component.handleInput("q");
	assert.deepEqual(harness.events, []);
	await harness.component.waitForPending();
	assert.deepEqual(harness.events, [{ kind: "back" }]);
});

test("disabled multi-select rows are focusable, explained, sanitized, and never toggle", async () => {
	let toggles = 0;
	const harness = componentHarness(
		{
			kind: "multiSelect",
			title: "Tools",
			items: [
				{ id: "enabled", label: "enabled", selected: false },
				{
					id: "blocked\u001b]8;;raw\u0007",
					label: "blocked\u001b[31m",
					selected: false,
					disabled: true,
					disabledReason: "Policy\u001b]8;;unsafe\u0007 blocks this tool",
				},
			],
			action: "toggle",
		},
		{
			selectedItemId: "blocked\u001b]8;;raw\u0007",
			onMultiSelectChange: async () => {
				toggles += 1;
				return true;
			},
		},
	);
	const rendered = harness.component.render(80).join("\n");
	assert.match(rendered, /› \[-\] blocked .*unavailable/);
	assert.match(rendered, /Policy .*blocks this tool/);
	assert.equal(rendered.includes("\u001b]8;;unsafe"), false);
	harness.component.handleInput("l");
	harness.component.handleInput(" ");
	await harness.component.waitForPending();
	assert.equal(toggles, 0);
});

function largeMultiSelectScreen(): MenuScreen<ScreenId, ActionId> {
	return {
		kind: "multiSelect",
		title: "Large tools",
		viewportSize: 5,
		items: Array.from({ length: 20 }, (_, index) => ({
			id: `tool-${index}`,
			label: `tool_${index}`,
			description: `Description for tool ${index}`,
			selected: false,
		})),
		action: "toggle",
		actions: [{ id: "all", label: "Enable all", action: "run" }],
	};
}

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
		keybindings: testKeybindings,
		onEvent: (event) => events.push(event),
		onSettingChange: options.onSettingChange,
		onMultiSelectChange: options.onMultiSelectChange,
		onTransition: (transition) => transitions.push(transition),
	});
	return { component, events, transitions };
}
