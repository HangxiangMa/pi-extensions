import { createHash } from "node:crypto";
import { constants } from "node:fs";
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
import { createGitContext } from "./git-context.js";

const WIDGET_KEY = "file-context";
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

export interface FileQuoteGitProvenance {
	head: string;
	branch?: string;
	status?: string;
	revision?: string;
	blob?: string;
	contentSha256: string;
	source?: "worktree" | "revision" | "git_diff";
	base?: string;
}

export type FileQuoteGitProvenanceInput = Omit<FileQuoteGitProvenance, "contentSha256">;

export interface FileQuote {
	path: string;
	startLine: number;
	endLine: number;
	text: string;
	git?: FileQuoteGitProvenance;
}

export interface LoadedProjectTextFile {
	path: string;
	lines: string[];
}

interface DiscoveryOptions {
	maxFiles?: number;
	signal?: AbortSignal;
}

interface LoadOptions {
	maxBytes?: number;
	beforeOpen?: () => Promise<void>;
	signal?: AbortSignal;
}

interface ActiveExplorer {
	controller: AbortController;
	component?: FileQuoteExplorer;
}

export async function discoverProjectFiles(
	root: string,
	options: DiscoveryOptions = {},
): Promise<string[]> {
	const maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES);
	const files: string[] = [];
	options.signal?.throwIfAborted();

	async function walk(directory: string, prefix: string): Promise<void> {
		options.signal?.throwIfAborted();
		if (files.length >= maxFiles) return;
		const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
			compareStrings(left.name, right.name),
		);
		options.signal?.throwIfAborted();
		for (const entry of entries) {
			options.signal?.throwIfAborted();
			if (files.length >= maxFiles) return;
			if (IGNORED_DIRECTORIES.has(entry.name) || entry.isSymbolicLink()) continue;
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			const absolutePath = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				await walk(absolutePath, relativePath);
			} else if (entry.isFile()) {
				files.push(relativePath);
			}
		}
	}

	const canonicalRoot = await realpath(root);
	options.signal?.throwIfAborted();
	await walk(canonicalRoot, "");
	options.signal?.throwIfAborted();
	return files.sort(compareStrings);
}

