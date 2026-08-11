import assert from "node:assert/strict";
import { test } from "vitest";
import type { AgentConfig } from "../src/agents/types.js";
import {
	calculateExecutionBudget,
	mergeTurnLimits,
	resolveConfiguredTimeout,
} from "../src/execution/budget.js";

const agent = { name: "worker", timeoutMs: 300 } as AgentConfig;

test("configured timeout precedence is local, top-level, agent, then default", () => {
	assert.equal(resolveConfiguredTimeout([agent], "worker", 100, 200, 400), 100);
	assert.equal(resolveConfiguredTimeout([agent], "worker", undefined, 200, 400), 200);
	assert.equal(resolveConfiguredTimeout([agent], "worker", undefined, undefined, 400), 300);
	assert.equal(resolveConfiguredTimeout([], "worker", undefined, undefined, 400), 400);
});

test("turn limits merge each local field independently", () => {
	assert.deepEqual(
		mergeTurnLimits({ maxTurns: 2 }, { idleTimeoutMs: 100, maxTurns: 3, maxToolCalls: 4 }),
		{ idleTimeoutMs: 100, maxTurns: 2, maxToolCalls: 4 },
	);
});

test("execution budgets distinguish work and orchestration deadlines", () => {
	assert.deepEqual(calculateExecutionBudget({ requestedTimeoutMs: 100, now: 1 }), {
		timeoutMs: 100,
		workTimeoutReason: "work_timeout",
		workTimeoutReportLimit: 100,
	});
	assert.deepEqual(
		calculateExecutionBudget({
			requestedTimeoutMs: 100,
			orchestrationDeadline: 51,
			totalTimeoutMs: 500,
			now: 1,
		}),
		{
			timeoutMs: 50,
			workTimeoutReason: "orchestration_timeout",
			workTimeoutReportLimit: 500,
		},
	);
	assert.equal(
		calculateExecutionBudget({
			requestedTimeoutMs: 100,
			orchestrationDeadline: 1,
			totalTimeoutMs: 500,
			now: 1,
		}),
		undefined,
	);
});
