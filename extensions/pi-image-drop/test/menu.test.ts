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
} from "../src/menu.js";

initTheme("dark", false);

const EMPTY_STATE: ImageDropMenuState = {
	batch: { revision: 0, phase: "empty", items: [], totalSourceBytes: 0 },
	history: { revision: 0, items: [], totalBytes: 0, maxImages: 128, maxBytes: 512 },
	serverRunning: false,
};

test("menu summaries expose empty, partial, and queued state without relying on color", () => {
	assert.equal(menuSummary(EMPTY_STATE), "Draft: No images staged");
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

test("status loading distinguishes Escape back from Ctrl+C close", async () => {
	async function loadWith(input: string) {
		const context = createMockContext({
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 40);
				harness.handleInput(input);
				const result = harness.result;
				harness.dispose();
				return result;
			},
		});
		return runImageDropMenuLoad(
			context.ctx,
			"Refreshing Image Drop status…",
			async () => new Promise<never>(() => undefined),
		);
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

test("specialized confirmation distinguishes cancellation from closing Image Drop", async () => {
	async function drive(input: string) {
		const context = createMockContext({
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 80);
				harness.handleInput(input);
				return harness.result;
			},
		});
		return showImageDropConfirmDialog(context.ctx, "Save?", "Review");
	}
	assert.equal(await drive("\u0003"), "close");
	assert.equal(await drive("\u001b"), "cancelled");
});

test("specialized numeric input submits, closes, and remains width safe", async () => {
	let focusedRender = "";
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 20);
			harness.setFocused(true);
			harness.handleInput("1");
			harness.handleInput("2");
			focusedRender = harness.render().join("\n");
			harness.handleInput("tui.input.submit");
			return harness.result;
		},
	});
	assert.deepEqual(await showImageDropInputDialog(context.ctx, "Limit", "4"), {
		kind: "submitted",
		value: "12",
	});
	assert.equal(focusedRender.includes(CURSOR_MARKER), true);
	for (const line of focusedRender.split("\n")) assert.ok(visibleWidth(line) <= 20);
});
