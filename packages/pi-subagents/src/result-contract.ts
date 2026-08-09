import { redactPrivateText } from "./context.js";
import { DEFAULT_MAX_OUTPUT_BYTES, truncateUtf8 } from "./limits.js";

export const SUBAGENT_RESULT_FORMATS = ["text", "structured-v1"] as const;
export type SubagentResultFormat = (typeof SUBAGENT_RESULT_FORMATS)[number];

export interface StructuredSubagentResult {
	version: "pi-subagents:result:v1";
	summary: string;
	evidence: string[];
	changes: string[];
	verification: string[];
	risks: string[];
}

const MAX_FIELD_BYTES = 8 * 1024;
const MAX_ITEMS = 50;

export function structuredResultInstruction(format: SubagentResultFormat | undefined): string {
	if (format !== "structured-v1") return "";
	return [
		"Return the final answer as one JSON object and no surrounding prose.",
		'Use exactly version "pi-subagents:result:v1" and fields summary, evidence, changes, verification, and risks.',
		"summary must be a string and the other fields must be arrays of strings.",
	].join(" ");
}

export function appendResultInstruction(
	prompt: string,
	format: SubagentResultFormat | undefined,
	maxBytes = DEFAULT_MAX_OUTPUT_BYTES,
): string {
	const instruction = structuredResultInstruction(format);
	if (!instruction) return prompt;
	const suffix = `\n\nResult contract:\n${instruction}`;
	const suffixBytes = Buffer.byteLength(suffix, "utf8");
	const boundedPrompt = truncateUtf8(prompt, Math.max(0, maxBytes - suffixBytes)).text;
	return `${boundedPrompt}${suffix}`;
}

export function parseStructuredSubagentResult(text: string): StructuredSubagentResult | undefined {
	if (Buffer.byteLength(text, "utf8") > DEFAULT_MAX_OUTPUT_BYTES) return undefined;
	const source = unwrapJsonFence(text).trim();
	if (!source.startsWith("{") || !source.endsWith("}")) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
	const value = parsed as Record<string, unknown>;
	if (value.version !== "pi-subagents:result:v1" || typeof value.summary !== "string") {
		return undefined;
	}
	const evidence = stringArray(value.evidence);
	const changes = stringArray(value.changes);
	const verification = stringArray(value.verification);
	const risks = stringArray(value.risks);
	if (!evidence || !changes || !verification || !risks) return undefined;
	return {
		version: "pi-subagents:result:v1",
		summary: bounded(value.summary),
		evidence,
		changes,
		verification,
		risks,
	};
}

function stringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value) || value.length > MAX_ITEMS) return undefined;
	if (!value.every((item) => typeof item === "string")) return undefined;
	return value.map((item) => bounded(item));
}

function bounded(value: string): string {
	return truncateUtf8(redactPrivateText(value), MAX_FIELD_BYTES).text;
}

function unwrapJsonFence(value: string): string {
	const trimmed = value.trim();
	const match = /^```(?:json)?\s*\n([\s\S]*?)\n```$/iu.exec(trimmed);
	return match?.[1] ?? trimmed;
}
