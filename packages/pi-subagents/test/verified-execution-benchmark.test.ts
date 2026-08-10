import assert from "node:assert/strict";
import { test } from "vitest";
import { evaluateVerifiedExecutionBenchmark } from "../src/verified-execution-benchmark.js";

test("verified execution benchmark compares matched false acceptance and added cost without a quality claim", () => {
	const result = evaluateVerifiedExecutionBenchmark([
		{
			id: "valid",
			shouldAccept: true,
			workerSelfReport: true,
			independentVerifier: true,
			exactTreeVerification: true,
			workerCostUnits: 10,
			verifierCostUnits: 3,
			deterministicCostUnits: 1,
		},
		{
			id: "self-report-false-acceptance",
			shouldAccept: false,
			workerSelfReport: true,
			independentVerifier: false,
			exactTreeVerification: false,
			workerCostUnits: 10,
			verifierCostUnits: 3,
			deterministicCostUnits: 1,
		},
		{
			id: "verifier-drift-false-acceptance",
			shouldAccept: false,
			workerSelfReport: true,
			independentVerifier: true,
			exactTreeVerification: false,
			workerCostUnits: 10,
			verifierCostUnits: 3,
			deterministicCostUnits: 1,
		},
	]);
	assert.equal(result.matchedCases, 3);
	assert.equal(result.qualityClaim, false);
	assert.deepEqual(
		result.arms.map((arm) => ({
			arm: arm.arm,
			falseAcceptances: arm.falseAcceptances,
			addedCostUnits: arm.addedCostUnits,
		})),
		[
			{ arm: "worker-self-report", falseAcceptances: 2, addedCostUnits: 0 },
			{ arm: "independent-verifier", falseAcceptances: 1, addedCostUnits: 9 },
			{ arm: "deterministic-exact-tree", falseAcceptances: 0, addedCostUnits: 12 },
		],
	);
});
