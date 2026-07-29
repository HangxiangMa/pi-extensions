import assert from "node:assert/strict";
import test from "node:test";
import {
	safeTerminalText,
	type WebUIMenuState,
	webUIMenuItems,
	webUIMenuTitle,
} from "../src/menu.js";

const STOPPED: WebUIMenuState = {
	serverRunning: false,
	startupAutomatic: false,
	settingsSource: "Defaults",
	settingsPath: "/agent/pi-webui.json",
	settingsInvalid: false,
};

test("menu keeps primary state and selected effects in its declarative items", () => {
	assert.match(webUIMenuTitle(STOPPED), /Server: Stopped/);
	assert.match(webUIMenuItems(STOPPED)[0]?.description ?? "", /Start a private browser companion/);
});

test("menu previews link rotation, preserves selection, and cancels without an action", () => {
	const running = { ...STOPPED, serverRunning: true, startupAutomatic: true };
	const items = webUIMenuItems(running);
	assert.equal(items[0]?.label, "Get a fresh link");
	assert.match(items[0]?.description ?? "", /invalidate any unused earlier bootstrap link/i);

	assert.match(
		items.find((item) => item.value === "status")?.description ?? "",
		/Review effective startup/,
	);
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
