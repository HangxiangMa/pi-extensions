import assert from "node:assert/strict";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import {
	type AnalyticsStorePort,
	createAnalyticsExtension,
	isBuiltinReadTool,
} from "../src/analytics.js";
import { NewerSchemaError } from "../src/storage/migrations.js";
import type { AnalyticsSnapshot, TimeRange } from "../src/storage/queries.js";
import type { SettledRun } from "../src/types.js";

const emptySnapshot: AnalyticsSnapshot = {
	overview: {
		responseCycles: 0,
		llmCalls: 0,
		callsPerResponse: 0,
		p95CallsPerResponse: 0,
		toolCalls: 0,
		toolErrors: 0,
		skillActivations: 0,
		providerErrors: 0,
		recoveredErrors: 0,
	},
	skills: [],
	tools: [],
	reliability: {
		http429: 0,
		http5xx: 0,
		recovered: 0,
		terminal: 0,
		categories: {
			dns: 0,
			timeout: 0,
			connection_refused: 0,
			connection_reset: 0,
			tls: 0,
			network_other: 0,
			provider_other: 0,
		},
	},
	responses: {
		count: 0,
		llmCalls: 0,
		average: 0,
		median: 0,
		p95: 0,
		maximum: 0,
		distribution: { one: 0, twoToThree: 0, fourToSix: 0, sevenPlus: 0 },
	},
};

class FakeStore implements AnalyticsStorePort {
	readonly path = "/tmp/pi-analytics.db";
	readonly runs: SettledRun[] = [];
	closed = 0;
	clears = 0;
	failWrites = false;

	async recordRun(run: SettledRun): Promise<void> {
		if (this.failWrites) throw new Error("write failed with /private/path");
		this.runs.push(run);
	}
	async getSnapshot(_range: TimeRange): Promise<AnalyticsSnapshot> {
		return emptySnapshot;
	}
	async clearAll(): Promise<number> {
		this.clears += 1;
		return this.runs.length;
	}
	async close(): Promise<void> {
		this.closed += 1;
	}
}

function lifecycleContext(overrides: Record<string, unknown> = {}) {
	return createMockContext({
		hasUI: true,
		mode: "rpc",
		cwd: "/workspace",
		model: { provider: "openai", id: "gpt-test" },
		...overrides,
	});
}

async function emit(
	mock: ReturnType<typeof createMockPi>,
	name: string,
	event: Record<string, unknown>,
	ctx: unknown,
): Promise<void> {
	for (const handler of mock.events.get(name) ?? []) await handler(event, ctx);
}

test("skill read attribution requires Pi's built-in read tool", () => {
	assert.equal(
		isBuiltinReadTool(
			createMockPi({
				allTools: [{ name: "read", sourceInfo: { source: "builtin" } }],
			}).pi,
		),
		true,
	);
	assert.equal(
		isBuiltinReadTool(
			createMockPi({
				allTools: [{ name: "read", sourceInfo: { source: "custom-extension" } }],
			}).pi,
		),
		false,
	);
});

test("session start visibly warns that analytics is experimental", async () => {
	const mock = createMockPi();
	createAnalyticsExtension({ openStore: async () => new FakeStore() })(mock.pi);
	const started = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, started.ctx);
	assert.deepEqual(started.notifications[0], {
		message: "pi-analytics is experimental; its metrics and dashboard may change.",
		level: "warning",
	});
});

test("factory registers one command and lifecycle collectors without opening storage", () => {
	let opens = 0;
	const mock = createMockPi();
	createAnalyticsExtension({
		openStore: async () => {
			opens += 1;
			return new FakeStore();
		},
	})(mock.pi);
	assert.equal(opens, 0);
	assert.ok(mock.commands.has("analytics"));
	assert.deepEqual([...mock.events.keys()].sort(), [
		"after_provider_response",
		"agent_settled",
		"agent_start",
		"before_agent_start",
		"before_provider_request",
		"input",
		"message_end",
		"session_shutdown",
		"session_start",
		"tool_execution_end",
		"tool_execution_start",
		"tool_result",
		"turn_start",
	]);
});

