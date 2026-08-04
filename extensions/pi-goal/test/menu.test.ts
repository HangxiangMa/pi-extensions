import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { createMockContext } from "../../../test/support.js";
import {
	buildGoalMenuState,
	GOAL_MENU_ACTIONS,
	safeGoalMenuText,
	showGoalManager,
} from "../src/menu.js";
import type { ActiveGoal, PendingQueueAction } from "../src/persistence.js";
import { createGoal, transitionGoal } from "../src/runtime.js";
import { DEFAULT_GOAL_SETTINGS } from "../src/settings.js";

function runtime(goal?: ActiveGoal) {
	return {
		activeGoal: goal,
		queuedGoals: [] as ActiveGoal[],
		pendingQueueAction: undefined as PendingQueueAction | undefined,
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
	const empty = runtime();
	empty.settings.experimental.goals = true;
	assert.match(buildGoalMenuState(empty).title, /automatic work pauses after 25 responses/i);
	assert.deepEqual(buildGoalMenuState(empty).actions.slice(0, 2), [
		GOAL_MENU_ACTIONS.start,
		GOAL_MENU_ACTIONS.startBudget,
	]);
	assert.equal(buildGoalMenuState(empty).actions.includes(GOAL_MENU_ACTIONS.queue), false);

	const active = createGoal("ship the release", 100, 0);
	active.tokensUsed = 20;
	active.automaticModelTurns = 12;
	const capped = runtime(active);
	assert.equal(buildGoalMenuState(capped).actions[0], GOAL_MENU_ACTIONS.pause);
	assert.match(buildGoalMenuState(capped).title, /Active.*Usage: 20\/100/is);
	assert.match(
		buildGoalMenuState(capped).title,
		/Automatic work: 12 of 25 responses.*13 remaining/is,
	);

	const unlimited = runtime(active);
	unlimited.settings.continuationLimits.automaticTurns = null;
	assert.match(buildGoalMenuState(unlimited).title, /Automatic work: 12 responses.*Unlimited/is);

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

test("hard-cap pause names the cause and prioritizes review over immediate resume", () => {
	const goal = transitionGoal(createGoal("preserve this objective", undefined, 0), "paused");
	goal.automaticModelTurns = 25;
	goal.tokensUsed = 12_345;
	goal.timeUsedSeconds = 90;
	goal.safetyPauseCause = "continuation_limit";
	const state = buildGoalMenuState(runtime(goal));

	assert.match(state.title, /Paused — automatic-work limit reached/i);
	assert.match(state.title, /Automatic work: 25 of 25 responses/i);
	assert.match(state.title, /Progress is saved/i);
	assert.equal(state.actions[0], "Review and continue…");
	assert.equal(state.actions.includes(GOAL_MENU_ACTIONS.resume), false);
});

test("hard-cap recovery previews the next epoch and Back has no side effects", async () => {
	const goal = transitionGoal(createGoal("preserve this objective", undefined, 0), "paused");
	goal.automaticModelTurns = 25;
	goal.tokensUsed = 12_345;
	goal.timeUsedSeconds = 90;
	goal.safetyPauseCause = "continuation_limit";
	const state = runtime(goal);
	state.queuedGoals.push(createGoal("queued objective", undefined, 0));
	const tracked = commands();
	const selections = ["Review and continue…", "Back", GOAL_MENU_ACTIONS.close];
	let recoveryRender = "";
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async (title: string) => {
			if (/Automatic work paused/i.test(title)) recoveryRender = title;
			return selections.shift();
		},
	});

	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);

	assert.match(recoveryRender, /25-of-25 safety limit/i);
	assert.match(recoveryRender, /12,345 cumulative tokens/i);
	assert.match(recoveryRender, /1m active time/i);
	assert.match(recoveryRender, /objective, usage, and 1 queued goal is preserved/i);
	assert.match(recoveryRender, /resets the counter to 0.*up to 25 more/is);
	assert.equal(tracked.calls.length, 0);
	assert.equal(state.activeGoal, goal);
});

test("hard-cap recovery applies Continue only to the previewed goal", async () => {
	for (const replaceBeforeContinue of [false, true]) {
		const goal = transitionGoal(createGoal("previewed objective", undefined, 0), "paused");
		goal.automaticModelTurns = 25;
		goal.safetyPauseCause = "continuation_limit";
		const state = runtime(goal);
		const tracked = commands();
		const selections = ["Review and continue…", "Continue — up to 25 more responses"];
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			select: async () => {
				const selection = selections.shift();
				if (selection?.startsWith("Continue") && replaceBeforeContinue) {
					state.activeGoal = transitionGoal(
						createGoal("replacement objective", undefined, 0),
						"paused",
					);
				}
				return selection;
			},
		});

		await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);

		assert.equal(
			tracked.calls.filter((call) => call.name === "resumeGoal").length,
			replaceBeforeContinue ? 0 : 1,
		);
		if (replaceBeforeContinue) {
			assert.match(context.notifications.at(-1)?.message ?? "", /active goal changed.*reopen/i);
		}
	}
});

