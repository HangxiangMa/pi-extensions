import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { ReviewFormat } from "../types.js";
import { getLanguageFromPath, highlightCode } from "./syntax-highlighting.js";

export const RPC_DOCUMENT_LINE_WIDTH = 120;
export const RPC_DOCUMENT_PAGE_SIZE = 8;

const TAB_SIZE = 4;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

type DocumentTheme = Pick<Theme, "fg" | "bold">;

export function createDocumentLineCache(theme: DocumentTheme) {
	let cached:
		| {
				content: string;
				formatKind: ReviewFormat["kind"];
				language: string | undefined;
				filePath: string | undefined;
				width: number;
				lines: string[];
		  }
		| undefined;
	return {
		lines(content: string, format: ReviewFormat | undefined, width: number) {
			const identity = documentFormatIdentity(format);
			if (
				cached?.content === content &&
				cached.formatKind === identity.kind &&
				cached.language === identity.language &&
				cached.filePath === identity.filePath &&
				cached.width === width
			) {
				return cached.lines;
			}
			const lines = formatDocumentLines(content, format, width, theme);
			cached = {
				content,
				formatKind: identity.kind,
				language: identity.language,
				filePath: identity.filePath,
				width,
				lines,
			};
			return lines;
		},
		invalidate() {
			cached = undefined;
		},
	};
}

export function formatDocumentLines(
	content: string,
	format: ReviewFormat | undefined,
	width: number,
	theme: DocumentTheme,
): string[] {
	const segments = documentSegments(content, width);
	const resolvedFormat = format ?? { kind: "text" as const };
	if (resolvedFormat.kind === "code") {
		const language =
			resolvedFormat.language ??
			(resolvedFormat.filePath ? getLanguageFromPath(resolvedFormat.filePath) : undefined);
		return segments.map(({ text }) => highlightCode(text, language, theme));
	}
	if (resolvedFormat.kind === "diff") {
		return segments.map(({ source, text }) => {
			if (source.startsWith("@@")) return theme.fg("accent", text);
			if (source.startsWith("+") && !source.startsWith("+++")) {
				return theme.fg("toolDiffAdded", text);
			}
			if (source.startsWith("-") && !source.startsWith("---")) {
				return theme.fg("toolDiffRemoved", text);
			}
			return theme.fg("toolDiffContext", text);
		});
	}
	return segments.map(({ text }) => theme.fg("text", text));
}

export function plainDocumentLines(content: string, width: number): string[] {
	return documentSegments(content, width).map(({ text }) => text);
}

export function documentDialogPages(content: string, width: number, pageSize: number): string[][] {
	const lines = plainDocumentLines(content, width);
	const safePageSize = Math.max(1, Math.floor(pageSize));
	const pages: string[][] = [];
	for (let index = 0; index < lines.length; index += safePageSize) {
		pages.push(lines.slice(index, index + safePageSize));
	}
	return pages.length > 0 ? pages : [[""]];
}

function documentFormatIdentity(format: ReviewFormat | undefined) {
	if (format?.kind === "code") {
		return { kind: format.kind, language: format.language, filePath: format.filePath };
	}
	if (format?.kind === "diff") {
		return { kind: format.kind, language: undefined, filePath: format.filePath };
	}
	return { kind: "text" as const, language: undefined, filePath: undefined };
}

export function sanitizeDocumentText(value: unknown): string {
	const stripped = stripVTControlCharacters(String(value)).replace(/\r\n?/gu, "\n");
	return Array.from(stripped, (character) => {
		if (character === "\n" || character === "\t") return character;
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? " " : character;
	}).join("");
}

function documentSegments(content: string, width: number) {
	const safe = sanitizeDocumentText(content);
	return safe.split("\n").flatMap((line) => {
		const source = expandTabs(line);
		return hardWrapLine(source, width).map((text) => ({ source, text }));
	});
}

function expandTabs(line: string): string {
	let column = 0;
	let result = "";
	for (const { segment } of graphemeSegmenter.segment(line)) {
		if (segment === "\t") {
			const count = TAB_SIZE - (column % TAB_SIZE);
			result += " ".repeat(count);
			column += count;
			continue;
		}
		result += segment;
		column += visibleWidth(segment);
	}
	return result;
}

function hardWrapLine(line: string, width: number): string[] {
	const safeWidth = Math.max(1, width);
	if (line.length === 0) return [""];
	const lines: string[] = [];
	let current = "";
	let currentWidth = 0;
	const flush = () => {
		lines.push(current);
		current = "";
		currentWidth = 0;
	};
	for (const { segment } of graphemeSegmenter.segment(line)) {
		const segmentWidth = visibleWidth(segment);
		if (segmentWidth > safeWidth) {
			if (current.length > 0) flush();
			lines.push("?".repeat(safeWidth));
			continue;
		}
		if (currentWidth + segmentWidth > safeWidth && current.length > 0) flush();
		current += segment;
		currentWidth += segmentWidth;
	}
	if (current.length > 0 || lines.length === 0) lines.push(current);
	return lines;
}
