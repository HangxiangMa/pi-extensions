import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { discoverAgents, getBuiltInAgent } from "../src/agents.js";

function agentMarkdown(name: string, toolsLine?: string): string {
	return [
		"---",
		`name: ${name}`,
		`description: ${name} agent`,
		...(toolsLine === undefined ? [] : [toolsLine]),
		"---",
		"Agent prompt.",
	].join("\n");
}

test("agent frontmatter loads optional capability manifests without weakening legacy agents", () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-capabilities-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = directory;
	try {
		const agentsDir = path.join(directory, "agents");
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(
			path.join(agentsDir, "capable.md"),
			[
				"---",
				"name: capable",
				"description: capable agent",
				"capabilityManifest:",
				"  version: pi-subagents:capabilities:v1",
				"  capabilities: [repository-search]",
				"  modalities: [text]",
				"  resultFormats: [structured-v2]",
				"  authority:",
				"    filesystem: read",
				"---",
				"Agent prompt.",
			].join("\n"),
		);
		writeFileSync(path.join(agentsDir, "legacy.md"), agentMarkdown("legacy"));
		const agents = discoverAgents(directory, "user").agents;
		assert.deepEqual(agents.find((agent) => agent.name === "capable")?.capabilityManifest, {
			version: "pi-subagents:capabilities:v1",
			capabilities: ["repository-search"],
			modalities: ["text"],
			resultFormats: ["structured-v2"],
			authority: { filesystem: "read" },
			verificationRoles: [],
			limitations: [],
		});
		assert.equal(agents.find((agent) => agent.name === "legacy")?.capabilityManifest, undefined);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(directory, { recursive: true, force: true });
	}
});

test("built-in lookup is immutable when a user agent and settings override the same name", () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-built-in-agent-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = directory;
	try {
		const agentsDir = path.join(directory, "agents");
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(path.join(agentsDir, "worker.md"), agentMarkdown("worker", "tools: bash"));
		const discovered = discoverAgents(directory, "user", {
			agents: { worker: { model: "custom-model", thinkingLevel: "max" } },
		}).agents.find((agent) => agent.name === "worker");
		assert.equal(discovered?.source, "user");
		assert.deepEqual(discovered?.tools, ["bash"]);
		assert.equal(discovered?.model, "custom-model");

		const builtIn = getBuiltInAgent("worker");
		assert.equal(builtIn?.source, "built-in");
		assert.equal(builtIn?.model, undefined);
		assert.equal(builtIn?.thinkingLevel, undefined);
		assert.equal(getBuiltInAgent("explorer")?.thinkingLevel, "low");
		assert.deepEqual(getBuiltInAgent("explorer")?.tools, ["read", "grep", "find", "ls"]);
		assert.equal(getBuiltInAgent("worker")?.thinkingLevel, undefined);
		assert.equal(getBuiltInAgent("planner"), undefined);
		assert.equal(getBuiltInAgent("scout"), undefined);
		assert.equal(getBuiltInAgent("reviewer"), undefined);
		assert.equal(getBuiltInAgent("general"), undefined);
		assert.equal(getBuiltInAgent("general-purpose"), undefined);
		const builtInNames = discoverAgents(directory, "project").agents.map((agent) => agent.name);
		assert.deepEqual(builtInNames, ["explorer", "worker"]);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(directory, { recursive: true, force: true });
	}
});

test("agent frontmatter preserves missing, empty, and comma-separated tool intent", () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-agents-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = directory;
	try {
		const agentsDir = path.join(directory, "agents");
		mkdirSync(agentsDir, { recursive: true });
		writeFileSync(path.join(agentsDir, "missing.md"), agentMarkdown("missing"));
		writeFileSync(path.join(agentsDir, "blank.md"), agentMarkdown("blank", "tools:"));
		writeFileSync(path.join(agentsDir, "empty.md"), agentMarkdown("empty", "tools: []"));
		writeFileSync(
			path.join(agentsDir, "selected.md"),
			agentMarkdown("selected", "tools: read, grep, read"),
		);
		writeFileSync(
			path.join(agentsDir, "array.md"),
			agentMarkdown("array", 'tools: [read, " grep ", ""]'),
		);

		const agents = discoverAgents(directory, "user").agents;
		assert.equal(agents.find((agent) => agent.name === "missing")?.tools, undefined);
		assert.deepEqual(agents.find((agent) => agent.name === "blank")?.tools, []);
		assert.deepEqual(agents.find((agent) => agent.name === "empty")?.tools, []);
		assert.deepEqual(agents.find((agent) => agent.name === "selected")?.tools, [
			"read",
			"grep",
			"read",
		]);
		assert.deepEqual(agents.find((agent) => agent.name === "array")?.tools, ["read", "grep"]);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(directory, { recursive: true, force: true });
	}
});
