import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Key,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { SideThreadTurn } from "./side-thread.js";

const RESERVED_APP_ROWS = 3;
const SELECTOR_CHROME_ROWS = 2;

export interface BtwHandoffSegment {
	role: "user" | "assistant";
	text: string;
}

export interface BtwSelectionLine {
	role: BtwHandoffSegment["role"];
	text: string;
}

export interface BtwTextPosition {
	line: number;
	column: number;
}

export type BtwQuickHandoffScope =
	| { kind: "latest" }
	| { kind: "from"; answeredTurnIndex: number }
	| { kind: "entire" };

export type BtwMenuSelectorAction =
	| { kind: "select"; value: string }
	| { kind: "back" }
	| { kind: "close" };

export type BtwTextRangeSelectorAction =
	| { kind: "confirm"; segments: BtwHandoffSegment[] }
	| { kind: "back" }
	| { kind: "close" };

export function getAnsweredTurns(
	turns: readonly SideThreadTurn[],
): Array<Extract<SideThreadTurn, { kind: "answered" }>> {
	return turns.filter(
		(turn): turn is Extract<SideThreadTurn, { kind: "answered" }> => turn.kind === "answered",
	);
}

export function buildQuickHandoffSegments(
	turns: readonly SideThreadTurn[],
	scope: BtwQuickHandoffScope,
): BtwHandoffSegment[] {
	const answered = getAnsweredTurns(turns);
	const selected =
		scope.kind === "latest"
			? answered.slice(-1)
			: scope.kind === "from"
				? answered.slice(Math.max(0, scope.answeredTurnIndex))
				: answered;
	return selected.flatMap((turn) => [
		{ role: "user" as const, text: turn.question },
		{ role: "assistant" as const, text: turn.answer },
	]);
}

export function buildBtwSelectionLines(turns: readonly SideThreadTurn[]): BtwSelectionLine[] {
	return buildQuickHandoffSegments(turns, { kind: "entire" }).flatMap((segment) =>
		segment.text.split("\n").map((text) => ({ role: segment.role, text })),
	);
}

export function segmentsFromLineRange(
	lines: readonly BtwSelectionLine[],
	anchor: number,
	cursor: number,
): BtwHandoffSegment[] {
	if (lines.length === 0) return [];
	const start = Math.max(0, Math.min(anchor, cursor, lines.length - 1));
	const end = Math.max(0, Math.min(Math.max(anchor, cursor), lines.length - 1));
	const segments: BtwHandoffSegment[] = [];
	for (const line of lines.slice(start, end + 1)) {
		const previous = segments.at(-1);
		if (previous?.role === line.role) {
			previous.text += `\n${line.text}`;
		} else {
			segments.push({ role: line.role, text: line.text });
		}
	}
	return segments;
}

export function segmentsFromTextRange(
	lines: readonly BtwSelectionLine[],
	anchor: BtwTextPosition,
	cursor: BtwTextPosition,
): BtwHandoffSegment[] {
	if (lines.length === 0) return [];
	const first = clampTextPosition(lines, anchor);
	const second = clampTextPosition(lines, cursor);
	const [start, end] = compareTextPositions(first, second) <= 0 ? [first, second] : [second, first];
	if (compareTextPositions(start, end) === 0) return [];

	const segments: BtwHandoffSegment[] = [];
	for (let lineIndex = start.line; lineIndex <= end.line; lineIndex += 1) {
		const line = lines[lineIndex];
		if (!line) continue;
		const characters = [...line.text];
		const from = lineIndex === start.line ? start.column : 0;
		const to = lineIndex === end.line ? end.column : characters.length;
		const text = characters.slice(from, to).join("");
		if (text) {
			const previous = segments.at(-1);
			if (previous?.role === line.role) previous.text += text;
			else segments.push({ role: line.role, text });
		}
		const crossesSameRoleLine = lineIndex < end.line && lines[lineIndex + 1]?.role === line.role;
		if (crossesSameRoleLine) {
			const current = segments.at(-1);
			if (current?.role === line.role) current.text += "\n";
			else segments.push({ role: line.role, text: "\n" });
		}
	}
	return segments;
}

export function formatBtwHandoff(segments: readonly BtwHandoffSegment[]): string {
	const body = segments
		.map(
			(segment) =>
				`${segment.role === "user" ? "User" : "Assistant"}:\n${escapeHandoffText(segment.text)}`,
		)
		.join("\n\n");
	return [
		"The following context was promoted from a /btw side discussion.",
		"Treat it as discussion context, not as work already completed.",
		"",
		"<btw_context>",
		body,
		"</btw_context>",
	].join("\n");
}

