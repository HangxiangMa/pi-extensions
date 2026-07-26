import { basename, relative } from "node:path";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Key,
	matchesKey,
	type OverlayOptions,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	type LoadedNotebook,
	type Notebook,
	renderNotebookBody,
	sanitizeTerminalText,
	wrapBoxLines,
} from "./notebook.js";

export const DEFAULT_PANEL_WIDTH_PERCENT = 42;
export const MIN_PANEL_WIDTH = 42;
export const MIN_EDITOR_WIDTH = 24;
export const RIGHT_MARGIN = 1;

export type PreviewState = {
	path?: string;
	cwd: string;
	visible: boolean;
	focused: boolean;
	scroll: number;
	lastLoadedAt?: Date;
	lastMtime?: Date;
	lastError?: string;
	model?: Notebook;
	panelWidth?: number;
	resizing?: boolean;
};

export function applyLoadedNotebook(state: PreviewState, loaded: LoadedNotebook): void {
	state.model = loaded.model;
	state.lastMtime = loaded.lastMtime;
	state.lastLoadedAt = loaded.lastLoadedAt;
	state.lastError = undefined;
}

export class NotebookPreviewPanel implements Component {
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly state: PreviewState;
	private readonly releaseFocus: () => void;

	constructor(tui: TUI, theme: Theme, state: PreviewState, releaseFocus: () => void) {
		this.tui = tui;
		this.theme = theme;
		this.state = state;
		this.releaseFocus = releaseFocus;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, "f8")) {
			this.releaseFocus();
			return;
		}
		const page = 10;
		if (matchesKey(data, Key.up) || data === "k")
			this.state.scroll = Math.max(0, this.state.scroll - 1);
		else if (matchesKey(data, Key.down) || data === "j") this.state.scroll += 1;
		else if (matchesKey(data, Key.home) || data === "g") this.state.scroll = 0;
		else if (matchesKey(data, Key.pageUp) || data === "u") {
			this.state.scroll = Math.max(0, this.state.scroll - page);
		} else if (matchesKey(data, Key.pageDown) || data === "d") this.state.scroll += page;
		else return;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const inner = Math.max(1, width - 2);
		const border = (text: string) => this.theme.fg("border", text);
		const accent = (text: string) => this.theme.fg("accent", text);
		const dim = (text: string) => this.theme.fg("dim", text);
		const error = (text: string) => this.theme.fg("error", text);
		const pad = (text = "") => {
			const truncated = truncateToWidth(text, inner, "…", true);
			return `${border("│")}${truncated}${" ".repeat(Math.max(0, inner - visibleWidth(truncated)))}${border("│")}`;
		};
		const pathLabel = this.state.path
			? sanitizeTerminalText(relative(this.state.cwd, this.state.path) || basename(this.state.path))
			: "no notebook";
		const title = `${this.state.resizing ? "↔ " : this.state.focused ? "● " : ""}Jupyter Preview`;
		const lines = [border(`╭${"─".repeat(inner)}╮`), pad(` ${accent(title)} ${dim(pathLabel)}`)];
		lines.push(`${border("├")}${border("─".repeat(inner))}${border("┤")}`);

		if (!this.state.path) {
			lines.push(pad(" No notebook selected."), pad(dim(" Run /jupyter to choose one.")));
		} else if (this.state.lastError && !this.state.model) {
			lines.push(
				...wrapBoxLines(error(sanitizeTerminalText(this.state.lastError)), inner).map(pad),
			);
		} else if (!this.state.model) lines.push(pad(dim(" Loading…")));
		else {
			if (this.state.lastError) {
				lines.push(
					...wrapBoxLines(
						error(
							` Refresh failed; showing last valid version: ${sanitizeTerminalText(this.state.lastError)}`,
						),
						inner,
					).map(pad),
					pad(),
				);
			}
			const body = renderNotebookBody(this.state, inner, this.theme);
			lines.push(...body.slice(this.state.scroll).map(pad));
		}

		lines.push(`${border("├")}${border("─".repeat(inner))}${border("┤")}`);
		lines.push(pad(dim(previewFooter(this.state, inner))), border(`╰${"─".repeat(inner)}╯`));
		return lines;
	}

	invalidate(): void {}
}

type MouseEvent = { button: number; x: number; y: number; released: boolean };

export function installMouseResize(
	tui: TUI,
	state: PreviewState,
	overlayOptions: OverlayOptions,
	requestRender: () => void,
): () => void {
	const terminal = tui.terminal;
	terminal.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");
	const removeListener = tui.addInputListener((data) => {
		const event = parseSgrMouseEvent(data);
		if (!event) return undefined;
		const isPrimaryButton = (event.button & 3) === 0;
		const isMotion = (event.button & 32) !== 0;
		const handleX = getPanelLeftBorderX(terminal.columns, state);
		if (event.released && state.resizing) {
			state.resizing = false;
			requestRender();
			return { consume: true };
		}
		if (!state.resizing && isPrimaryButton && Math.abs(event.x - handleX) <= 1)
			state.resizing = true;
		if (!state.resizing || !isPrimaryButton) return undefined;
		if (isMotion || event.x !== handleX) {
			const width = clampPanelWidth(
				terminal.columns - RIGHT_MARGIN - (event.x - 1),
				terminal.columns,
			);
			state.panelWidth = width;
			overlayOptions.width = width;
			requestRender();
		}
		return { consume: true };
	});
	return () => {
		state.resizing = false;
		removeListener();
		terminal.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l");
	};
}

export function previewFooter(state: PreviewState, width: number): string {
	if (state.resizing) return " Drag to resize width";
	if (state.focused) {
		return width >= 58
			? " ↑↓ PgUp/PgDn or j/k/u/d scroll • Esc/F8 return"
			: " ↑↓ scroll • Esc/F8 return";
	}
	return width >= 58
		? " Drag left border resize • Ctrl+Alt+j/k scroll • Shift+F8 focus"
		: " Shift+F8 focus • F8 close";
}

export function parseSgrMouseEvent(data: string): MouseEvent | undefined {
	const prefix = "\x1b[<";
	if (!data.startsWith(prefix)) return undefined;
	const suffix = data.at(-1);
	if (suffix !== "M" && suffix !== "m") return undefined;
	const parts = data.slice(prefix.length, -1).split(";");
	if (parts.length !== 3) return undefined;
	const [button, x, y] = parts.map((part) => Number.parseInt(part, 10));
	if (button === undefined || x === undefined || y === undefined) return undefined;
	if (![button, x, y].every(Number.isFinite)) return undefined;
	return { button, x, y, released: suffix === "m" };
}

function getPanelLeftBorderX(termWidth: number, state: PreviewState): number {
	const width = clampPanelWidth(
		state.panelWidth ?? Math.floor((termWidth * DEFAULT_PANEL_WIDTH_PERCENT) / 100),
		termWidth,
	);
	return termWidth - RIGHT_MARGIN - width + 1;
}

export function clampPanelWidth(width: number, termWidth: number): number {
	const maxWidth = Math.max(MIN_PANEL_WIDTH, termWidth - RIGHT_MARGIN - MIN_EDITOR_WIDTH);
	return Math.max(MIN_PANEL_WIDTH, Math.min(maxWidth, Math.round(width)));
}
