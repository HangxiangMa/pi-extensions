import assert from "node:assert/strict";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { PLAN_MODE_MAX_CHARS } from "../src/completion-tool.js";
import planMode from "../src/plan-mode.js";
import { type ActiveImplementationPlan, restorePlanModeState } from "../src/state.js";

const PLAN = `# Compaction-safe implementation

Marker: PLAN-PERSIST-TEST-42

1. Preserve the exact approved plan.
2. Verify it after compaction.`;
const STATE_ENTRY_TYPE = "plan-mode-state";

function stateEntry(data: Record<string, unknown>) {
	return { type: "custom", customType: STATE_ENTRY_TYPE, data };
}

function latestState(entries: readonly { data: unknown }[]) {
	return entries.at(-1)?.data as
		| {
				latestPlan?: string;
				activeImplementation?: ActiveImplementationPlan;
		  }
		| undefined;
}

test("active implementation state restores independently from Plan mode", () => {
	const activeImplementation: ActiveImplementationPlan = {
		id: "implementation-1",
		plan: PLAN,
		source: "plan_mode_complete",
		startedAt: 42,
	};
	const restored = restorePlanModeState(
		[
			stateEntry({
				enabled: false,
				awaitingAction: false,
				activeImplementation,
				selectedToolNames: ["read"],
			}),
		],
		STATE_ENTRY_TYPE,
	);

	assert.deepEqual(restored.activeImplementation, activeImplementation);
	assert.deepEqual(restored.selectedToolNames, ["read"]);
	assert.equal(restored.latestPlan, undefined);
	assert.equal(restored.awaitingAction, false);
});

test("active implementation restoration fails closed on malformed retained state", () => {
	const valid = {
		id: "implementation-1",
		plan: PLAN,
		source: "plan_mode_complete",
		startedAt: 42,
	};
	const invalidValues = [
		undefined,
		null,
		{},
		{ ...valid, id: "" },
		{ ...valid, plan: " \n" },
		{ ...valid, plan: "x".repeat(PLAN_MODE_MAX_CHARS + 1) },
		{ ...valid, source: "unknown" },
		{ ...valid, startedAt: -1 },
		{ ...valid, startedAt: Number.NaN },
	];

	for (const activeImplementation of invalidValues) {
		const restored = restorePlanModeState(
			[
				stateEntry({
					enabled: false,
					awaitingAction: false,
					activeImplementation,
					selectedToolNames: ["read"],
				}),
			],
			STATE_ENTRY_TYPE,
		);
		assert.equal(restored.activeImplementation, undefined);
		assert.deepEqual(restored.selectedToolNames, ["read"]);
	}
});

test("legacy plans obey the completion size bound before restore or readiness", async () => {
	const oversizedPlan = "x".repeat(PLAN_MODE_MAX_CHARS + 1);
	const restored = restorePlanModeState(
		[
			stateEntry({
				enabled: true,
				awaitingAction: true,
				latestPlan: oversizedPlan,
			}),
		],
		STATE_ENTRY_TYPE,
	);
	assert.equal(restored.latestPlan, undefined);
	assert.equal(restored.awaitingAction, false);

	const mock = createMockPi({ activeTools: ["read"] });
	planMode(mock.pi);
	const context = createMockContext();
	await mock.commands.get("plan")?.handler("", context.ctx);
	await mock.events.get("agent_end")?.[0]?.(
		{
			messages: [
				{
					role: "assistant",
					content: `<proposed_plan>\n${oversizedPlan}\n</proposed_plan>`,
				},
			],
		},
		context.ctx,
	);
	assert.equal(context.statuses.get("plan-mode"), "plan active");
	assert.match(context.notifications.at(-1)?.message ?? "", /must not exceed 50000/i);
});

test("ready Plan mode wins over malformed mixed ready and implementation state", () => {
	const restored = restorePlanModeState(
		[
			stateEntry({
				enabled: true,
				awaitingAction: true,
				latestPlan: "# Ready",
				latestPlanSource: "plan_mode_complete",
				activeImplementation: {
					id: "implementation-1",
					plan: PLAN,
					source: "plan_mode_complete",
					startedAt: 42,
				},
			}),
		],
		STATE_ENTRY_TYPE,
	);

	assert.equal(restored.latestPlan, "# Ready");
	assert.equal(restored.awaitingAction, true);
	assert.equal(restored.activeImplementation, undefined);
});

test("the latest branch-local state can clear an older active implementation", () => {
	const restored = restorePlanModeState(
		[
			stateEntry({
				enabled: false,
				awaitingAction: false,
				activeImplementation: {
					id: "implementation-1",
					plan: PLAN,
					source: "plan_mode_complete",
					startedAt: 42,
				},
			}),
			{ type: "message", message: { role: "assistant", content: "work" } },
			stateEntry({ enabled: false, awaitingAction: false }),
		],
		STATE_ENTRY_TYPE,
	);

	assert.equal(restored.activeImplementation, undefined);
	assert.equal(restored.enabled, false);
});

