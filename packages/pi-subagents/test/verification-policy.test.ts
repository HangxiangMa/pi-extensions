import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeDelegationContract } from "../src/delegation-contract.js";
import {
	requiresIndependentVerification,
	validateWorkflowVerificationGraph,
} from "../src/verification-policy.js";

test("verification policy validates one distinct direct structured verifier", () => {
	assert.doesNotThrow(() =>
		validateWorkflowVerificationGraph(
			[
				{ id: "implementation", agent: "worker", resultFormat: "structured-v2" },
				{
					id: "verification",
					agent: "reviewer",
					dependsOn: ["implementation"],
					verifierFor: "implementation",
					resultFormat: "structured-v2",
				},
			],
			new Set(["implementation"]),
		),
	);
	for (const tasks of [
		[
			{ id: "implementation", agent: "worker", resultFormat: "structured-v2" },
			{
				id: "verification",
				agent: "worker",
				dependsOn: ["implementation"],
				verifierFor: "implementation",
				resultFormat: "structured-v2" as const,
			},
		],
		[
			{ id: "implementation", agent: "worker", resultFormat: "structured-v2" },
			{
				id: "verification",
				agent: "reviewer",
				dependsOn: ["implementation"],
				verifierFor: "implementation",
				resultFormat: "text" as const,
			},
		],
	] as const) {
		assert.throws(
			() => validateWorkflowVerificationGraph(tasks, new Set(["implementation"])),
			/distinct|structured-v2/i,
		);
	}
	assert.throws(
		() =>
			validateWorkflowVerificationGraph(
				[
					{ id: "implementation", agent: "worker", resultFormat: "text" },
					{
						id: "verification",
						agent: "reviewer",
						dependsOn: ["implementation"],
						verifierFor: "implementation",
						resultFormat: "structured-v2",
					},
				],
				new Set(["implementation"]),
			),
		/target.*structured-v2/i,
	);
	assert.throws(
		() =>
			validateWorkflowVerificationGraph(
				[
					{ id: "implementation", agent: "worker", resultFormat: "structured-v2" },
					{ id: "other", agent: "scout", resultFormat: "structured-v2" },
					{
						id: "verification",
						agent: "reviewer",
						dependsOn: ["implementation", "other"],
						verifierFor: "implementation",
						resultFormat: "structured-v2",
					},
				],
				new Set(["implementation"]),
			),
		/directly and only/i,
	);
	assert.throws(
		() =>
			validateWorkflowVerificationGraph(
				[
					{ id: "implementation", agent: "worker", resultFormat: "structured-v2" },
					{
						id: "verification-a",
						agent: "reviewer",
						dependsOn: ["implementation"],
						verifierFor: "implementation",
						resultFormat: "structured-v2",
					},
					{
						id: "verification-b",
						agent: "scout",
						dependsOn: ["implementation"],
						verifierFor: "implementation",
						resultFormat: "structured-v2",
					},
				],
				new Set(["implementation"]),
			),
		/exactly one/i,
	);
});

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