test("hard-cap recovery can open the automatic-work setting and remain paused", async () => {
	const goal = transitionGoal(createGoal("paused objective", undefined, 0), "paused");
	goal.automaticModelTurns = 25;
	goal.safetyPauseCause = "continuation_limit";
	const state = runtime(goal);
	const tracked = commands();
	const selections = [
		"Review and continue…",
		"Change automatic-work limit…",
		"Back",
		GOAL_MENU_ACTIONS.close,
	];
	const targets: Array<string | undefined> = [];
	const recoveryFrames: string[] = [];
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async (title: string) => {
			if (/Automatic work paused/i.test(title)) recoveryFrames.push(title);
			return selections.shift();
		},
	});

	await showGoalManager(
		state,
		tracked.controller as never,
		context.ctx,
		async (_ctx, target?: string) => {
			targets.push(target);
			state.settings.continuationLimits.automaticTurns = null;
		},
	);

	assert.deepEqual(targets, ["automatic"]);
	assert.match(recoveryFrames.at(-1) ?? "", /Current limit: Unlimited/i);
	assert.doesNotMatch(recoveryFrames.at(-1) ?? "", /of-Unlimited safety limit/i);
	assert.equal(state.activeGoal?.status, "paused");
	assert.equal(tracked.calls.length, 0);
});

test("hard-cap recovery remains readable and keyboard-operable at supported widths", async () => {
	const goal = transitionGoal(
		createGoal(`long objective ${"with preserved detail ".repeat(12)}`, undefined, 0),
		"paused",
	);
	goal.automaticModelTurns = 25;
	goal.tokensUsed = 12_345;
	goal.safetyPauseCause = "continuation_limit";
	const state = runtime(goal);
	const tracked = commands();
	const tui = createTuiHarness({ width: 80, rows: 40 });
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		custom: tui.custom,
	});

	try {
		const running = showGoalManager(
			state,
			tracked.controller as never,
			context.ctx,
			async () => undefined,
		);
		await tui.waitForOpen();
		for (const width of [40, 80, 120]) {
			const lines = tui.render(width);
			assert.ok(lines.every((line) => visibleWidth(line) <= width));
			assert.match(lines.join(" ").replace(/\s+/gu, " "), /Review and continue…/i);
		}

		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await tui.waitForOpen();
		for (const width of [40, 80, 120]) {
			const lines = tui.render(width);
			const frame = lines.join(" ").replace(/\s+/gu, " ");
			assert.ok(lines.every((line) => visibleWidth(line) <= width));
			assert.match(frame, /Automatic work paused/i);
			assert.match(frame, /25-of-25 safety limit/i);
			assert.match(frame, /Continue — up to 25 more responses/i);
			assert.match(frame, /Back/i);
		}

		tui.press("tui.select.cancel");
		await tui.waitForOpen();
		assert.match(tui.render().join(" "), /Review and continue…/i);
		tui.press("ctrl+c");
		await running;
		assert.equal(tracked.calls.length, 0);
	} finally {
		tui.dispose();
	}
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

test("clear confirmation does not erase a queue that changed while open", async () => {
	const state = runtime(createGoal("previewed objective", undefined, 0));
	const tracked = commands();
	const selections = [GOAL_MENU_ACTIONS.clear, undefined];
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => selections.shift(),
		confirm: async () => {
			state.activeGoal = createGoal("replacement objective", undefined, 0);
			return true;
		},
	});

	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);

	assert.equal(
		tracked.calls.some((call) => call.name === "clearGoal"),
		false,
	);
	assert.match(context.notifications.at(-1)?.message ?? "", /goal queue changed.*reopen/i);
});

test("clear preview includes a pending priority objective", async () => {
	const state = runtime(createGoal("current objective", undefined, 0));
	state.queuedGoals.push(createGoal("queued objective", undefined, 0));
	state.pendingQueueAction = { kind: "prioritize", objective: "pending urgent objective" };
	const tracked = commands();
	const selections = [GOAL_MENU_ACTIONS.clear, undefined];
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => selections.shift(),
		confirm: async (title: string, message: string) => {
			assert.equal(title, "Clear goal queue?");
			assert.match(message, /all 3 goals/i);
			assert.match(message, /current objective/);
			assert.match(message, /queued objective/);
			assert.match(message, /pending urgent objective/);
			return false;
		},
	});

	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);
	assert.equal(tracked.calls.length, 0);
});

test("menu preserves exact token values in status and budget input", async () => {
	const goal = transitionGoal(createGoal("precise budget", 10_500, 0), "budget_limited");
	goal.tokensUsed = 10_499;
	const state = runtime(goal);
	assert.match(buildGoalMenuState(state).title, /10499\/10500/);
	let placeholder = "";
	const tracked = commands();
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => GOAL_MENU_ACTIONS.increaseBudget,
		input: async (_title: string, value: string) => {
			placeholder = value;
			return undefined;
		},
	});
	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);
	assert.equal(placeholder, "10500");
	assert.equal(tracked.calls.length, 0);
});

