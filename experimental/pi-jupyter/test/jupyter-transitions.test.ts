import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { createJupyterPreview } from "../src/jupyter-preview.js";
import type { LoadedNotebook } from "../src/notebook.js";

initTheme("dark", false);

function loaded(cellCount: number): LoadedNotebook {
	return {
		model: {
			cells: Array.from({ length: cellCount }, (_, index) => ({
				cell_type: "markdown",
				source: `cell ${index + 1}`,
			})),
		},
		lastLoadedAt: new Date("2026-07-26T07:00:00Z"),
		lastMtime: new Date("2026-07-26T06:59:00Z"),
	};
}

function menuKeybindings() {
	const inputs: Record<string, readonly string[]> = {
		"tui.select.up": ["\u001b[A"],
		"tui.select.down": ["\u001b[B"],
		"tui.select.pageUp": ["\u001b[5~"],
		"tui.select.pageDown": ["\u001b[6~"],
		"tui.select.confirm": ["\r"],
		"tui.select.cancel": ["\u001b", "\u0003"],
		"tui.input.submit": ["\r"],
	};
	return {
		matches: (data: string, key: string) => inputs[key]?.includes(data) ?? false,
		getKeys: (key: string) => inputs[key] ?? [],
	};
}

function createTransitionHarness(
	load: (path: string, signal?: AbortSignal) => Promise<LoadedNotebook>,
	cwd: string,
) {
	const mock = createMockPi();
	Object.assign(mock.rawPi, { registerShortcut() {} });
	const watchedDirectories: string[] = [];
	const watcherListeners: Array<(event: string, filename: string | Buffer | null) => void> = [];
	let watcherCloses = 0;
	let component: { render(width: number): string[] } | undefined;
	const extension = createJupyterPreview({
		loadNotebook: load,
		watchNotebook(directory, listener) {
			watchedDirectories.push(directory);
			watcherListeners.push(listener);
			return { close: () => watcherCloses++ };
		},
	});
	extension(mock.pi);
	const context = createMockContext({
		cwd,
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown, options: unknown) => {
			(options as { onHandle(handle: unknown): void }).onHandle({
				focus() {},
				unfocus() {},
				setHidden() {},
			});
			await new Promise<void>((resolveOverlay) => {
				component = (factory as (...args: unknown[]) => typeof component)(
					{
						terminal: { columns: 120, write() {} },
						addInputListener: () => () => {},
						requestRender() {},
					},
					{
						fg: (_color: string, text: string) => text,
						bold: (text: string) => text,
					},
					{},
					resolveOverlay,
				);
			});
		},
	});
	return {
		mock,
		context,
		watchedDirectories,
		fireWatch(index: number, filename: string) {
			watcherListeners[index]?.("change", filename);
		},
		get watcherCloses() {
			return watcherCloses;
		},
		render: () => component?.render(60).join("\n") ?? "",
	};
}

async function invokeJupyter(
	harness: ReturnType<typeof createTransitionHarness>,
	args: string,
): Promise<void> {
	await harness.mock.commands.get("jupyter")?.handler(args, harness.context.ctx);
}

function createMenuCustomDriver(inputs: Array<string | undefined>) {
	let step = 0;
	let overlayLines: string[] = [];
	return {
		async custom(factory: unknown, options?: unknown) {
			const overlay = options as
				| { overlay?: boolean; onHandle?(handle: unknown): void }
				| undefined;
			if (overlay?.overlay) {
				overlay.onHandle?.({ focus() {}, unfocus() {}, setHidden() {} });
				return new Promise<void>((resolveOverlay) => {
					const component = (
						factory as (...args: unknown[]) => { render(width: number): string[] }
					)(
						{
							terminal: { columns: 120, write() {} },
							addInputListener: () => () => {},
							requestRender() {},
						},
						{
							fg: (_color: string, text: string) => text,
							bold: (text: string) => text,
						},
						{},
						resolveOverlay,
					);
					overlayLines = component.render(60);
				});
			}
			const input = inputs[step++];
			return new Promise((resolve) => {
				let component: { handleInput?(data: string): void; dispose?(): void };
				const done = (value: unknown) => {
					component.dispose?.();
					resolve(value);
				};
				component = (factory as (...args: unknown[]) => typeof component)(
					{ terminal: { columns: 120 }, requestRender() {} },
					{
						fg: (_color: string, text: string) => text,
						bold: (text: string) => text,
					},
					menuKeybindings(),
					done,
				);
				if (input !== undefined) queueMicrotask(() => component.handleInput?.(input));
			});
		},
		get step() {
			return step;
		},
		get overlayText() {
			return overlayLines.join("\n");
		},
	};
}

