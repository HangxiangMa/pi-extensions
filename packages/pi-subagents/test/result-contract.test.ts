import assert from "node:assert/strict";
import { test } from "vitest";
import { appendResultInstruction, parseStructuredSubagentResult } from "../src/result-contract.js";

test("structured result contract validates versioned fields and redacts private text", () => {
	const parsed = parseStructuredSubagentResult(
		JSON.stringify({
			version: "pi-subagents:result:v1",
			summary: "safe <private>secret</private>",
			evidence: ["src/a.ts"],
			changes: ["changed"],
			verification: ["npm test"],
			risks: [],
		}),
	);
	assert.deepEqual(parsed, {
		version: "pi-subagents:result:v1",
		summary: "safe [private content omitted]",
		evidence: ["src/a.ts"],
		changes: ["changed"],
		verification: ["npm test"],
		risks: [],
	});
	assert.equal(parseStructuredSubagentResult('{"summary":"missing version"}'), undefined);
	assert.equal(
		parseStructuredSubagentResult(
			'{"version":"pi-subagents:result:v1","summary":"partial","evidence":[]}',
		),
		undefined,
	);
	assert.equal(parseStructuredSubagentResult("{malformed"), undefined);
	assert.equal(parseStructuredSubagentResult("plain text"), undefined);
	const fenced = parseStructuredSubagentResult(
		'```json\n{"version":"pi-subagents:result:v1","summary":"fenced","evidence":[],"changes":[],"verification":[],"risks":[]}\n```',
	);
	assert.equal(fenced?.summary, "fenced");
});

test("structured result instruction is opt-in and bounded", () => {
	assert.equal(appendResultInstruction("task", "text"), "task");
	const structured = appendResultInstruction("task", "structured-v1");
	assert.match(structured, /pi-subagents:result:v1/);
	assert.ok(Buffer.byteLength(structured, "utf8") <= 50 * 1024);
	const oversized = appendResultInstruction("x".repeat(100 * 1024), "structured-v1");
	assert.match(oversized, /pi-subagents:result:v1/);
	assert.ok(Buffer.byteLength(oversized, "utf8") <= 50 * 1024);
	assert.equal(parseStructuredSubagentResult("x".repeat(50 * 1024 + 1)), undefined);
});
