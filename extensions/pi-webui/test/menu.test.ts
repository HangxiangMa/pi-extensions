import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createCustomSelectorHarness } from "../../../test/support.js";
import {
	createWebUIMenuComponent,
	safeTerminalText,
	type WebUIMenuState,
	webUIMenuItems,
	webUIMenuTitle,
} from "../src/menu.js";

initTheme("dark", false);

const STOPPED: WebUIMenuState = {
	serverRunning: false,
	startupAutomatic: false,
	settingsSource: "Defaults",
	settingsPath: "/agent/pi-webui.json",
	settingsInvalid: false,
};

function menuFactory(state: WebUIMenuState = STOPPED, selectedAction?: "status") {
	return (tui: never, theme: never, _keybindings: never, done: never) =>
		createWebUIMenuComponent(state, tui, theme, done, selectedAction);
}

test("menu keeps primary state and selected-effect previews visible at supported widths", () => {
	for (const width of [30, 40, 80, 120]) {
		const selector = createCustomSelectorHarness(menuFactory(), width);
		const lines = selector.render();
		assert.ok(
			lines.every((line) => visibleWidth(line) <= width),
			`${width}: ${lines.join("\n")}`,
		);
		assert.match(lines.join("\n"), /Server: Stopped/);
		assert.match(lines.join(" ").replace(/\s+/g, " "), /Effect: Start a private browser companion/);
	}
});

test("menu previews link rotation, preserves selection, and cancels without an action", () => {
	const running = { ...STOPPED, serverRunning: true, startupAutomatic: true };
	const items = webUIMenuItems(running);
	assert.equal(items[0]?.label, "Get a fresh link");
	assert.match(items[0]?.description ?? "", /invalidate any unused earlier bootstrap link/i);

	const selected = createCustomSelectorHarness(menuFactory(running, "status"));
	assert.match(selected.render().join("\n"), /Effect: Review effective startup/);
	selected.handleInput("\u001b");
	assert.equal(selected.result, undefined);
});

test("invalid settings become a repair flow and terminal-owned text is escaped", () => {
	const state = {
		...STOPPED,
		settingsInvalid: true,
		settingsPath: "/agent/\u001b[31munsafe\u0007.json",
	};
	assert.equal(webUIMenuItems(state)[1]?.label, "Repair settings file");
	const title = webUIMenuTitle(state);
	assert.equal(title.includes("\u001b"), false);
	assert.equal(title.includes("\u0007"), false);
	assert.match(title, /Settings need repair/);
	assert.equal(safeTerminalText("before\u001b[31m\u0007after"), "before [31m after");
});
