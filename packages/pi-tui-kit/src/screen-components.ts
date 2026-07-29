import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Focusable,
	fuzzyFilter,
	Input,
	Key,
	matchesKey,
	type SelectItem,
	SelectList,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { MenuScreen, MenuSettingItem, MenuTransition } from "./types.js";

const MENU_BINDINGS = [
	"tui.select.up",
	"tui.select.down",
	"tui.select.pageUp",
	"tui.select.pageDown",
	"tui.select.confirm",
	"tui.select.cancel",
] as const;
type MenuBinding = (typeof MENU_BINDINGS)[number];

interface RenderHost {
	requestRender(): void;
}

interface MenuKeybindings {
	matches(data: string, binding: MenuBinding): boolean;
	getKeys(binding: MenuBinding): readonly string[];
}

export type MenuScreenEvent =
	| { kind: "activate"; itemId: string }
	| { kind: "back" }
	| { kind: "close" };

export interface MenuSettingChange {
	itemId: string;
	value: string;
	previousValue: string;
}

export interface MenuMultiSelectChange {
	itemId: string;
	selected: boolean;
	previousSelected: boolean;
}

export interface MenuScreenComponent extends Component {
	readonly __piTuiKitScreen?: true;
	handleInput(data: string): void;
	waitForPending(): Promise<void>;
	dispose?(): void;
}

type MenuChangeResponse<ScreenId extends string> =
	| boolean
	| { accepted: boolean; transition: MenuTransition<ScreenId> };

export interface MenuScreenComponentOptions<ScreenId extends string, ActionId extends string> {
	screen: MenuScreen<ScreenId, ActionId>;
	selectedItemId?: string;
	tui: RenderHost;
	theme: Pick<Theme, "fg" | "bold">;
	keybindings: MenuKeybindings;
	onEvent(event: MenuScreenEvent): void;
	onSelectionChange?(itemId: string): void;
	onSettingChange?(change: MenuSettingChange): Promise<MenuChangeResponse<ScreenId>>;
	onMultiSelectChange?(change: MenuMultiSelectChange): Promise<MenuChangeResponse<ScreenId>>;
	onTransition?(transition: MenuTransition<ScreenId>): void;
	onError?(error: unknown): void;
	onDispose?(): void;
}

export function createMenuScreenComponent<ScreenId extends string, ActionId extends string>(
	options: MenuScreenComponentOptions<ScreenId, ActionId>,
): MenuScreenComponent {
	let component: MenuScreenComponent;
	switch (options.screen.kind) {
		case "actions":
			component = createActionsComponent(options as ActionsOptions<ScreenId, ActionId>);
			break;
		case "detail":
			component = createDetailComponent(options as DetailOptions<ScreenId, ActionId>);
			break;
		case "choice":
			component = createChoiceComponent(options as ChoiceOptions<ScreenId, ActionId>);
			break;
		case "settings":
			component = createSettingsComponent(options as SettingsOptions<ScreenId, ActionId>);
			break;
		case "multiSelect":
			component = createMultiSelectComponent(options as MultiSelectOptions<ScreenId, ActionId>);
			break;
	}
	Object.defineProperty(component, "__piTuiKitScreen", { value: true });
	return component;
}

type ActionsOptions<ScreenId extends string, ActionId extends string> = MenuScreenComponentOptions<
	ScreenId,
	ActionId
> & {
	screen: Extract<MenuScreen<ScreenId, ActionId>, { kind: "actions" }>;
};
type DetailOptions<ScreenId extends string, ActionId extends string> = MenuScreenComponentOptions<
	ScreenId,
	ActionId
> & {
	screen: Extract<MenuScreen<ScreenId, ActionId>, { kind: "detail" }>;
};
type ChoiceOptions<ScreenId extends string, ActionId extends string> = MenuScreenComponentOptions<
	ScreenId,
	ActionId
> & {
	screen: Extract<MenuScreen<ScreenId, ActionId>, { kind: "choice" }>;
};
type SettingsOptions<ScreenId extends string, ActionId extends string> = MenuScreenComponentOptions<
	ScreenId,
	ActionId
> & {
	screen: Extract<MenuScreen<ScreenId, ActionId>, { kind: "settings" }>;
};
type MultiSelectOptions<
	ScreenId extends string,
	ActionId extends string,
