import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
	BorderedLoader,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { OverlayHandle, OverlayOptions } from "@earendil-works/pi-tui";
import { type JupyterScrollDirection, registerJupyterCommand } from "./jupyter-command.js";
import {
	createJupyterHelpComponent,
	createJupyterMenuComponent,
	createNotebookPickerComponent,
	type JupyterMenuAction,
} from "./jupyter-menu.js";
import { type LoadedNotebook, loadNotebook, sanitizeTerminalText } from "./notebook.js";
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
	loadNotebook(path: string, signal?: AbortSignal): Promise<LoadedNotebook>;
};

const DEFAULT_DEPENDENCIES: JupyterPreviewDependencies = {
	watchNotebook: (directory, listener) => watch(directory, { persistent: false }, listener),
	loadNotebook,
};

export function createJupyterPreview(
	dependencies: Partial<JupyterPreviewDependencies>,
): (pi: ExtensionAPI) => void {
	return (pi) => registerJupyterPreview(pi, { ...DEFAULT_DEPENDENCIES, ...dependencies });
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
	let overlayTask: Promise<void> | undefined;
	let currentWatcher: NotebookWatcher | undefined;
	let cancelWatchDebounce: (() => void) | undefined;
	let watchGeneration = 0;
	let selectionGeneration = 0;
	let refreshGeneration = 0;
	let pendingSelectionPath: string | undefined;

	function stopWatcher(): void {
		watchGeneration += 1;
		cancelWatchDebounce?.();
		cancelWatchDebounce = undefined;
		currentWatcher?.close();
		currentWatcher = undefined;
	}

	async function reloadSelectedNotebook(ctx?: ExtensionContext): Promise<boolean> {
		const path = state.path;
		if (!path) return false;
		const generation = ++refreshGeneration;
		try {
			const loaded = await dependencies.loadNotebook(path);
			if (generation !== refreshGeneration || state.path !== path) return false;
			applyLoadedNotebook(state, loaded);
			updateStatus(ctx);
			return true;
		} catch (cause) {
			if (generation !== refreshGeneration || state.path !== path) return false;
			state.lastError = errorMessage(cause);
			updateStatus(ctx);
			return false;
		}
	}

	function startWatcher(path: string, ctx: ExtensionContext): boolean {
		const generation = watchGeneration + 1;
		const targetName = basename(path);
		const debounced = debounce(() => {
			if (generation !== watchGeneration || state.path !== path) return;
			void reloadSelectedNotebook(ctx).finally(() => requestRender?.());
		}, 150);
		let watcher: NotebookWatcher;
		try {
			watcher = dependencies.watchNotebook(dirname(path), (_event, changedName) => {
				if (changedName === null || changedName.toString() === targetName) debounced.run();
			});
		} catch (cause) {
			debounced.cancel();
			ctx.ui.notify(
				`Could not watch ${sanitizeTerminalText(path)}: ${errorMessage(cause)}. The previous preview was preserved.`,
				"error",
			);
			return false;
		}
		stopWatcher();
		currentWatcher = watcher;
		cancelWatchDebounce = debounced.cancel;
		return true;
	}

	async function setNotebookPath(
		rawPath: string,
		ctx: ExtensionContext,
		signal?: AbortSignal,
	): Promise<boolean> {
		const path = resolveNotebookPath(rawPath, ctx.cwd);
		if (!path.endsWith(NOTEBOOK_EXTENSION)) {
			ctx.ui.notify("Notebook path must end in .ipynb.", "error");
			return false;
		}
		const generation = ++selectionGeneration;
		refreshGeneration += 1;
		pendingSelectionPath = path;
		updateStatus(ctx);
		try {
			const loaded = await dependencies.loadNotebook(path, signal);
			signal?.throwIfAborted();
			if (generation !== selectionGeneration) return false;
			refreshGeneration += 1;
			if (!startWatcher(path, ctx)) {
				pendingSelectionPath = undefined;
				updateStatus(ctx);
				return false;
			}
			state.cwd = ctx.cwd;
			state.path = path;
			state.scroll = 0;
			applyLoadedNotebook(state, loaded);
			pendingSelectionPath = undefined;
			updateStatus(ctx);
			return true;
		} catch (cause) {
			if (generation !== selectionGeneration) return false;
			pendingSelectionPath = undefined;
			updateStatus(ctx);
			if (signal?.aborted) return false;
			ctx.ui.notify(
				`Could not open ${sanitizeTerminalText(path)}: ${errorMessage(cause)}. The previous preview was preserved.`,
				"error",
			);
			return false;
		}
	}

	async function showPanel(ctx: ExtensionContext, rawPath?: string): Promise<void> {
		requireTui(ctx);
		if (rawPath?.trim()) {
			if (!(await setNotebookPath(rawPath, ctx))) return;
		} else if (!state.path) {
			const discovered = await findFirstNotebook(ctx.cwd);
			if (!discovered) {
				ctx.ui.notify("No top-level .ipynb file found. Run /jupyter to enter a path.", "warning");
				return;
			}
			if (!(await setNotebookPath(discovered, ctx))) return;
		} else {
			state.cwd = ctx.cwd;
			const loaded = await reloadSelectedNotebook(ctx);
			if (!loaded && !state.model) return;
			startWatcher(state.path, ctx);
		}

		openPanel(ctx);
	}

	function openPanel(ctx: ExtensionContext): void {
		state.visible = true;
		updateStatus(ctx);
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
		const task = ctx.ui
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
				if (overlayTask !== task) return;
				overlayTask = undefined;
				selectionGeneration += 1;
				refreshGeneration += 1;
				pendingSelectionPath = undefined;
				stopWatcher();
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
		overlayTask = task;
		void task;
	}

	async function hidePanel(ctx?: ExtensionContext): Promise<void> {
		selectionGeneration += 1;
		refreshGeneration += 1;
		pendingSelectionPath = undefined;
		stopWatcher();
		state.visible = false;
		state.focused = false;
		state.resizing = false;
		if (ctx?.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
		closeOverlay?.();
		await overlayTask;
	}

	function focusPanel(ctx: ExtensionContext): void {
		requireTui(ctx);
		if (!overlayHandle) {
			ctx.ui.notify("Jupyter preview is not open. Run /jupyter to open it.", "warning");
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
			ctx.ui.notify("Jupyter preview is not open. Run /jupyter to open it.", "warning");
			return;
		}
		state.scroll = delta === "top" ? 0 : Math.max(0, state.scroll + delta);
		requestRender?.();
	}

	function updateStatus(ctx?: ExtensionContext, loadingPath = pendingSelectionPath): void {
		if (!ctx?.hasUI) return;
		if (loadingPath) {
			ctx.ui.setStatus(
				STATUS_KEY,
				`loading notebook: ${sanitizeTerminalText(basename(loadingPath))}`,
			);
			return;
		}
		if (!state.visible || !state.path) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const stale = state.lastError ? " (stale)" : "";
		ctx.ui.setStatus(STATUS_KEY, `notebook: ${sanitizeTerminalText(basename(state.path))}${stale}`);
	}

	async function loadFromMenu(ctx: ExtensionCommandContext, path: string): Promise<boolean> {
		return ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
			const loader = new BorderedLoader(
				tui,
				theme,
				`Loading ${sanitizeTerminalText(basename(resolveNotebookPath(path, ctx.cwd)))}…`,
				{ cancellable: true },
			);
			let settled = false;
			const finish = (result: boolean) => {
				if (settled) return;
				settled = true;
				done(result);
			};
			loader.onAbort = () => finish(false);
			void setNotebookPath(path, ctx, loader.signal).then(finish);
			return loader;
		});
	}

	async function showJupyterMenu(ctx: ExtensionCommandContext): Promise<void> {
		requireTui(ctx);
		let selectedAction: JupyterMenuAction | undefined;
		while (true) {
			const action = await ctx.ui.custom<JupyterMenuAction | undefined>(
				(tui, theme, keybindings, done) =>
					createJupyterMenuComponent(
						{
							...state,
							cellCount: state.model?.cells?.length,
						},
						tui.terminal.columns,
						tui,
						theme,
						keybindings,
						done,
						selectedAction,
					),
			);
			if (!action) return;
			selectedAction = action;
			switch (action) {
				case "open":
					if (state.path && (await loadFromMenu(ctx, state.path))) openPanel(ctx);
					return;
				case "choose": {
					const selection = await chooseNotebook(ctx);
					if (selection === "back") continue;
					return;
				}
				case "focus":
					focusPanel(ctx);
					return;
				case "refresh":
					await reloadSelectedNotebook(ctx);
					requestRender?.();
					return;
				case "close":
					await hidePanel(ctx);
					ctx.ui.notify("Jupyter preview closed.", "info");
					return;
				case "help": {
					const result = await ctx.ui.custom<"back" | "close">((tui, theme, keybindings, done) =>
						createJupyterHelpComponent(tui, theme, keybindings, done),
					);
					if (result === "close") return;
					continue;
				}
			}
		}
	}

	async function chooseNotebook(ctx: ExtensionCommandContext): Promise<"back" | "closed"> {
		const paths = await findNotebooks(ctx.cwd);
		const result = await ctx.ui.custom<
			| { action: "select"; path: string }
			| { action: "enter-path" }
			| { action: "back" }
			| { action: "close" }
		>((tui, theme, keybindings, done) =>
			createNotebookPickerComponent(paths, state.path, tui, theme, keybindings, done),
		);
		if (result.action === "back") return "back";
		if (result.action === "close") return "closed";
		let selectedPath = result.action === "select" ? result.path : undefined;
		if (!selectedPath) {
			const entered = await ctx.ui.input("Notebook path", "path/to/notebook.ipynb");
			if (!entered?.trim()) return "back";
			selectedPath = entered.trim();
			const resolved = resolveNotebookPath(selectedPath, ctx.cwd);
			const local = relative(ctx.cwd, resolved);
			if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
				const confirmed = await ctx.ui.confirm(
					"Open notebook outside workspace?",
					sanitizeTerminalText(resolved),
				);
				if (!confirmed) return "back";
			}
		}
		if (await loadFromMenu(ctx, selectedPath)) openPanel(ctx);
		return "closed";
	}

	registerJupyterCommand(pi, {
		showMenu: showJupyterMenu,
		open: showPanel,
		toggle: async (ctx, path) => {
			requireTui(ctx);
			if (state.visible && overlayHandle && !path?.trim()) await hidePanel(ctx);
			else await showPanel(ctx, path);
		},
		focus: focusPanel,
		refresh: async (ctx) => {
			requireTui(ctx);
			if (!state.path) {
				ctx.ui.notify("No notebook selected. Run /jupyter to choose one.", "warning");
				return;
			}
			await reloadSelectedNotebook(ctx);
			requestRender?.();
		},
		close: async (ctx) => {
			requireTui(ctx);
			await hidePanel(ctx);
		},
		scroll: (direction, lines, ctx) => {
			const delta = scrollDelta(direction, lines);
			scrollPreview(delta, ctx);
		},
	});

	pi.registerShortcut("f8", {
		description: "Toggle Jupyter notebook preview",
		handler: async (ctx) => {
			if (state.visible && overlayHandle) await hidePanel(ctx);
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
	pi.on("tool_result", async (event, ctx) => {
		if (ctx.mode !== "tui" || event.isError) return;
		const candidate = extractNotebookPath(event.input);
		if (!candidate) return;
		if (state.visible) {
			await setNotebookPath(candidate, ctx);
			requestRender?.();
		} else await showPanel(ctx, candidate);
	});
	pi.on("session_shutdown", async (_event, ctx) => {
		await hidePanel(ctx);
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}

function scrollDelta(direction: JupyterScrollDirection, lines?: number): number | "top" {
	switch (direction) {
		case "up":
			return -(lines ?? 3);
		case "down":
			return lines ?? 3;
		case "page-up":
			return -12;
		case "page-down":
			return 12;
		case "top":
			return "top";
	}
}

export function parsePositiveLineCount(args: string, fallback: number): number {
	const value = args.trim();
	if (!value) return fallback;
	if (!/^[1-9]\d*$/.test(value)) throw new Error("Scroll amount must be one positive integer.");
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new Error("Scroll amount must be one positive integer.");
	return parsed;
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
	return (await findNotebooks(cwd))[0];
}

async function findNotebooks(cwd: string): Promise<string[]> {
	try {
		const entries = await readdir(cwd, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(NOTEBOOK_EXTENSION))
			.map((entry) => resolve(cwd, entry.name))
			.sort();
	} catch {
		return [];
	}
}

function errorMessage(cause: unknown): string {
	return sanitizeTerminalText(cause instanceof Error ? cause.message : String(cause));
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
