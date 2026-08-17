import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveCompletionRecipient } from "../src/completion-routing.js";
import { AgentRegistry } from "../src/registry.js";
import { buildDetachedCompletionMessage } from "../src/stateful.js";
import { record } from "./registry-test-helpers.js";

test("AgentRegistry emits one detached completion event for every settled turn", async () => {
	const completions: Array<{
		agentId: string;
		state: string;
		task: string;
		output: string;
	}> = [];
	const settlers: Array<(outcome: { output: string; exitCode: number }) => void> = [];
	let latestPersistedCompletionIds: string[] = [];
	const persistedBeforeNotification: boolean[] = [];
	const registry = new AgentRegistry(
		async () =>
			new Promise((resolve) => {
				settlers.push(resolve);
			}),
		{
			onChange: (agents) => {
				latestPersistedCompletionIds = agents.flatMap((agent) =>
					(agent.pendingCompletions ?? []).map((completion) => completion.completionId),
				);
			},
			onTurnComplete: (completion) => {
				persistedBeforeNotification.push(
					latestPersistedCompletionIds.includes(completion.completionId),
				);
				completions.push({
					agentId: completion.agent.id,
					state: completion.agent.state,
					task: completion.task,
					output: completion.output,
				});
			},
		},
	);
	const agent = await registry.spawn({ agent: "explorer", task: "first", cwd: process.cwd() });
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
	assert.deepEqual(persistedBeforeNotification, [true, true]);
});

test("AgentRegistry retries terminal persistence before resolving or notifying", async () => {
	let settleTurn!: (outcome: { output: string; exitCode: number }) => void;
	let releasePersistence!: () => void;
	let markRetryStarted!: () => void;
	const retryStarted = new Promise<void>((resolve) => {
		markRetryStarted = resolve;
	});
	const persistenceGate = new Promise<void>((resolve) => {
		releasePersistence = resolve;
	});
	let terminalAttempts = 0;
	const notified: string[] = [];
	const registry = new AgentRegistry(
		async () =>
			new Promise((resolve) => {
				settleTurn = resolve;
			}),
		{
			onChange: async (agents) => {
				if (!agents.some((agent) => (agent.pendingCompletions?.length ?? 0) > 0)) return;
				terminalAttempts++;
				if (terminalAttempts === 1) throw new Error("transient persistence failure");
				markRetryStarted();
				await persistenceGate;
			},
			onTurnComplete: (completion) => {
				notified.push(completion.completionId);
			},
		},
	);
	const agent = await registry.spawn({ agent: "explorer", task: "persist", cwd: process.cwd() });
	settleTurn({ output: "done", exitCode: 0 });
	let waitResolved = false;
	const waiting = registry.wait(agent.id, 1_000).then((result) => {
		waitResolved = true;
		return result;
	});

	await retryStarted;
	await Promise.resolve();
	assert.equal(waitResolved, false);
	assert.deepEqual(notified, []);
	releasePersistence();
	const settled = await waiting;
	assert.equal(settled.agent.state, "completed");
	assert.equal(terminalAttempts, 2);
	assert.equal(notified.length, 1);
});

test("nested completions target the direct parent and remain pending until exact context visibility", async () => {
	const registry = new AgentRegistry(async (_agent, task) => ({
		output: `done:${task}`,
		exitCode: 0,
	}));
	const parent = await registry.spawn({
		agent: "explorer",
		taskName: "parent",
		task: "parent",
		cwd: process.cwd(),
	});
	await registry.wait(parent.id, 100);
	const child = await registry.spawn({
		agent: "worker",
		taskName: "child",
		task: "child",
		cwd: process.cwd(),
		parentId: parent.id,
	});
	await registry.wait(child.id, 100);
	const completion = registry.listPendingCompletions().find((item) => item.agent.id === child.id);
	assert.equal(completion?.recipientId, parent.id);
	assert.equal(completion?.recipientPath, parent.taskPath);
	const parentMessages = await registry.readMessages(parent.id, false);
	const envelope = parentMessages.find(
		(message) => message.deduplicationKey === completion?.completionId,
	);
	assert.equal(envelope?.completionId, completion?.completionId);
	assert.match(envelope?.content ?? "", /done:child/);
	assert.ok(
		registry
			.listPendingCompletions()
			.some((item) => item.completionId === completion?.completionId),
	);
	await registry.acknowledgeVisibleMessages(
		parent.id,
		envelope ? [envelope.id] : [],
		completion ? [completion.completionId] : [],
		Date.now(),
	);
	assert.ok(
		!registry
			.listPendingCompletions()
			.some((item) => item.completionId === completion?.completionId),
	);
	await registry.shutdown();
});