> = MenuScreenComponentOptions<ScreenId, ActionId> & {
	screen: Extract<MenuScreen<ScreenId, ActionId>, { kind: "multiSelect" }>;
};

function createActionsComponent<ScreenId extends string, ActionId extends string>(
	options: ActionsOptions<ScreenId, ActionId>,
): MenuScreenComponent {
	const items: SelectItem[] = options.screen.items.map((item) => ({
		value: item.id,
		label: safeMenuText(item.label),
		description: item.description ? safeMenuText(item.description) : undefined,
	}));
	const list = new SelectList(items, Math.min(items.length, 10), selectTheme(options.theme));
	setInitialSelection(list, items, options.selectedItemId);
	list.onSelectionChange = (item) => options.onSelectionChange?.(item.value);
	list.onSelect = (item) => {
		const source = options.screen.items.find((candidate) => candidate.id === item.value);
		if (!source?.disabled) options.onEvent({ kind: "activate", itemId: item.value });
	};
	list.onCancel = () => options.onEvent({ kind: options.screen.hint ?? "back" });
	return commonListComponent(
		options,
		list,
		options.screen.lines ?? [],
		options.screen.hint ?? "back",
	);
}

function createDetailComponent<ScreenId extends string, ActionId extends string>(
	options: DetailOptions<ScreenId, ActionId>,
): MenuScreenComponent {
	let disposed = false;
	return {
		render(width) {
			return renderFrame(
				options.screen.title,
				options.screen.lines,
				[],
				options.screen.hint ?? "back",
				width,
				options,
			);
		},
		invalidate() {},
		handleInput(data) {
			if (disposed) return;
			if (matchesKey(data, Key.ctrl("c"))) options.onEvent({ kind: "close" });
			else if (options.keybindings.matches(data, "tui.select.cancel")) {
				options.onEvent({ kind: options.screen.hint ?? "back" });
			}
		},
		async waitForPending() {},
		dispose() {
			if (disposed) return;
			disposed = true;
			options.onDispose?.();
		},
	};
}

function createChoiceComponent<ScreenId extends string, ActionId extends string>(
	options: ChoiceOptions<ScreenId, ActionId>,
): MenuScreenComponent {
	const border = new DynamicBorder((text: string) => options.theme.fg("border", text));
	const items: SelectItem[] = options.screen.items.map((item) => {
		const current = item.id === options.screen.currentItemId ? " ✓ current" : "";
		const unavailable = item.disabled
			? `unavailable${item.disabledReason ? `: ${safeMenuText(item.disabledReason)}` : ""}`
			: undefined;
		return {
			value: item.id,
			label: `${item.disabled ? "[-] " : ""}${safeMenuText(item.label)}${current}`,
			description:
				[unavailable, item.description ? safeMenuText(item.description) : undefined]
					.filter((value): value is string => Boolean(value))
					.join(" · ") || undefined,
		};
	});
	const viewportSize = Math.min(items.length, options.screen.viewportSize ?? 10);
	const list = new SelectList(items, viewportSize, selectTheme(options.theme));
	const initialId = items.some((item) => item.value === options.selectedItemId)
		? options.selectedItemId
		: items[0]?.value;
	let selectedItemId = initialId;
	setInitialSelection(list, items, initialId);
	const select = (index: number) => {
		if (items.length === 0) return;
		const selectedIndex = Math.max(0, Math.min(index, items.length - 1));
		list.setSelectedIndex(selectedIndex);
		selectedItemId = items[selectedIndex]?.value;
		if (selectedItemId) options.onSelectionChange?.(selectedItemId);
	};
	const activate = (itemId: string | undefined) => {
		if (!itemId) return;
		const item = options.screen.items.find((candidate) => candidate.id === itemId);
		if (!item?.disabled) options.onEvent({ kind: "activate", itemId });
	};
	list.onSelectionChange = (item) => {
		selectedItemId = item.value;
		options.onSelectionChange?.(item.value);
	};
	list.onSelect = (item) => activate(item.value);
	list.onCancel = () => options.onEvent({ kind: options.screen.hint ?? "back" });
	let disposed = false;
	return {
		render(width) {
			const safeWidth = Math.max(1, width);
			const selected = options.screen.items.find((item) => item.id === selectedItemId);
			const details = [
				...(selected?.disabledReason
					? [`Unavailable: ${safeMenuText(selected.disabledReason)}`]
					: []),
				...(selected?.details ?? []).map(safeMenuText),
			];
			const content =
				items.length === 0
					? [options.theme.fg("dim", "  No choices available")]
					: [
							...list.render(safeWidth),
							...(details.length > 0
								? [
										"",
										...details.flatMap((line) =>
											wrapTextWithAnsi(options.theme.fg("muted", line), safeWidth),
										),
									]
								: []),
						];
			const result = [
				...border.render(safeWidth),
				...wrapTextWithAnsi(
					options.theme.fg("accent", options.theme.bold(safeMenuText(options.screen.title))),
					safeWidth,
				),
				...(options.screen.lines ?? []).flatMap((line) =>
					wrapTextWithAnsi(options.theme.fg("muted", safeMenuText(line)), safeWidth),
				),
				"",
				...content,
				...wrapTextWithAnsi(
					options.theme.fg(
						"dim",
						menuHint(options.keybindings, options.screen.hint ?? "back", "select"),
					),
					safeWidth,
				),
				...border.render(safeWidth),
			];
			return result.map((line) => truncateToWidth(line, safeWidth, ""));
		},
		invalidate() {
			border.invalidate();
			list.invalidate();
		},
		handleInput(data) {
			if (disposed) return;
			if (matchesKey(data, Key.ctrl("c"))) options.onEvent({ kind: "close" });
			else if (options.keybindings.matches(data, "tui.select.cancel")) {
				options.onEvent({ kind: options.screen.hint ?? "back" });
			} else if (options.keybindings.matches(data, "tui.select.pageUp")) {
				const index = items.findIndex((item) => item.value === selectedItemId);
				select(index - Math.max(1, viewportSize));
			} else if (options.keybindings.matches(data, "tui.select.pageDown")) {
				const index = items.findIndex((item) => item.value === selectedItemId);
				select(index + Math.max(1, viewportSize));
			} else if (data === " ") activate(selectedItemId);
			else list.handleInput(data);
			options.tui.requestRender();
		},
		async waitForPending() {},
		dispose() {
			if (disposed) return;
			disposed = true;
			options.onDispose?.();
		},
	};
}

