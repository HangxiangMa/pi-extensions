import assert from "node:assert/strict";
import { Check } from "typebox/value";
import { test } from "vitest";
import {
	createVerificationReceipt,
	isVerificationReceipt,
	VerificationReceiptSchema,
} from "../src/verification-receipt.js";

const tree = {
	version: "pi-subagents:workflow-tree:v1" as const,
	kind: "git-dirty" as const,
	digest: "a".repeat(64),
};

const base = {
	decision: "accept" as const,
	targetTaskId: "implementation",
	targetTaskGeneration: 2,
	targetExecutionPlanId: "b".repeat(64),
	verifierTaskId: "verify-implementation",
	verifierTaskGeneration: 1,
	verifierExecutionPlanId: "c".repeat(64),
	verifierAgent: "reviewer",
	beforeTreeIdentity: tree,
	afterTreeIdentity: tree,
	baseRepositoryGeneration: "d".repeat(40),
	patchDigest: "e".repeat(64),
	changedPaths: ["src/feature.ts"],
	allowedScopes: ["src"],
	dependencyVersions: { schema: "v1" },
	readSetVersions: { "src/feature.ts": "v1" },
	acceptanceCriteria: ["feature works"],
	requiredEvidenceIds: ["focused-test"],
	evidence: { "focused-test": "deterministic-check:passed" },
	checks: [
		{
			id: "focused-test",
			command: "node",
			args: ["--test", "test/feature.test.js"],
			cwd: ".",
			status: "passed" as const,
			exitCode: 0,
			stdout: "ok",
			stderr: "",
			durationMs: 12,
			truncated: false,
		},
	],
	summary: "Independent verification accepted the submitted state.",
	findings: ["focused test passed"],
	createdAt: 123,
	sourceTruncated: false,
};

test("verification receipt schema accepts only the bounded executor-owned v1 shape", () => {
	const receipt = createVerificationReceipt(base);
	assert.equal(receipt.version, "pi-subagents:verification-receipt:v1");
	assert.equal(isVerificationReceipt(receipt), true);
	assert.equal(Check(VerificationReceiptSchema, receipt), true);
	assert.equal(isVerificationReceipt({ ...receipt, unknown: true }), false);
	assert.equal(Check(VerificationReceiptSchema, { ...receipt, unknown: true }), false);
	assert.equal(isVerificationReceipt({ ...receipt, patchDigest: "forged" }), false);
	assert.equal(
		isVerificationReceipt({
			...receipt,
			afterTreeIdentity: { ...tree, digest: "f".repeat(64) },
		}),
		false,
	);
});

test("verification receipt construction binds rework findings and required current evidence", () => {
	assert.throws(
		() => createVerificationReceipt({ ...base, evidence: {} }),
		/missing required evidence/i,
	);
	assert.throws(
		() =>
			createVerificationReceipt({
				...base,
				decision: "rework",
				findings: [],
			}),
		/rework.*finding/i,
	);
	assert.throws(
		() =>
			createVerificationReceipt({
				...base,
				checks: [{ ...base.checks[0], status: "failed", exitCode: 1 }],
			}),
		/accept.*failed check/i,
	);
	const oversizedChecks = Array.from({ length: 4 }, (_, index) => ({
		...base.checks[0],
		id: `check-${index}`,
		stdout: "x".repeat(2 * 1024),
		stderr: "y".repeat(2 * 1024),
	}));
	assert.throws(
		() => createVerificationReceipt({ ...base, checks: oversizedChecks }),
		/total size limit/i,
	);
});
