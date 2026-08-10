import assert from "node:assert/strict";
import { test } from "vitest";
import {
	DEFAULT_MAX_CONTEXT_BYTES,
	DEFAULT_MAX_OUTPUT_BYTES,
	DEFAULT_MAX_STDERR_BYTES,
} from "../src/limits.js";
import {
	buildFanInContext,
	formatResultFailure,
	isResultError,
	runSingleAgent,
} from "../src/runner.js";

test("runSingleAgent preserves partial output on mid-stream abort and handles pre-abort", async () => {
	const script = [
		"const message={role:'assistant',content:[{type:'text',text:'PARTIAL'}],timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		"setInterval(()=>{},1000);",
	].join("");
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
	const controller = new AbortController();
	let sawPartial = false;
	const running = runSingleAgent(
		process.cwd(),
		agents,
		"test",
		"task",
		undefined,
		undefined,
		controller.signal,
		undefined,
		1_000,
		(partial) => {
			if (partial.content[0]?.type === "text" && partial.content[0].text === "PARTIAL") {
				sawPartial = true;
				controller.abort();
			}
		},
		makeDetails,
		{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
	);
	const aborted = await running;
	assert.equal(sawPartial, true);
	assert.equal(aborted.aborted, true);
	assert.equal(aborted.exitCode, 130);
	assert.equal(aborted.finalOutput, "PARTIAL");

	const preAborted = new AbortController();
	preAborted.abort();
	const beforeStart = await runSingleAgent(
		process.cwd(),
		agents,
		"test",
		"task",
		undefined,
		undefined,
		preAborted.signal,
		undefined,
		1_000,
		undefined,
		makeDetails,
		{ command: process.execPath, argsPrefix: ["-e", "setInterval(()=>{},1000)", "--"] },
	);
	assert.equal(beforeStart.aborted, true);
	assert.equal(beforeStart.exitCode, 130);
	assert.equal(beforeStart.timeoutSummary, undefined);
});
test("runSingleAgent aborts timed-out work and returns a hard-bounded tool-less summary", async () => {
	const script = [
		"const args=process.argv.slice(1);",
		"const task=args.at(-1)??'';",
		"if(task.includes('Work deadline expired')){",
		"const isolated=['--no-tools','--no-extensions','--no-skills','--no-prompt-templates','--no-context-files'].every(flag=>args.includes(flag));",
		"const summary={role:'assistant',content:[{type:'text',text:isolated?'SUMMARY_FROM_PARTIAL':'UNSAFE_SUMMARY'}],stopReason:'stop',timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'message_end',message:summary})+'\\n');",
		"}else{",
		"const partial={role:'assistant',content:[{type:'text',text:'PARTIAL_EVIDENCE'}],timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'message_end',message:partial})+'\\n');",
		"setInterval(()=>{},1000);",
		"}",
	].join("");
	const result = await runSingleAgent(
		process.cwd(),
		[
			{
				name: "test",
				description: "test",
				tools: ["read", "bash"],
				systemPrompt: "",
				source: "built-in",
				filePath: "built-in:test",
			},
		],
		"test",
		"inspect",
		undefined,
		undefined,
		undefined,
		"low",
		150,
		undefined,
		(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
		{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
		{ timeoutFinalizationMs: 200 },
	);
	assert.equal(result.exitCode, 124);
	assert.equal(result.timedOut, true);
	assert.equal(result.partialOutput, "PARTIAL_EVIDENCE");
	assert.equal(result.timeoutSummary, "SUMMARY_FROM_PARTIAL");
	assert.equal(result.finalOutput, "SUMMARY_FROM_PARTIAL");
	assert.equal(result.timeoutSummaryError, undefined);
});
test("runSingleAgent hard-bounds timeout summary finalization", async () => {
	const script = [
		"const args=process.argv.slice(1);const task=args.at(-1)??'';",
		"if(!task.includes('Work deadline expired')){const partial={role:'assistant',content:[{type:'text',text:'PARTIAL_ONLY'}],timestamp:Date.now()};process.stdout.write(JSON.stringify({type:'message_end',message:partial})+'\\n');}",
		"setInterval(()=>{},1000);",
	].join("");
	const started = Date.now();
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
		"inspect",
		undefined,
		undefined,
		undefined,
		undefined,
		100,
		undefined,
		(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
		{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
		{ timeoutFinalizationMs: 30 },
	);
	assert.equal(result.exitCode, 124);
	assert.equal(result.finalOutput, "PARTIAL_ONLY");
	assert.match(result.timeoutSummaryError ?? "", /timed out/i);
	assert.ok(Date.now() - started < 1_000, "summary finalization must remain hard-bounded");
});
test("runSingleAgent preserves completed tool evidence when timeout finalization fails", async () => {
	const script = [
		"const args=process.argv.slice(1);const task=args.at(-1)??'';",
		"if(task.includes('Work deadline expired')){setInterval(()=>{},1000);}else{",
		"const call={role:'assistant',content:[{type:'toolCall',id:'read-1',name:'read',arguments:{path:'src/config.ts'}},{type:'toolCall',id:'edit-1',name:'edit',arguments:{path:'src/config.ts'}}],stopReason:'toolUse',timestamp:Date.now()};",
		"const read={role:'toolResult',toolCallId:'read-1',toolName:'read',content:[{type:'text',text:'verified timeout evidence'}],isError:false,timestamp:Date.now()};",
		"const edit={role:'toolResult',toolCallId:'edit-1',toolName:'edit',content:[{type:'text',text:'updated src/config.ts'}],isError:false,timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'message_end',message:call})+'\\n');",
		"process.stdout.write(JSON.stringify({type:'tool_result_end',message:read})+'\\n');",
		"process.stdout.write(JSON.stringify({type:'tool_result_end',message:edit})+'\\n');",
		"setInterval(()=>{},1000);}",
	].join("");
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
		"inspect",
		undefined,
		undefined,
		undefined,
		undefined,
		120,
		undefined,
		(results) => ({ mode: "single", agentScope: "user", projectAgentsDir: null, results }),
		{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
		{ timeoutFinalizationMs: 30 },
	);

	assert.equal(result.termination?.reason, "work_timeout");
	assert.deepEqual(result.termination?.checkpoint.changedFiles, ["src/config.ts"]);
	assert.equal(result.termination?.checkpoint.sideEffectsMayHaveOccurred, true);
	assert.match(formatResultFailure(result), /verified timeout evidence/);
	assert.equal(result.termination?.finalization.status, "timed_out");
});
test("runSingleAgent enforces idle, turn, and tool-call budgets", async () => {
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
	const run = (
		script: string,
		turnLimits: NonNullable<Parameters<typeof runSingleAgent>[12]>["turnLimits"],
	) =>
		runSingleAgent(
			process.cwd(),
			agents,
			"test",
			"task",
			undefined,
			undefined,
			undefined,
			undefined,
			2_000,
			undefined,
			makeDetails,
			{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
			{ finalizeOnTimeout: false, turnLimits },
		);

	const idleStarted = Date.now();
	const idle = await run("setInterval(()=>{},1000)", { idleTimeoutMs: 100 });
	assert.equal(idle.termination?.reason, "idle_timeout");
	assert.ok(Date.now() - idleStarted < 1_000);

	const turnScript = [
		"for(let i=0;i<2;i++){const message={role:'assistant',content:[{type:'toolCall',id:String(i),name:'read',arguments:{path:'x'}}],stopReason:'toolUse',timestamp:Date.now()};process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');}",
		"setInterval(()=>{},1000);",
	].join("");
	const turns = await run(turnScript, { maxTurns: 2 });
	assert.equal(turns.termination?.reason, "turn_limit");

	const toolsScript = [
		"const message={role:'assistant',content:[{type:'toolCall',id:'1',name:'read',arguments:{}},{type:'toolCall',id:'2',name:'read',arguments:{}}],stopReason:'toolUse',timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');setInterval(()=>{},1000);",
	].join("");
	const tools = await run(toolsScript, { maxToolCalls: 1 });
	assert.equal(tools.termination?.reason, "tool_call_limit");
});
test("runSingleAgent preserves final text beyond its history budget and rejects empty final output", async () => {
	const agents = [
		{
			name: "test",
			description: "test",
			systemPrompt: "",
			source: "built-in" as const,
			model: "requested-alias",
			filePath: "built-in:test",
		},
	];
	const makeDetails = (results: Parameters<Parameters<typeof runSingleAgent>[10]>[0]) => ({
		mode: "single" as const,
		agentScope: "user" as const,
		projectAgentsDir: null,
		results,
	});
	const runScript = (script: string) =>
		runSingleAgent(
			process.cwd(),
			agents,
			"test",
			"task",
			undefined,
			undefined,
			undefined,
			undefined,
			1_000,
			undefined,
			makeDetails,
			{ command: process.execPath, argsPrefix: ["-e", script, "--"] },
		);

	const script = [
		`const large='x'.repeat(${DEFAULT_MAX_OUTPUT_BYTES});`,
		"const tool={role:'toolResult',toolCallId:'call-1',toolName:'read',content:[{type:'text',text:large}],isError:false,timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'tool_result_end',message:tool})+'\\n');",
		"process.stdout.write(JSON.stringify({type:'tool_result_end',message:{...tool,toolCallId:'call-2'}})+'\\n');",
		"const final={role:'assistant',content:[{type:'text',text:'FINAL_SURVIVES'}],stopReason:'stop',timestamp:Date.now()};",
		"process.stdout.write(JSON.stringify({type:'message_end',message:final})+'\\n');",
	].join("");
	const result = await runScript(script);
	assert.equal(result.exitCode, 0);
	assert.equal(result.truncated, true);
	assert.equal(result.finalOutput, "FINAL_SURVIVES");
	assert.match(buildFanInContext([result]), /FINAL_SURVIVES/);

	const hugeFinal = await runScript(
		[
			`const text='界'.repeat(${DEFAULT_MAX_OUTPUT_BYTES});`,
			"const message={role:'assistant',content:[{type:'text',text}],stopReason:'stop',timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	assert.ok(Buffer.byteLength(hugeFinal.finalOutput ?? "", "utf8") <= DEFAULT_MAX_OUTPUT_BYTES);
	assert.match(hugeFinal.finalOutput ?? "", /truncated by pi-subagents/);

	const providerError = await runScript(
		[
			`const errorMessage='E'.repeat(${DEFAULT_MAX_OUTPUT_BYTES});`,
			"const message={role:'assistant',content:[{type:'text',text:'PARTIAL'}],stopReason:'error',errorMessage,timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	assert.ok(
		Buffer.byteLength(providerError.errorMessage ?? "", "utf8") <= DEFAULT_MAX_STDERR_BYTES,
	);
	assert.match(providerError.errorMessage ?? "", /truncated by pi-subagents/);
	assert.equal(providerError.finalOutput, "PARTIAL");
	assert.equal(isResultError(providerError), true);
	const providerFailureContext = buildFanInContext([providerError]);
	assert.match(providerFailureContext, /test \(failed\)/);
	assert.match(providerFailureContext, /Error:\nE/);
	assert.match(providerFailureContext, /Partial output:\nPARTIAL/);

	const emptyProviderError = await runScript(
		[
			"const message={role:'assistant',content:[],stopReason:'error',errorMessage:'RATE_LIMIT_DETAIL',timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	assert.equal(emptyProviderError.stopReason, "error");
	assert.equal(emptyProviderError.errorMessage, "RATE_LIMIT_DETAIL");
	assert.equal(emptyProviderError.finalOutput, "");

	const multiBlock = await runScript(
		[
			"const message={role:'assistant',content:[{type:'text',text:'FIRST'},{type:'text',text:'SECOND'}],stopReason:'stop',timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	assert.equal(multiBlock.exitCode, 0);
	assert.equal(multiBlock.finalOutput, "FIRST\nSECOND");

	const paddedActivity = await runScript(
		[
			"const message={role:'assistant',content:[{type:'text',text:'\\n'.repeat(2048)+'LATEST_ACTIVITY\\n\\n'}],stopReason:'stop',timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	assert.deepEqual(paddedActivity.recentActivity, [{ type: "text", text: "LATEST_ACTIVITY" }]);

	const empty = await runScript(
		[
			"const commentary={role:'assistant',content:[{type:'text',text:'OLD_COMMENTARY'}],stopReason:'toolUse',timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message:commentary})+'\\n');",
			"const final={role:'assistant',content:[{type:'text',text:''}],stopReason:'stop',timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message:final})+'\\n');",
		].join(""),
	);
	assert.equal(empty.exitCode, 1);
	assert.equal(empty.stopReason, "error");
	assert.equal(empty.finalOutput, "");
	assert.equal(empty.errorMessage, "Subagent completed without final text");

	const boundedFailure = formatResultFailure({
		agent: "test",
		agentSource: "built-in",
		task: "task",
		exitCode: 124,
		messages: [],
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
		errorMessage: "E".repeat(20_000),
		finalOutput: "界".repeat(DEFAULT_MAX_CONTEXT_BYTES),
	});
	assert.ok(Buffer.byteLength(boundedFailure, "utf8") <= DEFAULT_MAX_CONTEXT_BYTES);
	assert.match(boundedFailure, /Partial output/);
	assert.match(boundedFailure, /truncated by pi-subagents/);

	const rollingWindow = await runScript(
		[
			"for(let i=0;i<201;i++){const arguments_=i===200?{command:'echo call-200 '+ 'x'.repeat(200000)}:{};const toolCall={type:'toolCall',id:'call-'+i,name:'bash',arguments:arguments_};const content=i===200?[{type:'thinking',thinking:'omit'},toolCall]:[toolCall];const message={role:'assistant',content,stopReason:'toolUse'};process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');}",
			"const final={role:'assistant',provider:'actual-provider',responseModel:'actual-model',model:'fallback-alias',content:[{type:'text',text:'FINAL_WINDOW_SURVIVES'}],stopReason:'stop'};process.stdout.write(JSON.stringify({type:'message_end',message:final})+'\\n');",
		].join(""),
	);
	assert.equal(rollingWindow.finalOutput, "FINAL_WINDOW_SURVIVES");
	assert.equal(rollingWindow.actualProvider, "actual-provider");
	assert.equal(rollingWindow.actualModel, "actual-model");
	assert.equal(rollingWindow.model, "requested-alias");

	const malformedMetadata = await runScript(
		[
			"const message={role:'assistant',provider:{secret:'value'},responseModel:['bad'],content:[{type:'text',text:'SAFE_FINAL'}],stopReason:42,usage:{input:2,output:'bad',cacheRead:-3,cacheWrite:1.5,cost:{input:'bad',output:0.25,total:0.25}}};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	assert.equal(malformedMetadata.exitCode, 0);
	assert.equal(malformedMetadata.finalOutput, "SAFE_FINAL");
	assert.equal(malformedMetadata.actualProvider, undefined);
	assert.equal(malformedMetadata.actualModel, undefined);
	assert.equal(malformedMetadata.stopReason, undefined);
	assert.deepEqual(malformedMetadata.usage, {
		input: 2,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0.25,
		costInput: 0,
		costOutput: 0.25,
		costCacheRead: 0,
		costCacheWrite: 0,
		totalTokens: 2,
		contextTokens: 2,
		turns: 1,
	});
	assert.equal(rollingWindow.recentActivityTotal, 202);
	assert.equal(rollingWindow.recentActivity?.length, 10);
	assert.ok(Buffer.byteLength(JSON.stringify(rollingWindow.recentActivity), "utf8") <= 8 * 1024);
	assert.ok(
		rollingWindow.recentActivity?.some(
			(item) => item.type === "toolCall" && String(item.args.command).startsWith("echo call-200"),
		),
	);
	assert.ok(rollingWindow.messages.length <= 200);
	assert.ok(
		Buffer.byteLength(JSON.stringify(rollingWindow.messages), "utf8") <= DEFAULT_MAX_OUTPUT_BYTES,
	);
	const calls = rollingWindow.messages.flatMap((message) =>
		message.role === "assistant" ? message.content.filter((part) => part.type === "toolCall") : [],
	);
	assert.equal(
		calls.some((call) => call.id === "call-0"),
		false,
	);
	assert.ok(calls.some((call) => call.id === "call-200" && call.name === "bash"));
	const lastCall = calls.find((call) => call.id === "call-200");
	assert.match(String(lastCall?.arguments.command), /^echo call-200/);
	assert.ok(
		rollingWindow.messages.every(
			(message) =>
				message.role !== "assistant" || message.content.every((part) => part.type !== "thinking"),
		),
	);
	assert.ok(
		rollingWindow.messages.every((message) =>
			message.role !== "assistant" && message.role !== "toolResult"
				? true
				: message.content.every((part) => part.type !== "text" || part.text.trim()),
		),
	);

	const updateSnapshots: Array<{ details: { results: Array<{ messages: unknown[] }> } }> = [];
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
		(update) => updateSnapshots.push(structuredClone(update) as never),
		makeDetails,
		{
			command: process.execPath,
			argsPrefix: [
				"-e",
				`const tool={role:'toolResult',toolCallId:'oversize-call',toolName:'read',content:[{type:'text',text:'x'.repeat(${DEFAULT_MAX_OUTPUT_BYTES * 2})}],isError:true,timestamp:123};process.stdout.write(JSON.stringify({type:'tool_result_end',message:tool})+'\\n');`,
				"--",
			],
		},
	);
	assert.equal(updateSnapshots.length, 1);
	const compressedToolResult = updateSnapshots[0].details.results[0].messages.find(
		(
			message,
		): message is {
			role: "toolResult";
			content: Array<{ type: "text"; text: string }>;
			toolCallId: string;
			toolName: string;
			isError: boolean;
			timestamp: number;
		} =>
			typeof message === "object" &&
			message !== null &&
			"role" in message &&
			message.role === "toolResult",
	);
	assert.ok(compressedToolResult);
	assert.ok(
		Buffer.byteLength(JSON.stringify(compressedToolResult), "utf8") <= DEFAULT_MAX_OUTPUT_BYTES,
	);
	assert.equal(compressedToolResult.toolCallId, "oversize-call");
	assert.equal(compressedToolResult.toolName, "read");
	assert.equal(compressedToolResult.isError, true);
	assert.equal(compressedToolResult.timestamp, 123);
	assert.ok(compressedToolResult.content[0].text.length > 0);

	const smallMessages = await runScript(
		[
			"const tool={role:'toolResult',content:[{type:'text',text:'small tool result'}],toolCallId:'tool-1',toolName:'read',isError:true,timestamp:123};",
			"process.stdout.write(JSON.stringify({type:'tool_result_end',message:tool})+'\\n');",
			"const message={role:'assistant',content:[{type:'text',text:'small assistant'}],timestamp:456,provider:'small-provider',responseModel:'small-model',usage:{input:1,output:2,cacheRead:3,cacheWrite:4,totalTokens:5,cost:{total:0.1}},stopReason:'stop'};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	assert.notEqual(smallMessages.truncated, true);
	const smallToolResult = smallMessages.messages.find((message) => message.role === "toolResult");
	assert.deepEqual(smallToolResult, {
		role: "toolResult",
		content: [{ type: "text", text: "small tool result" }],
		toolCallId: "tool-1",
		toolName: "read",
		isError: true,
		timestamp: 123,
	});
	const smallAssistant = smallMessages.messages.find((message) => message.role === "assistant");
	assert.equal(smallAssistant?.timestamp, 456);
	assert.equal(smallAssistant?.provider, "small-provider");
	assert.equal(smallAssistant?.responseModel, "small-model");
	assert.deepEqual(smallAssistant?.usage, {
		input: 1,
		output: 2,
		cacheRead: 3,
		cacheWrite: 4,
		totalTokens: 5,
		cost: { total: 0.1 },
	});
});