// Pi's current SettingsList cannot initialize its cursor, enforce disabled rows, expose search
// focus, or await rejected saves. Keep this adapter local while matching its public presentation.
function createSettingsComponent<ScreenId extends string, ActionId extends string>(
	options: SettingsOptions<ScreenId, ActionId>,
): MenuScreenComponent {
	const searchInput = new Input();
	const border = new DynamicBorder((text: string) => options.theme.fg("border", text));
	const searchableItems = options.screen.items.map((item) => ({
		item,
		label: safeMenuText(item.label),
	}));
	let filteredItems = searchableItems;
	const committed = new Map(options.screen.items.map((item) => [item.id, item.currentValue]));
	const displayed = new Map(committed);
	const latestRequested = new Map<string, string>();
	let selectedIndex = Math.max(
		0,
		filteredItems.findIndex(({ item }) => item.id === options.selectedItemId),
	);
	let pending = Promise.resolve();
	let disposed = false;
	let closing = false;
	const selectedItem = () => filteredItems[selectedIndex]?.item;
	const closeAfterPending = (kind: "back" | "close") => {
		if (closing || disposed) return;
		closing = true;
		void pending.then(() => {
			if (!disposed) options.onEvent({ kind });
		});
	};
	const select = (index: number) => {
		if (filteredItems.length === 0) return;
		selectedIndex = (index + filteredItems.length) % filteredItems.length;
		const item = selectedItem();
		if (item) options.onSelectionChange?.(item.id);
	};
	const applyFilter = () => {
		filteredItems = fuzzyFilter(
			searchableItems,
			searchInput.getValue(),
			(candidate) => candidate.label,
		);
		selectedIndex = 0;
		const item = selectedItem();
		if (item) options.onSelectionChange?.(item.id);
	};
	const activate = () => {
		const item = selectedItem();
		if (!item || item.disabled || closing || disposed) return;
		const values = item.values ?? [item.currentValue];
		if (values.length === 0) return;
		const currentValue = displayed.get(item.id) ?? item.currentValue;
		const currentIndex = values.indexOf(currentValue);
		const value = values[(currentIndex + 1) % values.length] ?? currentValue;
		displayed.set(item.id, value);
		latestRequested.set(item.id, value);
		const operation = pending.then(async () => {
			if (disposed) return;
			const previousValue = committed.get(item.id) ?? item.currentValue;
			let response: MenuChangeResponse<ScreenId> = false;
			try {
				response =
					(await options.onSettingChange?.({
						itemId: item.id,
						value,
						previousValue,
					})) ?? false;
			} catch (error) {
				options.onError?.(error);
			}
			if (disposed) return;
			const accepted = typeof response === "boolean" ? response : response.accepted;
			if (accepted) committed.set(item.id, value);
			else if (latestRequested.get(item.id) === value) displayed.set(item.id, previousValue);
			options.tui.requestRender();
			if (accepted && typeof response !== "boolean") {
				closing = true;
				void pending.then(() => {
					if (!disposed) options.onTransition?.(response.transition);
				});
			}
		});
		pending = operation.catch(() => undefined);
	};
	const component: MenuScreenComponent & Focusable = {
		get focused() {
			return searchInput.focused;
		},
		set focused(value: boolean) {
			searchInput.focused = value;
		},
		render(width) {
			const safeWidth = Math.max(1, width);
			const result = [
				...border.render(safeWidth),
				...wrapTextWithAnsi(
					options.theme.fg("accent", options.theme.bold(safeMenuText(options.screen.title))),
					safeWidth,
				),
				...(options.screen.lines ?? []).flatMap((line) =>
					wrapTextWithAnsi(options.theme.fg("muted", safeMenuText(line)), safeWidth),
				),
				"",
				...searchInput.render(safeWidth),
				"",
				...renderSettingsRows(
					filteredItems,
					searchableItems,
					selectedIndex,
					displayed,
					safeWidth,
					options,
				),
				"",
				...wrapTextWithAnsi(options.theme.fg("dim", settingsHint(options.keybindings)), safeWidth),
				...border.render(safeWidth),
			];
			return result.map((line) => truncateToWidth(line, safeWidth, ""));
		},
		invalidate() {
			border.invalidate();
			searchInput.invalidate();
		},
		handleInput(data) {
			if (disposed || closing) return;
			if (matchesKey(data, Key.ctrl("c"))) closeAfterPending("close");
			else if (options.keybindings.matches(data, "tui.select.cancel")) {
				closeAfterPending("back");
			} else if (options.keybindings.matches(data, "tui.select.up")) {
				select(selectedIndex - 1);
			} else if (options.keybindings.matches(data, "tui.select.down")) {
				select(selectedIndex + 1);
			} else if (options.keybindings.matches(data, "tui.select.pageUp")) select(0);
			else if (options.keybindings.matches(data, "tui.select.pageDown")) {
				select(filteredItems.length - 1);
			} else if (options.keybindings.matches(data, "tui.select.confirm") || data === " ") {
				activate();
			} else {
				const searchData = data.replaceAll(" ", "");
				if (searchData) {
					searchInput.handleInput(searchData);
					const query = replaceTerminalControls(searchInput.getValue());
					if (query !== searchInput.getValue()) searchInput.setValue(query);
					applyFilter();
				}
			}
			options.tui.requestRender();
		},
		waitForPending: () => pending,
		dispose() {
			if (disposed) return;
			disposed = true;
			options.onDispose?.();
		},
	};
	return component;
}