export class BtwMenuSelector implements Component {
	private cursor = 0;
	private scrollOffset = 0;
	private finished = false;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		private readonly title: string,
		private readonly options: readonly string[],
		private readonly onAction: (action: BtwMenuSelectorAction) => void,
	) {}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const availableRows = Math.max(1, this.tui.terminal.rows - RESERVED_APP_ROWS);
		const viewportHeight = Math.max(0, availableRows - SELECTOR_CHROME_ROWS);
		this.keepCursorVisible(viewportHeight);
		const rows = this.options
			.slice(this.scrollOffset, this.scrollOffset + viewportHeight)
			.map((option, visibleIndex) => {
				const index = this.scrollOffset + visibleIndex;
				const raw = `${index === this.cursor ? ">" : " "} ${escapeTerminalControls(option)}`;
				const styled =
					index === this.cursor ? this.theme.bg("selectedBg", this.theme.fg("text", raw)) : raw;
				return truncateToWidth(styled, safeWidth, "");
			});
		return fitRows(
			[
				truncateToWidth(
					this.theme.fg("accent", this.theme.bold(escapeTerminalControls(this.title))),
					safeWidth,
					"",
				),
				...rows,
				truncateToWidth(
					this.theme.fg("muted", "Navigate • confirm • back • Ctrl+C close"),
					safeWidth,
					"",
				),
			],
			availableRows,
		);
	}

	handleInput(data: string): void {
		if (this.finished) return;
		if (matchesKey(data, Key.ctrl("c"))) {
			this.finish({ kind: "close" });
			return;
		}
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.finish({ kind: "back" });
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.cursor = Math.max(0, this.cursor - 1);
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.cursor = Math.min(Math.max(0, this.options.length - 1), this.cursor + 1);
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.cursor = Math.max(0, this.cursor - 10);
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.cursor = Math.min(Math.max(0, this.options.length - 1), this.cursor + 10);
			this.tui.requestRender();
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm")) {
			const value = this.options[this.cursor];
			if (value !== undefined) this.finish({ kind: "select", value });
		}
	}

	invalidate(): void {}

	private keepCursorVisible(height: number): void {
		if (height <= 0) return;
		if (this.cursor < this.scrollOffset) this.scrollOffset = this.cursor;
		if (this.cursor >= this.scrollOffset + height) {
			this.scrollOffset = this.cursor - height + 1;
		}
	}

	private finish(action: BtwMenuSelectorAction): void {
		if (this.finished) return;
		this.finished = true;
		this.onAction(action);
	}
}

