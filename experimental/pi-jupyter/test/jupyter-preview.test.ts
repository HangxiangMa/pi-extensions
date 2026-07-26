import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createMockContext, createMockPi } from "../../../test/support.js";
import jupyterPreview, {
	createJupyterPreview,
	extractNotebookPath,
	parsePositiveLineCount,
	resolveNotebookPath,
} from "../src/jupyter-preview.js";
import { loadNotebook, sanitizeTerminalText } from "../src/notebook.js";
import {
	clampPanelWidth,
	NotebookPreviewPanel,
	parseSgrMouseEvent,
	previewFooter,
} from "../src/notebook-panel.js";

async function emit(
	events: ReadonlyMap<string, Array<(...args: unknown[]) => unknown>>,
	name: string,
	...args: unknown[]
) {
	for (const handler of events.get(name) ?? []) await handler(...args);
}

async function invoke(handler: ((...args: unknown[]) => unknown) | undefined, ...args: unknown[]) {
	return Promise.resolve(handler?.(...args));
}

function createJupyterMock() {
	const mock = createMockPi();
	Object.assign(mock.rawPi, { registerShortcut() {} });
	return mock;
}

test("path helpers normalize Pi references and recognize notebook tool inputs", () => {
	assert.equal(
		resolveNotebookPath("@notes/demo.ipynb", "/workspace"),
		"/workspace/notes/demo.ipynb",
	);
	assert.equal(extractNotebookPath({ path: "demo.ipynb" }), "demo.ipynb");
	assert.equal(extractNotebookPath({ filename: "README.md" }), undefined);
});

test("scroll counts accept only one positive integer", () => {
	assert.equal(parsePositiveLineCount("", 3), 3);
	assert.equal(parsePositiveLineCount("12", 3), 12);
	assert.throws(() => parsePositiveLineCount("12 extra", 3), /positive integer/);
	assert.throws(() => parsePositiveLineCount("0", 3), /positive integer/);
});

test("terminal-owned notebook text cannot inject control sequences", () => {
	assert.equal(sanitizeTerminalText("safe\x1b[31mred\x07"), "safe\\x1b[31mred\\x07");
	assert.equal(sanitizeTerminalText("line one\nline two\tcell"), "line one\nline two\tcell");
});

test("panel geometry stays usable and parses only complete SGR mouse reports", () => {
	assert.equal(clampPanelWidth(70, 100), 70);
	assert.equal(clampPanelWidth(90, 100), 75);
	assert.deepEqual(parseSgrMouseEvent("\x1b[<32;42;7M"), {
		button: 32,
		x: 42,
		y: 7,
		released: false,
	});
	assert.equal(parseSgrMouseEvent("\x1b[<32;42M"), undefined);
	assert.equal(
		previewFooter({ cwd: "/workspace", visible: true, focused: false, scroll: 0 }, 40),
		" Shift+F8 focus • F8 close",
	);
	assert.equal(
		previewFooter({ cwd: "/workspace", visible: true, focused: true, scroll: 0 }, 40),
		" ↑↓ scroll • Esc/F8 return",
	);
});

test("preview panel remains width-safe with long untrusted paths and narrow adaptive hints", () => {
	const panel = new NotebookPreviewPanel(
		{ requestRender() {} } as never,
		{
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
		} as never,
		{
			cwd: "/workspace",
			path: `/workspace/\x1b[31m-${"very-long-".repeat(8)}.ipynb`,
			visible: true,
			focused: false,
			scroll: 0,
			model: { cells: [] },
		},
		() => {},
	);
	const lines = panel.render(42);
	assert.equal(
		lines.every((line) => visibleWidth(line) <= 42),
		true,
	);
	assert.equal(
		lines.some((line) => line.includes("\\x1b")),
		true,
	);
	assert.equal(lines.at(-2)?.includes("Shift+F8 focus"), true);
});

test("loadNotebook rejects a FIFO without waiting for a writer", async (context) => {
	if (process.platform === "win32") {
		context.skip("named pipes do not expose POSIX FIFO open semantics on Windows");
		return;
	}
	const directory = await mkdtemp(join(tmpdir(), "pi-jupyter-fifo-test-"));
	let child: ReturnType<typeof spawn> | undefined;
	try {
		const path = join(directory, "blocked.ipynb");
		await promisify(execFile)("mkfifo", [path]);
		const moduleUrl = new URL("../src/notebook.js", import.meta.url).href;
		const script = `
			import { loadNotebook } from ${JSON.stringify(moduleUrl)};
			try { await loadNotebook(${JSON.stringify(path)}); }
			catch (error) { console.log(error instanceof Error ? error.message : String(error)); }
		`;
		child = spawn(process.execPath, ["--input-type=module", "--eval", script], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		const outcome = await Promise.race([
			once(child, "close").then(() => "closed" as const),
			new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 500)),
		]);
		if (outcome === "timeout") {
			child.kill("SIGKILL");
			await once(child, "close");
		}
		assert.equal(outcome, "closed", "FIFO load remained blocked waiting for a writer");
		assert.match(stdout, /not a regular file/);
	} finally {
		if (child && child.exitCode === null) child.kill("SIGKILL");
		await rm(directory, { recursive: true, force: true });
	}
});