test("the primary menu chooses, loads, and opens a notebook atomically", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-menu-open-"));
	try {
		await writeFile(join(cwd, "demo.ipynb"), "{}");
		const mock = createMockPi();
		Object.assign(mock.rawPi, { registerShortcut() {} });
		let watcherStarts = 0;
		const driver = createMenuCustomDriver(["\r", "\r", undefined]);
		createJupyterPreview({
			loadNotebook: async () => loaded(2),
			watchNotebook() {
				watcherStarts++;
				return { close() {} };
			},
		})(mock.pi);
		const context = createMockContext({
			cwd,
			hasUI: true,
			mode: "tui",
			custom: driver.custom.bind(driver),
		});

		await mock.commands.get("jupyter")?.handler("", context.ctx);
		assert.equal(driver.step, 3);
		assert.equal(watcherStarts, 1);
		assert.equal(context.statuses.get("jupyter"), "notebook: demo.ipynb");
		assert.match(driver.overlayText, /demo\.ipynb/);
		assert.match(driver.overlayText, /2 cells/);
		await mock.commands.get("jupyter")?.handler("close", context.ctx);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("cancelling explicit path entry returns to the menu without loading or watching", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-path-cancel-"));
	try {
		const mock = createMockPi();
		Object.assign(mock.rawPi, { registerShortcut() {} });
		let loadStarts = 0;
		let watcherStarts = 0;
		const driver = createMenuCustomDriver(["\r", "\r", "\u0003"]);
		createJupyterPreview({
			loadNotebook: async () => {
				loadStarts++;
				return loaded(1);
			},
			watchNotebook() {
				watcherStarts++;
				return { close() {} };
			},
		})(mock.pi);
		const context = createMockContext({
			cwd,
			hasUI: true,
			mode: "tui",
			input: async () => undefined,
			custom: driver.custom.bind(driver),
		});

		await mock.commands.get("jupyter")?.handler("", context.ctx);
		assert.equal(driver.step, 3);
		assert.equal(loadStarts, 0);
		assert.equal(watcherStarts, 0);
		assert.equal(context.statuses.get("jupyter"), undefined);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("failed notebook switch preserves the prior path, model, watcher, and visible panel", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-atomic-switch-"));
	try {
		const harness = createTransitionHarness(async (path) => {
			if (path.endsWith("bad.ipynb")) throw new Error("invalid notebook JSON");
			return loaded(2);
		}, cwd);
		await invokeJupyter(harness, "open good.ipynb");
		await invokeJupyter(harness, "open bad.ipynb");

		assert.match(harness.render(), /good\.ipynb/);
		assert.match(harness.render(), /2 cells/);
		assert.equal(harness.watchedDirectories.length, 1);
		assert.equal(harness.watcherCloses, 0);
		assert.equal(harness.context.statuses.get("jupyter"), "notebook: good.ipynb");
		assert.match(
			harness.context.notifications.at(-1)?.message ?? "",
			/bad\.ipynb.*invalid notebook JSON/,
		);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("failed refresh retains the last valid notebook and marks it stale", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-atomic-refresh-"));
	try {
		let fail = false;
		const harness = createTransitionHarness(async () => {
			if (fail) throw new Error("partial save");
			return loaded(2);
		}, cwd);
		await invokeJupyter(harness, "open demo.ipynb");
		fail = true;
		await invokeJupyter(harness, "refresh");

		assert.match(harness.render(), /2 cells/);
		assert.match(harness.render(), /partial save/);
		assert.equal(harness.context.statuses.get("jupyter"), "notebook: demo.ipynb (stale)");
		assert.equal(harness.watchedDirectories.length, 1);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("a slower notebook load cannot overwrite a newer selection", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-generation-"));
	try {
		let resolveSlow: ((value: LoadedNotebook) => void) | undefined;
		const slow = new Promise<LoadedNotebook>((resolve) => {
			resolveSlow = resolve;
		});
		const harness = createTransitionHarness(
			async (path) => (path.endsWith("slow.ipynb") ? slow : loaded(2)),
			cwd,
		);
		const slowOpen = invokeJupyter(harness, "open slow.ipynb");
		await Promise.resolve();
		await invokeJupyter(harness, "open fast.ipynb");
		resolveSlow?.(loaded(1));
		await slowOpen;

		assert.match(harness.render(), /fast\.ipynb/);
		assert.match(harness.render(), /2 cells/);
		assert.doesNotMatch(harness.render(), /1 cells/);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("a watcher refresh cannot cancel an explicit notebook switch", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-switch-vs-refresh-"));
	try {
		let resolveSwitch: ((value: LoadedNotebook) => void) | undefined;
		const switchLoad = new Promise<LoadedNotebook>((resolve) => {
			resolveSwitch = resolve;
		});
		let currentLoads = 0;
		const harness = createTransitionHarness(async (path) => {
			if (path.endsWith("next.ipynb")) return switchLoad;
			currentLoads++;
			return loaded(3);
		}, cwd);
		await invokeJupyter(harness, "open current.ipynb");
		const switching = invokeJupyter(harness, "open next.ipynb");
		await Promise.resolve();
		harness.fireWatch(0, "current.ipynb");
		await new Promise((resolve) => setTimeout(resolve, 180));
		assert.equal(currentLoads, 2);
		resolveSwitch?.(loaded(2));
		await switching;

		assert.match(harness.render(), /next\.ipynb/);
		assert.match(harness.render(), /2 cells/);
		assert.equal(harness.watchedDirectories.length, 2);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("cancelling the menu loader leaves notebook state and watchers unchanged", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-load-cancel-"));
	try {
		await writeFile(join(cwd, "demo.ipynb"), "{}");
		const mock = createMockPi();
		Object.assign(mock.rawPi, { registerShortcut() {} });
		let watcherStarts = 0;
		let loadAborted = false;
		let customStep = 0;
		createJupyterPreview({
			watchNotebook() {
				watcherStarts++;
				return { close() {} };
			},
			loadNotebook: async (_path, signal) =>
				new Promise<LoadedNotebook>((_resolve, reject) => {
					signal?.addEventListener(
						"abort",
						() => {
							loadAborted = true;
							reject(signal.reason);
						},
						{ once: true },
					);
				}),
		})(mock.pi);
		const context = createMockContext({
			cwd,
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				const input = customStep++ < 2 ? "\r" : "\x1b";
				return new Promise((resolve) => {
					let component: { handleInput?(data: string): void; dispose?(): void };
					const done = (value: unknown) => {
						component.dispose?.();
						resolve(value);
					};
					component = (factory as (...args: unknown[]) => typeof component)(
						{
							terminal: { columns: 120 },
							requestRender() {},
						},
						{
							fg: (_color: string, text: string) => text,
							bold: (text: string) => text,
						},
						menuKeybindings(),
						done,
					);
					queueMicrotask(() => component.handleInput?.(input));
				});
			},
		});

		await mock.commands.get("jupyter")?.handler("", context.ctx);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(customStep, 3);
		assert.equal(loadAborted, true);
		assert.equal(watcherStarts, 0);
		assert.equal(context.statuses.get("jupyter"), undefined);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("closing and immediately reopening waits for old overlay cleanup before replacing resources", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-reopen-"));
	try {
		const harness = createTransitionHarness(async () => loaded(2), cwd);
		await invokeJupyter(harness, "open demo.ipynb");
		await invokeJupyter(harness, "close");
		assert.equal(harness.context.statuses.get("jupyter"), undefined);
		assert.equal(harness.watcherCloses, 1);

		await invokeJupyter(harness, "open");
		assert.equal(harness.context.statuses.get("jupyter"), "notebook: demo.ipynb");
		assert.equal(harness.watchedDirectories.length, 2);
		assert.match(harness.render(), /demo\.ipynb/);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("refreshing equally long content preserves a valid scroll position", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-scroll-preserve-"));
	try {
		const harness = createTransitionHarness(async () => loaded(20), cwd);
		await invokeJupyter(harness, "open demo.ipynb");
		await invokeJupyter(harness, "scroll down 5");
		await invokeJupyter(harness, "refresh");
		assert.doesNotMatch(harness.render(), / 1\. markdown/);
		assert.match(harness.render(), / 2\. markdown/);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});

test("refreshing shorter content clamps an out-of-range scroll position", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-jupyter-scroll-clamp-"));
	try {
		let cells = 20;
		const harness = createTransitionHarness(async () => loaded(cells), cwd);
		await invokeJupyter(harness, "open demo.ipynb");
		await invokeJupyter(harness, "scroll down 100");
		cells = 1;
		await invokeJupyter(harness, "refresh");
		assert.match(harness.render(), /1\. markdown/);
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});
