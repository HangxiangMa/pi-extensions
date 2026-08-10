import assert from "node:assert/strict";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import type { SubagentSettings } from "../src/agents.js";
import {
	executeAutomationRequest,
	registerSubagentAutomation,
	type SubagentAutomationParams,
} from "../src/automation.js";
import { AUTOMATION_REQUEST_VERSION, WORKFLOW_PLAN_VERSION } from "../src/automation-contract.js";

function request(overrides: Record<string, unknown> = {}): SubagentAutomationParams["request"] {
	return {
		version: AUTOMATION_REQUEST_VERSION,
		objective: "Complete the high-level objective",
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
	} as SubagentAutomationParams["request"];
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
	return JSON.stringify({
		version: WORKFLOW_PLAN_VERSION,
		requestVersion: AUTOMATION_REQUEST_VERSION,
		summary: "Bounded deterministic fixture",
		missingInputs,
		risks: [],
		tasks,
	});
}

async function run(
	plannerOutput: string | Error,
	requestValue = request(),
	isCurrent: () => boolean = () => true,
	settings?: SubagentSettings,
) {
	let plannerCalls = 0;
	let workflowCalls = 0;
	let persistenceCalls = 0;
	const context = createMockContext({ cwd: process.cwd(), isProjectTrusted: () => true });
	const result = await executeAutomationRequest(
		"auto-1",
		{ request: requestValue },
		new AbortController().signal,
		undefined,
		context.ctx,
		{
			getSettings: () => settings,
			runPlanner: async () => {
				plannerCalls++;
				if (plannerOutput instanceof Error) throw plannerOutput;
				return plannerOutput;
			},
			runWorkflow: async (params) => {
				workflowCalls++;
				return {
					content: [{ type: "text" as const, text: `executed ${params.workflow?.tasks.length}` }],
					details: {
						mode: "workflow" as const,
						agentScope: "user" as const,
						projectAgentsDir: null,
						results: [],
					},
				};
			},
			persistCompiled: async () => {
				persistenceCalls++;
			},
		},
		isCurrent,
	);
	return { result, plannerCalls, workflowCalls, persistenceCalls };
}

test("objective compiles to a typed parent-owned result with zero execution workers", async () => {
	const { result, workflowCalls } = await run(
		plan([task("inspect")]),
		request({
			constraints: {
				contextPressure: "low",
				maxMutatingWidth: 2,
				requireVerification: false,
				workspaceMode: "shared",
			},
		}),
	);
	assert.equal(result.details.status, "parent-owned");
	assert.equal(result.details.childCount, 0);
	assert.equal(workflowCalls, 0);
});

test("objective compiles to one capability-routed child", async () => {
	const { result, workflowCalls } = await run(plan([task("inspect")]));
	assert.equal(result.details.status, "executed");
	assert.equal(result.details.childCount, 1);
	assert.equal(result.details.compiled?.workflow.tasks[0]?.agent, "scout");
	assert.equal(workflowCalls, 1);
});

test("mutating objective compiles to an implementation child plus verifier", async () => {
	const { result } = await run(
		plan([
			task("implement", {
				sideEffectPolicy: "mutating",
				writePaths: ["packages/pi-subagents"],
				requiredCapabilities: ["implementation"],
				requiredTools: ["read", "edit", "write"],
				integrationOwner: true,
			}),
		]),
	);
	assert.equal(result.details.status, "executed");
	assert.equal(result.details.childCount, 2);
	assert.ok(
		result.details.compiled?.workflow.tasks.some(
			(candidate) => candidate.verifierFor === "implement",
		),
	);
});

test("objective compiles to a bounded two-child mutating width and integration path", async () => {
	const mutating = (id: string) =>
		task(id, {
			sideEffectPolicy: "mutating",
			writePaths: [`packages/pi-subagents/${id}`],
			ownershipKeys: [id],
			requiredCapabilities: ["implementation"],
			requiredTools: ["read", "edit", "write"],
		});
	const { result } = await run(
		plan([
			mutating("a"),
			mutating("b"),
			task("integrate", {
				dependsOn: ["a", "b"],
				sideEffectPolicy: "mutating",
				writePaths: ["packages/pi-subagents"],
				requiredCapabilities: ["implementation"],
				requiredTools: ["read", "edit", "write"],
				integrationOwner: true,
			}),
		]),
	);
	assert.equal(result.details.status, "executed");
	assert.equal(result.details.compiled?.maxConcurrentMutating, 2);
	assert.equal(result.details.childCount, 4);
});

test("aggregate budgets that cannot fund both phases launch neither planner nor workflow", async () => {
	for (const aggregateBudget of [
		{ timeoutMs: 1, maxTurns: 30, maxToolCalls: 60, maxTasks: 4, maxRevisions: 1 },
		{ timeoutMs: 180_000, maxTurns: 1, maxToolCalls: 60, maxTasks: 4, maxRevisions: 1 },
		{ timeoutMs: 180_000, maxTurns: 30, maxToolCalls: 1, maxTasks: 4, maxRevisions: 1 },
	]) {
		const { result, plannerCalls, workflowCalls, persistenceCalls } = await run(
			plan([task("inspect")]),
			request({ aggregateBudget }),
		);
		assert.equal(result.details.status, "compiler-rejected");
		assert.deepEqual(result.details.reasonCodes, ["execution-budget-exhausted"]);
		assert.equal(plannerCalls, 0);
		assert.equal(workflowCalls, 0);
		assert.equal(persistenceCalls, 0);
	}
});