function renderSettingsRows<ScreenId extends string, ActionId extends string>(
	filteredItems: readonly { item: MenuSettingItem<ActionId>; label: string }[],
	allItems: readonly { item: MenuSettingItem<ActionId>; label: string }[],
	selectedIndex: number,
	displayed: ReadonlyMap<string, string>,
	width: number,
	options: SettingsOptions<ScreenId, ActionId>,
): string[] {
	if (allItems.length === 0) return [options.theme.fg("dim", "  No settings available")];
	if (filteredItems.length === 0) return [options.theme.fg("dim", "  No matching settings")];

	const maxVisible = Math.min(filteredItems.length, 10);
	const startIndex = Math.max(
		0,
		Math.min(selectedIndex - Math.floor(maxVisible / 2), filteredItems.length - maxVisible),
	);
	const endIndex = Math.min(startIndex + maxVisible, filteredItems.length);
	const maxLabelWidth = Math.min(
		30,
		Math.max(...allItems.map((candidate) => visibleWidth(candidate.label))),
	);
	const lines: string[] = [];
	for (let index = startIndex; index < endIndex; index += 1) {
		const candidate = filteredItems[index];
		if (!candidate) continue;
		const { item, label } = candidate;
		const selected = index === selectedIndex;
		const prefix = selected ? options.theme.fg("accent", "→ ") : "  ";
		const labelPadded = label + " ".repeat(Math.max(0, maxLabelWidth - visibleWidth(label)));
		const currentValue = safeMenuText(displayed.get(item.id) ?? item.currentValue);
		const value = item.disabled ? `(unavailable) ${currentValue}` : currentValue;
		const valueWidth = Math.max(0, width - visibleWidth(prefix) - maxLabelWidth - 2);
		let labelText = labelPadded;
		let valueText = truncateToWidth(value, valueWidth, "");
		if (selected) {
			labelText = options.theme.fg("accent", labelText);
			valueText = options.theme.fg("accent", valueText);
		} else if (item.disabled) {
			labelText = options.theme.fg("dim", labelText);
			valueText = options.theme.fg("dim", valueText);
		} else {
			valueText = options.theme.fg("muted", valueText);
		}
		lines.push(truncateToWidth(`${prefix}${labelText}  ${valueText}`, width, ""));
	}
	if (startIndex > 0 || endIndex < filteredItems.length) {
		lines.push(options.theme.fg("dim", `  (${selectedIndex + 1}/${filteredItems.length})`));
	}
	const selected = filteredItems[selectedIndex]?.item;
	if (selected?.description) {
		lines.push("");
		for (const line of wrapTextWithAnsi(
			safeMenuText(selected.description),
			Math.max(1, width - 4),
		)) {
			lines.push(options.theme.fg("dim", `  ${line}`));
		}
	}
	return lines;
}

