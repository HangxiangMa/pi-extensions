import assert from "node:assert/strict";
import { test } from "vitest";
import type { VerificationReceipt } from "../src/verification-receipt.js";
import { type CompleteWorkItemInput, WorkItemLedger } from "../src/work-item-ledger.js";
import type { WorkflowTreeIdentity } from "../src/workflow-tree-identity.js";
import type { WorkflowVerificationReceipt } from "../src/workflow-verification.js";

function complete(
	ledger: WorkItemLedger,
	id: string,
	input: Omit<CompleteWorkItemInput, "taskGeneration"> = {},
): void {
	ledger.complete(id, { ...input, taskGeneration: ledger.get(id)?.taskGeneration ?? 0 });
}

const PLAN_A = "a".repeat(64);
const PLAN_B = "b".repeat(64);
const TREE: WorkflowTreeIdentity = {
	version: "pi-subagents:workflow-tree:v1",
	kind: "git-dirty",
	digest: "c".repeat(64),
};

function verificationLedger(): WorkItemLedger {
	return WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{ id: "implementation", objective: "implement", dependencies: [] },
			{
				id: "verification",
				objective: "verify",
				dependencies: ["implementation"],
				verifierFor: "implementation",
			},
			{ id: "consumer", objective: "consume", dependencies: ["implementation"] },
		],
	});
}

function receipt(
	decision: WorkflowVerificationReceipt["decision"],
	targetTaskGeneration: number,
	verifierTaskGeneration: number,
): WorkflowVerificationReceipt {
	return {
		version: "pi-subagents:workflow-verification:v1",
		decision,
		targetTaskId: "implementation",
		targetTaskGeneration,
		targetExecutionPlanId: PLAN_A,
		verifierTaskId: "verification",
		verifierTaskGeneration,
		verifierExecutionPlanId: PLAN_B,
		treeIdentity: TREE,
		summary: `${decision} summary`,
		evidence: ["evidence"],
		limitations: decision === "rework" ? ["rework needed"] : [],
		createdAt: 123,
		truncated: false,
	};
}

test("WorkItemLedger rejects invalid dependencies and cycles before activation", () => {
	assert.throws(
		() =>
			WorkItemLedger.create({
				workflowId: "wf",
				items: [{ id: "a", objective: "a", dependencies: ["missing"] }],
			}),
		/missing dependency/i,
	);
	assert.throws(
		() =>
			WorkItemLedger.create({
				workflowId: "wf",
				items: [
					{ id: "a", objective: "a", dependencies: ["b"] },
					{ id: "b", objective: "b", dependencies: ["a"] },
				],
			}),
		/cycle/i,
	);
});

test("WorkItemLedger exposes only dependency-ready work and preserves artifact provenance", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{ id: "a", objective: "produce", dependencies: [] },
			{ id: "b", objective: "consume", dependencies: ["a"], inputArtifacts: ["schema"] },
		],
	});
	assert.deepEqual(
		ledger.readyItems().map((item) => item.id),
		["a"],
	);
	ledger.start("a", "agent-a");
	complete(ledger, "a", {
		artifacts: [{ id: "schema", kind: "document", version: "v1", digest: "sha256:one" }],
	});
	assert.deepEqual(
		ledger.readyItems().map((item) => item.id),
		["b"],
	);
	const b = ledger.get("b");
	assert.equal(b?.inputArtifactVersions.schema, "v1");
	assert.equal(b?.generation, ledger.snapshot().generation);
});

test("WorkItemLedger does not release a consumer for the wrong artifact version", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{ id: "a", objective: "produce", dependencies: [] },
			{
				id: "b",
				objective: "consume",
				dependencies: ["a"],
				inputArtifacts: ["schema"],
				inputArtifactVersions: { schema: "v2" },
			},
		],
	});
	ledger.start("a", "agent-a");
	complete(ledger, "a", {
		artifacts: [{ id: "schema", kind: "document", version: "v1" }],
	});
	assert.deepEqual(ledger.readyItems(), []);
	assert.equal(ledger.get("b")?.state, "pending");
});

