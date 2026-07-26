import {
	BorderedLoader,
	type ExtensionCommandContext,
	type ExtensionContext,
	getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	type Focusable,
	Input,
	Key,
	matchesKey,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	Text,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { PublicBatchState, PublicHistoryState } from "./batch.js";

export type MainMenuAction = "open" | "status" | "settings" | "help" | "close";
export type StatusAction = "open" | "refresh" | "back" | "close";
export type SettingsAction = "limits" | "back" | "close";
export type LimitSettingAction =
	| "maxImages"
	| "maxImageBytes"
	| "maxBatchBytes"
	| "maxImagePixels"
	| "maxRetainedImages"
	| "maxRetainedBytes";
export type LimitsAction = LimitSettingAction | "save" | "defaults" | "back" | "close";

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

const MAIN_ACTIONS: readonly SelectItem[] = [
	{
		value: "open",
		label: "Add images in browser",
		description: "Stage and arrange images for your next Pi message",
	},
	{
		value: "status",
		label: "Check image status",
		description: "See what is ready and whether Pi can send images",
	},
	{
		value: "settings",
		label: "Change Image Drop settings",
		description: "Choose automatic startup and image limits",
	},
	{
		value: "help",
		label: "How Image Drop works",
		description: "Learn how images are attached, stored, and forwarded",
	},
	{
		value: "close",
		label: "Close menu",
		description: "Return to Pi without changing anything",
	},
];

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

export function showImageDropMainMenu(
	ctx: ExtensionCommandContext,
	state: ImageDropMenuState,
): Promise<MainMenuAction> {
	return showActionScreen(ctx, {
		title: "Image Drop",
		lines: [menuSummary(state), `Service: ${state.serverRunning ? "Running" : "Not started"}`],
		items: MAIN_ACTIONS,
		cancel: "close",
		hint: "close",
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
		hint: "back",
	});
}

export type ConfirmDialogResult = "confirmed" | "cancelled" | "close";
export type InputDialogResult =
	| { kind: "submitted"; value: string }
	| { kind: "cancelled" }
	| { kind: "closed" };

export function showImageDropConfirmDialog(
	ctx: ExtensionContext,
	title: string,
	message: string,
): Promise<ConfirmDialogResult> {
	return showActionScreen(ctx, {
		title,
		lines: message.split(/\r?\n/),
		items: [
			{ value: "confirmed", label: "Confirm" },
			{ value: "cancelled", label: "Cancel" },
		],
		cancel: "cancelled",
		hint: "back",
	});
}

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
			const confirm = bindingText(keybindings, "tui.input.submit");
			const cancel = bindingText(keybindings, "tui.select.cancel", "ctrl+c");
			hint.setText(
				theme.fg(
					"dim",
					[
						...(confirm ? [`${confirm} save`] : []),
						...(cancel ? [`${cancel} back`] : []),
						"ctrl+c close",
					].join(" • "),
				),
			);
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
		hint: "back",
	});
}

export interface ImageDropSettingsMenuOptions {
	lines: readonly string[];
	editable: boolean;
	startOnSessionStart: boolean;
	limitsValue: "Recommended" | "Custom";
	onStartChange(enabled: boolean): Promise<boolean>;
}

export function showImageDropSettingsMenu(
	ctx: ExtensionCommandContext,
	options: ImageDropSettingsMenuOptions,
): Promise<SettingsAction> {
	return ctx.ui.custom<SettingsAction>((tui, theme, _keybindings, done) => {
		let closed = false;
		let exitRequested = false;
		let persistedStart = options.startOnSessionStart ? "On" : "Off";
		let displayedStart = persistedStart;
		let saveQueue = Promise.resolve();
		const finishWhenSaved = (action: SettingsAction) => {
			if (exitRequested) return;
			exitRequested = true;
			const finish = () => {
				if (closed) return;
				closed = true;
				done(action);
			};
			void saveQueue.then(finish, finish);
		};
		const items: SettingItem[] = options.editable
			? [
					{
						id: "automatic-start",
						label: "Start with each Pi session",
						description: "Default: Off · Starts Image Drop and shows a staging link",
						currentValue: persistedStart,
						values: ["Off", "On"],
					},
					{
						id: "limits",
						label: "Image limits",
						description: "Open current, default, and pending image limits",
						currentValue: options.limitsValue,
						submenu: () => {
							finishWhenSaved("limits");
							return new Text("Waiting for settings to save…", 1, 0);
						},
					},
				]
			: [];
		const settingsTheme = getSettingsListTheme();
		const list = new SettingsList(
			items,
			Math.min(items.length + 2, 10),
			settingsTheme,
			(id, value) => {
				if (id !== "automatic-start" || exitRequested) return;
				displayedStart = value;
				const saveAttempt = options.onStartChange(value === "On").catch(() => false);
				saveQueue = saveQueue.then(async () => {
					const saved = await saveAttempt;
					if (closed) return;
					if (saved) persistedStart = value;
					else if (displayedStart === value) {
						displayedStart = persistedStart;
						list.updateValue(id, persistedStart);
					}
					tui.requestRender();
				});
			},
			() => finishWhenSaved("back"),
		);
		const header = new Container();
		const title = new Text("", 0, 0);
		const diagnostics = options.lines.map(() => new Text("", 0, 0));
		header.addChild(title);
		for (const diagnostic of diagnostics) header.addChild(diagnostic);
		const applyTheme = () => {
			title.setText(theme.fg("accent", theme.bold("Image Drop Settings")));
			for (const [index, line] of options.lines.entries()) {
				diagnostics[index]?.setText(theme.fg("muted", safeMenuText(line)));
			}
			Object.assign(settingsTheme, getSettingsListTheme());
		};
		applyTheme();
		return {
			render(width: number): string[] {
				const safeWidth = Math.max(1, width);
				return [...header.render(safeWidth), "", ...list.render(safeWidth)].map((line) =>
					truncateToWidth(line, safeWidth),
				);
			},
			invalidate() {
				applyTheme();
				header.invalidate();
				list.invalidate();
			},
			handleInput(data: string) {
				if (exitRequested) return;
				if (matchesKey(data, Key.ctrl("c"))) {
					finishWhenSaved("close");
					return;
				}
				list.handleInput(data);
				tui.requestRender();
			},
			dispose() {
				closed = true;
				exitRequested = true;
			},
		};
	});
}

