import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import type { SubagentSettings } from "../src/agents.js";
import { type ConsultChildRequest, registerSubagentConsult } from "../src/consult.js";
import type { SingleResult } from "../src/runner.js";

function childResult(overrides: Partial<SingleResult> = {}): SingleResult {
	return {
		agent: "worker",
		agentSource: "built-in",
		task: "inspect",
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: {
			input: 10,
			output: 5,
			cacheRead: 2,
			cacheWrite: 1,
			cost: 0.25,
			contextTokens: 18,
			turns: 1,
		},
		finalOutput: "consulted answer",
		stopReason: "stop",
		...overrides,
	};
}

function setup(
	options: {
		settings?: SubagentSettings;
		runChild?: (request: ConsultChildRequest) => Promise<SingleResult>;
		invocationOverride?: { command: string; argsPrefix?: string[] };
	} = {},
) {
	const mock = createMockPi();
	const requests: ConsultChildRequest[] = [];
	const runChild =
		options.runChild || !options.invocationOverride
			? async (request: ConsultChildRequest) => {
					requests.push(request);
					return options.runChild
						? options.runChild(request)
						: childResult({ agent: request.agent.name });
				}
			: undefined;
	registerSubagentConsult(mock.pi, {
		getSettings: () => options.settings,
		invocationOverride: options.invocationOverride,
		...(runChild ? { runChild } : {}),
	});
	const tool = mock.tools.find((candidate) => candidate.name === "subagent_consult") as
		| {
				label: string;
				description: string;
				parameters: {
					additionalProperties?: boolean;
					required?: string[];
					properties?: Record<string, { enum?: string[]; default?: unknown; maximum?: number }>;
				};
				execute: (...args: unknown[]) => Promise<{
					content: Array<{ type: string; text: string }>;
					details: Record<string, unknown>;
					usage?: { input: number; output: number; totalTokens: number; cost: { total: number } };
				}>;
		  }
		| undefined;
	assert.ok(tool);
	return { mock, requests, tool };
}

function execute(
	tool: NonNullable<ReturnType<typeof setup>["tool"]>,
	params: Record<string, unknown>,
	ctx = createMockContext().ctx,
	signal?: AbortSignal,
) {
	return tool.execute("consult-1", params, signal, undefined, ctx);
}

test("subagent_consult registers a strict actionless single-agent schema", async () => {
	const { tool } = setup();
	assert.equal(tool.label, "Consult Read-only Subagent");
	assert.match(tool.description, /read-only/i);
	assert.equal(tool.parameters.additionalProperties, false);
	assert.deepEqual(tool.parameters.required?.sort(), ["agent", "task"]);
	assert.equal(tool.parameters.properties?.agentScope?.default, "user");
	assert.equal(tool.parameters.properties?.confirmProjectAgents?.default, true);
	assert.equal(tool.parameters.properties?.timeoutMs?.maximum, 2_147_483_647);
	assert.deepEqual(tool.parameters.properties?.thinkingLevel?.enum, [
		"off",
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh",
		"max",
	]);
	await assert.rejects(
		() => execute(tool, { agent: "worker", task: "x", tasks: [] }),
		/does not accept tasks/,
	);
	await assert.rejects(() => execute(tool, { agent: "worker" }), /requires task/);
});

test("subagent_consult reports actionable available agents before launching a child", async () => {
	const { tool, requests } = setup();
	await assert.rejects(
		() => execute(tool, { agent: "tester-one", task: "inspect" }),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /Unknown subagent definition: tester-one/);
			assert.match(error.message, /Available agents for agentScope "user":/);
			assert.match(error.message, /scout \(built-in\)/);
			assert.match(error.message, /reviewer \(built-in\)/);
			return true;
		},
	);
	assert.equal(requests.length, 0);
});