test("WorkItemLedger invalidates downstream work transitively without deleting evidence", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{ id: "a", objective: "a", dependencies: [] },
			{ id: "b", objective: "b", dependencies: ["a"] },
			{ id: "c", objective: "c", dependencies: ["b"] },
		],
	});
	ledger.start("a", "agent-a");
	complete(ledger, "a", { artifacts: [{ id: "patch", kind: "patch", version: "v1" }] });
	ledger.start("b", "agent-b");
	complete(ledger, "b", { artifacts: [{ id: "review", kind: "report", version: "v1" }] });
	const previousTaskGeneration = ledger.get("a")?.taskGeneration;
	ledger.invalidate("a", "artifact-superseded");
	assert.equal(ledger.get("a")?.state, "stale");
	assert.equal(ledger.get("a")?.taskGeneration, (previousTaskGeneration ?? 0) + 1);
	assert.equal(ledger.get("b")?.state, "invalidated");
	assert.equal(ledger.get("c")?.state, "invalidated");
	assert.equal(ledger.get("a")?.artifacts[0]?.id, "patch");
	assert.ok((ledger.get("c")?.invalidationReasons.length ?? 0) > 0);
	ledger.rerun("a");
	ledger.start("a", "agent-a");
	complete(ledger, "a", { artifacts: [{ id: "patch", kind: "patch", version: "v2" }] });
	assert.equal(ledger.get("a")?.artifacts[0]?.version, "v2");
	assert.equal(ledger.get("a")?.artifactHistory[0]?.version, "v1");
});

test("WorkItemLedger rejects a late completion from a replaced task generation", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [{ id: "task", objective: "task", dependencies: [] }],
	});
	const original = ledger.start("task", "agent-old");
	ledger.invalidate("task", "replaced");
	ledger.rerun("task");
	ledger.start("task", "agent-new");
	assert.throws(
		() => ledger.complete("task", { taskGeneration: original.taskGeneration }),
		/stale task generation/i,
	);
});

test("WorkItemLedger restores legacy v1 snapshots without trusting self-reported verification", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [{ id: "task", objective: "task", dependencies: [] }],
	});
	const started = ledger.start("task", "agent-worker");
	ledger.complete("task", {
		taskGeneration: started.taskGeneration,
		artifacts: [{ id: "patch", kind: "patch", version: "v1" }],
	});
	const legacy = ledger.snapshot();
	legacy.version = "pi-subagents:work-ledger:v1" as never;
	legacy.items[0].verificationAccepted = true;
	legacy.items[0].artifacts[0].verified = true;
	legacy.items[0].artifactHistory = [structuredClone(legacy.items[0].artifacts[0])];
	const restored = WorkItemLedger.restore(legacy);
	assert.equal(restored.snapshot().version, "pi-subagents:work-ledger:v3");
	assert.equal(restored.get("task")?.verificationAccepted, false);
	assert.equal(restored.get("task")?.artifacts[0]?.verified, false);
	assert.equal(restored.get("task")?.artifactHistory[0]?.verified, false);
});