test("issue 471: an active implementation plan is restored after compaction removes its handoff", async () => {
	const mock = createMockPi({ activeTools: ["read", "edit"] });
	planMode(mock.pi);
	const context = createMockContext();

	await mock.commands.get("plan")?.handler("", context.ctx);
	const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
		?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
	assert.ok(complete);
	await complete("complete", { plan: PLAN }, undefined, undefined, context.ctx);
	await mock.commands.get("plan")?.handler("implement", context.ctx);

	const contextHook = mock.events.get("context")?.[0];
	assert.ok(contextHook);
	const compactedMessages = [
		{
			role: "compactionSummary",
			summary: "The accepted implementation plan was summarized without its exact steps.",
		},
		{ role: "assistant", content: [{ type: "text", text: "Continuing after compaction." }] },
	];
	const transformed = (await contextHook({ messages: compactedMessages }, context.ctx)) as {
		messages: Array<Record<string, unknown>>;
	};

	assert.equal(transformed.messages.length, 3);
	assert.deepEqual(transformed.messages[0], compactedMessages[0]);
	assert.deepEqual(transformed.messages[2], compactedMessages[1]);
	assert.equal(transformed.messages[1]?.role, "custom");
	assert.equal(transformed.messages[1]?.customType, "plan-mode-implementation-context");
	assert.match(String(transformed.messages[1]?.content), /ACTIVE IMPLEMENTATION PLAN/);
	assert.ok(String(transformed.messages[1]?.content).endsWith(PLAN));

	const persisted = mock.entries.at(-1)?.data as {
		enabled?: boolean;
		activeImplementation?: { plan?: string };
	};
	assert.equal(persisted.enabled, false);
	assert.equal(persisted.activeImplementation?.plan, PLAN);
});

test("implementation transition persists active state before a busy follow-up and rejects repeats", async () => {
	const mock = createMockPi({ activeTools: ["read", "edit"] });
	planMode(mock.pi);
	const context = createMockContext({ isIdle: () => false });
	await mock.commands.get("plan")?.handler("", context.ctx);
	const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
		?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
	assert.ok(complete);
	await complete("complete", { plan: PLAN }, undefined, undefined, context.ctx);

	await mock.commands.get("plan")?.handler("implement", context.ctx);
	assert.equal(context.statuses.get("plan-mode"), "plan implementing");
	assert.match(
		JSON.stringify(context.widgets.get("plan-mode-plan")),
		/implementation plan active/i,
	);
	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "edit"]);
	assert.deepEqual(mock.sentUserMessages.at(-1)?.options, { deliverAs: "followUp" });
	const activeState = latestState(mock.entries);
	assert.equal(activeState?.activeImplementation?.plan, PLAN);
	assert.equal(activeState.activeImplementation?.source, "plan_mode_complete");
	assert.match(activeState.activeImplementation?.id ?? "", /^[0-9a-f-]{36}$/u);
	assert.ok((activeState.activeImplementation?.startedAt ?? -1) >= 0);

	const sendsBeforeRepeat = mock.sentUserMessages.length;
	await mock.commands.get("plan")?.handler("implement", context.ctx);
	assert.equal(mock.sentUserMessages.length, sendsBeforeRepeat);
	assert.equal(latestState(mock.entries)?.activeImplementation?.plan, PLAN);
});

test("failed implementation delivery restores ready state without retained implementation", async () => {
	const mock = createMockPi({ activeTools: ["read", "custom"] });
	planMode(mock.pi);
	const context = createMockContext();
	await mock.commands.get("plan")?.handler("", context.ctx);
	const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
		?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
	assert.ok(complete);
	await complete("complete", { plan: PLAN }, undefined, undefined, context.ctx);
	mock.rawPi.sendUserMessage = () => {
		throw new Error("Extension context is no longer active");
	};

	await mock.commands.get("plan")?.handler("implement", context.ctx);
	assert.equal(context.statuses.get("plan-mode"), "plan ready");
	assert.deepEqual(mock.rawPi.getActiveTools(), [
		"read",
		"plan_mode_question",
		"plan_mode_complete",
	]);
	const restored = latestState(mock.entries);
	assert.equal(restored?.latestPlan, PLAN);
	assert.equal(restored?.activeImplementation, undefined);
	assert.match(context.notifications.at(-1)?.message ?? "", /no longer active/);
});

