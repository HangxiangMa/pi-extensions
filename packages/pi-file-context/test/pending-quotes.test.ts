import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { registerFileQuoteExtension } from "../src/file-context.js";

async function withTempProject(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "pi-file-context-pending-test-"));
	try {
		await writeFile(join(root, "example.txt"), "example\n");
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function waitForNextOpen(
	tui: ReturnType<typeof createTuiHarness>,
	previousCount: number,
): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (tui.openCount > previousCount && tui.isOpen) return;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	throw new Error("Timed out waiting for the next File Context screen");
}

test("removes an exact duplicate-looking pending quote and refreshes the widget", async () => {
	await withTempProject(async (root) => {
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "f8" } }),
		});
		const quoteResults = [
			{
				kind: "quote",
				quote: { path: "src/example.ts", startLine: 1, endLine: 1, text: "first snapshot" },
			},
			{
				kind: "quote",
				quote: { path: "src/example.ts", startLine: 1, endLine: 1, text: "second snapshot" },
			},
		];
		let quoteIndex = 0;
		const widgets = new Map<string, unknown>();
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			cwd: root,
			ui: {
				theme: { fg: (_color: string, text: string) => text },
				notify() {},
				setWidget(key: string, value: unknown) {
					widgets.set(key, value);
				},
				async custom() {
					const result = quoteResults[quoteIndex];
					quoteIndex += 1;
					return result;
				},
				pasteToEditor() {},
			},
		});
		const command = mock.commands.get("file-context");
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await command?.handler("browse", context.ctx);
		await command?.handler("browse", context.ctx);

		const tui = createTuiHarness({ width: 60, rows: 18 });
		(context.ctx as unknown as { ui: { custom: typeof tui.custom } }).ui.custom = tui.custom;
		const running = Promise.resolve(command?.handler("", context.ctx));
		await tui.waitForOpen();
		const mainCount = tui.openCount;
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await waitForNextOpen(tui, mainCount);
		assert.match(tui.render().join("\n"), /first snapshot/u);
		tui.press("tui.select.down");
		const removeCount = tui.openCount;
		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await waitForNextOpen(tui, removeCount);
		assert.match(tui.render().join("\n"), /first snapshot/u);
		assert.doesNotMatch(tui.render().join("\n"), /second snapshot/u);
		tui.press("tui.select.cancel");
		await tui.waitForOpen();
		tui.press("ctrl+c");
		await running;

		assert.deepEqual(widgets.get("file-context"), [
			"Quotes (1) · ~4 tokens · /file-context to manage",
			"1. src/example.ts · lines 1-1 · ~4 tokens",
		]);
		const injection = await mock.events.get("before_agent_start")?.[0]?.(
			{ prompt: "Explain", systemPrompt: "base" },
			context.ctx,
		);
		assert.match(JSON.stringify(injection), /first snapshot/u);
		assert.doesNotMatch(JSON.stringify(injection), /second snapshot/u);
	});
});

test("removal cancellation and menu failures preserve pending quotes", async () => {
	await withTempProject(async (root) => {
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "f8" } }),
		});
		const widgets = new Map<string, unknown>();
		const notifications: string[] = [];
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			cwd: root,
			ui: {
				theme: { fg: (_color: string, text: string) => text },
				notify(message: string) {
					notifications.push(message);
				},
				setWidget(key: string, value: unknown) {
					widgets.set(key, value);
				},
				async custom() {
					return {
						kind: "quote",
						quote: { path: "src/keep.ts", startLine: 4, endLine: 4, text: "keep" },
					};
				},
				pasteToEditor() {},
			},
		});
		const command = mock.commands.get("file-context");
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await command?.handler("browse", context.ctx);
		const widgetBefore = widgets.get("file-context");

		const tui = createTuiHarness();
		(context.ctx as unknown as { ui: { custom: typeof tui.custom } }).ui.custom = tui.custom;
		const cancelled = Promise.resolve(command?.handler("remove", context.ctx));
		await tui.waitForOpen();
		tui.press("tui.select.cancel");
		await cancelled;
		assert.deepEqual(widgets.get("file-context"), widgetBefore);

		(
			context.ctx as unknown as {
				ui: { custom: (factory: unknown) => Promise<unknown> };
			}
		).ui.custom = async () => {
			throw new Error("picker \u001b[31mfailed");
		};
		await command?.handler("remove", context.ctx);
		assert.deepEqual(widgets.get("file-context"), widgetBefore);
		assert.ok(!(notifications.at(-1) ?? "").includes("\u001b"));
		assert.match(notifications.at(-1) ?? "", /failed.*kept.*try again/iu);

		const injection = await mock.events.get("before_agent_start")?.[0]?.(
			{ prompt: "Explain", systemPrompt: "base" },
			context.ctx,
		);
		assert.match(JSON.stringify(injection), /src\/keep\.ts/u);
		await command?.handler("remove", context.ctx);
		assert.match(notifications.at(-1) ?? "", /no pending quotes/iu);
	});
});

test("session replacement closes the menu and ignores stale input", async () => {
	await withTempProject(async (root) => {
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "f8" } }),
		});
		const oldManager = { getSessionId: () => "old" };
		const newManager = { getSessionId: () => "new" };
		const oldContext = createMockContext({
			mode: "tui",
			hasUI: true,
			cwd: root,
			sessionManager: oldManager,
			ui: {
				theme: { fg: (_color: string, text: string) => text },
				notify() {},
				setWidget() {},
				async custom() {
					return {
						kind: "quote",
						quote: { path: "src/old.ts", startLine: 1, endLine: 1, text: "old" },
					};
				},
				pasteToEditor() {},
			},
		});
		await mock.events.get("session_start")?.[0]?.({}, oldContext.ctx);
		await mock.commands.get("file-context")?.handler("browse", oldContext.ctx);
		const tui = createTuiHarness();
		(oldContext.ctx as unknown as { ui: { custom: typeof tui.custom } }).ui.custom = tui.custom;
		const oldMenu = Promise.resolve(mock.commands.get("file-context")?.handler("", oldContext.ctx));
		await tui.waitForOpen();

		const newContext = createMockContext({
			mode: "tui",
			hasUI: true,
			cwd: root,
			sessionManager: newManager,
		});
		await mock.events.get("session_start")?.[0]?.({}, newContext.ctx);
		await oldMenu;
		assert.equal(tui.isOpen, false);
		tui.press("tui.select.confirm");
		assert.equal(
			await mock.events.get("before_agent_start")?.[0]?.(
				{ prompt: "new", systemPrompt: "base" },
				newContext.ctx,
			),
			undefined,
		);
	});
});