test("WorkItemLedger rejects malformed persisted identity and artifact metadata", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [{ id: "task", objective: "task", dependencies: [] }],
	});
	const snapshot = ledger.snapshot();
	snapshot.items[0].acceptedExecutionPlanId = "not-a-plan";
	assert.throws(() => WorkItemLedger.restore(snapshot), /malformed stored/i);

	const malformedAgent = ledger.snapshot();
	malformedAgent.items[0].assignedAgentId = "bad agent id";
	assert.throws(() => WorkItemLedger.restore(malformedAgent), /malformed stored/i);
	const malformedOwner = ledger.snapshot();
	malformedOwner.items[0].integrationOwner = "yes" as never;
	assert.throws(() => WorkItemLedger.restore(malformedOwner), /malformed stored/i);
	const malformedObjective = ledger.snapshot();
	malformedObjective.items[0].objective = " task ";
	assert.throws(() => WorkItemLedger.restore(malformedObjective), /malformed stored/i);

	ledger.start("task", "agent-task");
	complete(ledger, "task", {
		artifacts: [{ id: "patch", kind: "patch", version: "v1" }],
	});
	const malformedArtifact = ledger.snapshot();
	malformedArtifact.items[0].artifacts[0].verified = "yes" as never;
	assert.throws(() => WorkItemLedger.restore(malformedArtifact), /malformed stored/i);
	const futureArtifact = ledger.snapshot();
	futureArtifact.items[0].artifacts[0].generation = futureArtifact.items[0].generation + 1;
	assert.throws(() => WorkItemLedger.restore(futureArtifact), /malformed stored/i);
	const duplicateArtifact = ledger.snapshot();
	duplicateArtifact.items[0].artifacts.push(
		structuredClone(duplicateArtifact.items[0].artifacts[0]),
	);
	assert.throws(() => WorkItemLedger.restore(duplicateArtifact), /malformed stored/i);

	const verified = verificationLedger();
	const implementation = verified.start("implementation", "agent-worker");
	verified.stageForVerification("implementation", {
		taskGeneration: implementation.taskGeneration,
		executionPlanId: PLAN_A,
		treeIdentity: TREE,
	});
	const verifier = verified.start("verification", "agent-reviewer");
	verified.completeVerification("verification", {
		taskGeneration: verifier.taskGeneration,
		executionPlanId: PLAN_B,
		receipt: receipt("accept", implementation.taskGeneration, verifier.taskGeneration),
	});
	const malformedReceipt = verified.snapshot();
	malformedReceipt.items[0].verificationReceipt = {
		...malformedReceipt.items[0].verificationReceipt,
		targetTaskId: "other",
	} as never;
	assert.throws(() => WorkItemLedger.restore(malformedReceipt), /malformed stored/i);
	const malformedLink = verified.snapshot();
	const storedVerifier = malformedLink.items.find((item) => item.id === "verification");
	assert.ok(storedVerifier);
	storedVerifier.acceptedExecutionPlanId = "c".repeat(64);
	assert.throws(() => WorkItemLedger.restore(malformedLink), /verification link/i);
});

test("WorkItemLedger stages verification-required work and releases only its verifier", () => {
	const ledger = verificationLedger();
	const implementation = ledger.start("implementation", "agent-worker");
	ledger.stageForVerification("implementation", {
		taskGeneration: implementation.taskGeneration,
		executionPlanId: PLAN_A,
		artifacts: [{ id: "patch", kind: "patch", version: "v1", verified: true }],
		treeIdentity: TREE,
	});
	assert.equal(ledger.get("implementation")?.state, "awaiting-verification");
	assert.equal(ledger.get("implementation")?.artifacts[0]?.verified, false);
	assert.deepEqual(
		ledger.readyItems().map((item) => item.id),
		["verification"],
	);
	assert.equal(ledger.get("consumer")?.state, "pending");
});

