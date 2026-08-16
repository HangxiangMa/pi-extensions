import assert from "node:assert/strict";
import { test } from "vitest";
import type { AgentConfig } from "../src/agents.js";
import {
	AUTOMATION_REQUEST_VERSION,
	parseAutomationRequest,
	parseWorkflowPlan,
	WORKFLOW_PLAN_VERSION,
} from "../src/automation-contract.js";
import { CAPABILITY_MANIFEST_VERSION } from "../src/capabilities.js";
import { compileWorkflowPlan } from "../src/workflow-plan-compiler.js";

const target = {
	cwd: "/workspace",
	boundary: "current-workspace" as const,
	trust: { kind: "session-trusted" as const, projectTrusted: true },
};

function agent(
	name: string,
	capabilities: string[],
	filesystem: "read" | "write",
	verificationRoles: string[] = [],
): AgentConfig {
	return {
		name,
		description: name,
		tools:
			filesystem === "read" ? ["read", "grep", "find", "ls"] : ["read", "bash", "edit", "write"],
		source: "built-in",
		filePath: `built-in:${name}`,
		systemPrompt: name,
		capabilityManifest: {
			version: CAPABILITY_MANIFEST_VERSION,
			capabilities,
			modalities: ["text"],
			resultFormats: ["text", "structured-v1", "structured-v2"],
			authority: { filesystem },
			verificationRoles,
			contextStrengths: ["repository"],
			costHint: "low",
			latencyHint: "low",
			limitations: [],
		},
	};
}

const agents = [
	agent("worker", ["implementation"], "write"),
	agent("worker-two", ["implementation"], "write"),
	agent("reviewer", ["code-review"], "read", ["independent-review"]),
	agent("explorer", ["repository-search"], "read"),
];

function request(overrides: Record<string, unknown> = {}) {
	return parseAutomationRequest({
		version: AUTOMATION_REQUEST_VERSION,
		objective: "Complete the objective",
		nonGoals: [],
		requiredInputs: ["repository"],
		acceptanceCriteria: ["Tests pass"],
		requiredEvidence: ["test output"],
		authorityCeiling: {
			capabilities: ["implementation", "code-review", "repository-search"],
			tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
			readPaths: ["packages/pi-subagents"],
			writePaths: ["packages/pi-subagents"],
			network: "unspecified",
			secrets: "unspecified",
			sideEffectPolicy: "mutating",
		},
		aggregateBudget: {
			timeoutMs: 180_000,
			maxTurns: 30,
			maxToolCalls: 60,
			maxTasks: 4,
			maxRevisions: 1,
		},
		constraints: {
			contextPressure: "high",
			maxMutatingWidth: 2,
			requireVerification: false,
			workspaceMode: "shared",
		},
		...overrides,
	});
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
		requiredCapabilities: ["repository-search"],
		requiredTools: ["read"],
		acceptanceCriteria: ["Grounded result"],
		requiredEvidence: ["path evidence"],
		integrationOwner: false,
		budget: { timeoutMs: 30_000, maxTurns: 4, maxToolCalls: 8 },
		...overrides,
	};
}

function plan(tasks: unknown[], missingInputs: string[] = []) {
	return parseWorkflowPlan({
		version: WORKFLOW_PLAN_VERSION,
		requestVersion: AUTOMATION_REQUEST_VERSION,
		summary: "Bounded workflow",
		missingInputs,
		risks: [],
		tasks,
	});
}

function compile(tasks: unknown[], requestOverride: Record<string, unknown> = {}, depth = 0) {
	return compileWorkflowPlan({
		request: request(requestOverride),
		proposal: plan(tasks),
		agents,
		target,
		depth,
	});
}

test("compiler returns parent-owned direct work without a launch", () => {
	const result = compile([task("inspect")], {
		constraints: {
			contextPressure: "low",
			maxMutatingWidth: 2,
			requireVerification: false,
			workspaceMode: "shared",
		},
	});
	assert.equal(result.status, "parent-owned");
	assert.equal(result.childCount, 0);
});

test("compiler admits one child and a sequential dependency without widening authority", () => {
	const one = compile([task("inspect")]);
	assert.equal(one.status, "compiled");
	if (one.status !== "compiled") return;
	assert.equal(one.workflow.tasks.length, 1);
	assert.equal(one.workflow.tasks[0]?.agent, "explorer");
	assert.deepEqual(one.workflow.tasks[0]?.requiredTools, ["read"]);

	const sequential = compile([task("inspect"), task("summarize", { dependsOn: ["inspect"] })]);
	assert.equal(sequential.status, "compiled");
	if (sequential.status !== "compiled") return;
	assert.deepEqual(sequential.workflow.tasks[1]?.dependsOn, ["inspect"]);
});

test("compiler carries caller requirements into authoritative task contracts", () => {
	const result = compile(
		[
			task("implement", {
				sideEffectPolicy: "mutating",
				writePaths: ["packages/pi-subagents"],
				requiredCapabilities: ["implementation"],
				requiredTools: ["read", "edit", "write"],
				integrationOwner: true,
			}),
		],
		{
			acceptanceCriteria: ["Caller acceptance"],
			requiredEvidence: ["caller evidence"],
		},
	);
	assert.equal(result.status, "compiled");
	if (result.status !== "compiled") return;
	for (const compiledTask of result.workflow.tasks) {
		assert.ok(compiledTask.contract?.acceptanceCriteria?.includes("Caller acceptance"));
		assert.ok(compiledTask.contract?.requiredEvidence?.includes("caller evidence"));
		assert.match(compiledTask.task, /Caller acceptance/u);
		assert.match(compiledTask.task, /caller evidence/u);
	}
	for (const normalizedTask of result.plan.tasks) {
		assert.ok(normalizedTask.acceptanceCriteria.includes("Caller acceptance"));
		assert.ok(normalizedTask.requiredEvidence.includes("caller evidence"));
	}
});

