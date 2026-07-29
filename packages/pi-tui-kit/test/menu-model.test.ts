import assert from "node:assert/strict";
import test from "node:test";
import {
	createMenuNavigator,
	defineMenu,
	type MenuDefinition,
	resolveMenuScreen,
} from "../src/index.js";

type State = { count: number };
type ScreenId = "main" | "status";
type ActionId = "increment";

function testMenu(): MenuDefinition<State, ScreenId, ActionId> {
	return defineMenu<State, ScreenId, ActionId>({
		start: "main",
		screens: {
			main: ({ state }) => ({
				kind: "actions",
				title: `Count ${state.count}`,
				items: [
					{ id: "increment", label: "Increment", action: "increment" },
					{ id: "status", label: "Status", to: "status" },
					{ id: "close", label: "Close", close: true },
				],
			}),
			status: ({ state }) => ({
				kind: "detail",
				title: "Status",
				lines: [`Count: ${state.count}`],
			}),
		},
		actions: {
			increment: async () => ({ kind: "stay" }),
		},
	});
}

test("menu definitions resolve dynamic screens and reject invalid references", () => {
	const definition = testMenu();
	assert.equal(resolveMenuScreen(definition, "main", { count: 2 }).title, "Count 2");
	assert.throws(
		() =>
			resolveMenuScreen(
				{
					...definition,
					screens: {
						...definition.screens,
						main: () => ({
							kind: "actions",
							title: "Broken",
							items: [{ id: "missing", label: "Missing", to: "missing" as ScreenId }],
						}),
					},
				},
				"main",
				{ count: 0 },
			),
		/unknown screen.*missing/i,
	);
	assert.throws(
		() =>
			resolveMenuScreen(
				{
					...definition,
					screens: {
						...definition.screens,
						main: () => ({
							kind: "actions",
							title: "Broken",
							items: [{ id: "missing", label: "Missing", action: "missing" as ActionId }],
						}),
					},
				},
				"main",
				{ count: 0 },
			),
		/unknown action.*missing/i,
	);
});

test("multi-select viewports must be positive integers", () => {
	const definition = defineMenu<undefined, "tools", "toggle">({
		start: "tools",
		screens: {
			tools: () => ({
				kind: "multiSelect",
				title: "Tools",
				viewportSize: 0,
				items: [],
				action: "toggle",
			}),
		},
		actions: { toggle: async () => ({ kind: "stay" }) },
	});
	assert.throws(
		() => resolveMenuScreen(definition, "tools", undefined),
		/viewport.*positive integer/i,
	);
	for (const viewportSize of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(
			() =>
				resolveMenuScreen(
					{
						...definition,
						screens: {
							tools: () => ({
								kind: "multiSelect" as const,
								title: "Tools",
								viewportSize,
								items: [],
								action: "toggle" as const,
							}),
						},
					},
					"tools",
					undefined,
				),
			/viewport.*positive integer/i,
		);
	}
});

test("navigator owns nested Back and Close transitions", () => {
	const navigator = createMenuNavigator<ScreenId>("main");
	assert.equal(navigator.current, "main");
	assert.equal(navigator.apply({ kind: "to", screen: "status" }), "active");
	assert.equal(navigator.current, "status");
	assert.equal(navigator.apply({ kind: "back" }), "active");
	assert.equal(navigator.current, "main");
	assert.equal(navigator.apply({ kind: "back" }), "closed");
	assert.equal(navigator.closed, true);
});

test("navigator restores stable selections and falls back when an item disappears", () => {
	const navigator = createMenuNavigator<ScreenId>("main");
	navigator.rememberSelection("main", "status");
	assert.equal(navigator.selectionFor("main", ["increment", "status"]), "status");
	assert.equal(navigator.selectionFor("main", ["increment"]), "increment");
	assert.equal(navigator.selectionFor("main", []), undefined);
});
