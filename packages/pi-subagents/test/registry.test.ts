import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { projectAgentRecords } from "../src/agent-projection.js";
import { issueCapabilityGrant } from "../src/capability-grant.js";
import { createExecutionPlan } from "../src/execution-plan.js";
import { AgentPersistence } from "../src/persistence.js";
import { AgentRegistry, type ManagedAgent } from "../src/registry.js";
import { hashSpawnRequest } from "../src/spawn-idempotency.js";
import { buildDetachedCompletionMessage } from "../src/stateful.js";

function record(overrides: Partial<ManagedAgent> = {}): ManagedAgent {
	return {
		id: "sa_test",
		agent: "scout",
		rootId: "sa_test",
		depth: 0,
		children: [],
		state: "completed",
		createdAt: 1,
		updatedAt: Date.now(),
		cwd: process.cwd(),
		history: [],
		mailbox: [],
		...overrides,
	};
}

test("spawn idempotency includes retained execution budgets", () => {
	const request = {
		agent: "scout",
		task: "inspect",
		cwd: process.cwd(),
		agentScope: "user" as const,
		thinkingLevel: "low" as const,
		timeoutMs: 1_000,
		contextSourceIds: [],
		workspaceMode: "shared" as const,
		allowConcurrentWrites: false,
		resultFormat: "text" as const,
	};
	assert.notEqual(hashSpawnRequest(request), hashSpawnRequest({ ...request, timeoutMs: 2_000 }));
	assert.notEqual(hashSpawnRequest(request), hashSpawnRequest({ ...request, idleTimeoutMs: 500 }));
	assert.notEqual(hashSpawnRequest(request), hashSpawnRequest({ ...request, maxTurns: 3 }));
	assert.notEqual(hashSpawnRequest(request), hashSpawnRequest({ ...request, maxToolCalls: 4 }));
	const { timeoutMs: _omitted, ...withoutTimeout } = request;
	const legacyHash = createHash("sha256")
		.update(
			JSON.stringify({
				agent: withoutTimeout.agent,
				task: withoutTimeout.task,
				cwd: withoutTimeout.cwd,
				agentScope: withoutTimeout.agentScope,
				thinkingLevel: withoutTimeout.thinkingLevel,
				parentId: null,
				contextHash: null,
				contextSourceIds: [],
				workspaceMode: "shared",
				allowConcurrentWrites: false,
				resultFormat: "text",
			}),
		)
		.digest("hex");
	assert.equal(hashSpawnRequest(withoutTimeout), legacyHash);
});

test("AgentRegistry retains spawn idempotency only until close", async () => {
	const registry = new AgentRegistry(async () => ({ output: "done", exitCode: 0 }));
	const first = await registry.spawn({
		agent: "scout",
		task: "first",
		cwd: process.cwd(),
		spawnIdempotencyKey: "key",
		spawnRequestHash: "hash",
	});
	assert.equal(registry.findBySpawnIdempotencyKey("key", "hash")?.id, first.id);
	assert.throws(() => registry.findBySpawnIdempotencyKey("key", "different"), /different/);
	await registry.close(first.id);
	assert.equal(registry.findBySpawnIdempotencyKey("key", "hash"), undefined);
	const replacement = await registry.spawn({
		agent: "scout",
		task: "different after close",
		cwd: process.cwd(),
		spawnIdempotencyKey: "key",
		spawnRequestHash: "different",
	});
	assert.notEqual(replacement.id, first.id);
});

