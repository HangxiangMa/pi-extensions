import assert from "node:assert/strict";
import { test } from "vitest";
import { AgentRegistry } from "../src/registry.js";
import {
	deriveTaskName,
	joinTaskPath,
	resolveTaskPath,
	validateTaskName,
	validateTaskPath,
} from "../src/task-path.js";
import { record } from "./registry-test-helpers.js";

const cwd = process.cwd();

function immediateRegistry() {
	return new AgentRegistry(async (_agent, task) => ({ output: task, exitCode: 0 }));
}

test("task path validation follows the canonical lowercase segment contract", () => {
	for (const name of ["worker", "worker_2", "a0"]) assert.equal(validateTaskName(name), name);
	for (const name of ["", "root", ".", "..", "BadName", "with-dash", "a/b", "x".repeat(129)]) {
		assert.throws(() => validateTaskName(name));
	}
	assert.equal(validateTaskPath("/root"), "/root");
	assert.equal(validateTaskPath("/root/research/worker_2"), "/root/research/worker_2");
	for (const path of ["root/worker", "/other/worker", "/root/", "/root//worker"]) {
		assert.throws(() => validateTaskPath(path));
	}
});

test("task paths join parents and resolve relative or absolute references", () => {
	assert.equal(joinTaskPath("/root", "research"), "/root/research");
	assert.equal(joinTaskPath("/root/research", "worker"), "/root/research/worker");
	assert.equal(resolveTaskPath("/root/research", "worker"), "/root/research/worker");
	assert.equal(resolveTaskPath("/root/research", "/root/other"), "/root/other");
	assert.throws(() => resolveTaskPath("/root/research", "../other"));
});

test("legacy fallback names are deterministic, valid, and do not expose arbitrary IDs", () => {
	const first = deriveTaskName("Legacy Agent/SECRET");
	assert.equal(first, deriveTaskName("Legacy Agent/SECRET"));
	assert.equal(validateTaskName(first), first);
	assert.doesNotMatch(first, /secret/i);
	assert.notEqual(first, deriveTaskName("different"));
});

test("registry assigns canonical paths, resolves IDs and paths, and releases closed paths", async () => {
	const registry = immediateRegistry();
	const parent = await registry.spawn({
		agent: "explorer",
		taskName: "research",
		task: "root",
		cwd,
	});
	await registry.wait(parent.id, 100);
	const child = await registry.spawn({
		agent: "worker",
		taskName: "implementation",
		task: "child",
		cwd,
		parentId: parent.taskPath,
	});
	await registry.wait(child.id, 100);
	assert.equal(parent.taskPath, "/root/research");
	assert.equal(child.taskPath, "/root/research/implementation");
	assert.equal(registry.get(parent.taskPath)?.id, parent.id);
	assert.equal(registry.get(child.id)?.taskPath, child.taskPath);
	assert.equal(registry.resolveAgent("implementation", parent.id)?.id, child.id);
	assert.equal(registry.resolveAgent(child.taskPath)?.id, child.id);

	await assert.rejects(
		() =>
			registry.spawn({
				agent: "worker",
				taskName: "implementation",
				task: "duplicate",
				cwd,
				parentId: parent.id,
			}),
		/already retained|collision/i,
	);
	await registry.close(child.id);
	const replacement = await registry.spawn({
		agent: "worker",
		taskName: "implementation",
		task: "replacement",
		cwd,
		parentId: parent.id,
	});
	assert.equal(replacement.taskPath, child.taskPath);
	await registry.shutdown();
});

test("concurrent spawns reserve one canonical path atomically", async () => {
	const registry = immediateRegistry();
	const attempts = await Promise.allSettled([
		registry.spawn({ agent: "worker", taskName: "same", task: "one", cwd }),
		registry.spawn({ agent: "worker", taskName: "same", task: "two", cwd }),
	]);
	assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
	assert.equal(attempts.filter((result) => result.status === "rejected").length, 1);
	await registry.shutdown();
});

test("restore derives stable paths for legacy records and recovers collisions deterministically", () => {
	const registry = immediateRegistry();
	registry.restore([
		record({ id: "legacy-parent", taskName: undefined, taskPath: undefined }),
		record({
			id: "legacy-child-a",
			parentId: "legacy-parent",
			rootId: "legacy-parent",
			depth: 1,
			taskName: "worker",
			taskPath: undefined,
		}),
		record({
			id: "legacy-child-b",
			parentId: "legacy-parent",
			rootId: "legacy-parent",
			depth: 1,
			taskName: "worker",
			taskPath: undefined,
		}),
	]);
	const parent = registry.get("legacy-parent");
	const first = registry.get("legacy-child-a");
	const second = registry.get("legacy-child-b");
	assert.ok(parent?.taskPath?.startsWith("/root/agent_"));
	assert.equal(first?.taskPath, `${parent?.taskPath}/worker`);
	assert.ok(second?.taskName?.startsWith("agent_"));
	assert.notEqual(first?.taskPath, second?.taskPath);

	const restoredAgain = immediateRegistry();
	restoredAgain.restore(registry.list());
	assert.equal(restoredAgain.get("legacy-child-b")?.taskPath, second?.taskPath);
});
