import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Key, matchesKey, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
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

export type BtwQuickHandoffScope =
	| { kind: "latest" }
	| { kind: "from"; answeredTurnIndex: number }
	| { kind: "entire" };

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

export class BtwTextRangeSelector implements Component {
	private readonly lines: BtwSelectionLine[];
	private cursor = 0;
	private anchor: number | undefined;
	private scrollOffset = 0;
	private finished = false;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
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
		const range = this.getSelectionRange();
		const visible = this.lines.slice(this.scrollOffset, this.scrollOffset + viewportHeight);
		const rows = visible.map((line, visibleIndex) => {
			const index = this.scrollOffset + visibleIndex;
			const cursor = index === this.cursor ? ">" : " ";
			const role = line.role === "user" ? "User" : "Assistant";
			const raw = `${cursor} ${role.padEnd(9)} │ ${escapeTerminalControls(line.text)}`;
			const styled =
				index >= range.start && index <= range.end
					? this.theme.bg("selectedBg", this.theme.fg("text", raw))
					: index === this.cursor
						? this.theme.fg("accent", raw)
						: raw;
			return truncateToWidth(styled, safeWidth, "");
		});
		const selected = segmentsFromLineRange(this.lines, this.anchor ?? this.cursor, this.cursor);
		const bytes = Buffer.byteLength(selected.map((segment) => segment.text).join("\n"), "utf8");
		const footer = `~${Math.max(1, Math.ceil(bytes / 4))} tokens • Space anchor • ↑↓ extend • Enter confirm • Esc back`;
		return fitRows(
			[
				truncateToWidth(
					this.theme.fg("accent", this.theme.bold("Select text to bring back")),
					safeWidth,
					"",
				),
				...rows,
				truncateToWidth(this.theme.fg("muted", footer), safeWidth, ""),
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
		if (matchesKey(data, Key.escape)) {
			this.finish({ kind: "back" });
			return;
		}
		if (data === " ") {
			this.anchor = this.anchor === undefined ? this.cursor : undefined;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.cursor = Math.max(0, this.cursor - 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.cursor = Math.min(Math.max(0, this.lines.length - 1), this.cursor + 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.cursor = Math.max(0, this.cursor - 10);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.cursor = Math.min(Math.max(0, this.lines.length - 1), this.cursor + 10);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.enter) && this.lines.length > 0) {
			this.finish({
				kind: "confirm",
				segments: segmentsFromLineRange(this.lines, this.anchor ?? this.cursor, this.cursor),
			});
		}
	}

	invalidate(): void {}

	private getSelectionRange(): { start: number; end: number } {
		const anchor = this.anchor ?? this.cursor;
		return { start: Math.min(anchor, this.cursor), end: Math.max(anchor, this.cursor) };
	}

	private keepCursorVisible(height: number): void {
		if (height <= 0) return;
		if (this.cursor < this.scrollOffset) this.scrollOffset = this.cursor;
		if (this.cursor >= this.scrollOffset + height) {
			this.scrollOffset = this.cursor - height + 1;
		}
	}

	private finish(action: BtwTextRangeSelectorAction): void {
		if (this.finished) return;
		this.finished = true;
		this.onAction(action);
	}
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
		.join("");
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
