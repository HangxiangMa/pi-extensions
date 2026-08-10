import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import type { AgentConfig } from "../src/agents.js";
import {
	AUTOMATION_REQUEST_VERSION,
	parseAutomationRequest,
	parseWorkflowPlan,
	parseWorkflowPlanPatch,
	WORKFLOW_PLAN_PATCH_VERSION,
	WORKFLOW_PLAN_VERSION,
	workflowPlanIdentity,
} from "../src/automation-contract.js";
import { CAPABILITY_MANIFEST_VERSION } from "../src/capabilities.js";
import type { TargetPolicyAudit } from "../src/cwd-policy.js";
import { WorkItemLedger } from "../src/work-item-ledger.js";
import { compileWorkflowPlan } from "../src/workflow-plan-compiler.js";
import {
	AutomationPlanPersistence,
	applyWorkflowPlanPatch,
	createWorkflowPlanRecord,
} from "../src/workflow-plan-patch.js";

function agent(name: string, review = false): AgentConfig {
	return {
		name,
		description: name,
		tools: review ? ["read"] : ["read", "edit", "write"],
		source: "built-in",
		filePath: `built-in:${name}`,
		systemPrompt: name,
		capabilityManifest: {
			version: CAPABILITY_MANIFEST_VERSION,
			capabilities: review ? ["code-review"] : ["implementation"],
			modalities: ["text"],
			resultFormats: ["structured-v2"],
			authority: { filesystem: review ? "read" : "write" },
			verificationRoles: review ? ["independent-review"] : [],
			contextStrengths: ["repository"],
			costHint: "low",
			latencyHint: "low",
			limitations: [],
		},
	};
}

const agents = [agent("worker"), agent("reviewer", true)];
const target: TargetPolicyAudit = {
	cwd: "/workspace",
	boundary: "current-workspace",
	trust: { kind: "session-trusted", projectTrusted: true },
};

function task(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		objective: `Complete ${id}`,
		dependsOn: [],
		inputArtifacts: [],
		producesArtifacts: [],
		sideEffectPolicy: "mutating",
		readPaths: ["packages/pi-subagents"],
		writePaths: ["packages/pi-subagents"],
		ownershipKeys: [id],
		requiredCapabilities: ["implementation"],
		requiredTools: ["read", "edit", "write"],
		acceptanceCriteria: ["Tests pass"],
		requiredEvidence: ["test output"],
		integrationOwner: true,
		budget: { timeoutMs: 30_000, maxTurns: 4, maxToolCalls: 8 },
		...overrides,
	};
}

const request = parseAutomationRequest({
	version: AUTOMATION_REQUEST_VERSION,
	objective: "Implement safely",
	nonGoals: [],
	requiredInputs: ["repository"],
	acceptanceCriteria: ["Tests pass"],
	requiredEvidence: ["test output"],
	authorityCeiling: {
		capabilities: ["implementation", "code-review"],
		tools: ["read", "edit", "write"],
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
		maxRevisions: 2,
	},
	constraints: {
		contextPressure: "high",
		maxMutatingWidth: 1,
		requireVerification: true,
		workspaceMode: "shared",
	},
});

function compiledRecord() {
	const proposal = parseWorkflowPlan({
		version: WORKFLOW_PLAN_VERSION,
		requestVersion: AUTOMATION_REQUEST_VERSION,
		summary: "Implement and verify",
		missingInputs: [],
		risks: [],
		tasks: [task("implement")],
	});
	const compiled = compileWorkflowPlan({ request, proposal, agents, target, depth: 0 });
	assert.equal(compiled.status, "compiled");
	if (compiled.status !== "compiled") throw new Error("fixture did not compile");
	const ledger = WorkItemLedger.create({
		workflowId: compiled.workflow.id ?? "auto",
		items: compiled.workflow.tasks.map((item) => ({
			id: item.id,
			objective: item.task,
			dependencies: item.dependsOn ?? [],
			requiredCapabilities: item.requiredCapabilities,
			requiredTools: item.requiredTools,
			selectedAgentName: item.agent,
			sideEffectPolicy: item.contract?.sideEffectPolicy,
			readPaths: item.readPaths,
			writePaths: item.writePaths,
			ownershipKeys: item.ownershipKeys,
			acceptanceCriteria: item.acceptanceCriteria,
			integrationOwner: item.integrationOwner,
			verifierFor: item.verifierFor,
		})),
	});
	return { compiled, record: createWorkflowPlanRecord(compiled), ledger };
}

