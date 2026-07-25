import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type Focusable,
	Input,
	Key,
	matchesKey,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	createFileQuote,
	type FileQuote,
	filterProjectFiles,
	type LoadedProjectTextFile,
} from "./file-quote.js";

const RESERVED_APP_ROWS = 3;
const EXPLORER_CHROME_ROWS = 4;
const PREVIEW_CHROME_ROWS = 3;

export type FileQuoteExplorerResult =
	| { kind: "quote"; quote: FileQuote }
	| { kind: "reference"; path: string };

interface FileQuoteExplorerOptions {
	tui: TUI;
	theme: Theme;
	keybindings: KeybindingsManager;
	files: readonly string[];
	loadFile: (path: string) => Promise<LoadedProjectTextFile>;
	done: (result: FileQuoteExplorerResult | undefined) => void;
}

export class FileQuoteExplorer implements Component, Focusable {
	private readonly search = new Input();
	private readonly files: readonly string[];
	private filteredFiles: string[];
	private selectedFileIndex = 0;
	private fileScrollOffset = 0;
	private mode: "files" | "preview" = "files";
	private loadedFile: LoadedProjectTextFile | undefined;
	private previewCursor = 0;
	private previewAnchor: number | undefined;
	private previewScrollOffset = 0;
	private loading = false;
	private error: string | undefined;
	private finished = false;
	private isFocused = false;

	constructor(private readonly options: FileQuoteExplorerOptions) {
		this.files = options.files;
		this.filteredFiles = [...options.files];
	}

	get focused(): boolean {
		return this.isFocused;
	}