test("simultaneous sibling completions remain distinct and target the same direct parent", async () => {
	const registry = new AgentRegistry(async (_agent, task) => ({ output: task, exitCode: 0 }));
	const parent = await registry.spawn({
		agent: "worker",
		taskName: "parent",
		task: "parent",
		cwd: process.cwd(),
	});
	await registry.wait(parent.id, 100);
	const [first, second] = await Promise.all([
		registry.spawn({
			agent: "worker",
			taskName: "first",
			task: "first",
			cwd: process.cwd(),
			parentId: parent.id,
		}),
		registry.spawn({
			agent: "worker",
			taskName: "second",
			task: "second",
			cwd: process.cwd(),
			parentId: parent.id,
		}),
	]);
	await Promise.all([registry.wait(first.id, 100), registry.wait(second.id, 100)]);
	const siblingCompletions = registry
		.listPendingCompletions()
		.filter((completion) => completion.agent.parentId === parent.id);
	assert.equal(siblingCompletions.length, 2);
	assert.equal(new Set(siblingCompletions.map((completion) => completion.completionId)).size, 2);
	assert.ok(siblingCompletions.every((completion) => completion.recipientId === parent.id));
	await registry.shutdown();
});

test("completion routing falls back through a closed parent to the nearest live ancestor", () => {
	const agents = new Map([
		[
			"grandparent",
			{
				id: "grandparent",
				state: "completed" as const,
				taskPath: "/root/grandparent",
			},
		],
		[
			"parent",
			{
				id: "parent",
				parentId: "grandparent",
				state: "closed" as const,
				taskPath: "/root/grandparent/parent",
			},
		],
	]);
	assert.deepEqual(
		resolveCompletionRecipient({ id: "child", parentId: "parent" }, (id) => agents.get(id)),
		{ recipientId: "grandparent", recipientPath: "/root/grandparent" },
	);
});

test("top-level completions target root without creating a retained mailbox recipient", async () => {
	const registry = new AgentRegistry(async () => ({ output: "done", exitCode: 0 }));
	const agent = await registry.spawn({
		agent: "worker",
		taskName: "worker",
		task: "task",
		cwd: process.cwd(),
	});
	await registry.wait(agent.id, 100);
	const completion = registry.listPendingCompletions()[0];
	assert.equal(completion?.recipientId, "root");
	assert.equal(completion?.recipientPath, "/root");
	await registry.shutdown();
});

test("detached completion messages retain bounded task, partial output, and errors after redaction", () => {
	const content = buildDetachedCompletionMessage({
		completionId: "completion:test:1",
		runId: "run:test:1",
		generation: 1,
		createdAt: 1,
		agent: record({ agent: "explorer\nspoofed", state: "failed" }),
		task: `inspect <private>task secret</private> ${"界".repeat(200)}`,
		output: `partial output <private>output secret</private> ${"x".repeat(4_000)}`,
		error: `provider failed ${"e".repeat(4_000)}`,
	});
	assert.match(content, /Agent: explorer spoofed/);
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
	const agent = await registry.spawn({ agent: "explorer", task: "task", cwd: process.cwd() });
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
	const active = await registry.spawn({ agent: "explorer", task: "active", cwd: process.cwd() });
	const queued = await registry.spawn({ agent: "explorer", task: "queued", cwd: process.cwd() });
	assert.equal(registry.get(queued.id)?.state, "starting");
	await registry.interrupt(queued.id);
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(completions, [{ agentId: queued.id, state: "interrupted", task: "queued" }]);
	await registry.interrupt(active.id);
});
