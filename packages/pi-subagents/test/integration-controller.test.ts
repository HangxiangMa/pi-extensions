import assert from "node:assert/strict";
import { test } from "vitest";
import { verifyManagedIntegration } from "../src/integration-controller.js";

const expected = {
	taskId: "integrate",
	taskGeneration: 3,
	baseRepositoryGeneration: "base-1",
	dependencyVersions: { schema: "v2" },
	readSetVersions: { "src/a.ts": "digest-a" },
	executionPlanId: "plan-1",
	allowedScopes: ["src/a.ts"],
	patchDigest: "patch-1",
	requiredEvidence: ["tests"],
};

const candidate = {
	...expected,
	changedPaths: ["src/a.ts"],
	evidence: { tests: "passed:test-id" },
	verifier: { freshContext: true, exactIntegratedTree: true, status: "accepted" as const },
};

test("managed integration accepts only exact current inputs and fresh verification", () => {
	assert.deepEqual(verifyManagedIntegration(expected, candidate), {
		status: "accepted",
		taskId: "integrate",
		taskGeneration: 3,
		patchDigest: "patch-1",
		executionPlanId: "plan-1",
	});
});

test("managed integration fails closed on stale plans, scope, evidence, or verifier context", () => {
	assert.throws(
		() => verifyManagedIntegration(expected, { ...candidate, executionPlanId: "stale" }),
		/execution plan/i,
	);
	assert.throws(
		() => verifyManagedIntegration(expected, { ...candidate, changedPaths: ["src/other.ts"] }),
		/scope/i,
	);
	assert.throws(
		() => verifyManagedIntegration(expected, { ...candidate, changedPaths: ["src/../outside"] }),
		/scope/i,
	);
	assert.throws(
		() => verifyManagedIntegration(expected, { ...candidate, evidence: {} }),
		/evidence/i,
	);
	assert.throws(
		() =>
			verifyManagedIntegration(expected, {
				...candidate,
				verifier: { ...candidate.verifier, freshContext: false },
			}),
		/fresh.*exact/i,
	);
});