test("AgentRegistry preserves queue and transport timing without persisting progress callbacks", async () => {
	let now = 10;
	const registry = new AgentRegistry(
		async (_agent, _task, _signal, onProgress) => {
			onProgress?.({
				transport: "rpc",
				protocol: "pi-subagents:v1",
				phase: "ready",
				updatedAt: 20,
				timing: { startedAt: 15, readyAt: 20 },
			});
			return {
				output: "done",
				exitCode: 0,
				telemetry: {
					transport: "rpc",
					protocol: "pi-subagents:v1",
					phase: "settled",
					updatedAt: 30,
					timing: { startedAt: 15, readyAt: 20, settledAt: 30 },
				},
			};
		},
		{ now: () => now++ },
	);
	const spawned = await registry.spawn({ agent: "scout", task: "timed", cwd: process.cwd() });
	await registry.wait(spawned.id, 100);
	const telemetry = registry.getInspection(spawned.id)?.telemetry;
	assert.equal(telemetry?.transport, "rpc");
	assert.equal(telemetry?.timing.queuedAt, 12);
	assert.equal(telemetry?.timing.readyAt, 20);
	assert.equal(telemetry?.timing.settledAt, 30);
	registry.markCompletionDelivered(spawned.id, 40);
	assert.equal(registry.getInspection(spawned.id)?.telemetry?.timing.completionDeliveredAt, 40);
});

test("AgentRegistry exposes metadata-only inspection snapshots", async () => {
	let finish!: (value: { output: string; exitCode: number; error?: string }) => void;
	const registry = new AgentRegistry(
		async () =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const spawned = await registry.spawn({
		agent: "scout",
		task: "private current task",
		cwd: process.cwd(),
		thinkingLevel: "high",
		context: "private parent context",
	});
	await registry.sendMessage(spawned.id, "private mailbox content");

	assert.deepEqual(registry.inspectionCounts(), { activeAgents: 1, retainedAgents: 1 });
	const listed = registry.listInspection();
	assert.equal(listed.length, 1);
	assert.deepEqual(listed[0], {
		id: spawned.id,
		agent: "scout",
		state: "running",
		createdAt: spawned.createdAt,
		updatedAt: listed[0].updatedAt,
		historyCount: 0,
		unreadMessages: 1,
	});
	assert.doesNotMatch(JSON.stringify(listed), /private/);

	const detail = registry.getInspection(spawned.id);
	assert.equal(detail?.currentTask, "private current task");
	assert.equal(detail?.cwd, process.cwd());
	assert.equal(detail?.thinkingLevel, "high");
	assert.doesNotMatch(JSON.stringify(detail), /mailbox content|parent context/);

	finish({ output: "private history output", exitCode: 1, error: "private error" });
	await registry.wait(spawned.id, 100);
	assert.deepEqual(registry.inspectionCounts(), { activeAgents: 0, retainedAgents: 1 });
	const completed = registry.getInspection(spawned.id);
	assert.equal(completed?.historyCount, 1);
	assert.equal(completed?.error, "private error");
	assert.doesNotMatch(JSON.stringify(completed), /history output|mailbox content|parent context/);
});

test("AgentRegistry deduplicates exact spawn retries before another transport turn", async () => {
	let turns = 0;
	const registry = new AgentRegistry(async () => {
		turns++;
		return {
			output: JSON.stringify({
				version: "pi-subagents:result:v1",
				summary: "done",
				evidence: ["src/a.ts"],
				changes: [],
				verification: ["test"],
				risks: [],
			}),
			exitCode: 0,
		};
	});
	const input = {
		agent: "scout",
		task: "inspect",
		cwd: process.cwd(),
		spawnIdempotencyKey: "request-1",
		spawnRequestHash: "a".repeat(64),
		resultFormat: "structured-v1" as const,
	};
	const first = await registry.spawn(input);
	const repeated = await registry.spawn(input);
	assert.equal(repeated.id, first.id);
	await registry.wait(first.id, 100);
	assert.equal(turns, 1);
	assert.equal(registry.getInspection(first.id)?.structuredResult?.summary, "done");
	await assert.rejects(
		() => registry.spawn({ ...input, spawnRequestHash: "b".repeat(64) }),
		/different parameters/,
	);
	await registry.close(first.id);
	const afterClose = await registry.spawn(input);
	assert.notEqual(afterClose.id, first.id);
});

test("AgentRegistry projects actionable structured v2 outcomes into lifecycle state", async () => {
	const registry = new AgentRegistry(async () => ({
		output: JSON.stringify({
			version: "pi-subagents:result:v2",
			status: "needs-input",
			reasonCode: "missing-dependency",
			summary: "need schema",
			claims: [],
			artifacts: [],
			changes: [],
			verification: [],
			limitations: [],
			unresolvedDependencies: ["schema"],
		}),
		exitCode: 0,
	}));
	const agent = await registry.spawn({
		agent: "scout",
		task: "inspect",
		cwd: process.cwd(),
		resultFormat: "structured-v2",
	});
	await registry.wait(agent.id, 100);
	const inspection = registry.getInspection(agent.id);
	assert.equal(inspection?.state, "needs-input");
	assert.deepEqual(inspection?.outcome, {
		status: "needs-input",
		reasonCode: "missing-dependency",
		recoveryActions: ["supply-input"],
		retryable: false,
	});
	await registry.followUp(agent.id, "schema supplied");
});

test("AgentRegistry fails closed when a requested structured result is malformed", async () => {
	const registry = new AgentRegistry(async () => ({ output: "ordinary text", exitCode: 0 }));
	const agent = await registry.spawn({
		agent: "scout",
		task: "inspect",
		cwd: process.cwd(),
		resultFormat: "structured-v2",
	});
	await registry.wait(agent.id, 100);
	const inspection = registry.getInspection(agent.id);
	assert.equal(inspection?.state, "failed");
	assert.equal(inspection?.outcome?.status, "contract-invalid");
});

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
	const agent = await registry.spawn({ agent: "scout", task: "done", cwd: process.cwd() });
	await assert.rejects(() => registry.wait(agent.id, Number.NaN), /positive finite/);
	await registry.wait(agent.id, 100);
	await registry.close(agent.id);
	await assert.rejects(
		() => registry.spawn({ agent: "scout", task: "child", cwd: process.cwd(), parentId: agent.id }),
		/Cannot spawn under closed agent/,
	);
	await assert.rejects(
		() => registry.spawn({ agent: "scout", task: "  ", cwd: process.cwd() }),
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
		agent: "scout",
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
	const first = await registry.spawn({ agent: "scout", task: "slow", cwd: process.cwd() });
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
		agent: "scout",
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
	const agent = await registry.spawn({ agent: "scout", task: "slow", cwd: process.cwd() });
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
	const agent = await registry.spawn({ agent: "scout", task: "first", cwd: process.cwd() });
	await registry.wait(agent.id, 100);
	assert.equal(registry.get(agent.id)?.error, "first failure");
	const followUp = await registry.followUp(agent.id, "second");
	assert.match(followUp.state, /starting|running/);
	assert.equal(followUp.error, undefined);
	await registry.interrupt(agent.id);
});