test("loadNotebook validates the notebook shape and reports file metadata", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-jupyter-test-"));
	try {
		const path = join(directory, "demo.ipynb");
		await writeFile(path, JSON.stringify({ cells: [], nbformat: 4, nbformat_minor: 5 }));
		const loaded = await loadNotebook(path);
		assert.equal(loaded.model.cells?.length, 0);
		assert.equal(loaded.lastMtime instanceof Date, true);
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(loadNotebook(path, controller.signal), /aborted/i);

		await writeFile(path, JSON.stringify({ cells: "invalid", nbformat: 4 }));
		await assert.rejects(loadNotebook(path), /cells must be an array/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("extension warns on session start and rejects preview UI outside TUI mode", async () => {
	const mock = createJupyterMock();
	jupyterPreview(mock.pi);
	const rpc = createMockContext({ hasUI: true, mode: "rpc" });

	await emit(mock.events, "session_start", {}, rpc.ctx);
	assert.deepEqual(rpc.notifications, [
		{
			message: "pi-jupyter is experimental; its preview behavior and shortcuts may change.",
			level: "warning",
		},
	]);

	const command = mock.commands.get("jupyter");
	for (const args of [
		"",
		"open demo.ipynb",
		"toggle",
		"focus",
		"refresh",
		"close",
		"scroll down 3",
	]) {
		await assert.rejects(
			() => invoke(command?.handler, args, rpc.ctx),
			/requires Pi's interactive TUI mode/,
		);
	}
});

test("commands reject unsupported trailing arguments before changing UI", async () => {
	const mock = createJupyterMock();
	jupyterPreview(mock.pi);
	const context = createMockContext({ hasUI: true, mode: "tui" });

	await assert.rejects(
		() => invoke(mock.commands.get("jupyter")?.handler, "close unexpected", context.ctx),
		/does not accept arguments/,
	);
	assert.equal(context.statuses.size, 0);
});

test("tool-driven TUI preview releases its watcher, overlay, mouse listener, and status", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-jupyter-lifecycle-test-"));
	try {
		const notebookPath = join(directory, "demo.ipynb");
		await writeFile(notebookPath, JSON.stringify({ cells: [], nbformat: 4 }));
		const watchedDirectories: string[] = [];
		let watcherCloses = 0;
		let inputListenerRemovals = 0;
		const terminalWrites: string[] = [];
		let overlayCloses = 0;
		const extension = createJupyterPreview({
			watchNotebook(watchedDirectory) {
				watchedDirectories.push(watchedDirectory);
				return { close: () => watcherCloses++ };
			},
		});
		const mock = createJupyterMock();
		extension(mock.pi);
		const context = createMockContext({
			cwd: directory,
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown, options: unknown) => {
				const overlayOptions = options as {
					onHandle(handle: {
						focus(): void;
						unfocus(): void;
						setHidden(hidden: boolean): void;
					}): void;
				};
				overlayOptions.onHandle({ focus() {}, unfocus() {}, setHidden() {} });
				await new Promise<void>((resolveOverlay) => {
					const build = factory as (...args: unknown[]) => unknown;
					build(
						{
							terminal: {
								columns: 120,
								write(data: string) {
									terminalWrites.push(data);
								},
							},
							addInputListener() {
								return () => inputListenerRemovals++;
							},
							requestRender() {},
						},
						{ fg: (_color: string, text: string) => text },
						{},
						() => {
							overlayCloses++;
							resolveOverlay();
						},
					);
				});
			},
		});

		await emit(mock.events, "tool_call", { input: { path: "demo.ipynb" } }, context.ctx);
		assert.deepEqual(watchedDirectories, []);
		await emit(
			mock.events,
			"tool_result",
			{ input: { path: "demo.ipynb" }, isError: true },
			context.ctx,
		);
		assert.deepEqual(watchedDirectories, []);
		await emit(
			mock.events,
			"tool_result",
			{ input: { path: "demo.ipynb" }, isError: false },
			context.ctx,
		);
		assert.deepEqual(watchedDirectories, [directory]);
		assert.equal(watcherCloses, 0);
		assert.equal(context.statuses.get("jupyter"), "notebook: demo.ipynb");
		assert.equal(terminalWrites.join("").includes("\x1b[?1000h"), true);

		await emit(mock.events, "session_shutdown", {}, context.ctx);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(watcherCloses, 1);
		assert.equal(overlayCloses, 1);
		assert.equal(inputListenerRemovals, 1);
		assert.equal(terminalWrites.join("").includes("\x1b[?1000l"), true);
		assert.equal(context.statuses.get("jupyter"), undefined);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
