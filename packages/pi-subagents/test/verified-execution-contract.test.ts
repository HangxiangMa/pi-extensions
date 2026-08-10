import assert from "node:assert/strict";
import { Check } from "typebox/value";
import { test } from "vitest";
import { SubagentParams } from "../src/params.js";
import {
	prepareVerifiedWorkflow,
	type VerifiedExecutionContract,
} from "../src/verified-execution-contract.js";
import type { ResolvedWorkflowTask } from "../src/workflow-planning.js";

const contract: VerifiedExecutionContract = {
	verifierAgent: "reviewer",
	maxReworkCycles: 1,
	checks: [{ id: "focused-test", command: "npm", args: ["test"] }],
};

function worker(overrides: Partial<ResolvedWorkflowTask> = {}): ResolvedWorkflowTask {
	return {
		id: "implementation",
		agent: "worker",
		task: "implement",
		writePaths: ["src"],
		resultFormat: "structured-v2",
		...overrides,
	};
}

test("verified execution schema is explicit, provider-compatible, and strict", () => {
	const params = {
		workflow: {
			verifiedExecution: contract,
			tasks: [worker()],
		},
	};
	assert.equal(Check(SubagentParams, params), true);
	assert.equal(
		Check(SubagentParams, {
			workflow: { ...params.workflow, verifiedExecution: { ...contract, unknown: true } },
		}),
		false,
	);
	assert.equal(
		Check(SubagentParams, {
			workflow: {
				...params.workflow,
				verifiedExecution: {
					...contract,
					checks: [{ id: "bad", command: "sh", args: ["-c", "true"] }],
				},
			},
		}),
		false,
	);
});

test("verified execution reconciles inferred ownership and synthesizes one least-authority verifier", () => {
	const prepared = prepareVerifiedWorkflow([worker()], contract);
	assert.equal(prepared.targetTaskId, "implementation");
	assert.equal(prepared.tasks.find((task) => task.id === "implementation")?.integrationOwner, true);
	const verifier = prepared.tasks.find((task) => task.verifierFor === "implementation");
	assert.ok(verifier);
	assert.equal(verifier.agent, "reviewer");
	assert.deepEqual(verifier.dependsOn, ["implementation"]);
	assert.equal(verifier.resultFormat, "structured-v2");
	assert.equal(verifier.contract?.sideEffectPolicy, "read-only");
	assert.equal(verifier.contract?.enforcement, "enforce");
	assert.deepEqual(verifier.contract?.requestedAuthority?.tools, ["read"]);
	assert.deepEqual(verifier.requiredTools, ["read"]);
});

test("verified execution rejects self-verification, mutable verifier authority, and excess mutation", () => {
	assert.throws(
		() => prepareVerifiedWorkflow([worker()], { ...contract, verifierAgent: "worker" }),
		/distinct/i,
	);
	assert.throws(
		() =>
			prepareVerifiedWorkflow(
				[
					worker(),
					{
						id: "verification",
						agent: "reviewer",
						task: "verify",
						dependsOn: ["implementation"],
						verifierFor: "implementation",
						resultFormat: "structured-v2",
						contract: {
							version: "pi-subagents:delegation:v2",
							level: "minimal",
							taskId: "verification",
							objective: "verify",
							sideEffectPolicy: "mutating",
						},
					},
				],
				contract,
			),
		/mutable|read-only/i,
	);
	assert.throws(
		() =>
			prepareVerifiedWorkflow(
				[
					worker(),
					worker({ id: "second", task: "second" }),
					worker({ id: "third", task: "third" }),
				],
				contract,
			),
		/two mutating/i,
	);
	assert.throws(
		() =>
			prepareVerifiedWorkflow(
				[worker(), worker({ id: "integration", task: "integrate", integrationOwner: true })],
				contract,
			),
		/depend on every other mutating/i,
	);
	const integrated = prepareVerifiedWorkflow(
		[
			worker(),
			worker({
				id: "integration",
				task: "integrate",
				integrationOwner: true,
				dependsOn: ["implementation"],
			}),
		],
		contract,
	);
	assert.equal(integrated.targetTaskId, "integration");
});
