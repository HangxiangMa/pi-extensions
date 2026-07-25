import {
	type ExtensionCommandContext,
	getSettingsListTheme,
} from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";
import {
	isCloudflareR2Endpoint,
	isEnabled,
	loadPartialConfig,
	loadTargetSwitchAction,
	localConfigPath,
	normalizeExtraFiles,
	normalizeSyncFiles,
	readLocalConfigObject,
	updateLocalConfig,
} from "./config.js";
import { errorMessage, safeTerminalText } from "./sync-format.js";
import {
	saveTargetSwitchAction,
	TARGET_SWITCH_ACTION_OPTIONS,
	type TargetPullOutcome,
	targetSwitchActionFromLabel,
	targetSwitchActionLabel,
} from "./target-switch.js";

export type SyncSettingsRoute = (
	route: string,
	signal?: AbortSignal,
	onCommit?: () => void,
	target?: string,
) => Promise<TargetPullOutcome | undefined>;

export async function showSyncSettings(ctx: ExtensionCommandContext, runRoute: SyncSettingsRoute) {
	if (ctx.mode !== "tui") {
		ctx.ui.notify(`Edit pi-sync settings manually: ${safeTerminalText(localConfigPath())}`, "info");
		return;
	}
	while (true) {
		const raw = await readLocalConfigObject();
		const version2 = raw?.version === 2;
		const partial = await loadPartialConfig();
		const action = await showSettingsList(ctx, partial, version2);
		if (action !== "files") return;
		await runRoute("files", undefined, undefined, version2 ? partial.target : undefined);
	}
}

async function showSettingsList(
	ctx: ExtensionCommandContext,
	partial: Awaited<ReturnType<typeof loadPartialConfig>>,
	version2: boolean,
) {
	const targetName = version2 ? partial.target : undefined;
	const automaticSyncOverridden = Object.hasOwn(process.env, "PI_SYNC_AUTO_SYNC");
	const automaticSyncValue = isEnabled(partial.autoSync, true) ? "On" : "Off";
	const targetSwitchAction = await loadTargetSwitchAction();
	const targetSwitchValue = targetSwitchActionLabel(targetSwitchAction);
	let saveQueue = Promise.resolve();
	const latestRequested = new Map<string, string>();

	return ctx.ui.custom<"files" | undefined>((tui, theme, _keybindings, done) => {
		const items: SettingItem[] = [
			{
				id: "automaticSync",
				label: automaticSyncOverridden ? "Automatic sync (environment override)" : "Automatic sync",
				description: automaticSyncOverridden
					? "Read-only while deprecated PI_SYNC_AUTO_SYNC overrides this target. Move the value into target settings before the future major removal."
					: "Run conservative synchronization automatically at session startup and shutdown.",
				currentValue: automaticSyncValue,
				...(automaticSyncOverridden ? {} : { values: ["On", "Off"] }),
			},
			...(version2
				? [
						{
							id: "targetSwitchAction",
							label: "After target switch",
							description:
								"Ask before starting a pull, start a pull review automatically, or switch without checking remote files. Every pull still shows exact changes before apply.",
							currentValue: targetSwitchValue,
							values: TARGET_SWITCH_ACTION_OPTIONS.map(({ label }) => label),
						},
					]
				: []),
			{
				id: "syncFiles",
				label: "Synced content",
				description: `${normalizeSyncFiles(partial.syncFiles).length} built-in groups and ${normalizeExtraFiles(partial.extraFiles).length} extra files. Opens the reviewed content-selection draft.`,
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
					`Target: ${safeTerminalText(partial.target ?? "default")} · ${storageDescription(partial.storageKind, partial.endpoint, partial.bucket)}`,
				),
				1,
				0,
			),
		);
		let settingsList: SettingsList;
		let closing = false;
		const closeAfterSaves = (result: "files" | undefined) => {
			if (closing) return;
			closing = true;
			void saveQueue.then(() => done(result));
		};
		settingsList = new SettingsList(
			items,
			Math.min(items.length + 2, 15),
			getSettingsListTheme(),
			(id, newValue) => {
				if (id === "syncFiles") {
					closeAfterSaves("files");
					return;
				}
				latestRequested.set(id, newValue);
				const fallbackValue = id === "automaticSync" ? automaticSyncValue : targetSwitchValue;
				const operation = saveQueue.then(async () => {
					let previousValue = fallbackValue;
					try {
						if (id === "automaticSync") {
							const latest = await loadPartialConfig(targetName);
							previousValue = isEnabled(latest.autoSync, true) ? "On" : "Off";
							const enabled = newValue === "On";
							await updateSettingsTarget(targetName, (target) => ({
								...target,
								autoSync: enabled,
							}));
							ctx.ui.notify(
								`Automatic sync ${enabled ? "enabled" : "disabled"} for “${safeTerminalText(partial.target ?? "default")}”.`,
								"info",
							);
						} else if (id === "targetSwitchAction") {
							const latest = await loadTargetSwitchAction();
							previousValue = targetSwitchActionLabel(latest);
							const action = targetSwitchActionFromLabel(newValue);
							if (!action) throw new Error(`Invalid target-switch action: ${newValue}`);
							await saveTargetSwitchAction(action);
							ctx.ui.notify(`After target switch: ${newValue}.`, "info");
						}
					} catch (error) {
						if (latestRequested.get(id) === newValue) {
							settingsList.updateValue(id, previousValue);
						}
						ctx.ui.notify(`Pi Sync settings save failed: ${errorMessage(error)}`, "error");
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
				settingsList.handleInput?.(data);
				tui.requestRender();
			},
		};
	});
}

async function updateSettingsTarget(
	targetName: string | undefined,
	update: (target: Record<string, unknown>) => Record<string, unknown>,
) {
	await updateLocalConfig((current) => {
		if (current.version !== 2) return update(current);
		const targets = ownRecord(current.targets);
		const selected =
			targetName ?? (typeof current.activeTarget === "string" ? current.activeTarget : undefined);
		if (!targets || !selected) throw new Error("Settings target is not configured.");
		const target = ownRecord(targets[selected]);
		if (!target) throw new Error(`Settings target “${selected}” is invalid.`);
		return { ...current, targets: { ...targets, [selected]: update(target) } };
	});
}

function storageDescription(
	kind: string | undefined,
	endpoint: string | undefined,
	bucket: string | undefined,
) {
	const label =
		kind === "r2" || isCloudflareR2Endpoint(endpoint) ? "Cloudflare R2" : "S3-compatible";
	return `${label} · ${safeTerminalText(bucket ?? "bucket missing")}`;
}

function ownRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}
