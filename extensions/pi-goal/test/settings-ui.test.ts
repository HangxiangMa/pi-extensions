import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import { GoalCommandController } from "../src/commands.js";
import { createGoal, GoalRuntime } from "../src/runtime.js";
import { DEFAULT_GOAL_SETTINGS, type GoalSettings } from "../src/settings.js";
import {
	applyGoalSettings,
	formatGoalLimit,
	parseGoalLimit,
	showGoalSettings,
} from "../src/settings-ui.js";

initTheme("dark", false);

function runtime() {
	const mock = createMockPi({ activeTools: ["read"] });
	const state = new GoalRuntime(mock.pi) as GoalRuntime & {
		readonly visibility: ReturnType<GoalRuntime["snapshotGoalToolVisibility"]>;
	};
	state.settings = structuredClone(DEFAULT_GOAL_SETTINGS);
	state.goalToolsHiddenByPolicy.add("goal_complete");
	state.goalToolsHiddenByPolicy.add("goal_blocked");
	Object.defineProperty(state, "visibility", {
		get: () => state.snapshotGoalToolVisibility(),
	});
	return state;
}

test("goal setting limit parsing preserves arbitrary positive integers and unlimited", () => {
	assert.equal(parseGoalLimit("40"), 40);
	assert.equal(parseGoalLimit("unlimited"), null);
	assert.equal(parseGoalLimit("off"), null);
	for (const invalid of ["", "0", "-1", "1.5", "many"]) {
		assert.equal(parseGoalLimit(invalid), undefined);
	}
	assert.equal(formatGoalLimit(25), "25");
	assert.equal(formatGoalLimit(null), "Unlimited");
});

test("applyGoalSettings saves before committing runtime settings and enforces lower limits", () => {
	const state = runtime();
	let saved: GoalSettings | undefined;
	let enforced = 0;
	state.enforceAutomaticTurnLimit = () => {
		enforced++;
		return false;
	};
	const next: GoalSettings = {
		...structuredClone(DEFAULT_GOAL_SETTINGS),
		continuationLimits: { automaticTurns: 10, noProgressTurns: 2 },
	};
	const context = createMockContext();

	applyGoalSettings(state as never, next, context.ctx, {
		save(settings: GoalSettings) {
			saved = structuredClone(settings);
		},
	});

	assert.deepEqual(saved, next);
	assert.deepEqual(state.settings, next);
	assert.equal(enforced, 1);
});

test("applyGoalSettings restores effective tool policy when persistence fails", () => {
	const state = runtime();
	const before = structuredClone(state.visibility);
	const next: GoalSettings = {
		...structuredClone(DEFAULT_GOAL_SETTINGS),
		toolVisibility: "always",
	};
	const context = createMockContext();

	assert.throws(
		() =>
			applyGoalSettings(state as never, next, context.ctx, {
				save() {
					throw new Error("disk full");
				},
			}),
		/disk full/,
	);
	assert.deepEqual(state.settings, DEFAULT_GOAL_SETTINGS);
	assert.deepEqual(state.visibility, before);
});

test("applyGoalSettings rolls back file and effective state after runtime application fails", () => {
	const mock = createMockPi({ activeTools: ["goal_complete", "goal_blocked"] });
	const state = new GoalRuntime(mock.pi);
	state.settings = {
		...structuredClone(DEFAULT_GOAL_SETTINGS),
		experimental: { goals: true },
	};
	state.activeGoal = createGoal("current objective", undefined, 0);
	state.queuedGoals = [createGoal("queued objective", undefined, 0)];
	const previous = structuredClone(state.settings);
	const next = { ...structuredClone(previous), experimental: { goals: false } };
	const saved: GoalSettings[] = [];
	let persistCalls = 0;
	state.persistGoal = () => {
		persistCalls++;
		if (persistCalls === 1) throw new Error("stale context");
	};
	const context = createMockContext({ mode: "tui", hasUI: true });

	assert.throws(
		() =>
			applyGoalSettings(state, next, context.ctx, {
				save(settings) {
					saved.push(structuredClone(settings));
				},
			}),
		/stale context/,
	);
	assert.deepEqual(saved, [next, previous]);
	assert.deepEqual(state.settings, previous);
	assert.equal(state.queueFrozen, false);
	assert.equal(state.activeGoal?.status, "active");
});

test("disabling a retained queue pauses and aborts in-flight Goal work", () => {
	const mock = createMockPi({ activeTools: ["goal_complete", "goal_blocked"] });
	const state = new GoalRuntime(mock.pi);
	state.settings = {
		...structuredClone(DEFAULT_GOAL_SETTINGS),
		experimental: { goals: true },
	};
	state.activeGoal = createGoal("current objective", undefined, 0);
	state.queuedGoals = [createGoal("queued objective", undefined, 0)];
	state.requestContinuation(state.activeGoal);
	let aborts = 0;
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		abort: () => aborts++,
	});
	const next = { ...structuredClone(state.settings), experimental: { goals: false } };

	applyGoalSettings(state, next, context.ctx, { save() {} });

	assert.equal(aborts, 1);
	assert.equal(state.queueFrozen, true);
	assert.equal(state.activeGoal?.status, "active");
	assert.equal(state.continuationIntent, undefined);
	assert.equal(state.staleGoalToolCallsBlocked, true);
});

