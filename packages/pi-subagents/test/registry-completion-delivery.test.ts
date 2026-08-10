import assert from "node:assert/strict";
import { test } from "vitest";
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
