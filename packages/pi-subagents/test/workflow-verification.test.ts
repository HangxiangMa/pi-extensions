import assert from "node:assert/strict";
import { test } from "vitest";
import type { StructuredSubagentResultV2 } from "../src/result-contract.js";
import type { WorkflowTreeIdentity } from "../src/workflow-tree-identity.js";
import {
	createWorkflowVerificationReceipt,
	isWorkflowVerificationReceipt,
	workflowVerificationInstruction,
} from "../src/workflow-verification.js";

const planA = "a".repeat(64);
const planB = "b".repeat(64);
const tree: WorkflowTreeIdentity = {
	version: "pi-subagents:workflow-tree:v1",
	kind: "git-dirty",
	digest: "c".repeat(64),
};

function result(overrides: Partial<StructuredSubagentResultV2> = {}): StructuredSubagentResultV2 {
	return {
		version: "pi-subagents:result:v2",
		status: "completed",
		reasonCode: "verification-accepted",
		summary: "Verified the current tree",
		claims: [{ claim: "Behavior matches", classification: "observed", evidence: ["test output"] }],
		artifacts: [],
		changes: [],
		verification: [{ status: "passed", summary: "Focused test passed" }],
		limitations: [],
		unresolvedDependencies: [],
		...overrides,
	};
}

const context = {
	targetTaskId: "implementation",
	targetTaskGeneration: 2,
	targetExecutionPlanId: planA,
	verifierTaskId: "verification",
	verifierTaskGeneration: 1,
	verifierExecutionPlanId: planB,
	treeIdentity: tree,
	createdAt: 123,
};

test("workflow verification creates executor-owned accept, rework, and reject receipts", () => {
	const accepted = createWorkflowVerificationReceipt(result(), context);
	assert.equal(accepted.decision, "accept");
	assert.equal(accepted.targetTaskId, "implementation");
	assert.equal(accepted.targetExecutionPlanId, planA);
	assert.equal(accepted.treeIdentity.digest, tree.digest);
	assert.deepEqual(accepted.evidence, ["test output", "Focused test passed"]);

	const rework = createWorkflowVerificationReceipt(
		result({
			status: "partial",
			reasonCode: "verification-rework",
			verification: [{ status: "failed", summary: "Regression remains" }],
			limitations: ["One regression remains"],
		}),
		context,
	);
	assert.equal(rework.decision, "rework");

	const rejected = createWorkflowVerificationReceipt(
		result({
			status: "failed",
			reasonCode: "verification-rejected",
			verification: [{ status: "failed", summary: "Acceptance test failed" }],
		}),
		context,
	);
	assert.equal(rejected.decision, "reject");
});

test("workflow verification rejects malformed, contradictory, and forged verdicts", () => {
	assert.throws(
		() => createWorkflowVerificationReceipt(result({ reasonCode: "looks-good" }), context),
		/verdict/i,
	);
	assert.throws(
		() =>
			createWorkflowVerificationReceipt(
				result({ verification: [{ status: "failed", summary: "failed" }] }),
				context,
			),
		/accept.*failed/i,
	);
	assert.throws(
		() =>
			createWorkflowVerificationReceipt(
				result({ status: "partial", reasonCode: "verification-rework", limitations: [] }),
				context,
			),
		/rework.*limitation|rework.*dependency/i,
	);
	assert.throws(
		() =>
			createWorkflowVerificationReceipt(
				result({
					status: "failed",
					reasonCode: "verification-rejected",
					claims: [],
					verification: [],
				}),
				context,
			),
		/reject.*evidence/i,
	);
	assert.throws(
		() => createWorkflowVerificationReceipt(result(), { ...context, targetExecutionPlanId: "bad" }),
		/execution plan/i,
	);

	const forged = createWorkflowVerificationReceipt(
		result({
			provenance: {
				taskId: "forged",
				taskGeneration: 999,
				executionPlanId: "f".repeat(64),
			},
		}),
		context,
	);
	assert.equal(forged.targetTaskId, context.targetTaskId);
	assert.equal(forged.targetTaskGeneration, context.targetTaskGeneration);
	assert.equal(forged.verifierExecutionPlanId, context.verifierExecutionPlanId);
	assert.equal(isWorkflowVerificationReceipt({ ...forged, unknown: true }), false);
	assert.equal(
		isWorkflowVerificationReceipt({ ...forged, decision: "rework", limitations: [] }),
		false,
	);
});

test("workflow verification bounds private evidence and emits one exact verdict instruction", () => {
	const receipt = createWorkflowVerificationReceipt(
		result({
			summary: `Visible <private>secret</private> ${"x".repeat(20_000)}`,
			claims: [
				{
					claim: "claim",
					classification: "observed",
					evidence: ["visible <private>secret</private>"],
				},
			],
		}),
		context,
	);
	assert.doesNotMatch(JSON.stringify(receipt), /secret/);
	assert.ok(Buffer.byteLength(receipt.summary, "utf8") <= 8 * 1024);
	const instruction = workflowVerificationInstruction("implementation", tree, {
		acceptanceCriteria: ["tests pass <private>secret</private>"],
		requiredEvidence: ["test receipt"],
	});
	assert.match(instruction, /verification-accepted/);
	assert.match(instruction, new RegExp(tree.digest));
	assert.match(instruction, /tests pass \[private content omitted\]/);
	assert.match(instruction, /test receipt/);
	assert.doesNotMatch(instruction, /secret/);
});