test("WorkItemLedger accepts only an executor-owned current verifier receipt", () => {
	const ledger = verificationLedger();
	const implementation = ledger.start("implementation", "agent-worker");
	ledger.stageForVerification("implementation", {
		taskGeneration: implementation.taskGeneration,
		executionPlanId: PLAN_A,
		artifacts: [{ id: "patch", kind: "patch", version: "v1" }],
		treeIdentity: TREE,
	});
	const verification = ledger.start("verification", "agent-reviewer");
	ledger.completeVerification("verification", {
		taskGeneration: verification.taskGeneration,
		executionPlanId: PLAN_B,
		receipt: receipt("accept", implementation.taskGeneration, verification.taskGeneration),
	});
	assert.equal(ledger.get("implementation")?.state, "completed");
	assert.equal(ledger.get("implementation")?.verificationAccepted, true);
	assert.equal(ledger.get("implementation")?.artifacts[0]?.verified, true);
	assert.equal(ledger.get("verification")?.state, "completed");
	assert.deepEqual(
		ledger.readyItems().map((item) => item.id),
		["consumer"],
	);

	const stale = verificationLedger();
	const staleImplementation = stale.start("implementation", "agent-worker");
	stale.stageForVerification("implementation", {
		taskGeneration: staleImplementation.taskGeneration,
		executionPlanId: PLAN_A,
		treeIdentity: TREE,
	});
	const staleVerifier = stale.start("verification", "agent-reviewer");
	assert.throws(
		() =>
			stale.completeVerification("verification", {
				taskGeneration: staleVerifier.taskGeneration,
				executionPlanId: PLAN_B,
				receipt: receipt("accept", 99, staleVerifier.taskGeneration),
			}),
		/stale|generation/i,
	);
});

test("WorkItemLedger preserves verifier evidence while rework and reject block acceptance", () => {
	for (const decision of ["rework", "reject"] as const) {
		const ledger = verificationLedger();
		const implementation = ledger.start("implementation", "agent-worker");
		ledger.stageForVerification("implementation", {
			taskGeneration: implementation.taskGeneration,
			executionPlanId: PLAN_A,
			treeIdentity: TREE,
		});
		const verification = ledger.start("verification", "agent-reviewer");
		ledger.completeVerification("verification", {
			taskGeneration: verification.taskGeneration,
			executionPlanId: PLAN_B,
			receipt: receipt(decision, implementation.taskGeneration, verification.taskGeneration),
		});
		assert.equal(ledger.get("implementation")?.state, decision === "rework" ? "blocked" : "failed");
		assert.equal(ledger.get("implementation")?.verificationAccepted, false);
		assert.equal(ledger.get("verification")?.state, "completed");
		assert.equal(ledger.get("consumer")?.state, "invalidated");
		assert.equal(ledger.get("implementation")?.verificationReceipt?.decision, decision);
	}
});

test("WorkItemLedger rejects late verifier acceptance after target cancellation", () => {
	const ledger = verificationLedger();
	const implementation = ledger.start("implementation", "agent-worker");
	ledger.stageForVerification("implementation", {
		taskGeneration: implementation.taskGeneration,
		executionPlanId: PLAN_A,
		treeIdentity: TREE,
	});
	const verification = ledger.start("verification", "agent-reviewer");
	ledger.invalidate("implementation", "cancelled");
	assert.throws(
		() =>
			ledger.completeVerification("verification", {
				taskGeneration: verification.taskGeneration,
				executionPlanId: PLAN_B,
				receipt: receipt("accept", implementation.taskGeneration, verification.taskGeneration),
			}),
		/stale|running verifier|awaiting verification|terminal/i,
	);
	assert.equal(ledger.get("implementation")?.state, "stale");
	assert.equal(ledger.get("implementation")?.verificationAccepted, false);
});

