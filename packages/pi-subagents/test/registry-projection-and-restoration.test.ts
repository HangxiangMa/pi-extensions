import assert from "node:assert/strict";
import { test } from "vitest";
import { projectAgentRecords } from "../src/agent-projection.js";
import { AgentRegistry } from "../src/registry.js";
import { record } from "./registry-test-helpers.js";

test("agent record projection preserves ancestry with deterministic count and depth limits", () => {
	const root = record({ id: "root", rootId: "root", updatedAt: 1 });
	const child = record({
		id: "child",
		rootId: "root",
		parentId: "root",
		depth: 1,
		updatedAt: 5,
	});
	const other = record({ id: "other", rootId: "other", updatedAt: 4 });
	const cycleA = record({ id: "cycle-a", parentId: "cycle-b", updatedAt: 8 });
	const cycleB = record({ id: "cycle-b", parentId: "cycle-a", updatedAt: 7 });
	const records = [child, root, other, cycleA, cycleB];

	assert.deepEqual(
		projectAgentRecords(records, { maxAgents: 2 }).map((agent) => agent.id),
		["child", "root"],
	);
	assert.deepEqual(
		projectAgentRecords(records, { maxAgents: 1 }).map((agent) => agent.id),
		["other"],
	);
	assert.deepEqual(
		projectAgentRecords(records, { maxAgents: 2, maxDepth: 0 }).map((agent) => agent.id),
		["root", "other"],
	);
});

test("AgentRegistry restores valid records inertly and rejects cyclic hierarchy", () => {
	const registry = new AgentRegistry(async () => ({ output: "", exitCode: 0 }));
	registry.restore([
		record({ state: "running", currentTask: "must not resume" }),
		record({ id: "child", rootId: "wrong", parentId: "sa_test", depth: 99 }),
		record({ id: "cycle-a", rootId: "cycle-a", parentId: "cycle-b", depth: 1 }),
		record({ id: "cycle-b", rootId: "cycle-a", parentId: "cycle-a", depth: 2 }),
	]);
	const restored = registry.get("sa_test");
	assert.equal(restored?.state, "interrupted");
	assert.equal(restored?.currentTask, undefined);
	assert.deepEqual(restored?.children, ["child"]);
	assert.equal(registry.get("child")?.rootId, "sa_test");
	assert.equal(registry.get("child")?.depth, 1);
	assert.equal(registry.get("cycle-a"), undefined);
	assert.equal(registry.get("cycle-b"), undefined);
});