function patch(planId: string, generation: number, operations: unknown[]) {
	return parseWorkflowPlanPatch({
		version: WORKFLOW_PLAN_PATCH_VERSION,
		planId,
		workflowGeneration: generation,
		reason: "Verifier requested rework",
		operations,
	});
}

test("patches reject completed work, accepted artifacts, and current verification", () => {
	const { record, ledger } = compiledRecord();
	const started = ledger.start("implement", "agent:worker");
	ledger.complete("implement", {
		taskGeneration: started.taskGeneration,
		executionPlanId: "a".repeat(64),
		artifacts: [{ id: "accepted", kind: "patch", version: "v1", verified: true }],
	});
	assert.throws(
		() =>
			applyWorkflowPlanPatch({
				record,
				ledger: ledger.snapshot(),
				patch: patch(record.planId, record.workflowGeneration, [
					{ type: "replace-task", taskId: "implement", task: task("implement") },
				]),
				agents,
				target,
			}),
		/immutable|completed/i,
	);
	assert.throws(
		() =>
			applyWorkflowPlanPatch({
				record,
				ledger: ledger.snapshot(),
				patch: patch(record.planId, record.workflowGeneration, [
					{
						type: "add-task",
						task: task("forge", {
							producesArtifacts: [{ id: "accepted", kind: "patch", version: "v2" }],
						}),
					},
				]),
				agents,
				target,
			}),
		/accepted artifact/i,
	);
});

test("patches cannot remove required verification or revive a cancelled generation", () => {
	const { record, ledger } = compiledRecord();
	const verifier = record.plan.tasks.find((candidate) => candidate.verifierFor === "implement");
	assert.ok(verifier);
	assert.throws(
		() =>
			applyWorkflowPlanPatch({
				record,
				ledger: ledger.snapshot(),
				patch: patch(record.planId, 0, [{ type: "cancel-task", taskId: verifier.id }]),
				agents,
				target,
			}),
		/verification/i,
	);
	const cancelled = applyWorkflowPlanPatch({
		record,
		ledger: ledger.snapshot(),
		patch: patch(record.planId, 0, [{ type: "cancel-task", taskId: "implement" }]),
		agents,
		target,
	});
	assert.deepEqual(
		cancelled.record.plan.tasks.map((candidate) => candidate.id).sort(),
		record.plan.tasks.map((candidate) => candidate.id).sort(),
	);
	assert.throws(
		() =>
			applyWorkflowPlanPatch({
				record: cancelled.record,
				ledger: ledger.snapshot(),
				patch: patch(cancelled.record.planId, 1, [
					{ type: "replace-task", taskId: "implement", task: task("implement") },
				]),
				agents,
				target,
			}),
		/cancelled/i,
	);
});

test("patches reject authority widening, excess budget, and cycles", () => {
	for (const replacement of [
		task("implement", { requiredTools: ["read", "edit", "write", "bash"] }),
		task("implement", { budget: { timeoutMs: 120_000, maxTurns: 20, maxToolCalls: 40 } }),
	]) {
		const { record, ledger } = compiledRecord();
		assert.throws(
			() =>
				applyWorkflowPlanPatch({
					record,
					ledger: ledger.snapshot(),
					patch: patch(record.planId, 0, [
						{ type: "replace-task", taskId: "implement", task: replacement },
					]),
					agents,
					target,
				}),
			/authority|budget/i,
		);
	}
	const { record, ledger } = compiledRecord();
	assert.throws(
		() =>
			applyWorkflowPlanPatch({
				record,
				ledger: ledger.snapshot(),
				patch: patch(record.planId, 0, [
					{ type: "add-dependency", taskId: "implement", dependsOn: "verify-implement" },
				]),
				agents,
				target,
			}),
		/cycle/i,
	);
});

test("replacement tasks persist compiler-normalized caller requirements", () => {
	const { record, ledger } = compiledRecord();
	ledger.settle("implement", "blocked", "verification-rework");
	const result = applyWorkflowPlanPatch({
		record,
		ledger: ledger.snapshot(),
		patch: patch(record.planId, 0, [
			{
				type: "replace-task",
				taskId: "implement",
				task: task("implement", {
					acceptanceCriteria: ["Replacement-specific check"],
					requiredEvidence: ["replacement evidence"],
				}),
			},
		]),
		agents,
		target,
	});
	for (const plan of [result.record.plan, result.compiled?.plan]) {
		const normalized = plan?.tasks.find((candidate) => candidate.id === "implement");
		assert.ok(normalized?.acceptanceCriteria.includes("Tests pass"));
		assert.ok(normalized?.acceptanceCriteria.includes("Replacement-specific check"));
		assert.ok(normalized?.requiredEvidence.includes("test output"));
		assert.ok(normalized?.requiredEvidence.includes("replacement evidence"));
	}
	const recorded = result.ledger.items.find((item) => item.id === "implement");
	assert.ok(recorded?.acceptanceCriteria.includes("Tests pass"));
	assert.ok(recorded?.acceptanceCriteria.includes("Replacement-specific check"));
});