test("subagent_consult bounds unknown-agent recovery metadata", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-consult-agent-error-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = path.join(root, "agent-home");
	const agentsDir = path.join(process.env.PI_CODING_AGENT_DIR, "agents");
	mkdirSync(agentsDir, { recursive: true });
	try {
		for (let index = 0; index < 40; index += 1) {
			const name =
				index === 0 ? `custom-${"x".repeat(300)}` : `custom-${String(index).padStart(2, "0")}`;
			writeFileSync(
				path.join(agentsDir, `${String(index).padStart(2, "0")}.md`),
				`---\nname: ${name}\ndescription: Agent ${index}\n---\nInspect only.`,
			);
		}
		const { tool, requests } = setup();
		let message = "";
		await assert.rejects(
			() => execute(tool, { agent: "missing", task: "inspect" }),
			(error: unknown) => {
				assert.ok(error instanceof Error);
				message = error.message;
				return true;
			},
		);
		assert.equal(requests.length, 0);
		assert.ok(Buffer.byteLength(message, "utf8") <= 6 * 1024);
		assert.doesNotMatch(message, /x{200}/);
		assert.match(message, /14 additional agent definitions? omitted/);

		rmSync(agentsDir, { recursive: true, force: true });
		writeFileSync(agentsDir, "not a directory");
		await assert.rejects(
			() => execute(tool, { agent: "still-missing", task: "inspect" }),
			/Agent metadata discovery was incomplete/,
		);
		assert.equal(requests.length, 0);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("subagent_consult rejects unsafe CLI-bound tasks and timer overflow before launch", async () => {
	for (const [params, expected] of [
		[{ agent: "worker", task: "界".repeat(20_000) }, /UTF-8 bytes/i],
		[{ agent: "worker", task: "inspect\0outside" }, /NUL/i],
		[{ agent: "worker", task: "inspect", timeoutMs: 2_147_483_648 }, /timeoutMs.*2147483647/i],
	] as Array<[Record<string, unknown>, RegExp]>) {
		const { tool, requests } = setup();
		await assert.rejects(() => execute(tool, params), expected);
		assert.equal(requests.length, 0);
	}
});

test("subagent_consult enforces default, empty, and intersected tool policy with nested usage", async () => {
	for (const [settings, expected] of [
		[undefined, ["read", "grep", "find", "ls"]],
		[{ agents: { worker: { tools: [] } } }, []],
		[{ agents: { worker: { tools: ["bash", "read", "read", "grep"] } } }, ["read", "grep"]],
	] as Array<[SubagentSettings | undefined, string[]]>) {
		const { tool, requests } = setup({ settings });
		const result = await execute(tool, {
			agent: "worker",
			task: "Modify files if useful, but analysis is acceptable",
		});
		assert.deepEqual(requests[0].effectiveTools, expected);
		assert.equal(requests[0].launchPolicy.disableExtensions, true);
		assert.match(requests[0].agent.systemPrompt, /read-only/i);
		assert.deepEqual(
			(result.details.policy as { effectiveTools: string[] }).effectiveTools,
			expected,
		);
		assert.equal(result.usage?.input, 10);
		assert.equal(result.usage?.output, 5);
		assert.equal(result.usage?.totalTokens, 18);
		assert.equal(result.usage?.cost.total, 0.25);
		assert.doesNotMatch(JSON.stringify(result.details), /messages/);
	}
});

test("subagent_consult production runner emits enforced child arguments without provider traffic", async () => {
	const script = [
		"const fs=require('node:fs');const args=process.argv.slice(1);",
		"const promptFlags=['--system-prompt','--append-system-prompt'];const prompts=args.flatMap((arg,index)=>promptFlags.includes(arg)&&args[index+1]?[fs.readFileSync(args[index+1],'utf8')]:[]);",
		"const text=JSON.stringify({args,prompts});",
		"const message={role:'assistant',content:[{type:'text',text}],timestamp:Date.now(),provider:'test',model:'test',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0.1,output:0.2,cacheRead:0,cacheWrite:0,total:0.3}},stopReason:'stop'};",
		"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
	].join("");
	const { tool } = setup({
		settings: { agents: { worker: { tools: [] } }, consult: { resources: "none" } },
		invocationOverride: { command: process.execPath, argsPrefix: ["-e", script, "--"] },
	});
	const result = await execute(tool, { agent: "worker", task: "inspect" });
	for (const expected of [
		"--no-session",
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--no-approve",
		"--no-tools",
		"--system-prompt",
		"--append-system-prompt",
	]) {
		assert.match(result.content[0].text, new RegExp(expected));
	}
	assert.match(result.content[0].text, /read-only consultation assistant/i);
	assert.match(result.content[0].text, /This is a read-only consultation/i);
	assert.equal(result.usage?.totalTokens, 2);
	assert.equal(result.usage?.cost.total, 0.3);
});

test("subagent_consult bounds explicitly loaded base system prompts", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-consult-system-prompt-"));
	const workspace = path.join(root, "workspace");
	mkdirSync(path.join(workspace, ".pi"), { recursive: true });
	writeFileSync(
		path.join(workspace, ".pi", "SYSTEM.md"),
		`trusted-start\n${"界".repeat(30_000)}\nSHOULD_NOT_SURVIVE`,
	);
	try {
		const { tool, requests } = setup({
			settings: { consult: { resources: "project-context" } },
		});
		const trusted = createMockContext({ cwd: workspace, isProjectTrusted: () => true }).ctx;
		await execute(tool, { agent: "worker", task: "inspect" }, trusted);
		const prompt = requests[0].launchPolicy.baseSystemPrompt ?? "";
		assert.ok(Buffer.byteLength(prompt, "utf8") <= 50 * 1024);
		assert.match(prompt, /trusted-start/);
		assert.match(prompt, /truncated by pi-subagents/);
		assert.doesNotMatch(prompt, /SHOULD_NOT_SURVIVE/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("subagent_consult maps resource policies and rejects unsafe external cwd", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-consult-cwd-"));
	const workspace = path.join(root, "workspace");
	const external = path.join(root, "external");
	mkdirSync(path.join(workspace, ".pi"), { recursive: true });
	mkdirSync(external);
	writeFileSync(path.join(workspace, ".pi", "SYSTEM.md"), "trusted project system");
	try {
		const trusted = createMockContext({ cwd: workspace, isProjectTrusted: () => true }).ctx;
		const projectContext = setup({ settings: { consult: { resources: "project-context" } } });
		await execute(projectContext.tool, { agent: "worker", task: "inspect" }, trusted);
		assert.equal(projectContext.requests[0].launchPolicy.disableSkills, true);
		assert.equal(projectContext.requests[0].launchPolicy.disablePromptTemplates, true);
		assert.equal(projectContext.requests[0].launchPolicy.projectTrust, true);
		assert.equal(
			projectContext.requests[0].launchPolicy.baseSystemPrompt,
			"trusted project system",
		);

		await assert.rejects(
			() =>
				execute(projectContext.tool, { agent: "worker", task: "inspect", cwd: external }, trusted),
			/outside the current workspace/i,
		);

		const none = setup({ settings: { consult: { resources: "none" } } });
		await execute(none.tool, { agent: "worker", task: "inspect", cwd: external }, trusted);
		assert.equal(none.requests[0].launchPolicy.disableContextFiles, true);
		assert.equal(none.requests[0].launchPolicy.disableSkills, true);
		assert.match(none.requests[0].launchPolicy.baseSystemPrompt ?? "", /read-only consultation/i);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("subagent_consult checks trust before project discovery and fails closed without confirmation UI", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-consult-trust-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = path.join(root, "agent-home");
	const workspace = path.join(root, "workspace");
	mkdirSync(path.join(workspace, ".pi", "agents"), { recursive: true });
	writeFileSync(
		path.join(workspace, ".pi", "agents", "project.md"),
		"---\nname: project\ndescription: Project agent\n---\nproject prompt",
	);
	try {
		const { tool, requests } = setup();
		const untrusted = createMockContext({ cwd: workspace, isProjectTrusted: () => false }).ctx;
		await assert.rejects(
			() => execute(tool, { agent: "project", task: "inspect", agentScope: "project" }, untrusted),
			/trusted project/i,
		);
		assert.equal(requests.length, 0);

		const trustedNoUi = createMockContext({ cwd: workspace, isProjectTrusted: () => true }).ctx;
		await assert.rejects(
			() =>
				execute(tool, { agent: "project", task: "inspect", agentScope: "project" }, trustedNoUi),
			/confirmation.*UI/i,
		);
		await execute(
			tool,
			{
				agent: "project",
				task: "inspect",
				agentScope: "project",
				confirmProjectAgents: false,
			},
			trustedNoUi,
		);
		assert.equal(requests.length, 1);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("subagent_consult treats declined confirmation as normal cancellation", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-consult-cancel-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = path.join(root, "agent-home");
	const workspace = path.join(root, "workspace");
	mkdirSync(path.join(workspace, ".pi", "agents"), { recursive: true });
	writeFileSync(
		path.join(workspace, ".pi", "agents", "project-\u001b[31m.md"),
		"---\nname: project\ndescription: Project agent\n---\nprompt",
	);
	let confirmation = "";
	try {
		const { tool, requests } = setup();
		const ctx = createMockContext({
			cwd: workspace,
			hasUI: true,
			isProjectTrusted: () => true,
			confirm: async (title: string, message: string) => {
				confirmation = `${title}\n${message}`;
				return false;
			},
		}).ctx;
		const result = await execute(
			tool,
			{ agent: "project", task: "inspect", agentScope: "project" },
			ctx,
		);
		assert.equal(result.details.cancelled, true);
		assert.equal(result.usage, undefined);
		assert.equal(requests.length, 0);
		assert.equal(confirmation.includes("\u001b"), false);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("subagent_consult bounds answer lines and structured details", async () => {
	const tools = Array.from({ length: 1_000 }, (_, index) =>
		index % 2 === 0 ? "read" : `unavailable-${index}-${"x".repeat(500)}`,
	);
	const { tool } = setup({
		settings: { agents: { worker: { tools, model: "model-".repeat(20_000) } } },
		runChild: async () =>
			childResult({
				actualProvider: "provider-".repeat(20_000),
				actualModel: "actual-model-".repeat(20_000),
				finalOutput: "x\n".repeat(3_000),
			}),
	});
	const result = await execute(tool, { agent: "worker", task: "inspect" });
	assert.ok(Buffer.byteLength(result.content[0].text, "utf8") <= 50 * 1024);
	assert.ok(result.content[0].text.split("\n").length <= 2_000);
	assert.ok(Buffer.byteLength(JSON.stringify(result.details), "utf8") <= 50 * 1024);
	assert.equal(result.details.truncated, true);
});

test("subagent_consult preserves post-launch evidence and marks the finalized Pi result as an error", async () => {
	const { tool, mock } = setup({
		runChild: async () =>
			childResult({
				exitCode: 124,
				stopReason: "timeout",
				timedOut: true,
				finalOutput: "partial evidence",
				errorMessage: "timed out <private>SECRET_ERROR</private>\n[subagent-private] SECRET_LINE",
			}),
	});
	const result = await execute(tool, { agent: "worker", task: "inspect" });
	assert.equal(result.details.isError, true);
	assert.match(result.content[0].text, /partial evidence|timed out/);
	assert.doesNotMatch(JSON.stringify(result), /SECRET_ERROR|SECRET_LINE/);
	assert.equal(result.usage?.cost.total, 0.25);
	const handler = mock.events
		.get("tool_result")
		?.find(
			(candidate) =>
				candidate({ toolName: "other", details: {} }, createMockContext().ctx) === undefined,
		);
	assert.deepEqual(
		handler?.(
			{ toolName: "subagent_consult", details: result.details, usage: result.usage },
			createMockContext().ctx,
		),
		{ isError: true },
	);
});

test("subagent_consult preserves a post-launch caller abort as structured evidence", async () => {
	let started!: () => void;
	const didStart = new Promise<void>((resolve) => {
		started = resolve;
	});
	const { tool } = setup({
		runChild: async (request) => {
			started();
			await new Promise<void>((resolve) =>
				request.signal.addEventListener("abort", () => resolve(), { once: true }),
			);
			return childResult({
				exitCode: 130,
				stopReason: "aborted",
				aborted: true,
				processStarted: true,
				finalOutput: "partial before abort",
			});
		},
	});
	const controller = new AbortController();
	const running = execute(tool, { agent: "worker", task: "inspect" }, undefined, controller.signal);
	await didStart;
	controller.abort();
	const result = await running;
	assert.equal(result.details.isError, true);
	assert.match(result.content[0].text, /partial before abort/);
	assert.equal(result.usage?.cost.total, 0.25);
});

test("subagent_consult does not launch after a pending confirmation is replaced", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-consult-replaced-confirm-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = path.join(root, "agent-home");
	const workspace = path.join(root, "workspace");
	mkdirSync(path.join(workspace, ".pi", "agents"), { recursive: true });
	writeFileSync(
		path.join(workspace, ".pi", "agents", "project.md"),
		"---\nname: project\ndescription: Project agent\n---\nprompt",
	);
	let resolveConfirm!: (approved: boolean) => void;
	const confirming = new Promise<boolean>((resolve) => {
		resolveConfirm = resolve;
	});
	try {
		const { tool, mock, requests } = setup();
		const ctx = createMockContext({
			cwd: workspace,
			hasUI: true,
			isProjectTrusted: () => true,
			confirm: async () => confirming,
		}).ctx;
		const running = execute(
			tool,
			{ agent: "project", task: "inspect", agentScope: "project" },
			ctx,
		);
		await Promise.resolve();
		for (const handler of mock.events.get("session_start") ?? []) {
			await handler({}, createMockContext().ctx);
		}
		resolveConfirm(true);
		await assert.rejects(running, (error) => error instanceof Error && error.name === "AbortError");
		assert.equal(requests.length, 0);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("subagent_consult aborts owned work on session replacement", async () => {
	let started!: () => void;
	const didStart = new Promise<void>((resolve) => {
		started = resolve;
	});
	const { tool, mock } = setup({
		runChild: async (request) => {
			started();
			await new Promise<void>((resolve) =>
				request.signal.addEventListener("abort", () => resolve(), { once: true }),
			);
			return childResult({
				exitCode: 130,
				stopReason: "aborted",
				aborted: true,
				finalOutput: "",
				errorMessage: "replaced",
			});
		},
	});
	const running = execute(tool, { agent: "worker", task: "inspect" });
	await didStart;
	for (const handler of mock.events.get("session_start") ?? []) {
		await handler({}, createMockContext().ctx);
	}
	await assert.rejects(
		running,
		(error) =>
			error instanceof Error &&
			error.name === "AbortError" &&
			/owner was replaced/.test(error.message),
	);
});

test("subagent_consult waits for owned child cleanup on shutdown", async () => {
	let started!: () => void;
	const didStart = new Promise<void>((resolve) => {
		started = resolve;
	});
	let cleaned = false;
	const { tool, mock } = setup({
		runChild: async (request) => {
			started();
			await new Promise<void>((resolve) =>
				request.signal.addEventListener("abort", () => resolve(), { once: true }),
			);
			await new Promise((resolve) => setTimeout(resolve, 5));
			cleaned = true;
			return childResult({ exitCode: 130, stopReason: "aborted", aborted: true });
		},
	});
	const running = execute(tool, { agent: "worker", task: "inspect" });
	await didStart;
	for (const handler of mock.events.get("session_shutdown") ?? []) {
		await handler({}, createMockContext().ctx);
	}
	assert.equal(cleaned, true);
	await assert.rejects(running, (error) => error instanceof Error && error.name === "AbortError");
});
