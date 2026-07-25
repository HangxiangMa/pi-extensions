import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createCustomSelectorHarness, createMockContext } from "../../../test/support.js";
import { DEFAULT_GOAL_SETTINGS, type GoalSettings } from "../src/settings.js";
import {
	applyGoalSettings,
	formatGoalLimit,
	parseGoalLimit,
	showGoalSettings,
} from "../src/settings-ui.js";

initTheme("dark", false);

function runtime() {
	const visibility = {
		activeTools: ["read"],
		goalToolsUnlocked: false,
		goalToolsHiddenByPolicy: ["goal_complete", "goal_blocked"],
	};
	return {
		settings: structuredClone(DEFAULT_GOAL_SETTINGS),
		activeGoal: undefined,
		queuedGoals: [],
		pendingQueueAction: undefined,
		queueFrozen: false,
		snapshotGoalToolVisibility: () => structuredClone(visibility),
		restoreGoalToolVisibility: (snapshot: typeof visibility) => Object.assign(visibility, snapshot),
		restoreGoalToolsHiddenByPolicy() {
			visibility.activeTools.push(...visibility.goalToolsHiddenByPolicy);
			visibility.goalToolsHiddenByPolicy = [];
		},
		hideGoalToolsIfLocked() {},
		cancelContinuationWork() {},
		persistGoal() {},
		updateStatus() {},
		enforceAutomaticTurnLimit() {
			return false;
		},
		enforceNoProgressLimit() {
			return false;
		},
		get visibility() {
			return visibility;
		},
	};
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
		return true;
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
