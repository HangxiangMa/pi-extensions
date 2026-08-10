import { stripVTControlCharacters } from "node:util";
import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
	type Focusable,
	fuzzyFilter,
	Input,
	Key,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { CustomInteractionComponent } from "@narumitw/pi-tui-kit";
import type { ToolCatalog, ToolCatalogItem } from "./tool-catalog.js";

const RESERVED_HOST_ROWS = 3;

export type ToolBrowserResult =
	| { kind: "close" }
	| { kind: "select"; itemId: string; query: string };

interface ToolBrowserOptions {
	catalog: ToolCatalog;
	initialItemId?: string;
	initialQuery?: string;
	tui: TUI;
	theme: Theme;
	keybindings: KeybindingsManager;
	onClose(): void;
	onSelect(selection: ToolBrowserResult & { kind: "select" }): void;
}

interface SearchableTool {
	item: ToolCatalogItem;
	label: string;
	statusText: string;
	description: string;
	searchText: string;
}

export function createToolBrowserComponent(
	options: ToolBrowserOptions,
): CustomInteractionComponent {
	const searchInput = new Input();
	searchInput.setValue(options.initialQuery ?? "");
	const allItems = options.catalog.items.map(
		(item): SearchableTool => ({
			item,
			label: safeSingleLine(item.label),
			statusText: safeSingleLine(item.statusText),
			description: safeSingleLine(item.description),
			searchText: safeSingleLine(item.searchText),
		}),
	);
	let filteredItems = filterItems(allItems, searchInput.getValue());
	let selectedIndex = Math.max(
		0,
		filteredItems.findIndex(({ item }) => item.id === options.initialItemId),
	);
	let itemRows = 1;
	let focused = false;
	let disposed = false;
	const selected = () => filteredItems[selectedIndex];
	const setSelectedIndex = (index: number, wrap: boolean) => {
		if (filteredItems.length === 0) {
			selectedIndex = 0;
			return;
		}
		selectedIndex = wrap
			? (index + filteredItems.length) % filteredItems.length
			: Math.max(0, Math.min(index, filteredItems.length - 1));
	};
	const applyFilter = () => {
		const selectedId = selected()?.item.id;
		filteredItems = filterItems(allItems, searchInput.getValue());
		const preservedIndex = filteredItems.findIndex(({ item }) => item.id === selectedId);
		selectedIndex = preservedIndex >= 0 ? preservedIndex : 0;
	};

	const component: CustomInteractionComponent & Focusable = {
		get focused() {
			return focused;
		},
		set focused(value: boolean) {
			focused = value;
			searchInput.focused = value;
		},
		render(width) {
			const safeWidth = Math.max(1, width);
			const availableRows = componentRows(options.tui.terminal.rows);
			const layout = browserLayout(availableRows, filteredItems.length);
			itemRows = layout.itemRows;
			const viewportStart = listWindowStart(selectedIndex, filteredItems.length, layout.itemRows);
			const description = selected()?.description;
			const lines = [
				...(layout.titleRows
					? [options.theme.fg("accent", options.theme.bold(safeSingleLine(options.catalog.title)))]
					: []),
				...(layout.searchRows ? renderSearchInput(searchInput, safeWidth) : []),
				...listRows(
					filteredItems,
					selectedIndex,
					viewportStart,
					layout.itemRows,
					safeWidth,
					options.theme,
				),
				...(layout.positionRows
					? [
							options.theme.fg(
								"dim",
								positionText(viewportStart, layout.itemRows, filteredItems.length),
							),
						]
					: []),
				...(layout.descriptionRows && description
					? [options.theme.fg("muted", truncateToWidth(description, safeWidth, ""))]
					: []),
				...(layout.hintRows
					? [
							options.theme.fg(
								"dim",
								truncateToWidth(browserHint(options.keybindings), safeWidth, ""),
							),
						]
					: []),
			];
			return lines.slice(0, availableRows).map((line) => truncateToWidth(line, safeWidth, ""));
		},
		invalidate() {
			searchInput.invalidate();
		},
		handleInput(data) {
			if (disposed) return;
			if (
				matchesKey(data, Key.ctrl("c")) ||
				options.keybindings.matches(data, "tui.select.cancel")
			) {
				options.onClose();
			} else if (options.keybindings.matches(data, "tui.select.up")) {
				setSelectedIndex(selectedIndex - 1, true);
			} else if (options.keybindings.matches(data, "tui.select.down")) {
				setSelectedIndex(selectedIndex + 1, true);
			} else if (options.keybindings.matches(data, "tui.select.pageUp")) {
				setSelectedIndex(selectedIndex - itemRows, false);
			} else if (options.keybindings.matches(data, "tui.select.pageDown")) {
				setSelectedIndex(selectedIndex + itemRows, false);
			} else if (matchesKey(data, Key.home)) setSelectedIndex(0, false);
			else if (matchesKey(data, Key.end)) setSelectedIndex(filteredItems.length - 1, false);
			else if (options.keybindings.matches(data, "tui.select.confirm")) {
				const item = selected()?.item;
				if (item) {
					options.onSelect({
						kind: "select",
						itemId: item.id,
						query: searchInput.getValue(),
					});
				}
			} else {
				searchInput.handleInput(data);
				const safeQuery = replaceTerminalControls(searchInput.getValue());
				if (safeQuery !== searchInput.getValue()) searchInput.setValue(safeQuery);
				applyFilter();
			}
			options.tui.requestRender();
		},
		async waitForPending() {},
		dispose() {
			if (disposed) return;
			disposed = true;
			searchInput.focused = false;
		},
	};
	return component;
}

