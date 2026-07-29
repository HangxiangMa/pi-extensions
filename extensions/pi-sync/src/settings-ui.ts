import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";
import { loadConfig, localConfigPath } from "./config.js";
import { updateSyncSetup } from "./settings-management.js";
import {
	SETUP_SWITCH_ACTION_OPTIONS,
	type SetupPullOutcome,
	saveOnSwitch,
	setupSwitchActionFromLabel,
	setupSwitchActionLabel,
} from "./setup-switch.js";
import { safeTerminalText } from "./sync-format.js";

export type SyncSettingsRoute = (
	route: string,
	signal?: AbortSignal,
	onCommit?: () => void,
	setup?: string,
) => Promise<SetupPullOutcome | undefined>;

export async function showSyncSettings(
	ctx: ExtensionCommandContext,
	runRoute: SyncSettingsRoute,
	signal?: AbortSignal,
) {
	if (ctx.mode !== "tui") {
		ctx.ui.notify(`Edit pi-sync settings manually: ${safeTerminalText(localConfigPath())}`, "info");
		return;
	}
	const initial = await loadConfig();
	if (signal?.aborted) return;
	const setupName = initial.setupName;
	type Action = "automatic" | "on-switch" | "include";
	const menu = defineMenu<
		Awaited<ReturnType<typeof loadConfig>>,
		"settings",
		Action,
		ExtensionCommandContext
	>({
		start: "settings",
		screens: {
			settings: ({ state }) => ({
				kind: "settings",
				title: "Pi Sync Settings",
				lines: [
					`Sync setup: ${safeTerminalText(state.setupName)} · Storage connection: ${safeTerminalText(state.connectionName)}`,
				],
				items: [
					{
						id: "automatic",
						label: "Automatic sync",
						description: "Run conservative synchronization at session startup and shutdown.",
						currentValue: state.automatic ? "On" : "Off",
						values: ["On", "Off"],
						action: "automatic",
					},
					{
						id: "onSwitch",
						label: "After switching setup",
						description:
							"Ask before a reviewed pull, start a reviewed pull, or switch without checking remote files.",
						currentValue: setupSwitchActionLabel(state.onSwitch),
						values: SETUP_SWITCH_ACTION_OPTIONS.map(({ label }) => label),
						action: "on-switch",
					},
					{
						id: "include",
						label: "Included content",
						description: `${state.include.length} selected path${state.include.length === 1 ? "" : "s"}. Opens the reviewed content-selection draft.`,
						currentValue: "Open editor",
						action: "include",
					},
				],
			}),
		},
		actions: {
			automatic: async ({ value, signal: actionSignal }) => {
				const automatic = value === "On";
				const mutationSignal = signal ? AbortSignal.any([signal, actionSignal]) : actionSignal;
				try {
					const latest = await loadConfig(setupName);
					if (mutationSignal.aborted) return { kind: "rejected" };
					if (latest.automatic === automatic) return { kind: "stay" };
					await updateSyncSetup(
						setupName,
						(setup) => ({ ...setup, sync: { ...setup.sync, automatic } }),
						{ signal: mutationSignal },
					);
					if (mutationSignal.aborted) return { kind: "rejected" };
					ctx.ui.notify(
						`Automatic sync ${automatic ? "enabled" : "disabled"} for “${safeTerminalText(setupName)}”.`,
						"info",
					);
					return { kind: "stay" };
				} catch (error) {
					if (!mutationSignal.aborted) notifySaveFailure(ctx, error);
					return { kind: "rejected" };
				}
			},
			"on-switch": async ({ value, signal: actionSignal }) => {
				const action = value ? setupSwitchActionFromLabel(value) : undefined;
				if (!action) return { kind: "rejected" };
				const mutationSignal = signal ? AbortSignal.any([signal, actionSignal]) : actionSignal;
				try {
					const latest = await loadConfig(setupName);
					if (mutationSignal.aborted) return { kind: "rejected" };
					if (latest.onSwitch === action) return { kind: "stay" };
					await saveOnSwitch(action, mutationSignal);
					if (mutationSignal.aborted) return { kind: "rejected" };
					ctx.ui.notify(`After switching setup: ${value}.`, "info");
					return { kind: "stay" };
				} catch (error) {
					if (!mutationSignal.aborted) notifySaveFailure(ctx, error);
					return { kind: "rejected" };
				}
			},
			include: async ({ signal: actionSignal }) => {
				const editorSignal = signal ? AbortSignal.any([signal, actionSignal]) : actionSignal;
				await runRoute("files", editorSignal, undefined, setupName);
				return editorSignal.aborted ? { kind: "rejected" } : { kind: "stay" };
			},
		},
	});
	await runMenu(ctx, menu, {
		getState: () => loadConfig(setupName),
		signal,
		isCurrent: () => !signal?.aborted,
	});
}

function notifySaveFailure(ctx: ExtensionCommandContext, error: unknown) {
	ctx.ui.notify(
		`Pi Sync settings save failed: ${error instanceof Error ? error.message : String(error)}`,
		"error",
	);
}
