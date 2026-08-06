import assert from "node:assert/strict";
import test from "node:test";
import { createMockPi } from "../../../test/support.js";
import { parseJupyterCommand, registerJupyterCommand } from "../src/jupyter-command.js";
import { jupyterHelpLines, jupyterMenuItems, jupyterMenuSummary } from "../src/jupyter-menu.js";

function createActions() {
	return {
		showMenu: async () => {},
		open: async () => {},
		toggle: async () => {},
		focus: () => {},
		refresh: async () => {},
		close: () => {},
		scroll: () => {},
	};
}

test("pi-jupyter registers only /jupyter and progressively completes direct routes", () => {
	const mock = createMockPi();
	registerJupyterCommand(mock.pi, createActions());
	assert.deepEqual([...mock.commands.keys()], ["jupyter"]);
	const command = mock.commands.get("jupyter");
	assert.ok(command?.getArgumentCompletions);
	const complete = command.getArgumentCompletions;
	assert.deepEqual(
		(complete("") as Array<{ value: string }>).map((item) => item.value),
		["open ", "focus", "refresh", "close", "toggle ", "scroll "],
	);
	assert.deepEqual(
		(complete("scroll ") as Array<{ value: string }>).map((item) => item.value),
		["scroll up ", "scroll down ", "scroll page-up", "scroll page-down", "scroll top"],
	);
	assert.equal(complete("open "), null);
	assert.equal(complete("scroll down "), null);
	assert.equal(complete("unknown"), null);
});

test("/jupyter parser keeps the primary menu shallow and validates every direct route", () => {
	assert.deepEqual(parseJupyterCommand(""), { action: "menu" });
	assert.deepEqual(parseJupyterCommand("open notebooks/demo notebook.ipynb"), {
		action: "open",
		path: "notebooks/demo notebook.ipynb",
	});
	assert.deepEqual(parseJupyterCommand("toggle"), { action: "toggle" });
	assert.deepEqual(parseJupyterCommand("scroll up 12"), {
		action: "scroll",
		direction: "up",
		lines: 12,
	});
	assert.deepEqual(parseJupyterCommand("scroll page-down"), {
		action: "scroll",
		direction: "page-down",
	});
	assert.throws(() => parseJupyterCommand("close now"), /does not accept arguments/);
	assert.throws(() => parseJupyterCommand("scroll sideways"), /Unknown \/jupyter scroll action/);
	assert.throws(() => parseJupyterCommand("unknown"), /Unknown \/jupyter action/);
});

test("current-state menu prioritizes the next notebook goal and exposes exact status", () => {
	assert.deepEqual(
		jupyterMenuItems({ cwd: "/workspace", visible: false, focused: false, scroll: 0 }),
		[
			{
				value: "choose",
				label: "Choose a notebook…",
				description: "Select a top-level notebook or enter an explicit path.",
			},
			{
				value: "help",
				label: "Controls and shortcuts",
				description: "Review keyboard controls and advanced direct routes.",
			},
		],
	);
	const openState = {
		cwd: "/workspace",
		path: "/workspace/demo.ipynb",
		visible: true,
		focused: false,
		scroll: 0,
		cellCount: 3,
		lastLoadedAt: new Date("2026-07-26T07:00:00Z"),
	};
	assert.deepEqual(
		jupyterMenuItems(openState).map((item) => item.value),
		["focus", "refresh", "choose", "close", "help"],
	);
	assert.match(jupyterMenuSummary(openState, 120), /Open · demo\.ipynb · 3 cells/);
	assert.match(
		jupyterMenuSummary({ ...openState, lastError: "invalid JSON" }, 72),
		/last valid version/,
	);
	assert.match(jupyterMenuSummary(openState, 72), /hidden below 90 columns/);
});

test("Jupyter help keeps direct routes and specialized panel controls visible", () => {
	assert.deepEqual(jupyterHelpLines(), [
		"F8 toggles the preview; Shift+F8 focuses it.",
		"Ctrl+Alt+J/K scroll; Ctrl+Alt+D/U page.",
		"While focused: arrows, PgUp/PgDn, Home, j/k/u/d/g; Escape returns.",
		"Direct routes: /jupyter open, focus, refresh, close, toggle, and scroll.",
	]);
});
