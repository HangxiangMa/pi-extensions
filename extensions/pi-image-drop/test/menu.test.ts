import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createCustomSelectorHarness, createMockContext } from "../../../test/support.js";
import {
	type ImageDropMenuState,
	menuSummary,
	runImageDropMenuLoad,
	safeMenuText,
	showImageDropMainMenu,
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
		assert.match(rendered, /Open staging/);
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

test("status loading is visible and cancellable", async () => {
	let lines: string[] = [];
	const context = createMockContext({
		mode: "tui",
		custom: async (factory: unknown) => {
			const harness = createCustomSelectorHarness(factory, 40);
			lines = harness.render();
			harness.handleInput("\u001b");
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
	assert.equal(result.kind, "cancelled");
	assert.match(lines.join(" "), /Refreshing Image Drop status/);
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
