import {
	BorderedLoader,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	type Focusable,
	Input,
	Key,
	matchesKey,
	SelectList,
	Text,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { PublicBatchState, PublicHistoryState } from "./batch.js";

export type LimitSettingAction =
	| "maxImages"
	| "maxImageBytes"
	| "maxBatchBytes"
	| "maxImagePixels"
	| "maxRetainedImages"
	| "maxRetainedBytes";

export interface LimitMenuValue {
	current: string;
	defaultValue: string;
	pending?: string;
}

export interface ImageDropLimitsMenuState {
	unsavedChanges: number;
	values: Record<LimitSettingAction, LimitMenuValue>;
}

export type MenuLoadResult<T> =
	| { kind: "completed"; value: T }
	| { kind: "cancelled" }
	| { kind: "closed" }
	| { kind: "error"; error: unknown };

export interface ImageDropMenuState {
	batch: PublicBatchState;
	history: PublicHistoryState;
	serverRunning: boolean;
}

export function runImageDropMenuLoad<T>(
	ctx: ExtensionCommandContext,
	label: string,
	task: (signal: AbortSignal) => Promise<T>,
): Promise<MenuLoadResult<T>> {
	return ctx.ui.custom<MenuLoadResult<T>>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(tui, theme, label);
		const taskAbort = new AbortController();
		let settled = false;
		const finish = (result: MenuLoadResult<T>) => {
			if (settled) return;
			settled = true;
			done(result);
		};
		loader.onAbort = () => {
			taskAbort.abort();
			finish({ kind: "cancelled" });
		};
		void task(taskAbort.signal).then(
			(value) => finish({ kind: "completed", value }),
			(error: unknown) => finish({ kind: "error", error }),
		);
		return {
			render: (width: number) => loader.render(width),
			invalidate: () => loader.invalidate(),
			handleInput(data: string) {
				if (matchesKey(data, Key.ctrl("c"))) {
					taskAbort.abort();
					finish({ kind: "closed" });
					loader.handleInput(data);
					return;
				}
				loader.handleInput(data);
			},
			dispose() {
				taskAbort.abort();
				loader.dispose();
			},
		};
	});
}

export type ConfirmDialogResult = "confirmed" | "cancelled" | "close";
export type InputDialogResult =
	| { kind: "submitted"; value: string }
	| { kind: "cancelled" }
	| { kind: "closed" };

/** Specialized three-way confirmation retained to distinguish Escape from Ctrl+C. */
export function showImageDropConfirmDialog(
	ctx: ExtensionContext,
	title: string,
	message: string,
): Promise<ConfirmDialogResult> {
	return showConfirmScreen(ctx, title, message.split(/\r?\n/));
}

/** Specialized numeric input retained because standard kit screens do not own text editing. */
export function showImageDropInputDialog(
	ctx: ExtensionContext,
	title: string,
	initialValue: string,
): Promise<InputDialogResult> {
	return ctx.ui.custom<InputDialogResult>((tui, theme, keybindings, done) => {
		const input = new Input();
		const heading = new Text("", 0, 0);
		const current = new Text("", 0, 0);
		const hint = new Text("", 0, 0);
		const applyTheme = () => {
			heading.setText(theme.fg("accent", theme.bold(safeMenuText(title))));
			current.setText(theme.fg("muted", `Current: ${safeMenuText(initialValue)}`));
			hint.setText(theme.fg("dim", "enter save • esc back • ctrl+c close"));
		};
		applyTheme();
		const component: Focusable & {
			render(width: number): string[];
			invalidate(): void;
			handleInput(data: string): void;
		} = {
			get focused() {
				return input.focused;
			},
			set focused(value: boolean) {
				input.focused = value;
			},
			render(width: number) {
				const safeWidth = Math.max(1, width);
				return [
					...heading.render(safeWidth),
					...current.render(safeWidth),
					...input.render(safeWidth),
					...hint.render(safeWidth),
				].map((line) => truncateToWidth(line, safeWidth));
			},
			invalidate() {
				applyTheme();
				heading.invalidate();
				current.invalidate();
				input.invalidate();
				hint.invalidate();
			},
			handleInput(data: string) {
				if (matchesKey(data, Key.ctrl("c"))) done({ kind: "closed" });
				else if (keybindings.matches(data, "tui.select.cancel")) done({ kind: "cancelled" });
				else if (keybindings.matches(data, "tui.input.submit")) {
					done({ kind: "submitted", value: input.getValue() });
				} else input.handleInput(data);
				tui.requestRender();
			},
		};
		return component;
	});
}

function showConfirmScreen(
	ctx: ExtensionContext,
	title: string,
	lines: readonly string[],
): Promise<ConfirmDialogResult> {
	return ctx.ui.custom<ConfirmDialogResult>((tui, theme, keybindings, done) => {
		const list = new SelectList(
			[
				{ value: "confirmed", label: "Confirm" },
				{ value: "cancelled", label: "Cancel" },
			],
			2,
			{
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		);
		list.onSelect = (item) => done(item.value as "confirmed" | "cancelled");
		list.onCancel = () => done("cancelled");
		return {
			render(width: number): string[] {
				const safeWidth = Math.max(1, width);
				return [
					...wrapTextWithAnsi(theme.fg("accent", theme.bold(safeMenuText(title))), safeWidth),
					...lines.flatMap((line) =>
						wrapTextWithAnsi(theme.fg("muted", safeMenuText(line)), safeWidth),
					),
					"",
					...list.render(safeWidth),
				].map((line) => truncateToWidth(line, safeWidth));
			},
			invalidate: () => list.invalidate(),
			handleInput(data: string) {
				if (matchesKey(data, Key.ctrl("c"))) done("close");
				else if (keybindings.matches(data, "tui.select.cancel")) done("cancelled");
				else list.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

export function menuSummary(state: ImageDropMenuState): string {
	const total = state.batch.items.length;
	if (state.batch.phase === "empty" || total === 0) return "Draft: No images staged";
	if (state.batch.phase === "reserved") {
		return `Draft: ${total} ${total === 1 ? "image" : "images"} queued with Pi`;
	}
	const ready = state.batch.items.filter((item) => item.status === "ready").length;
	const processing = state.batch.items.filter(
		(item) => item.status === "uploading" || item.status === "processing",
	).length;
	const errors = state.batch.items.filter((item) => item.status === "error").length;
	const parts = [`Draft: ${ready}/${total} ready`];
	if (processing > 0) parts.push(`${processing} processing`);
	if (errors > 0) parts.push(`${errors} need attention`);
	return parts.join(" · ");
}

export function safeMenuText(value: string): string {
	return [...value]
		.map((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
}
