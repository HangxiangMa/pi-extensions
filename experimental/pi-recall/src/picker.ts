import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Key, matchesKey, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import {
	filterRecallMessages,
	messagePreview,
	type RecallMessageRecord,
	type RecallScope,
	type RecallScopeContext,
} from "./messages.js";

const SCOPE_ORDER: readonly RecallScope[] = ["cwd", "all", "session"];
const SCOPE_LABELS: Record<RecallScope, string> = {
	all: "All",
	cwd: "Current cwd",
	session: "Current session",
};

export type ScopedRecallPickerResult =
	| { kind: "selected"; recordId: string; scope: RecallScope }
	| { kind: "back"; scope: RecallScope; selectedId?: string }
	| { kind: "close"; scope: RecallScope; selectedId?: string };

interface ScopedRecallPickerOptions {
	tui: TUI;
	theme: Theme;
	keybindings: KeybindingsManager;
	records: readonly RecallMessageRecord[];
	current: RecallScopeContext;
	initialScope?: RecallScope;
	initialSelectedId?: string;
	complete: (result: ScopedRecallPickerResult) => void;
}

export class ScopedRecallPicker implements Component {
	private scope: RecallScope;
	private selectedId: string | undefined;
	private scrollOffset = 0;
	private disposed = false;
	private completed = false;

	constructor(private readonly options: ScopedRecallPickerOptions) {
		this.scope = options.initialScope ?? "cwd";
		const records = this.filteredRecords();
		this.selectedId = records.some(({ id }) => id === options.initialSelectedId)
			? options.initialSelectedId
			: records[0]?.id;
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		const records = this.filteredRecords();
		const listHeight = Math.max(1, Math.floor(this.options.tui.terminal.rows) - 7);
		this.keepSelectionVisible(records, listHeight);
		const visible = records.slice(this.scrollOffset, this.scrollOffset + listHeight);
		const rows = visible.map((record) => {
			const selected = record.id === this.selectedId;
			const role = record.role === "assistant" ? "assistant" : "user";
			const timestamp = new Date(record.source.messageTimestamp).toISOString();
			const session = record.source.sessionName
				? ` · ${sanitizeTerminalText(record.source.sessionName)}`
				: "";
			const preview = sanitizeTerminalText(messagePreview(record.text, 72));
			const line = `${selected ? ">" : " "} ${role} · ${timestamp}${session} · ${preview}`;
			return selected
				? this.options.theme.fg("accent", truncateToWidth(line, safeWidth, "…"))
				: truncateToWidth(line, safeWidth, "…");
		});
		const scopeLine = `Scope: ${SCOPE_LABELS[this.scope]} (${records.length}) · Tab change scope`;
		return [
			truncateToWidth(
				this.options.theme.fg("accent", this.options.theme.bold("Pi Recall")),
				safeWidth,
				"",
			),
			truncateToWidth(this.options.theme.fg("muted", scopeLine), safeWidth, ""),
			"",
			...(rows.length > 0
				? rows
				: [
						truncateToWidth(
							this.options.theme.fg("dim", "  No saved messages in this scope"),
							safeWidth,
							"",
						),
					]),
			truncateToWidth(
				this.options.theme.fg(
					"dim",
					"↑↓ navigate · Enter select · Tab/Shift+Tab scope · Esc back · Ctrl+C close",
				),
				safeWidth,
				"",
			),
		].map((line) => truncateToWidth(line, safeWidth, ""));
	}

	handleInput(data: string): void {
		if (this.disposed || this.completed) return;
		if (matchesKey(data, Key.ctrl("c"))) {
			this.finish({ kind: "close", scope: this.scope, selectedId: this.selectedId });
			return;
		}
		if (matchesKey(data, Key.shift("tab"))) {
			this.cycleScope(-1);
		} else if (matchesKey(data, Key.tab)) {
			this.cycleScope(1);
		} else if (this.options.keybindings.matches(data, "tui.select.cancel")) {
			this.finish({ kind: "back", scope: this.scope, selectedId: this.selectedId });
			return;
		} else if (this.options.keybindings.matches(data, "tui.select.up")) {
			this.move(-1);
		} else if (this.options.keybindings.matches(data, "tui.select.down")) {
			this.move(1);
		} else if (this.options.keybindings.matches(data, "tui.select.pageUp")) {
			this.move(-Math.max(1, Math.floor(this.options.tui.terminal.rows) - 7));
		} else if (this.options.keybindings.matches(data, "tui.select.pageDown")) {
			this.move(Math.max(1, Math.floor(this.options.tui.terminal.rows) - 7));
		} else if (matchesKey(data, Key.home)) {
			this.selectAt(0);
		} else if (matchesKey(data, Key.end)) {
			this.selectAt(this.filteredRecords().length - 1);
		} else if (this.options.keybindings.matches(data, "tui.select.confirm")) {
			if (this.selectedId) {
				this.finish({ kind: "selected", recordId: this.selectedId, scope: this.scope });
				return;
			}
		}
		this.options.tui.requestRender();
	}

	invalidate(): void {}

	dispose(): void {
		this.disposed = true;
	}

	private filteredRecords(): RecallMessageRecord[] {
		return filterRecallMessages(this.options.records, this.scope, this.options.current).reverse();
	}

	private cycleScope(delta: number): void {
		const index = SCOPE_ORDER.indexOf(this.scope);
		this.scope = SCOPE_ORDER[(index + delta + SCOPE_ORDER.length) % SCOPE_ORDER.length] ?? "cwd";
		const records = this.filteredRecords();
		if (!records.some(({ id }) => id === this.selectedId)) this.selectedId = records[0]?.id;
		this.scrollOffset = 0;
	}

	private move(delta: number): void {
		const records = this.filteredRecords();
		if (records.length === 0) return;
		const current = Math.max(
			0,
			records.findIndex(({ id }) => id === this.selectedId),
		);
		const next = Math.max(0, Math.min(records.length - 1, current + delta));
		this.selectedId = records[next]?.id;
	}

	private selectAt(index: number): void {
		const records = this.filteredRecords();
		if (records.length === 0) return;
		const bounded = Math.max(0, Math.min(records.length - 1, index));
		this.selectedId = records[bounded]?.id;
	}

	private keepSelectionVisible(records: readonly RecallMessageRecord[], height: number): void {
		if (records.length === 0) {
			this.scrollOffset = 0;
			return;
		}
		const index = Math.max(
			0,
			records.findIndex(({ id }) => id === this.selectedId),
		);
		if (index < this.scrollOffset) this.scrollOffset = index;
		if (index >= this.scrollOffset + height) this.scrollOffset = index - height + 1;
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, records.length - height));
	}

	private finish(result: ScopedRecallPickerResult): void {
		if (this.completed) return;
		this.completed = true;
		this.options.complete(result);
	}
}

export function sanitizeTerminalText(value: string): string {
	let safe = "";
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code === 0x1b) {
			const introducer = value[index + 1];
			if (introducer === "]") {
				index += 2;
				while (index < value.length) {
					const current = value.charCodeAt(index);
					if (current === 0x07) break;
					if (current === 0x1b && value[index + 1] === "\\") {
						index += 1;
						break;
					}
					index += 1;
				}
				continue;
			}
			if (introducer === "[") {
				index += 2;
				while (index < value.length) {
					const current = value.charCodeAt(index);
					if (current >= 0x40 && current <= 0x7e) break;
					index += 1;
				}
				continue;
			}
			continue;
		}
		if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) safe += " ";
		else safe += value[index];
	}
	return safe.replace(/\s+/gu, " ").trim();
}
