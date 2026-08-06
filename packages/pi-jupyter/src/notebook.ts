import { constants } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Image, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { decodePng, renderPngThumbnail } from "./png-thumbnail.js";

export const MAX_NOTEBOOK_BYTES = 10 * 1024 * 1024;

export type NotebookCell = {
	cell_type?: string;
	execution_count?: number | null;
	source?: string | string[];
	outputs?: Array<Record<string, unknown>>;
};

export type Notebook = {
	cells?: NotebookCell[];
	metadata?: Record<string, unknown>;
	nbformat?: number;
	nbformat_minor?: number;
};

export type LoadedNotebook = {
	model: Notebook;
	lastMtime: Date;
	lastLoadedAt: Date;
};

export type NotebookRenderState = Partial<LoadedNotebook> & {
	model?: Notebook;
};

export async function loadNotebook(path: string, signal?: AbortSignal): Promise<LoadedNotebook> {
	signal?.throwIfAborted();
	const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
	try {
		signal?.throwIfAborted();
		const info = await file.stat();
		if (!info.isFile()) throw new Error("notebook path is not a regular file");
		if (info.size > MAX_NOTEBOOK_BYTES) {
			throw new Error(`notebook exceeds the ${MAX_NOTEBOOK_BYTES / 1024 / 1024} MB preview limit`);
		}
		const model = JSON.parse(await readBoundedUtf8(file, signal)) as Notebook;
		validateNotebook(model);
		return { model, lastMtime: info.mtime, lastLoadedAt: new Date() };
	} finally {
		await file.close();
	}
}

async function readBoundedUtf8(file: FileHandle, signal?: AbortSignal): Promise<string> {
	const chunks: Buffer[] = [];
	let total = 0;
	while (total <= MAX_NOTEBOOK_BYTES) {
		signal?.throwIfAborted();
		const buffer = Buffer.alloc(Math.min(64 * 1024, MAX_NOTEBOOK_BYTES + 1 - total));
		const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
		if (bytesRead === 0) break;
		chunks.push(buffer.subarray(0, bytesRead));
		total += bytesRead;
	}
	if (total > MAX_NOTEBOOK_BYTES) {
		throw new Error(`notebook exceeds the ${MAX_NOTEBOOK_BYTES / 1024 / 1024} MB preview limit`);
	}
	return Buffer.concat(chunks, total).toString("utf8");
}

function validateNotebook(value: unknown): asserts value is Notebook {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("notebook root must be an object");
	}
	const notebook = value as Notebook;
	if (notebook.cells !== undefined && !Array.isArray(notebook.cells)) {
		throw new Error("notebook cells must be an array");
	}
}

export function renderNotebookBody(
	state: NotebookRenderState,
	width: number,
	theme: Theme,
): string[] {
	const notebook = state.model;
	if (!notebook) return [];
	const cells = Array.isArray(notebook.cells) ? notebook.cells : [];
	const dim = (text: string) => theme.fg("dim", text);
	const accent = (text: string) => theme.fg("accent", text);
	const success = (text: string) => theme.fg("success", text);
	const warning = (text: string) => theme.fg("warning", text);
	const error = (text: string) => theme.fg("error", text);
	const loaded = state.lastLoadedAt?.toLocaleTimeString() ?? "unknown";
	const mtime = state.lastMtime?.toLocaleTimeString() ?? "unknown";
	const lines = [
		` ${success("✓")} ${cells.length} cells ${dim(`loaded ${loaded}, mtime ${mtime}`)}`,
		"",
	];

	cells.forEach((cell, index) => {
		const type = sanitizeTerminalText(cell.cell_type ?? "unknown");
		const execution = cell.execution_count == null ? "" : ` In [${cell.execution_count}]`;
		const color = type === "markdown" ? accent : type === "code" ? success : warning;
		lines.push(color(` ${index + 1}. ${type}${execution}`));

		const source = sanitizeTerminalText(normalizeSource(cell.source)).trimEnd();
		const sourceLines = source.length > 0 ? source.split("\n") : [dim("(empty)")];
		for (const line of sourceLines.slice(0, 12)) lines.push(...wrapBoxLines(`   ${line}`, width));
		if (sourceLines.length > 12)
			lines.push(dim(`   … ${sourceLines.length - 12} more source lines`));

		if (type === "code" && Array.isArray(cell.outputs) && cell.outputs.length > 0) {
			const outputLines = renderOutputs(cell.outputs, width, theme);
			if (outputLines.length > 0) {
				lines.push(dim("   output:"));
				for (const outputLine of outputLines.slice(0, 24)) {
					const styled = outputLine.startsWith("Error:") ? error(outputLine) : outputLine;
					lines.push(...wrapBoxLines(`     ${styled}`, width));
				}
				if (outputLines.length > 24) {
					lines.push(dim(`     … ${outputLines.length - 24} more output lines`));
				}
			}
		}
		lines.push("");
	});
	return lines;
}

