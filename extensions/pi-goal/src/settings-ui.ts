import { join } from "node:path";
import {
	type ExtensionCommandContext,
	getAgentDir,
	getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";
import type { GoalRuntime } from "./runtime.js";
import { STATUS_KEY } from "./runtime.js";
import { GOAL_SETTINGS_FILE, type GoalSettings, saveGoalSettings } from "./settings.js";

interface GoalSettingsUiOptions {
	settingsPath?: string;
	save?: (settings: GoalSettings, settingsPath: string) => void;
}

interface GoalSettingsApplyOptions {
	save?: (settings: GoalSettings) => void;
}

type LimitField = "automaticTurns" | "noProgressTurns";
type SettingsScreenResult = { kind: "limit"; field: LimitField } | undefined;

export async function showGoalSettings(
	runtime: GoalRuntime,
	ctx: ExtensionCommandContext,
	options: GoalSettingsUiOptions = {},
) {
	const settingsPath = options.settingsPath ?? join(getAgentDir(), GOAL_SETTINGS_FILE);
	if (ctx.mode !== "tui") {
		ctx.ui.notify(`Edit pi-goal settings manually: ${safeTerminalText(settingsPath)}`, "info");
		return;
	}

	while (true) {
		const result = await showSettingsScreen(runtime, ctx, settingsPath, options.save);
		if (!result) return;
		const previous = runtime.settings.continuationLimits[result.field];
		const raw = await ctx.ui.input(
			result.field === "automaticTurns" ? "Automatic response limit" : "No-progress run limit",
			formatGoalLimit(previous),
		);
		if (raw === undefined) continue;
		const limit = parseGoalLimit(raw);
		if (limit === undefined) {
			ctx.ui.notify("Enter a positive whole number or Unlimited.", "warning");
			continue;
		}
		if (!(await confirmLowerActiveLimit(runtime, ctx, result.field, limit))) continue;
		const next = withLimit(runtime.settings, result.field, limit);
		try {
			applyGoalSettings(runtime, next, ctx, {
				save: (settings) => (options.save ?? saveGoalSettings)(settings, settingsPath),
			});
			ctx.ui.notify(
				`${result.field === "automaticTurns" ? "Automatic response" : "No-progress"} limit: ${formatGoalLimit(limit)}.`,
				"info",
			);
		} catch (error) {
			ctx.ui.notify(`pi-goal settings save failed: ${formatError(error)}`, "error");
		}
	}
}

export function applyGoalSettings(
	runtime: GoalRuntime,
	next: GoalSettings,
	ctx: ExtensionCommandContext,
	options: GoalSettingsApplyOptions = {},
) {
	const previous = runtime.settings;
	const visibility = runtime.snapshotGoalToolVisibility();
	const previousQueueFrozen = runtime.queueFrozen;
	try {
		runtime.settings = structuredClone(next);
		applyToolVisibility(runtime, previous, next);
		options.save?.(next);
	} catch (error) {
		runtime.settings = previous;
		runtime.queueFrozen = previousQueueFrozen;
		runtime.restoreGoalToolVisibility(visibility);
		throw error;
	}

	applyQueueSetting(runtime, ctx);
	runtime.enforceAutomaticTurnLimit(ctx, true);
	runtime.enforceNoProgressLimit(ctx);
}

export function parseGoalLimit(value: string): number | null | undefined {
	const normalized = value.trim().toLowerCase();
	if (normalized === "unlimited" || normalized === "off") return null;
	if (!/^\d+$/u.test(normalized)) return undefined;
	const parsed = Number(normalized);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function formatGoalLimit(value: number | null) {
	return value === null ? "Unlimited" : String(value);
}

async function showSettingsScreen(
	runtime: GoalRuntime,
	ctx: ExtensionCommandContext,
	settingsPath: string,
	save: GoalSettingsUiOptions["save"],
): Promise<SettingsScreenResult> {
	let saveQueue = Promise.resolve();
	const latestRequested = new Map<string, string>();
	return ctx.ui.custom<SettingsScreenResult>((tui, theme, _keybindings, done) => {
		const settings = runtime.settings;
		const items: SettingItem[] = [
			{
				id: "toolVisibility",
				label: "Goal tools",
				description: "Keep terminal Goal tools visible, or reveal them after the first goal.",
				currentValue: visibilityLabel(settings.toolVisibility),
				values: ["Always", "After first goal"],
			},
			{
				id: "experimentalGoals",
				label: "Ordered goal queue",
				description: "Enable experimental add, prioritize, skip, and drop-last workflows.",
				currentValue: settings.experimental.goals ? "Experimental" : "Off",
				values: ["Off", "Experimental"],
			},
			limitItem(
				"automaticTurns",
				"Automatic response limit",
				"Pause after this many Goal-owned automatic model responses.",
				settings.continuationLimits.automaticTurns,
			),
			limitItem(
				"noProgressTurns",
				"No-progress limit",
				"Pause after this many repeated or empty tool-free automatic runs.",
				settings.continuationLimits.noProgressTurns,
			),
		];
		const container = new Container();
		container.addChild(new Text(theme.fg("accent", theme.bold("Pi Goal Settings")), 1, 0));
		container.addChild(
			new Text(theme.fg("muted", `User settings · ${safeTerminalText(settingsPath)}`), 1, 0),
		);
		let settingsList: SettingsList;
		let closing = false;
		const closeAfterSaves = (result: SettingsScreenResult) => {
			if (closing) return;
			closing = true;
			void saveQueue.then(() => done(result));
		};
		settingsList = new SettingsList(
			items,
			Math.min(items.length + 2, 15),
			getSettingsListTheme(),
			(id, newValue) => {
				if ((id === "automaticTurns" || id === "noProgressTurns") && newValue === "Edit…") {
					closeAfterSaves({ kind: "limit", field: id });
					return;
				}
				if (id !== "toolVisibility" && id !== "experimentalGoals") return;
				latestRequested.set(id, newValue);
				const operation = saveQueue.then(async () => {
					const previousValue =
						id === "toolVisibility"
							? visibilityLabel(runtime.settings.toolVisibility)
							: runtime.settings.experimental.goals
								? "Experimental"
								: "Off";
					try {
						const next = await nextToggleSettings(runtime, ctx, id, newValue);
						if (!next) {
							if (latestRequested.get(id) === newValue) {
								settingsList.updateValue(id, previousValue);
							}
							tui.requestRender();
							return;
						}
						applyGoalSettings(runtime, next, ctx, {
							save: (value) => (save ?? saveGoalSettings)(value, settingsPath),
						});
						ctx.ui.notify(`${settingLabel(id)}: ${newValue}.`, "info");
					} catch (error) {
						if (latestRequested.get(id) === newValue) {
							settingsList.updateValue(id, previousValue);
						}
						ctx.ui.notify(`pi-goal settings save failed: ${formatError(error)}`, "error");
						tui.requestRender();
					}
				});
				saveQueue = operation.catch(() => undefined);
			},
			() => closeAfterSaves(undefined),
			{ enableSearch: false },
		);
		container.addChild(settingsList);
		container.addChild(
			new Text(theme.fg("dim", "↑↓ navigate · enter/space change · esc close"), 1, 0),
		);
		return {
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput(data: string) {
				settingsList.handleInput?.(data);
				tui.requestRender();
			},
		};
	});
}

async function nextToggleSettings(
	runtime: GoalRuntime,
	ctx: ExtensionCommandContext,
	id: "toolVisibility" | "experimentalGoals",
	newValue: string,
) {
	if (id === "toolVisibility") {
		return {
			...structuredClone(runtime.settings),
			toolVisibility: newValue === "Always" ? "always" : "after-first-goal",
		} satisfies GoalSettings;
	}
	const enabled = newValue === "Experimental";
	if (enabled && !runtime.settings.experimental.goals) {
		const confirmed = await ctx.ui.confirm(
			"Enable experimental goal queue?",
			"Queue behavior and persisted state may change between releases. Existing single-goal behavior remains available.",
		);
		if (!confirmed) return undefined;
	}
	if (
		!enabled &&
		(runtime.queuedGoals.length > 0 || runtime.pendingQueueAction !== undefined) &&
		!(await ctx.ui.confirm(
			"Freeze ordered goal queue?",
			`Disabling the experiment preserves ${runtime.queuedGoals.length + 1} goal(s) but freezes automatic work until the setting is re-enabled. No goal data will be deleted.`,
		))
	) {
		return undefined;
	}
	return {
		...structuredClone(runtime.settings),
		experimental: { goals: enabled },
	} satisfies GoalSettings;
}

function applyToolVisibility(runtime: GoalRuntime, previous: GoalSettings, next: GoalSettings) {
	if (previous.toolVisibility === next.toolVisibility) return;
	if (next.toolVisibility === "always") {
		runtime.restoreGoalToolsHiddenByPolicy();
		runtime.goalToolsUnlocked = true;
		return;
	}
	if (runtime.activeGoal) {
		runtime.goalToolsUnlocked = true;
		runtime.goalToolsHiddenByPolicy.clear();
		return;
	}
	runtime.goalToolsUnlocked = false;
	runtime.hideGoalToolsIfLocked();
}

function applyQueueSetting(runtime: GoalRuntime, ctx: ExtensionCommandContext) {
	const hasQueueState = runtime.queuedGoals.length > 0 || runtime.pendingQueueAction !== undefined;
	const shouldFreeze = !runtime.settings.experimental.goals && hasQueueState;
	if (runtime.queueFrozen === shouldFreeze) return;
	runtime.queueFrozen = shouldFreeze;
	if (shouldFreeze) runtime.cancelContinuationWork();
	if (runtime.activeGoal) runtime.persistGoal(runtime.activeGoal);
	if (shouldFreeze) ctx.ui.setStatus(STATUS_KEY, "queue off");
	else if (runtime.activeGoal) runtime.updateStatus(ctx, runtime.activeGoal);
	else ctx.ui.setStatus(STATUS_KEY, undefined);
}

async function confirmLowerActiveLimit(
	runtime: GoalRuntime,
	ctx: ExtensionCommandContext,
	field: LimitField,
	limit: number | null,
) {
	const goal = runtime.activeGoal;
	if (goal?.status !== "active" || limit === null) return true;
	const used = field === "automaticTurns" ? goal.automaticModelTurns : goal.toolFreeRepeatCount;
	if (used < limit) return true;
	return ctx.ui.confirm(
		"Apply reached safety limit?",
		`The active goal has already used ${used}. Setting this limit to ${limit} will pause it immediately without deleting progress.`,
	);
}

function withLimit(settings: GoalSettings, field: LimitField, value: number | null): GoalSettings {
	return {
		...structuredClone(settings),
		continuationLimits: { ...settings.continuationLimits, [field]: value },
	};
}

function limitItem(id: LimitField, label: string, description: string, value: number | null) {
	const currentValue = formatGoalLimit(value);
	return {
		id,
		label,
		description,
		currentValue,
		values: [currentValue, "Edit…"],
	} satisfies SettingItem;
}

function visibilityLabel(value: GoalSettings["toolVisibility"]) {
	return value === "always" ? "Always" : "After first goal";
}

function settingLabel(id: "toolVisibility" | "experimentalGoals") {
	return id === "toolVisibility" ? "Goal tools" : "Ordered goal queue";
}

function safeTerminalText(value: string) {
	return [...value]
		.map((character) => {
			const codePoint = character.codePointAt(0) ?? 0;
			return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? " " : character;
		})
		.join("")
		.trim();
}

function formatError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
