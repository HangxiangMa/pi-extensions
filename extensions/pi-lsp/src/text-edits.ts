import type { LspPosition, LspTextEdit, WorkspaceEdit } from "./types.js";

export function positionAt(text: string, offset: number): LspPosition {
	const boundedOffset = Math.max(0, Math.min(offset, text.length));
	let line = 0;
	let lineStart = 0;

	for (let index = 0; index < boundedOffset; index += 1) {
		if (text[index] === "\n") {
			line += 1;
			lineStart = index + 1;
		}
	}

	return { line, character: boundedOffset - lineStart };
}

function offsetAt(text: string, position: LspPosition) {
	let line = 0;
	let lineStart = 0;

	for (let index = 0; index < text.length && line < position.line; index += 1) {
		if (text[index] === "\n") {
			line += 1;
			lineStart = index + 1;
		}
	}

	if (line < position.line) return text.length;

	let lineEnd = text.indexOf("\n", lineStart);
	if (lineEnd < 0) lineEnd = text.length;
	return Math.min(lineStart + position.character, lineEnd);
}

export function applyTextEdits(text: string, edits: LspTextEdit[]) {
	let output = text;
	const sortedEdits = [...edits].sort((left, right) => {
		const leftOffset = offsetAt(text, left.range.start);
		const rightOffset = offsetAt(text, right.range.start);
		return rightOffset - leftOffset;
	});

	for (const edit of sortedEdits) {
		const start = offsetAt(output, edit.range.start);
		const end = offsetAt(output, edit.range.end);
		output = `${output.slice(0, start)}${edit.newText}${output.slice(end)}`;
	}

	return output;
}

export function collectWorkspaceEdits(edit: WorkspaceEdit | undefined, uri: string) {
	if (!edit) return [];
	if (edit.documentChanges) {
		return edit.documentChanges.flatMap((change) =>
			change.textDocument?.uri === uri ? (change.edits ?? []) : [],
		);
	}

	return edit.changes?.[uri] ?? [];
}