test("a settled tool loop is collected once and shutdown closes its store", async () => {
	const store = new FakeStore();
	let now = 100;
	let id = 0;
	const mock = createMockPi({ thinkingLevel: "high" });
	createAnalyticsExtension({
		openStore: async () => store,
		now: () => now++,
		createId: () => `id-${++id}`,
	})(mock.pi);
	const { ctx } = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, ctx);
	await emit(mock, "input", { text: "Fix it", source: "interactive", images: undefined }, ctx);
	await emit(
		mock,
		"before_agent_start",
		{ prompt: "Fix it", systemPromptOptions: { skills: [] } },
		ctx,
	);
	await emit(mock, "agent_start", {}, ctx);
	await emit(mock, "turn_start", { turnIndex: 0, timestamp: now }, ctx);
	await emit(mock, "before_provider_request", { payload: {} }, ctx);
	await emit(mock, "after_provider_response", { status: 200, headers: {} }, ctx);
	await emit(mock, "message_end", { message: { role: "assistant", stopReason: "toolUse" } }, ctx);
	await emit(
		mock,
		"tool_execution_start",
		{ toolCallId: "call-1", toolName: "read", args: { path: "README.md" } },
		ctx,
	);
	await emit(
		mock,
		"tool_execution_end",
		{ toolCallId: "call-1", toolName: "read", result: {}, isError: false },
		ctx,
	);
	await emit(mock, "turn_start", { turnIndex: 1, timestamp: now }, ctx);
	await emit(mock, "before_provider_request", { payload: {} }, ctx);
	await emit(mock, "message_end", { message: { role: "assistant", stopReason: "stop" } }, ctx);
	await emit(mock, "agent_settled", {}, ctx);
	assert.equal(store.runs.length, 1);
	assert.equal(store.runs[0]?.generations.length, 2);
	assert.equal(store.runs[0]?.tools.length, 1);
	await emit(mock, "session_shutdown", { reason: "quit" }, ctx);
	assert.equal(store.closed, 1);
});

test("automatic retry remains in one response and becomes recovered success", async () => {
	const store = new FakeStore();
	const mock = createMockPi();
	createAnalyticsExtension({ openStore: async () => store })(mock.pi);
	const started = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, started.ctx);
	await emit(
		mock,
		"before_agent_start",
		{ prompt: "run", systemPromptOptions: { skills: [] } },
		started.ctx,
	);
	for (const stopReason of ["error", "stop"]) {
		await emit(mock, "agent_start", {}, started.ctx);
		await emit(mock, "turn_start", { turnIndex: 0, timestamp: 1 }, started.ctx);
		await emit(mock, "before_provider_request", { payload: {} }, started.ctx);
		await emit(
			mock,
			"message_end",
			{
				message: {
					role: "assistant",
					stopReason,
					...(stopReason === "error" ? { errorMessage: "fetch failed" } : {}),
				},
			},
			started.ctx,
		);
	}
	await emit(mock, "agent_settled", {}, started.ctx);
	assert.equal(store.runs.length, 1);
	assert.equal(store.runs[0]?.attemptCount, 2);
	assert.equal(store.runs[0]?.outcome, "recovered_success");
});

test("an automatic continuation that starts without a prompt retains its attempt", async () => {
	const store = new FakeStore();
	const mock = createMockPi();
	createAnalyticsExtension({ openStore: async () => store })(mock.pi);
	const started = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, started.ctx);
	await emit(mock, "agent_start", {}, started.ctx);
	await emit(mock, "turn_start", { turnIndex: 0, timestamp: 1 }, started.ctx);
	await emit(mock, "before_provider_request", { payload: {} }, started.ctx);
	await emit(
		mock,
		"message_end",
		{ message: { role: "assistant", stopReason: "stop" } },
		started.ctx,
	);
	await emit(mock, "agent_settled", {}, started.ctx);
	assert.equal(store.runs[0]?.attemptCount, 1);
	assert.equal(store.runs[0]?.triggerSource, "extension");
});

