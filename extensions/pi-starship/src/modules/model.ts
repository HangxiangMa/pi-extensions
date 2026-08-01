import { defineModule } from "./types.js";

const TRUNCATION_DIRECTIONS = ["start", "middle", "end"] as const;
type TruncationDirection = (typeof TRUNCATION_DIRECTIONS)[number];
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export const modelModule = defineModule({
	name: "model",
	variables: ["symbol", "model"],
	defaults: {
		format: "[$symbol $model ]($style)",
		symbol: "🤖",
		style: "bold blue",
		disabled: false,
	},
	options: {
		truncation_length: { kind: "integer", default: 0, minimum: 0, maximum: 1000 },
		truncation_symbol: { kind: "string", default: "…" },
		truncation_direction: {
			kind: "string-enum",
			default: "end",
			values: TRUNCATION_DIRECTIONS,
		},
	},
	values: ({ runtime, options }) => {
		if (!runtime.model) return undefined;
		const length = typeof options.truncation_length === "number" ? options.truncation_length : 0;
		const symbol = typeof options.truncation_symbol === "string" ? options.truncation_symbol : "…";
		const direction = isTruncationDirection(options.truncation_direction)
			? options.truncation_direction
			: "end";
		return {
			model: truncateModel(shortenModel(runtime.model.id), length, symbol, direction),
		};
	},
});

export function truncateModel(
	model: string,
	length: number,
	symbol: string,
	direction: TruncationDirection,
): string {
	const safeModel = sanitizeModelDisplay(model);
	if (length === 0) return safeModel;
	const graphemes = [...graphemeSegmenter.segment(safeModel)].map(({ segment }) => segment);
	if (graphemes.length <= length) return safeModel;
	const safeSymbol = sanitizeModelDisplay(symbol);

	switch (direction) {
		case "start":
			return `${safeSymbol}${graphemes.slice(-length).join("")}`;
		case "middle": {
			const headLength = Math.ceil(length / 2);
			const tailLength = Math.floor(length / 2);
			const tail = tailLength > 0 ? graphemes.slice(-tailLength).join("") : "";
			return `${graphemes.slice(0, headLength).join("")}${safeSymbol}${tail}`;
		}
		case "end":
			return `${graphemes.slice(0, length).join("")}${safeSymbol}`;
	}
}

function sanitizeModelDisplay(value: string): string {
	let result = "";
	for (let index = 0; index < value.length; ) {
		const codePoint = value.codePointAt(index) ?? 0;
		const character = String.fromCodePoint(codePoint);
		if (codePoint === 0x1b || codePoint === 0x9b || codePoint === 0x9d) {
			index = skipTerminalEscape(value, index, codePoint);
			continue;
		}
		if (
			codePoint <= 0x1f ||
			(codePoint >= 0x7f && codePoint <= 0x9f) ||
			codePoint === 0x2028 ||
			codePoint === 0x2029
		) {
			if (
				codePoint === 0x09 ||
				codePoint === 0x0a ||
				codePoint === 0x0d ||
				codePoint === 0x85 ||
				codePoint === 0x2028 ||
				codePoint === 0x2029
			) {
				result += " ";
			}
			index += character.length;
			continue;
		}
		result += character;
		index += character.length;
	}
	return result;
}

function skipTerminalEscape(value: string, start: number, codePoint: number): number {
	let index = start + 1;
	const next = value.charCodeAt(index);
	const isOsc = codePoint === 0x9d || (codePoint === 0x1b && next === 0x5d);
	if (isOsc) {
		if (codePoint === 0x1b) index += 1;
		while (index < value.length) {
			const current = value.charCodeAt(index);
			if (current === 0x07 || current === 0x9c) return index + 1;
			if (current === 0x1b && value.charCodeAt(index + 1) === 0x5c) return index + 2;
			index += 1;
		}
		return index;
	}
	const isCsi = codePoint === 0x9b || (codePoint === 0x1b && next === 0x5b);
	if (isCsi) {
		if (codePoint === 0x1b) index += 1;
		while (index < value.length) {
			const current = value.charCodeAt(index);
			index += 1;
			if (current >= 0x40 && current <= 0x7e) break;
		}
		return index;
	}
	return Math.min(value.length, start + (codePoint === 0x1b ? 2 : 1));
}

function isTruncationDirection(value: unknown): value is TruncationDirection {
	return TRUNCATION_DIRECTIONS.includes(value as TruncationDirection);
}

export function shortenModel(model: string): string {
	return model
		.replace(/^claude-/u, "")
		.replace(/^gpt-/u, "gpt ")
		.replace(/-20\d{6}$/u, "")
		.replace(/-latest$/u, "");
}