test("added authoritative tasks persist compiler-normalized caller requirements", () => {
	const { record, ledger } = compiledRecord();
	const result = applyWorkflowPlanPatch({
		record,
		ledger: ledger.snapshot(),
		patch: patch(record.planId, 0, [
			{
				type: "add-task",
				task: task("report", {
					sideEffectPolicy: "read-only",
					writePaths: [],
					ownershipKeys: ["report"],
					requiredCapabilities: ["code-review"],
					requiredTools: ["read"],
					acceptanceCriteria: ["Report-specific check"],
					requiredEvidence: ["report evidence"],
					integrationOwner: false,
				}),
			},
		]),
		agents,
		target,
	});
	for (const plan of [result.record.plan, result.compiled?.plan]) {
		const normalized = plan?.tasks.find((candidate) => candidate.id === "report");
		assert.ok(normalized?.acceptanceCriteria.includes("Tests pass"));
		assert.ok(normalized?.acceptanceCriteria.includes("Report-specific check"));
		assert.ok(normalized?.requiredEvidence.includes("test output"));
		assert.ok(normalized?.requiredEvidence.includes("report evidence"));
	}
	const recorded = result.ledger.items.find((item) => item.id === "report");
	assert.ok(recorded?.acceptanceCriteria.includes("Tests pass"));
	assert.ok(recorded?.acceptanceCriteria.includes("Report-specific check"));
});

test("normalization updates stale active ledger tasks during an unrelated patch", () => {
	const { record, ledger } = compiledRecord();
	const stalePlan = parseWorkflowPlan({
		...record.plan,
		tasks: record.plan.tasks.map((candidate) =>
			candidate.id === "implement"
				? {
						...candidate,
						acceptanceCriteria: ["Legacy-only check"],
						requiredEvidence: ["legacy evidence"],
					}
				: candidate,
		),
	});
	const staleRecord = {
		...record,
		plan: stalePlan,
		planId: workflowPlanIdentity(stalePlan, 0, 0),
	};
	const staleLedger = ledger.snapshot();
	const staleItem = staleLedger.items.find((item) => item.id === "implement");
	assert.ok(staleItem);
	staleItem.acceptanceCriteria = ["Legacy-only check"];
	const result = applyWorkflowPlanPatch({
		record: staleRecord,
		ledger: staleLedger,
		patch: patch(staleRecord.planId, 0, [
			{
				type: "add-task",
				task: task("report", {
					sideEffectPolicy: "read-only",
					writePaths: [],
					ownershipKeys: ["report"],
					requiredCapabilities: ["code-review"],
					requiredTools: ["read"],
					integrationOwner: false,
				}),
			},
		]),
		agents,
		target,
	});
	const normalized = result.ledger.items.find((item) => item.id === "implement");
	assert.ok(normalized?.acceptanceCriteria.includes("Tests pass"));
	assert.equal(normalized?.taskGeneration, 2);
	assert.equal(
		result.compiled?.executionPlans.find((plan) => plan.taskId === "implement")?.taskGeneration,
		2,
	);
});

test("normalization refuses to rewrite an immutable completed task", () => {
	const { record, ledger } = compiledRecord();
	const stalePlan = parseWorkflowPlan({
		...record.plan,
		tasks: record.plan.tasks.map((candidate) =>
			candidate.id === "implement"
				? {
						...candidate,
						acceptanceCriteria: ["Legacy-only check"],
						requiredEvidence: ["legacy evidence"],
					}
				: candidate,
		),
	});
	const staleRecord = {
		...record,
		plan: stalePlan,
		planId: workflowPlanIdentity(stalePlan, 0, 0),
	};
	const started = ledger.start("implement", "agent:worker");
	ledger.complete("implement", {
		taskGeneration: started.taskGeneration,
		executionPlanId: "a".repeat(64),
	});
	const staleLedger = ledger.snapshot();
	const staleItem = staleLedger.items.find((item) => item.id === "implement");
	assert.ok(staleItem);
	staleItem.acceptanceCriteria = ["Legacy-only check"];
	assert.throws(
		() =>
			applyWorkflowPlanPatch({
				record: staleRecord,
				ledger: staleLedger,
				patch: patch(staleRecord.planId, 0, [
					{
						type: "add-task",
						task: task("report", {
							sideEffectPolicy: "read-only",
							writePaths: [],
							ownershipKeys: ["report"],
							requiredCapabilities: ["code-review"],
							requiredTools: ["read"],
							integrationOwner: false,
						}),
					},
				]),
				agents,
				target,
			}),
		/normalization.*immutable/i,
	);
});

