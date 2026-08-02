import { stripVTControlCharacters } from "node:util";
import type { ExtensionCommandContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { StatuslineInspection } from "./modules/inspection.js";

const RESERVED_HOST_ROWS = 3;

export type InspectorResult = { kind: "back" } | { kind: "close" };

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

function previewLines(preview: string): string[] {
	const lines = preview ? preview.split("\n") : ["(no text)"];
	return lines.map((line, index) => `${index === 0 ? "Value: " : "       "}${line}`);
}

function wrapLines(lines: readonly string[], width: number): string[] {
	return lines.flatMap((line) => {
		const safe = safeDisplayText(line);
		return safe ? wrapTextWithAnsi(safe, width) : [""];
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

function componentRows(rows: number): number {
	const terminalRows = Number.isFinite(rows) ? Math.floor(rows) : 24;
	return Math.max(1, terminalRows - RESERVED_HOST_ROWS);
}

function positionText(offset: number, viewportSize: number, itemCount: number): string {
	if (itemCount === 0) return "0/0";
	return `${offset + 1}-${Math.min(itemCount, offset + viewportSize)}/${itemCount}`;
}

function boundedLines(lines: readonly string[], width: number, rows: number): string[] {
	return lines.slice(0, rows).map((line) => truncateToWidth(line, width, ""));
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

function safeDisplayText(value: string): string {
	return Array.from(stripVTControlCharacters(value), (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? "" : character;
	}).join("");
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(value, maximum));
}
