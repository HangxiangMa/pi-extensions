import assert from "node:assert/strict";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { test } from "vitest";
import { DEFAULT_MAX_OUTPUT_BYTES } from "../src/limits.js";
import { renderSubagentCall, renderSubagentResult } from "../src/render.js";
import { runSingleAgent, type SubagentDetails } from "../src/runner.js";

initTheme("dark", false);

const ESCAPE = String.fromCharCode(27);
const SGR_PATTERN = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "gu");

function withoutSgr(value: string): string {
	return value.replace(SGR_PATTERN, "");
}

test("renderSubagentCall handles partial streaming arguments", () => {
	const identityTheme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
	const render = (args: unknown) =>
		renderSubagentCall(args as never, identityTheme as never)
			.render(120)
			.join("\n");

	assert.match(
		render({ tasks: [{ agent: "proof-auditor" }] }),
		/parallel \(1 tasks\).*proof-auditor \.\.\./s,
	);
	assert.match(
		render({ chain: [{ agent: "calculation-checker" }] }),
		/chain \(1 steps\).*calculation-checker \.\.\./s,
	);
	assert.doesNotMatch(
		render({
			tasks: [{ agent: "proof-auditor", task: "Review the proof" }],
			aggregator: { agent: "reviewer" },
		}),
		/fan-in/,
	);
	assert.match(render({ tasks: [{ task: "Review the proof" }] }), /\.\.\. Review the proof/);
});
test("renderSubagentCall omits an empty optional aggregator", () => {
	const identityTheme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
	const rendered = renderSubagentCall(
		{
			tasks: [{ agent: "scout", task: "Inspect the implementation" }],
			aggregator: { agent: "  ", task: "\t" },
		},
		identityTheme as never,
	)
		.render(120)
		.join("\n");

	assert.match(rendered, /parallel \(1 tasks\)/);
	assert.doesNotMatch(rendered, /fan-in/);
});
test("large tool results do not erase recent collapsed activity", async () => {
	const agents = [
		{
			name: "test",
			description: "test",
			systemPrompt: "",
			source: "built-in" as const,
			filePath: "built-in:test",
		},
	];
	const makeDetails = (results: Parameters<Parameters<typeof runSingleAgent>[10]>[0]) => ({
		mode: "single" as const,
		agentScope: "user" as const,
		projectAgentsDir: null,
		results,
	});
	const snapshots: Array<ReturnType<typeof structuredClone>> = [];
	const script = [
		"const assistant={role:'assistant',content:[{type:'toolCall',id:'latest',name:'bash',arguments:{command:'echo stays visible'}}],stopReason:'toolUse',timestamp:1};",
		"process.stdout.write(JSON.stringify({type:'message_end',message:assistant})+'\\n');",
		`const tool={role:'toolResult',toolCallId:'latest',toolName:'bash',content:[{type:'text',text:'x'.repeat(${DEFAULT_MAX_OUTPUT_BYTES * 2})}],isError:false,timestamp:2};`,
		"process.stdout.write(JSON.stringify({type:'tool_result_end',message:tool})+'\\n');",
	].join("");
	await runSingleAgent(
		process.cwd(),
		agents,
		"test",
		"task",
		undefined,
		undefined,
		undefined,
		undefined,
		1_000,
		(update) => snapshots.push(structuredClone(update)),
		makeDetails,
		{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
	);
	assert.equal(snapshots.length, 2);
	const afterToolResult = snapshots[1] as never;
	const details = (snapshots[1] as { details: SubagentDetails }).details;
	assert.equal(details.results[0].recentActivityTotal, 1);
	assert.deepEqual(details.results[0].recentActivity, [
		{ type: "toolCall", name: "bash", args: { command: "echo stays visible" } },
	]);
	assert.equal(
		details.results[0].messages.some(
			(message) =>
				message.role === "assistant" && message.content.some((part) => part.type === "toolCall"),
		),
		false,
	);
	const identityTheme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
	const rendered = renderSubagentResult(
		afterToolResult,
		{ expanded: false, isPartial: true } as never,
		identityTheme as never,
	)
		.render(120)
		.join("\n");
	assert.match(rendered, /echo stays visible/);
	assert.doesNotMatch(rendered, /\(running\.\.\.\)/);
});
test("renderSubagentResult keeps collapsed partial output dense and current", () => {
	const identityTheme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
	const partial = renderSubagentResult(
		{
			content: [],
			details: {
				mode: "single",
				agentScope: "user",
				projectAgentsDir: null,
				results: [
					{
						agent: "worker",
						agentSource: "built-in",
						task: "task",
						exitCode: 0,
						messages: [
							{
								role: "assistant",
								content: [
									...Array.from({ length: 12 }, () => ({ type: "text" as const, text: "" })),
									{
										type: "toolCall" as const,
										id: "latest",
										name: "bash",
										arguments: { command: "echo newest" },
									},
								],
							},
						],
						stderr: "",
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							cost: 0,
							contextTokens: 0,
							turns: 1,
						},
						actualProvider: "actual-provider",
						actualModel: "actual-model",
						thinkingLevel: "high",
					},
				],
			},
		} as never,
		{ expanded: false, isPartial: true } as never,
		identityTheme as never,
	)
		.render(120)
		.join("\n");
	assert.doesNotMatch(partial, /\n{2,}/);
	assert.match(partial, /echo newest/);
	assert.match(partial, /actual-provider\/actual-model/);
	assert.match(partial, /requested-thinking:high/);

	const empty = (isPartial: boolean) =>
		renderSubagentResult(
			{
				content: [],
				details: {
					mode: "single",
					agentScope: "user",
					projectAgentsDir: null,
					results: [
						{
							agent: "worker",
							agentSource: "built-in",
							task: "task",
							exitCode: 0,
							messages: [],
							stderr: "",
							usage: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								cost: 0,
								contextTokens: 0,
								turns: 0,
							},
						},
					],
				},
			} as never,
			{ expanded: false, isPartial } as never,
			identityTheme as never,
		)
			.render(120)
			.join("\n");
	assert.match(empty(true), /\(running\.\.\.\)/);
	assert.match(empty(false), /\(no output\)/);
});
test("blocking subagent renderer uses safe text, explicit states, and native expansion hints", () => {
	const identityTheme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
	const rawCall = renderSubagentCall(
		{
			agent: "worker <private>AGENT_SECRET</private>\u001b[31m",
			task: "Inspect <private>TASK_SECRET</private> safely",
		},
		identityTheme as never,
	)
		.render(20)
		.join("\n");
	const call = withoutSgr(rawCall);
	assert.doesNotMatch(call, /AGENT_SECRET|TASK_SECRET/u);
	assert.equal(rawCall.includes(ESCAPE), false);

	const result = {
		content: [],
		details: {
			mode: "single",
			agentScope: "user",
			projectAgentsDir: null,
			results: [
				{
					agent: "worker",
					agentSource: "built-in",
					task: "Inspect <private>TASK_SECRET</private>",
					exitCode: 0,
					messages: [],
					stderr: "",
					finalOutput:
						"safe line\nsecond\nthird\nfourth <private>OUTPUT_SECRET</private>\u001b]8;;bad\u0007",
					usage: {
						input: 1,
						output: 1,
						cacheRead: 0,
						cacheWrite: 0,
						cost: 0,
						contextTokens: 2,
						turns: 1,
					},
					policy: {
						inherited: ["read"],
						overridden: ["grep"],
						unsupported: ["missing"],
					},
				},
			],
		},
	} as never;
	const rendered = renderSubagentResult(
		result,
		{ expanded: false, isPartial: false } as never,
		identityTheme as never,
	);
	const lines = rendered.render(12);
	const text = withoutSgr(lines.join("\n"));
	assert.match(text, /Completed/);
	assert.match(text, /expand/);
	assert.doesNotMatch(text, /\(Ctrl\+O to expand\)|OUTPUT_SECRET/u);
	assert.equal(text.includes(ESCAPE), false);
	assert.ok(lines.every((line) => visibleWidth(line) <= 12));
	const expanded = withoutSgr(
		renderSubagentResult(
			result,
			{ expanded: true, isPartial: false } as never,
			identityTheme as never,
		)
			.render(80)
			.join("\n"),
	);
	assert.match(expanded, /Policy/);
	assert.match(expanded, /inherited: read/);
	assert.match(expanded, /overridden: grep/);
	assert.match(expanded, /unsupported: missing/);
});
test("renderSubagentResult keeps partial views running and renders final-only previews", () => {
	const identityTheme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
	};
	const result = (agent: string, finalOutput = "", exitCode = 0) => ({
		agent,
		agentSource: "built-in",
		task: `${agent} task`,
		exitCode,
		messages: [],
		stderr: "",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
			contextTokens: 0,
			turns: 0,
		},
		finalOutput,
	});
	const render = (details: unknown, isPartial: boolean, expanded = false) =>
		renderSubagentResult(
			{ content: [], details } as never,
			{ expanded, isPartial } as never,
			identityTheme as never,
		)
			.render(120)
			.join("\n");

	const singlePartial = render(
		{ mode: "single", agentScope: "user", projectAgentsDir: null, results: [result("single")] },
		true,
	);
	assert.match(singlePartial, /^⏳ single/);
	assert.doesNotMatch(singlePartial, /^✓/);

	const timedOutPartial = render(
		{
			mode: "single",
			agentScope: "user",
			projectAgentsDir: null,
			results: [
				{
					...result("timed-out"),
					timedOut: true,
					stopReason: "timeout",
					errorMessage: "Subagent timed out after 1000ms",
				},
			],
		},
		true,
	);
	assert.match(timedOutPartial, /^✗ timed-out .*\[timeout\]/);
	assert.match(timedOutPartial, /Error: Subagent timed out after 1000ms/);
	assert.doesNotMatch(timedOutPartial, /\(running\.\.\.\)/);

	const timedOutResult = (agent: string, exitCode: number) => ({
		...result(agent, "", exitCode),
		timedOut: true,
		stopReason: "timeout",
		errorMessage: `${agent} timed out`,
	});
	const parallelTimeout = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("done"), timedOutResult("timed-task", -1)],
		},
		true,
	);
	assert.match(parallelTimeout, /timed-task ✗/);
	assert.match(parallelTimeout, /Error: timed-task timed out/);
	assert.doesNotMatch(parallelTimeout, /running/);

	const mixedParallel = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [timedOutResult("timed-task", -1), result("still-running", "", -1)],
		},
		true,
	);
	assert.match(mixedParallel, /^⏳ parallel 1\/2 done, 1 running/);
	assert.match(mixedParallel, /still-running ⏳/);

	const settlingParallel = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("done")],
		},
		true,
	);
	assert.match(settlingParallel, /^⏳ parallel 1\/1 done, running/);

	const fanInTimeout = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("done")],
			aggregator: timedOutResult("fan-in", 0),
		},
		true,
	);
	assert.match(fanInTimeout, /fan-in → fan-in ✗/);
	assert.match(fanInTimeout, /Error: fan-in timed out/);
	assert.doesNotMatch(fanInTimeout, /running/);

	const failedWithOutput = (agent: string) => ({
		...result(agent, `${agent.toUpperCase()}_PARTIAL`),
		stopReason: "error",
		errorMessage: `${agent} provider failed`,
	});
	const singleFailure = render(
		{
			mode: "single",
			agentScope: "user",
			projectAgentsDir: null,
			results: [failedWithOutput("single-failed")],
		},
		true,
	);
	assert.match(singleFailure, /Error: single-failed provider failed/);
	assert.match(singleFailure, /SINGLE-FAILED_PARTIAL/);

	const chainTimeoutDetails = {
		mode: "chain",
		agentScope: "user",
		projectAgentsDir: null,
		results: [
			{
				...timedOutResult("chain-timeout", -1),
				step: 1,
				finalOutput: "CHAIN_TIMEOUT_PARTIAL",
			},
		],
	};
	for (const chainTimeout of [
		render(chainTimeoutDetails, true),
		render(chainTimeoutDetails, true, true),
	]) {
		assert.match(chainTimeout, /Error: chain-timeout timed out/);
		assert.match(chainTimeout, /CHAIN_TIMEOUT_PARTIAL/);
		assert.doesNotMatch(chainTimeout, /running/);
	}

	const parallelFailure = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [failedWithOutput("parallel-failed")],
		},
		true,
	);
	assert.match(parallelFailure, /Error: parallel-failed provider failed/);
	assert.match(parallelFailure, /PARALLEL-FAILED_PARTIAL/);

	const failedFanOutPendingFanIn = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [failedWithOutput("fan-out-failed")],
			aggregator: result("fan-in-pending", "", -1),
		},
		true,
	);
	assert.match(failedFanOutPendingFanIn, /^⏳ parallel 1\/1 done, fan-in running/);
	assert.doesNotMatch(failedFanOutPendingFanIn, /Total:/);

	const fanInFailure = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("done")],
			aggregator: failedWithOutput("fan-in-failed"),
		},
		true,
	);
	assert.match(fanInFailure, /Error: fan-in-failed provider failed/);
	assert.match(fanInFailure, /FAN-IN-FAILED_PARTIAL/);

	const chainPartial = render(
		{
			mode: "chain",
			agentScope: "user",
			projectAgentsDir: null,
			results: [
				{ ...result("first"), step: 1 },
				{ ...result("current"), step: 2 },
			],
		},
		true,
	);
	assert.match(chainPartial, /^⏳ chain 1\/2 steps/);
	assert.match(chainPartial, /Step 2: current ⏳/);

	const parallelPartial = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("done"), result("running", "", -1)],
		},
		true,
	);
	assert.match(parallelPartial, /^⏳ parallel 1\/2 done, 1 running/);
	assert.match(parallelPartial, /done ✓/);
	assert.match(parallelPartial, /running ⏳/);

	const fanInPartial = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("task")],
			aggregator: result("fan-in"),
		},
		true,
	);
	assert.match(fanInPartial, /^⏳ parallel 1\/1 done, fan-in running/);
	assert.match(fanInPartial, /fan-in → fan-in ⏳/);

	const withActivity = (agent: string, command: string) => ({
		...result(agent),
		recentActivity: [{ type: "toolCall" as const, name: "bash", args: { command } }],
		recentActivityTotal: 1,
	});
	const chainActivity = render(
		{
			mode: "chain",
			agentScope: "user",
			projectAgentsDir: null,
			results: [{ ...withActivity("chain", "echo chain activity"), step: 1 }],
		},
		false,
	);
	const parallelActivity = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [withActivity("parallel", "echo parallel activity")],
		},
		false,
	);
	const aggregatorActivity = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("task")],
			aggregator: withActivity("fan-in", "echo fan-in activity"),
		},
		false,
	);
	assert.match(chainActivity, /echo chain activity/);
	assert.match(parallelActivity, /echo parallel activity/);
	assert.match(aggregatorActivity, /echo fan-in activity/);

	const finalOnly = "FINAL_ONLY_1\nFINAL_ONLY_2\nFINAL_ONLY_3\nFINAL_ONLY_4";
	const chainFinal = render(
		{
			mode: "chain",
			agentScope: "user",
			projectAgentsDir: null,
			results: [{ ...result("chain", finalOnly), step: 1 }],
		},
		false,
	);
	const parallelFinal = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("parallel", finalOnly)],
		},
		false,
	);
	const aggregatorFinal = render(
		{
			mode: "parallel",
			agentScope: "user",
			projectAgentsDir: null,
			results: [result("task")],
			aggregator: result("fan-in", finalOnly),
		},
		false,
	);
	for (const output of [chainFinal, parallelFinal, aggregatorFinal]) {
		assert.match(output, /FINAL_ONLY_1/);
		assert.match(output, /FINAL_ONLY_2/);
		assert.match(output, /FINAL_ONLY_3/);
		assert.doesNotMatch(output, /FINAL_ONLY_4/);
	}
});
