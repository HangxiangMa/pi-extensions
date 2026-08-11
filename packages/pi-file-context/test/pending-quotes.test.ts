import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { registerFileQuoteExtension } from "../src/file-context.js";

async function withTempProject(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "pi-file-context-pending-test-"));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test("removes one selected pending quote and refreshes the widget", async () => {
	await withTempProject(async (root) => {
		await writeFile(join(root, "example.txt"), "example\n");
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "ctrl+alt+f" } }),
		});
		const command = mock.commands.get("file-context");
		assert.ok(command?.getArgumentCompletions);
		assert.deepEqual(
			(command.getArgumentCompletions("") as Array<{ value: string }>).map((item) => item.value),
			["remove"],
		);
		assert.deepEqual(
			(command.getArgumentCompletions("rem") as Array<{ value: string }>).map((item) => item.value),
			["remove"],
		);

		const quoteResults = [
			{
				kind: "quote",
				quote: { path: "src/first.ts", startLine: 1, endLine: 1, text: "first" },
			},
			{
				kind: "quote",
				quote: {
					path: "src/unsafe\u001b[31m.ts",
					startLine: 2,
					endLine: 3,
					text: "second\nthird",
				},
			},
		];
		let quoteIndex = 0;
		let removalTitle = "";
		let removalOptions: string[] = [];
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
					const result = quoteResults[quoteIndex];
					quoteIndex += 1;
					return result;
				},
				async select(title: string, options: string[]) {
					removalTitle = title;
					removalOptions = options;
					return options[1];
				},
				pasteToEditor() {},
			},
		});

		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await command.handler("", context.ctx);
		await command.handler("", context.ctx);
		await command.handler("remove", context.ctx);

		assert.equal(removalTitle, "Remove a pending quote");
		assert.equal(removalOptions.length, 2);
		assert.ok(removalOptions.every((option) => !option.includes("\u001b")));
		assert.deepEqual(widgets.get("file-context"), [
			"Quotes (1) · ~2 tokens · /file-context remove",
			"1. src/first.ts · lines 1-1 · ~2 tokens",
		]);
		assert.match(notifications.at(-1) ?? "", /Removed.*unsafe\\x1b\[31m\.ts.*2-3/u);

		const injection = await mock.events.get("before_agent_start")?.[0]?.(
			{ prompt: "Explain", systemPrompt: "base" },
			context.ctx,
		);
		assert.match(JSON.stringify(injection), /src\/first\.ts/u);
		assert.doesNotMatch(JSON.stringify(injection), /unsafe/u);
	});
});

test("cancellation and selector failures leave every pending quote unchanged", async () => {
	await withTempProject(async (root) => {
		await writeFile(join(root, "example.txt"), "example\n");
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "ctrl+alt+f" } }),
		});
		let selectCalls = 0;
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
				async select() {
					selectCalls += 1;
					if (selectCalls === 1) throw new Error("picker \u001b[31mfailed");
					return undefined;
				},
				pasteToEditor() {},
			},
		});
		const command = mock.commands.get("file-context");

		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await command?.handler("", context.ctx);
		const widgetBeforeCancel = widgets.get("file-context");
		await command?.handler("remove", context.ctx);
		assert.equal(selectCalls, 1);
		assert.deepEqual(widgets.get("file-context"), widgetBeforeCancel);
		assert.ok(!(notifications.at(-1) ?? "").includes("\u001b"));
		assert.match(notifications.at(-1) ?? "", /picker \\x1b\[31mfailed.*kept.*retry/iu);

		await command?.handler("remove", context.ctx);
		assert.equal(selectCalls, 2);
		assert.deepEqual(widgets.get("file-context"), widgetBeforeCancel);

		const injection = await mock.events.get("before_agent_start")?.[0]?.(
			{ prompt: "Explain", systemPrompt: "base" },
			context.ctx,
		);
		assert.match(JSON.stringify(injection), /src\/keep\.ts/u);

		await command?.handler("remove", context.ctx);
		assert.equal(selectCalls, 2);
		assert.match(notifications.at(-1) ?? "", /no pending quotes/iu);
	});
});

