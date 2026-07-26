import { BorderedLoader, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	Key,
	matchesKey,
	type SelectItem,
	SelectList,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { PublicBatchState, PublicHistoryState } from "./batch.js";

export type MainMenuAction = "open" | "status" | "settings" | "help" | "close";
export type StatusAction = "open" | "refresh" | "back" | "close";
export type SettingsAction = "toggle-start" | "limits" | "back" | "close";
export type LimitsAction =
	| "maxImages"
	| "maxImageBytes"
	| "maxBatchBytes"
	| "maxImagePixels"
	| "maxRetainedImages"
	| "maxRetainedBytes"
	| "save"
	| "defaults"
	| "back"
	| "close";

export type MenuLoadResult<T> =
	| { kind: "completed"; value: T }
	| { kind: "cancelled" }
	| { kind: "error"; error: unknown };

export interface ImageDropMenuState {
	batch: PublicBatchState;
	history: PublicHistoryState;
	serverRunning: boolean;
}

const MAIN_ACTIONS: readonly SelectItem[] = [
	{
		value: "open",
		label: "Open staging page",
		description: "Paste, review, and order images in your browser",
	},
	{ value: "status", label: "Status", description: "Check readiness and image sending" },
	{ value: "settings", label: "Settings", description: "Auto-start and resource limits" },
	{ value: "help", label: "Help", description: "Workflow, privacy, and remote access" },
	{ value: "close", label: "Close" },
];

export function runImageDropMenuLoad<T>(
	ctx: ExtensionCommandContext,
	label: string,
	task: (signal: AbortSignal) => Promise<T>,
): Promise<MenuLoadResult<T>> {
	return ctx.ui.custom<MenuLoadResult<T>>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(tui, theme, label);
		let settled = false;
		const finish = (result: MenuLoadResult<T>) => {
			if (settled) return;
			settled = true;
			done(result);
		};
		loader.onAbort = () => finish({ kind: "cancelled" });
		void task(loader.signal).then(
			(value) => finish({ kind: "completed", value }),
			(error: unknown) => finish({ kind: "error", error }),
		);
		return loader;
	});
}

export function showImageDropMainMenu(
	ctx: ExtensionCommandContext,
	state: ImageDropMenuState,
): Promise<MainMenuAction> {
	return showActionScreen(ctx, {
		title: "Image Drop",
		lines: [menuSummary(state), `Service: ${state.serverRunning ? "Running" : "Not started"}`],
		items: MAIN_ACTIONS,
		cancel: "close",
		hint: "↑↓ navigate • enter select • esc close",
	});
}

export function showImageDropStatus(
	ctx: ExtensionCommandContext,
	lines: readonly string[],
): Promise<StatusAction> {
	return showActionScreen(ctx, {
		title: "Image Drop Status",
		lines,
		items: [
			{ value: "open", label: "Open staging page" },
			{ value: "refresh", label: "Refresh status" },
			{ value: "back", label: "Back" },
			{ value: "close", label: "Close" },
		],
		cancel: "back",
		hint: "↑↓ navigate • enter select • esc back • Ctrl+C close",
	});
}

export function showImageDropHelp(ctx: ExtensionCommandContext): Promise<"back" | "close"> {
	return showActionScreen(ctx, {
		title: "How Image Drop works",
		lines: [
			"1. Open the staging page.",
			"2. Paste, drop, or choose images and review their order.",
			"3. Return to Pi and send a non-empty interactive message.",
			"4. Ready images are attached automatically in browser order.",
			"Images stay in this Pi process until removed, evicted, or the session ends.",
			"For SSH or containers, forward the printed 127.0.0.1 port without changing the Host value.",
		],
		items: [
			{ value: "back", label: "Back" },
			{ value: "close", label: "Close" },
		],
		cancel: "back",
		hint: "↑↓ navigate • enter select • esc back • Ctrl+C close",
	});
}

export function showImageDropSettingsMenu(
	ctx: ExtensionCommandContext,
	options: { lines: readonly string[]; editable: boolean },
): Promise<SettingsAction> {
	const items: SelectItem[] = options.editable
		? [
				{ value: "toggle-start", label: "Toggle automatic start" },
				{ value: "limits", label: "Resource limits…", description: "Advanced" },
			]
		: [];
	items.push({ value: "back", label: "Back" }, { value: "close", label: "Close" });
	return showActionScreen(ctx, {
		title: "Image Drop Settings",
		lines: options.lines,
		items,
		cancel: "back",
		hint: "↑↓ navigate • enter select • esc back • Ctrl+C close",
	});
}

export function showImageDropLimitsMenu(
	ctx: ExtensionCommandContext,
	lines: readonly string[],
): Promise<LimitsAction> {
	return showActionScreen(ctx, {
		title: "Resource limits",
		lines,
		items: [
			{ value: "maxImages", label: "Images per draft" },
			{ value: "maxImageBytes", label: "Size per image" },
			{ value: "maxBatchBytes", label: "Combined draft size" },
			{ value: "maxImagePixels", label: "Decoded pixels" },
			{ value: "maxRetainedImages", label: "Retained history images" },
			{ value: "maxRetainedBytes", label: "Retained history size" },
			{ value: "save", label: "Review and save" },
			{ value: "defaults", label: "Use safe defaults" },
			{ value: "back", label: "Back" },
			{ value: "close", label: "Close" },
		],
		cancel: "back",
		hint: "↑↓ navigate • enter select • esc back • Ctrl+C close",
	});
}

interface ActionScreenOptions<T extends string> {
	title: string;
	lines: readonly string[];
	items: readonly SelectItem[];
	cancel: T;
	hint: string;
}

async function showActionScreen<T extends string>(
	ctx: ExtensionCommandContext,
	options: ActionScreenOptions<T>,
): Promise<T> {
	return ctx.ui.custom<T>((tui, theme, keybindings, done) => {
		const list = new SelectList([...options.items], Math.min(options.items.length, 10), {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		list.onSelect = (item) => done(String(item.value) as T);
		list.onCancel = () => done(options.cancel);
		return {
			render(width: number): string[] {
				const safeWidth = Math.max(1, width);
				return [
					...wrapTextWithAnsi(theme.fg("accent", theme.bold(options.title)), safeWidth),
					...options.lines.flatMap((line) =>
						wrapTextWithAnsi(theme.fg("muted", safeMenuText(line)), safeWidth),
					),
					"",
					...list.render(safeWidth),
					...wrapTextWithAnsi(theme.fg("dim", options.hint), safeWidth),
				].map((line) => truncateToWidth(line, safeWidth));
			},
			invalidate() {
				list.invalidate();
			},
			handleInput(data: string) {
				if (matchesKey(data, Key.ctrl("c"))) {
					done("close" as T);
					return;
				}
				if (keybindings.matches(data, "tui.select.cancel")) {
					done(options.cancel);
					return;
				}
				list.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

export function menuSummary(state: ImageDropMenuState): string {
	const total = state.batch.items.length;
	if (state.batch.phase === "empty" || total === 0) return "Draft: No images staged";
	if (state.batch.phase === "reserved")
		return `Draft: ${total} ${plural(total, "image")} queued with Pi`;
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

function plural(count: number, noun: string): string {
	return count === 1 ? noun : `${noun}s`;
}