test("WorkItemLedger persists execution separately from verified acceptance and ignores worker self-report", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "verified",
		items: [
			{
				id: "implementation",
				objective: "implement",
				dependencies: [],
				integrationOwner: true,
				acceptanceRequired: true,
				requiredEvidence: ["focused-test"],
				maxReworkCycles: 1,
			},
			{
				id: "verify-implementation",
				objective: "verify",
				dependencies: ["implementation"],
				verifierFor: "implementation",
			},
			{ id: "consumer", objective: "consume", dependencies: ["implementation"] },
		],
	});
	const implementation = ledger.start("implementation", "agent-worker");
	ledger.stageForVerifiedAcceptance("implementation", {
		taskGeneration: implementation.taskGeneration,
		executionPlanId: PLAN_A,
		artifacts: [{ id: "focused-test", kind: "test", version: "v1", verified: true }],
		treeIdentity: TREE,
		baseRepositoryGeneration: "d".repeat(40),
		patchDigest: "e".repeat(64),
		changedPaths: ["src/feature.ts"],
		fileVersions: { "src/feature.ts": "f".repeat(64) },
	});
	const staged = ledger.get("implementation");
	assert.equal(staged?.state, "completed");
	assert.equal(staged?.acceptanceState, "pending");
	assert.equal(staged?.verificationAccepted, false);
	assert.equal(staged?.artifacts[0]?.verified, false);
	assert.deepEqual(
		ledger.readyItems().map((item) => item.id),
		["verify-implementation"],
	);
	assert.equal(ledger.get("consumer")?.state, "pending");

	const restored = WorkItemLedger.restore(ledger.snapshot());
	assert.equal(restored.get("implementation")?.state, "interrupted");
	assert.equal(restored.get("implementation")?.acceptanceState, "rejected");
});

function verifiedReceipt(
	decision: VerificationReceipt["decision"],
	targetGeneration: number,
	verifierGeneration: number,
): VerificationReceipt {
	return {
		version: "pi-subagents:verification-receipt:v1",
		decision,
		targetTaskId: "implementation",
		targetTaskGeneration: targetGeneration,
		targetExecutionPlanId: PLAN_A,
		verifierTaskId: "verify-implementation",
		verifierTaskGeneration: verifierGeneration,
		verifierExecutionPlanId: PLAN_B,
		verifierAgent: "reviewer",
		beforeTreeIdentity: TREE,
		afterTreeIdentity: TREE,
		baseRepositoryGeneration: "d".repeat(40),
		patchDigest: "e".repeat(64),
		changedPaths: ["src/feature.ts"],
		allowedScopes: ["src"],
		dependencyVersions: {},
		readSetVersions: { "src/feature.ts": "f".repeat(64) },
		acceptanceCriteria: ["works"],
		requiredEvidenceIds: ["focused-test"],
		evidence: { "focused-test": "deterministic-check:passed" },
		checks: [],
		summary: `${decision} summary`,
		findings: decision === "accept" ? [] : ["fix the regression"],
		createdAt: 123,
		sourceTruncated: false,
	};
}

function managedExpectation(targetGeneration: number) {
	return {
		taskId: "implementation",
		taskGeneration: targetGeneration,
		baseRepositoryGeneration: "d".repeat(40),
		dependencyVersions: {},
		readSetVersions: { "src/feature.ts": "f".repeat(64) },
		executionPlanId: PLAN_A,
		allowedScopes: ["src"],
		patchDigest: "e".repeat(64),
		requiredEvidence: ["focused-test"],
	};
}

function managedCandidate(targetGeneration: number) {
	return {
		...managedExpectation(targetGeneration),
		changedPaths: ["src/feature.ts"],
		evidence: { "focused-test": "deterministic-check:passed" },
		verifier: { freshContext: true, exactIntegratedTree: true, status: "accepted" as const },
	};
}

