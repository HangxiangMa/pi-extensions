import assert from "node:assert/strict";
import { test } from "vitest";
import {
	AUTOMATION_BENCHMARK_ARMS,
	AUTOMATION_BENCHMARK_VERSION,
	validateAutomationBenchmark,
} from "../src/workflow-planning-benchmark.js";

const protocol = {
	version: AUTOMATION_BENCHMARK_VERSION,
	model: "matched-model",
	evaluator: "frozen-evaluator-v1",
	taskIds: ["read-only-recon", "verified-package-change", "sparse-two-boundary-change"],
	pairedSeeds: [11, 23, 47],
	maxTokens: 40_000,
	maxCost: 2,
	maxWallClockMs: 600_000,
	maxMutatingChildren: 2,
	maxRecursiveDepth: 0,
	arms: [...AUTOMATION_BENCHMARK_ARMS],
};

const adapters = AUTOMATION_BENCHMARK_ARMS.map((arm) => ({
	arm,
	model: protocol.model,
	evaluator: protocol.evaluator,
	maxTokens: protocol.maxTokens,
	maxCost: protocol.maxCost,
	maxWallClockMs: protocol.maxWallClockMs,
	mutatingChildren: arm === "strong-single-agent" ? 0 : 2,
	recursiveDepth: 0,
	informationPolicy: "identical-repository-context" as const,
	toolPolicy: "matched-authority-ceiling" as const,
}));

test("frozen automation benchmark validates repeated paired matched arms", () => {
	const dryRun = validateAutomationBenchmark(protocol, adapters);
	assert.equal(dryRun.valid, true);
	assert.equal(dryRun.pairedInstances, 9);
	assert.deepEqual(dryRun.arms, [...AUTOMATION_BENCHMARK_ARMS]);
});

test("automation benchmark rejects unequal information, budgets, width, and recursion", () => {
	for (const changed of [
		{ ...adapters[0], informationPolicy: "extra-context" },
		{ ...adapters[0], maxTokens: protocol.maxTokens + 1 },
		{ ...adapters[0], mutatingChildren: 3 },
		{ ...adapters[0], recursiveDepth: 1 },
	]) {
		assert.throws(
			() => validateAutomationBenchmark(protocol, [changed, ...adapters.slice(1)] as never),
			/matched|width|depth/i,
		);
	}
});