test("explicit and successful read skill activations are attributed and deduplicated", async (t) => {
	const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const path = await import("node:path");
	const cwd = await mkdtemp(path.join(tmpdir(), "pi-analytics-extension-skill-"));
	t.after(() => rm(cwd, { recursive: true, force: true }));
	const skillDir = path.join(cwd, "skill");
	await mkdir(skillDir);
	const skillFile = path.join(skillDir, "SKILL.md");
	await writeFile(skillFile, "skill");
	const store = new FakeStore();
	const mock = createMockPi({
		allTools: [{ name: "read", sourceInfo: { source: "builtin" } }],
	});
	createAnalyticsExtension({ openStore: async () => store })(mock.pi);
	const { ctx } = lifecycleContext({ cwd });
	await emit(mock, "session_start", { reason: "startup" }, ctx);
	await emit(mock, "input", { text: "/skill:reviewing-code inspect", source: "interactive" }, ctx);
	await emit(
		mock,
		"before_agent_start",
		{
			prompt: "expanded",
			systemPromptOptions: {
				skills: [{ name: "reviewing-code", filePath: skillFile }],
			},
		},
		ctx,
	);
	await emit(mock, "agent_start", {}, ctx);
	await emit(mock, "before_provider_request", { payload: {} }, ctx);
	await emit(
		mock,
		"tool_result",
		{
			toolCallId: "read-1",
			toolName: "read",
			input: { path: skillFile },
			content: [],
			isError: false,
		},
		ctx,
	);
	await emit(mock, "message_end", { message: { role: "assistant", stopReason: "stop" } }, ctx);
	await emit(mock, "agent_settled", {}, ctx);
	assert.deepEqual(
		store.runs[0]?.skills.map(({ name, initiatedBy }) => ({ name, initiatedBy })),
		[{ name: "reviewing-code", initiatedBy: "user" }],
	);
});

test("a skill command queued during streaming belongs to the active response", async () => {
	const store = new FakeStore();
	const mock = createMockPi();
	createAnalyticsExtension({ openStore: async () => store })(mock.pi);
	const started = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, started.ctx);
	await emit(
		mock,
		"before_agent_start",
		{
			prompt: "initial",
			systemPromptOptions: {
				skills: [{ name: "reviewing-code", filePath: "/missing/reviewing-code/SKILL.md" }],
			},
		},
		started.ctx,
	);
	await emit(
		mock,
		"input",
		{
			text: "/skill:reviewing-code continue",
			source: "interactive",
			streamingBehavior: "followUp",
		},
		started.ctx,
	);
	await emit(mock, "before_provider_request", { payload: {} }, started.ctx);
	await emit(
		mock,
		"message_end",
		{ message: { role: "assistant", stopReason: "stop" } },
		started.ctx,
	);
	await emit(mock, "agent_settled", {}, started.ctx);
	assert.deepEqual(
		store.runs[0]?.skills.map(({ name, initiatedBy }) => ({ name, initiatedBy })),
		[{ name: "reviewing-code", initiatedBy: "user" }],
	);
});

test("replacement invalidates a delayed startup and closes the stale store", async () => {
	let resolveFirst!: (store: FakeStore) => void;
	const firstOpening = new Promise<FakeStore>((resolve) => {
		resolveFirst = resolve;
	});
	const first = new FakeStore();
	const second = new FakeStore();
	let calls = 0;
	const mock = createMockPi();
	createAnalyticsExtension({
		openStore: async () => (++calls === 1 ? firstOpening : second),
	})(mock.pi);
	const { ctx } = lifecycleContext();
	const starting = emit(mock, "session_start", { reason: "startup" }, ctx);
	const shuttingDown = emit(mock, "session_shutdown", { reason: "new" }, ctx);
	resolveFirst(first);
	await Promise.all([starting, shuttingDown]);
	await emit(mock, "session_start", { reason: "new" }, ctx);
	assert.equal(first.closed, 1);
	assert.equal(second.closed, 0);
});

