import assert from "node:assert/strict";
import test from "node:test";
import { resolveMenuScreen } from "@narumitw/pi-tui-kit";
import { createMockContext } from "../../../test/support.js";
import { DEFAULT_STAMP_SETTINGS } from "../src/format.js";
import { createStampMenu, showStampMenu } from "../src/menu.js";
import type {
	StampSettingsPatch,
	StampSettingsRuntime,
	StampSettingsState,
} from "../src/settings.js";

test("stamp menu exposes Main, Settings, Status, Help, and read-only invalid state", () => {
	const runtime = memorySettingsRuntime();
	const menu = createStampMenu(runtime);
	const state = runtime.get();
	const main = resolveMenuScreen(menu, "main", state);
	assert.equal(main.kind, "actions");
	if (main.kind !== "actions") assert.fail("Expected actions screen");
	assert.deepEqual(
		main.items.map((item) => item.label),
		["Settings", "Status", "Help", "Close"],
	);

	const settings = resolveMenuScreen(menu, "settings", state);
	assert.equal(settings.kind, "settings");
	if (settings.kind !== "settings") assert.fail("Expected settings screen");
	assert.deepEqual(
		settings.items.map((item) => [item.id, item.currentValue]),
		[
			["hourCycle", "24-hour"],
			["showSeconds", "Show"],
			["dateContext", "Day changes"],
			["locale", "Invariant"],
			["timeZone", "Local"],
			["responseTiming", "Off"],
		],
	);
	assert.match((main.lines ?? []).join("\n"), /Timing off/u);

	const status = resolveMenuScreen(menu, "status", state);
	assert.equal(status.kind, "detail");
	if (status.kind !== "detail") assert.fail("Expected detail screen");
	assert.match(status.lines.join("\n"), /24-hour.*Built-in/u);
	assert.match(status.lines.join("\n"), /Response timing: Off · Built-in/u);
	assert.match(status.lines.join("\n"), /\/tmp\/pi-stamp\.json/u);

	const invalidState = {
		...state,
		issue: { kind: "invalid" as const, message: "bad settings" },
		canSave: false,
	};
	const invalidMain = resolveMenuScreen(menu, "main", invalidState);
	assert.equal(invalidMain.kind, "actions");
	if (invalidMain.kind !== "actions") assert.fail("Expected actions screen");
	const invalidSettingsItem = invalidMain.items[0];
	assert.ok(invalidSettingsItem);
	assert.equal("to" in invalidSettingsItem ? invalidSettingsItem.to : undefined, "invalid");
	const invalid = resolveMenuScreen(menu, "invalid", invalidState);
	assert.equal(invalid.kind, "detail");
	if (invalid.kind !== "detail") assert.fail("Expected detail screen");
	assert.match(invalid.lines.join("\n"), /will not be overwritten/u);
});

test("bounded setting actions persist exact patches", async () => {
	const runtime = memorySettingsRuntime();
	const menu = createStampMenu(runtime);
	const { ctx, notifications } = createMockContext({ mode: "tui" });

	assert.deepEqual(
		await menu.actions["set-hour-cycle"]({
			ctx,
			state: runtime.get(),
			signal: new AbortController().signal,
			itemId: "hourCycle",
			value: "12-hour",
		}),
		{ kind: "stay" },
	);
	await menu.actions["set-seconds"]({
		ctx,
		state: runtime.get(),
		signal: new AbortController().signal,
		itemId: "showSeconds",
		value: "Hide",
	});
	await menu.actions["set-date-context"]({
		ctx,
		state: runtime.get(),
		signal: new AbortController().signal,
		itemId: "dateContext",
		value: "Always",
	});
	await menu.actions["set-response-timing"]({
		ctx,
		state: runtime.get(),
		signal: new AbortController().signal,
		itemId: "responseTiming",
		value: "Duration",
	});
	await menu.actions["set-response-timing"]({
		ctx,
		state: runtime.get(),
		signal: new AbortController().signal,
		itemId: "responseTiming",
		value: "Detailed",
	});
	await menu.actions["set-response-timing"]({
		ctx,
		state: runtime.get(),
		signal: new AbortController().signal,
		itemId: "responseTiming",
		value: "Off",
	});
	assert.deepEqual(runtime.patches, [
		{ hourCycle: "12h" },
		{ showSeconds: false },
		{ dateContext: "always" },
		{ responseTiming: "duration" },
		{ responseTiming: "detailed" },
		{ responseTiming: "off" },
	]);
	assert.equal(notifications.at(-1)?.level, "info");
});

