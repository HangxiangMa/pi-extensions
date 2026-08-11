import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { RunMenuResult } from "@narumitw/pi-tui-kit";

export interface FileContextMenuQuote {
	id: string;
	path: string;
	startLine: number;
	endLine: number;
	text: string;
}

export interface FileContextMenuState {
	quotes: readonly FileContextMenuQuote[];
	shortcut: string | null;
	maximumQuotes: number;
	maximumBytes: number;
	totalBytes: number;
}

export type FileContextMenuAddResult = "stay" | "close";

export type FileContextMenuRemovalResult =
	| { kind: "removed"; quote: FileContextMenuQuote; remaining: number }
	| { kind: "missing" };

export interface FileContextMenuOptions {
	start?: "main" | "remove";
	signal: AbortSignal;
	isCurrent(): boolean;
	getState(): FileContextMenuState | Promise<FileContextMenuState>;
	addQuote(signal: AbortSignal): FileContextMenuAddResult | Promise<FileContextMenuAddResult>;
	removeQuote(
		id: string,
		signal: AbortSignal,
	): FileContextMenuRemovalResult | Promise<FileContextMenuRemovalResult>;
}

type Screen = "main" | "remove" | "help";
type Action = "add" | "remove";

export async function showFileContextMenu(
	ctx: ExtensionCommandContext,
	options: FileContextMenuOptions,
): Promise<RunMenuResult> {
	const { defineMenu, runMenu } = await import("@narumitw/pi-tui-kit");
	if (!options.isCurrent() || options.signal.aborted) return { kind: "stale" };

	let addRequested = false;
	const menu = defineMenu<FileContextMenuState, Screen, Action, ExtensionCommandContext>({
		start: options.start ?? "main",
		screens: {
			main: ({ state }) => ({
				kind: "actions",
				title: "File Context",
				lines: [
					`Pending quotes: ${state.quotes.length}/${state.maximumQuotes} · ~${estimateTokens(state.totalBytes)} tokens`,
					`Shortcut: ${formatShortcut(state.shortcut)}`,
				],
				items: [
					{
						id: "add",
						label: "Add file quote",
						description: "Browse project files and select lines",
						action: "add",
						busyLabel: "Scanning project files",
						disabled: addDisabledReason(state) !== undefined,
						disabledReason: addDisabledReason(state),
					},
					{
						id: "remove",
						label: `Remove pending quote (${state.quotes.length})`,
						description: "Preview and remove exact snapshots",
						to: "remove",
						disabled: state.quotes.length === 0,
						disabledReason: state.quotes.length === 0 ? "No pending quotes to remove" : undefined,
					},
					{
						id: "help",
						label: "Help",
						description: "Review shortcuts and attachment behavior",
						to: "help",
					},
				],
				hint: "close",
			}),
			remove: ({ state }) => ({
				kind: "choice",
				title: "Remove pending quote",
				lines: [`${state.quotes.length} pending · choose one exact snapshot to remove`],
				items: state.quotes.map((quote, index) => ({
					id: quote.id,
					label: `${index + 1}. ${quote.path}`,
					description: `lines ${quote.startLine}-${quote.endLine} · ~${estimateTokens(Buffer.byteLength(quote.text, "utf8"))} tokens`,
					details: [
						`Path: ${quote.path}`,
						`Lines: ${quote.startLine}-${quote.endLine}`,
						`Preview: ${singleLinePreview(quote.text)}`,
					],
				})),
				action: "remove",
				viewportSize: 8,
				hint: "back",
			}),
			help: () => ({
				kind: "detail",
				title: "File Context help",
				lines: [
					"Add file quote opens the project browser. Select a file, preview it, and press Enter to attach the selected line or range.",
					"Pending quotes are attached in order to your next prompt, then cleared together.",
					"Use Remove pending quote to preview and remove exact snapshots without changing the others.",
					"The configured shortcut and /file-context browse open the browser directly.",
					"Escape goes back. Ctrl+C closes File Context. Cancelling never changes pending quotes.",
				],
				hint: "back",
			}),
		},
		actions: {
			add: () => {
				addRequested = true;
				return { kind: "close" };
			},
			remove: async ({ itemId, signal }) => {
				const result = await options.removeQuote(itemId, signal);
				if (signal.aborted || !options.isCurrent()) return { kind: "close" };
				if (result.kind === "missing") {
					ctx.ui.notify("That quote is no longer pending. The list was refreshed.", "warning");
					return { kind: "stay" };
				}
				ctx.ui.notify(
					`Removed pending quote: ${safeTerminalText(result.quote.path)} · lines ${result.quote.startLine}-${result.quote.endLine}.`,
					"info",
				);
				return result.remaining === 0 ? { kind: "back" } : { kind: "stay" };
			},
		},
	});

	while (options.isCurrent() && !options.signal.aborted) {
		addRequested = false;
		const result = await runMenu(ctx, menu, {
			getState: () => options.getState(),
			signal: options.signal,
			isCurrent: options.isCurrent,
			onError: (_menuContext, error) => {
				ctx.ui.notify(
					`File Context menu failed: ${safeTerminalText(formatError(error))}. Pending quotes were kept; try again.`,
					"error",
				);
			},
			onUnsupportedMode: (_menuContext, mode) => {
				ctx.ui.notify(`File Context is unavailable in ${mode} mode.`, "warning");
			},
		});
		if (!addRequested || result.kind !== "closed") return result;
		const addResult = await options.addQuote(options.signal);
		if (!options.isCurrent() || options.signal.aborted) return { kind: "stale" };
		if (addResult === "close") return { kind: "closed", reason: "close" };
	}
	return { kind: "stale" };
}

function addDisabledReason(state: FileContextMenuState): string | undefined {
	if (state.quotes.length >= state.maximumQuotes) {
		return `The ${state.maximumQuotes}-quote limit is reached; remove a quote first`;
	}
	if (state.totalBytes >= state.maximumBytes) {
		return `The ${formatBytes(state.maximumBytes)} pending limit is reached; remove a quote first`;
	}
	return undefined;
}

function formatShortcut(shortcut: string | null): string {
	return shortcut ? shortcut.toUpperCase() : "Disabled (use /file-context browse)";
}

function singleLinePreview(text: string): string {
	const normalized = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n").join(" ↵ ");
	const characters = [...normalized];
	if (characters.length === 0) return "(empty)";
	return characters.length <= 200 ? normalized : `${characters.slice(0, 199).join("")}…`;
}

function estimateTokens(bytes: number): number {
	return bytes === 0 ? 0 : Math.max(1, Math.ceil(bytes / 4));
}

function formatBytes(bytes: number): string {
	return bytes % 1_000 === 0 ? `${bytes / 1_000} KB` : `${bytes} bytes`;
}

function safeTerminalText(text: string): string {
	return [...text]
		.map((character) => {
			const code = character.charCodeAt(0);
			return code <= 31 || (code >= 127 && code <= 159)
				? `\\x${code.toString(16).padStart(2, "0")}`
				: character;
		})
		.join("");
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