test("Queue Back returns to the refreshed main menu", async () => {
	const state = runtime(createGoal("current objective", undefined, 0));
	state.settings.experimental.goals = true;
	const tracked = commands();
	const selections = [GOAL_MENU_ACTIONS.queue, "Back", GOAL_MENU_ACTIONS.close];
	let selectionCount = 0;
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => {
			selectionCount++;
			return selections.shift();
		},
	});

	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);
	assert.equal(selectionCount, 3);
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

test("Skip preview reflects a stopped next goal without promising activation", async () => {
	const state = runtime(createGoal("current objective", undefined, 0));
	state.settings.experimental.goals = true;
	state.queuedGoals.push(transitionGoal(createGoal("blocked objective", undefined, 0), "blocked"));
	const tracked = commands();
	const selections = [GOAL_MENU_ACTIONS.queue, "Skip current goal…"];
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => selections.shift(),
		confirm: async (_title: string, message: string) => {
			assert.match(message, /Next goal remains blocked/i);
			assert.doesNotMatch(message, /Start next goal/i);
			return false;
		},
	});

	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);
	assert.equal(tracked.calls.length, 0);
});

test("queue confirmations do not mutate a changed active head or queue selection", async () => {
	for (const scenario of [
		{
			action: "Prioritize goal…",
			expectedMethod: "prioritizeGoal",
			editor: "urgent objective",
			mutate(state: ReturnType<typeof runtime>) {
				state.activeGoal = createGoal("replacement head", undefined, 0);
			},
		},
		{
			action: "Skip current goal…",
			expectedMethod: "skipGoal",
			mutate(state: ReturnType<typeof runtime>) {
				state.activeGoal = createGoal("replacement head", undefined, 0);
			},
		},
		{
			action: "Skip current goal…",
			expectedMethod: "skipGoal",
			mutate(state: ReturnType<typeof runtime>) {
				state.queuedGoals = [createGoal("replacement successor", undefined, 0)];
			},
		},
		{
			action: "Drop last goal…",
			expectedMethod: "dropLastGoal",
			mutate(state: ReturnType<typeof runtime>) {
				state.queuedGoals = [createGoal("replacement tail", undefined, 0)];
			},
		},
	] as const) {
		const state = runtime(createGoal("current objective", undefined, 0));
		state.settings.experimental.goals = true;
		state.queuedGoals = [createGoal("queued objective", undefined, 0)];
		const tracked = commands();
		const selections = [GOAL_MENU_ACTIONS.queue, scenario.action];
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			select: async () => selections.shift(),
			editor: async () => ("editor" in scenario ? scenario.editor : undefined),
			confirm: async () => {
				scenario.mutate(state);
				return true;
			},
		});

		await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);

		assert.equal(
			tracked.calls.some((call) => call.name === scenario.expectedMethod),
			false,
		);
		assert.match(context.notifications.at(-1)?.message ?? "", /goal queue changed.*reopen/i);
	}
});

test("main-menu pause and resume do not mutate a replacement goal", async () => {
	for (const scenario of [
		{ action: GOAL_MENU_ACTIONS.pause, status: "active" as const, method: "pauseGoal" },
		{ action: GOAL_MENU_ACTIONS.resume, status: "paused" as const, method: "resumeGoal" },
	]) {
		const displayed = transitionGoal(
			createGoal("displayed objective", undefined, 0),
			scenario.status,
		);
		const state = runtime(displayed);
		const tracked = commands();
		const selections = [scenario.action, GOAL_MENU_ACTIONS.close];
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			select: async () => {
				const selected = selections.shift();
				if (selected === scenario.action) {
					state.activeGoal = transitionGoal(
						createGoal("replacement objective", undefined, 0),
						scenario.status,
					);
				}
				return selected;
			},
		});

		await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);

		assert.equal(
			tracked.calls.some((call) => call.name === scenario.method),
			false,
		);
		assert.match(context.notifications.at(-1)?.message ?? "", /active goal changed.*reopen/i);
	}
});

test("edit dialogs do not mutate a replacement active goal", async () => {
	const original = createGoal("old objective", undefined, 0);
	const replacement = createGoal("replacement objective", undefined, 0);
	const state = runtime(original);
	const tracked = commands();
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => GOAL_MENU_ACTIONS.edit,
		editor: async () => {
			state.activeGoal = replacement;
			return "edited old objective";
		},
		confirm: async () => true,
	});

	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);

	assert.equal(tracked.calls.length, 0);
	assert.match(context.notifications.at(-1)?.message ?? "", /goal changed.*reopen/i);
});

test("budget dialogs do not mutate a replacement active goal", async () => {
	const original = transitionGoal(createGoal("old objective", 100, 0), "budget_limited");
	original.tokensUsed = 100;
	const replacement = createGoal("replacement objective", undefined, 0);
	const state = runtime(original);
	const tracked = commands();
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		select: async () => GOAL_MENU_ACTIONS.increaseBudget,
		input: async () => {
			state.activeGoal = replacement;
			return "200";
		},
		confirm: async () => true,
	});

	await showGoalManager(state, tracked.controller as never, context.ctx, async () => undefined);

	assert.equal(tracked.calls.length, 0);
	assert.match(context.notifications.at(-1)?.message ?? "", /goal changed.*reopen/i);
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