function renderOutputs(
	outputs: Array<Record<string, unknown>>,
	width: number,
	theme: Theme,
): string[] {
	const lines: string[] = [];
	const dim = (text: string) => theme.fg("dim", text);
	for (const output of outputs) {
		const outputType = sanitizeTerminalText(String(output.output_type ?? "output"));
		if (outputType === "stream") {
			lines.push(
				...sanitizeTerminalText(normalizeSource(output.text as string | string[] | undefined))
					.split("\n")
					.filter(Boolean)
					.map(dim),
			);
			continue;
		}
		if (outputType === "error") {
			const name = sanitizeTerminalText(String(output.ename ?? "Error"));
			const value = sanitizeTerminalText(String(output.evalue ?? ""));
			lines.push(`Error: ${name}${value ? `: ${value}` : ""}`);
			continue;
		}

		const data = output.data as Record<string, unknown> | undefined;
		if (data) {
			const imageMime = Object.keys(data).find((key) => key.startsWith("image/"));
			if (imageMime) {
				lines.push(dim(`${sanitizeTerminalText(imageMime)}:`));
				lines.push(
					...renderInlineImage(
						normalizeSource(data[imageMime] as string | string[]),
						imageMime,
						width,
						theme,
					),
				);
			}
			const text = data["text/plain"] ?? data["text/markdown"];
			if (typeof text === "string" || Array.isArray(text)) {
				lines.push(
					...sanitizeTerminalText(normalizeSource(text as string | string[]))
						.split("\n")
						.filter(Boolean)
						.map(dim),
				);
			}
			if (imageMime || typeof text === "string" || Array.isArray(text)) continue;
		}
		lines.push(dim(`[${outputType}]`));
	}
	return lines;
}

function renderInlineImage(
	base64Data: string,
	mimeType: string,
	width: number,
	theme: Theme,
): string[] {
	const cleanBase64 = base64Data.replace(/\s+/g, "");
	if (!cleanBase64) return [theme.fg("warning", `[empty ${mimeType} output]`)];
	if (mimeType === "image/png") {
		try {
			return renderPngThumbnail(decodePng(cleanBase64), Math.max(8, Math.min(60, width - 8)), 16);
		} catch (cause) {
			return [theme.fg("warning", `[${mimeType} thumbnail failed: ${errorMessage(cause)}]`)];
		}
	}
	try {
		const image = new Image(
			cleanBase64,
			mimeType,
			{ fallbackColor: (text: string) => theme.fg("muted", text) },
			{ maxWidthCells: Math.max(8, Math.min(60, width - 8)), maxHeightCells: 16 },
		);
		return image.render(Math.max(10, width - 8));
	} catch (cause) {
		return [theme.fg("warning", `[${mimeType} output: ${errorMessage(cause)}]`)];
	}
}

export function sanitizeTerminalText(text: string): string {
	let sanitized = "";
	for (const character of text) {
		const code = character.codePointAt(0) ?? 0;
		const isUnsafe =
			(code < 0x20 && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f);
		sanitized += isUnsafe ? `\\x${code.toString(16).padStart(2, "0")}` : character;
	}
	return sanitized;
}

function errorMessage(cause: unknown): string {
	return sanitizeTerminalText(cause instanceof Error ? cause.message : String(cause));
}

function normalizeSource(source: string | string[] | undefined): string {
	if (Array.isArray(source)) return source.join("");
	return typeof source === "string" ? source : "";
}

export function wrapBoxLines(text: string, width: number): string[] {
	const max = Math.max(1, width - 1);
	return wrapTextWithAnsi(text, max).map((line) => {
		if (visibleWidth(line) <= max) return line;
		return truncateToWidth(line, max, "…", true);
	});
}
