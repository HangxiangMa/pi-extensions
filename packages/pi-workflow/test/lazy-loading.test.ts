import assert from "node:assert/strict";
import { test } from "vitest";
import { builtinTool, createMockContext, createMockPi } from "../../../test/support.js";
import workflow from "../src/workflow.js";

const BASE_TOOLS = ["read", "bash", "edit", "write"];
const GOAL_TOOLS = ["goal_complete", "goal_blocked", "goal_wait"];

async function emitAll(
	mock: ReturnType<typeof createMockPi>,
	name: string,
	event: unknown,
	ctx: unknown,
) {
	for (const handler of mock.events.get(name) ?? []) await handler(event, ctx);
}

function createWorkflow() {
	return createMockPi({
		activeTools: [...BASE_TOOLS, ...GOAL_TOOLS],
		allTools: [...BASE_TOOLS, ...GOAL_TOOLS].map(builtinTool),
	});
}

test("idle startup keeps Workflow manager and fresh handoff modules unloaded", async () => {
	const mock = createWorkflow();
	let menuLoads = 0;
	let handoffLoads = 0;
	workflow(mock.pi, {
		readSettings: () => ({ kind: "missing" }),
		loadWorkflowMenu: async () => {
			menuLoads += 1;
			return { showWorkflowMenu: async () => undefined as never };
		},
		loadFreshHandoff: async () => {
			handoffLoads += 1;
			return { startFreshWorkflowImplementation: async () => ({ kind: "started" }) };
		},
	});

	assert.deepEqual([...mock.commands.keys()], ["goal", "plan", "workflow"]);
	assert.deepEqual(
		mock.tools.map((tool) => tool.name),
		["goal_complete", "goal_blocked", "goal_wait", "plan_mode_question", "plan_mode_complete"],
	);
	const context = createMockContext({ mode: "tui", hasUI: true });
	await emitAll(mock, "session_start", { reason: "startup" }, context.ctx);

	assert.equal(menuLoads, 0);
	assert.equal(handoffLoads, 0);
});

test("Workflow manager caches a successful load and retries a rejected load", async () => {
	const mock = createWorkflow();
	let loads = 0;
	let shows = 0;
	workflow(mock.pi, {
		readSettings: () => ({ kind: "missing" }),
		loadWorkflowMenu: async () => {
			loads += 1;
			if (loads === 1) throw new Error("temporary Workflow UI load failure");
			return {
				showWorkflowMenu: async () => {
					shows += 1;
					return undefined as never;
				},
			};
		},
	});
	const context = createMockContext({ mode: "tui", hasUI: true });
	await emitAll(mock, "session_start", { reason: "startup" }, context.ctx);
	const command = mock.commands.get("workflow");
	assert.ok(command);

	await assert.rejects(async () => command.handler("", context.ctx), /temporary Workflow UI/u);
	await command.handler("", context.ctx);
	await command.handler("", context.ctx);

	assert.equal(loads, 2);
	assert.equal(shows, 2);
});

test("session replacement while the Workflow manager loads prevents stale UI", async () => {
	const mock = createWorkflow();
	let releaseLoad!: () => void;
	let loadingStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		loadingStarted = resolve;
	});
	const loadGate = new Promise<void>((resolve) => {
		releaseLoad = resolve;
	});
	let shows = 0;
	workflow(mock.pi, {
		readSettings: () => ({ kind: "missing" }),
		loadWorkflowMenu: async () => {
			loadingStarted();
			await loadGate;
			return {
				showWorkflowMenu: async () => {
					shows += 1;
					return undefined as never;
				},
			};
		},
	});
	const context = createMockContext({ mode: "tui", hasUI: true });
	await emitAll(mock, "session_start", { reason: "startup" }, context.ctx);

	const pending = mock.commands.get("workflow")?.handler("", context.ctx);
	await started;
	await emitAll(mock, "session_shutdown", { reason: "new" }, context.ctx);
	releaseLoad();
	await pending;

	assert.equal(shows, 0);
});

test("session replacement while the fresh handoff loads prevents session replacement", async () => {
	const mock = createWorkflow();
	let releaseLoad!: () => void;
	let loadingStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		loadingStarted = resolve;
	});
	const loadGate = new Promise<void>((resolve) => {
		releaseLoad = resolve;
	});
	let handoffs = 0;
	workflow(mock.pi, {
		readSettings: () => ({ kind: "missing" }),
		loadFreshHandoff: async () => {
			loadingStarted();
			await loadGate;
			return {
				startFreshWorkflowImplementation: async () => {
					handoffs += 1;
					return { kind: "started" };
				},
			};
		},
	});
	const context = createMockContext({
		mode: "rpc",
		hasUI: true,
		select: async (_title: string, options: string[]) =>
			options.includes("Start fresh with Goal") ? "Start fresh with Goal" : undefined,
		newSession: async () => ({ cancelled: false }),
	});
	await emitAll(mock, "session_start", { reason: "startup" }, context.ctx);
	await mock.commands.get("plan")?.handler("start", context.ctx);
	const complete = mock.tools.find((tool) => tool.name === "plan_mode_complete");
	assert.ok(complete);
	await (complete.execute as (...args: unknown[]) => Promise<unknown>)(
		"plan-call",
		{ plan: "# Approved lazy handoff" },
		undefined,
		undefined,
		context.ctx,
	);

	const pending = mock.commands.get("plan")?.handler("", context.ctx);
	await started;
	await emitAll(mock, "session_shutdown", { reason: "new" }, context.ctx);
	releaseLoad();
	await pending;

	assert.equal(handoffs, 0);
});