test("AgentRegistry emits one detached completion event for every settled turn", async () => {
	const completions: Array<{
		agentId: string;
		state: string;
		task: string;
		output: string;
	}> = [];
	const settlers: Array<(outcome: { output: string; exitCode: number }) => void> = [];
	const registry = new AgentRegistry(
		async () =>
			new Promise((resolve) => {
				settlers.push(resolve);
			}),
		{
			onTurnComplete: (completion) => {
				completions.push({
					agentId: completion.agent.id,
					state: completion.agent.state,
					task: completion.task,
					output: completion.output,
				});
			},
		},
	);
	const agent = await registry.spawn({ agent: "scout", task: "first", cwd: process.cwd() });
	assert.deepEqual(completions, []);
	settlers.shift()?.({ output: "first result", exitCode: 0 });
	await registry.wait(agent.id, 100);
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(completions, [
		{ agentId: agent.id, state: "completed", task: "first", output: "first result" },
	]);

	await registry.followUp(agent.id, "second");
	assert.equal(completions.length, 1);
	settlers.shift()?.({ output: "second result", exitCode: 0 });
	await registry.wait(agent.id, 100);
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(completions.at(-1), {
		agentId: agent.id,
		state: "completed",
		task: "second",
		output: "second result",
	});
	assert.equal(completions.length, 2);
});