test("active context avoids exact handoff duplication and replaces stale injected blocks", async () => {
	const mock = createMockPi({ activeTools: ["read", "edit"] });
	planMode(mock.pi);
	const context = createMockContext();
	await mock.commands.get("plan")?.handler("", context.ctx);
	const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
		?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
	assert.ok(complete);
	await complete("complete", { plan: PLAN }, undefined, undefined, context.ctx);
	await mock.commands.get("plan")?.handler("implement", context.ctx);
	const contextHook = mock.events.get("context")?.[0];
	assert.ok(contextHook);

	const handoff = { role: "user", content: mock.sentUserMessages.at(-1)?.text };
	const withHandoff = (await contextHook(
		{ messages: [{ role: "user", content: "plan it" }, handoff] },
		context.ctx,
	)) as { messages: Array<Record<string, unknown>> };
	assert.equal(
		withHandoff.messages.filter(
			(message) => message.customType === "plan-mode-implementation-context",
		).length,
		0,
	);
	assert.deepEqual(withHandoff.messages, [{ role: "user", content: "plan it" }, handoff]);

	const toolCall = {
		role: "assistant",
		content: [{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "a" } }],
	};
	const toolResult = {
		role: "toolResult",
		toolCallId: "read-1",
		toolName: "read",
		content: [{ type: "text", text: "ok" }],
	};
	const compacted = [
		{ role: "compactionSummary", summary: "lossy" },
		{
			role: "custom",
			customType: "plan-mode-implementation-context",
			content: "stale",
		},
		toolCall,
		toolResult,
	];
	const once = (await contextHook({ messages: compacted }, context.ctx)) as {
		messages: Array<Record<string, unknown>>;
	};
	const twice = (await contextHook({ messages: once.messages }, context.ctx)) as {
		messages: Array<Record<string, unknown>>;
	};
	for (const transformed of [once.messages, twice.messages]) {
		assert.deepEqual(transformed[0], compacted[0]);
		assert.equal(transformed[1]?.customType, "plan-mode-implementation-context");
		assert.match(String(transformed[1]?.content), /PLAN-PERSIST-TEST-42/);
		assert.deepEqual(transformed.slice(2), [toolCall, toolResult]);
		assert.equal(
			transformed.filter((message) => message.customType === "plan-mode-implementation-context")
				.length,
			1,
		);
	}
});

test("active plans can be shown and cleared through existing direct routes", async () => {
	const mock = createMockPi({ activeTools: ["read", "edit"] });
	planMode(mock.pi);
	const context = createMockContext();
	await mock.commands.get("plan")?.handler("", context.ctx);
	const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
		?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
	assert.ok(complete);
	await complete("complete", { plan: PLAN }, undefined, undefined, context.ctx);
	await mock.commands.get("plan")?.handler("implement", context.ctx);

	await mock.commands.get("plan")?.handler("show", context.ctx);
	assert.match(
		String((mock.sentMessages.at(-1)?.message as { content?: string })?.content),
		/Active Implementation Plan.*PLAN-PERSIST-TEST-42/is,
	);

	await mock.commands.get("plan")?.handler("exit", context.ctx);
	assert.equal(context.statuses.get("plan-mode"), undefined);
	assert.equal(context.widgets.get("plan-mode-plan"), undefined);
	assert.equal(latestState(mock.entries)?.activeImplementation, undefined);
	const contextHook = mock.events.get("context")?.[0];
	assert.ok(contextHook);
	const transformed = (await contextHook(
		{ messages: [{ role: "compactionSummary", summary: "lossy" }] },
		context.ctx,
	)) as { messages: Array<Record<string, unknown>> };
	assert.equal(
		transformed.messages.some(
			(message) => message.customType === "plan-mode-implementation-context",
		),
		false,
	);
});

test("the active-plan menu shows without superseding and cancellation is read-only", async () => {
	for (const selection of ["Show active implementation plan", undefined]) {
		const mock = createMockPi({ activeTools: ["read", "edit"] });
		planMode(mock.pi);
		const context = createMockContext({
			hasUI: true,
			select: async (_title: string, options: string[]) =>
				selection ? options.find((option) => option.startsWith(selection)) : undefined,
		});
		await mock.commands.get("plan")?.handler("", context.ctx);
		const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
			?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
		assert.ok(complete);
		await complete("complete", { plan: PLAN }, undefined, undefined, context.ctx);
		await mock.commands.get("plan")?.handler("implement", context.ctx);
		const entriesBeforeMenu = mock.entries.length;

		await mock.commands.get("plan")?.handler("", context.ctx);
		assert.equal(context.statuses.get("plan-mode"), "plan implementing");
		assert.equal(latestState(mock.entries)?.activeImplementation?.plan, PLAN);
		if (selection) {
			assert.match(
				String((mock.sentMessages.at(-1)?.message as { content?: string })?.content),
				/PLAN-PERSIST-TEST-42/,
			);
		} else {
			assert.equal(mock.entries.length, entriesBeforeMenu);
		}
	}
});