export class BtwTextRangeSelector implements Component {
	private readonly lines: BtwSelectionLine[];
	private cursor: BtwTextPosition = { line: 0, column: 0 };
	private anchor: BtwTextPosition | undefined;
	private lineAnchor: number | undefined;
	private preferredColumn = 0;
	private scrollOffset = 0;
	private horizontalOffset = 0;
	private warning: string | undefined;
	private finished = false;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly keybindings: KeybindingsManager,
		turns: readonly SideThreadTurn[],
		private readonly onAction: (action: BtwTextRangeSelectorAction) => void,
	) {
		this.lines = buildBtwSelectionLines(turns);
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const availableRows = Math.max(1, this.tui.terminal.rows - RESERVED_APP_ROWS);
		const viewportHeight = Math.max(0, availableRows - SELECTOR_CHROME_ROWS);
		this.keepCursorVisible(viewportHeight);
		const textWidth = Math.max(1, safeWidth - visibleWidth("> Assistant │ "));
		this.keepCursorHorizontallyVisible(textWidth);
		const range = this.getSelectionRange();
		const lineRange = this.getLineSelectionRange();
		const visible = this.lines.slice(this.scrollOffset, this.scrollOffset + viewportHeight);
		const rows = visible.map((line, visibleIndex) => {
			const lineIndex = this.scrollOffset + visibleIndex;
			const role = line.role === "user" ? "User" : "Assistant";
			const prefix = `${lineIndex === this.cursor.line ? ">" : " "} ${role.padEnd(9)} │ `;
			const text = this.renderTextLine(
				line,
				lineIndex,
				range,
				lineRange ? lineIndex >= lineRange.start && lineIndex <= lineRange.end : false,
			);
			return truncateToWidth(
				lineIndex === this.cursor.line ? this.theme.fg("accent", prefix) + text : prefix + text,
				safeWidth,
				"",
			);
		});
		const selected = this.getSelectedSegments();
		const bytes = Buffer.byteLength(selected.map((segment) => segment.text).join("\n"), "utf8");
		const footer = this.warning
			? `${this.warning} • Space lines • Shift+Arrows text • back • Ctrl+C close`
			: this.lineAnchor !== undefined
				? `~${Math.ceil(bytes / 4)} tokens • Space clear • ↑↓ extend lines • Shift+Arrows text • confirm • back • Ctrl+C close`
				: `~${Math.ceil(bytes / 4)} tokens • Shift+Arrows select text • Arrows move • Space lines • confirm • back • Ctrl+C close`;
		return fitRows(
			[
				truncateToWidth(
					this.theme.fg("accent", this.theme.bold("Select text to bring back")),
					safeWidth,
					"",
				),
				...rows,
				truncateToWidth(this.theme.fg(this.warning ? "warning" : "muted", footer), safeWidth, ""),
			],
			availableRows,
		);
	}

	handleInput(data: string): void {
		if (this.finished) return;
		if (matchesKey(data, Key.ctrl("c"))) {
			this.finish({ kind: "close" });
			return;
		}
		if (this.keybindings.matches(data, "tui.select.cancel")) {
			this.finish({ kind: "back" });
			return;
		}
		if (matchesKey(data, Key.space)) {
			this.anchor = undefined;
			this.lineAnchor = this.lineAnchor === undefined ? this.cursor.line : undefined;
			this.afterMove();
			return;
		}
		if (matchesKey(data, Key.shift("left"))) {
			this.moveHorizontal(-1, true);
			return;
		}
		if (matchesKey(data, Key.shift("right"))) {
			this.moveHorizontal(1, true);
			return;
		}
		if (matchesKey(data, Key.shift("up"))) {
			this.moveVertical(-1, true);
			return;
		}
		if (matchesKey(data, Key.shift("down"))) {
			this.moveVertical(1, true);
			return;
		}
		if (matchesKey(data, Key.left)) {
			this.moveHorizontal(-1, false);
			return;
		}
		if (matchesKey(data, Key.right)) {
			this.moveHorizontal(1, false);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.up")) {
			this.moveVertical(-1, false);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.down")) {
			this.moveVertical(1, false);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageUp")) {
			this.moveVertical(-10, false);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.pageDown")) {
			this.moveVertical(10, false);
			return;
		}
		if (this.keybindings.matches(data, "tui.select.confirm") && this.lines.length > 0) {
			const segments = this.getSelectedSegments();
			if (segments.length === 0) {
				this.warning = "Select text first";
				this.tui.requestRender();
				return;
			}
			this.finish({ kind: "confirm", segments });
		}
	}

	invalidate(): void {}

	private renderTextLine(
		line: BtwSelectionLine,
		lineIndex: number,
		range: { start: BtwTextPosition; end: BtwTextPosition } | undefined,
		lineSelected: boolean,
	): string {
		const characters = [...line.text];
		let rendered = this.horizontalOffset > 0 ? this.theme.fg("muted", "…") : "";
		let buffer = "";
		let bufferSelected = false;
		const flush = () => {
			if (!buffer) return;
			rendered += bufferSelected
				? this.theme.bg("selectedBg", this.theme.fg("text", buffer))
				: buffer;
			buffer = "";
		};
		for (let column = this.horizontalOffset; column <= characters.length; column += 1) {
			if (lineIndex === this.cursor.line && column === this.cursor.column) {
				flush();
				rendered += this.theme.fg("accent", "│");
			}
			const character = characters[column];
			if (character === undefined) continue;
			const selected =
				lineSelected || (range ? positionFallsInside(lineIndex, column, range) : false);
			if (buffer && selected !== bufferSelected) flush();
			bufferSelected = selected;
			buffer += escapeTerminalControls(character);
		}
		flush();
		return rendered;
	}

	private getSelectionRange(): { start: BtwTextPosition; end: BtwTextPosition } | undefined {
		if (!this.anchor || compareTextPositions(this.anchor, this.cursor) === 0) return undefined;
		return compareTextPositions(this.anchor, this.cursor) < 0
			? { start: this.anchor, end: this.cursor }
			: { start: this.cursor, end: this.anchor };
	}

	private getLineSelectionRange(): { start: number; end: number } | undefined {
		return this.lineAnchor === undefined
			? undefined
			: {
					start: Math.min(this.lineAnchor, this.cursor.line),
					end: Math.max(this.lineAnchor, this.cursor.line),
				};
	}

	private getSelectedSegments(): BtwHandoffSegment[] {
		if (this.lineAnchor !== undefined) {
			return segmentsFromLineRange(this.lines, this.lineAnchor, this.cursor.line);
		}
		return this.anchor ? segmentsFromTextRange(this.lines, this.anchor, this.cursor) : [];
	}

	private moveHorizontal(delta: -1 | 1, extend: boolean): void {
		if (this.lines.length === 0) return;
		if (!extend) this.lineAnchor = undefined;
		if (!extend && this.anchor) {
			const range = this.getSelectionRange();
			if (range) this.cursor = delta < 0 ? range.start : range.end;
			this.anchor = undefined;
			this.preferredColumn = this.cursor.column;
			this.afterMove();
			return;
		}
		this.beginOrClearSelection(extend);
		const line = this.lines[this.cursor.line];
		const length = line ? [...line.text].length : 0;
		if (delta < 0) {
			if (this.cursor.column > 0) this.cursor = { ...this.cursor, column: this.cursor.column - 1 };
			else if (this.cursor.line > 0) {
				const previousLine = this.lines[this.cursor.line - 1];
				this.cursor = {
					line: this.cursor.line - 1,
					column: previousLine ? [...previousLine.text].length : 0,
				};
			}
		} else if (this.cursor.column < length) {
			this.cursor = { ...this.cursor, column: this.cursor.column + 1 };
		} else if (this.cursor.line < this.lines.length - 1) {
			this.cursor = { line: this.cursor.line + 1, column: 0 };
		}
		this.preferredColumn = this.cursor.column;
		this.afterMove();
	}

	private moveVertical(delta: number, extend: boolean): void {
		if (this.lines.length === 0) return;
		if (extend || this.lineAnchor === undefined) this.beginOrClearSelection(extend);
		const line = Math.max(0, Math.min(this.lines.length - 1, this.cursor.line + delta));
		const target = this.lines[line];
		this.cursor = {
			line,
			column: Math.min(this.preferredColumn, target ? [...target.text].length : 0),
		};
		this.afterMove();
	}

	private beginOrClearSelection(extend: boolean): void {
		if (extend) this.lineAnchor = undefined;
		if (extend && !this.anchor) this.anchor = { ...this.cursor };
		if (!extend) this.anchor = undefined;
	}

	private afterMove(): void {
		this.warning = undefined;
		this.tui.requestRender();
	}

	private keepCursorVisible(height: number): void {
		if (height <= 0) return;
		if (this.cursor.line < this.scrollOffset) this.scrollOffset = this.cursor.line;
		if (this.cursor.line >= this.scrollOffset + height) {
			this.scrollOffset = this.cursor.line - height + 1;
		}
	}

	private keepCursorHorizontallyVisible(width: number): void {
		const characters = [...(this.lines[this.cursor.line]?.text ?? "")];
		const displayWidths = characters.map((character) =>
			visibleWidth(escapeTerminalControls(character)),
		);
		const currentWidth = displayWidths[this.cursor.column] ?? 0;
		let usedWidth = 1 + Math.min(currentWidth, Math.max(0, width - 1));
		let offset = this.cursor.column;
		for (let index = this.cursor.column - 1; index >= 0; index -= 1) {
			const nextWidth = usedWidth + (displayWidths[index] ?? 0) + (index > 0 ? 1 : 0);
			if (nextWidth > width) break;
			usedWidth += displayWidths[index] ?? 0;
			offset = index;
		}
		this.horizontalOffset = offset;
	}

	private finish(action: BtwTextRangeSelectorAction): void {
		if (this.finished) return;
		this.finished = true;
		this.onAction(action);
	}
}