test("detached completion messages retain bounded task, partial output, and errors after redaction", () => {
	const content = buildDetachedCompletionMessage({
		agent: record({ agent: "scout\nspoofed", state: "failed" }),
		task: `inspect <private>task secret</private> ${"界".repeat(200)}`,
		output: `partial output <private>output secret</private> ${"x".repeat(4_000)}`,
		error: `provider failed ${"e".repeat(4_000)}`,
	});
	assert.match(content, /Agent: scout spoofed/);
	assert.match(content, /Task: inspect/);
	assert.match(content, /Error:\nprovider failed/);
	assert.match(content, /Payload:\npartial output/);
	assert.doesNotMatch(content, /task secret|output secret/);
	assert.ok(Buffer.byteLength(content, "utf8") <= 2 * 1024);
});

test("AgentRegistry keeps detached lifecycle stable when completion delivery fails", async () => {
	const registry = new AgentRegistry(async () => ({ output: "done", exitCode: 0 }), {
		onTurnComplete: () => {
			throw new Error("stale parent session");
		},
	});
	const agent = await registry.spawn({ agent: "scout", task: "task", cwd: process.cwd() });
	const settled = await registry.wait(agent.id, 100);
	assert.equal(settled.agent.state, "completed");
	assert.equal(settled.agent.history.at(-1)?.output, "done");
});

test("AgentRegistry emits a detached completion when queued work is interrupted", async () => {
	const completions: Array<{ agentId: string; state: string; task: string }> = [];
	const registry = new AgentRegistry(
		async (_agent, _task, signal) => {
			await new Promise<void>((resolve) =>
				signal.addEventListener("abort", () => resolve(), { once: true }),
			);
			return { output: "", exitCode: 130, aborted: true };
		},
		{
			maxActiveTurns: 1,
			onTurnComplete: (completion) => {
				completions.push({
					agentId: completion.agent.id,
					state: completion.agent.state,
					task: completion.task,
				});
			},
		},
	);
	const active = await registry.spawn({ agent: "scout", task: "active", cwd: process.cwd() });
	const queued = await registry.spawn({ agent: "scout", task: "queued", cwd: process.cwd() });
	assert.equal(registry.get(queued.id)?.state, "starting");
	await registry.interrupt(queued.id);
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(completions, [{ agentId: queued.id, state: "interrupted", task: "queued" }]);
	await registry.interrupt(active.id);
});

test("AgentRegistry persists closed state even when transport release reports cleanup failure", async () => {
	const snapshots: ManagedAgent[][] = [];
	const registry = new AgentRegistry(
		{
			kind: "fake",
			async runTurn() {
				return { output: "done", exitCode: 0 };
			},
			async release() {
				throw new Error("cleanup failed");
			},
		},
		{
			onChange: (agents) => {
				snapshots.push(agents);
			},
		},
	);
	const agent = await registry.spawn({ agent: "scout", task: "task", cwd: process.cwd() });
	await registry.wait(agent.id, 100);
	await assert.rejects(() => registry.close(agent.id), /cleanup failed/);
	assert.equal(snapshots.at(-1)?.find((candidate) => candidate.id === agent.id)?.state, "closed");
});

test("AgentRegistry releases subtree transport sessions child-first and exactly once", async () => {
	const released: string[] = [];
	const registry = new AgentRegistry({
		kind: "fake",
		async runTurn(_agent, task) {
			return { output: task, exitCode: 0 };
		},
		async release(agent) {
			released.push(agent.id);
		},
	});
	const root = await registry.spawn({ agent: "scout", task: "root", cwd: process.cwd() });
	await registry.wait(root.id, 100);
	const child = await registry.spawn({
		agent: "scout",
		task: "child",
		cwd: process.cwd(),
		parentId: root.id,
	});
	await registry.wait(child.id, 100);
	await registry.closeTree(root.id);
	await registry.closeTree(root.id);
	assert.deepEqual(released, [child.id, root.id]);
});

