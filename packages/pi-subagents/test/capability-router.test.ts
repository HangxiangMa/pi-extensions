import assert from "node:assert/strict";
import { test } from "vitest";
import type { AgentConfig } from "../src/agents.js";
import { routeByCapability } from "../src/capability-router.js";

function candidate(
	name: string,
	capabilities: string[],
	costHint: "low" | "medium" | "high",
	tools: string[] | undefined = ["read"],
): AgentConfig {
	return {
		name,
		description: name,
		systemPrompt: name,
		source: "user",
		filePath: `test:${name}`,
		tools,
		capabilityManifest: {
			version: "pi-subagents:capabilities:v1",
			capabilities,
			modalities: ["text"],
			resultFormats: ["text"],
			authority: { filesystem: "read" },
			verificationRoles: [],
			contextStrengths: ["repository"],
			limitations: [],
			costHint,
			latencyHint: "medium",
		},
	};
}

test("capability routing rejects unsupported work before execution", () => {
	assert.throws(
		() =>
			routeByCapability([candidate("scout", ["repository-research"], "low")], {
				requiredCapabilities: ["typescript-implementation"],
			}),
		/no capable agent/i,
	);
});

test("capability routing deterministically prefers the requested cost profile", () => {
	const decision = routeByCapability(
		[
			candidate("deep", ["repository-research"], "high"),
			candidate("fast", ["repository-research"], "low"),
		],
		{ requiredCapabilities: ["repository-research"], preferredCostHint: "low" },
	);
	assert.equal(decision.agent.name, "fast");
	assert.deepEqual(decision.eligibleAgents, ["fast", "deep"]);
});

test("capability routing validates an explicitly selected agent", () => {
	assert.throws(
		() =>
			routeByCapability([candidate("scout", ["repository-research"], "low")], {
				agent: "scout",
				requiredCapabilities: ["code-review"],
			}),
		/does not satisfy/i,
	);
});

test("capability routing resolves omitted tools to Pi's default tool set", () => {
	const worker = candidate("worker", ["implementation"], "medium");
	worker.tools = undefined;
	assert.equal(
		routeByCapability([worker], { requiredTools: ["read", "edit"] }).agent.name,
		"worker",
	);
	assert.throws(
		() => routeByCapability([worker], { requiredTools: ["grep"] }),
		/no capable agent/i,
	);
	worker.capabilityManifest = undefined;
	assert.equal(routeByCapability([worker], { requiredTools: ["read"] }).agent.name, "worker");
});