function filterItems(items: readonly SearchableTool[], query: string) {
	return fuzzyFilter([...items], query, (candidate) =>
		[candidate.label, candidate.statusText, candidate.description, candidate.searchText].join(" "),
	);
}

function listRows(
	items: readonly SearchableTool[],
	selectedIndex: number,
	viewportStart: number,
	viewportRows: number,
	width: number,
	theme: Theme,
) {
	if (items.length === 0) return [theme.fg("dim", "  No matching tools")];
	return items.slice(viewportStart, viewportStart + viewportRows).map((candidate, offset) => {
		const index = viewportStart + offset;
		const prefix = index === selectedIndex ? "› " : "  ";
		const suffix = `  [${candidate.statusText}]`;
		const labelWidth = Math.max(0, width - visibleWidth(prefix) - visibleWidth(suffix));
		const label = truncateToWidth(candidate.label, labelWidth, "");
		const line = truncateToWidth(`${prefix}${label}${suffix}`, width, "");
		return index === selectedIndex ? theme.fg("accent", line) : line;
	});
}

function renderSearchInput(input: Input, width: number) {
	const prefix = "Search: ";
	const inputWidth = Math.max(1, width - visibleWidth(prefix));
	return input.render(inputWidth).map((line) => truncateToWidth(`${prefix}${line}`, width, ""));
}

interface BrowserLayout {
	titleRows: number;
	searchRows: number;
	itemRows: number;
	positionRows: number;
	descriptionRows: number;
	hintRows: number;
}

function browserLayout(availableRows: number, itemCount: number): BrowserLayout {
	if (availableRows === 1) {
		return {
			titleRows: 0,
			searchRows: 0,
			itemRows: 1,
			positionRows: 0,
			descriptionRows: 0,
			hintRows: 0,
		};
	}
	const titleRows = availableRows >= 4 ? 1 : 0;
	const searchRows = availableRows >= 3 ? 1 : 0;
	const hintRows = availableRows >= 3 ? 1 : 0;
	const descriptionRows = availableRows >= 7 ? 1 : 0;
	const itemBudget = Math.max(
		1,
		availableRows - titleRows - searchRows - hintRows - descriptionRows,
	);
	const positionRows = itemCount > itemBudget && itemBudget >= 2 ? 1 : 0;
	return {
		titleRows,
		searchRows,
		itemRows: itemBudget - positionRows,
		positionRows,
		descriptionRows,
		hintRows,
	};
}

function componentRows(rows: number) {
	const terminalRows = Number.isFinite(rows) ? Math.floor(rows) : 24;
	return Math.max(1, terminalRows - RESERVED_HOST_ROWS);
}

function listWindowStart(selectedIndex: number, itemCount: number, viewportSize: number) {
	if (itemCount <= viewportSize) return 0;
	return Math.max(
		0,
		Math.min(selectedIndex - Math.floor(viewportSize / 2), itemCount - viewportSize),
	);
}

function positionText(offset: number, viewportSize: number, itemCount: number) {
	if (itemCount === 0) return "0/0";
	return `${offset + 1}-${Math.min(itemCount, offset + viewportSize)}/${itemCount}`;
}

function browserHint(keybindings: KeybindingsManager) {
	const keys = (binding: Parameters<KeybindingsManager["getKeys"]>[0], fallback: string) =>
		keybindings.getKeys(binding).join("/") || fallback;
	return [
		"type to search",
		`${keys("tui.select.up", "up")}/${keys("tui.select.down", "down")} navigate`,
		`${keys("tui.select.confirm", "enter")} details`,
		`${keys("tui.select.cancel", "esc")} close`,
	].join(" · ");
}

function safeSingleLine(value: unknown) {
	return replaceTerminalControls(stripVTControlCharacters(String(value)))
		.replace(/\s+/gu, " ")
		.trim();
}

function replaceTerminalControls(value: unknown) {
	return Array.from(String(value), (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? " " : character;
	}).join("");
}