test("compiler rejects caller requirement merges that exceed contract item limits", () => {
	const result = compile([task("inspect")], {
		acceptanceCriteria: Array.from({ length: 20 }, (_, index) => `Caller criterion ${index}`),
	});
	assert.equal(result.status, "rejected");
	assert.deepEqual(result.reasonCodes, ["request-requirements-exceed-task-limit"]);
});

test("compiler synthesizes a distinct verifier for one mutating child", () => {
	const result = compile([
		task("implement", {
			sideEffectPolicy: "mutating",
			writePaths: ["packages/pi-subagents"],
			requiredCapabilities: ["implementation"],
			requiredTools: ["read", "edit", "write"],
			integrationOwner: true,
		}),
	]);
	assert.equal(result.status, "compiled");
	if (result.status !== "compiled") return;
	assert.equal(result.workflow.tasks.length, 2);
	const verifier = result.workflow.tasks.find((candidate) => candidate.verifierFor === "implement");
	assert.equal(verifier?.agent, "reviewer");
	assert.equal(verifier?.resultFormat, "structured-v2");
	assert.notEqual(verifier?.agent, result.workflow.tasks[0]?.agent);
});

test("compiler admits two safe mutating children only with an authoritative integration path", () => {
	const mutating = (id: string) =>
		task(id, {
			sideEffectPolicy: "mutating",
			writePaths: [`packages/pi-subagents/${id}`],
			ownershipKeys: [id],
			requiredCapabilities: ["implementation"],
			requiredTools: ["read", "edit", "write"],
		});
	const result = compile([
		mutating("a"),
		mutating("b"),
		task("integrate", {
			dependsOn: ["a", "b"],
			sideEffectPolicy: "mutating",
			writePaths: ["packages/pi-subagents"],
			requiredCapabilities: ["implementation"],
			requiredTools: ["read", "bash", "edit", "write"],
			integrationOwner: true,
		}),
	]);
	assert.equal(result.status, "compiled");
	if (result.status !== "compiled") return;
	assert.ok(result.workflow.tasks.some((candidate) => candidate.verifierFor === "integrate"));
	assert.equal(result.maxConcurrentMutating, 2);
});

test("compiler rejects missing verification, unsupported capability, budget, and integration", () => {
	const noReviewer = compileWorkflowPlan({
		request: request(),
		proposal: plan([
			task("implement", {
				sideEffectPolicy: "mutating",
				writePaths: ["packages/pi-subagents"],
				requiredCapabilities: ["implementation"],
				requiredTools: ["edit"],
				integrationOwner: true,
			}),
		]),
		agents: agents.filter((candidate) => candidate.name !== "reviewer"),
		target,
		depth: 0,
	});
	assert.equal(noReviewer.status, "rejected");
	assert.match(noReviewer.reasonCodes.join(" "), /verification/i);

	const unsupported = compile([
		task("gpu", { requiredCapabilities: ["gpu"], requiredTools: ["read"] }),
	]);
	assert.equal(unsupported.status, "rejected");
	assert.match(unsupported.reasonCodes.join(" "), /capability/i);

	const promptOnlyReadOnly = compile([
		task("shell", { requiredCapabilities: ["repository-search"], requiredTools: ["bash"] }),
	]);
	assert.equal(promptOnlyReadOnly.status, "rejected");
	assert.match(promptOnlyReadOnly.reasonCodes.join(" "), /read-only-tool/i);

	const overBudget = compile(
		[task("inspect", { budget: { timeoutMs: 100_000, maxTurns: 20, maxToolCalls: 40 } })],
		{
			aggregateBudget: {
				timeoutMs: 10_000,
				maxTurns: 2,
				maxToolCalls: 2,
				maxTasks: 4,
				maxRevisions: 1,
			},
		},
	);
	assert.equal(overBudget.status, "parent-owned");

	const noIntegration = compile([
		task("a", {
			sideEffectPolicy: "mutating",
			writePaths: ["packages/pi-subagents/a"],
			ownershipKeys: ["a"],
			requiredCapabilities: ["implementation"],
			requiredTools: ["edit"],
		}),
		task("b", {
			sideEffectPolicy: "mutating",
			writePaths: ["packages/pi-subagents/b"],
			ownershipKeys: ["b"],
			requiredCapabilities: ["implementation"],
			requiredTools: ["edit"],
		}),
	]);
	assert.equal(noIntegration.status, "rejected");
	assert.match(noIntegration.reasonCodes.join(" "), /integration/i);
});

test("compiler returns needs-input and rejects attempted workflow grandchildren", () => {
	const needsInput = compileWorkflowPlan({
		request: request(),
		proposal: plan([task("inspect")], ["API contract"]),
		agents,
		target,
		depth: 0,
	});
	assert.equal(needsInput.status, "needs-input");
	assert.equal(needsInput.childCount, 0);
	const recursive = compile([task("inspect")], {}, 1);
	assert.equal(recursive.status, "rejected");
	assert.match(recursive.reasonCodes.join(" "), /recursion/i);
});
