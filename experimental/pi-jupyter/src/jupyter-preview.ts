import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { OverlayHandle, OverlayOptions } from "@earendil-works/pi-tui";
import { loadNotebook, sanitizeTerminalText } from "./notebook.js";
import {
	applyLoadedNotebook,
	DEFAULT_PANEL_WIDTH_PERCENT,
	installMouseResize,
	MIN_PANEL_WIDTH,
	NotebookPreviewPanel,
	type PreviewState,
	RIGHT_MARGIN,
} from "./notebook-panel.js";

const STATUS_KEY = "jupyter";
const NOTEBOOK_EXTENSION = ".ipynb";
const EXPERIMENTAL_WARNING =
	"pi-jupyter is experimental; its preview behavior and shortcuts may change.";

type NotebookWatcher = { close(): void };
type WatchNotebook = (
	directory: string,
	listener: (eventType: string, filename: string | Buffer | null) => void,
) => NotebookWatcher;

export type JupyterPreviewDependencies = {
	watchNotebook: WatchNotebook;
};

const DEFAULT_DEPENDENCIES: JupyterPreviewDependencies = {
	watchNotebook: (directory, listener) => watch(directory, { persistent: false }, listener),
};

export function createJupyterPreview(
	dependencies: JupyterPreviewDependencies,
): (pi: ExtensionAPI) => void {
	return (pi) => registerJupyterPreview(pi, dependencies);
}

export default function jupyterPreview(pi: ExtensionAPI): void {
	registerJupyterPreview(pi, DEFAULT_DEPENDENCIES);
}

