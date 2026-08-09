import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { createMockContext } from "../../../test/support.js";
import {
	applyAgentModel,
	applyAgentThinking,
	applyAgentTimeout,
	applyExecutionProfileFromUi,
	executionAgentScreen,
	executionModelScreen,
	executionProfileScreen,
	resetAgentExecution,
} from "../src/execution-ui.js";
import { updateAgentSettingsPatch } from "../src/settings.js";
import { resolveStatefulLimits } from "../src/stateful-limits.js";
import { applyTransportSetting, transportSettingsScreen } from "../src/transport-ui.js";

function withAgentDir(run: (directory: string) => Promise<void>): Promise<void> {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-execution-ui-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = directory;
	return run(directory).finally(() => {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(directory, { recursive: true, force: true });
	});
}

function runtime(retainedAgents = 0) {
	return {
		getRuntimeStatus: () => ({
			enabled: true,
			initialized: true,
			transport: "subprocess" as const,
			completionDelivery: "next-turn" as const,
			limits: resolveStatefulLimits(),
			activeAgents: 0,
			retainedAgents,
		}),
	};
}

test("execution profile preview cancels without a write and applies one atomic patch", async () => {
	await withAgentDir(async (directory) => {
		const cancelled = createMockContext({ confirm: async () => false });
		const rejected = await applyExecutionProfileFromUi(
			"balanced",
			cancelled.ctx,
			new AbortController().signal,
			() => true,
		);
		assert.equal(rejected.kind, "rejected");
		assert.equal(existsSync(path.join(directory, "pi-subagents.json")), false);

		updateAgentSettingsPatch({ backend: { model: "unavailable/model", tools: ["bash"] } });
		const accepted = createMockContext({ confirm: async () => true });
		const applied = await applyExecutionProfileFromUi(
			"balanced",
			accepted.ctx,
			new AbortController().signal,
			() => true,
		);
		assert.equal(applied.kind, "stay");
		const saved = JSON.parse(readFileSync(path.join(directory, "pi-subagents.json"), "utf8"));
		assert.equal(saved.agents.scout.thinkingLevel, "low");
		assert.equal(saved.agents.reviewer.thinkingLevel, "medium");
		assert.equal(saved.agents.general.thinkingLevel, "medium");
		assert.equal(saved.agents.backend.thinkingLevel, undefined);
		assert.equal(saved.agents.backend.model, "unavailable/model");
		assert.deepEqual(saved.agents.backend.tools, ["bash"]);
		assert.match(JSON.stringify(executionProfileScreen()), /Fast.*Balanced.*Deep/);
		assert.match(
			JSON.stringify(
				executionAgentScreen({
					name: "scout",
					description: "scout",
					systemPrompt: "",
					source: "built-in",
					filePath: "built-in:scout",
				}),
			),
			/model.*Thinking level.*Timeout/i,
		);
		const catalogContext = createMockContext({
			modelRegistry: { getAvailable: () => [{ provider: "fake", id: "model" }] },
		});
		assert.match(
			JSON.stringify(
				executionModelScreen(
					{
						name: "scout",
						description: "scout",
						systemPrompt: "",
						source: "built-in",
						filePath: "built-in:scout",
					},
					catalogContext.ctx,
				),
			),
			/fake\/model/,
		);
	});
});

test("per-agent execution controls validate, preserve tools, and reset inheritance", async () => {
	await withAgentDir(async (directory) => {
		const context = createMockContext();
		const agent = {
			name: "scout",
			description: "scout",
			tools: ["read"],
			systemPrompt: "",
			source: "built-in" as const,
			filePath: "built-in:scout",
		};
		updateAgentSettingsPatch({ scout: { tools: ["read"] } });
		assert.equal(applyAgentThinking(agent, "high", context.ctx).kind, "back");
		assert.equal(applyAgentModel(agent, "provider/model", context.ctx).kind, "back");
		assert.equal(applyAgentTimeout(agent, "1234", context.ctx).kind, "back");
		assert.equal(applyAgentTimeout(agent, "0", context.ctx).kind, "rejected");
		let saved = JSON.parse(readFileSync(path.join(directory, "pi-subagents.json"), "utf8"));
		assert.equal(saved.agents.scout.thinkingLevel, "high");
		assert.equal(saved.agents.scout.model, "provider/model");
		assert.equal(saved.agents.scout.timeoutMs, 1234);
		assert.equal(resetAgentExecution(agent, context.ctx).kind, "back");
		saved = JSON.parse(readFileSync(path.join(directory, "pi-subagents.json"), "utf8"));
		assert.deepEqual(saved.agents.scout, { tools: ["read"] });
	});
});

test("transport setting previews, protects retained agents, and applies after reload", async () => {
	await withAgentDir(async (directory) => {
		const blocked = createMockContext({ confirm: async () => true });
		const blockedResult = await applyTransportSetting(
			"rpc",
			blocked.ctx,
			runtime(1),
			new AbortController().signal,
			() => true,
		);
		assert.equal(blockedResult.kind, "rejected");
		assert.match(blocked.notifications.at(-1)?.message ?? "", /retained/i);
		assert.equal(existsSync(path.join(directory, "pi-subagents.json")), false);

		const accepted = createMockContext({ confirm: async () => true });
		const result = await applyTransportSetting(
			"auto",
			accepted.ctx,
			runtime(),
			new AbortController().signal,
			() => true,
		);
		assert.equal(result.kind, "stay");
		const saved = JSON.parse(readFileSync(path.join(directory, "pi-subagents.json"), "utf8"));
		assert.equal(saved.stateful.transport, "auto");
		assert.match(accepted.notifications.at(-1)?.message ?? "", /reload/i);
		assert.match(JSON.stringify(transportSettingsScreen(runtime())), /Persistent RPC process/);
	});
});
