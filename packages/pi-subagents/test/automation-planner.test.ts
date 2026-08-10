import assert from "node:assert/strict";
import { test } from "vitest";
import {
	AUTOMATION_REQUEST_VERSION,
	parseAutomationRequest,
	WORKFLOW_PLAN_VERSION,
} from "../src/automation-contract.js";
import {
	buildAutomationPlannerPrompt,
	parseAutomationPlannerOutput,
	resolveAutomationPlannerPolicy,
} from "../src/automation-planner.js";

const request = parseAutomationRequest({
	version: AUTOMATION_REQUEST_VERSION,
	objective: "Implement a bounded feature",
	nonGoals: ["Do not publish"],
	requiredInputs: ["repository"],
	acceptanceCriteria: ["Tests pass"],
	requiredEvidence: ["test output"],
	authorityCeiling: {
		capabilities: ["implementation"],
		tools: ["read", "edit"],
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
		maxMutatingWidth: 1,
		requireVerification: true,
		workspaceMode: "shared",
	},
});

test("planner prompt requests a bounded workflow without hidden reasoning or authority grants", () => {
	const prompt = buildAutomationPlannerPrompt(request);
	for (const field of [
		"dependencies",
		"artifacts",
		"sideEffectPolicy",
		"requiredCapabilities",
		"acceptanceCriteria",
		"requiredEvidence",
		"integrationOwner",
		"verifierFor",
		"budget",
	]) {
		assert.match(prompt, new RegExp(field, "i"));
	}
	assert.match(prompt, /return only json/i);
	assert.match(prompt, /do not provide hidden reasoning/i);
	assert.match(prompt, /cannot grant/i);
	assert.ok(Buffer.byteLength(prompt, "utf8") < 32 * 1024);
});

test("planner policy is read-only, bounded, trust-aware, and non-recursive", async () => {
	const trusted = await resolveAutomationPlannerPolicy(true, "/workspace", async () => ({
		disableExtensions: true,
		disableSkills: true,
		disablePromptTemplates: true,
		disableContextFiles: false,
		projectTrust: true,
	}));
	assert.deepEqual(trusted.tools, ["read", "grep", "find", "ls"]);
	assert.equal(trusted.resources, "project-context");
	assert.equal(trusted.launchPolicy.disableExtensions, true);
	assert.equal(trusted.launchPolicy.projectTrust, true);

	const untrusted = await resolveAutomationPlannerPolicy(false, "/workspace", async (policy) => ({
		disableExtensions: true,
		disableSkills: true,
		disablePromptTemplates: true,
		disableContextFiles: true,
		projectTrust: false,
		baseSystemPrompt: policy,
	}));
	assert.equal(untrusted.resources, "none");
	assert.equal(untrusted.launchPolicy.projectTrust, false);
});

test("planner output accepts one exact versioned object and rejects prose fences", () => {
	const output = JSON.stringify({
		version: WORKFLOW_PLAN_VERSION,
		requestVersion: AUTOMATION_REQUEST_VERSION,
		summary: "Inspect",
		missingInputs: [],
		risks: [],
		tasks: [
			{
				id: "inspect",
				objective: "Inspect the repository",
				dependsOn: [],
				inputArtifacts: [],
				producesArtifacts: [],
				sideEffectPolicy: "read-only",
				readPaths: ["packages/pi-subagents"],
				writePaths: [],
				ownershipKeys: [],
				requiredCapabilities: [],
				requiredTools: ["read"],
				acceptanceCriteria: ["Grounded result"],
				requiredEvidence: ["path evidence"],
				integrationOwner: false,
				budget: { timeoutMs: 10_000, maxTurns: 2, maxToolCalls: 4 },
			},
		],
	});
	assert.equal(parseAutomationPlannerOutput(output).tasks[0]?.id, "inspect");
	assert.throws(
		() => parseAutomationPlannerOutput(`Here is the plan:\n${output}`),
		/invalid json/i,
	);
	assert.throws(
		() => parseAutomationPlannerOutput(`\`\`\`json\n${output}\n\`\`\``),
		/invalid json/i,
	);
});
