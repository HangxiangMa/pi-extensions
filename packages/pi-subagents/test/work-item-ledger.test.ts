import assert from "node:assert/strict";
import { test } from "vitest";
import { type CompleteWorkItemInput, WorkItemLedger } from "../src/work-item-ledger.js";

function complete(
	ledger: WorkItemLedger,
	id: string,
	input: Omit<CompleteWorkItemInput, "taskGeneration"> = {},
): void {
	ledger.complete(id, { ...input, taskGeneration: ledger.get(id)?.taskGeneration ?? 0 });
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
});

test("WorkItemLedger records explicit verifier acceptance on the verified item", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{ id: "implementation", objective: "implement", dependencies: [] },
			{
				id: "verification",
				objective: "verify",
				dependencies: ["implementation"],
				verifierFor: "implementation",
			},
		],
	});
	ledger.start("implementation", "agent-worker");
	complete(ledger, "implementation", {});
	ledger.start("verification", "agent-reviewer");
	complete(ledger, "verification", { verificationAccepted: true });
	assert.equal(ledger.get("implementation")?.verificationAccepted, true);
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
