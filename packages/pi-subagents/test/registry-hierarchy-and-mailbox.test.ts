import assert from "node:assert/strict";
import { test } from "vitest";
import { AgentRegistry, type ManagedAgent } from "../src/registry.js";

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
	const agent = await registry.spawn({ agent: "explorer", task: "task", cwd: process.cwd() });
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
	const root = await registry.spawn({ agent: "explorer", task: "root", cwd: process.cwd() });
	await registry.wait(root.id, 100);
	const child = await registry.spawn({
		agent: "explorer",
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
	const agent = await registry.spawn({ agent: "explorer", task: "initial", cwd: process.cwd() });
	await registry.wait(agent.id, 100);
	const message = await registry.sendMessage(agent.id, "once");
	await registry.followUp(agent.id, "first follow-up");
	await registry.wait(agent.id, 100);
	await registry.followUp(agent.id, "second follow-up");
	await registry.wait(agent.id, 100);
	assert.deepEqual(delivered, [[], [message.id], []]);
});

test("AgentRegistry includes and acknowledges at most the 20 mailbox messages visible to a turn", async () => {
	const delivered: string[][] = [];
	const registry = new AgentRegistry(async (agent) => {
		delivered.push(agent.currentMailboxMessageIds ?? []);
		return { output: "done", exitCode: 0 };
	});
	const agent = await registry.spawn({ agent: "explorer", task: "initial", cwd: process.cwd() });
	await registry.wait(agent.id, 100);
	const messageIds: string[] = [];
	for (let index = 0; index < 25; index++) {
		messageIds.push((await registry.sendMessage(agent.id, `message ${index}`)).id);
	}
	await registry.followUp(agent.id, "consume bounded mailbox");
	await registry.wait(agent.id, 100);
	assert.deepEqual(delivered[1], messageIds.slice(-20));
	assert.deepEqual(
		(await registry.readMessages(agent.id, false)).map((message) => message.id),
		messageIds.slice(0, 5),
	);
	await registry.shutdown();
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
	const root = await registry.spawn({ agent: "explorer", task: "root", cwd: process.cwd() });
	await registry.wait(root.id, 100);
	const child = await registry.spawn({
		agent: "explorer",
		task: "child",
		cwd: process.cwd(),
		parentId: root.id,
	});
	await registry.wait(child.id, 100);
	const grandchild = await registry.spawn({
		agent: "explorer",
		task: "grandchild",
		cwd: process.cwd(),
		parentId: child.id,
	});
	await registry.wait(grandchild.id, 100);
	await assert.rejects(
		() =>
			registry.spawn({
				agent: "explorer",
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
	const root = await registry.spawn({ agent: "explorer", task: "root", cwd: process.cwd() });
	await registry.wait(root.id, 100);
	const child = await registry.spawn({
		agent: "explorer",
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
	const other = await registry.spawn({ agent: "explorer", task: "other", cwd: process.cwd() });
	await registry.wait(other.id, 100);
	const crossTree = await registry.sendMessage(child.id, "message", other.id);
	assert.equal(crossTree.senderId, other.id);
	assert.equal(crossTree.recipientId, child.id);
	await registry.readMessages(child.id, true);
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
