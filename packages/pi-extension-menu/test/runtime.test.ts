import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import {
	createCustomSelectorHarness,
	createMockContext,
	driveCustomSelector,
} from "../../../test/support.js";
import { defineMenu, type MenuDefinition, type RunMenuResult, runMenu } from "../src/index.js";

initTheme("dark", false);

type State = { count: number };
type ScreenId = "main" | "status" | "settings";
type ActionId = "run" | "automatic";

function runtimeMenu(
	options: {
		busy?: boolean;
		run?: MenuDefinition<State, ScreenId, ActionId>["actions"]["run"];
	} = {},
) {
	return defineMenu<State, ScreenId, ActionId>({
		start: "main",
		screens: {
			main: ({ state }) => ({
				kind: "actions",
				title: `Main ${state.count}`,
				items: [
					{
						id: "run",
						label: "Run",
						action: "run",
						...(options.busy ? { busyLabel: "Running…" } : {}),
					},
					{ id: "status", label: "Status", to: "status" },
					{ id: "settings", label: "Settings", to: "settings" },
				],
				hint: "close",
			}),
			status: ({ state }) => ({
				kind: "detail",
				title: "Status",
				lines: [`Count ${state.count}`],
				hint: "back",
			}),
			settings: () => ({
				kind: "settings",
				title: "Settings",
				items: [
					{
						id: "automatic",
						label: "Automatic",
						currentValue: "Off",
						values: ["Off", "On"],
						action: "automatic",
					},
				],
			}),
		},
		actions: {
			run: options.run ?? (async () => ({ kind: "stay" })),
			automatic: async () => ({ kind: "stay" }),
		},
	});
}

test("runMenu navigates, refreshes dynamic state, restores selection, and closes", async () => {
	let count = 0;
	let customCalls = 0;
	const screens: string[] = [];
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		custom: async (factory: unknown) => {
			customCalls += 1;
			const inputs =
				customCalls === 1
					? ["tui.select.down", "tui.select.confirm"]
					: customCalls === 2
						? ["tui.select.cancel"]
						: customCalls === 3
							? ["tui.select.up", "tui.select.confirm"]
							: ["\u0003", "\u0003"];
			const driven = driveCustomSelector(factory, inputs, 40);
			screens.push(driven.renders.flat().join(" "));
			return driven.result;
		},
	});
	const menu = runtimeMenu({
		run: async () => {
			count += 1;
			return { kind: "stay" };
		},
	});

	const result = await runMenu(context.ctx, menu, { getState: () => ({ count }) });
	assert.deepEqual(result, { kind: "closed" });
	assert.equal(count, 1);
	assert.equal(customCalls, 4);
	assert.match(screens[1] ?? "", /Count 0/);
	assert.match(screens[3] ?? "", /Main 1/);
});

test("Escape back restores the cursor on the parent row", async () => {
	let customCalls = 0;
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		custom: async (factory: unknown) => {
			customCalls += 1;
			const harness = createCustomSelectorHarness(factory, 80);
			if (customCalls === 1) {
				harness.handleInput("tui.select.down");
				harness.handleInput("tui.select.confirm");
			} else if (customCalls === 2) harness.handleInput("tui.select.cancel");
			else {
				assert.match(harness.render().join("\n"), /→ Status/);
				harness.handleInput("\u0003");
			}
			return harness.result;
		},
	});

	assert.deepEqual(await runMenu(context.ctx, runtimeMenu(), { getState: () => ({ count: 0 }) }), {
		kind: "closed",
	});
	assert.equal(customCalls, 3);
});

test("RPC uses dialog adaptation without custom TUI and print mode delegates unsupported behavior", async () => {
	let count = 0;
	let customCalls = 0;
	const choices = ["Run", undefined];
	const rpc = createMockContext({
		mode: "rpc",
		hasUI: true,
		select: async () => choices.shift(),
		custom: async () => {
			customCalls += 1;
		},
	});
	const menu = runtimeMenu({
		busy: true,
		run: async () => {
			count += 1;
		},
	});
	assert.deepEqual(await runMenu(rpc.ctx, menu, { getState: () => ({ count }) }), {
		kind: "closed",
	});
	assert.equal(count, 1);
	assert.equal(customCalls, 0);

	let unsupportedMode = "";
	const print = createMockContext({ mode: "print", hasUI: false });
	assert.deepEqual(
		await runMenu(print.ctx, menu, {
			getState: () => ({ count }),
			onUnsupportedMode: (_ctx, mode) => {
				unsupportedMode = mode;
			},
		}),
		{ kind: "unsupported", mode: "print" },
	);
	assert.equal(unsupportedMode, "print");

	const unavailableTui = createMockContext({
		mode: "tui",
		hasUI: false,
		custom: async () => {
			throw new Error("custom UI must not open without UI support");
		},
	});
	assert.deepEqual(
		await runMenu(unavailableTui.ctx, menu, {
			getState: () => ({ count }),
			onUnsupportedMode: (_ctx, mode) => {
				unsupportedMode = mode;
			},
		}),
		{ kind: "unsupported", mode: "tui" },
	);
	assert.equal(unsupportedMode, "tui");
});

