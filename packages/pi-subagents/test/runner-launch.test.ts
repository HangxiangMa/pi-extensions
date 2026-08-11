import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { normalizeDelegationContract } from "../src/delegation-contract.js";
import { createExecutionPlan } from "../src/execution-plan.js";
import { DEFAULT_MAX_STDERR_BYTES, MAX_SUBAGENT_TIMEOUT_MS } from "../src/limits.js";
import { buildPiArgs, runSingleAgent } from "../src/runner.js";

test("buildPiArgs emits explicit read-only child launch policy flags", () => {
	assert.deepEqual(
		buildPiArgs({
			task: "inspect",
			tools: ["read", "grep"],
			disableExtensions: true,
			disableSkills: true,
			disablePromptTemplates: true,
			disableContextFiles: true,
			projectTrust: false,
			baseSystemPromptPath: "/tmp/base.md",
			appendSystemPromptPaths: ["/tmp/append.md", "/tmp/agent.md"],
		}),
		[
			"--mode",
			"json",
			"-p",
			"--no-session",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			"--no-approve",
			"--tools",
			"read,grep",
			"--system-prompt",
			"/tmp/base.md",
			"--append-system-prompt",
			"/tmp/append.md",
			"--append-system-prompt",
			"/tmp/agent.md",
			"Task: inspect",
		],
	);
	assert.deepEqual(buildPiArgs({ task: "existing" }), [
		"--mode",
		"json",
		"-p",
		"--no-session",
		"Task: existing",
	]);
});
test("runSingleAgent launch policies preserve agent tools unless explicitly overridden", async () => {
	const script = [
		"const text=JSON.stringify(process.argv.slice(1));",
		"const message={role:'assistant',content:[{type:'text',text}],stopReason:'stop',timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
	].join("");
	const result = await runSingleAgent(
		process.cwd(),
		[
			{
				name: "test",
				description: "test",
				tools: ["read"],
				systemPrompt: "",
				source: "built-in",
				filePath: "built-in:test",
			},
		],
		"test",
		"task",
		undefined,
		undefined,
		undefined,
		undefined,
		1_000,
		undefined,
		(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
		{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
		{ disableExtensions: true },
	);
	assert.match(result.finalOutput ?? "", /--tools/);
	assert.match(result.finalOutput ?? "", /read/);
});
test("runSingleAgent captures structured v2 results and keeps the display task", async () => {
	const output = JSON.stringify({
		version: "pi-subagents:result:v2",
		status: "completed",
		summary: "done",
		claims: [],
		artifacts: [],
		changes: [],
		verification: [],
		limitations: [],
		unresolvedDependencies: [],
	});
	const script = [
		`const text=${JSON.stringify(output)};`,
		"const message={role:'assistant',content:[{type:'text',text}],stopReason:'stop',timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
	].join("");
	const contract = normalizeDelegationContract({
		version: "pi-subagents:delegation:v2",
		level: "minimal",
		taskId: "task-1",
		objective: "test",
	});
	assert.ok(contract);
	const agent = {
		name: "test",
		description: "test",
		systemPrompt: "",
		source: "built-in" as const,
		filePath: "built-in:test",
	};
	const executionPlan = createExecutionPlan({
		contract,
		agent,
		target: {
			cwd: process.cwd(),
			boundary: "current-workspace",
			trust: { kind: "session-trusted", projectTrusted: true },
		},
		workspaceMode: "shared",
		transport: "subprocess",
		resultFormat: "structured-v2",
		taskGeneration: 7,
	});
	const result = await runSingleAgent(
		process.cwd(),
		[agent],
		"test",
		"executed prompt with metadata",
		undefined,
		undefined,
		undefined,
		undefined,
		1_000,
		undefined,
		(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
		{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
		{
			resultFormat: "structured-v2",
			contract,
			displayTask: "original task",
			executionPlan,
		},
	);
	assert.equal(result.task, "original task");
	assert.equal(result.structuredResult?.version, "pi-subagents:result:v2");
	assert.equal(result.resultContractInvalid, false);
	assert.equal(result.contract?.taskId, "task-1");
	assert.equal(
		result.structuredResult?.version === "pi-subagents:result:v2"
			? result.structuredResult.provenance?.taskGeneration
			: undefined,
		7,
	);
	assert.equal(
		result.structuredResult?.version === "pi-subagents:result:v2"
			? result.structuredResult.provenance?.executionPlanId
			: undefined,
		executionPlan.id,
	);
});
test("runSingleAgent distinguishes child launch failures", async () => {
	const result = await runSingleAgent(
		process.cwd(),
		[
			{
				name: "test",
				description: "test",
				systemPrompt: "",
				source: "built-in",
				filePath: "built-in:test",
			},
		],
		"test",
		"task",
		undefined,
		undefined,
		undefined,
		undefined,
		1_000,
		undefined,
		(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
		{ command: path.join(os.tmpdir(), "missing-pi-subagent-command") },
	);
	assert.equal(result.launchFailed, true);
	assert.equal(result.exitCode, 1);
});
test("runSingleAgent reports Pi CLI resolution failures and removes temporary prompts", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-resolution-failure-"));
	const tempDir = path.join(root, "tmp");
	const packageDir = path.join(root, "missing-core");
	mkdirSync(tempDir);
	mkdirSync(packageDir);
	const previousTmpDir = process.env.TMPDIR;
	const previousPackageDir = process.env.PI_PACKAGE_DIR;
	process.env.TMPDIR = tempDir;
	process.env.PI_PACKAGE_DIR = packageDir;
	try {
		const result = await runSingleAgent(
			process.cwd(),
			[
				{
					name: "test",
					description: "test",
					systemPrompt: "temporary private prompt",
					source: "built-in",
					filePath: "built-in:test",
				},
			],
			"test",
			"task",
			undefined,
			undefined,
			undefined,
			undefined,
			1_000,
			undefined,
			(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
		);
		assert.equal(result.launchFailed, true);
		assert.equal(result.processStarted, undefined);
		assert.equal(result.exitCode, 1);
		assert.match(
			result.errorMessage ?? "",
			/Unable to resolve the Pi CLI.*manifest is unavailable/i,
		);
		assert.ok(Buffer.byteLength(result.errorMessage ?? "", "utf8") <= DEFAULT_MAX_STDERR_BYTES);
		assert.deepEqual(readdirSync(tempDir), []);
	} finally {
		if (previousTmpDir === undefined) delete process.env.TMPDIR;
		else process.env.TMPDIR = previousTmpDir;
		if (previousPackageDir === undefined) delete process.env.PI_PACKAGE_DIR;
		else process.env.PI_PACKAGE_DIR = previousPackageDir;
		rmSync(root, { recursive: true, force: true });
	}
});
test("runSingleAgent normalizes invalid cwd without spawning or throwing", async () => {
	const result = await runSingleAgent(
		process.cwd(),
		[
			{
				name: "test",
				description: "test",
				systemPrompt: "",
				source: "built-in",
				filePath: "built-in:test",
			},
		],
		"test",
		"task",
		path.join(os.tmpdir(), "definitely-missing-pi-subagent-cwd"),
		undefined,
		undefined,
		undefined,
		100,
		undefined,
		(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
	);
	assert.equal(result.exitCode, 1);
	assert.equal(result.stopReason, "error");
	assert.match(result.errorMessage ?? "", /Invalid subagent cwd/);
});
test("runSingleAgent rejects timer overflow before spawning", async () => {
	const result = await runSingleAgent(
		process.cwd(),
		[
			{
				name: "test",
				description: "test",
				systemPrompt: "",
				source: "built-in",
				filePath: "built-in:test",
			},
		],
		"test",
		"task",
		undefined,
		undefined,
		undefined,
		undefined,
		MAX_SUBAGENT_TIMEOUT_MS + 1,
		undefined,
		(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
		{ command: path.join(os.tmpdir(), "missing-pi-subagent-command") },
	);
	assert.equal(result.exitCode, 1);
	assert.equal(result.stopReason, "error");
	assert.equal(result.launchFailed, undefined);
	assert.match(result.errorMessage ?? "", /Invalid subagent timeout/);
});
