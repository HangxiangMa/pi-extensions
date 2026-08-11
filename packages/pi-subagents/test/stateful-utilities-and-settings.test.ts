import assert from "node:assert/strict";
import { test } from "vitest";
import { AgentRegistry } from "../src/registry.js";
import { normalizeSubagentSettings } from "../src/settings.js";
import {
	assertFollowUpWriteAllowed,
	formatStatefulAgentLine,
	isWriteCapable,
	resolveCompletionDelivery,
	resolveSpawnContextMode,
	resolveStatefulTransportKind,
} from "../src/stateful.js";
import { summarizeStatefulAgent } from "../src/stateful-agent-view.js";
import { waitForOwnedSpawn } from "../src/stateful-lifecycle.js";
import { resolveStatefulSubprocessThinkingLevel } from "../src/subprocess-transport.js";
import { record } from "./orchestration-test-helpers.js";

test("shared-workspace write classification and follow-up guards are conservative", async () => {
	assert.equal(isWriteCapable(undefined), true);
	assert.equal(isWriteCapable(["read", "grep"]), false);
	assert.equal(isWriteCapable(["read", "bash"]), true);
	assert.equal(isWriteCapable(["edit"]), true);
	const registry = new AgentRegistry(async (_agent, _task, signal) => {
		await new Promise<void>((resolve) =>
			signal.addEventListener("abort", () => resolve(), { once: true }),
		);
		return { output: "interrupted", exitCode: 130, aborted: true };
	});
	const active = await registry.spawn({ agent: "worker", task: "active", cwd: process.cwd() });
	const followUp = record({ agent: "worker", cwd: process.cwd(), state: "completed" });
	assert.throws(
		() => assertFollowUpWriteAllowed(registry, followUp, false, false),
		(error: unknown) => {
			assert.match(String(error), /already active in shared workspace/);
			assert.match(String(error), /prefer one subagent_spawn.*asynchronous work/i);
			assert.match(String(error), /blocking subagent parallel mode.*synchronous outputs/i);
			assert.doesNotMatch(
				String(error),
				/For independent one-shot work, use subagent parallel mode/,
			);
			assert.match(String(error), /let the active agent finish or close/);
			assert.match(String(error), /allowConcurrentWrites/);
			assert.match(String(error), /worktree/);
			return true;
		},
	);
	assert.doesNotThrow(() => assertFollowUpWriteAllowed(registry, followUp, true, false));
	assert.doesNotThrow(() => assertFollowUpWriteAllowed(registry, followUp, false, true));
	await registry.interrupt(active.id);
});

test("stateful agent lines escape terminal controls from retained agent data", () => {
	const line = formatStatefulAgentLine(
		record({
			agent: "scout\u001b]8;;https://example.com\u0007linked",
			currentTask: "first line\nsecond line\u009b31m",
		}),
	);
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Verify terminal-control escaping.
	assert.doesNotMatch(line, /[\u0000-\u001f\u007f-\u009f]/u);
	assert.match(line, /scout.*linked/);
	assert.match(line, /first line second line/);
});

test("stateful agent summaries preserve the 2 KiB task and error bounds", () => {
	const summary = summarizeStatefulAgent(
		record({ currentTask: "任".repeat(4_000), error: "誤".repeat(4_000) }),
	);
	assert.equal(typeof summary.currentTask, "string");
	assert.equal(typeof summary.error, "string");
	assert.ok(Buffer.byteLength(summary.currentTask ?? "", "utf8") <= 2 * 1024);
	assert.ok(Buffer.byteLength(summary.error ?? "", "utf8") <= 2 * 1024);
	assert.match(summary.currentTask ?? "", /truncated by pi-subagents/);
	assert.match(summary.error ?? "", /truncated by pi-subagents/);
});

test("pending idempotent spawn waits honor caller cancellation", async () => {
	const controller = new AbortController();
	const pending = new Promise<never>(() => undefined);
	const waiting = waitForOwnedSpawn(pending, controller.signal);
	controller.abort();
	await assert.rejects(waiting, (error) => error instanceof Error && error.name === "AbortError");
});

test("selected context entries imply all mode only when context mode is omitted", () => {
	assert.equal(resolveSpawnContextMode(undefined, ["entry"]), "all");
	assert.equal(resolveSpawnContextMode(undefined, []), "all");
	assert.equal(resolveSpawnContextMode(undefined, undefined), "none");
	assert.equal(resolveSpawnContextMode("none", ["entry"]), "none");
	assert.equal(resolveSpawnContextMode(3, ["entry"]), 3);
});

test("stateful subprocess thinking uses spawn override before the agent default", () => {
	const agents = [{ name: "scout", thinkingLevel: "low" as const }, { name: "reviewer" }];
	assert.equal(
		resolveStatefulSubprocessThinkingLevel(agents, record({ thinkingLevel: "high" })),
		"high",
	);
	assert.equal(resolveStatefulSubprocessThinkingLevel(agents, record()), "low");
	assert.equal(
		resolveStatefulSubprocessThinkingLevel(agents, record({ agent: "reviewer" })),
		undefined,
	);
});

test("stateful settings validate transport, completion delivery, and bounded runtime options", () => {
	assert.equal(resolveStatefulTransportKind(undefined), "subprocess");
	assert.equal(resolveStatefulTransportKind("in-process"), "in-process");
	assert.equal(resolveStatefulTransportKind("rpc"), "rpc");
	assert.equal(resolveStatefulTransportKind("auto"), "auto");
	assert.equal(resolveCompletionDelivery(undefined), "next-turn");
	assert.equal(resolveCompletionDelivery("auto-resume"), "auto-resume");
	assert.deepEqual(
		normalizeSubagentSettings({
			stateful: {
				enabled: true,
				transport: "in-process",
				completionDelivery: "auto-resume",
				maxAgents: 8,
				maxDepth: 2,
				maxChildrenPerAgent: 3,
				maxMailboxMessages: 10,
				maxMailboxMessageBytes: 4096,
			},
			agents: {},
		}),
		{
			stateful: {
				enabled: true,
				transport: "in-process",
				completionDelivery: "auto-resume",
				maxAgents: 8,
				maxDepth: 2,
				maxChildrenPerAgent: 3,
				maxMailboxMessages: 10,
				maxMailboxMessageBytes: 4096,
			},
		},
	);
	assert.deepEqual(normalizeSubagentSettings({ stateful: { transport: "subprocess" } }), {
		stateful: { transport: "subprocess" },
	});
	assert.deepEqual(normalizeSubagentSettings({ stateful: { transport: "rpc" } }), {
		stateful: { transport: "rpc" },
	});
	assert.deepEqual(normalizeSubagentSettings({ stateful: { transport: "auto" } }), {
		stateful: { transport: "auto" },
	});
	assert.equal(normalizeSubagentSettings({ stateful: { transport: "native" } }), undefined);
	assert.equal(
		normalizeSubagentSettings({ stateful: { completionDelivery: "always" } }),
		undefined,
	);
	assert.equal(normalizeSubagentSettings({ stateful: { maxAgents: 0 } }), undefined);
	assert.equal(normalizeSubagentSettings({ stateful: { maxAgents: 1.5 } }), undefined);
	assert.deepEqual(normalizeSubagentSettings({ stateful: { maxDepth: 0 } }), {
		stateful: { maxDepth: 0 },
	});
});
