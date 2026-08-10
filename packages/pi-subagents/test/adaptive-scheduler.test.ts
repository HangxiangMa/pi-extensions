import assert from "node:assert/strict";
import { test } from "vitest";
import { AdaptiveScheduler } from "../src/adaptive-scheduler.js";
import { WorkItemLedger } from "../src/work-item-ledger.js";

test("adaptive scheduler treats concurrency as a ceiling and selects dependency-ready safe work", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{ id: "a", objective: "a", dependencies: [], writePaths: ["src/a.ts"] },
			{ id: "b", objective: "b", dependencies: [], writePaths: ["src/b.ts"] },
			{ id: "c", objective: "c", dependencies: ["a"] },
		],
	});
	const decision = new AdaptiveScheduler().decide(ledger.snapshot(), {
		maxConcurrency: 8,
		activeCount: 0,
		transportCapacity: 1,
		remainingBudgetMs: 10_000,
	});
	assert.equal(decision.selected.length, 1);
	assert.ok(["a", "b"].includes(decision.selected[0]));
	assert.equal(decision.effectiveConcurrency, 1);
	assert.equal(decision.decisions.find((item) => item.id === "c")?.reason, "dependency-not-ready");
});

test("adaptive scheduler avoids declared ownership and write conflicts deterministically", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{ id: "a", objective: "a", dependencies: [], ownershipKeys: ["api"] },
			{ id: "b", objective: "b", dependencies: [], ownershipKeys: ["api"] },
			{ id: "c", objective: "c", dependencies: [], ownershipKeys: ["docs"] },
		],
	});
	const decision = new AdaptiveScheduler().decide(ledger.snapshot(), {
		maxConcurrency: 3,
		activeCount: 0,
		transportCapacity: 3,
		remainingBudgetMs: 10_000,
	});
	assert.deepEqual(decision.selected, ["a", "c"]);
	assert.equal(decision.decisions.find((item) => item.id === "b")?.reason, "scope-conflict");
});

test("adaptive scheduler blocks hierarchical write/write and read/write scope overlap", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{
				id: "a",
				objective: "a",
				dependencies: [],
				sideEffectPolicy: "read-only",
				readPaths: ["./src/auth/session.ts"],
			},
			{ id: "b", objective: "b", dependencies: [], writePaths: ["src/auth"] },
			{
				id: "c",
				objective: "c",
				dependencies: [],
				writePaths: ["src\\auth\\session.ts\\cache"],
			},
			{ id: "d", objective: "d", dependencies: [], writePaths: ["packages"] },
			{ id: "e", objective: "e", dependencies: [], writePaths: ["./packages/api"] },
			{ id: "f", objective: "f", dependencies: [], writePaths: ["docs"] },
		],
	});
	const decision = new AdaptiveScheduler().decide(ledger.snapshot(), {
		maxConcurrency: 6,
		activeCount: 0,
		transportCapacity: 6,
		remainingBudgetMs: 10_000,
	});
	assert.deepEqual(decision.selected, ["a", "d", "f"]);
	assert.equal(decision.decisions.find((item) => item.id === "b")?.reason, "scope-conflict");
	assert.equal(decision.decisions.find((item) => item.id === "c")?.reason, "scope-conflict");
	assert.equal(decision.decisions.find((item) => item.id === "e")?.reason, "scope-conflict");
});

test("adaptive scheduler compares candidates with active read scopes", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [{ id: "write", objective: "write", dependencies: [], writePaths: ["src/api"] }],
	});
	const decision = new AdaptiveScheduler().decide(ledger.snapshot(), {
		maxConcurrency: 2,
		activeCount: 1,
		transportCapacity: 2,
		remainingBudgetMs: 10_000,
		activeReadPaths: ["src"],
	});
	assert.deepEqual(decision.selected, []);
	assert.equal(decision.decisions[0]?.reason, "scope-conflict");
});

test("adaptive scheduler completes generated acyclic workflows without violating dependencies", () => {
	for (let seed = 1; seed <= 50; seed++) {
		let state = seed;
		const random = () => {
			state = (state * 1_664_525 + 1_013_904_223) >>> 0;
			return state / 2 ** 32;
		};
		const items = Array.from({ length: 12 }, (_value, index) => ({
			id: `task-${index}`,
			objective: `task ${index}`,
			dependencies: Array.from({ length: index }, (_unused, dependency) => dependency)
				.filter(() => random() < 0.18)
				.map((dependency) => `task-${dependency}`),
		}));
		const ledger = WorkItemLedger.create({ workflowId: `wf-${seed}`, items });
		const scheduler = new AdaptiveScheduler();
		let guard = 0;
		while (ledger.snapshot().items.some((item) => item.state !== "completed")) {
			assert.ok(guard++ < 100);
			const decision = scheduler.decide(ledger.snapshot(), {
				maxConcurrency: 4,
				activeCount: 0,
				transportCapacity: 4,
				remainingBudgetMs: 10_000,
			});
			assert.ok(decision.selected.length > 0);
			for (const id of decision.selected) {
				const item = ledger.get(id);
				assert.equal(
					item?.dependencies.every((dependency) => ledger.get(dependency)?.state === "completed"),
					true,
				);
				ledger.start(id, `agent:${id}`);
				ledger.complete(id, { taskGeneration: ledger.get(id)?.taskGeneration ?? 0 });
			}
		}
	}
});

test("adaptive scheduler caps concurrent mutating work at the admitted width", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: ["a", "b", "c"].map((id) => ({ id, objective: id, dependencies: [] })),
	});
	const decision = new AdaptiveScheduler().decide(ledger.snapshot(), {
		maxConcurrency: 4,
		activeCount: 0,
		transportCapacity: 4,
		remainingBudgetMs: 10_000,
	});
	assert.deepEqual(decision.selected, ["a", "b"]);
	assert.equal(decision.decisions.find((item) => item.id === "c")?.reason, "capacity-exhausted");
});

test("adaptive scheduler runs one ready verifier behind an exclusive barrier", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{ id: "implementation", objective: "implement", dependencies: [] },
			{
				id: "verification",
				objective: "verify",
				dependencies: ["implementation"],
				verifierFor: "implementation",
				sideEffectPolicy: "read-only",
			},
			{ id: "other", objective: "other", dependencies: [], sideEffectPolicy: "read-only" },
		],
	});
	const implementation = ledger.start("implementation", "agent-worker");
	ledger.stageForVerification("implementation", {
		taskGeneration: implementation.taskGeneration,
		executionPlanId: "a".repeat(64),
		treeIdentity: {
			version: "pi-subagents:workflow-tree:v1",
			kind: "git-dirty",
			digest: "b".repeat(64),
		},
	});
	const decision = new AdaptiveScheduler().decide(ledger.snapshot(), {
		maxConcurrency: 4,
		activeCount: 0,
		transportCapacity: 4,
		remainingBudgetMs: 10_000,
	});
	assert.deepEqual(decision.selected, ["verification"]);
	assert.equal(decision.effectiveConcurrency, 1);
	assert.equal(
		decision.decisions.find((item) => item.id === "other")?.reason,
		"verification-barrier",
	);
});

test("adaptive scheduler starts no work after budget exhaustion", () => {
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [{ id: "a", objective: "a", dependencies: [] }],
	});
	const decision = new AdaptiveScheduler().decide(ledger.snapshot(), {
		maxConcurrency: 4,
		activeCount: 0,
		transportCapacity: 4,
		remainingBudgetMs: 0,
	});
	assert.deepEqual(decision.selected, []);
	assert.equal(decision.decisions[0]?.reason, "budget-exhausted");
});