function clampTextPosition(
	lines: readonly BtwSelectionLine[],
	position: BtwTextPosition,
): BtwTextPosition {
	const line = Math.max(0, Math.min(lines.length - 1, position.line));
	const text = lines[line]?.text ?? "";
	return { line, column: Math.max(0, Math.min([...text].length, position.column)) };
}

function compareTextPositions(first: BtwTextPosition, second: BtwTextPosition): number {
	return first.line === second.line ? first.column - second.column : first.line - second.line;
}

function positionFallsInside(
	line: number,
	column: number,
	range: { start: BtwTextPosition; end: BtwTextPosition },
): boolean {
	const position = { line, column };
	return (
		compareTextPositions(position, range.start) >= 0 &&
		compareTextPositions(position, range.end) < 0
	);
}

function fitRows(rows: string[], availableRows: number): string[] {
	if (rows.length <= availableRows) return rows;
	if (availableRows <= 1) return rows.slice(0, 1);
	return [rows[0] ?? "", ...rows.slice(rows.length - availableRows + 1)];
}

function escapeHandoffText(text: string): string {
	return [...text]
		.map((character) => {
			if (character === "\n") return character;
			if (character === "\t") return "    ";
			const code = character.charCodeAt(0);
			if (code <= 31 || (code >= 127 && code <= 159)) {
				return `\\x${code.toString(16).padStart(2, "0")}`;
			}
			return character;
		})
		.join("")
		.replaceAll("</btw_context>", "&lt;/btw_context&gt;");
}

function escapeTerminalControls(text: string): string {
	return [...text]
		.map((character) => {
			const code = character.charCodeAt(0);
			if (code <= 31 || (code >= 127 && code <= 159)) {
				return `\\x${code.toString(16).padStart(2, "0")}`;
			}
			return character;
		})
		.join("");
}