test("arguments and noninteractive command modes reject before querying", async () => {
	const store = new FakeStore();
	let loads = 0;
	store.getSnapshot = async () => {
		loads += 1;
		return emptySnapshot;
	};
	const mock = createMockPi();
	createAnalyticsExtension({ openStore: async () => store })(mock.pi);
	const command = mock.commands.get("analytics");
	assert.ok(command);
	const interactive = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, interactive.ctx);
	await command.handler("trailing", interactive.ctx);
	assert.ok(
		interactive.notifications.some(({ message }) => message.includes("does not accept arguments")),
	);
	for (const mode of ["print", "json"] as const) {
		const noninteractive = lifecycleContext({ hasUI: false, mode });
		await assert.rejects(async () => command.handler("", noninteractive.ctx), /TUI or RPC/);
		await assert.rejects(
			async () => command.handler("trailing", noninteractive.ctx),
			/does not accept arguments/,
		);
	}
	assert.equal(loads, 0);
});

test("write failure notifies once and a later success reports recovery", async () => {
	const store = new FakeStore();
	store.failWrites = true;
	const mock = createMockPi();
	createAnalyticsExtension({ openStore: async () => store })(mock.pi);
	const started = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, started.ctx);
	for (let index = 0; index < 2; index += 1) {
		await emit(
			mock,
			"before_agent_start",
			{ prompt: "run", systemPromptOptions: { skills: [] } },
			started.ctx,
		);
		await emit(mock, "before_provider_request", { payload: {} }, started.ctx);
		await emit(
			mock,
			"message_end",
			{ message: { role: "assistant", stopReason: "stop" } },
			started.ctx,
		);
		await emit(mock, "agent_settled", {}, started.ctx);
	}
	assert.equal(
		started.notifications.filter(({ message }) => message.includes("could not save")).length,
		1,
	);
	store.failWrites = false;
	await emit(
		mock,
		"before_agent_start",
		{ prompt: "run", systemPromptOptions: { skills: [] } },
		started.ctx,
	);
	await emit(mock, "before_provider_request", { payload: {} }, started.ctx);
	await emit(
		mock,
		"message_end",
		{ message: { role: "assistant", stopReason: "stop" } },
		started.ctx,
	);
	await emit(mock, "agent_settled", {}, started.ctx);
	assert.ok(started.notifications.some(({ message }) => message.includes("storage recovered")));
	assert.doesNotMatch(
		started.notifications.map(({ message }) => message).join("\n"),
		/private\/path/,
	);
});

test("graceful shutdown persists an active response as interrupted", async () => {
	const store = new FakeStore();
	const mock = createMockPi();
	createAnalyticsExtension({ openStore: async () => store })(mock.pi);
	const started = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, started.ctx);
	await emit(
		mock,
		"before_agent_start",
		{ prompt: "run", systemPromptOptions: { skills: [] } },
		started.ctx,
	);
	await emit(mock, "before_provider_request", { payload: {} }, started.ctx);
	await emit(mock, "session_shutdown", { reason: "quit" }, started.ctx);
	assert.equal(store.runs[0]?.outcome, "interrupted");
	assert.equal(store.closed, 1);
});

test("newer schemas produce actionable fail-closed guidance", async () => {
	const mock = createMockPi();
	createAnalyticsExtension({
		openStore: async () => {
			throw new NewerSchemaError(3, 1);
		},
	})(mock.pi);
	const started = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, started.ctx);
	const message = started.notifications.find(({ message }) => message.includes("schema"))?.message;
	assert.match(message ?? "", /schema v3 is newer than supported v1/);
	assert.match(message ?? "", /Update pi-analytics/);
});

test("storage failure is content-free and keeps the command available", async () => {
	const mock = createMockPi();
	createAnalyticsExtension({
		openStore: async () => {
			throw new Error("native binding /home/private/user failed");
		},
		platform: () => "linux-arm64-musl",
	})(mock.pi);
	const started = lifecycleContext();
	await emit(mock, "session_start", { reason: "startup" }, started.ctx);
	const message = started.notifications.find(({ message }) =>
		message.includes("linux-arm64-musl"),
	)?.message;
	assert.match(message ?? "", /linux-arm64-musl/);
	assert.doesNotMatch(message ?? "", /private\/user/);
	assert.ok(mock.commands.has("analytics"));
});
