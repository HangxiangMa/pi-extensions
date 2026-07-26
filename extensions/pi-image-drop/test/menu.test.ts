import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import { createCustomSelectorHarness, createMockContext } from "../../../test/support.js";
import {
	type ImageDropMenuState,
	menuSummary,
	runImageDropMenuLoad,
	safeMenuText,
	showImageDropConfirmDialog,
	showImageDropInputDialog,
	showImageDropLimitsMenu,
	showImageDropMainMenu,
	showImageDropSettingsMenu,
	showImageDropStatus,
} from "../src/menu.js";

initTheme("dark", false);

const EMPTY_STATE: ImageDropMenuState = {
	batch: { revision: 0, phase: "empty", items: [], totalSourceBytes: 0 },
	history: { revision: 0, items: [], totalBytes: 0, maxImages: 128, maxBytes: 512 },
	serverRunning: false,
};

test("main menu renders current state without opening and stays within narrow widths", async () => {
	for (const width of [20, 40, 80, 120]) {
		let lines: string[] = [];
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, width);
				lines = harness.render();
				harness.handleInput("tui.select.cancel");
				return harness.result;
			},
		});
		assert.equal(await showImageDropMainMenu(context.ctx, EMPTY_STATE), "close");
		const rendered = lines.join(" ");
		assert.match(rendered, /No images staged/);
		assert.match(rendered, /Add images/);
		assert.ok(
			lines.every((line) => visibleWidth(line) <= width),
			`${width}: ${lines.join("\n")}`,
		);
	}
});

test("menu summaries expose partial and queued state without relying on color", () => {
	const partial: ImageDropMenuState = {
		...EMPTY_STATE,
		batch: {
			revision: 3,
			phase: "blocked",
			totalSourceBytes: 30,
			items: [
				{ id: "one", name: "one", size: 10, status: "ready", notes: [] },
				{ id: "two", name: "two", size: 10, status: "processing", notes: [] },
				{ id: "three", name: "three", size: 10, status: "error", notes: [] },
			],
		},
	};
	assert.equal(menuSummary(partial), "Draft: 1/3 ready · 1 processing · 1 need attention");
	assert.match(
		menuSummary({ ...partial, batch: { ...partial.batch, phase: "reserved" } }),
		/queued/,
	);
	assert.equal(safeMenuText("unsafe\u001b]8;;bad\u0007 value"), "unsafe ]8;;bad value");
});

test("resource-limit actions explain their concrete effect and save behavior", async () => {
	let lines: string[] = [];
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 100);
			lines = harness.render();
			harness.handleInput("tui.select.cancel");
			return harness.result;
		},
	});
	assert.equal(
		await showImageDropLimitsMenu(context.ctx, {
			unsavedChanges: 1,
			values: {
				maxImages: { pending: "12", current: "8", defaultValue: "8" },
				maxImageBytes: { current: "10 MiB", defaultValue: "10 MiB" },
				maxBatchBytes: { current: "40 MiB", defaultValue: "40 MiB" },
				maxImagePixels: { current: "50 MP", defaultValue: "50 MP" },
				maxRetainedImages: { current: "128", defaultValue: "128" },
				maxRetainedBytes: { current: "512 MiB", defaultValue: "512 MiB" },
			},
		}),
		"back",
	);
	const rendered = lines.join(" ");
	for (const text of [
		"Images per message",
		"Pending: 12 · Current: 8 · Default: 8",
		"Max file size per image",
		"Current: 10 MiB · Default: 10 MiB",
		"Max total size per message",
		"Current: 40 MiB · Default: 40 MiB",
		"Max image resolution",
		"Current: 50 MP · Default: 50 MP",
		"Staged + sent image count",
		"Current: 128 · Default: 128",
		"Staged + sent image memory",
		"Current: 512 MiB · Default: 512 MiB",
		"Nothing is saved until you confirm",
		"Only stages the defaults; review and save to apply",
	]) {
		assert.ok(rendered.includes(text), text);
	}
});

