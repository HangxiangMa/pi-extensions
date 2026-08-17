import assert from "node:assert/strict";
import { test } from "vitest";
import type { SubagentSettings } from "../src/agents.js";
import { AutoTransport } from "../src/auto-transport.js";
import type { ManagedAgent, TurnOutcome } from "../src/registry.js";
import type { SubagentTransport } from "../src/transport.js";

class FakeTransport implements SubagentTransport {
	readonly calls: string[] = [];
	readonly releases: string[] = [];
	shutdowns = 0;

	constructor(readonly kind: "subprocess" | "in-process" | "rpc") {}

	async runTurn(agent: ManagedAgent): Promise<TurnOutcome> {
		this.calls.push(agent.id);
		return {
			output: this.kind,
			exitCode: 0,
			telemetry: {
				transport: this.kind,
				phase: "settled",
				updatedAt: Date.now(),
				timing: {},
			},
		};
	}

	async release(agent: ManagedAgent): Promise<void> {
		this.releases.push(agent.id);
	}

	async shutdown(): Promise<void> {
		this.shutdowns++;
	}
}

function agent(id: string, name: string): ManagedAgent {
	return {
		id,
		agent: name,
		rootId: id,
		depth: 0,
		children: [],
		state: "running",
		createdAt: 1,
		updatedAt: 1,
		cwd: process.cwd(),
		history: [],
		mailbox: [],
	};
}

test("AutoTransport deterministically routes before launch and retains the selection", async () => {
	const subprocess = new FakeTransport("subprocess");
	const inProcess = new FakeTransport("in-process");
	const rpc = new FakeTransport("rpc");
	let settings: SubagentSettings | undefined;
	const transport = new AutoTransport({
		subprocess,
		inProcess,
		rpc,
		getSettings: () => settings,
	});
	const explorer = agent("explorer-id", "explorer");
	const worker = agent("worker-id", "worker");
	const planned = await transport.runTurn(explorer, "plan", new AbortController().signal);
	assert.equal(planned.output, "in-process");
	assert.match(planned.telemetry?.selectionReason ?? "", /read-only/i);
	const worked = await transport.runTurn(worker, "work", new AbortController().signal);
	assert.equal(worked.output, "rpc");
	assert.match(worked.telemetry?.selectionReason ?? "", /write-capable/i);
	settings = { agents: { worker: { tools: ["custom_tool"] } } };
	await transport.runTurn(worker, "follow-up", new AbortController().signal);
	assert.equal(rpc.calls.length, 2, "existing retained selection must not change mid-runtime");
	const custom = agent("custom-id", "worker");
	const customResult = await transport.runTurn(custom, "custom", new AbortController().signal);
	assert.equal(customResult.output, "subprocess");
	assert.match(customResult.telemetry?.selectionReason ?? "", /custom tools/i);
	await transport.release?.(explorer);
	await transport.release?.(worker);
	await transport.release?.(custom);
	assert.deepEqual(inProcess.releases, ["explorer-id"]);
	assert.deepEqual(rpc.releases, ["worker-id"]);
	assert.deepEqual(subprocess.releases, ["custom-id"]);
	await transport.shutdown();
	assert.deepEqual([subprocess.shutdowns, inProcess.shutdowns, rpc.shutdowns], [1, 1, 1]);
});
