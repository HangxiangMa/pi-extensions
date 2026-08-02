import { stripVTControlCharacters } from "node:util";
import type { ExtensionCommandContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Focusable,
	Input,
	Key,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { ModuleInspection, StatuslineInspection } from "./modules/inspection.js";

const RESERVED_HOST_ROWS = 3;

export type InspectorResult = { kind: "back" } | { kind: "close" };

type DisposableComponent = Component & Focusable & { dispose(): void };

export function showFooterExplanation(
	ctx: ExtensionCommandContext,
	inspection: StatuslineInspection | undefined,
	signal?: AbortSignal,
): Promise<InspectorResult | undefined> {
	if (signal?.aborted) return Promise.resolve({ kind: "close" });
	return ctx.ui.custom<InspectorResult | undefined>((tui, theme, keybindings, done) => {
		let scrollOffset = 0;
		let lastMaximumScroll = 0;
		let lastViewportSize = 1;
		let disposed = false;
		let settled = false;
		let deferredAbort: ReturnType<typeof setImmediate> | undefined;
		const finish = (result: InspectorResult) => {
			if (disposed || settled) return;
			settled = true;
			done(result);
		};
		const closeForAbort = () => finish({ kind: "close" });
		signal?.addEventListener("abort", closeForAbort, { once: true });
		if (signal?.aborted) deferredAbort = setImmediate(closeForAbort);

		return {
			focused: false,
			render(width: number): string[] {
				const safeWidth = Math.max(1, width);
				const availableRows = componentRows(tui.terminal.rows);
				const content = explanationLines(inspection, safeWidth);
				const layout = detailLayout(availableRows, content.length);
				lastViewportSize = layout.contentRows;
				lastMaximumScroll = Math.max(0, content.length - layout.contentRows);
				scrollOffset = clamp(scrollOffset, 0, lastMaximumScroll);
				const lines = [
					...(layout.titleRows ? [theme.fg("accent", theme.bold("Explain footer"))] : []),
					...content.slice(scrollOffset, scrollOffset + layout.contentRows),
					...(layout.positionRows
						? [theme.fg("dim", positionText(scrollOffset, layout.contentRows, content.length))]
						: []),
					...(layout.hintRows ? [theme.fg("dim", detailHint(keybindings, "back"))] : []),
				];
				return boundedLines(lines, safeWidth, availableRows);
			},
			invalidate() {},
			handleInput(data: string) {
				if (disposed || settled) return;
				if (matchesKey(data, Key.ctrl("c"))) finish({ kind: "close" });
				else if (keybindings.matches(data, "tui.select.cancel")) finish({ kind: "back" });
				else if (keybindings.matches(data, "tui.select.up")) {
					scrollOffset = clamp(scrollOffset - 1, 0, lastMaximumScroll);
				} else if (keybindings.matches(data, "tui.select.down")) {
					scrollOffset = clamp(scrollOffset + 1, 0, lastMaximumScroll);
				} else if (keybindings.matches(data, "tui.select.pageUp")) {
					scrollOffset = clamp(scrollOffset - lastViewportSize, 0, lastMaximumScroll);
				} else if (keybindings.matches(data, "tui.select.pageDown")) {
					scrollOffset = clamp(scrollOffset + lastViewportSize, 0, lastMaximumScroll);
				} else if (matchesKey(data, Key.home)) scrollOffset = 0;
				else if (matchesKey(data, Key.end)) scrollOffset = lastMaximumScroll;
				tui.requestRender();
			},
			dispose() {
				if (disposed) return;
				disposed = true;
				if (deferredAbort) clearImmediate(deferredAbort);
				deferredAbort = undefined;
				signal?.removeEventListener("abort", closeForAbort);
			},
		};
	});
}

export function showModuleBrowser(
	ctx: ExtensionCommandContext,
	inspection: StatuslineInspection,
	signal?: AbortSignal,
): Promise<InspectorResult | undefined> {
	if (signal?.aborted) return Promise.resolve({ kind: "close" });
	return ctx.ui.custom<InspectorResult | undefined>((tui, theme, keybindings, done) => {
		const input = new Input();
		let filtered = [...inspection.modules];
		let selectedIndex = 0;
		let listOffset = 0;
		let detailScrollOffset = 0;
		let lastListRows = 1;
		let searchInputVisible = true;
		let lastDetailRows = 1;
		let lastDetailMaximumScroll = 0;
		let view: "list" | "detail" = "list";
		let focused = false;
		let disposed = false;
		let settled = false;
		let deferredAbort: ReturnType<typeof setImmediate> | undefined;
		const finish = (result: InspectorResult) => {
			if (disposed || settled) return;
			settled = true;
			done(result);
		};
		const closeForAbort = () => finish({ kind: "close" });
		signal?.addEventListener("abort", closeForAbort, { once: true });
		if (signal?.aborted) deferredAbort = setImmediate(closeForAbort);
		const selected = () => filtered[selectedIndex];
		const syncFocus = () => {
			input.focused = focused && view === "list";
		};
		const select = (index: number) => {
			if (filtered.length === 0) return;
			selectedIndex = (index + filtered.length) % filtered.length;
		};
		const applySearch = () => {
			const sanitized = safeSearchText(input.getValue());
			if (sanitized !== input.getValue()) input.setValue(sanitized);
			filtered = filterModules(inspection.modules, sanitized);
			selectedIndex = 0;
			listOffset = 0;
		};

		const component: DisposableComponent = {
			get focused() {
				return focused;
			},
			set focused(value: boolean) {
				focused = value;
				syncFocus();
			},
			render(width: number): string[] {
				const safeWidth = Math.max(1, width);
				const availableRows = componentRows(tui.terminal.rows);
				if (view === "detail") {
					const module = selected();
					const content = moduleDetailLines(module, safeWidth);
					const layout = detailLayout(availableRows, content.length);
					lastDetailRows = layout.contentRows;
					lastDetailMaximumScroll = Math.max(0, content.length - layout.contentRows);
					detailScrollOffset = clamp(detailScrollOffset, 0, lastDetailMaximumScroll);
					const lines = [
						...(layout.titleRows ? [theme.fg("accent", theme.bold(module?.name ?? "Module"))] : []),
						...content.slice(detailScrollOffset, detailScrollOffset + layout.contentRows),
						...(layout.positionRows
							? [
									theme.fg(
										"dim",
										positionText(detailScrollOffset, layout.contentRows, content.length),
									),
								]
							: []),
						...(layout.hintRows ? [theme.fg("dim", detailHint(keybindings, "back"))] : []),
					];
					return boundedLines(lines, safeWidth, availableRows);
				}

				const layout = listLayout(availableRows, filtered.length);
				lastListRows = layout.itemRows;
				searchInputVisible = layout.inputRows > 0;
				listOffset = listWindowStart(selectedIndex, filtered.length, layout.itemRows);
				const rows =
					filtered.length === 0
						? [theme.fg("dim", "  No matching modules")]
						: filtered.slice(listOffset, listOffset + layout.itemRows).map((module, index) => {
								const absoluteIndex = listOffset + index;
								const prefix = absoluteIndex === selectedIndex ? "→ " : "  ";
								const text = `${prefix}${module.name}  [${module.state}]`;
								return theme.fg(absoluteIndex === selectedIndex ? "accent" : "text", text);
							});
				const description = selected()?.description;
				const lines = [
					...(layout.titleRows ? [theme.fg("accent", theme.bold("Modules · type to search"))] : []),
					...(layout.inputRows ? input.render(safeWidth) : []),
					...rows,
					...(layout.positionRows
						? [theme.fg("dim", positionText(listOffset, layout.itemRows, filtered.length))]
						: []),
					...(layout.descriptionRows && description
						? [theme.fg("muted", safeDisplayText(description))]
						: []),
					...(layout.hintRows ? [theme.fg("dim", browserHint(keybindings))] : []),
				];
				return boundedLines(lines, safeWidth, availableRows);
			},
			invalidate() {
				input.invalidate();
			},
			handleInput(data: string) {
				if (disposed || settled) return;
				if (matchesKey(data, Key.ctrl("c"))) {
					finish({ kind: "close" });
				} else if (keybindings.matches(data, "tui.select.cancel")) {
					if (view === "detail") {
						view = "list";
						detailScrollOffset = 0;
						syncFocus();
					} else finish({ kind: "back" });
				} else if (view === "detail") {
					if (keybindings.matches(data, "tui.select.up")) {
						detailScrollOffset = clamp(detailScrollOffset - 1, 0, lastDetailMaximumScroll);
					} else if (keybindings.matches(data, "tui.select.down")) {
						detailScrollOffset = clamp(detailScrollOffset + 1, 0, lastDetailMaximumScroll);
					} else if (keybindings.matches(data, "tui.select.pageUp")) {
						detailScrollOffset = clamp(
							detailScrollOffset - lastDetailRows,
							0,
							lastDetailMaximumScroll,
						);
					} else if (keybindings.matches(data, "tui.select.pageDown")) {
						detailScrollOffset = clamp(
							detailScrollOffset + lastDetailRows,
							0,
							lastDetailMaximumScroll,
						);
					} else if (matchesKey(data, Key.home)) detailScrollOffset = 0;
					else if (matchesKey(data, Key.end)) {
						detailScrollOffset = lastDetailMaximumScroll;
					}
				} else if (keybindings.matches(data, "tui.select.up")) {
					select(selectedIndex - 1);
				} else if (keybindings.matches(data, "tui.select.down")) {
					select(selectedIndex + 1);
				} else if (keybindings.matches(data, "tui.select.pageUp")) {
					select(selectedIndex - lastListRows);
				} else if (keybindings.matches(data, "tui.select.pageDown")) {
					select(selectedIndex + lastListRows);
				} else if (matchesKey(data, Key.home)) selectedIndex = 0;
				else if (matchesKey(data, Key.end)) selectedIndex = Math.max(0, filtered.length - 1);
				else if (keybindings.matches(data, "tui.select.confirm")) {
					if (selected()) {
						view = "detail";
						detailScrollOffset = 0;
						syncFocus();
					}
				} else if (searchInputVisible) {
					input.handleInput(data);
					applySearch();
				}
				tui.requestRender();
			},
			dispose() {
				if (disposed) return;
				disposed = true;
				if (deferredAbort) clearImmediate(deferredAbort);
				deferredAbort = undefined;
				signal?.removeEventListener("abort", closeForAbort);
			},
		};
		return component;
	});
}

function explanationLines(inspection: StatuslineInspection | undefined, width: number): string[] {
	if (!inspection) {
		return wrapLines(
			[
				"Footer inspection is unavailable until the TUI footer is ready.",
				"No collection work was started.",
			],
			width,
		);
	}
	if (inspection.showing.length === 0) {
		return wrapLines(
			[
				"No modules are currently showing.",
				"Open Modules to inspect empty, disabled, or unreachable modules.",
			],
			width,
		);
	}
	const lines = inspection.showing.flatMap((module, index) => [
		...(index > 0 ? [""] : []),
		module.name,
		...previewLines(module.preview),
		module.description,
	]);
	return wrapLines(lines, width);
}

function moduleDetailLines(module: ModuleInspection | undefined, width: number): string[] {
	if (!module) return ["No matching module."];
	return wrapLines(
		[
			`State: ${module.state}`,
			module.description,
			`Root: ${module.rootReferenced ? "Referenced" : "Not referenced"}`,
			`Reachable: ${module.reachable ? "Yes" : "No"}`,
			...detailPreviewLines(module.preview),
			`Reason: ${module.reason}`,
			`Variables: ${module.variables.join(", ") || "none"}`,
			`Style fields: ${module.styleFields.join(", ") || "none"}`,
			`Display rules: ${module.displayRules.join(" · ") || "none"}`,
		],
		width,
	);
}

function previewLines(preview: string): string[] {
	const lines = preview ? preview.split("\n") : ["(no text)"];
	return lines.map((line, index) => `${index === 0 ? "Value: " : "       "}${line}`);
}

function detailPreviewLines(preview: string): string[] {
	const lines = preview ? preview.split("\n") : ["(no current preview)"];
	return lines.map((line, index) => `${index === 0 ? "Preview: " : "         "}${line}`);
}

function wrapLines(lines: readonly string[], width: number): string[] {
	return lines.flatMap((line) => {
		const safe = safeDisplayText(line);
		return safe ? wrapTextWithAnsi(safe, width) : [""];
	});
}

function filterModules(modules: readonly ModuleInspection[], query: string): ModuleInspection[] {
	const terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
	if (terms.length === 0) return [...modules];
	return modules.filter((module) => {
		const candidate = `${module.name} ${module.description} ${module.state}`.toLowerCase();
		return terms.every((term) => candidate.includes(term));
	});
}

interface DetailLayout {
	titleRows: number;
	contentRows: number;
	positionRows: number;
	hintRows: number;
}

function detailLayout(availableRows: number, contentLength: number): DetailLayout {
	if (availableRows === 1) {
		return { titleRows: 0, contentRows: 1, positionRows: 0, hintRows: 0 };
	}
	const titleRows = availableRows >= 4 ? 1 : 0;
	const hintRows = availableRows >= 3 ? 1 : 0;
	let contentRows = Math.max(1, availableRows - titleRows - hintRows);
	const positionRows = contentLength > contentRows && contentRows >= 2 ? 1 : 0;
	contentRows -= positionRows;
	return { titleRows, contentRows, positionRows, hintRows };
}

interface ListLayout {
	titleRows: number;
	inputRows: number;
	itemRows: number;
	positionRows: number;
	descriptionRows: number;
	hintRows: number;
}

function listLayout(availableRows: number, itemCount: number): ListLayout {
	if (availableRows === 1) {
		return {
			titleRows: 0,
			inputRows: 0,
			itemRows: 1,
			positionRows: 0,
			descriptionRows: 0,
			hintRows: 0,
		};
	}
	const titleRows = availableRows >= 4 ? 1 : 0;
	const inputRows = availableRows >= 3 ? 1 : 0;
	const hintRows = availableRows >= 3 ? 1 : 0;
	const descriptionRows = availableRows >= 7 ? 1 : 0;
	let itemRows = Math.max(1, availableRows - titleRows - inputRows - hintRows - descriptionRows);
	const positionRows = itemCount > itemRows && itemRows >= 2 ? 1 : 0;
	itemRows -= positionRows;
	return { titleRows, inputRows, itemRows, positionRows, descriptionRows, hintRows };
}

function componentRows(rows: number): number {
	const terminalRows = Number.isFinite(rows) ? Math.floor(rows) : 24;
	return Math.max(1, terminalRows - RESERVED_HOST_ROWS);
}

function listWindowStart(selectedIndex: number, itemCount: number, viewportSize: number): number {
	if (itemCount <= viewportSize) return 0;
	return Math.max(0, Math.min(selectedIndex, itemCount - viewportSize));
}

function positionText(offset: number, viewportSize: number, itemCount: number): string {
	if (itemCount === 0) return "0/0";
	return `${offset + 1}-${Math.min(itemCount, offset + viewportSize)}/${itemCount}`;
}

function boundedLines(lines: readonly string[], width: number, rows: number): string[] {
	return lines.slice(0, rows).map((line) => truncateToWidth(line, width, ""));
}

function browserHint(keybindings: Pick<KeybindingsManager, "getKeys">): string {
	const up = bindingText(keybindings, "tui.select.up");
	const down = bindingText(keybindings, "tui.select.down");
	const confirm = bindingText(keybindings, "tui.select.confirm");
	const cancel = bindingText(keybindings, "tui.select.cancel", "ctrl+c");
	return [
		...(up || down ? [`${[up, down].filter(Boolean).join("/")} navigate`] : []),
		...(confirm ? [`${confirm} details`] : []),
		...(cancel ? [`${cancel} back`] : []),
		"ctrl+c close",
	].join(" • ");
}

function detailHint(
	keybindings: Pick<KeybindingsManager, "getKeys">,
	destination: "back" | "close",
): string {
	const up = bindingText(keybindings, "tui.select.up");
	const down = bindingText(keybindings, "tui.select.down");
	const cancel = bindingText(keybindings, "tui.select.cancel", "ctrl+c");
	const pageUp = bindingText(keybindings, "tui.select.pageUp");
	const pageDown = bindingText(keybindings, "tui.select.pageDown");
	return [
		...(up || down ? [`${[up, down].filter(Boolean).join("/")} scroll`] : []),
		...(pageUp || pageDown ? [`${[pageUp, pageDown].filter(Boolean).join("/")} page`] : []),
		...(cancel ? [`${cancel} ${destination}`] : []),
		"ctrl+c close",
	].join(" • ");
}

function bindingText(
	keybindings: Pick<KeybindingsManager, "getKeys">,
	binding: Parameters<KeybindingsManager["getKeys"]>[0],
	excluded?: string,
): string {
	return keybindings
		.getKeys(binding)
		.filter((key) => key !== excluded)
		.map((key) => {
			if (key === "up") return "↑";
			if (key === "down") return "↓";
			if (key === "escape") return "esc";
			if (key === "return") return "enter";
			return safeDisplayText(key);
		})
		.filter(Boolean)
		.join("/");
}

function safeSearchText(value: string): string {
	return Array.from(stripVTControlCharacters(value), (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? "" : character;
	}).join("");
}

function safeDisplayText(value: string): string {
	return Array.from(stripVTControlCharacters(value), (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? "" : character;
	}).join("");
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(value, maximum));
}