function settingsHint(keybindings: MenuKeybindings) {
	const confirmKeys = uniqueHintKeys([...keybindings.getKeys("tui.select.confirm"), "space"]);
	const cancelKeys = uniqueHintKeys(
		keybindings.getKeys("tui.select.cancel").filter((key) => key !== "ctrl+c"),
	);
	return [
		"Type to search",
		...(confirmKeys ? [`${confirmKeys} to change`] : []),
		...(cancelKeys ? [`${cancelKeys} to go back`] : []),
		"Ctrl+C to close",
	].join(" · ");
}

function uniqueHintKeys(keys: readonly string[]) {
	return [...new Set(keys.map(displayHintKey).filter(Boolean))].join("/");
}

function displayHintKey(key: string) {
	if (key === "enter") return "Enter";
	if (key === "space") return "Space";
	if (key === "escape") return "Esc";
	if (key === "ctrl+c") return "Ctrl+C";
	if (key === "up") return "↑";
	if (key === "down") return "↓";
	return safeMenuText(key);
}

function createMultiSelectComponent<ScreenId extends string, ActionId extends string>(
	options: MultiSelectOptions<ScreenId, ActionId>,
): MenuScreenComponent {
	const rows = [
		...options.screen.items.map((item) => ({ kind: "toggle" as const, item })),
		...(options.screen.actions ?? []).map((item) => ({ kind: "action" as const, item })),
	];
	const selected = new Map(options.screen.items.map((item) => [item.id, item.selected]));
	const committedSelected = new Map(selected);
	const revisions = new Map<string, number>();
	let selectedIndex = Math.max(
		0,
		rows.findIndex(({ item }) => item.id === options.selectedItemId),
	);
	let pending = Promise.resolve();
	let closing = false;
	let disposed = false;
	const closeAfterPending = (kind: "back" | "close") => {
		if (closing || disposed) return;
		closing = true;
		void pending.then(() => {
			if (!disposed) options.onEvent({ kind });
		});
	};
	const selectIndex = (index: number) => {
		if (rows.length === 0) return;
		selectedIndex = Math.max(0, Math.min(index, rows.length - 1));
		const row = rows[selectedIndex];
		if (row) options.onSelectionChange?.(row.item.id);
	};
	const move = (delta: number) => {
		if (rows.length === 0) return;
		selectIndex((selectedIndex + delta + rows.length) % rows.length);
	};
	const activate = () => {
		const row = rows[selectedIndex];
		if (!row || row.item.disabled) return;
		if (row.kind === "action") {
			if (closing || disposed) return;
			closing = true;
			void pending.then(() => {
				if (!disposed) options.onEvent({ kind: "activate", itemId: row.item.id });
			});
			return;
		}
		const item = row.item;
		const previousSelected = selected.get(item.id) ?? false;
		const nextSelected = !previousSelected;
		selected.set(item.id, nextSelected);
		const revision = (revisions.get(item.id) ?? 0) + 1;
		revisions.set(item.id, revision);
		const operation = pending.then(async () => {
			if (disposed) return;
			let response: MenuChangeResponse<ScreenId> = false;
			try {
				response =
					(await options.onMultiSelectChange?.({
						itemId: item.id,
						selected: nextSelected,
						previousSelected,
					})) ?? false;
			} catch (error) {
				options.onError?.(error);
			}
			if (disposed) return;
			const accepted = typeof response === "boolean" ? response : response.accepted;
			if (accepted) committedSelected.set(item.id, nextSelected);
			else if (revisions.get(item.id) === revision) {
				selected.set(item.id, committedSelected.get(item.id) ?? false);
			}
			options.tui.requestRender();
			if (accepted && typeof response !== "boolean") {
				closing = true;
				void pending.then(() => {
					if (!disposed) options.onTransition?.(response.transition);
				});
			}
		});
		pending = operation.catch(() => undefined);
	};
	return {
		render(width) {
			const requestedViewport = options.screen.viewportSize ?? 13;
			const viewportSize = Math.min(requestedViewport, rows.length);
			const viewportStart = Math.max(
				0,
				Math.min(selectedIndex - Math.floor(viewportSize / 2), rows.length - viewportSize),
			);
			const visibleRows = rows.slice(viewportStart, viewportStart + viewportSize);
			const content = visibleRows.map((row, offset) => {
				const index = viewportStart + offset;
				const isSelected = index === selectedIndex;
				const prefix = isSelected ? "› " : "  ";
				const marker =
					row.kind === "toggle"
						? `${row.item.disabled ? "[-]" : selected.get(row.item.id) ? "[x]" : "[ ]"} `
						: "";
				const unavailable = row.item.disabled ? " (unavailable)" : "";
				const label = `${prefix}${marker}${safeMenuText(row.item.label)}${unavailable}`;
				if (isSelected) return options.theme.fg("accent", label);
				return row.item.disabled ? options.theme.fg("dim", label) : label;
			});
			if (viewportSize < rows.length) {
				content.push(options.theme.fg("dim", `  (${selectedIndex + 1}/${rows.length})`));
			}
			const selectedRow = rows[selectedIndex];
			const descriptions = selectedRow
				? [
						selectedRow.item.description,
						selectedRow.kind === "toggle" && selectedRow.item.disabled
							? selectedRow.item.disabledReason
								? `Unavailable: ${selectedRow.item.disabledReason}`
								: "Unavailable"
							: undefined,
					].filter((value): value is string => Boolean(value))
				: [];
			if (descriptions.length > 0) {
				content.push(
					"",
					...descriptions.flatMap((description) =>
						wrapTextWithAnsi(
							options.theme.fg("dim", `  ${safeMenuText(description)}`),
							Math.max(1, width),
						),
					),
				);
			}
			return renderFrame(
				options.screen.title,
				options.screen.lines ?? [],
				content,
				options.screen.hint ?? "back",
				width,
				options,
				rows[selectedIndex]?.kind === "action" ? "select" : "toggle",
			);
		},
		invalidate() {},
		handleInput(data) {
			if (disposed || closing) return;
			if (matchesKey(data, Key.ctrl("c"))) closeAfterPending("close");
			else if (options.keybindings.matches(data, "tui.select.cancel")) {
				closeAfterPending(options.screen.hint ?? "back");
			} else if (options.keybindings.matches(data, "tui.select.up")) move(-1);
			else if (options.keybindings.matches(data, "tui.select.down")) move(1);
			else if (options.keybindings.matches(data, "tui.select.pageUp")) {
				selectIndex(selectedIndex - (options.screen.viewportSize ?? 13));
			} else if (options.keybindings.matches(data, "tui.select.pageDown")) {
				selectIndex(selectedIndex + (options.screen.viewportSize ?? 13));
			} else if (options.keybindings.matches(data, "tui.select.confirm") || data === " ") {
				activate();
			}
			options.tui.requestRender();
		},
		waitForPending: () => pending,
		dispose() {
			if (disposed) return;
			disposed = true;
			options.onDispose?.();
		},
	};
}