test("status loading distinguishes Escape back from Ctrl+C close", async () => {
	async function loadWith(input: string) {
		let lines: string[] = [];
		const context = createMockContext({
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 40);
				lines = harness.render();
				harness.handleInput(input);
				const result = harness.result;
				harness.dispose();
				return result;
			},
		});
		const result = await runImageDropMenuLoad(
			context.ctx,
			"Refreshing Image Drop status…",
			async () => new Promise<never>(() => undefined),
		);
		assert.match(lines.join(" "), /Refreshing Image Drop status/);
		return result;
	}
	assert.equal((await loadWith("\u001b")).kind, "cancelled");
	assert.equal((await loadWith("\u0003")).kind, "closed");
});

test("Ctrl+C aborts loader work before closing its UI", async () => {
	let uiClosed = false;
	let abortedBeforeClose = false;
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			if (typeof factory !== "function") throw new Error("Expected a custom component factory");
			let result: unknown;
			const component = factory(
				{ requestRender() {} },
				{ fg: (_color: string, text: string) => text },
				{},
				(value: unknown) => {
					uiClosed = true;
					result = value;
				},
			) as { handleInput(data: string): void; dispose(): void };
			component.handleInput("\u0003");
			component.dispose();
			return result;
		},
	});
	const result = await runImageDropMenuLoad(context.ctx, "Loading…", async (signal) => {
		signal.addEventListener("abort", () => {
			abortedBeforeClose = !uiClosed;
		});
		return new Promise<never>(() => undefined);
	});
	assert.equal(result.kind, "closed");
	assert.equal(abortedBeforeClose, true);
});

test("disposing a menu loader aborts its owned task", async () => {
	let signal: AbortSignal | undefined;
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 80);
			harness.dispose();
			return { kind: "closed" };
		},
	});
	await runImageDropMenuLoad(context.ctx, "Loading…", async (received) => {
		signal = received;
		return new Promise<never>(() => undefined);
	});
	assert.equal(signal?.aborted, true);
});

test("nested dialogs distinguish cancellation from closing Image Drop", async () => {
	async function customResult<T>(
		inputs: string | readonly string[],
		show: (ctx: ReturnType<typeof createMockContext>["ctx"]) => Promise<T>,
	) {
		const context = createMockContext({
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 80);
				for (const input of typeof inputs === "string" ? [inputs] : inputs) {
					harness.handleInput(input);
				}
				return harness.result;
			},
		});
		return show(context.ctx);
	}
	assert.equal(
		await customResult("\u0003", (ctx) => showImageDropConfirmDialog(ctx, "Save?", "Review")),
		"close",
	);
	assert.equal(
		await customResult("\u001b", (ctx) => showImageDropConfirmDialog(ctx, "Save?", "Review")),
		"cancelled",
	);
	assert.deepEqual(
		await customResult(["1", "2", "tui.input.submit"], (ctx) =>
			showImageDropInputDialog(ctx, "Limit", "4"),
		),
		{ kind: "submitted", value: "12" },
	);
	assert.deepEqual(
		await customResult("\u0003", (ctx) => showImageDropInputDialog(ctx, "Limit", "4")),
		{ kind: "closed" },
	);

	let focusedRender = "";
	const focused = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 20);
			harness.setFocused(true);
			focusedRender = harness.render().join("\n");
			harness.handleInput("\u0003");
			return harness.result;
		},
	});
	await showImageDropInputDialog(focused.ctx, "Limit", "4");
	assert.equal(focusedRender.includes(CURSOR_MARKER), true);
	for (const line of focusedRender.split("\n")) assert.ok(visibleWidth(line) <= 20);
});

test("action hints reflect callback-provided keybindings", async () => {
	let lines: string[] = [];
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const keybindings = {
				matches: (data: string, key: string) => data === "q" && key === "tui.select.cancel",
				getKeys: (key: string): readonly string[] => {
					if (key === "tui.select.up") return ["k"];
					if (key === "tui.select.down") return ["j"];
					if (key === "tui.select.confirm") return ["l"];
					if (key === "tui.select.cancel") return ["q", "ctrl+c"];
					return [];
				},
			};
			const harness = createCustomSelectorHarness(factory, 80, keybindings);
			lines = harness.render();
			harness.handleInput("q");
			return harness.result;
		},
	});
	assert.equal(await showImageDropStatus(context.ctx, ["Ready"]), "back");
	assert.match(lines.join(" "), /k\/j navigate • l select • q back • ctrl\+c close/);
});

