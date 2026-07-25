import assert from "node:assert/strict";
import test from "node:test";
import { createMockContext } from "../../../test/support.js";
import {
	buildGoalMenuState,
	GOAL_MENU_ACTIONS,
	safeGoalMenuText,
	showGoalManager,
} from "../src/menu.js";
import type { ActiveGoal } from "../src/persistence.js";
import { createGoal, transitionGoal } from "../src/runtime.js";
import { DEFAULT_GOAL_SETTINGS } from "../src/settings.js";

function runtime(goal?: ActiveGoal) {
	return {
		activeGoal: goal,
		queuedGoals: [] as ActiveGoal[],
		pendingQueueAction: undefined,
		queueFrozen: false,
		settings: structuredClone(DEFAULT_GOAL_SETTINGS),
	};
}

function commands() {
	const calls: Array<{ name: string; args: unknown[] }> = [];
	const record =
		(name: string) =>
		(...args: unknown[]) =>
			calls.push({ name, args });
	return {
		calls,
		controller: {
			startGoal: record("startGoal"),
			pauseGoal: record("pauseGoal"),
			resumeGoal: record("resumeGoal"),
			clearGoal: record("clearGoal"),
			editGoal: record("editGoal"),
			showGoal: record("showGoal"),
			addGoal: record("addGoal"),
			prioritizeGoal: record("prioritizeGoal"),
			dropLastGoal: record("dropLastGoal"),
			skipGoal: record("skipGoal"),
		},
	};
}

test("buildGoalMenuState prioritizes actions for empty, active, stopped, budget, and frozen states", () => {
	assert.deepEqual(buildGoalMenuState(runtime()).actions.slice(0, 2), [
		GOAL_MENU_ACTIONS.start,
		GOAL_MENU_ACTIONS.startBudget,
	]);

	const active = createGoal("ship the release", 100, 0);
	active.tokensUsed = 20;
	assert.equal(buildGoalMenuState(runtime(active)).actions[0], GOAL_MENU_ACTIONS.pause);
	assert.match(buildGoalMenuState(runtime(active)).title, /Active.*20\/100/is);

	for (const status of ["paused", "blocked", "usage_limited"] as const) {
		const stopped = runtime(transitionGoal(active, status));
		assert.equal(buildGoalMenuState(stopped).actions[0], GOAL_MENU_ACTIONS.resume);
	}

	const limited = runtime(transitionGoal({ ...active, tokensUsed: 100 }, "budget_limited"));
	assert.equal(buildGoalMenuState(limited).actions[0], GOAL_MENU_ACTIONS.increaseBudget);

	const frozen = runtime(active);
	frozen.queueFrozen = true;
	frozen.queuedGoals.push(createGoal("later", undefined, 0));
	assert.deepEqual(buildGoalMenuState(frozen).actions, [
		GOAL_MENU_ACTIONS.status,
		GOAL_MENU_ACTIONS.settings,
		GOAL_MENU_ACTIONS.help,
		GOAL_MENU_ACTIONS.clear,
		GOAL_MENU_ACTIONS.close,
	]);
});

test("safeGoalMenuText strips terminal controls and bounds untrusted previews", () => {
	const safe = safeGoalMenuText(`hello\u001b[31m\u009bworld\n${"界".repeat(200)}`);
	assert.equal(
		[...safe].some((character) => {
			const codePoint = character.codePointAt(0) ?? 0;
			return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
		}),
		false,
	);
	assert.match(safe, /…$/u);
	assert.ok([...safe].length <= 121);
});

test("showGoalManager preserves non-TUI status behavior", async () => {
	const tracked = commands();
	const context = createMockContext({ mode: "print", hasUI: false });
	await showGoalManager(runtime(), tracked.controller as never, context.ctx, async () => undefined);
	assert.deepEqual(
		tracked.calls.map((call) => call.name),
		["showGoal"],
	);
});

test("menu cancellation has no side effects and clear requires an exact preview", async () => {
	const goal = createGoal("clear this objective", undefined, 0);
	const state = runtime(goal);
	state.queuedGoals.push(createGoal("queued objective", undefined, 0));
	const tracked = commands();
	let selects = 0;
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => (++selects === 1 ? GOAL_MENU_ACTIONS.clear : undefined),
		confirm: async (title: string, message: string) => {
			assert.equal(title, "Clear goal queue?");
			assert.match(message, /clear this objective/);
			assert.match(message, /queued objective/);
			return false;
		},
	});

	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);
	assert.equal(tracked.calls.length, 0);
});

test("queue menu previews prioritize, skip, and drop-last before delegation", async () => {
	for (const scenario of [
		{
			action: "Prioritize goal…",
			method: "prioritizeGoal",
			editor: "urgent objective",
			preview: /urgent objective.*current objective/is,
		},
		{
			action: "Skip current goal…",
			method: "skipGoal",
			preview: /current objective.*queued objective/is,
		},
		{
			action: "Drop last goal…",
			method: "dropLastGoal",
			preview: /queued objective/is,
		},
	] as const) {
		const state = runtime(createGoal("current objective", undefined, 0));
		state.settings.experimental.goals = true;
		state.queuedGoals.push(createGoal("queued objective", undefined, 0));
		const tracked = commands();
		const selections = [GOAL_MENU_ACTIONS.queue, scenario.action];
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			select: async () => selections.shift(),
			editor: async () => scenario.editor,
			confirm: async (_title: string, message: string) => {
				assert.match(message, scenario.preview);
				return true;
			},
		});

		await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);
		assert.equal(tracked.calls[0]?.name, scenario.method);
	}
});

test("menu start and edit delegate raw objective data only after explicit input", async () => {
	const empty = runtime();
	const started = commands();
	const startContext = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => GOAL_MENU_ACTIONS.start,
		editor: async () => "  implement menu  ",
	});
	await showGoalManager(
		empty,
		started.controller as never,
		startContext.ctx,
		async () => undefined,
	);
	assert.equal(started.calls[0]?.name, "startGoal");
	assert.deepEqual(started.calls[0]?.args.slice(0, 2), ["implement menu", undefined]);

	const active = runtime(createGoal("old objective", undefined, 0));
	const edited = commands();
	const editContext = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => GOAL_MENU_ACTIONS.edit,
		editor: async () => "new objective",
		confirm: async (title: string, message: string) => {
			assert.equal(title, "Apply goal edit?");
			assert.match(message, /old objective/);
			assert.match(message, /new objective/);
			return true;
		},
	});
	await showGoalManager(active, edited.controller as never, editContext.ctx, async () => undefined);
	assert.equal(edited.calls[0]?.name, "editGoal");
	assert.deepEqual(edited.calls[0]?.args.slice(0, 2), ["new objective", undefined]);
});
