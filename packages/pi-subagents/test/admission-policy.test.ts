import assert from "node:assert/strict";
import { test } from "vitest";
import { evaluateDelegationAdmission } from "../src/admission-policy.js";

test("admission policy stays audit-only and abstains on stale or ambiguous metadata", () => {
	assert.deepEqual(
		evaluateDelegationAdmission({
			contextPressure: "high",
			independentWorkItems: 2,
			coupling: "sparse",
			verificationRequired: true,
			verificationAvailable: true,
			capabilitiesSupported: true,
			budgetAllowsChildren: true,
			generationCurrent: false,
			requirementsComplete: true,
		}),
		{
			version: "pi-subagents:admission:v1",
			recommendation: "abstain-insufficient-evidence",
			reasonCodes: ["stale-generation"],
			benefitHypothesis: "none",
			auditOnly: true,
		},
	);
});

test("admission policy selects the smallest architecture justified by explicit metadata", () => {
	const common = {
		verificationRequired: false,
		verificationAvailable: true,
		capabilitiesSupported: true,
		budgetAllowsChildren: true,
		generationCurrent: true,
		requirementsComplete: true,
	} as const;
	assert.equal(
		evaluateDelegationAdmission({
			...common,
			contextPressure: "low",
			independentWorkItems: 1,
			coupling: "dense",
		}).recommendation,
		"parent-owned-direct",
	);
	assert.equal(
		evaluateDelegationAdmission({
			...common,
			contextPressure: "high",
			independentWorkItems: 1,
			coupling: "dense",
		}).recommendation,
		"one-child",
	);
	assert.equal(
		evaluateDelegationAdmission({
			...common,
			contextPressure: "medium",
			independentWorkItems: 2,
			coupling: "sparse",
		}).recommendation,
		"bounded-two-child",
	);
});

test("admission policy recommends independent verification only when declared and available", () => {
	const recommendation = evaluateDelegationAdmission({
		contextPressure: "medium",
		independentWorkItems: 1,
		coupling: "dense",
		verificationRequired: true,
		verificationAvailable: true,
		capabilitiesSupported: true,
		budgetAllowsChildren: true,
		generationCurrent: true,
		requirementsComplete: true,
	});
	assert.equal(recommendation.recommendation, "one-child-plus-verification");
	assert.equal(recommendation.auditOnly, true);
});