export function showImageDropLimitsMenu(
	ctx: ExtensionCommandContext,
	state: ImageDropLimitsMenuState,
): Promise<LimitsAction> {
	const item = (value: LimitSettingAction, label: string): SelectItem => ({
		value,
		label,
		description: limitValueText(state.values[value]),
	});
	return showActionScreen(ctx, {
		title: "Image limits",
		lines: [
			"Choose a limit to change. Saved changes apply when your next Pi session starts.",
			state.unsavedChanges > 0 ? `${state.unsavedChanges} unsaved change(s)` : "No unsaved changes",
		],
		items: [
			item("maxImages", "Images per message"),
			item("maxImageBytes", "Max file size per image"),
			item("maxBatchBytes", "Max total size per message"),
			item("maxImagePixels", "Max image resolution"),
			item("maxRetainedImages", "Reusable sent images"),
			item("maxRetainedBytes", "Staged + sent image memory"),
			{
				value: "save",
				label: "Review changes before saving",
				description: "Nothing is saved until you confirm",
			},
			{
				value: "defaults",
				label: "Restore recommended defaults",
				description: "Only stages the defaults; review and save to apply",
			},
			{ value: "back", label: "Back to Settings" },
			{ value: "close", label: "Close Image Drop" },
		],
		cancel: "back",
		hint: "back",
	});
}

function limitValueText(value: LimitMenuValue): string {
	return value.pending === undefined
		? `Current: ${value.current} · Default: ${value.defaultValue}`
		: `Pending: ${value.pending} · Current: ${value.current} · Default: ${value.defaultValue}`;
}

interface MenuKeybindings {
	getKeys(
		binding:
			| "tui.select.up"
			| "tui.select.down"
			| "tui.select.confirm"
			| "tui.select.cancel"
			| "tui.input.submit",
	): readonly string[];
}

function actionHint(keybindings: MenuKeybindings, destination: "back" | "close"): string {
	const up = bindingText(keybindings, "tui.select.up");
	const down = bindingText(keybindings, "tui.select.down");
	const confirm = bindingText(keybindings, "tui.select.confirm");
	const cancel = bindingText(
		keybindings,
		"tui.select.cancel",
		destination === "back" ? "ctrl+c" : undefined,
	);
	return [
		...(up || down ? [`${[up, down].filter(Boolean).join("/")} navigate`] : []),
		...(confirm ? [`${confirm} select`] : []),
		...(cancel ? [`${cancel} ${destination}`] : []),
		...(destination === "back" ? ["ctrl+c close"] : []),
	].join(" • ");
}

function bindingText(
	keybindings: MenuKeybindings,
	binding: Parameters<MenuKeybindings["getKeys"]>[0],
	excluded?: string,
): string {
	return keybindings
		.getKeys(binding)
		.filter((key) => key !== excluded)
		.map((key) => {
			if (key === "up") return "↑";
			if (key === "down") return "↓";
			if (key === "escape") return "esc";
			return key;
		})
		.join("/");
}

interface ActionScreenOptions<T extends string> {
	title: string;
	lines: readonly string[];
	items: readonly SelectItem[];
	cancel: T;
	hint: "back" | "close";
}

async function showActionScreen<T extends string>(
	ctx: ExtensionContext,
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
					...wrapTextWithAnsi(
						theme.fg("accent", theme.bold(safeMenuText(options.title))),
						safeWidth,
					),
					...options.lines.flatMap((line) =>
						wrapTextWithAnsi(theme.fg("muted", safeMenuText(line)), safeWidth),
					),
					"",
					...list.render(safeWidth),
					...wrapTextWithAnsi(theme.fg("dim", actionHint(keybindings, options.hint)), safeWidth),
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
