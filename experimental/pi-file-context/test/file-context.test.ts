import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createMockContext, createMockPi } from "../../../test/support.js";
import fileQuoteExtension, {
	appendPendingQuote,
	createFileQuote,
	discoverProjectFiles,
	FileQuoteTriggerEditor,
	filterProjectFiles,
	formatPromptWithQuote,
	formatPromptWithQuotes,
	loadProjectTextFile,
} from "../src/file-context.js";
import { FileQuoteExplorer } from "../src/file-context-explorer.js";

async function withTempProject(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "pi-file-context-test-"));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test("discovers bounded project text candidates without traversing ignored directories or symlinks", async () => {
	await withTempProject(async (root) => {
		await mkdir(join(root, "src"), { recursive: true });
		await mkdir(join(root, "node_modules", "hidden"), { recursive: true });
		await writeFile(join(root, "README.md"), "read me");
		await writeFile(join(root, "src", "main.ts"), "export {};\n");
		await writeFile(join(root, "node_modules", "hidden", "index.js"), "hidden");
		await symlink(join(root, "src"), join(root, "linked-src"), "dir");

		assert.deepEqual(await discoverProjectFiles(root), ["README.md", "src/main.ts"]);
		assert.deepEqual(await discoverProjectFiles(root, { maxFiles: 1 }), ["README.md"]);
	});
});

test("loads only bounded regular text files inside the project", async () => {
	await withTempProject(async (root) => {
		await writeFile(join(root, "safe.ts"), "one\ntwo\nthree\n");
		await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
		await writeFile(join(root, "large.txt"), "x".repeat(32));

		assert.deepEqual(await loadProjectTextFile(root, "safe.ts"), {
			path: "safe.ts",
			lines: ["one", "two", "three", ""],
		});
		await assert.rejects(loadProjectTextFile(root, "../outside.txt"), /outside the project/);
		await assert.rejects(loadProjectTextFile(root, "binary.bin"), /binary/);
		await assert.rejects(
			loadProjectTextFile(root, "large.txt", { maxBytes: 16 }),
			/exceeds 16 bytes/,
		);
	});
});

test("filters files by ordered fuzzy characters", () => {
	const files = ["src/runtime.ts", "src/settings.ts", "test/runtime.test.ts"];
	assert.deepEqual(filterProjectFiles(files, "settings"), ["src/settings.ts"]);
	assert.deepEqual(filterProjectFiles(files, "rtt"), files);
});

test("explorer previews a file, selects a range, and keeps rendered rows width-safe", async () => {
	let result: unknown;
	const tui = {
		terminal: { rows: 12 },
		requestRender() {},
	};
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const keybindings = {
		matches(data: string, key: string) {
			return (
				(data === "up" && key === "tui.select.up") ||
				(data === "down" && key === "tui.select.down") ||
				(data === "enter" && key === "tui.select.confirm") ||
				(data === "tab" && key === "tui.input.tab")
			);
		},
	};
	const explorer = new FileQuoteExplorer({
		tui: tui as never,
		theme: theme as never,
		keybindings: keybindings as never,
		files: ["src/unsafe\u001b[31m.ts"],
		loadFile: async () => ({
			path: "src/unsafe.ts",
			lines: ["first", "second", "third", "fourth"],
		}),
		done: (value) => {
			result = value;
		},
	});

	const fileRows = explorer.render(32);
	assert.ok(fileRows.every((line) => !line.includes("\u001b[31m")));
	assert.ok(fileRows.every((line) => visibleWidth(line) <= 32));
	explorer.handleInput("enter");
	await new Promise<void>((resolve) => setImmediate(resolve));
	explorer.handleInput(" ");
	explorer.handleInput("down");
	explorer.handleInput("down");
	const previewRows = explorer.render(32);
	assert.ok(previewRows.every((line) => visibleWidth(line) <= 32));
	explorer.handleInput("enter");
	assert.deepEqual(result, {
		kind: "quote",
		quote: {
			path: "src/unsafe.ts",
			startLine: 1,
			endLine: 3,
			text: "first\nsecond\nthird",
		},
	});

	const referenceExplorer = new FileQuoteExplorer({
		tui: tui as never,
		theme: theme as never,
		keybindings: keybindings as never,
		files: ["src/reference.ts"],
		loadFile: async () => ({ path: "", lines: [] }),
		done: (value) => {
			result = value;
		},
	});
	referenceExplorer.handleInput("tab");
	assert.deepEqual(result, { kind: "reference", path: "src/reference.ts" });

	result = "unchanged";
	const cancelledExplorer = new FileQuoteExplorer({
		tui: tui as never,
		theme: theme as never,
		keybindings: keybindings as never,
		files: ["src/cancelled.ts"],
		loadFile: async () => ({ path: "", lines: [] }),
		done: (value) => {
			result = value;
		},
	});
	cancelledExplorer.handleInput("\u001b");
	assert.equal(result, undefined);
});

test("custom editor opens the explorer on a boundary @ without changing the draft", async () => {
	let opened = 0;
	const editor = new FileQuoteTriggerEditor(
		{ requestRender() {} } as never,
		{
			borderColor: (text: string) => text,
			selectList: {
				selectedPrefix: (text: string) => text,
				selectedText: (text: string) => text,
				description: (text: string) => text,
				scrollInfo: (text: string) => text,
				noMatch: (text: string) => text,
			},
		},
		{ matches: () => false } as never,
		async () => {
			opened += 1;
		},
	);
	editor.setText("draft ");
	editor.handleInput("@");
	await Promise.resolve();
	assert.equal(opened, 1);
	assert.equal(editor.getText(), "draft ");

	editor.setText("email");
	editor.handleInput("@");
	assert.equal(editor.getText(), "email@");
});

