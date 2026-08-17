import assert from "node:assert/strict";
import { test } from "vitest";
import {
	appendResultInstruction,
	parseStructuredSubagentResult,
	parseStructuredSubagentResultV2,
	resultContractEnvelope,
	structuredResultInstruction,
} from "../src/result-contract.js";

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
	assert.equal(
		parseStructuredSubagentResult(
			'{"version":"pi-subagents:result:v1","summary":"x","evidence":[],"changes":[],"verification":[],"risks":[],"unknown":true}',
		),
		undefined,
	);
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
	const oversizedV2 = appendResultInstruction("界".repeat(100 * 1024), "structured-v2");
	assert.match(oversizedV2, /Minimum valid result:/u);
	assert.ok(Buffer.byteLength(oversizedV2, "utf8") <= 50 * 1024);
	assert.equal(parseStructuredSubagentResult("x".repeat(50 * 1024 + 1)), undefined);
});

test("structured v2 instruction provides a complete parseable result shape", () => {
	const instruction = structuredResultInstruction("structured-v2");
	const example = /Minimum valid result:\n(\{[^\n]+\})/u.exec(instruction)?.[1];
	assert.ok(example);
	assert.deepEqual(parseStructuredSubagentResultV2(example), {
		version: "pi-subagents:result:v2",
		status: "completed",
		summary: "Concise outcome",
		claims: [],
		artifacts: [],
		changes: [],
		verification: [],
		limitations: [],
		unresolvedDependencies: [],
	});
	assert.match(instruction, /Claim item shape: \{"claim":/u);
	assert.match(instruction, /Artifact item shape: \{"id":/u);
	assert.match(instruction, /Change item shape: \{"path":/u);
	assert.match(instruction, /Verification item shape: \{"status":/u);
});

test("structured v2 result preserves evidence provenance and actionable outcomes", () => {
	const parsed = parseStructuredSubagentResultV2(
		JSON.stringify({
			version: "pi-subagents:result:v2",
			status: "needs-input",
			reasonCode: "missing-dependency",
			summary: "Need the API schema",
			claims: [
				{
					claim: "The current type is incomplete",
					classification: "observed",
					evidence: ["src/api.ts:10"],
				},
			],
			artifacts: [{ id: "schema", kind: "document", version: "v3" }],
			changes: [{ path: "src/api.ts", summary: "No change <private>secret</private>" }],
			verification: [{ status: "not-run", summary: "Blocked on schema" }],
			limitations: ["Schema unavailable"],
			unresolvedDependencies: ["schema-v4"],
			provenance: { taskId: "task-1", inputArtifacts: ["schema@v3"] },
		}),
	);
	assert.equal(parsed?.status, "needs-input");
	assert.equal(parsed?.claims[0]?.classification, "observed");
	assert.equal(parsed?.changes[0]?.summary, "No change [private content omitted]");
	assert.equal(parsed?.provenance?.taskId, "task-1");
});

test("structured v2 result rejects artifact identifiers that would break ledger settlement", () => {
	const result = (
		artifacts: Array<{ id: string; kind: string; version?: string; digest?: string }>,
	) =>
		JSON.stringify({
			version: "pi-subagents:result:v2",
			status: "completed",
			summary: "done",
			claims: [],
			artifacts,
			changes: [],
			verification: [],
			limitations: [],
			unresolvedDependencies: [],
		});
	assert.equal(parseStructuredSubagentResultV2(result([{ id: "", kind: "document" }])), undefined);
	assert.equal(
		parseStructuredSubagentResultV2(result([{ id: "   ", kind: "document" }])),
		undefined,
	);
	assert.equal(
		parseStructuredSubagentResultV2(
			result([
				{ id: "schema", kind: "document" },
				{ id: " schema ", kind: "document" },
			]),
		),
		undefined,
	);
	assert.equal(parseStructuredSubagentResultV2(result([{ id: "schema", kind: "   " }])), undefined);
	assert.equal(
		parseStructuredSubagentResultV2(result([{ id: "schema", kind: "document", version: "   " }])),
		undefined,
	);
	assert.equal(
		parseStructuredSubagentResultV2(result([{ id: "schema", kind: "document", digest: "   " }])),
		undefined,
	);
});

test("structured v2 result rejects malformed or unsupported envelopes", () => {
	assert.equal(
		parseStructuredSubagentResultV2(
			JSON.stringify({
				version: "pi-subagents:result:v2",
				status: "completed",
				summary: "missing arrays",
			}),
		),
		undefined,
	);
	assert.equal(
		parseStructuredSubagentResultV2(
			JSON.stringify({
				version: "pi-subagents:result:v3",
				status: "completed",
				summary: "future",
				claims: [],
				artifacts: [],
				changes: [],
				verification: [],
				limitations: [],
				unresolvedDependencies: [],
			}),
		),
		undefined,
	);
});

test("result contract envelope keeps runtime provenance outside model claims", () => {
	const result = parseStructuredSubagentResultV2(
		JSON.stringify({
			version: "pi-subagents:result:v2",
			status: "completed",
			summary: "done",
			claims: [],
			artifacts: [],
			changes: [],
			verification: [],
			limitations: [],
			unresolvedDependencies: [],
		}),
	);
	assert.ok(result);
	assert.deepEqual(
		resultContractEnvelope(result, {
			truncated: true,
			usage: { input: 10, output: 3, cost: 0.01, turns: 1 },
		}),
		{
			result,
			truncated: true,
			usage: { input: 10, output: 3, cost: 0.01, turns: 1 },
		},
	);
});
