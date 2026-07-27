import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { setSyncTargetCompletions } from "./command.js";
import {
	configuredTargetNames,
	loadConfig,
	normalizeTargetSwitchAction,
	updateLocalConfig,
} from "./config.js";
import { safeTerminalText } from "./sync-format.js";
import type { TargetSwitchAction } from "./types.js";

export const TARGET_SWITCH_ACTION_OPTIONS: ReadonlyArray<{
	label: string;
	value: TargetSwitchAction;
}> = [
	{ label: "Ask before pull", value: "ask" },
	{ label: "Start pull", value: "pull" },
	{ label: "Switch only", value: "switch-only" },
];

export function targetSwitchActionLabel(action: TargetSwitchAction) {
	return TARGET_SWITCH_ACTION_OPTIONS.find((option) => option.value === action)?.label ?? action;
}

export function targetSwitchActionFromLabel(label: string): TargetSwitchAction | undefined {
	return TARGET_SWITCH_ACTION_OPTIONS.find((option) => option.label === label)?.value;
}

export async function saveTargetSwitchAction(action: TargetSwitchAction) {
	await updateLocalConfig((settings) => {
		if (settings.version !== 2) {
			throw new Error("Setup-switch settings require version 2 settings.");
		}
		return { ...settings, targetSwitchAction: action };
	});
}

export type TargetPullOutcome = "applied" | "cancelled";

export class TargetPullRequiresUiError extends Error {}

export interface TargetSwitchResult {
	pullApplied: boolean;
}

export async function useSyncTarget(
	ctx: ExtensionCommandContext,
	name: string,
	pullCurrentTarget?: (target: string) => Promise<TargetPullOutcome | undefined>,
	expectedAction?: TargetSwitchAction,
): Promise<TargetSwitchResult> {
	const normalized = name.trim();
	if (!normalized) throw new Error("Usage: /sync use <setup>");
	await loadConfig(normalized);
	const switchResult: { action: TargetSwitchAction; switched: boolean } = {
		action: "ask",
		switched: false,
	};
	await updateLocalConfig((current) => {
		if (current.version !== 2) throw new Error("Sync setup switching requires version 2 settings.");
		const targets = current.targets;
		if (!targets || typeof targets !== "object" || Array.isArray(targets)) {
			throw new Error("No sync setups are configured.");
		}
		if (!Object.hasOwn(targets, normalized)) {
			throw new Error(`Sync setup “${safeTerminalText(normalized)}” no longer exists.`);
		}
		switchResult.action = normalizeTargetSwitchAction(current.targetSwitchAction);
		if (expectedAction !== undefined && switchResult.action !== expectedAction) {
			throw new Error(
				"Setup-switch behavior changed while the preview was open; reopen it and retry.",
			);
		}
		if (switchResult.action === "pull" && !ctx.hasUI) {
			throw new TargetPullRequiresUiError(
				`Automatic setup pulls require interactive confirmation; sync setup “${safeTerminalText(normalized)}” was not switched. Use TUI or RPC mode.`,
			);
		}
		if (current.activeTarget === normalized) return current;
		switchResult.switched = true;
		return { ...current, activeTarget: normalized };
	});
	if (!switchResult.switched) {
		ctx.ui.notify(`Sync setup “${safeTerminalText(normalized)}” is already current.`, "info");
		return { pullApplied: false };
	}
	setSyncTargetCompletions(await configuredTargetNames());

	if (switchResult.action === "switch-only") {
		ctx.ui.notify(`Switched to “${safeTerminalText(normalized)}”. No files were pulled.`, "info");
		return { pullApplied: false };
	}
	if (switchResult.action === "ask") {
		if (ctx.mode !== "tui") {
			ctx.ui.notify(
				`Switched to “${safeTerminalText(normalized)}”. No files were pulled because confirmation requires TUI mode; run /sync pull to apply this setup.`,
				"info",
			);
			return { pullApplied: false };
		}
		const confirmed = await ctx.ui.confirm(
			`Review a pull for sync setup “${safeTerminalText(normalized)}” now?`,
			"pi-sync will check the remote snapshot and show the exact local writes and deletions before applying anything.",
		);
		if (!confirmed) {
			ctx.ui.notify(
				`Switched to “${safeTerminalText(normalized)}”; files were not pulled.`,
				"info",
			);
			return { pullApplied: false };
		}
	}

	ctx.ui.notify(
		`Switched to “${safeTerminalText(normalized)}”. Checking remote files for a reviewed pull…`,
		"info",
	);
	if (!pullCurrentTarget) {
		throw new Error(`Switched to “${safeTerminalText(normalized)}”, but pull is unavailable.`);
	}
	const pullOutcome = await pullCurrentTarget(normalized);
	if (pullOutcome === "cancelled") {
		ctx.ui.notify(
			`Pull cancelled; sync setup “${safeTerminalText(normalized)}” remains current and synced files were not changed.`,
			"info",
		);
	}
	return { pullApplied: pullOutcome === "applied" };
}