function commonListComponent<ScreenId extends string, ActionId extends string>(
	options: MenuScreenComponentOptions<ScreenId, ActionId>,
	list: SelectList,
	lines: readonly string[],
	destination: "back" | "close",
): MenuScreenComponent {
	let disposed = false;
	return {
		render(width) {
			return renderFrame(
				options.screen.title,
				lines,
				list.render(Math.max(1, width)),
				destination,
				width,
				options,
			);
		},
		invalidate() {
			list.invalidate();
		},
		handleInput(data) {
			if (disposed) return;
			if (matchesKey(data, Key.ctrl("c"))) {
				options.onEvent({ kind: "close" });
				return;
			}
			if (options.keybindings.matches(data, "tui.select.cancel")) {
				options.onEvent({ kind: destination });
				return;
			}
			list.handleInput(data);
			options.tui.requestRender();
		},
		async waitForPending() {},
		dispose() {
			if (disposed) return;
			disposed = true;
			options.onDispose?.();
		},
	};
}

function renderFrame<ScreenId extends string, ActionId extends string>(
	title: string,
	lines: readonly string[],
	content: readonly string[],
	destination: "back" | "close",
	width: number,
	options: MenuScreenComponentOptions<ScreenId, ActionId>,
	confirmAction = "select",
): string[] {
	const safeWidth = Math.max(1, width);
	const result = [
		...wrapTextWithAnsi(
			options.theme.fg("accent", options.theme.bold(safeMenuText(title))),
			safeWidth,
		),
		...lines.flatMap((line) =>
			wrapTextWithAnsi(options.theme.fg("muted", safeMenuText(line)), safeWidth),
		),
		...(content.length > 0 ? ["", ...content] : []),
		...wrapTextWithAnsi(
			options.theme.fg("dim", menuHint(options.keybindings, destination, confirmAction)),
			safeWidth,
		),
	];
	return result.map((line) => truncateToWidth(line, safeWidth, ""));
}