test("a stale action continuation cannot render another screen or report success", async () => {
	let current = true;
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let customCalls = 0;
	let errorCalls = 0;
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		custom: async (factory: unknown) => {
			customCalls += 1;
			return driveCustomSelector(factory, ["tui.select.confirm"], 40).result;
		},
	});
	const running = runMenu(
		context.ctx,
		runtimeMenu({
			run: async () => {
				await gate;
				return { kind: "stay" };
			},
		}),
		{
			getState: () => ({ count: 0 }),
			isCurrent: () => current,
			onError: () => {
				errorCalls += 1;
			},
		},
	);
	await new Promise<void>((resolve) => setImmediate(resolve));
	current = false;
	release?.();
	assert.deepEqual(await running, { kind: "stale" });
	assert.equal(customCalls, 1);
	assert.equal(errorCalls, 0);
});

test("a cancellable busy action receives abort, drains, and leaves the menu usable", async () => {
	let aborted = false;
	let settled = false;
	let release: (() => void) | undefined;
	const drainGate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let customCalls = 0;
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		custom: async (factory: unknown) => {
			customCalls += 1;
			const harness = createCustomSelectorHarness(factory, 40);
			if (customCalls === 1) harness.handleInput("tui.select.confirm");
			else if (customCalls === 2) {
				harness.handleInput("\u001b");
				harness.dispose();
				setImmediate(() => release?.());
			} else {
				assert.equal(settled, true);
				harness.handleInput("\u0003");
			}
			return harness.result;
		},
	});
	const result = await runMenu(
		context.ctx,
		runtimeMenu({
			busy: true,
			run: async ({ signal }) => {
				await new Promise<void>((resolve) => {
					if (signal.aborted) resolve();
					else signal.addEventListener("abort", () => resolve(), { once: true });
				});
				aborted = signal.aborted;
				await drainGate;
				settled = true;
				return { kind: "stay" };
			},
		}),
		{ getState: () => ({ count: 0 }) },
	);
	assert.deepEqual(result, { kind: "closed" });
	assert.equal(aborted, true);
	assert.equal(customCalls, 3);
});

test("settings refreshes preserve the changed row cursor", async () => {
	let customCalls = 0;
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		custom: async (factory: unknown) => {
			customCalls += 1;
			const harness = createCustomSelectorHarness(factory, 80);
			if (customCalls === 1) {
				harness.handleInput("tui.select.down");
				harness.handleInput("tui.select.confirm");
			} else {
				assert.match(harness.render().join("\n"), /→ .*Manual mode/);
				harness.handleInput("\u0003");
			}
			for (let turn = 0; harness.result === undefined && turn < 100; turn += 1) {
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
			assert.notEqual(harness.result, undefined);
			return harness.result;
		},
	});
	const definition = defineMenu<undefined, "settings", "save">({
		start: "settings",
		screens: {
			settings: () => ({
				kind: "settings",
				title: "Settings",
				items: [
					{
						id: "automatic",
						label: "Automatic mode",
						currentValue: "Off",
						values: ["Off", "On"],
						action: "save",
					},
					{
						id: "manual",
						label: "Manual mode",
						currentValue: "Off",
						values: ["Off", "On"],
						action: "save",
					},
				],
			}),
		},
		actions: { save: async () => ({ kind: "stay" }) },
	});

	assert.deepEqual(await runMenu(context.ctx, definition, { getState: () => undefined }), {
		kind: "closed",
	});
	assert.equal(customCalls, 2);
});

test("stale settings saves are rejected and drained before the runtime exits", async () => {
	let current = true;
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let customCalls = 0;
	const definition = runtimeMenu();
	definition.actions.automatic = async () => {
		await gate;
		return { kind: "stay" };
	};
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		custom: async (factory: unknown) => {
			customCalls += 1;
			const inputs =
				customCalls === 1
					? ["tui.select.down", "tui.select.down", "tui.select.confirm"]
					: ["tui.select.confirm", "tui.select.cancel"];
			const harness = createCustomSelectorHarness(factory, 40);
			for (const input of inputs) harness.handleInput(input);
			while (harness.result === undefined) {
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
			return harness.result;
		},
	});
	const running: Promise<RunMenuResult> = runMenu(context.ctx, definition, {
		getState: () => ({ count: 0 }),
		isCurrent: () => current,
	});
	await new Promise<void>((resolve) => setImmediate(resolve));
	current = false;
	release?.();
	assert.deepEqual(await running, { kind: "stale" });
	assert.equal(customCalls, 2);
});
