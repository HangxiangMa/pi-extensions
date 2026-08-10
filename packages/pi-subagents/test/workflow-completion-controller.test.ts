import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import type { StructuredSubagentResultV2 } from "../src/result-contract.js";
import { WorkItemLedger } from "../src/work-item-ledger.js";
import { WorkflowCompletionController } from "../src/workflow-completion-controller.js";

const PLAN_A = "a".repeat(64);
const PLAN_B = "b".repeat(64);

function repository(): string {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-completion-controller-test-"));
	execFileSync("git", ["init", "-q", root]);
	execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
	execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
	writeFileSync(path.join(root, "feature.txt"), "base\n");
	execFileSync("git", ["-C", root, "add", "feature.txt"]);
	execFileSync("git", ["-C", root, "commit", "-qm", "initial"]);
	return root;
}

function ledger(maxReworkCycles: 0 | 1 = 1): WorkItemLedger {
	return WorkItemLedger.create({
		workflowId: "verified",
		items: [
			{
				id: "implementation",
				objective: "Implement the feature",
				dependencies: [],
				writePaths: ["feature.txt"],
				acceptanceCriteria: ["feature is correct"],
				requiredEvidence: ["focused-test"],
				integrationOwner: true,
				acceptanceRequired: true,
				maxReworkCycles,
			},
			{
				id: "verify-implementation",
				objective: "verify",
				dependencies: ["implementation"],
				verifierFor: "implementation",
			},
		],
	});
}

function verdict(decision: "accept" | "rework" | "reject"): StructuredSubagentResultV2 {
	return {
		version: "pi-subagents:result:v2",
		status: decision === "accept" ? "completed" : decision === "rework" ? "partial" : "failed",
		reasonCode:
			decision === "accept"
				? "verification-accepted"
				: decision === "rework"
					? "verification-rework"
					: "verification-rejected",
		summary: `${decision} current state`,
		claims:
			decision === "reject"
				? [{ claim: "broken", classification: "observed", evidence: ["focused-test"] }]
				: [],
		artifacts: [],
		changes: [],
		verification: [
			{ status: decision === "accept" ? "passed" : "failed", summary: "focused-test" },
		],
		limitations: decision === "rework" ? ["repair the feature"] : [],
		unresolvedDependencies: [],
	};
}