function registerJupyterPreview(pi: ExtensionAPI, dependencies: JupyterPreviewDependencies): void {
	const state: PreviewState = {
		cwd: process.cwd(),
		visible: false,
		focused: false,
		scroll: 0,
	};
	let overlayHandle: OverlayHandle | undefined;
	let closeOverlay: (() => void) | undefined;
	let requestRender: (() => void) | undefined;
	let removeMouseResize: (() => void) | undefined;
	let currentWatcher: NotebookWatcher | undefined;
	let cancelWatchDebounce: (() => void) | undefined;
	let watchGeneration = 0;

	function stopWatcher(): void {
		watchGeneration += 1;
		cancelWatchDebounce?.();
		cancelWatchDebounce = undefined;
		currentWatcher?.close();
		currentWatcher = undefined;
	}

	async function reloadSelectedNotebook(): Promise<void> {
		if (!state.path) return;
		try {
			applyLoadedNotebook(state, await loadNotebook(state.path));
		} catch (cause) {
			state.model = undefined;
			state.lastLoadedAt = new Date();
			state.lastError = cause instanceof Error ? cause.message : String(cause);
		}
	}

	function startWatcher(path: string): void {
		stopWatcher();
		const generation = watchGeneration;
		const targetName = basename(path);
		const debounced = debounce(() => {
			if (generation !== watchGeneration || state.path !== path) return;
			void reloadSelectedNotebook().finally(() => requestRender?.());
		}, 150);
		cancelWatchDebounce = debounced.cancel;
		try {
			currentWatcher = dependencies.watchNotebook(dirname(path), (_event, changedName) => {
				if (changedName === null || changedName.toString() === targetName) debounced.run();
			});
		} catch {
			currentWatcher = undefined;
		}
	}

	async function setNotebookPath(rawPath: string, ctx: ExtensionContext): Promise<void> {
		const path = resolveNotebookPath(rawPath, ctx.cwd);
		if (!path.endsWith(NOTEBOOK_EXTENSION)) throw new Error("Notebook path must end in .ipynb.");
		state.cwd = ctx.cwd;
		state.path = path;
		state.scroll = 0;
		await reloadSelectedNotebook();
		startWatcher(path);
	}

	async function showPanel(ctx: ExtensionContext, rawPath?: string): Promise<void> {
		requireTui(ctx);
		if (rawPath?.trim()) await setNotebookPath(rawPath, ctx);
		else if (!state.path) {
			const discovered = await findFirstNotebook(ctx.cwd);
			if (!discovered) {
				ctx.ui.notify("No .ipynb file found. Use /jupyter-preview <path>.", "warning");
				return;
			}
			await setNotebookPath(discovered, ctx);
		} else {
			state.cwd = ctx.cwd;
			await reloadSelectedNotebook();
		}

		state.visible = true;
		ctx.ui.setStatus(STATUS_KEY, "previewing notebook");
		if (overlayHandle) {
			overlayHandle.setHidden(false);
			requestRender?.();
			return;
		}

		const overlayOptions: OverlayOptions = {
			anchor: "right-center",
			width: state.panelWidth ?? `${DEFAULT_PANEL_WIDTH_PERCENT}%`,
			minWidth: MIN_PANEL_WIDTH,
			maxHeight: "96%",
			margin: { right: RIGHT_MARGIN },
			nonCapturing: true,
			visible: (termWidth) => termWidth >= 90,
		};
		void ctx.ui
			.custom<void>(
				(tui, theme, _keybindings, done) => {
					const panel = new NotebookPreviewPanel(tui, theme, state, () => {
						state.focused = false;
						overlayHandle?.unfocus();
						tui.requestRender();
					});
					requestRender = () => tui.requestRender();
					removeMouseResize = installMouseResize(tui, state, overlayOptions, requestRender);
					closeOverlay = () => {
						state.visible = false;
						state.focused = false;
						state.resizing = false;
						done(undefined);
					};
					return panel;
				},
				{
					overlay: true,
					overlayOptions,
					onHandle: (handle) => {
						overlayHandle = handle;
					},
				},
			)
			.catch((cause: unknown) => {
				try {
					ctx.ui.notify(
						`Jupyter preview closed after a UI error: ${sanitizeTerminalText(cause instanceof Error ? cause.message : String(cause))}`,
						"error",
					);
				} catch {
					// A replacement session can invalidate the context before error reporting.
				}
			})
			.finally(() => {
				removeMouseResize?.();
				removeMouseResize = undefined;
				overlayHandle = undefined;
				closeOverlay = undefined;
				requestRender = undefined;
				state.visible = false;
				state.focused = false;
				state.resizing = false;
				try {
					ctx.ui.setStatus(STATUS_KEY, undefined);
				} catch {
					// A replacement session can invalidate the context before overlay disposal settles.
				}
			});
	}

	function hidePanel(ctx?: ExtensionContext): void {
		state.visible = false;
		state.focused = false;
		state.resizing = false;
		if (ctx?.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
		closeOverlay?.();
	}

	function focusPanel(ctx: ExtensionContext): void {
		requireTui(ctx);
		if (!overlayHandle) {
			ctx.ui.notify("Jupyter preview is not open. Use /jupyter-preview <path>.", "warning");
			return;
		}
		state.focused = true;
		overlayHandle.focus();
		requestRender?.();
		ctx.ui.notify(
			"Notebook preview focused. Use arrow keys or j/k/u/d to scroll; Esc/F8 returns.",
			"info",
		);
	}

	function scrollPreview(delta: number | "top", ctx: ExtensionContext): void {
		requireTui(ctx);
		if (!state.visible || !overlayHandle) {
			ctx.ui.notify("Jupyter preview is not open. Use /jupyter-preview <path>.", "warning");
			return;
		}
		state.scroll = delta === "top" ? 0 : Math.max(0, state.scroll + delta);
		requestRender?.();
	}

	registerCommands(pi, {
		showPanel,
		hidePanel,
		focusPanel,
		scrollPreview,
		reload: async (ctx) => {
			requireTui(ctx);
			if (!state.path) {
				ctx.ui.notify("No notebook selected. Use /jupyter-preview <path>.", "warning");
				return;
			}
			await reloadSelectedNotebook();
			requestRender?.();
		},
		isVisible: () => state.visible && overlayHandle !== undefined,
	});

	pi.registerShortcut("f8", {
		description: "Toggle Jupyter notebook preview",
		handler: async (ctx) => {
			if (state.visible && overlayHandle) hidePanel(ctx);
			else await showPanel(ctx);
		},
	});
	pi.registerShortcut("shift+f8", {
		description: "Focus Jupyter notebook preview for scrolling",
		handler: async (ctx) => focusPanel(ctx),
	});
	for (const [shortcut, delta, description] of [
		["ctrl+alt+j", 3, "Scroll Jupyter notebook preview down"],
		["ctrl+alt+k", -3, "Scroll Jupyter notebook preview up"],
		["ctrl+alt+d", 12, "Page down Jupyter notebook preview"],
		["ctrl+alt+u", -12, "Page up Jupyter notebook preview"],
	] as const) {
		pi.registerShortcut(shortcut, {
			description,
			handler: async (ctx) => scrollPreview(delta, ctx),
		});
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.notify(EXPERIMENTAL_WARNING, "warning");
	});
	pi.on("tool_call", async (event, ctx) => {
		if (ctx.mode !== "tui") return;
		const candidate = extractNotebookPath(event.input);
		if (!candidate) return;
		state.cwd = ctx.cwd;
		state.path = resolveNotebookPath(candidate, ctx.cwd);
		startWatcher(state.path);
	});
	pi.on("tool_result", async (event, ctx) => {
		if (ctx.mode !== "tui") return;
		const candidate = extractNotebookPath(event.input);
		if (!candidate) return;
		if (state.visible) {
			await setNotebookPath(candidate, ctx);
			requestRender?.();
		} else await showPanel(ctx, candidate);
	});
	pi.on("session_shutdown", async (_event, ctx) => {
		stopWatcher();
		hidePanel(ctx);
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}

type CommandActions = {
	showPanel(ctx: ExtensionContext, path?: string): Promise<void>;
	hidePanel(ctx: ExtensionContext): void;
	focusPanel(ctx: ExtensionContext): void;
	scrollPreview(delta: number | "top", ctx: ExtensionContext): void;
	reload(ctx: ExtensionContext): Promise<void>;
	isVisible(): boolean;
};

function registerCommands(pi: ExtensionAPI, actions: CommandActions): void {
	pi.registerCommand("jupyter-preview", {
		description: "Open or refresh a right-side .ipynb preview. Usage: /jupyter-preview [path]",
		handler: async (args, ctx) => actions.showPanel(ctx, args),
	});
	pi.registerCommand("jupyter-preview-close", {
		description: "Close the right-side Jupyter notebook preview",
		handler: async (args, ctx) => {
			assertNoArguments("/jupyter-preview-close", args);
			requireTui(ctx);
			actions.hidePanel(ctx);
		},
	});
	pi.registerCommand("jupyter-preview-toggle", {
		description:
			"Toggle the right-side Jupyter notebook preview. Usage: /jupyter-preview-toggle [path]",
		handler: async (args, ctx) => {
			requireTui(ctx);
			if (actions.isVisible() && !args.trim()) actions.hidePanel(ctx);
			else await actions.showPanel(ctx, args);
		},
	});
	pi.registerCommand("jupyter-preview-focus", {
		description: "Focus the notebook preview for keyboard scrolling",
		handler: async (args, ctx) => {
			assertNoArguments("/jupyter-preview-focus", args);
			actions.focusPanel(ctx);
		},
	});
	pi.registerCommand("jupyter-preview-refresh", {
		description: "Reload the current notebook preview from disk",
		handler: async (args, ctx) => {
			assertNoArguments("/jupyter-preview-refresh", args);
			await actions.reload(ctx);
		},
	});
	for (const [name, direction, fallback] of [
		["jupyter-preview-up", -1, 3],
		["jupyter-preview-down", 1, 3],
	] as const) {
		pi.registerCommand(name, {
			description: `Scroll the notebook preview ${direction < 0 ? "up" : "down"}. Usage: /${name} [lines]`,
			handler: async (args, ctx) => {
				actions.scrollPreview(direction * parsePositiveLineCount(args, fallback), ctx);
			},
		});
	}
	for (const [name, delta] of [
		["jupyter-preview-page-up", -12],
		["jupyter-preview-page-down", 12],
	] as const) {
		pi.registerCommand(name, {
			description: `Scroll the notebook preview one page ${delta < 0 ? "up" : "down"}`,
			handler: async (args, ctx) => {
				assertNoArguments(`/${name}`, args);
				actions.scrollPreview(delta, ctx);
			},
		});
	}
	pi.registerCommand("jupyter-preview-top", {
		description: "Scroll the notebook preview to the top",
		handler: async (args, ctx) => {
			assertNoArguments("/jupyter-preview-top", args);
			actions.scrollPreview("top", ctx);
		},
	});
}

export function parsePositiveLineCount(args: string, fallback: number): number {
	const value = args.trim();
	if (!value) return fallback;
	if (!/^[1-9]\d*$/.test(value)) throw new Error("Scroll amount must be one positive integer.");
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new Error("Scroll amount must be one positive integer.");
	return parsed;
}

function assertNoArguments(command: string, args: string): void {
	if (args.trim()) throw new Error(`${command} does not accept arguments.`);
}

function requireTui(ctx: ExtensionContext): void {
	if (ctx.mode !== "tui") throw new Error("pi-jupyter preview requires Pi's interactive TUI mode.");
}

export function resolveNotebookPath(rawPath: string, cwd: string): string {
	return resolve(cwd, rawPath.trim().replace(/^@/, ""));
}

export function extractNotebookPath(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const object = input as Record<string, unknown>;
	for (const key of ["path", "file", "filename"] as const) {
		const value = object[key];
		if (typeof value === "string" && value.endsWith(NOTEBOOK_EXTENSION)) return value;
	}
	return undefined;
}

async function findFirstNotebook(cwd: string): Promise<string | undefined> {
	try {
		const entries = await readdir(cwd, { withFileTypes: true });
		const name = entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(NOTEBOOK_EXTENSION))
			.map((entry) => entry.name)
			.sort()[0];
		return name ? resolve(cwd, name) : undefined;
	} catch {
		return undefined;
	}
}

function debounce(callback: () => void, milliseconds: number): { run(): void; cancel(): void } {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		run() {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				callback();
			}, milliseconds);
		},
		cancel() {
			if (timer) clearTimeout(timer);
			timer = undefined;
		},
	};
}
