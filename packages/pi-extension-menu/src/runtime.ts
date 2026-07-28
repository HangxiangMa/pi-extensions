import { BorderedLoader, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import { resolveMenuScreen } from "./model.js";
import { createMenuNavigator } from "./navigator.js";
import {
	createMenuScreenComponent,
	type MenuMultiSelectChange,
	type MenuScreenEvent,
	type MenuSettingChange,
	safeMenuText,
} from "./screen-components.js";
import type {
	ActionMenuItem,
	MenuActionResult,
	MenuDefinition,
	MenuScreen,
	MenuTransition,
} from "./types.js";

type ExtensionMode = ExtensionCommandContext["mode"];

export type RunMenuResult =
	| { kind: "closed" }
	| { kind: "stale" }
	| { kind: "unsupported"; mode: ExtensionMode }
	| { kind: "error"; error: unknown };

export interface RunMenuOptions<State> {
	getState(context: { ctx: ExtensionCommandContext; signal: AbortSignal }): State | Promise<State>;
	isCurrent?(): boolean;
	onError?(ctx: ExtensionCommandContext, error: unknown): void | Promise<void>;
	onUnsupportedMode?(ctx: ExtensionCommandContext, mode: ExtensionMode): void | Promise<void>;
}

interface ActionInvocation<ScreenId extends string> {
	accepted: boolean;
	stale: boolean;
	transition: MenuTransition<ScreenId>;
}

type InternalScreenEvent<ScreenId extends string> =
	| MenuScreenEvent
	| { kind: "transition"; transition: MenuTransition<ScreenId> };

export async function runMenu<State, ScreenId extends string, ActionId extends string>(
	ctx: ExtensionCommandContext,
	definition: MenuDefinition<State, ScreenId, ActionId>,
	options: RunMenuOptions<State>,
): Promise<RunMenuResult> {
	if (ctx.mode === "tui" && ctx.hasUI) return runTuiMenu(ctx, definition, options);
	if (ctx.mode === "rpc" && ctx.hasUI) return runDialogMenu(ctx, definition, options);
	await options.onUnsupportedMode?.(ctx, ctx.mode);
	return { kind: "unsupported", mode: ctx.mode };
}

async function runTuiMenu<State, ScreenId extends string, ActionId extends string>(
	ctx: ExtensionCommandContext,
	definition: MenuDefinition<State, ScreenId, ActionId>,
	options: RunMenuOptions<State>,
): Promise<RunMenuResult> {
	const menuController = new AbortController();
	const navigator = createMenuNavigator(definition.start);
	try {
		while (!navigator.closed) {
			const loaded = await loadState(ctx, options, menuController.signal);
			if (loaded.kind !== "loaded") return loaded.result;
			const state = loaded.state;
			const screen = resolveMenuScreen(definition, navigator.current, state);
			let staleAction = false;
			const event = await showTuiScreen(
				ctx,
				screen,
				navigator.selectionFor(navigator.current, selectableItemIds(screen)),
				{
					onSelectionChange: (itemId) => navigator.rememberSelection(navigator.current, itemId),
					onSettingChange: async (change, signal) => {
						const item =
							screen.kind === "settings"
								? screen.items.find((candidate) => candidate.id === change.itemId)
								: undefined;
						if (!item) return rejected();
						navigator.rememberSelection(navigator.current, change.itemId);
						const invocation = await invokeAction(
							ctx,
							definition.actions[item.action],
							state,
							signal,
							change.itemId,
							options,
							{ value: change.value },
						);
						if (invocation.stale) staleAction = true;
						return invocation;
					},
					onMultiSelectChange: async (change, signal) => {
						if (screen.kind !== "multiSelect") return rejected();
						navigator.rememberSelection(navigator.current, change.itemId);
						const invocation = await invokeAction(
							ctx,
							definition.actions[screen.action],
							state,
							signal,
							change.itemId,
							options,
							{ selected: change.selected },
						);
						if (invocation.stale) staleAction = true;
						return invocation;
					},
				},
			);
			if (staleAction || !isCurrent(options) || menuController.signal.aborted) {
				return { kind: "stale" };
			}
			if (!event) {
				navigator.apply({ kind: "close" });
				continue;
			}
			if (event.kind === "back" || event.kind === "close") {
				navigator.apply({ kind: event.kind });
				continue;
			}
			if (event.kind === "transition") {
				navigator.apply(event.transition);
				continue;
			}
			const actionItems =
				screen.kind === "actions"
					? screen.items
					: screen.kind === "multiSelect"
						? (screen.actions ?? [])
						: [];
			const item = actionItems.find((candidate) => candidate.id === event.itemId);
			if (!item || item.disabled) continue;
			navigator.rememberSelection(navigator.current, item.id);
			const outcome = await activateActionItem(
				ctx,
				definition,
				item,
				state,
				menuController.signal,
				options,
			);
			if (outcome.stale) return { kind: "stale" };
			navigator.apply(outcome.transition);
		}
		return { kind: "closed" };
	} catch (error) {
		if (!isCurrent(options) || menuController.signal.aborted) return { kind: "stale" };
		await reportError(ctx, options, error);
		if (!isCurrent(options) || menuController.signal.aborted) return { kind: "stale" };
		return { kind: "error", error };
	} finally {
		menuController.abort(new DOMException("Menu closed", "AbortError"));
	}
}

function selectableItemIds<ScreenId extends string, ActionId extends string>(
	screen: MenuScreen<ScreenId, ActionId>,
) {
	if (!("items" in screen)) return [];
	if (screen.kind === "multiSelect") {
		return [...screen.items, ...(screen.actions ?? [])].map((item) => item.id);
	}
	return screen.items.map((item) => item.id);
}

async function showTuiScreen<ScreenId extends string, ActionId extends string>(
	ctx: ExtensionCommandContext,
	screen: MenuScreen<ScreenId, ActionId>,
	selectedItemId: string | undefined,
	callbacks: {
		onSelectionChange(itemId: string): void;
		onSettingChange(
			change: MenuSettingChange,
			signal: AbortSignal,
		): Promise<ActionInvocation<ScreenId>>;
		onMultiSelectChange(
			change: MenuMultiSelectChange,
			signal: AbortSignal,
		): Promise<ActionInvocation<ScreenId>>;
	},
): Promise<InternalScreenEvent<ScreenId> | undefined> {
	return ctx.ui.custom<InternalScreenEvent<ScreenId> | undefined>(
		(tui, theme, keybindings, done) => {
			const screenController = new AbortController();
			let finished = false;
			const finish = (event: InternalScreenEvent<ScreenId>) => {
				if (finished) return;
				finished = true;
				done(event);
			};
			return createMenuScreenComponent({
				screen,
				selectedItemId,
				tui,
				theme,
				keybindings,
				onEvent: finish,
				onSelectionChange: callbacks.onSelectionChange,
				onSettingChange: (change) => callbacks.onSettingChange(change, screenController.signal),
				onMultiSelectChange: (change) =>
					callbacks.onMultiSelectChange(change, screenController.signal),
				onTransition: (transition) => finish({ kind: "transition", transition }),
				onDispose: () => {
					screenController.abort(new DOMException("Menu screen disposed", "AbortError"));
				},
			});
		},
	);
}

async function activateActionItem<State, ScreenId extends string, ActionId extends string>(
	ctx: ExtensionCommandContext,
	definition: MenuDefinition<State, ScreenId, ActionId>,
	item: ActionMenuItem<ScreenId, ActionId>,
	state: State,
	menuSignal: AbortSignal,
	options: RunMenuOptions<State>,
): Promise<ActionInvocation<ScreenId>> {
	if ("to" in item && item.to !== undefined) return accepted({ kind: "to", screen: item.to });
	if ("close" in item) return accepted({ kind: "close" });
	if (!("action" in item) || item.action === undefined) return rejected();
	const handler = definition.actions[item.action];
	if ("busyLabel" in item && item.busyLabel && ctx.mode === "tui" && ctx.hasUI) {
		return invokeBusyAction(ctx, handler, state, item.id, item.busyLabel, menuSignal, options);
	}
	return invokeAction(ctx, handler, state, menuSignal, item.id, options);
}

async function invokeBusyAction<State, ScreenId extends string>(
	ctx: ExtensionCommandContext,
	handler: MenuDefinition<State, ScreenId, string>["actions"][string],
	state: State,
	itemId: string,
	label: string,
	menuSignal: AbortSignal,
	options: RunMenuOptions<State>,
): Promise<ActionInvocation<ScreenId>> {
	let actionTask: Promise<ActionInvocation<ScreenId>> | undefined;
	let customFailed = false;
	let customError: unknown;
	let result: ActionInvocation<ScreenId> | undefined;
	try {
		result = await ctx.ui.custom<ActionInvocation<ScreenId> | undefined>(
			(tui, theme, _keybindings, done) => {
				const actionController = new AbortController();
				const signal = AbortSignal.any([menuSignal, actionController.signal]);
				const loader = new BorderedLoader(tui, theme, safeMenuText(label), { cancellable: true });
				let disposed = false;
				loader.onAbort = () => {
					actionController.abort(new DOMException("Menu action cancelled", "AbortError"));
				};
				actionTask = invokeAction(ctx, handler, state, signal, itemId, options, {}, false);
				void actionTask.then((outcome) => {
					if (!disposed) done(outcome);
				});
				return {
					render: (width: number) => loader.render(width),
					invalidate: () => loader.invalidate(),
					handleInput(data: string) {
						if (matchesKey(data, Key.ctrl("c"))) {
							actionController.abort(new DOMException("Menu action cancelled", "AbortError"));
						}
						loader.handleInput(data);
					},
					dispose() {
						disposed = true;
						actionController.abort(new DOMException("Menu action disposed", "AbortError"));
						loader.dispose();
					},
				};
			},
		);
	} catch (error) {
		customFailed = true;
		customError = error;
	}
	const actionOutcome = await actionTask;
	if (customFailed) throw customError;
	return result ?? actionOutcome ?? rejected();
}

async function invokeAction<State, ScreenId extends string>(
	ctx: ExtensionCommandContext,
	handler: MenuDefinition<State, ScreenId, string>["actions"][string],
	state: State,
	signal: AbortSignal,
	itemId: string,
	options: RunMenuOptions<State>,
	input: { value?: string; selected?: boolean } = {},
	abortIsStale = true,
): Promise<ActionInvocation<ScreenId>> {
	if (!isCurrent(options)) return { ...rejected<ScreenId>(), stale: true };
	if (signal.aborted) {
		return abortIsStale ? { ...rejected<ScreenId>(), stale: true } : rejected();
	}
	let result: MenuActionResult<ScreenId>;
	try {
		result = await handler({ ctx, state, signal, itemId, ...input });
	} catch (error) {
		if (!isCurrent(options)) return { ...rejected<ScreenId>(), stale: true };
		if (signal.aborted) {
			return abortIsStale ? { ...rejected<ScreenId>(), stale: true } : rejected();
		}
		await reportError(ctx, options, error);
		if (!isCurrent(options)) return { ...rejected<ScreenId>(), stale: true };
		if (signal.aborted) {
			return abortIsStale ? { ...rejected<ScreenId>(), stale: true } : rejected();
		}
		return rejected();
	}
	if (!isCurrent(options)) return { ...rejected<ScreenId>(), stale: true };
	if (signal.aborted) {
		return abortIsStale ? { ...rejected<ScreenId>(), stale: true } : rejected();
	}
	if (result?.kind === "rejected") {
		if (result.error !== undefined) await reportError(ctx, options, result.error);
		if (!isCurrent(options)) return { ...rejected<ScreenId>(), stale: true };
		if (signal.aborted) {
			return abortIsStale ? { ...rejected<ScreenId>(), stale: true } : rejected();
		}
		return rejected();
	}
	return accepted(result ?? { kind: "stay" });
}

async function runDialogMenu<State, ScreenId extends string, ActionId extends string>(
	ctx: ExtensionCommandContext,
	definition: MenuDefinition<State, ScreenId, ActionId>,
	options: RunMenuOptions<State>,
): Promise<RunMenuResult> {
	const controller = new AbortController();
	const navigator = createMenuNavigator(definition.start);
	try {
		while (!navigator.closed) {
			const loaded = await loadState(ctx, options, controller.signal);
			if (loaded.kind !== "loaded") return loaded.result;
			const state = loaded.state;
			const screen = resolveMenuScreen(definition, navigator.current, state);
			const choice = await ctx.ui.select(dialogTitle(screen), dialogChoices(screen));
			if (!isCurrent(options)) return { kind: "stale" };
			if (!choice) {
				navigator.apply({ kind: "back" });
				continue;
			}
			const exitChoice = dialogExitChoice(screen);
			if (screen.kind === "detail" || choice === exitChoice) {
				const destination = "hint" in screen ? (screen.hint ?? "back") : "back";
				navigator.apply({ kind: destination });
				continue;
			}
			if (screen.kind === "actions") {
				const index = dialogChoices(screen).indexOf(choice);
				const item = screen.items[index];
				if (!item || item.disabled) continue;
				const outcome = await activateActionItem(
					ctx,
					definition,
					item,
					state,
					controller.signal,
					options,
				);
				if (outcome.stale) return { kind: "stale" };
				navigator.apply(outcome.transition);
				continue;
			}
			if (screen.kind === "settings") {
				const index = dialogChoices(screen).indexOf(choice);
				const item = screen.items[index];
				if (!item || item.disabled) continue;
				const values = item.values ?? [item.currentValue];
				const currentIndex = Math.max(0, values.indexOf(item.currentValue));
				const value = values[(currentIndex + 1) % values.length] ?? item.currentValue;
				const outcome = await invokeAction(
					ctx,
					definition.actions[item.action],
					state,
					controller.signal,
					item.id,
					options,
					{ value },
				);
				if (outcome.stale) return { kind: "stale" };
				navigator.apply(outcome.transition);
				continue;
			}
			const index = dialogChoices(screen).indexOf(choice);
			const item = screen.items[index];
			if (!item) {
				const actionItem = screen.actions?.[index - screen.items.length];
				if (!actionItem || actionItem.disabled) continue;
				const outcome = await activateActionItem(
					ctx,
					definition,
					actionItem,
					state,
					controller.signal,
					options,
				);
				if (outcome.stale) return { kind: "stale" };
				navigator.apply(outcome.transition);
				continue;
			}
			if (item.disabled) continue;
			const outcome = await invokeAction(
				ctx,
				definition.actions[screen.action],
				state,
				controller.signal,
				item.id,
				options,
				{ selected: !item.selected },
			);
			if (outcome.stale) return { kind: "stale" };
			navigator.apply(outcome.transition);
		}
		return { kind: "closed" };
	} catch (error) {
		if (!isCurrent(options) || controller.signal.aborted) return { kind: "stale" };
		await reportError(ctx, options, error);
		if (!isCurrent(options) || controller.signal.aborted) return { kind: "stale" };
		return { kind: "error", error };
	} finally {
		controller.abort(new DOMException("Menu closed", "AbortError"));
	}
}

function dialogTitle<ScreenId extends string, ActionId extends string>(
	screen: MenuScreen<ScreenId, ActionId>,
) {
	return [
		safeMenuText(screen.title),
		...(("lines" in screen && screen.lines) || []).map(safeMenuText),
	]
		.filter(Boolean)
		.join("\n");
}

function dialogChoices<ScreenId extends string, ActionId extends string>(
	screen: MenuScreen<ScreenId, ActionId>,
) {
	if (screen.kind === "detail") return [dialogExitChoice(screen)];
	if (screen.kind === "actions") return screen.items.map((item) => safeMenuText(item.label));
	if (screen.kind === "settings") {
		return [
			...screen.items.map(
				(item) => `${safeMenuText(item.label)} (${safeMenuText(item.currentValue)})`,
			),
			dialogExitChoice(screen),
		];
	}
	const choices = [
		...screen.items.map((item) => `${item.selected ? "[x]" : "[ ]"} ${safeMenuText(item.label)}`),
		...(screen.actions ?? []).map((item) => safeMenuText(item.label)),
	];
	const exitChoice = dialogExitChoice(screen);
	if (!choices.includes(exitChoice)) choices.push(exitChoice);
	return choices;
}

function dialogExitChoice<ScreenId extends string, ActionId extends string>(
	screen: MenuScreen<ScreenId, ActionId>,
) {
	if (screen.kind === "multiSelect" && screen.doneLabel) return safeMenuText(screen.doneLabel);
	return "hint" in screen && screen.hint === "close" ? "Done" : "Back";
}

async function loadState<State>(
	ctx: ExtensionCommandContext,
	options: RunMenuOptions<State>,
	signal: AbortSignal,
): Promise<{ kind: "loaded"; state: State } | { kind: "result"; result: RunMenuResult }> {
	if (signal.aborted || !isCurrent(options)) return { kind: "result", result: { kind: "stale" } };
	try {
		const state = await options.getState({ ctx, signal });
		if (signal.aborted || !isCurrent(options)) {
			return { kind: "result", result: { kind: "stale" } };
		}
		return { kind: "loaded", state };
	} catch (error) {
		if (signal.aborted || !isCurrent(options)) {
			return { kind: "result", result: { kind: "stale" } };
		}
		await reportError(ctx, options, error);
		if (signal.aborted || !isCurrent(options)) {
			return { kind: "result", result: { kind: "stale" } };
		}
		return { kind: "result", result: { kind: "error", error } };
	}
}

async function reportError<State>(
	ctx: ExtensionCommandContext,
	options: RunMenuOptions<State>,
	error: unknown,
) {
	if (options.onError) {
		await options.onError(ctx, error);
		return;
	}
	if (ctx.hasUI) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Menu action failed: ${safeMenuText(message)}`, "error");
	}
}

function accepted<ScreenId extends string>(
	transition: MenuTransition<ScreenId>,
): ActionInvocation<ScreenId> {
	return { accepted: true, stale: false, transition };
}

function rejected<ScreenId extends string>(): ActionInvocation<ScreenId> {
	return { accepted: false, stale: false, transition: { kind: "stay" } };
}

function isCurrent<State>(options: RunMenuOptions<State>) {
	return options.isCurrent?.() ?? true;
}