test("custom locale and time-zone input validates, cancels without mutation, and saves canonical values", async () => {
	const runtime = memorySettingsRuntime();
	const values = [undefined, "not_a_locale", "EN-us", "Moon/Base", "utc"];
	const { ctx, notifications } = createMockContext({
		mode: "tui",
		input: async () => values.shift(),
	});
	const menu = createStampMenu(runtime);
	const actionContext = () => ({
		ctx,
		state: runtime.get(),
		signal: new AbortController().signal,
		itemId: "custom",
	});

	assert.deepEqual(await menu.actions["choose-custom-locale"](actionContext()), {
		kind: "back",
	});
	assert.deepEqual(runtime.patches, []);
	assert.deepEqual(await menu.actions["choose-custom-locale"](actionContext()), {
		kind: "rejected",
	});
	assert.deepEqual(await menu.actions["choose-custom-locale"](actionContext()), {
		kind: "back",
	});
	assert.deepEqual(await menu.actions["choose-custom-time-zone"](actionContext()), {
		kind: "rejected",
	});
	assert.deepEqual(await menu.actions["choose-custom-time-zone"](actionContext()), {
		kind: "back",
	});
	assert.deepEqual(runtime.patches, [{ locale: "en-US" }, { timeZone: "UTC" }]);
	assert.ok(notifications.some((notice) => notice.level === "warning"));
});

test("save failure is rejected without changing effective settings", async () => {
	const runtime = memorySettingsRuntime({ rejectUpdate: new Error("save\u001b[31m rejected") });
	const menu = createStampMenu(runtime);
	const { ctx, notifications } = createMockContext({ mode: "tui" });
	const result = await menu.actions["set-seconds"]({
		ctx,
		state: runtime.get(),
		signal: new AbortController().signal,
		itemId: "showSeconds",
		value: "Hide",
	});
	assert.deepEqual(result, { kind: "rejected" });
	assert.equal(runtime.get().settings.showSeconds, true);
	assert.equal((notifications.at(-1)?.message ?? "").includes("\u001b"), false);
});

test("RPC adapts the standard menu and an aborted owner closes stale work", async () => {
	const runtime = memorySettingsRuntime();
	const choices: string[][] = [];
	const { ctx } = createMockContext({
		mode: "rpc",
		select: async (_title: string, options: string[]) => {
			choices.push(options);
			return "Close";
		},
	});
	const controller = new AbortController();
	const result = await showStampMenu(ctx, runtime, {
		signal: controller.signal,
		isCurrent: () => true,
	});
	assert.equal(result.kind, "closed");
	assert.deepEqual(choices[0], ["Settings", "Status", "Help", "Close"]);

	controller.abort();
	assert.equal(
		(
			await showStampMenu(ctx, runtime, {
				signal: controller.signal,
				isCurrent: () => false,
			})
		).kind,
		"stale",
	);
});

function memorySettingsRuntime(
	options: { rejectUpdate?: Error } = {},
): StampSettingsRuntime & { patches: StampSettingsPatch[] } {
	let state: StampSettingsState = {
		settings: { ...DEFAULT_STAMP_SETTINGS },
		sources: {
			hourCycle: "built-in",
			showSeconds: "built-in",
			dateContext: "built-in",
			locale: "built-in",
			timeZone: "built-in",
			responseTiming: "built-in",
		},
		canSave: true,
	};
	const patches: StampSettingsPatch[] = [];
	return {
		patches,
		get: () => state,
		getPath: () => "/tmp/pi-stamp.json",
		reload: async () => state,
		update: async (patch) => {
			if (options.rejectUpdate) throw options.rejectUpdate;
			patches.push(patch);
			state = {
				...state,
				settings: { ...state.settings, ...patch },
				sources: {
					...state.sources,
					...Object.fromEntries(Object.keys(patch).map((key) => [key, "user"])),
				},
			};
			return state;
		},
		flush: async () => undefined,
	};
}
