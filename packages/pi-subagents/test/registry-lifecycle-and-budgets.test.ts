import assert from "node:assert/strict";
import { test } from "vitest";
import { AgentRegistry } from "../src/registry.js";

test("AgentRegistry rejects invalid capacity and wait bounds", async () => {
	assert.throws(
		() => new AgentRegistry(async () => ({ output: "", exitCode: 0 }), { maxActiveTurns: 0 }),
		/positive safe integer/,
	);
	assert.throws(
		() => new AgentRegistry(async () => ({ output: "", exitCode: 0 }), { maxDepth: -1 }),
		/non-negative safe integer/,
	);
	const registry = new AgentRegistry(async () => ({ output: "", exitCode: 0 }));
	const agent = await registry.spawn({ agent: "explorer", task: "done", cwd: process.cwd() });
	await assert.rejects(() => registry.wait(agent.id, Number.NaN), /positive finite/);
	await registry.wait(agent.id, 100);
	await registry.close(agent.id);
	await assert.rejects(
		() =>
			registry.spawn({ agent: "explorer", task: "child", cwd: process.cwd(), parentId: agent.id }),
		/Cannot spawn under closed agent/,
	);
	await assert.rejects(
		() => registry.spawn({ agent: "explorer", task: "  ", cwd: process.cwd() }),
		/tasks cannot be empty/,
	);

	let observedTask = "";
	const boundedRegistry = new AgentRegistry(
		async (_agent, task) => {
			observedTask = task;
			return { output: "y".repeat(200), exitCode: 0 };
		},
		{ maxTaskBytes: 64, maxTurnOutputBytes: 64 },
	);
	const boundedAgent = await boundedRegistry.spawn({
		agent: "explorer",
		task: "x".repeat(200),
		cwd: process.cwd(),
	});
	const boundedResult = await boundedRegistry.wait(boundedAgent.id, 100);
	assert.ok(Buffer.byteLength(observedTask) <= 64);
	assert.ok(Buffer.byteLength(boundedResult.agent.history[0].output) <= 64);
});

test("AgentRegistry supports follow-up, wait timeout, interrupt/reuse, limits, and close", async () => {
	const registry = new AgentRegistry(
		async (_agent, task, signal) => {
			if (task === "slow") {
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => resolve(), { once: true }),
				);
			}
			return {
				output: `done:${task}`,
				exitCode: signal.aborted ? 130 : 0,
				aborted: signal.aborted,
			};
		},
		{ maxAgents: 2, maxActiveTurns: 1 },
	);
	const first = await registry.spawn({ agent: "explorer", task: "slow", cwd: process.cwd() });
	const second = await registry.spawn({ agent: "reviewer", task: "queued", cwd: process.cwd() });
	const queued = await registry.wait(second.id, 5);
	assert.equal(queued.timedOut, true);
	assert.equal(queued.agent.state, "starting");
	const timed = await registry.wait(first.id, 5);
	assert.equal(timed.timedOut, true);
	const waitController = new AbortController();
	const abortedWait = registry.wait(first.id, 1_000, waitController.signal);
	waitController.abort();
	await assert.rejects(
		abortedWait,
		(error) => error instanceof Error && error.name === "AbortError",
	);
	assert.equal(registry.get(first.id)?.state, "running");
	const interrupted = await registry.interrupt(first.id);
	assert.equal(interrupted.state, "interrupted");
	assert.equal((await registry.wait(second.id, 100)).agent.state, "completed");
	await registry.followUp(first.id, "again");
	const completed = await registry.wait(first.id, 100);
	assert.equal(completed.agent.state, "completed");
	assert.deepEqual(
		completed.agent.history.map((turn) => turn.task),
		["slow", "again"],
	);
	await assert.rejects(
		() => registry.spawn({ agent: "worker", task: "over", cwd: process.cwd() }),
		/capacity/,
	);
	assert.equal((await registry.close(first.id)).state, "closed");
	await assert.rejects(() => registry.close(first.id), /already closed/);
});

