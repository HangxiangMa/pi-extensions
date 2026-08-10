import assert from "node:assert/strict";
import { test } from "vitest";
import {
	ADMISSION_BENCHMARK_ARMS,
	type AdmissionBenchmarkAdapter,
	type AdmissionBenchmarkProtocol,
	validateAdmissionBenchmark,
} from "../src/admission-benchmark.js";

const protocol: AdmissionBenchmarkProtocol = {
	version: "pi-subagents:admission-benchmark:v1",
	model: "provider/model",
	evaluator: "tests-and-fresh-review",
	taskIds: ["task-a", "task-b"],
	pairedSeeds: [1, 2, 3],
	maxTokens: 100_000,
	maxCost: 10,
	maxWallClockMs: 600_000,
	maxRetries: 1,
	maxMutatingChildren: 2,
	maxRecursiveDepth: 0,
	arms: [...ADMISSION_BENCHMARK_ARMS],
};

function adapters(): AdmissionBenchmarkAdapter[] {
	return ADMISSION_BENCHMARK_ARMS.map((arm) => ({
		arm,
		model: protocol.model,
		evaluator: protocol.evaluator,
		maxTokens: protocol.maxTokens,
		maxCost: protocol.maxCost,
		maxWallClockMs: protocol.maxWallClockMs,
		maxRetries: protocol.maxRetries,
		mutatingChildren: arm === "fixed-two-child" ? 2 : 1,
		recursiveDepth: 0,
	}));
}

test("admission benchmark dry-run proves matched arms and paired repetitions", () => {
	assert.deepEqual(validateAdmissionBenchmark(protocol, adapters()), {
		version: "pi-subagents:admission-benchmark:v1",
		pairedInstances: 6,
		arms: [...ADMISSION_BENCHMARK_ARMS],
		valid: true,
	});
});

test("admission benchmark rejects resource confounds and wider recursive teams", () => {
	const mismatched = adapters();
	mismatched[0] = { ...mismatched[0], maxTokens: protocol.maxTokens + 1 };
	assert.throws(() => validateAdmissionBenchmark(protocol, mismatched), /matched resources/i);
	assert.throws(
		() =>
			validateAdmissionBenchmark(
				{ ...protocol, maxMutatingChildren: 3, maxRecursiveDepth: 1 },
				adapters(),
			),
		/at most two.*no recursion/i,
	);
});