function menuHint(
	keybindings: MenuKeybindings,
	destination: "back" | "close",
	confirmAction: string,
) {
	const up = bindingText(keybindings, "tui.select.up");
	const down = bindingText(keybindings, "tui.select.down");
	const confirm = bindingText(keybindings, "tui.select.confirm");
	const cancel = bindingText(keybindings, "tui.select.cancel", "ctrl+c");
	return [
		...(up || down ? [`${[up, down].filter(Boolean).join("/")} navigate`] : []),
		...(confirm ? [`${confirm} ${confirmAction}`] : []),
		...(cancel ? [`${cancel} ${destination}`] : []),
		...(destination === "back" ? ["ctrl+c close"] : []),
	].join(" • ");
}

function bindingText(keybindings: MenuKeybindings, binding: MenuBinding, excluded?: string) {
	return keybindings
		.getKeys(binding)
		.filter((key) => key !== excluded)
		.map((key) => {
			if (key === "up") return "↑";
			if (key === "down") return "↓";
			if (key === "escape") return "esc";
			return safeMenuText(key);
		})
		.filter(Boolean)
		.join("/");
}

function selectTheme(theme: Pick<Theme, "fg">) {
	return {
		selectedPrefix: (text: string) => theme.fg("accent", text),
		selectedText: (text: string) => theme.fg("accent", text),
		description: (text: string) => theme.fg("muted", text),
		scrollInfo: (text: string) => theme.fg("dim", text),
		noMatch: (text: string) => theme.fg("warning", text),
	};
}

function setInitialSelection(list: SelectList, items: readonly SelectItem[], selectedId?: string) {
	if (!selectedId) return;
	const index = items.findIndex((item) => item.value === selectedId);
	if (index >= 0) list.setSelectedIndex(index);
}

export function safeMenuText(value: unknown) {
	return replaceTerminalControls(value).replace(/\s+/gu, " ").trim();
}

function replaceTerminalControls(value: unknown) {
	return Array.from(String(value), (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? " " : character;
	}).join("");
}

export function settingForAction<ActionId extends string>(
	screen: Extract<MenuScreen<string, ActionId>, { kind: "settings" }>,
	itemId: string,
): MenuSettingItem<ActionId> | undefined {
	return screen.items.find((item) => item.id === itemId);
}