test("eligible rework rotates compiled identity and task generations without replaying side effects", () => {
	const { compiled, record, ledger } = compiledRecord();
	ledger.settle("implement", "blocked", "verification-rework");
	const result = applyWorkflowPlanPatch({
		record,
		ledger: ledger.snapshot(),
		patch: patch(record.planId, 0, [
			{
				type: "replace-task",
				taskId: "implement",
				task: task("implement", { objective: "Fix the verified issue" }),
			},
		]),
		agents,
		target,
	});
	assert.equal(result.record.workflowGeneration, 1);
	assert.equal(result.record.revision, 1);
	assert.notEqual(result.record.planId, record.planId);
	assert.equal(result.taskGenerations.implement, 2);
	assert.equal(result.ledger.items.find((item) => item.id === "implement")?.taskGeneration, 2);
	assert.equal(result.ledger.items.find((item) => item.id === "implement")?.state, "pending");
	assert.deepEqual(result.replayedTaskIds, []);
	assert.equal(result.record.history[0]?.planId, record.planId);
	assert.equal(result.compiled?.planId, result.record.planId);
	assert.equal(result.compiled?.workflowGeneration, result.record.workflowGeneration);
	assert.equal(result.compiled?.revision, result.record.revision);
	assert.equal(result.compiled?.workflow.id, `auto-${result.record.planId.slice(0, 24)}`);
	assert.notEqual(result.compiled?.workflow.id, compiled.workflow.id);
	for (const executionPlan of result.compiled?.executionPlans ?? []) {
		const expectedGeneration = result.ledger.items.find(
			(item) => item.id === executionPlan.taskId,
		)?.taskGeneration;
		assert.equal(executionPlan.taskGeneration, expectedGeneration);
		const previousPlan = compiled.executionPlans.find(
			(candidate) => candidate.taskId === executionPlan.taskId,
		);
		if (executionPlan.taskId === "implement") {
			assert.notEqual(executionPlan.id, previousPlan?.id);
		} else {
			assert.equal(executionPlan.id, previousPlan?.id);
		}
	}
});

test("revision exhaustion is a terminal stop before another graph mutation", () => {
	const { record, ledger } = compiledRecord();
	ledger.settle("implement", "blocked", "verification-rework");
	const first = applyWorkflowPlanPatch({
		record,
		ledger: ledger.snapshot(),
		patch: patch(record.planId, 0, [
			{
				type: "replace-task",
				taskId: "implement",
				task: task("implement", { objective: "First correction" }),
			},
		]),
		agents,
		target,
	});
	const second = applyWorkflowPlanPatch({
		record: first.record,
		ledger: ledger.snapshot(),
		patch: patch(first.record.planId, 1, [
			{
				type: "replace-task",
				taskId: "implement",
				task: task("implement", { objective: "Second correction" }),
			},
		]),
		agents,
		target,
	});
	assert.equal(second.record.revision, 2);
	assert.throws(
		() =>
			applyWorkflowPlanPatch({
				record: second.record,
				ledger: ledger.snapshot(),
				patch: patch(second.record.planId, 2, [
					{
						type: "replace-task",
						taskId: "implement",
						task: task("implement", { objective: "Forbidden third correction" }),
					},
				]),
				agents,
				target,
			}),
		/revision limit.*exhausted/i,
	);
});

test("automation plan persistence publishes plan and ledger atomically and rejects stale saves", async () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-auto-plan-"));
	try {
		const { record, ledger } = compiledRecord();
		const filePath = path.join(directory, "plan.json");
		const persistence = new AutomationPlanPersistence(filePath);
		await persistence.save({ record, ledger: ledger.snapshot() });
		const loaded = persistence.load();
		assert.equal(loaded?.record.planId, record.planId);
		assert.equal(JSON.parse(readFileSync(filePath, "utf8")).record.version, record.version);
		await assert.rejects(
			persistence.save({
				record: { ...record, workflowGeneration: -1 },
				ledger: ledger.snapshot(),
			}),
			/generation/i,
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
