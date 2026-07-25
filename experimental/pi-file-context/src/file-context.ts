import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { FileQuoteExplorer, type FileQuoteExplorerResult } from "./file-context-explorer.js";

const WIDGET_KEY = "file-quote";
const DEFAULT_MAX_FILES = 5_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const MAX_QUOTE_BYTES = 50_000;
const MAX_QUOTE_LINES = 500;
const MAX_PENDING_QUOTES = 8;
const MAX_PENDING_QUOTE_BYTES = 100_000;
const IGNORED_DIRECTORIES = new Set([
	".git",
	".hg",
	".svn",
	".next",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"target",
]);

export interface FileQuote {
	path: string;
	startLine: number;
	endLine: number;
	text: string;
}

export interface LoadedProjectTextFile {
	path: string;
	lines: string[];
}

interface DiscoveryOptions {
	maxFiles?: number;
}

interface LoadOptions {
	maxBytes?: number;
}

export async function discoverProjectFiles(
	root: string,
	options: DiscoveryOptions = {},
): Promise<string[]> {
	const maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES);
	const files: string[] = [];

	async function walk(directory: string, prefix: string): Promise<void> {
		if (files.length >= maxFiles) return;
		const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
			left.name.localeCompare(right.name),
		);
		for (const entry of entries) {
			if (files.length >= maxFiles) return;
			if (entry.isSymbolicLink()) continue;
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			const absolutePath = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolutePath, relativePath);
			} else if (entry.isFile()) {
				files.push(relativePath);
			}
		}
	}

	await walk(await realpath(root), "");
	return files.sort((left, right) => left.localeCompare(right));
}

export function filterProjectFiles(files: readonly string[], query: string): string[] {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return [...files];
	return files.filter((file) => isOrderedSubsequence(file.toLocaleLowerCase(), needle));
}

export async function loadProjectTextFile(
	root: string,
	projectPath: string,
	options: LoadOptions = {},
): Promise<LoadedProjectTextFile> {
	if (!projectPath || isAbsolute(projectPath)) throw new Error("File path is outside the project");
	const canonicalRoot = await realpath(root);
	const candidate = resolve(canonicalRoot, projectPath);
	if (!isInside(canonicalRoot, candidate)) throw new Error("File path is outside the project");

	let canonicalFile: string;
	try {
		canonicalFile = await realpath(candidate);
	} catch (error: unknown) {
		throw new Error(`Cannot open ${projectPath}: ${formatError(error)}`);
	}
	if (!isInside(canonicalRoot, canonicalFile)) throw new Error("File path is outside the project");
	const info = await lstat(canonicalFile);
	if (!info.isFile()) throw new Error(`${projectPath} is not a regular file`);

	const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
	if (info.size > maxBytes) throw new Error(`${projectPath} exceeds ${maxBytes} bytes`);
	const file = await open(canonicalFile, "r");
	try {
		const buffer = Buffer.alloc(maxBytes + 1);
		let offset = 0;
		while (offset < buffer.length) {
			const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		if (offset > maxBytes) throw new Error(`${projectPath} exceeds ${maxBytes} bytes`);
		const contents = buffer.subarray(0, offset);
		if (contents.includes(0)) throw new Error(`${projectPath} appears to be binary`);
		return {
			path: projectPath.replaceAll("\\", "/"),
			lines: contents.toString("utf8").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n"),
		};
	} finally {
		await file.close();
	}
}

export function createFileQuote(
	path: string,
	lines: readonly string[],
	anchorIndex: number,
	cursorIndex: number,
): FileQuote {
	if (lines.length === 0) throw new Error("Cannot quote an empty file");
	const startIndex = Math.max(0, Math.min(anchorIndex, cursorIndex, lines.length - 1));
	const endIndex = Math.max(0, Math.min(Math.max(anchorIndex, cursorIndex), lines.length - 1));
	if (endIndex - startIndex + 1 > MAX_QUOTE_LINES) {
		throw new Error(`Quote exceeds ${MAX_QUOTE_LINES} lines`);
	}
	const text = lines.slice(startIndex, endIndex + 1).join("\n");
	if (Buffer.byteLength(text, "utf8") > MAX_QUOTE_BYTES) {
		throw new Error(`Quote exceeds ${MAX_QUOTE_BYTES} bytes`);
	}
	return {
		path,
		startLine: startIndex + 1,
		endLine: endIndex + 1,
		text,
	};
}

export function appendPendingQuote(current: readonly FileQuote[], quote: FileQuote): FileQuote[] {
	if (current.length >= MAX_PENDING_QUOTES) {
		throw new Error(`File Context supports at most ${MAX_PENDING_QUOTES} pending quotes`);
	}
	const totalBytes = [...current, quote].reduce(
		(total, item) => total + Buffer.byteLength(item.text, "utf8"),
		0,
	);
	if (totalBytes > MAX_PENDING_QUOTE_BYTES) {
		throw new Error(`Pending quotes exceed ${MAX_PENDING_QUOTE_BYTES} bytes`);
	}
	return [...current, quote];
}

export function formatPromptWithQuote(prompt: string, quote: FileQuote): string {
	return formatPromptWithQuotes(prompt, [quote]);
}

export function formatPromptWithQuotes(prompt: string, quotes: readonly FileQuote[]): string {
	if (quotes.length === 0) return prompt;
	const blocks = quotes.map((quote) => {
		const path = escapeXml(quote.path);
		const text = escapeXml(quote.text);
		return `<user_file_quote path="${path}" lines="${quote.startLine}-${quote.endLine}">\n${text}\n</user_file_quote>`;
	});
	const description =
		quotes.length === 1
			? "The user intentionally selected the file excerpt above."
			: "The user intentionally selected the file excerpts above.";
	return `${blocks.join("\n\n")}\n\n${description}\n\n${prompt}`;
}

export class FileQuoteTriggerEditor extends CustomEditor {
	private opening = false;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		private readonly openExplorer: () => Promise<void>,
	) {
		super(tui, theme, keybindings);
	}

	override handleInput(data: string): void {
		if (data === "@" && !this.opening && this.isQuoteTriggerPosition()) {
			this.opening = true;
			void this.openExplorer().finally(() => {
				this.opening = false;
				this.tui.requestRender();
			});
			return;
		}
		super.handleInput(data);
	}

	private isQuoteTriggerPosition(): boolean {
		const { line, col } = this.getCursor();
		const currentLine = this.getLines()[line] ?? "";
		return col === 0 || /\s/.test(currentLine[col - 1] ?? "");
	}
}