test("WorkItemLedger atomically accepts managed integration and permits only one rework generation", () => {
	const create = () =>
		WorkItemLedger.create({
			workflowId: "verified",
			items: [
				{
					id: "implementation",
					objective: "implement",
					dependencies: [],
					writePaths: ["src"],
					acceptanceCriteria: ["works"],
					integrationOwner: true,
					acceptanceRequired: true,
					requiredEvidence: ["focused-test"],
					maxReworkCycles: 1,
				},
				{
					id: "verify-implementation",
					objective: "verify",
					dependencies: ["implementation"],
					verifierFor: "implementation",
				},
			],
		});
	const stage = (ledger: WorkItemLedger) => {
		const target = ledger.start("implementation", "agent-worker");
		ledger.stageForVerifiedAcceptance("implementation", {
			taskGeneration: target.taskGeneration,
			executionPlanId: PLAN_A,
			treeIdentity: TREE,
			baseRepositoryGeneration: "d".repeat(40),
			patchDigest: "e".repeat(64),
			changedPaths: ["src/feature.ts"],
			fileVersions: { "src/feature.ts": "f".repeat(64) },
		});
		return target.taskGeneration;
	};

	const accepted = create();
	const acceptedGeneration = stage(accepted);
	const acceptedVerifier = accepted.start("verify-implementation", "agent:reviewer");
	accepted.acceptIntegration(
		"implementation",
		managedExpectation(acceptedGeneration),
		managedCandidate(acceptedGeneration),
		{
			verifierId: "verify-implementation",
			verifierTaskGeneration: acceptedVerifier.taskGeneration,
			verifierExecutionPlanId: PLAN_B,
			receipt: verifiedReceipt("accept", acceptedGeneration, acceptedVerifier.taskGeneration),
		},
	);
	assert.equal(accepted.get("implementation")?.acceptanceState, "accepted");
	assert.equal(accepted.get("implementation")?.verificationAccepted, true);
	assert.equal(accepted.get("verify-implementation")?.state, "completed");
	const restoredAccepted = WorkItemLedger.restore(accepted.snapshot());
	assert.equal(restoredAccepted.get("implementation")?.acceptanceState, "accepted");
	assert.equal(restoredAccepted.get("implementation")?.verificationAccepted, true);
	assert.throws(() => accepted.rerun("implementation"), /terminal|accepted/i);

	const rework = create();
	const firstGeneration = stage(rework);
	const firstVerifier = rework.start("verify-implementation", "agent:reviewer");
	rework.recordVerificationDecision("verify-implementation", {
		taskGeneration: firstVerifier.taskGeneration,
		executionPlanId: PLAN_B,
		receipt: verifiedReceipt("rework", firstGeneration, firstVerifier.taskGeneration),
	});
	assert.equal(rework.get("implementation")?.acceptanceState, "rework-requested");
	rework.beginVerificationRework("implementation");
	assert.equal(rework.get("implementation")?.taskGeneration, firstGeneration + 1);
	assert.equal(rework.get("implementation")?.acceptanceState, "pending");
	assert.equal(rework.get("verify-implementation")?.state, "pending");
	const secondGeneration = stage(rework);
	const secondVerifier = rework.start("verify-implementation", "agent:reviewer");
	rework.recordVerificationDecision("verify-implementation", {
		taskGeneration: secondVerifier.taskGeneration,
		executionPlanId: PLAN_B,
		receipt: verifiedReceipt("rework", secondGeneration, secondVerifier.taskGeneration),
	});
	assert.equal(rework.get("implementation")?.acceptanceState, "rejected");
	assert.equal(rework.get("implementation")?.state, "failed");
});