test("active-plan menu actions work in TUI and RPC without hidden route changes", async () => {
	for (const scenario of [
		{ mode: "tui", selection: "Start a new plan", expectedStatus: "plan active" },
		{ mode: "rpc", selection: "Clear active implementation plan", expectedStatus: undefined },
	] as const) {
		const mock = createMockPi({ activeTools: ["read", "edit"] });
		planMode(mock.pi);
		const context = createMockContext({
			mode: scenario.mode,
			select: async (_title: string, options: string[]) =>
				options.find((option) => option.startsWith(scenario.selection)),
		});
		await mock.commands.get("plan")?.handler("", context.ctx);
		const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
			?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
		assert.ok(complete);
		await complete("complete", { plan: PLAN }, undefined, undefined, context.ctx);
		await mock.commands.get("plan")?.handler("implement", context.ctx);

		await mock.commands.get("plan")?.handler("", context.ctx);
		assert.equal(context.statuses.get("plan-mode"), scenario.expectedStatus);
		assert.equal(latestState(mock.entries)?.activeImplementation, undefined);
	}
});

test("starting a new Plan-mode workflow supersedes the active implementation", async () => {
	const mock = createMockPi({ activeTools: ["read", "edit"] });
	planMode(mock.pi);
	const context = createMockContext();
	await mock.commands.get("plan")?.handler("", context.ctx);
	const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
		?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
	assert.ok(complete);
	await complete("complete", { plan: PLAN }, undefined, undefined, context.ctx);
	await mock.commands.get("plan")?.handler("implement", context.ctx);
	const oldHandoff = { role: "user", content: mock.sentUserMessages.at(-1)?.text };

	await mock.commands.get("plan")?.handler("design a replacement", context.ctx);
	assert.equal(context.statuses.get("plan-mode"), "plan active");
	assert.equal(latestState(mock.entries)?.activeImplementation, undefined);
	const contextHook = mock.events.get("context")?.[0];
	assert.ok(contextHook);
	const transformed = (await contextHook(
		{ messages: [oldHandoff, { role: "user", content: "design a replacement" }] },
		context.ctx,
	)) as { messages: Array<Record<string, unknown>> };
	assert.deepEqual(transformed.messages, [{ role: "user", content: "design a replacement" }]);
});

test("the --plan flag supersedes a resumed active implementation", async () => {
	const activeImplementation: ActiveImplementationPlan = {
		id: "implementation-1",
		plan: PLAN,
		source: "plan_mode_complete",
		startedAt: 42,
	};
	const resumedEntry = stateEntry({
		enabled: false,
		awaitingAction: false,
		activeImplementation,
	});
	const mock = createMockPi({ activeTools: ["read", "edit"] });
	planMode(mock.pi);
	const planFlag = mock.flags.get("plan");
	assert.ok(planFlag);
	planFlag.value = true;
	const context = createMockContext({
		sessionManager: {
			getBranch: () => [resumedEntry],
			getEntries: () => [resumedEntry],
		},
	});

	await mock.events.get("session_start")?.[0]?.({}, context.ctx);
	assert.equal(context.statuses.get("plan-mode"), "plan active");
	await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);
	assert.equal(latestState(mock.entries)?.activeImplementation, undefined);
});

test("resume and shutdown retain branch-local implementation state while clearing session UI", async () => {
	const activeImplementation: ActiveImplementationPlan = {
		id: "implementation-1",
		plan: PLAN,
		source: "plan_mode_complete",
		startedAt: 42,
	};
	const resumedEntry = stateEntry({
		enabled: false,
		awaitingAction: false,
		activeImplementation,
	});
	const mock = createMockPi({ activeTools: ["read", "edit"] });
	planMode(mock.pi);
	const context = createMockContext({
		sessionManager: {
			getBranch: () => [resumedEntry],
			getEntries: () => [resumedEntry],
		},
	});

	await mock.events.get("session_start")?.[0]?.({}, context.ctx);
	assert.equal(context.statuses.get("plan-mode"), "plan implementing");
	const contextHook = mock.events.get("context")?.[0];
	assert.ok(contextHook);
	const transformed = (await contextHook(
		{ messages: [{ role: "branchSummary", summary: "continued branch" }] },
		context.ctx,
	)) as { messages: Array<Record<string, unknown>> };
	assert.equal(transformed.messages[1]?.customType, "plan-mode-implementation-context");
	assert.match(String(transformed.messages[1]?.content), /PLAN-PERSIST-TEST-42/);

	await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);
	assert.equal(context.statuses.get("plan-mode"), undefined);
	assert.equal(context.widgets.get("plan-mode-plan"), undefined);
	assert.equal(latestState(mock.entries)?.activeImplementation?.plan, PLAN);
});