test("AgentRegistry retains explicit execution defaults and applies one-turn budget overrides", async () => {
	const observed: Array<{
		thinkingLevel?: string;
		timeoutMs?: number;
		currentTimeoutMs?: number;
		idleTimeoutMs?: number;
		currentIdleTimeoutMs?: number;
		maxTurns?: number;
		currentMaxTurns?: number;
		maxToolCalls?: number;
		currentMaxToolCalls?: number;
	}> = [];
	const registry = new AgentRegistry(async (agent) => {
		observed.push({
			thinkingLevel: agent.thinkingLevel,
			timeoutMs: agent.timeoutMs,
			currentTimeoutMs: agent.currentTimeoutMs,
			idleTimeoutMs: agent.idleTimeoutMs,
			currentIdleTimeoutMs: agent.currentIdleTimeoutMs,
			maxTurns: agent.maxTurns,
			currentMaxTurns: agent.currentMaxTurns,
			maxToolCalls: agent.maxToolCalls,
			currentMaxToolCalls: agent.currentMaxToolCalls,
		});
		return { output: "done", exitCode: 0 };
	});
	const spawned = await registry.spawn({
		agent: "explorer",
		task: "first",
		cwd: process.cwd(),
		thinkingLevel: "high",
		timeoutMs: 111,
		idleTimeoutMs: 112,
		maxTurns: 3,
		maxToolCalls: 4,
	});
	assert.equal(spawned.thinkingLevel, "high");
	assert.equal(spawned.timeoutMs, 111);
	await registry.wait(spawned.id, 100);
	const overridden = await registry.followUp(spawned.id, "second", {
		timeoutMs: 222,
		idleTimeoutMs: 223,
		maxTurns: 5,
		maxToolCalls: 6,
	});
	assert.equal(overridden.thinkingLevel, "high");
	assert.equal(overridden.timeoutMs, 111);
	assert.equal(overridden.currentTimeoutMs, 222);
	await registry.wait(spawned.id, 100);
	await registry.followUp(spawned.id, "third");
	await registry.wait(spawned.id, 100);
	assert.deepEqual(observed, [
		{
			thinkingLevel: "high",
			timeoutMs: 111,
			currentTimeoutMs: 111,
			idleTimeoutMs: 112,
			currentIdleTimeoutMs: 112,
			maxTurns: 3,
			currentMaxTurns: 3,
			maxToolCalls: 4,
			currentMaxToolCalls: 4,
		},
		{
			thinkingLevel: "high",
			timeoutMs: 111,
			currentTimeoutMs: 222,
			idleTimeoutMs: 112,
			currentIdleTimeoutMs: 223,
			maxTurns: 3,
			currentMaxTurns: 5,
			maxToolCalls: 4,
			currentMaxToolCalls: 6,
		},
		{
			thinkingLevel: "high",
			timeoutMs: 111,
			currentTimeoutMs: 111,
			idleTimeoutMs: 112,
			currentIdleTimeoutMs: 112,
			maxTurns: 3,
			currentMaxTurns: 3,
			maxToolCalls: 4,
			currentMaxToolCalls: 4,
		},
	]);
	const retained = registry.get(spawned.id);
	assert.equal(retained?.currentTimeoutMs, undefined);
	assert.equal(retained?.currentIdleTimeoutMs, undefined);
	assert.equal(retained?.currentMaxTurns, undefined);
	assert.equal(retained?.currentMaxToolCalls, undefined);
});

test("AgentRegistry runs lifecycle operations through a transport contract", async () => {
	const calls: string[] = [];
	const registry = new AgentRegistry({
		kind: "fake",
		async runTurn(_agent, task, signal) {
			calls.push(`run:${task}`);
			if (task === "slow") {
				await new Promise<void>((resolve) =>
					signal.addEventListener("abort", () => resolve(), { once: true }),
				);
			}
			return { output: task, exitCode: signal.aborted ? 130 : 0, aborted: signal.aborted };
		},
		async release(agent) {
			calls.push(`release:${agent.id}`);
		},
		async shutdown() {
			calls.push("shutdown");
		},
	});
	const agent = await registry.spawn({ agent: "explorer", task: "slow", cwd: process.cwd() });
	await registry.interrupt(agent.id);
	await registry.followUp(agent.id, "next");
	await registry.wait(agent.id, 100);
	await registry.close(agent.id);
	await registry.shutdown();
	assert.deepEqual(calls, ["run:slow", "run:next", `release:${agent.id}`, "shutdown"]);
});

test("AgentRegistry clears stale terminal errors when a detached follow-up starts", async () => {
	let turn = 0;
	const registry = new AgentRegistry(async (_agent, _task, signal) => {
		turn++;
		if (turn === 1) return { output: "", exitCode: 1, error: "first failure" };
		await new Promise<void>((resolve) =>
			signal.addEventListener("abort", () => resolve(), { once: true }),
		);
		return { output: "", exitCode: 130, aborted: true };
	});
	const agent = await registry.spawn({ agent: "explorer", task: "first", cwd: process.cwd() });
	await registry.wait(agent.id, 100);
	assert.equal(registry.get(agent.id)?.error, "first failure");
	const followUp = await registry.followUp(agent.id, "second");
	assert.match(followUp.state, /starting|running/);
	assert.equal(followUp.error, undefined);
	await registry.interrupt(agent.id);
});