test("AgentRegistry delivers unread mailbox messages to only the next follow-up turn", async () => {
	const delivered: string[][] = [];
	const registry = new AgentRegistry(async (agent) => {
		delivered.push(agent.currentMailboxMessageIds ?? []);
		return { output: "done", exitCode: 0 };
	});
	const agent = await registry.spawn({ agent: "scout", task: "initial", cwd: process.cwd() });
	await registry.wait(agent.id, 100);
	const message = await registry.sendMessage(agent.id, "once");
	await registry.followUp(agent.id, "first follow-up");
	await registry.wait(agent.id, 100);
	await registry.followUp(agent.id, "second follow-up");
	await registry.wait(agent.id, 100);
	assert.deepEqual(delivered, [[], [message.id], []]);
});

test("AgentRegistry preserves hierarchy and delivers bounded deduplicated mailbox messages", async () => {
	const registry = new AgentRegistry(
		async (_agent, task) => ({ output: `done:${task}`, exitCode: 0 }),
		{
			maxDepth: 2,
			maxChildrenPerAgent: 2,
			maxMailboxMessages: 2,
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
	const grandchild = await registry.spawn({
		agent: "scout",
		task: "grandchild",
		cwd: process.cwd(),
		parentId: child.id,
	});
	await registry.wait(grandchild.id, 100);
	await assert.rejects(
		() =>
			registry.spawn({
				agent: "scout",
				task: "too deep",
				cwd: process.cwd(),
				parentId: grandchild.id,
			}),
		/depth limit/,
	);
	assert.equal(registry.get(child.id)?.rootId, root.id);
	assert.equal(registry.get(grandchild.id)?.depth, 2);
	assert.deepEqual(registry.get(root.id)?.children, [child.id]);

	const first = await registry.sendMessage(child.id, "hello", root.id, "same");
	const duplicate = await registry.sendMessage(child.id, "hello", root.id, "same");
	assert.equal(duplicate.id, first.id);
	await registry.sendMessage(child.id, "second", root.id);
	await registry.sendMessage(child.id, "third", root.id);
	const unread = await registry.readMessages(child.id, false);
	assert.deepEqual(
		unread.map((message) => message.content),
		["second", "third"],
	);
	assert.equal((await registry.readMessages(child.id, true)).length, 2);
	assert.equal((await registry.readMessages(child.id, false)).length, 0);

	const rootMessages = await registry.readMessages(root.id, false);
	assert.ok(
		rootMessages.some(
			(message) => message.senderId === child.id && /done:child/.test(message.content),
		),
	);
	const closed = await registry.closeTree(root.id);
	assert.deepEqual(
		closed.map((agent) => agent.id),
		[grandchild.id, child.id, root.id],
	);
	await assert.rejects(() => registry.sendMessage(child.id, "late"), /Cannot message closed/);
});

test("AgentRegistry bounds mailbox input and reports rejected child turns to their parent", async () => {
	const registry = new AgentRegistry(
		async (_agent, task) => {
			if (task === "reject") throw new Error("transport rejected");
			return { output: task, exitCode: 0 };
		},
		{ maxMailboxMessageBytes: 64 },
	);
	const root = await registry.spawn({ agent: "scout", task: "root", cwd: process.cwd() });
	await registry.wait(root.id, 100);
	const child = await registry.spawn({
		agent: "scout",
		task: "reject",
		cwd: process.cwd(),
		parentId: root.id,
	});
	assert.equal((await registry.wait(child.id, 100)).agent.state, "failed");
	const completion = await registry.readMessages(root.id, false);
	assert.equal(completion.length, 1);
	assert.match(completion[0].content, /transport rejected/);
	assert.equal(registry.get(child.id)?.history.at(-1)?.exitCode, 1);

	await assert.rejects(() => registry.sendMessage(child.id, "  "), /cannot be empty/);
	await assert.rejects(
		() => registry.sendMessage(child.id, "message", "missing"),
		/Unknown subagent/,
	);
	const other = await registry.spawn({ agent: "scout", task: "other", cwd: process.cwd() });
	await registry.wait(other.id, 100);
	await assert.rejects(
		() => registry.sendMessage(child.id, "message", other.id),
		/cannot cross agent trees/,
	);
	const bounded = await registry.sendMessage(child.id, "x".repeat(200));
	assert.ok(Buffer.byteLength(bounded.content, "utf8") <= 64);
	assert.match(bounded.content, /truncated/);
	await registry.sendMessage(child.id, "second");
	await registry.sendMessage(child.id, "third");
	assert.equal((await registry.readMessages(child.id, true, 2)).length, 2);
	assert.equal((await registry.readMessages(child.id, false)).length, 1);
	await assert.rejects(
		() => registry.sendMessage(child.id, "message", "root", "k".repeat(257)),
		/cannot exceed 256/,
	);
});

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

test("AgentPersistence atomically saves, restores, redacts, deletes, and quarantines bad state", async () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), "pi-subagent-state-"));
	const persistence = new AgentPersistence("session", { stateDir: dir, maxStoredAgents: 2 });
	await persistence.save([
		record({
			thinkingLevel: "high",
			timeoutMs: 1234,
			currentTimeoutMs: 4321,
			idleTimeoutMs: 2345,
			currentIdleTimeoutMs: 5432,
			maxTurns: 7,
			currentMaxTurns: 8,
			maxToolCalls: 9,
			currentMaxToolCalls: 10,
			spawnIdempotencyKey: "persisted-request",
			spawnRequestHash: "a".repeat(64),
			resultFormat: "structured-v1",
			contextTurns: 2,
			contextBytes: 128,
			telemetry: {
				protocol: "pi-subagents:v1",
				transport: "rpc",
				phase: "settled",
				updatedAt: 2,
				timing: { settledAt: 2 },
			},
			structuredResult: {
				version: "pi-subagents:result:v1",
				summary: "ephemeral",
				evidence: [],
				changes: [],
				verification: [],
				risks: [],
			},
			termination: {
				version: "pi-subagents:termination:v1",
				reason: "work_timeout",
				limit: 1234,
				checkpoint: {
					version: "pi-subagents:checkpoint:v1",
					task: "inspect",
					assistantNotes: ["<private>checkpoint-secret</private>visible checkpoint"],
					completedTools: [],
					changedFiles: [],
					sideEffectsMayHaveOccurred: false,
					truncated: false,
				},
				finalization: { attempted: false, status: "skipped", durationMs: 0 },
			},
			target: {
				cwd: process.cwd(),
				boundary: "external",
				trust: { kind: "saved-trusted", projectTrusted: true, sourcePath: process.cwd() },
			},
			context: "<private>secret</private>",
			mailbox: [
				{
					id: "msg",
					senderId: "root",
					recipientId: "sa_test",
					content: "<private>mail-secret</private>visible",
					createdAt: 1,
				},
			],
			history: [
				{
					task: "task",
					output: "[subagent-private] hidden\nvisible",
					startedAt: 1,
					completedAt: 2,
					exitCode: 0,
				},
			],
		}),
	]);
	const raw = readFileSync(persistence.filePath, "utf8");
	assert.doesNotMatch(raw, /secret|hidden/);
	assert.match(raw, /visible/);
	assert.doesNotMatch(raw, /telemetry/);
	assert.match(raw, /structuredResult|ephemeral/);
	const restoredState = persistence.load()[0];
	assert.equal(restoredState?.state, "completed");
	assert.equal(restoredState?.thinkingLevel, "high");
	assert.equal(restoredState?.timeoutMs, 1234);
	assert.equal(restoredState?.currentTimeoutMs, undefined);
	assert.equal(restoredState?.idleTimeoutMs, 2345);
	assert.equal(restoredState?.currentIdleTimeoutMs, undefined);
	assert.equal(restoredState?.maxTurns, 7);
	assert.equal(restoredState?.currentMaxTurns, undefined);
	assert.equal(restoredState?.maxToolCalls, 9);
	assert.equal(restoredState?.currentMaxToolCalls, undefined);
	assert.equal(restoredState?.spawnIdempotencyKey, "persisted-request");
	assert.equal(restoredState?.spawnRequestHash, "a".repeat(64));
	assert.equal(restoredState?.resultFormat, "structured-v1");
	assert.equal(restoredState?.contextTurns, 2);
	assert.equal(restoredState?.contextBytes, 128);
	assert.equal(restoredState?.telemetry, undefined);
	assert.equal(restoredState?.structuredResult?.summary, "ephemeral");
	assert.equal(
		restoredState?.termination?.checkpoint.assistantNotes[0],
		"[private content omitted]visible checkpoint",
	);
	assert.equal(restoredState?.target?.trust.kind, "saved-trusted");
	assert.equal(restoredState?.target?.trust.projectTrusted, true);
	assert.equal(restoredState?.mailbox[0]?.content, "[private content omitted]visible");
	const competing = new AgentPersistence("session", { stateDir: dir, maxStoredAgents: 2 });
	await Promise.all([
		persistence.save([record({ id: "one" })]),
		competing.save([record({ id: "two" })]),
	]);
	assert.ok(["one", "two"].includes(persistence.load()[0]?.id ?? ""));
	const hierarchyPersistence = new AgentPersistence("hierarchy", {
		stateDir: dir,
		maxStoredAgents: 2,
	});
	const persistenceNow = Date.now();
	await hierarchyPersistence.save([
		record({ id: "root", rootId: "root", updatedAt: persistenceNow }),
		record({
			id: "child",
			rootId: "root",
			parentId: "root",
			depth: 1,
			updatedAt: persistenceNow + 2,
		}),
		record({ id: "other", rootId: "other", updatedAt: persistenceNow + 1 }),
	]);
	assert.deepEqual(
		hierarchyPersistence.load().map((agent) => agent.id),
		["root", "child"],
	);
	assert.throws(
		() => new AgentPersistence("invalid", { stateDir: dir, maxStoredAgents: 0 }),
		/positive safe integer/,
	);
	await persistence.delete();
	assert.deepEqual(persistence.load(), []);
	writeFileSync(
		persistence.filePath,
		JSON.stringify({
			version: 1,
			updatedAt: Date.now(),
			agents: [
				{
					id: "legacy",
					agent: "scout",
					state: "completed",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					cwd: process.cwd(),
					history: [],
				},
			],
		}),
	);
	assert.equal(persistence.load()[0]?.rootId, "legacy");
	assert.equal(persistence.load()[0]?.thinkingLevel, undefined);
	writeFileSync(
		persistence.filePath,
		JSON.stringify({
			version: 2,
			updatedAt: Date.now(),
			agents: [
				{
					id: "invalid-thinking",
					agent: "scout",
					thinkingLevel: "huge",
					state: "idle",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					cwd: process.cwd(),
					history: [],
				},
			],
		}),
	);
	assert.deepEqual(persistence.load(), []);
	writeFileSync(
		persistence.filePath,
		JSON.stringify({
			version: 2,
			updatedAt: Date.now(),
			agents: [
				{
					id: "malformed",
					agent: "scout",
					state: "idle",
					createdAt: Date.now(),
					updatedAt: Date.now(),
					cwd: process.cwd(),
					history: [{}],
				},
			],
		}),
	);
	assert.deepEqual(persistence.load(), []);
	writeFileSync(persistence.filePath, JSON.stringify({ version: 999, agents: [] }));
	assert.deepEqual(persistence.load(), []);
	writeFileSync(persistence.filePath, "not json");
	assert.deepEqual(persistence.load(), []);
	assert.ok(
		readdirSync(dir).some((name) =>
			name.startsWith(`${path.basename(persistence.filePath)}.invalid-`),
		),
	);
});

test("AgentPersistence restores in-flight work as interrupted without replay", async () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), "pi-subagent-crash-state-"));
	const persistence = new AgentPersistence("session", { stateDir: dir });
	await persistence.save([record({ state: "running", currentTask: "do not replay" })]);
	const restored = persistence.load()[0];
	assert.equal(restored?.state, "interrupted");
	assert.equal(restored?.currentTask, undefined);
	rmSync(dir, { recursive: true, force: true });
});
