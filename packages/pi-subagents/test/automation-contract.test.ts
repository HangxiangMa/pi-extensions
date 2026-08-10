import assert from "node:assert/strict";
import { test } from "vitest";
import {
	AUTOMATION_REQUEST_VERSION,
	MAX_AUTOMATION_TASKS,
	parseAutomationRequest,
	parseWorkflowPlan,
	parseWorkflowPlanPatch,
	WORKFLOW_PLAN_PATCH_VERSION,
	WORKFLOW_PLAN_VERSION,
} from "../src/automation-contract.js";

function request(overrides: Record<string, unknown> = {}) {
	return {
		version: AUTOMATION_REQUEST_VERSION,
		objective: "Implement the requested behavior",
		nonGoals: [],
		requiredInputs: ["repository"],
		acceptanceCriteria: ["Focused tests pass"],
		requiredEvidence: ["test output"],
		authorityCeiling: {
			capabilities: ["implementation", "code-review"],
			tools: ["read", "bash", "edit", "write"],
			readPaths: ["packages/pi-subagents"],
			writePaths: ["packages/pi-subagents"],
			network: "unspecified",
			secrets: "unspecified",
			sideEffectPolicy: "mutating",
		},
		aggregateBudget: {
			timeoutMs: 120_000,
			maxTurns: 20,
			maxToolCalls: 40,
			maxTasks: 4,
			maxRevisions: 1,
		},
		constraints: {
			contextPressure: "high",
			maxMutatingWidth: 2,
			requireVerification: true,
			workspaceMode: "shared",
		},
		...overrides,
	};
}

function task(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		objective: `Complete ${id}`,
		dependsOn: [],
		inputArtifacts: [],
		producesArtifacts: [],
		sideEffectPolicy: "read-only",
		readPaths: ["packages/pi-subagents"],
		writePaths: [],
		ownershipKeys: [],
		requiredCapabilities: [],
		requiredTools: ["read"],
		acceptanceCriteria: ["Evidence is grounded"],
		requiredEvidence: ["path evidence"],
		integrationOwner: false,
		budget: { timeoutMs: 30_000, maxTurns: 4, maxToolCalls: 8 },
		...overrides,
	};
}

function plan(tasks: unknown[] = [task("inspect")], overrides: Record<string, unknown> = {}) {
	return {
		version: WORKFLOW_PLAN_VERSION,
		requestVersion: AUTOMATION_REQUEST_VERSION,
		summary: "Smallest useful workflow",
		missingInputs: [],
		risks: [],
		tasks,
		...overrides,
	};
}

test("automation request parser normalizes a strict bounded request", () => {
	const parsed = parseAutomationRequest(request());
	assert.equal(parsed.objective, "Implement the requested behavior");
	assert.equal(parsed.aggregateBudget.maxTasks, 4);
	assert.equal(parsed.authorityCeiling.sideEffectPolicy, "mutating");
	assert.throws(() => parseAutomationRequest({ ...request(), future: true }), /unknown field/i);
	assert.throws(() => parseAutomationRequest({ ...request(), version: "v2" }), /unsupported/i);
	assert.throws(
		() =>
			parseAutomationRequest({
				...request(),
				authorityCeiling: { ...request().authorityCeiling, secrets: "denied" },
			}),
		/unsupported.*secrets/i,
	);
});

test("workflow plan parser rejects malformed JSON and unsupported versions", () => {
	assert.throws(() => parseWorkflowPlan("{"), /invalid json/i);
	assert.throws(() => parseWorkflowPlan(plan([], { version: "workflow-plan:v2" })), /unsupported/i);
});

test("workflow plan parser rejects missing, duplicate, cyclic, and excessive tasks", () => {
	assert.throws(() => parseWorkflowPlan(plan([])), /at least one task/i);
	assert.throws(() => parseWorkflowPlan(plan([task("same"), task("same")])), /duplicate/i);
	assert.throws(
		() =>
			parseWorkflowPlan(plan([task("a", { dependsOn: ["b"] }), task("b", { dependsOn: ["a"] })])),
		/cycle/i,
	);
	assert.throws(
		() =>
			parseWorkflowPlan(
				plan(Array.from({ length: MAX_AUTOMATION_TASKS + 1 }, (_, index) => task(`t-${index}`))),
			),
		/too many tasks/i,
	);
});

test("workflow plan parser rejects oversized text, unsafe paths, and controls", () => {
	assert.throws(
		() => parseWorkflowPlan(plan([task("large", { objective: "x".repeat(17 * 1024) })])),
		/too large/i,
	);
	for (const path of ["/etc/passwd", "../outside", "packages/../outside", "bad\0path"]) {
		assert.throws(() => parseWorkflowPlan(plan([task("unsafe", { readPaths: [path] })])), /path/i);
	}
	assert.throws(
		() => parseWorkflowPlan(plan([task("control", { objective: "unsafe\u001b[31m" })])),
		/terminal control/i,
	);
	assert.throws(
		() => parseWorkflowPlan(plan([task("private", { objective: "<private>secret</private>" })])),
		/private data/i,
	);
});

test("workflow plan parser rejects conflicting ownership and unsupported guarantees", () => {
	assert.throws(
		() =>
			parseWorkflowPlan(
				plan([task("a", { ownershipKeys: ["shared"] }), task("b", { ownershipKeys: ["shared"] })]),
			),
		/ownership/i,
	);
	assert.throws(
		() => parseWorkflowPlan(plan([task("network", { guarantees: { network: "denied" } })])),
		/unsupported guarantee/i,
	);
});

test("workflow plan and patch reject executor-owned identities and forged generations", () => {
	assert.throws(() => parseWorkflowPlan(plan(undefined, { planId: "forged" })), /executor-owned/i);
	const patch = {
		version: WORKFLOW_PLAN_PATCH_VERSION,
		planId: "a".repeat(64),
		workflowGeneration: 3,
		reason: "Assumption changed",
		operations: [{ type: "cancel-task", taskId: "inspect" }],
	};
	assert.equal(parseWorkflowPlanPatch(patch).workflowGeneration, 3);
	assert.throws(() => parseWorkflowPlanPatch({ ...patch, workflowGeneration: -1 }), /generation/i);
	assert.throws(
		() => parseWorkflowPlanPatch({ ...patch, executionPlanId: "forged" }),
		/unknown field/i,
	);
	assert.throws(
		() =>
			parseWorkflowPlanPatch({
				...patch,
				operations: [{ type: "add-task", task: task("unsafe-patch", { readPaths: ["/outside"] }) }],
			}),
		/path/i,
	);
});