export default function fileQuoteExtension(pi: ExtensionAPI): void {
	let pendingQuotes: FileQuote[] = [];
	let installedEditorFactory: unknown;

	const clearPending = (ctx: ExtensionContext) => {
		pendingQuotes = [];
		if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
	};

	const appendPending = (quote: FileQuote, ctx: ExtensionContext) => {
		pendingQuotes = appendPendingQuote(pendingQuotes, quote);
		if (ctx.hasUI) {
			ctx.ui.setWidget(WIDGET_KEY, [
				ctx.ui.theme.fg("accent", `Quotes (${pendingQuotes.length}):`),
				...pendingQuotes.map((item) =>
					ctx.ui.theme.fg(
						"muted",
						`• ${escapeTerminalControls(item.path)} · lines ${item.startLine}-${item.endLine}`,
					),
				),
			]);
		}
	};

	const openExplorer = async (ctx: ExtensionContext): Promise<void> => {
		if (ctx.mode !== "tui") {
			rejectCommand(ctx, "File Context requires Pi's interactive TUI.");
			return;
		}
		try {
			const files = await discoverProjectFiles(ctx.cwd);
			if (files.length === 0) {
				ctx.ui.notify("File Context found no project files.", "warning");
				return;
			}
			const result = await ctx.ui.custom<FileQuoteExplorerResult | undefined>(
				(tui, theme, keybindings, done) =>
					new FileQuoteExplorer({
						tui,
						theme,
						keybindings,
						files,
						loadFile: (path) => loadProjectTextFile(ctx.cwd, path),
						done,
					}),
			);
			if (result?.kind === "quote") appendPending(result.quote, ctx);
			else if (result?.kind === "reference") ctx.ui.pasteToEditor(`@${result.path}`);
		} catch (error: unknown) {
			try {
				ctx.ui.notify(`File Context failed: ${formatError(error)}`, "error");
			} catch {
				// The session may have been replaced while the picker was open.
			}
		}
	};

	pi.registerCommand("file-quote", {
		description: "Browse project files and attach a selected line range",
		handler: async (args, ctx) => {
			if (args.trim()) {
				rejectCommand(ctx, "Usage: /file-quote");
				return;
			}
			await openExplorer(ctx);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		clearPending(ctx);
		if (ctx.mode !== "tui") return;
		ctx.ui.notify(
			"Experimental File Context loaded. Type @ at a word boundary to browse files.",
			"warning",
		);
		const previous = ctx.ui.getEditorComponent();
		if (previous) {
			ctx.ui.notify(
				"File Context left the existing custom editor unchanged; use /file-quote.",
				"warning",
			);
			return;
		}
		const factory = (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) =>
			new FileQuoteTriggerEditor(tui, theme, keybindings, () => openExplorer(ctx));
		installedEditorFactory = factory;
		ctx.ui.setEditorComponent(factory);
	});

	pi.on("input", (event, ctx) => {
		if (
			pendingQuotes.length === 0 ||
			event.source !== "interactive" ||
			!event.text.trim() ||
			event.text.trimStart().startsWith("/")
		) {
			return { action: "continue" };
		}
		const quotes = pendingQuotes;
		clearPending(ctx);
		return { action: "transform", text: formatPromptWithQuotes(event.text, quotes) };
	});

	pi.on("session_shutdown", (_event, ctx) => {
		clearPending(ctx);
		if (installedEditorFactory && ctx.mode === "tui") {
			if (ctx.ui.getEditorComponent() === installedEditorFactory)
				ctx.ui.setEditorComponent(undefined);
			installedEditorFactory = undefined;
		}
	});
}

function isOrderedSubsequence(value: string, query: string): boolean {
	let queryIndex = 0;
	for (const character of value) {
		if (character === query[queryIndex]) queryIndex += 1;
		if (queryIndex === query.length) return true;
	}
	return false;
}

function isInside(root: string, candidate: string): boolean {
	const result = relative(root, candidate);
	return (
		result === "" || (!result.startsWith(`..${sep}`) && result !== ".." && !isAbsolute(result))
	);
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function escapeTerminalControls(text: string): string {
	return [...text]
		.map((character) => {
			const code = character.charCodeAt(0);
			return code <= 31 || (code >= 127 && code <= 159)
				? `\\x${code.toString(16).padStart(2, "0")}`
				: character;
		})
		.join("");
}

function rejectCommand(ctx: ExtensionContext, message: string): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, "warning");
		return;
	}
	throw new Error(message);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