test("captures an exact normalized line snapshot and formats one focused prompt", () => {
	const quote = createFileQuote("src/runtime.ts", ["zero", "one", "two", "three"], 3, 1);
	assert.deepEqual(quote, {
		path: "src/runtime.ts",
		startLine: 2,
		endLine: 4,
		text: "one\ntwo\nthree",
	});
	assert.throws(() => createFileQuote("large.txt", ["x".repeat(50_001)], 0, 0), /50000 bytes/);
	assert.throws(
		() =>
			createFileQuote(
				"many.txt",
				Array.from({ length: 501 }, () => "x"),
				0,
				500,
			),
		/500 lines/,
	);
	assert.equal(
		formatPromptWithQuote("Why this order?", quote),
		'<user_file_quote path="src/runtime.ts" lines="2-4">\none\ntwo\nthree\n</user_file_quote>\n\nThe user intentionally selected the file excerpt above.\n\nWhy this order?',
	);
});

test("accumulates ordered pending quotes within aggregate limits", () => {
	const first = createFileQuote("src/first.ts", ["first"], 0, 0);
	const second = createFileQuote("src/second.ts", ["second"], 0, 0);
	const pending = appendPendingQuote(appendPendingQuote([], first), second);
	assert.deepEqual(pending, [first, second]);
	assert.equal(
		formatPromptWithQuotes("Compare them", pending),
		'<user_file_quote path="src/first.ts" lines="1-1">\nfirst\n</user_file_quote>\n\n<user_file_quote path="src/second.ts" lines="1-1">\nsecond\n</user_file_quote>\n\nThe user intentionally selected the file excerpts above.\n\nCompare them',
	);

	const eight = Array.from({ length: 8 }, (_, index) => ({ ...first, path: `${index}.ts` }));
	assert.throws(() => appendPendingQuote(eight, second), /8 pending quotes/);
	const fiftyKb = { ...first, text: "x".repeat(50_000) };
	assert.doesNotThrow(() => appendPendingQuote([fiftyKb], fiftyKb));
	assert.throws(() => appendPendingQuote([fiftyKb, fiftyKb], first), /100000 bytes/);
});

test("registers a TUI fallback command and injects all pending quotes only once", async () => {
	const mock = createMockPi();
	fileQuoteExtension(mock.pi);
	assert.ok(mock.commands.has("file-quote"));

	let customFactory: unknown;
	const widgets = new Map<string, unknown>();
	const editorFactories: unknown[] = [];
	let currentEditorFactory: unknown;
	let quoteIndex = 0;
	const quoteResults = [
		{
			kind: "quote",
			quote: {
				path: "src/example.ts",
				startLine: 1,
				endLine: 1,
				text: "const example = true;",
			},
		},
		{
			kind: "quote",
			quote: {
				path: "test/example.test.ts",
				startLine: 2,
				endLine: 3,
				text: "expect(example)\n  .toBe(true);",
			},
		},
	];
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		cwd: process.cwd(),
		ui: {
			theme: {
				fg(_color: string, text: string) {
					return text;
				},
			},
			notify() {},
			setWidget(key: string, value: unknown) {
				widgets.set(key, value);
			},
			setEditorComponent(factory: unknown) {
				currentEditorFactory = factory;
				editorFactories.push(factory);
			},
			getEditorComponent() {
				return currentEditorFactory;
			},
			async custom(factory: unknown) {
				customFactory = factory;
				const result = quoteResults[quoteIndex];
				quoteIndex += 1;
				return result;
			},
		},
	});

	await mock.events.get("session_start")?.[0]?.({}, context.ctx);
	assert.equal(editorFactories.length, 1);
	await mock.commands.get("file-quote")?.handler("", context.ctx);
	await mock.commands.get("file-quote")?.handler("", context.ctx);
	assert.equal(typeof customFactory, "function");
	assert.deepEqual(widgets.get("file-quote"), [
		"Quotes (2):",
		"• src/example.ts · lines 1-1",
		"• test/example.test.ts · lines 2-3",
	]);

	const input = mock.events.get("input")?.[0];
	const transformed = await input?.(
		{ text: "Explain this", images: [], source: "interactive" },
		context.ctx,
	);
	assert.deepEqual(transformed, {
		action: "transform",
		text: '<user_file_quote path="src/example.ts" lines="1-1">\nconst example = true;\n</user_file_quote>\n\n<user_file_quote path="test/example.test.ts" lines="2-3">\nexpect(example)\n  .toBe(true);\n</user_file_quote>\n\nThe user intentionally selected the file excerpts above.\n\nExplain this',
	});
	assert.equal(widgets.get("file-quote"), undefined);
	assert.deepEqual(
		await input?.({ text: "Again", images: [], source: "interactive" }, context.ctx),
		{ action: "continue" },
	);
	await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);
	assert.equal(currentEditorFactory, undefined);
	assert.equal(widgets.get("file-quote"), undefined);
});

test("rejects the fallback command observably outside TUI mode", async () => {
	const mock = createMockPi();
	fileQuoteExtension(mock.pi);
	const rpc = createMockContext({ mode: "rpc", hasUI: true });
	await mock.commands.get("file-quote")?.handler("", rpc.ctx);
	assert.match(rpc.notifications[0]?.message ?? "", /interactive TUI/);
	assert.equal(rpc.notifications[0]?.level, "warning");

	const print = createMockContext({ mode: "print", hasUI: false });
	await assert.rejects(async () => {
		await mock.commands.get("file-quote")?.handler("", print.ctx);
	}, /interactive TUI/);
	await assert.rejects(async () => {
		await mock.commands.get("file-quote")?.handler("unexpected", print.ctx);
	}, /Usage/);
});