test("ignores stale and concurrent pending quote removal selections", async () => {
	await withTempProject(async (root) => {
		await writeFile(join(root, "example.txt"), "example\n");
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "ctrl+alt+f" } }),
		});
		const command = mock.commands.get("file-context");
		const manager = { getSessionId: () => "same" };
		const quoteResults = [
			{ kind: "quote", quote: { path: "src/first.ts", startLine: 1, endLine: 1, text: "first" } },
			{ kind: "quote", quote: { path: "src/second.ts", startLine: 2, endLine: 2, text: "second" } },
		];
		let quoteIndex = 0;
		const pendingSelections: Array<{
			options: string[];
			resolve(value: string | undefined): void;
		}> = [];
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			cwd: root,
			sessionManager: manager,
			ui: {
				theme: { fg: (_color: string, text: string) => text },
				notify() {},
				setWidget() {},
				async custom() {
					const result = quoteResults[quoteIndex];
					quoteIndex += 1;
					return result;
				},
				select(_title: string, options: string[]) {
					return new Promise<string | undefined>((resolve) => {
						pendingSelections.push({ options, resolve });
					});
				},
				pasteToEditor() {},
			},
		});

		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await command?.handler("", context.ctx);
		await command?.handler("", context.ctx);
		const firstRemoval = Promise.resolve(command?.handler("remove", context.ctx));
		const secondRemoval = Promise.resolve(command?.handler("remove", context.ctx));
		assert.equal(pendingSelections.length, 2);
		pendingSelections[1]?.resolve(pendingSelections[1]?.options[0]);
		await secondRemoval;
		pendingSelections[0]?.resolve(pendingSelections[0]?.options[0]);
		await firstRemoval;

		const injection = await mock.events.get("before_agent_start")?.[0]?.(
			{ prompt: "Explain", systemPrompt: "base" },
			context.ctx,
		);
		assert.doesNotMatch(JSON.stringify(injection), /src\/first\.ts/u);
		assert.match(JSON.stringify(injection), /src\/second\.ts/u);
	});

	await withTempProject(async (root) => {
		await writeFile(join(root, "example.txt"), "example\n");
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "ctrl+alt+f" } }),
		});
		const command = mock.commands.get("file-context");
		let resolveOldSelection: ((value: string | undefined) => void) | undefined;
		let oldSelection: string | undefined;
		const oldManager = { getSessionId: () => "old" };
		const newManager = { getSessionId: () => "new" };
		const makeContext = (
			sessionManager: object,
			quote: { path: string; startLine: number; endLine: number; text: string },
			select?: (_title: string, options: string[]) => Promise<string | undefined>,
		) =>
			createMockContext({
				mode: "tui",
				hasUI: true,
				cwd: root,
				sessionManager,
				ui: {
					theme: { fg: (_color: string, text: string) => text },
					notify() {},
					setWidget() {},
					async custom() {
						return { kind: "quote", quote };
					},
					select: select ?? (async () => undefined),
					pasteToEditor() {},
				},
			});
		const oldContext = makeContext(
			oldManager,
			{ path: "src/old.ts", startLine: 1, endLine: 1, text: "old" },
			async (_title, options) => {
				oldSelection = options[0];
				return new Promise((resolve) => {
					resolveOldSelection = resolve;
				});
			},
		);
		const newContext = makeContext(newManager, {
			path: "src/new.ts",
			startLine: 1,
			endLine: 1,
			text: "new",
		});

		await mock.events.get("session_start")?.[0]?.({}, oldContext.ctx);
		await command?.handler("", oldContext.ctx);
		const oldRemoval = Promise.resolve(command?.handler("remove", oldContext.ctx));
		await mock.events.get("session_start")?.[0]?.({}, newContext.ctx);
		await command?.handler("", newContext.ctx);
		resolveOldSelection?.(oldSelection);
		await oldRemoval;

		const injection = await mock.events.get("before_agent_start")?.[0]?.(
			{ prompt: "Explain", systemPrompt: "base" },
			newContext.ctx,
		);
		assert.doesNotMatch(JSON.stringify(injection), /src\/old\.ts/u);
		assert.match(JSON.stringify(injection), /src\/new\.ts/u);
	});
});