test("SettingsList sanitizes diagnostics, updates in place, and rolls back a failed save", async () => {
	const attempts: boolean[] = [];
	let initial = "";
	let afterToggle = "";
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 80);
			initial = harness.render().join(" ");
			harness.handleInput("\r");
			await new Promise<void>((resolve) => setImmediate(resolve));
			afterToggle = harness.render().join(" ");
			harness.handleInput("\u001b");
			await new Promise<void>((resolve) => setImmediate(resolve));
			return harness.result;
		},
	});
	const result = await showImageDropSettingsMenu(context.ctx, {
		lines: ["Settings file: unsafe\u001b]8;;bad\u0007 value"],
		editable: true,
		startOnSessionStart: false,
		limitsValue: "Recommended",
		onStartChange: async (enabled) => {
			attempts.push(enabled);
			return false;
		},
	});
	assert.equal(result, "back");
	assert.equal(initial.includes("\u001b]8"), false);
	assert.match(initial, /unsafe ]8;;bad value/);
	assert.deepEqual(attempts, [true]);
	assert.match(afterToggle, /Start with each Pi session/);
	assert.match(afterToggle, /Off/);
});

test("Settings enqueues rapid changes before an earlier save settles", async () => {
	const requested: boolean[] = [];
	let releaseFirst!: () => void;
	const first = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 80);
			harness.handleInput("\r");
			harness.handleInput("\r");
			assert.deepEqual(requested, [true, false]);
			releaseFirst();
			await new Promise<void>((resolve) => setImmediate(resolve));
			harness.handleInput("\u001b");
			await new Promise<void>((resolve) => setImmediate(resolve));
			return harness.result;
		},
	});
	await showImageDropSettingsMenu(context.ctx, {
		lines: [],
		editable: true,
		startOnSessionStart: false,
		limitsValue: "Recommended",
		onStartChange: async (enabled) => {
			requested.push(enabled);
			if (enabled) await first;
			return true;
		},
	});
});

test("Settings waits for pending saves before Back or Close", async () => {
	async function exitWith(input: string, expected: "back" | "close") {
		let releaseSave!: (saved: boolean) => void;
		let markSaveStarted!: () => void;
		const saveStarted = new Promise<void>((resolve) => {
			markSaveStarted = resolve;
		});
		const save = new Promise<boolean>((resolve) => {
			releaseSave = resolve;
		});
		let exitedBeforeSave = false;
		const context = createMockContext({
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 80);
				harness.handleInput("\r");
				await saveStarted;
				harness.handleInput(input);
				exitedBeforeSave = harness.result !== undefined;
				releaseSave(true);
				await new Promise<void>((resolve) => setImmediate(resolve));
				return harness.result;
			},
		});
		const result = await showImageDropSettingsMenu(context.ctx, {
			lines: [],
			editable: true,
			startOnSessionStart: false,
			limitsValue: "Recommended",
			onStartChange: async () => {
				markSaveStarted();
				return save;
			},
		});
		assert.equal(exitedBeforeSave, false);
		assert.equal(result, expected);
	}
	await exitWith("\u001b", "back");
	await exitWith("\u0003", "close");
});

test("Settings reapplies theme colors when invalidated", async () => {
	let before = "";
	let after = "";
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 80);
			before = harness.render().join("\n");
			initTheme("light", false);
			try {
				harness.invalidate();
				after = harness.render().join("\n");
			} finally {
				initTheme("dark", false);
			}
			harness.handleInput("\u001b");
			await new Promise<void>((resolve) => setImmediate(resolve));
			return harness.result;
		},
	});
	await showImageDropSettingsMenu(context.ctx, {
		lines: ["Settings file: defaults"],
		editable: true,
		startOnSessionStart: false,
		limitsValue: "Recommended",
		onStartChange: async () => true,
	});
	assert.notEqual(after, before);
});

test("subviews distinguish Escape back from Ctrl+C close", async () => {
	async function drive(input: string) {
		const context = createMockContext({
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 40);
				harness.handleInput(input);
				return harness.result;
			},
		});
		return showImageDropStatus(context.ctx, ["Current model: Supports images"]);
	}
	assert.equal(await drive("tui.select.cancel"), "back");
	assert.equal(await drive("\u0003"), "close");
});