test("unfreezing an active retained queue dispatches Goal work immediately", async () => {
	const mock = createMockPi({ activeTools: ["goal_complete", "goal_blocked"] });
	const state = new GoalRuntime(mock.pi);
	state.settings = {
		...structuredClone(DEFAULT_GOAL_SETTINGS),
		experimental: { goals: true },
	};
	state.activeGoal = createGoal("current objective", undefined, 0);
	state.queuedGoals = [createGoal("queued objective", undefined, 0)];
	state.queueFrozen = false;
	const controller = new GoalCommandController(state);
	const context = createMockContext({ mode: "tui", hasUI: true, isIdle: () => true });

	const dispatched = await controller.resumeQueueAfterUnfreeze(context.ctx);

	assert.equal(dispatched, true);
	assert.equal(mock.sentUserMessages.length, 1);
	assert.match(mock.sentUserMessages[0]?.text ?? "", /Continue the active \/goal/i);
});

test("unfreezing a pending priority dispatches it at the idle boundary", async () => {
	const mock = createMockPi({ activeTools: ["goal_complete", "goal_blocked"] });
	const state = new GoalRuntime(mock.pi);
	state.settings = {
		...structuredClone(DEFAULT_GOAL_SETTINGS),
		experimental: { goals: true },
	};
	state.activeGoal = createGoal("current objective", undefined, 0);
	state.pendingQueueAction = { kind: "prioritize", objective: "urgent objective" };
	const controller = new GoalCommandController(state);
	const context = createMockContext({ mode: "tui", hasUI: true, isIdle: () => true });

	const dispatched = await controller.resumeQueueAfterUnfreeze(context.ctx);

	assert.equal(dispatched, true);
	assert.equal(state.pendingQueueAction, undefined);
	assert.equal(state.activeGoal?.text, "urgent objective");
	assert.equal(mock.sentUserMessages.length, 1);
});

test("settings screen saves changes in place and Escape waits for the save queue", async () => {
	const state = runtime();
	const saved: GoalSettings[] = [];
	let initialRender = "";
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		custom: async (factory: unknown) => {
			const selector = createCustomSelectorHarness(factory, 40);
			initialRender = selector.render().join("\n");
			selector.handleInput("\r");
			selector.handleInput("\u001b");
			await new Promise((resolve) => setImmediate(resolve));
			return selector.result;
		},
	});

	await showGoalSettings(state as never, context.ctx, {
		settingsPath: "/tmp/pi-goal.json",
		save(settings) {
			saved.push(structuredClone(settings));
		},
	});

	assert.match(initialRender, /Pi Goal Settings/);
	assert.match(initialRender, /Goal tools/);
	assert.doesNotMatch(initialRender, /Type to search/);
	assert.equal(saved.length, 1);
	assert.equal(saved[0]?.toolVisibility, "after-first-goal");
	assert.equal(state.settings.toolVisibility, "after-first-goal");
});

test("settings screen resumes retained work after enabling the queue", async () => {
	const state = runtime();
	state.activeGoal = createGoal("current objective", undefined, 0);
	state.queuedGoals = [createGoal("queued objective", undefined, 0)];
	state.queueFrozen = true;
	let unfrozen = 0;
	const context = createMockContext({
		mode: "tui",
		hasUI: true,
		confirm: async () => true,
		custom: async (factory: unknown) => {
			const selector = createCustomSelectorHarness(factory, 80);
			selector.handleInput("\u001b[B");
			selector.handleInput("\r");
			await new Promise((resolve) => setImmediate(resolve));
			selector.handleInput("\u001b");
			await new Promise((resolve) => setImmediate(resolve));
			return selector.result;
		},
	});

	await showGoalSettings(state, context.ctx, {
		settingsPath: "/tmp/pi-goal.json",
		save() {},
		onQueueUnfrozen: async () => {
			unfrozen++;
		},
	});

	assert.equal(state.queueFrozen, false);
	assert.equal(state.settings.experimental.goals, true);
	assert.equal(unfrozen, 1);
});

test("settings screen fits narrow, normal, and wide terminal widths", async () => {
	for (const width of [40, 80, 120]) {
		const state = runtime();
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: async (factory: unknown) => {
				const selector = createCustomSelectorHarness(factory, width);
				const lines = selector.render();
				assert.ok(lines.every((line) => visibleWidth(line) <= width));
				selector.handleInput("\u001b");
				await new Promise((resolve) => setImmediate(resolve));
				return selector.result;
			},
		});
		await showGoalSettings(state as never, context.ctx, {
			settingsPath: "/tmp/pi-goal.json",
			save() {
				throw new Error("Escape must not save.");
			},
		});
	}
});

test("showGoalSettings uses an observable manual fallback outside TUI", async () => {
	const state = runtime();
	const context = createMockContext({ mode: "rpc", hasUI: true });
	await showGoalSettings(state as never, context.ctx, { settingsPath: "/tmp/pi-goal.json" });
	assert.match(context.notifications[0]?.message ?? "", /edit pi-goal settings manually/i);
	assert.match(context.notifications[0]?.message ?? "", /\/tmp\/pi-goal\.json/);
});
