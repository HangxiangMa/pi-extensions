import {
	type ExtensionCommandContext,
	getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";
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
	while (!signal?.aborted) {
		const config = await loadConfig();
		if (signal?.aborted) return;
		const action = await showSettingsList(ctx, config, signal);
		if (signal?.aborted || action !== "files") return;
		await runRoute("files", signal, undefined, config.setupName);
	}
}

async function showSettingsList(
	ctx: ExtensionCommandContext,
	config: Awaited<ReturnType<typeof loadConfig>>,
	signal?: AbortSignal,
) {
	const automaticValue = config.automatic ? "On" : "Off";
	const switchValue = setupSwitchActionLabel(config.onSwitch);
	let saveQueue = Promise.resolve();
	const latestRequested = new Map<string, string>();

	return ctx.ui.custom<"files" | undefined>((tui, theme, _keybindings, done) => {
		const items: SettingItem[] = [
			{
				id: "automatic",
				label: "Automatic sync",
				description: "Run conservative synchronization at session startup and shutdown.",
				currentValue: automaticValue,
				values: ["On", "Off"],
			},
			{
				id: "onSwitch",
				label: "After switching setup",
				description:
					"Ask before a reviewed pull, start a reviewed pull, or switch without checking remote files.",
				currentValue: switchValue,
				values: SETUP_SWITCH_ACTION_OPTIONS.map(({ label }) => label),
			},
			{
				id: "include",
				label: "Included content",
				description: `${config.include.length} selected path${config.include.length === 1 ? "" : "s"}. Opens the reviewed content-selection draft.`,
				currentValue: "Open editor",
				values: ["Open editor"],
			},
		];
		const container = new Container();
		container.addChild(new Text(theme.fg("accent", theme.bold("Pi Sync Settings")), 1, 0));
		container.addChild(
			new Text(
				theme.fg(
					"muted",
					`Sync setup: ${safeTerminalText(config.setupName)} · Storage connection: ${safeTerminalText(config.connectionName)}`,
				),
				1,
				0,
			),
		);
		let settingsList: SettingsList;
		let closing = false;
		let disposed = false;
		const closeAfterSaves = (result: "files" | undefined) => {
			if (closing || disposed) return;
			closing = true;
			void saveQueue.then(() => {
				if (!disposed) done(signal?.aborted ? undefined : result);
			});
		};
		const onAbort = () => {
			if (!closing && !disposed) done(undefined);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		settingsList = new SettingsList(
			items,
			Math.min(items.length + 2, 15),
			getSettingsListTheme(),
			(id, newValue) => {
				if (id === "include") {
					closeAfterSaves("files");
					return;
				}
				latestRequested.set(id, newValue);
				const fallback = id === "automatic" ? automaticValue : switchValue;
				const operation = saveQueue.then(async () => {
					if (disposed || signal?.aborted) return;
					let previousValue = fallback;
					try {
						const latest = await loadConfig(config.setupName);
						if (disposed || signal?.aborted) return;
						if (id === "automatic") {
							previousValue = latest.automatic ? "On" : "Off";
							const automatic = newValue === "On";
							await updateSyncSetup(config.setupName, (setup) => ({
								...setup,
								sync: { ...setup.sync, automatic },
							}));
							if (disposed || signal?.aborted) return;
							ctx.ui.notify(
								`Automatic sync ${automatic ? "enabled" : "disabled"} for “${safeTerminalText(config.setupName)}”.`,
								"info",
							);
						} else {
							previousValue = setupSwitchActionLabel(latest.onSwitch);
							const action = setupSwitchActionFromLabel(newValue);
							if (!action) throw new Error(`Invalid setup-switch action: ${newValue}`);
							await saveOnSwitch(action);
							if (disposed || signal?.aborted) return;
							ctx.ui.notify(`After switching setup: ${newValue}.`, "info");
						}
					} catch (error) {
						if (disposed || signal?.aborted) return;
						if (latestRequested.get(id) === newValue) settingsList.updateValue(id, previousValue);
						ctx.ui.notify(
							`Pi Sync settings save failed: ${error instanceof Error ? error.message : String(error)}`,
							"error",
						);
						tui.requestRender();
					}
				});
				saveQueue = operation.catch(() => undefined);
			},
			() => closeAfterSaves(undefined),
		);
		container.addChild(settingsList);
		return {
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput(data: string) {
				if (disposed) return;
				settingsList.handleInput?.(data);
				tui.requestRender();
			},
			dispose() {
				disposed = true;
				signal?.removeEventListener("abort", onAbort);
			},
		};
	});
}
