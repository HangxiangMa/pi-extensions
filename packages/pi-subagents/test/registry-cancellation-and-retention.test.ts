import assert from "node:assert/strict";
import { test } from "vitest";
import { issueCapabilityGrant } from "../src/capability-grant.js";
import { createExecutionPlan } from "../src/execution-plan.js";
import { AgentRegistry } from "../src/registry.js";

test("AgentRegistry rotates the accepted generation before abort and quarantines late results", async () => {
	const plan = createExecutionPlan({
		agent: {
			name: "scout",
			description: "scout",
			systemPrompt: "",
			source: "built-in",
			filePath: "built-in:scout",
		},
		target: {
			cwd: process.cwd(),
			boundary: "current-workspace",
			trust: { kind: "session-trusted", projectTrusted: true },
		},
		workspaceMode: "shared",
		transport: "subprocess",
		resultFormat: "text",
		taskGeneration: 1,
	});
	const registry = new AgentRegistry(async (_agent, _task, signal) => {
		await new Promise<void>((resolve) =>
			signal.addEventListener("abort", () => resolve(), { once: true }),
		);
		return { output: "late completion", exitCode: 0, aborted: true };
	});
	const agent = await registry.spawn({
		agent: "scout",
		task: "work",
		cwd: process.cwd(),
		executionPlan: plan,
		capabilityGrant: issueCapabilityGrant(plan, Date.now(), 10_000),
	});
	const interrupted = await registry.interrupt(agent.id);
	assert.equal(interrupted.state, "stale");
	assert.equal(interrupted.outcome?.status, "stale");
	assert.equal(interrupted.executionPlan?.taskGeneration, 2);
	assert.deepEqual(interrupted.executionPlan?.cancellationLineage, [plan.id]);
	assert.equal(interrupted.capabilityGrant?.state, "revoked");
});

test("AgentRegistry shutdown aborts active work and drains queued work without starting it", async () => {
	const started: string[] = [];
	const registry = new AgentRegistry(
		async (_agent, task, signal) => {
			started.push(task);
			await new Promise<void>((resolve) =>
				signal.addEventListener("abort", () => resolve(), { once: true }),
			);
			return { output: "stopped", exitCode: 130, aborted: true };
		},
		{ maxActiveTurns: 1 },
	);
	const active = await registry.spawn({ agent: "scout", task: "active", cwd: process.cwd() });
	const queued = await registry.spawn({ agent: "scout", task: "queued", cwd: process.cwd() });
	await registry.shutdown();
	assert.deepEqual(started, ["active"]);
	assert.equal(registry.get(active.id)?.state, "interrupted");
	assert.equal(registry.get(queued.id)?.state, "interrupted");
});

test("AgentRegistry eviction preserves active ancestry and removes expired trees leaf-first", async () => {
	let now = 1_000;
	const registry = new AgentRegistry(
		async (_agent, task, signal) => {
			if (task === "slow") {
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => resolve(), { once: true }),
				);
			}
			return { output: "done", exitCode: signal.aborted ? 130 : 0, aborted: signal.aborted };
		},
		{ idleTtlMs: 100, now: () => now },
	);
	const root = await registry.spawn({ agent: "scout", task: "done", cwd: process.cwd() });
	await registry.wait(root.id, 100);
	const child = await registry.spawn({
		agent: "scout",
		task: "slow",
		cwd: process.cwd(),
		parentId: root.id,
	});
	now += 101;
	assert.equal(await registry.sweepExpired(), 0);
	assert.ok(registry.get(root.id));
	await registry.interrupt(child.id);
	assert.equal(registry.get(root.id)?.updatedAt, now);
	now += 101;
	assert.equal(await registry.sweepExpired(), 2);
	assert.equal(registry.get(root.id), undefined);
	assert.equal(registry.get(child.id), undefined);
});

test("AgentRegistry expiry prunes stale child links and releases its transport", async () => {
	let now = 1_000;
	const released: string[] = [];
	const registry = new AgentRegistry(
		{
			kind: "fake",
			async runTurn() {
				return { output: "done", exitCode: 0 };
			},
			async release(agent) {
				released.push(agent.id);
			},
		},
		{
			idleTtlMs: 100,
			now: () => now,
		},
	);
	const root = await registry.spawn({ agent: "scout", task: "root", cwd: process.cwd() });
	await registry.wait(root.id, 100);
	const child = await registry.spawn({
		agent: "scout",
		task: "child",
		cwd: process.cwd(),
		parentId: root.id,
	});
	await registry.wait(child.id, 100);
	now += 50;
	await registry.sendMessage(root.id, "refresh parent");
	now += 51;
	assert.equal(await registry.sweepExpired(), 1);
	assert.equal(registry.get(child.id), undefined);
	assert.deepEqual(registry.get(root.id)?.children, []);
	assert.deepEqual(released, [child.id]);
	assert.equal((await registry.close(root.id)).state, "closed");
	assert.deepEqual(released, [child.id, root.id]);
});

test("AgentRegistry bounds retained closed records", async () => {
	const registry = new AgentRegistry(async () => ({ output: "done", exitCode: 0 }), {
		maxAgents: 2,
	});
	for (let index = 0; index < 4; index++) {
		const agent = await registry.spawn({
			agent: "scout",
			task: String(index),
			cwd: process.cwd(),
		});
		await registry.wait(agent.id, 100);
		await registry.close(agent.id);
	}
	assert.equal(registry.list(true).length, 2);
});

test("AgentRegistry serializes state snapshots so slow persistence cannot overwrite completion", async () => {
	const savedStates: string[] = [];
	let saveCount = 0;
	let releaseSlowSave: (() => void) | undefined;
	const slowSave = new Promise<void>((resolve) => {
		releaseSlowSave = resolve;
	});
	const registry = new AgentRegistry(async () => ({ output: "done", exitCode: 0 }), {
		onChange: async (agents) => {
			saveCount++;
			if (saveCount === 2) await slowSave;
			savedStates.push(agents[0]?.state ?? "missing");
		},
	});
	const agent = await registry.spawn({ agent: "scout", task: "task", cwd: process.cwd() });
	await registry.wait(agent.id, 100);
	await new Promise((resolve) => setImmediate(resolve));
	releaseSlowSave?.();
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(savedStates, ["starting", "starting", "completed"]);
});

test("AgentRegistry keeps lifecycle usable when persistence callbacks fail", async () => {
	const registry = new AgentRegistry(async () => ({ output: "done", exitCode: 0 }), {
		onChange: async () => {
			throw new Error("disk unavailable");
		},
	});
	const agent = await registry.spawn({ agent: "scout", task: "done", cwd: process.cwd() });
	assert.equal((await registry.wait(agent.id, 100)).agent.state, "completed");
});