	set focused(value: boolean) {
		this.isFocused = value;
		this.search.focused = value && this.mode === "files";
	}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		return this.mode === "files" ? this.renderFileList(safeWidth) : this.renderPreview(safeWidth);
	}

	handleInput(data: string): void {
		if (this.finished) return;
		if (matchesKey(data, Key.ctrl("c"))) {
			this.finish(undefined);
			return;
		}
		if (this.mode === "files") this.handleFileInput(data);
		else this.handlePreviewInput(data);
		if (!this.finished) this.options.tui.requestRender();
	}

	invalidate(): void {
		this.search.invalidate();
	}

	private renderFileList(width: number): string[] {
		const availableRows = Math.max(1, this.options.tui.terminal.rows - RESERVED_APP_ROWS);
		const listHeight = Math.max(1, availableRows - EXPLORER_CHROME_ROWS);
		this.keepFileVisible(listHeight);
		const title = this.options.theme.fg("accent", this.options.theme.bold("File Context · files"));
		const queryLabel = this.options.theme.fg("muted", "Search: ");
		const queryWidth = Math.max(1, width - visibleWidth(queryLabel));
		const searchLine = `${queryLabel}${this.search.render(queryWidth)[0] ?? ""}`;
		const visibleFiles = this.filteredFiles.slice(
			this.fileScrollOffset,
			this.fileScrollOffset + listHeight,
		);
		const fileLines = visibleFiles.map((file, visibleIndex) => {
			const index = this.fileScrollOffset + visibleIndex;
			const prefix = index === this.selectedFileIndex ? "> " : "  ";
			const line = `${prefix}${escapeTerminalControls(file)}`;
			return truncateToWidth(
				index === this.selectedFileIndex
					? this.options.theme.bg("selectedBg", this.options.theme.fg("text", line))
					: line,
				width,
				"",
			);
		});
		if (fileLines.length === 0)
			fileLines.push(this.options.theme.fg("muted", "  No matching files"));
		const state = this.loading
			? this.options.theme.fg("warning", "Loading…")
			: this.error
				? this.options.theme.fg("error", truncateToWidth(this.error, width))
				: this.options.theme.fg(
						"muted",
						`${this.filteredFiles.length} files · ↑↓ navigate · Enter preview · Tab reference · Esc cancel`,
					);
		return fitRows(
			[
				truncateToWidth(title, width, ""),
				truncateToWidth(searchLine, width, ""),
				...fileLines,
				truncateToWidth(state, width, ""),
			],
			availableRows,
		);
	}

	private renderPreview(width: number): string[] {
		const availableRows = Math.max(1, this.options.tui.terminal.rows - RESERVED_APP_ROWS);
		const previewHeight = Math.max(1, availableRows - PREVIEW_CHROME_ROWS);
		const loadedFile = this.loadedFile;
		if (!loadedFile) return [this.options.theme.fg("warning", "Loading preview…")];
		this.keepPreviewVisible(previewHeight);
		const digits = String(Math.max(1, loadedFile.lines.length)).length;
		const range = this.getSelectionRange();
		const visibleLines = loadedFile.lines.slice(
			this.previewScrollOffset,
			this.previewScrollOffset + previewHeight,
		);
		const previewLines = visibleLines.map((rawLine, visibleIndex) => {
			const index = this.previewScrollOffset + visibleIndex;
			const selected = index >= range.start && index <= range.end;
			const cursor = index === this.previewCursor ? ">" : " ";
			const number = String(index + 1).padStart(digits, " ");
			const line = `${cursor}${number} │ ${escapeTerminalControls(rawLine)}`;
			const styled = selected
				? this.options.theme.bg("selectedBg", this.options.theme.fg("text", line))
				: index === this.previewCursor
					? this.options.theme.fg("accent", line)
					: line;
			return truncateToWidth(styled, width, "");
		});
		const selecting =
			this.previewAnchor === undefined
				? "cursor line"
				: `lines ${range.start + 1}-${range.end + 1}`;
		const footer = this.error
			? this.options.theme.fg("error", this.error)
			: `Space anchor · ↑↓ extend · Enter attach ${selecting} · Esc files`;
		return fitRows(
			[
				truncateToWidth(
					this.options.theme.fg(
						"accent",
						this.options.theme.bold(escapeTerminalControls(loadedFile.path)),
					),
					width,
					"",
				),
				...previewLines,
				truncateToWidth(this.options.theme.fg("muted", footer), width, ""),
			],
			availableRows,
		);
	}

	private handleFileInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.finish(undefined);
			return;
		}
		if (this.loading) return;
		if (this.options.keybindings.matches(data, "tui.select.up")) {
			this.selectedFileIndex = Math.max(0, this.selectedFileIndex - 1);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.down")) {
			this.selectedFileIndex = Math.min(
				Math.max(0, this.filteredFiles.length - 1),
				this.selectedFileIndex + 1,
			);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.pageUp")) {
			this.selectedFileIndex = Math.max(0, this.selectedFileIndex - 10);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.pageDown")) {
			this.selectedFileIndex = Math.min(
				Math.max(0, this.filteredFiles.length - 1),
				this.selectedFileIndex + 10,
			);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.confirm")) {
			const path = this.filteredFiles[this.selectedFileIndex];
			if (path) void this.openFile(path);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.input.tab")) {
			const path = this.filteredFiles[this.selectedFileIndex];
			if (path) this.finish({ kind: "reference", path });
			return;
		}

		const previousQuery = this.search.getValue();
		this.search.handleInput(data);
		const query = this.search.getValue();
		if (query !== previousQuery) {
			this.filteredFiles = filterProjectFiles(this.files, query);
			this.selectedFileIndex = 0;
			this.fileScrollOffset = 0;
			this.error = undefined;
		}
	}

	private handlePreviewInput(data: string): void {
		const loadedFile = this.loadedFile;
		if (!loadedFile) return;
		const lines = loadedFile.lines;
		if (matchesKey(data, Key.escape)) {
			this.mode = "files";
			this.loadedFile = undefined;
			this.previewAnchor = undefined;
			this.search.focused = this.isFocused;
			return;
		}
		if (data === " ") {
			this.previewAnchor = this.previewAnchor === undefined ? this.previewCursor : undefined;
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.up")) {
			this.previewCursor = Math.max(0, this.previewCursor - 1);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.down")) {
			this.previewCursor = Math.min(lines.length - 1, this.previewCursor + 1);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.pageUp")) {
			this.previewCursor = Math.max(0, this.previewCursor - 10);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.pageDown")) {
			this.previewCursor = Math.min(lines.length - 1, this.previewCursor + 10);
			return;
		}
		if (this.options.keybindings.matches(data, "tui.select.confirm")) {
			const anchor = this.previewAnchor ?? this.previewCursor;
			try {
				this.finish({
					kind: "quote",
					quote: createFileQuote(loadedFile.path, lines, anchor, this.previewCursor),
				});
			} catch (error: unknown) {
				this.error = formatError(error);
			}
		}
	}

	private async openFile(path: string): Promise<void> {
		this.loading = true;
		this.error = undefined;
		this.options.tui.requestRender();
		try {
			this.loadedFile = await this.options.loadFile(path);
			this.mode = "preview";
			this.previewCursor = 0;
			this.previewAnchor = undefined;
			this.previewScrollOffset = 0;
			this.error = undefined;
			this.search.focused = false;
		} catch (error: unknown) {
			this.error = formatError(error);
		} finally {
			this.loading = false;
			this.options.tui.requestRender();
		}
	}

	private finish(result: FileQuoteExplorerResult | undefined): void {
		this.finished = true;
		this.options.done(result);
	}

	private getSelectionRange(): { start: number; end: number } {
		const anchor = this.previewAnchor ?? this.previewCursor;
		return {
			start: Math.min(anchor, this.previewCursor),
			end: Math.max(anchor, this.previewCursor),
		};
	}

	private keepFileVisible(height: number): void {
		if (this.selectedFileIndex < this.fileScrollOffset)
			this.fileScrollOffset = this.selectedFileIndex;
		if (this.selectedFileIndex >= this.fileScrollOffset + height) {
			this.fileScrollOffset = this.selectedFileIndex - height + 1;
		}
	}

	private keepPreviewVisible(height: number): void {
		if (this.previewCursor < this.previewScrollOffset)
			this.previewScrollOffset = this.previewCursor;
		if (this.previewCursor >= this.previewScrollOffset + height) {
			this.previewScrollOffset = this.previewCursor - height + 1;
		}
	}
}

function fitRows(lines: string[], height: number): string[] {
	if (lines.length <= height) return lines;
	if (height <= 1) return lines.slice(0, 1);
	return [...lines.slice(0, height - 1), lines.at(-1) ?? ""];
}

function escapeTerminalControls(text: string): string {
	return [...text]
		.map((character) => {
			if (character === "\t") return "    ";
			const code = character.charCodeAt(0);
			if (code <= 31 || (code >= 127 && code <= 159)) {
				return `\\x${code.toString(16).padStart(2, "0")}`;
			}
			return character;
		})
		.join("");
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
