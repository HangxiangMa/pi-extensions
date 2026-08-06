import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverAgents } from "../src/agents.js";

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