test("completion controller is the sole accept owner over exact state and deterministic evidence", async () => {
	const root = repository();
	try {
		writeFileSync(path.join(root, "feature.txt"), "implemented\n");
		const work = ledger();
		const controller = new WorkflowCompletionController({
			ledger: work,
			cwd: root,
			targetTaskId: "implementation",
			verifierTaskId: "verify-implementation",
			checks: [{ id: "focused-test", command: "node", args: ["-e", "process.exit(0)"] }],
		});
		const target = work.start("implementation", "agent:worker");
		await controller.stageTarget({
			taskGeneration: target.taskGeneration,
			executionPlanId: PLAN_A,
			artifacts: [],
		});
		const prompt = controller.verifierPrompt();
		assert.match(prompt, /Implement the feature/u);
		assert.match(prompt, /focused-test/u);
		assert.doesNotMatch(prompt, /worker says|worker summary/iu);
		const verifier = work.start("verify-implementation", "agent:reviewer");
		const outcome = await controller.completeVerifier({
			taskGeneration: verifier.taskGeneration,
			executionPlanId: PLAN_B,
			verifierAgent: "reviewer",
			result: verdict("accept"),
		});
		assert.equal(outcome.decision, "accept");
		assert.equal(work.get("implementation")?.acceptanceState, "accepted");
		assert.equal(work.get("implementation")?.acceptanceReceipt?.patchDigest.length, 64);
		controller.dispose();
		controller.dispose();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("completion controller cancels session replacement and rejects post-await stale generations", async () => {
	const root = repository();
	const marker = path.join(root, "check-started");
	try {
		writeFileSync(path.join(root, "feature.txt"), "implemented\n");
		const abort = new AbortController();
		const work = ledger();
		const controller = new WorkflowCompletionController({
			ledger: work,
			cwd: root,
			targetTaskId: "implementation",
			verifierTaskId: "verify-implementation",
			checks: [
				{
					id: "focused-test",
					command: "node",
					args: [
						"-e",
						`require('fs').writeFileSync(${JSON.stringify(marker)},'started');setTimeout(()=>{},300)`,
					],
				},
			],
			signal: abort.signal,
		});
		const started = work.start("implementation", "agent:worker");
		const staging = controller.stageTarget({
			taskGeneration: started.taskGeneration,
			executionPlanId: PLAN_A,
		});
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				execFileSync("test", ["-f", marker]);
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
		}
		work.invalidate("implementation", "session-replaced");
		await assert.rejects(staging, /stale|generation/i);
		assert.equal(work.get("implementation")?.acceptanceState, "rejected");
		assert.equal(work.get("implementation")?.verificationAccepted, false);
		controller.dispose();
		controller.dispose();

		abort.abort();
		const cancelled = ledger();
		const cancelledController = new WorkflowCompletionController({
			ledger: cancelled,
			cwd: root,
			targetTaskId: "implementation",
			verifierTaskId: "verify-implementation",
			checks: [{ id: "focused-test", command: "node", args: ["-e", "setTimeout(()=>{},300)"] }],
			signal: abort.signal,
		});
		const cancelledTarget = cancelled.start("implementation", "agent:worker");
		await assert.rejects(
			() =>
				cancelledController.stageTarget({
					taskGeneration: cancelledTarget.taskGeneration,
					executionPlanId: PLAN_A,
				}),
			/abort|cancel/i,
		);
		assert.notEqual(cancelled.get("implementation")?.acceptanceState, "accepted");
		cancelledController.dispose();
		assert.throws(
			() =>
				new WorkflowCompletionController({
					ledger: WorkItemLedger.create({
						workflowId: "partial",
						items: [{ id: "implementation", objective: "bad", dependencies: [] }],
					}),
					cwd: root,
					targetTaskId: "implementation",
					verifierTaskId: "missing",
					checks: [],
				}),
			/invalid acceptance graph/i,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("completion controller aborts deterministic checks at the workflow deadline", async () => {
	const root = repository();
	try {
		writeFileSync(path.join(root, "feature.txt"), "implemented\n");
		const work = ledger();
		const controller = new WorkflowCompletionController({
			ledger: work,
			cwd: root,
			targetTaskId: "implementation",
			verifierTaskId: "verify-implementation",
			checks: [{ id: "focused-test", command: "node", args: ["-e", "setTimeout(()=>{},300)"] }],
			deadlineAt: Date.now() + 50,
		});
		const target = work.start("implementation", "agent:worker");
		await assert.rejects(
			() =>
				controller.stageTarget({
					taskGeneration: target.taskGeneration,
					executionPlanId: PLAN_A,
				}),
			/workflow deadline|cancel/iu,
		);
		assert.equal(work.get("implementation")?.state, "blocked");
		assert.equal(work.get("implementation")?.outcomeReason, "budget-exhausted");
		controller.dispose();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("completion controller rotates one rework generation and rejects verifier-caused drift", async () => {
	const root = repository();
	try {
		writeFileSync(path.join(root, "feature.txt"), "implemented\n");
		const work = ledger();
		const controller = new WorkflowCompletionController({
			ledger: work,
			cwd: root,
			targetTaskId: "implementation",
			verifierTaskId: "verify-implementation",
			checks: [{ id: "focused-test", command: "node", args: ["-e", "process.exit(0)"] }],
		});
		const target = work.start("implementation", "agent:worker");
		await controller.stageTarget({
			taskGeneration: target.taskGeneration,
			executionPlanId: PLAN_A,
		});
		const verifier = work.start("verify-implementation", "agent:reviewer");
		const rework = await controller.completeVerifier({
			taskGeneration: verifier.taskGeneration,
			executionPlanId: PLAN_B,
			verifierAgent: "reviewer",
			result: verdict("rework"),
		});
		assert.equal(rework.decision, "rework");
		const rotated = controller.beginRework();
		assert.equal(rotated.taskGeneration, target.taskGeneration + 1);
		assert.match(controller.reworkPrompt(), /repair the feature/u);

		const rerun = work.start("implementation", "agent:worker");
		await controller.stageTarget({ taskGeneration: rerun.taskGeneration, executionPlanId: PLAN_A });
		const secondVerifier = work.start("verify-implementation", "agent:reviewer");
		writeFileSync(path.join(root, "feature.txt"), "verifier mutation\n");
		await assert.rejects(
			() =>
				controller.completeVerifier({
					taskGeneration: secondVerifier.taskGeneration,
					executionPlanId: PLAN_B,
					verifierAgent: "reviewer",
					result: verdict("accept"),
				}),
			/drift|changed during verifier/i,
		);
		assert.notEqual(work.get("implementation")?.acceptanceState, "accepted");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
