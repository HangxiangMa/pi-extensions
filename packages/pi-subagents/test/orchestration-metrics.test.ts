import assert from "node:assert/strict";
import { test } from "vitest";
import { calculateOrchestrationMetrics } from "../src/orchestration-metrics.js";
import type { SingleResult } from "../src/runner.js";
import { WorkItemLedger } from "../src/work-item-ledger.js";

const result: SingleResult = {
	agent: "explorer",
	agentSource: "built-in",
	task: "inspect",
	exitCode: 0,
	messages: [],
	stderr: "",
	usage: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		contextTokens: 0,
		turns: 0,
	},
	finalOutput: "done",
	attemptCount: 2,
	hedged: true,
};

test("orchestration metrics expose bounded transfer, cascade, retry, and hedge evidence", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [{ id: "task", objective: "task", dependencies: [] }],
	});
	ledger.start("task", "agent-task");
	ledger.complete("task", { taskGeneration: ledger.get("task")?.taskGeneration ?? 0 });
	assert.deepEqual(calculateOrchestrationMetrics(ledger.snapshot(), [result]), {
		workItems: 1,
		completed: 1,
		failedOrBlocked: 0,
		invalidated: 0,
		requiredTransfers: 0,
		resolvedTransfers: 0,
		transferCoverage: 1,
		attempts: 2,
		hedgedTasks: 1,
		requestedTools: 0,
		effectiveRequestedTools: 0,
		permissionPrecision: 1,
		workerReportedVerification: 0,
		executorAcceptedVerification: 0,
		verificationRework: 0,
		verificationRejected: 0,
		verificationInvalid: 0,
		verificationTreeMismatch: 0,
	});
});