test("configured blocking task limits reject synthesized overflow before persistence", async () => {
	const mutatingPlan = plan([
		task("implement", {
			sideEffectPolicy: "mutating",
			writePaths: ["packages/pi-subagents"],
			requiredCapabilities: ["implementation"],
			requiredTools: ["read", "edit", "write"],
			integrationOwner: true,
		}),
	]);
	const rejected = await run(mutatingPlan, request(), () => true, {
		blocking: { maxParallelTasks: 1 },
	});
	assert.equal(rejected.result.details.status, "compiler-rejected");
	assert.deepEqual(rejected.result.details.reasonCodes, [
		"task-budget-exceeded-after-verification",
	]);
	assert.equal(rejected.persistenceCalls, 0);
	assert.equal(rejected.workflowCalls, 0);

	const admitted = await run(mutatingPlan, request(), () => true, {
		blocking: { maxParallelTasks: 2 },
	});
	assert.equal(admitted.result.details.status, "executed");
	assert.equal(admitted.persistenceCalls, 1);
	assert.equal(admitted.workflowCalls, 1);
});

test("missing input, planner failure, and compiler rejection never launch execution workers", async () => {
	for (const [plannerOutput, expected] of [
		[plan([task("inspect")], ["API contract"]), "needs-input"],
		[new Error("provider <private>SECRET</private> unavailable\u001b[31m"), "planner-failed"],
		[plan([task("unsupported", { requiredCapabilities: ["gpu"] })]), "compiler-rejected"],
	] as const) {
		const { result, workflowCalls } = await run(plannerOutput);
		assert.equal(result.details.status, expected);
		assert.equal(result.details.childCount, 0);
		assert.equal(workflowCalls, 0);
		const text = result.content.find((part) => part.type === "text")?.text ?? "";
		assert.doesNotMatch(text, /SECRET/u);
		assert.equal(text.includes("\u001b"), false);
	}
});

test("session shutdown aborts and drains the owned planner before cleanup returns", async () => {
	const mock = createMockPi();
	let started!: () => void;
	const didStart = new Promise<void>((resolve) => {
		started = resolve;
	});
	registerSubagentAutomation(mock.pi, {
		getSettings: () => undefined,
		runPlanner: async ({ signal }) => {
			started();
			await new Promise<void>((_resolve, reject) => {
				signal.addEventListener("abort", () => reject(new DOMException("shutdown", "AbortError")), {
					once: true,
				});
			});
			return plan([task("inspect")]);
		},
		persistCompiled: async () => undefined,
	});
	const tool = mock.tools.find((candidate) => candidate.name === "subagent_auto") as
		| { execute: (...args: unknown[]) => Promise<unknown> }
		| undefined;
	assert.ok(tool);
	const context = createMockContext({ cwd: process.cwd(), isProjectTrusted: () => true });
	const pending = tool.execute(
		"auto-shutdown",
		{ request: request() },
		undefined,
		undefined,
		context.ctx,
	);
	await didStart;
	const rejected = assert.rejects(
		pending,
		(error: unknown) => error instanceof Error && error.name === "AbortError",
	);
	await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);
	await rejected;
});

test("workflow grandchildren are rejected before the read-only planner starts", async () => {
	const previous = process.env.PI_SUBAGENT_DEPTH;
	process.env.PI_SUBAGENT_DEPTH = "1";
	let plannerCalls = 0;
	try {
		const context = createMockContext({ cwd: process.cwd(), isProjectTrusted: () => true });
		const result = await executeAutomationRequest(
			"auto-recursive",
			{ request: request() },
			new AbortController().signal,
			undefined,
			context.ctx,
			{
				getSettings: () => undefined,
				runPlanner: async () => {
					plannerCalls++;
					return plan([task("inspect")]);
				},
				persistCompiled: async () => undefined,
			},
		);
		assert.equal(result.details.status, "compiler-rejected");
		assert.equal(plannerCalls, 0);
	} finally {
		if (previous === undefined) delete process.env.PI_SUBAGENT_DEPTH;
		else process.env.PI_SUBAGENT_DEPTH = previous;
	}
});

test("session replacement after the planning await cancels before compilation or launch", async () => {
	let current = true;
	const context = createMockContext({ cwd: process.cwd(), isProjectTrusted: () => true });
	await assert.rejects(
		executeAutomationRequest(
			"auto-stale",
			{ request: request() },
			new AbortController().signal,
			undefined,
			context.ctx,
			{
				getSettings: () => undefined,
				runPlanner: async () => {
					current = false;
					return plan([task("inspect")]);
				},
				runWorkflow: async () => {
					throw new Error("stale workflow launched");
				},
				persistCompiled: async () => undefined,
			},
			() => current,
		),
		(error: unknown) => error instanceof Error && error.name === "AbortError",
	);
});
