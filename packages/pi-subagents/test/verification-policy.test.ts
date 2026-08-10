import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeDelegationContract } from "../src/delegation-contract.js";
import { requiresIndependentVerification } from "../src/verification-policy.js";

test("verification policy requires independent evidence by explicit risk instead of every lookup", () => {
	assert.equal(
		requiresIndependentVerification({
			integrationOwner: false,
			requiredCapabilities: ["repository-search"],
		}),
		false,
	);
	const contract = normalizeDelegationContract({
		version: "pi-subagents:delegation:v2",
		level: "full",
		taskId: "implementation",
		objective: "implement",
		sideEffectPolicy: "mutating",
		admission: {
			contextPressure: "medium",
			independentWorkItems: 1,
			coupling: "dense",
			verificationRequired: true,
			verificationAvailable: true,
			budgetAllowsChildren: true,
			requirementsComplete: true,
		},
	});
	assert.equal(
		requiresIndependentVerification({
			contract,
			integrationOwner: false,
			requiredCapabilities: [],
		}),
		true,
	);
});
