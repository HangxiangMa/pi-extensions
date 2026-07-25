import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { setSyncTargetCompletions } from "./command.js";
import {
	configuredTargetNames,
	loadConfig,
	loadTargetSwitchAction,
	updateLocalConfig,
} from "./config.js";
import { safeTerminalText } from "./sync-format.js";
import type { TargetSwitchAction } from "./types.js";

const TARGET_SWITCH_ACTION_OPTIONS: Array<{ label: string; value: TargetSwitchAction }> = [
	{ label: "Ask before pull", value: "ask" },
	{ label: "Always pull", value: "pull" },
	{ label: "Switch only", value: "switch-only" },
];

export function targetSwitchActionLabel(action: TargetSwitchAction) {
	return TARGET_SWITCH_ACTION_OPTIONS.find((option) => option.value === action)?.label ?? action;
}

export async function showTargetSwitchActionSetting(
	ctx: ExtensionCommandContext,
	current: TargetSwitchAction,
) {
	const labels = TARGET_SWITCH_ACTION_OPTIONS.map(({ label, value }) =>
		value === current ? `${label} (current)` : label,
	);
	const selected = await ctx.ui.select(
		[
			"After switching target",
			"",
			"Ask before pull is the default. Always pull skips pull confirmation but still creates a backup and stops on conflicts.",
		].join("\n"),
		[...labels, "Back"],
	);
	if (!selected || selected === "Back") return;
	const selectedLabel = selected.replace(/ \(current\)$/u, "");
	const action = TARGET_SWITCH_ACTION_OPTIONS.find(
		(option) => option.label === selectedLabel,
	)?.value;
	if (!action || action === current) return;
	await updateLocalConfig((settings) => {
		if (settings.version !== 2) {
			throw new Error("Target-switch settings require version 2 settings.");
		}
		return { ...settings, targetSwitchAction: action };
	});
	ctx.ui.notify(`After switching target: ${targetSwitchActionLabel(action)}.`, "info");
}

export interface TargetSwitchResult {
	pullAttempted: boolean;
}

export async function useSyncTarget(
	ctx: ExtensionCommandContext,
	name: string,
	pullCurrentTarget?: () => Promise<void>,
): Promise<TargetSwitchResult> {
	const normalized = name.trim();
	if (!normalized) throw new Error("Usage: /sync use <target>");
	await loadConfig(normalized);
	const action = await loadTargetSwitchAction();
	await updateLocalConfig((current) => {
		if (current.version !== 2) throw new Error("Target switching requires version 2 settings.");
		return { ...current, activeTarget: normalized };
	});
	setSyncTargetCompletions(await configuredTargetNames());

	if (action === "switch-only") {
		ctx.ui.notify(`Switched to “${safeTerminalText(normalized)}”. No files were pulled.`, "info");
		return { pullAttempted: false };
	}
	if (action === "ask") {
		if (ctx.mode !== "tui") {
			ctx.ui.notify(
				`Switched to “${safeTerminalText(normalized)}”. No files were pulled because confirmation requires TUI mode; run /sync pull to apply the target.`,
				"info",
			);
			return { pullAttempted: false };
		}
		const confirmed = await ctx.ui.confirm(
			`Pull target “${safeTerminalText(normalized)}” now?`,
			"This replaces selected local files with the target’s remote versions. pi-sync creates a local backup first and stops on unresolved conflicts.",
		);
		if (!confirmed) {
			ctx.ui.notify(
				`Switched to “${safeTerminalText(normalized)}”; files were not pulled.`,
				"info",
			);
			return { pullAttempted: false };
		}
	}

	ctx.ui.notify(`Switched to “${safeTerminalText(normalized)}”. Pulling remote files…`, "info");
	if (!pullCurrentTarget) {
		throw new Error(`Switched to “${safeTerminalText(normalized)}”, but pull is unavailable.`);
	}
	await pullCurrentTarget();
	return { pullAttempted: true };
}