test("WorkItemLedger rejects every stale or mismatched managed acceptance field without partial mutation", () => {
	const mutations: Array<{
		name: string;
		mutate(receipt: VerificationReceipt, candidate: ReturnType<typeof managedCandidate>): void;
	}> = [
		{
			name: "wrong plan",
			mutate: (receipt) => {
				receipt.targetExecutionPlanId = "9".repeat(64);
			},
		},
		{
			name: "wrong tree",
			mutate: (receipt) => {
				receipt.beforeTreeIdentity.digest = "9".repeat(64);
				receipt.afterTreeIdentity.digest = "9".repeat(64);
			},
		},
		{
			name: "patch mismatch",
			mutate: (_receipt, candidate) => {
				candidate.patchDigest = "9".repeat(64);
			},
		},
		{
			name: "scope mismatch",
			mutate: (_receipt, candidate) => {
				candidate.changedPaths = ["outside/feature.ts"];
			},
		},
		{
			name: "missing evidence",
			mutate: (_receipt, candidate) => {
				candidate.evidence["focused-test"] = "";
			},
		},
		{
			name: "self-issued verifier",
			mutate: (receipt) => {
				receipt.verifierAgent = "worker";
			},
		},
	];
	for (const entry of mutations) {
		const ledger = WorkItemLedger.create({
			workflowId: `verified-${entry.name.replaceAll(" ", "-")}`,
			items: [
				{
					id: "implementation",
					objective: "implement",
					dependencies: [],
					writePaths: ["src"],
					acceptanceCriteria: ["works"],
					integrationOwner: true,
					acceptanceRequired: true,
					requiredEvidence: ["focused-test"],
				},
				{
					id: "verify-implementation",
					objective: "verify",
					dependencies: ["implementation"],
					verifierFor: "implementation",
				},
			],
		});
		const target = ledger.start("implementation", "agent:worker");
		ledger.stageForVerifiedAcceptance("implementation", {
			taskGeneration: target.taskGeneration,
			executionPlanId: PLAN_A,
			treeIdentity: TREE,
			baseRepositoryGeneration: "d".repeat(40),
			patchDigest: "e".repeat(64),
			changedPaths: ["src/feature.ts"],
			fileVersions: { "src/feature.ts": "f".repeat(64) },
		});
		const verifier = ledger.start("verify-implementation", "agent:reviewer");
		const receipt = verifiedReceipt("accept", target.taskGeneration, verifier.taskGeneration);
		const candidate = managedCandidate(target.taskGeneration);
		entry.mutate(receipt, candidate);
		assert.throws(
			() =>
				ledger.acceptIntegration(
					"implementation",
					managedExpectation(target.taskGeneration),
					candidate,
					{
						verifierId: "verify-implementation",
						verifierTaskGeneration: verifier.taskGeneration,
						verifierExecutionPlanId: PLAN_B,
						receipt,
					},
				),
			/stale|mismatch|scope|evidence|identity|verifier/i,
			entry.name,
		);
		assert.equal(ledger.get("implementation")?.acceptanceState, "pending", entry.name);
		assert.equal(ledger.get("verify-implementation")?.state, "running", entry.name);
	}
});

test("WorkItemLedger maps omitted legacy acceptance fields to their existing terminal meaning", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "legacy",
		items: [{ id: "task", objective: "task", dependencies: [] }],
	});
	const started = ledger.start("task", "worker");
	ledger.complete("task", { taskGeneration: started.taskGeneration, executionPlanId: PLAN_A });
	for (const version of ["pi-subagents:work-ledger:v1", "pi-subagents:work-ledger:v2"] as const) {
		const snapshot = ledger.snapshot() as unknown as Record<string, unknown>;
		snapshot.version = version;
		for (const item of snapshot.items as Array<Record<string, unknown>>) {
			if (version === "pi-subagents:work-ledger:v2") {
				item.verificationAccepted = true;
			}
			delete item.acceptanceStateVersion;
			delete item.acceptanceState;
			delete item.acceptanceRequired;
			delete item.requiredEvidence;
			delete item.reworkCount;
			delete item.maxReworkCycles;
			delete item.acceptanceReceipt;
			delete item.acceptanceReceiptHistory;
			delete item.submission;
		}
		const restored = WorkItemLedger.restore(snapshot as never);
		assert.equal(restored.get("task")?.state, "completed");
		assert.equal(restored.get("task")?.acceptanceState, "not-required");
		assert.equal(
			restored.get("task")?.verificationAccepted,
			version === "pi-subagents:work-ledger:v2",
		);
	}
});

test("WorkItemLedger enforces one terminal owner and monotonic generations", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [{ id: "a", objective: "a", dependencies: [], integrationOwner: true }],
	});
	ledger.start("a", "agent-a");
	complete(ledger, "a", {});
	assert.throws(() => complete(ledger, "a", {}), /terminal/i);
	assert.equal(ledger.snapshot().generation > 0, true);
});
