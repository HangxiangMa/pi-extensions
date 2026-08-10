import assert from "node:assert/strict";
import { test } from "vitest";
import {
	isCapabilityGrant,
	isCapabilityGrantActive,
	issueCapabilityGrant,
	revokeCapabilityGrant,
} from "../src/capability-grant.js";
import { createExecutionPlan } from "../src/execution-plan.js";

const plan = createExecutionPlan({
	agent: {
		name: "scout",
		description: "scout",
		systemPrompt: "",
		source: "built-in",
		filePath: "built-in:scout",
		tools: ["read"],
	},
	effectiveTools: ["read"],
	target: {
		cwd: "/workspace",
		boundary: "current-workspace",
		trust: { kind: "session-trusted", projectTrusted: true },
	},
	workspaceMode: "shared",
	transport: "subprocess",
	resultFormat: "text",
	taskGeneration: 2,
});

test("capability grants bind effective authority to one accepted plan generation", () => {
	const grant = issueCapabilityGrant(plan, 100, 1_000);
	assert.equal(grant.executionPlanId, plan.id);
	assert.equal(grant.taskGeneration, 2);
	assert.deepEqual(grant.effectiveTools, ["read"]);
	assert.equal(grant.state, "active");
	const revoked = revokeCapabilityGrant(grant, "parent-aborted", 200);
	assert.equal(grant.state, "revoked");
	assert.equal(revoked.state, "revoked");
	assert.equal(isCapabilityGrant({ ...revoked, state: "active" }), false);
	assert.equal(revoked.revocationReason, "parent-aborted");
	assert.throws(() => revokeCapabilityGrant(revoked, "again", 300), /already revoked/i);
});

test("capability grant validation rejects authority tampering and plan mismatch", () => {
	const grant = issueCapabilityGrant(plan, 100, 1_000);
	assert.equal(isCapabilityGrantActive(grant, plan, 99), false);
	assert.equal(isCapabilityGrantActive(grant, plan, 200), true);
	const widened = { ...grant, effectiveTools: ["read", "bash"] };
	assert.equal(isCapabilityGrant(widened), false);
	assert.equal(isCapabilityGrantActive(widened, plan, 200), false);
});