export async function loadProjectTextFile(
	root: string,
	projectPath: string,
	options: LoadOptions = {},
): Promise<LoadedProjectTextFile> {
	options.signal?.throwIfAborted();
	if (!projectPath || isAbsolute(projectPath)) throw new Error("File path is outside the project");
	const canonicalRoot = await realpath(root);
	options.signal?.throwIfAborted();
	const candidate = resolve(canonicalRoot, projectPath);
	if (!isInside(canonicalRoot, candidate)) throw new Error("File path is outside the project");

	let canonicalFile: string;
	try {
		canonicalFile = await realpath(candidate);
	} catch (error: unknown) {
		throw new Error(`Cannot open ${projectPath}: ${formatError(error)}`);
	}
	options.signal?.throwIfAborted();
	if (!isInside(canonicalRoot, canonicalFile)) throw new Error("File path is outside the project");
	const info = await lstat(canonicalFile);
	options.signal?.throwIfAborted();
	if (!info.isFile()) throw new Error(`${projectPath} is not a regular file`);

	const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
	if (info.size > maxBytes) throw new Error(`${projectPath} exceeds ${maxBytes} bytes`);
	await options.beforeOpen?.();
	options.signal?.throwIfAborted();
	let file: Awaited<ReturnType<typeof open>>;
	try {
		file = await open(
			canonicalFile,
			constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
		);
	} catch (error: unknown) {
		throw new Error(`Cannot safely open ${projectPath}: ${formatError(error)}`);
	}
	try {
		options.signal?.throwIfAborted();
		const openedInfo = await file.stat();
		options.signal?.throwIfAborted();
		if (!openedInfo.isFile()) throw new Error(`${projectPath} is not a regular file`);
		if (openedInfo.dev !== info.dev || openedInfo.ino !== info.ino) {
			throw new Error(`${projectPath} changed while it was being opened safely`);
		}
		if (openedInfo.size > maxBytes) throw new Error(`${projectPath} exceeds ${maxBytes} bytes`);
		const buffer = Buffer.alloc(maxBytes + 1);
		let offset = 0;
		while (offset < buffer.length) {
			options.signal?.throwIfAborted();
			const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
			options.signal?.throwIfAborted();
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		if (offset > maxBytes) throw new Error(`${projectPath} exceeds ${maxBytes} bytes`);
		const contents = buffer.subarray(0, offset);
		if (contents.includes(0)) throw new Error(`${projectPath} appears to be binary`);
		return {
			path: projectPath.replaceAll("\\", "/"),
			lines: normalizeTextLines(contents.toString("utf8")),
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
	git?: FileQuoteGitProvenanceInput,
): FileQuote {
	if (lines.length === 0) throw new Error("Cannot quote an empty file");
	const startIndex = Math.max(0, Math.min(anchorIndex, cursorIndex, lines.length - 1));
	const endIndex = Math.max(0, Math.min(Math.max(anchorIndex, cursorIndex), lines.length - 1));
	const text = lines.slice(startIndex, endIndex + 1).join("\n");
	return createFileQuoteSnapshot(path, startIndex + 1, endIndex + 1, text, git);
}

export function createFileQuoteSnapshot(
	path: string,
	startLine: number,
	endLine: number,
	text: string,
	git?: FileQuoteGitProvenanceInput,
): FileQuote {
	if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1) {
		throw new Error("Quote lines must be positive integers");
	}
	if (endLine < startLine) throw new Error("Quote end line precedes its start line");
	if (text.split("\n").length > MAX_QUOTE_LINES) {
		throw new Error(`Quote exceeds ${MAX_QUOTE_LINES} lines`);
	}
	if (Buffer.byteLength(text, "utf8") > MAX_QUOTE_BYTES) {
		throw new Error(`Quote exceeds ${MAX_QUOTE_BYTES} bytes`);
	}
	return {
		path,
		startLine,
		endLine,
		text,
		...(git
			? {
					git: {
						head: git.head,
						...(git.branch !== undefined ? { branch: git.branch } : {}),
						...(git.status !== undefined ? { status: git.status } : {}),
						...(git.revision !== undefined ? { revision: git.revision } : {}),
						...(git.blob !== undefined ? { blob: git.blob } : {}),
						contentSha256: createHash("sha256").update(text, "utf8").digest("hex"),
						...(git.source !== undefined ? { source: git.source } : {}),
						...(git.base !== undefined ? { base: git.base } : {}),
					},
				}
			: {}),
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
	return `${formatQuoteContext(quotes)}\n\n${prompt}`;
}

export function formatQuoteContext(quotes: readonly FileQuote[]): string {
	const blocks = quotes.map((quote) => {
		const path = escapeXml(quote.path);
		const text = escapeXml(quote.text);
		const attributes = [
			`path="${path}"`,
			`lines="${quote.startLine}-${quote.endLine}"`,
			...formatGitAttributes(quote.git),
		].join(" ");
		return `<user_file_quote ${attributes}>\n${text}\n</user_file_quote>`;
	});
	const description =
		quotes.length === 1
			? "The user intentionally selected the file excerpt above."
			: "The user intentionally selected the file excerpts above.";
	return `${blocks.join("\n\n")}\n\n${description}`;
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
	let activeSessionManager: unknown;
	let sessionGeneration = 0;
	const activeExplorers = new Set<ActiveExplorer>();

	const clearPending = (ctx: ExtensionContext) => {
		pendingQuotes = [];
		if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
	};

	const appendPending = (quote: FileQuote, ctx: ExtensionContext) => {
		pendingQuotes = appendPendingQuote(pendingQuotes, quote);
		if (ctx.hasUI) {
			const totalBytes = pendingQuotes.reduce(
				(total, item) => total + Buffer.byteLength(item.text, "utf8"),
				0,
			);
			ctx.ui.setWidget(WIDGET_KEY, [
				ctx.ui.theme.fg(
					"accent",
					`Quotes (${pendingQuotes.length}) · ~${estimateTokens(totalBytes)} tokens:`,
				),
				...pendingQuotes.map((item) =>
					ctx.ui.theme.fg(
						"muted",
						`• ${escapeTerminalControls(item.path)} · lines ${item.startLine}-${item.endLine} · ~${estimateTokens(Buffer.byteLength(item.text, "utf8"))} tokens`,
					),
				),
			]);
		}
	};

	const isCurrentSession = (owner: unknown, generation: number) =>
		owner === activeSessionManager && generation === sessionGeneration;

	const cancelExplorers = () => {
		for (const explorer of activeExplorers) {
			explorer.controller.abort();
			explorer.component?.dispose();
		}
		activeExplorers.clear();
	};

	const openExplorer = async (ctx: ExtensionContext): Promise<void> => {
		if (ctx.mode !== "tui") {
			rejectCommand(ctx, "File Context requires Pi's interactive TUI.");
			return;
		}
		const owner = ctx.sessionManager;
		const generation = sessionGeneration;
		const activeExplorer: ActiveExplorer = { controller: new AbortController() };
		const { controller } = activeExplorer;
		activeExplorers.add(activeExplorer);
		try {
			const [files, gitContext] = await Promise.all([
				discoverProjectFiles(ctx.cwd, { signal: controller.signal }),
				createGitContext(ctx.cwd, controller.signal),
			]);
			if (!isCurrentSession(owner, generation) || controller.signal.aborted) return;
			if (files.length === 0) {
				ctx.ui.notify("File Context found no project files.", "warning");
				return;
			}
			const result = await ctx.ui.custom<FileQuoteExplorerResult | undefined>(
				(tui, theme, keybindings, done) => {
					const component = new FileQuoteExplorer({
						tui,
						theme,
						keybindings,
						files,
						cwd: ctx.cwd,
						loadFile: (path, signal) => loadProjectTextFile(ctx.cwd, path, { signal }),
						gitContext,
						done,
					});
					activeExplorer.component = component;
					if (controller.signal.aborted) component.dispose();
					return component;
				},
			);
			if (!isCurrentSession(owner, generation) || controller.signal.aborted) return;
			if (result?.kind === "quote") appendPending(result.quote, ctx);
			else if (result?.kind === "reference") {
				ctx.ui.pasteToEditor(formatFileReference(result.path));
			}
		} catch (error: unknown) {
			if (
				!isCurrentSession(owner, generation) ||
				controller.signal.aborted ||
				isAbortError(error)
			) {
				return;
			}
			try {
				ctx.ui.notify(`File Context failed: ${formatError(error)}`, "error");
			} catch {
				// The session may have been replaced while the picker was open.
			}
		} finally {
			activeExplorers.delete(activeExplorer);
		}
	};

	const handleFileContextCommand = async (args: string, ctx: ExtensionContext) => {
		if (args.trim()) {
			rejectCommand(ctx, "Usage: /file-context");
			return;
		}
		await openExplorer(ctx);
	};
	pi.registerCommand("file-context", {
		description: "Browse project files and attach a selected line range",
		handler: handleFileContextCommand,
	});

	pi.on("session_start", (_event, ctx) => {
		cancelExplorers();
		activeSessionManager = ctx.sessionManager;
		sessionGeneration += 1;
		clearPending(ctx);
		if (ctx.mode !== "tui") return;
		ctx.ui.notify(
			"Experimental File Context loaded. Type @ at a word boundary to browse files.",
			"warning",
		);
		const previous = ctx.ui.getEditorComponent();
		if (previous) {
			ctx.ui.notify(
				"File Context left the existing custom editor unchanged; use /file-context.",
				"warning",
			);
			return;
		}
		const factory = (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) =>
			new FileQuoteTriggerEditor(tui, theme, keybindings, () => openExplorer(ctx));
		installedEditorFactory = factory;
		ctx.ui.setEditorComponent(factory);
	});

	pi.on("before_agent_start", (_event, ctx) => {
		if (ctx.sessionManager !== activeSessionManager || pendingQuotes.length === 0) return;
		const quotes = pendingQuotes;
		clearPending(ctx);
		return {
			message: {
				customType: "file-context-quotes",
				content: formatQuoteContext(quotes),
				display: false,
			},
		};
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.sessionManager !== activeSessionManager) return;
		cancelExplorers();
		clearPending(ctx);
		if (installedEditorFactory && ctx.mode === "tui") {
			if (ctx.ui.getEditorComponent() === installedEditorFactory)
				ctx.ui.setEditorComponent(undefined);
			installedEditorFactory = undefined;
		}
	});
}

function normalizeTextLines(contents: string): string[] {
	if (contents === "") return [];
	const lines = contents.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

function formatFileReference(path: string): string {
	const escaped = path.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
	return /\s|["\\]/.test(path) ? `@"${escaped}" ` : `@${path} `;
}

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function estimateTokens(bytes: number): number {
	return Math.max(1, Math.ceil(bytes / 4));
}

function isInside(root: string, candidate: string): boolean {
	const result = relative(root, candidate);
	return (
		result === "" || (!result.startsWith(`..${sep}`) && result !== ".." && !isAbsolute(result))
	);
}

function formatGitAttributes(git: FileQuoteGitProvenance | undefined): string[] {
	if (!git) return [];
	return [
		["git_head", git.head],
		["git_branch", git.branch],
		["git_status", git.status],
		["git_revision", git.revision],
		["git_blob", git.blob],
		["content_sha256", git.contentSha256],
		["source", git.source],
		["git_base", git.base],
	].flatMap(([name, value]) => (value ? [`${name}="${escapeXml(value)}"`] : []));
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

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
