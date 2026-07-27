import { BorderedLoader, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { setSyncTargetCompletions } from "./command.js";
import {
	activeLocalConfigPath,
	configuredTargetNames,
	deprecatedPiSyncEnvironmentWarnings,
	isCloudflareR2Endpoint,
	loadConfig,
	loadPartialConfig,
	loadTargetSwitchAction,
	normalizeSyncFiles,
	readLocalConfigObject,
	readStateForConfig,
} from "./config.js";
import { inspectLock, isStaleLock } from "./lock.js";
import {
	errorMessage,
	formatRemotePath,
	ownRecord,
	requiredExistingBucket,
	requiredInput,
	safeTerminalText,
	storageDescription,
} from "./manager-helpers.js";
import { chooseS3Credentials } from "./s3-credentials-ui.js";
import {
	addSyncTarget,
	migrateLegacySettings,
	removeSyncTarget,
	saveNewV2Settings,
	updateSyncTarget,
} from "./settings-management.js";
import { showSyncSettings } from "./settings-ui.js";
import { showAddStorageConnection, showStorageConnections } from "./storage-connections-ui.js";
import { DEFAULT_SYNC_FILES } from "./sync-policy.js";
import { type TargetPullOutcome, useSyncTarget } from "./target-switch.js";
import type { AnySyncConfig } from "./types.js";
import {
	repairableWebDavDestinationName,
	showAddWebDavTarget,
	showEditWebDavTarget,
	showRepairableWebDavDestination,
	showWebDavSetup,
} from "./webdav-ui.js";

export const MAIN_MENU_ACTIONS = [
	"Sync now (recommended)",
	"Pull from remote",
	"Push to remote",
	"Switch target",
	"Status & changes",
	"Settings",
	"More…",
] as const;
const MORE_MENU_ACTIONS = ["Manage destinations", "History & recovery", "Help", "Back"] as const;
const BACK = "Back";

type MainMenuAction = (typeof MAIN_MENU_ACTIONS)[number];
type ContextualMenuAction = "Manage destinations" | "History & recovery" | "Help";
type RunRoute = (
	route: string,
	signal?: AbortSignal,
	onCommit?: () => void,
	target?: string,
) => Promise<TargetPullOutcome | undefined>;

export async function showSyncManager(
	ctx: ExtensionCommandContext,
	runRoute: RunRoute,
	sessionSignal?: AbortSignal,
): Promise<void> {
	if (!ctx.hasUI) {
		await runRoute("help");
		return;
	}
	while (true) {
		const state = await describeManagerState(sessionSignal);
		if (sessionSignal?.aborted) return;
		const selected = await ctx.ui.select(state.title, state.actions, { signal: sessionSignal });
		if (sessionSignal?.aborted) return;
		if (!selected) return;
		switch (
			selected as
				| MainMenuAction
				| ContextualMenuAction
				| "Set up sync"
				| "Use existing settings"
				| "Repair WebDAV destination"
		) {
			case "Sync now (recommended)":
				await runCancellableOperation(ctx, "Checking current target…", "sync", runRoute, true);
				break;
			case "Pull from remote": {
				const result = await runCancellableOperation(
					ctx,
					"Checking remote changes…",
					"pull",
					runRoute,
					true,
					"Pull check cancelled; no local files were changed.",
				);
				if (result === "applied") return;
				break;
			}
			case "Push to remote":
				await runCancellableOperation(
					ctx,
					"Preparing push preview…",
					"push",
					runRoute,
					true,
					"Push preparation cancelled; no remote files were changed.",
				);
				break;
			case "Switch target": {
				const result = await showTargetSwitcher(ctx, runRoute);
				if (result === "pull-attempted") return;
				if (result === "switched") continue;
				break;
			}
			case "Status & changes":
				await runCancellableOperation(ctx, "Checking current target…", "diff", runRoute);
				break;
			case "Settings":
				await showSyncSettings(ctx, runRoute);
				break;
			case "More…":
				if ((await showMoreMenu(ctx, runRoute, sessionSignal)) === "exit") return;
				break;
			case "Manage destinations":
				await showManageMenu(ctx, runRoute, sessionSignal);
				break;
			case "Repair WebDAV destination":
				await showRepairableWebDavDestination(ctx, sessionSignal);
				break;
			case "History & recovery":
				await showRecoveryMenu(ctx, runRoute);
				break;
			case "Help":
				await runRoute("help");
				return;
			case "Set up sync":
			case "Use existing settings":
				await runRoute("init");
				continue;
		}
	}
}

async function showMoreMenu(
	ctx: ExtensionCommandContext,
	runRoute: RunRoute,
	signal?: AbortSignal,
) {
	const selected = await ctx.ui.select("More options", [...MORE_MENU_ACTIONS], { signal });
	if (!selected || selected === BACK) return;
	if (selected === "Manage destinations") await showManageMenu(ctx, runRoute, signal);
	else if (selected === "History & recovery") await showRecoveryMenu(ctx, runRoute);
	else {
		await runRoute("help");
		return "exit" as const;
	}
}

async function runCancellableOperation(
	ctx: ExtensionCommandContext,
	message: string,
	route: string,
	runRoute: RunRoute,
	commitAware = false,
	cancelledMessage: string | null = "Check cancelled; no settings or files were changed.",
	target?: string,
) {
	if (ctx.mode !== "tui") {
		return await runRoute(route, undefined, undefined, target);
	}
	let commitStarted = false;
	let operation: Promise<void> | undefined;
	let routeResult: TargetPullOutcome | undefined;
	const result = await ctx.ui.custom<{ cancelled?: boolean; error?: unknown }>(
		(tui, theme, _kb, done) => {
			const loader = new BorderedLoader(tui, theme, message, { cancellable: true });
			let closed = false;
			loader.onAbort = () => {
				if (commitStarted) {
					ctx.ui.notify(
						"Applying or publishing has started and cannot be cancelled safely.",
						"warning",
					);
					return;
				}
				closed = true;
				done({ cancelled: true });
			};
			operation = runRoute(
				route,
				loader.signal,
				commitAware ? () => (commitStarted = true) : undefined,
				target,
			)
				.then((result) => {
					routeResult = result;
					if (!closed) done({});
				})
				.catch((error) => {
					if (!closed) done({ error });
				});
			return loader;
		},
	);
	if (result?.cancelled) {
		await operation;
		if (cancelledMessage) ctx.ui.notify(cancelledMessage, "info");
		return "cancelled";
	}
	if (result?.error) throw result.error;
	return routeResult;
}

async function describeManagerState(
	signal?: AbortSignal,
): Promise<{ title: string; actions: string[] }> {
	let raw: Record<string, unknown> | undefined;
	try {
		raw = await readLocalConfigObject();
	} catch (error) {
		const repairableWebDav = await repairableWebDavDestinationName(signal).catch(() => undefined);
		return {
			title: [
				"Pi Sync",
				"",
				"Settings file needs repair. Automatic sync and settings writes are paused.",
				`Error: ${safeTerminalText(errorMessage(error))}`,
				`File: ${safeTerminalText(await activeLocalConfigPath())}`,
				"",
				"Repair the JSON file, then reopen /sync.",
			].join("\n"),
			actions: repairableWebDav ? ["Repair WebDAV destination", "Help"] : ["Help"],
		};
	}
	if (!raw) {
		return {
			title: ["Pi Sync", "", "Not set up.", "", "What do you want to do?"].join("\n"),
			actions: ["Set up sync", "Help"],
		};
	}
	const configuredTargets = ownRecord(raw.targets);
	if (raw.version === 2 && configuredTargets && Object.keys(configuredTargets).length === 0) {
		return {
			title: [
				"Pi Sync",
				"",
				"No sync targets are configured.",
				"Add a target using an existing storage profile.",
				"",
				"What do you want to do?",
			].join("\n"),
			actions: ["Manage destinations", "Help"],
		};
	}
	try {
		const config = await loadConfig();
		const target = config.target ?? "default";
		const storage =
			config.backend.type === "webdav"
				? `WebDAV · ${safeTerminalText(config.backend.destination.path)}`
				: storageDescription(
						config.backend.profile.kind,
						config.backend.profile.endpoint,
						config.backend.destination.bucket,
					);
		const warnings = deprecatedPiSyncEnvironmentWarnings();
		const lock = await inspectLock();
		const liveLock = lock.status === "valid" && !isStaleLock(lock.lock);
		const recoverableLock =
			lock.status === "unreadable" || (lock.status === "valid" && isStaleLock(lock.lock));
		const builtInCount = normalizeSyncFiles(config.syncFiles).length;
		const extraFileCount = config.extraFiles.length;
		const noSyncedContent = builtInCount === 0 && extraFileCount === 0 && !config.syncSessions;
		const stateReadDisabled = liveLock || recoverableLock;
		const syncState = stateReadDisabled
			? undefined
			: await readStateForConfig(config).catch(() => undefined);
		const lastAppliedSnapshot = stateReadDisabled
			? "Unavailable while operations are locked"
			: syncState?.lastAppliedSnapshot
				? safeTerminalText(syncState.lastAppliedSnapshot)
				: syncState
					? "Never synced"
					: "Unavailable";
		return {
			title: [
				"Pi Sync",
				"",
				`Current target: ${safeTerminalText(target)}`,
				`Storage: ${storage}`,
				`Synced content: ${builtInCount} built-in group${builtInCount === 1 ? "" : "s"} · ${extraFileCount} extra file${extraFileCount === 1 ? "" : "s"} · Sessions: ${config.syncSessions ? "On" : "Off"}`,
				`Auto-sync: ${config.autoSync ? "On" : "Off"}`,
				`Last applied snapshot: ${lastAppliedSnapshot}`,
				"Remote changes: Not checked",
				...warnings.map((warning) => `Warning: ${safeTerminalText(warning)}`),
				...(noSyncedContent
					? ["", "No synced content is selected. Choose synced content in Settings before syncing."]
					: []),
				...(liveLock
					? [
							"",
							`Operation in progress: ${safeTerminalText(lock.lock.command)} (pid ${lock.lock.pid}). Sync and settings changes are disabled.`,
						]
					: []),
				...(recoverableLock
					? ["", "Recovery required: lock metadata is stale or unreadable."]
					: []),
				"",
				"What do you want to do?",
			].join("\n"),
			actions:
				liveLock || recoverableLock
					? ["Status & changes", "History & recovery", "Help"]
					: noSyncedContent
						? ["Settings", "Switch target", "Status & changes", "More…"]
						: [...MAIN_MENU_ACTIONS],
		};
	} catch (error) {
		const targets = ownRecord(raw.targets);
		return {
			title: [
				"Pi Sync",
				"",
				"Settings need attention. Automatic sync is paused.",
				`Current target: ${safeTerminalText(typeof raw.activeTarget === "string" ? raw.activeTarget : "default")}`,
				`Error: ${safeTerminalText(errorMessage(error))}`,
				`File: ${safeTerminalText(await activeLocalConfigPath())}`,
				"",
				"What do you want to do?",
			].join("\n"),
			actions: [
				...(targets && Object.keys(targets).length > 1 ? ["Switch target"] : []),
				"Manage destinations",
				"Help",
			],
		};
	}
}

export async function showSetupWizard(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	if (ctx.mode !== "tui") return false;
	const preset = await ctx.ui.select(
		"Set up sync\n\nWhere will Pi settings be stored?",
		["Cloudflare R2", "Other S3-compatible storage", "WebDAV", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || !preset || preset === "Cancel") return false;
	const targetName = await chooseInitialTargetName(ctx);
	if (!targetName) return false;
	if (preset === "WebDAV") {
		const saved = await showWebDavSetup(ctx, targetName, signal);
		if (saved) await refreshTargetCompletions();
		return saved;
	}
	const endpoint = await requiredInput(
		ctx,
		preset === "Cloudflare R2" ? "Cloudflare R2 endpoint" : "S3-compatible endpoint",
		preset === "Cloudflare R2"
			? "https://<account-id>.r2.cloudflarestorage.com"
			: "https://s3.example.com",
	);
	if (!endpoint) return false;
	let region = "auto";
	if (preset !== "Cloudflare R2") {
		const selectedRegion = await requiredInput(ctx, "Storage region", "us-east-1");
		if (!selectedRegion) return false;
		region = selectedRegion;
	}
	const location = await chooseInitialRemoteLocation(ctx, preset, targetName);
	if (!location) return false;
	const { profileName, bucket, prefix, namespace } = location;
	const credentials = await chooseS3Credentials(ctx, signal);
	if (!credentials) return false;
	const contentChoice = await ctx.ui.select(
		"Choose an initial sync preset",
		["Recommended Pi settings", "Minimal settings", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || !contentChoice || contentChoice === "Cancel") return false;
	const syncFiles =
		contentChoice === "Minimal settings" ? ["settings.json", "AGENTS.md"] : [...DEFAULT_SYNC_FILES];
	const automaticChoice = await ctx.ui.select(
		"Automatic sync for this target",
		["Enable automatic sync", "Keep automatic sync off", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || !automaticChoice || automaticChoice === "Cancel") return false;
	const sessionChoice = await ctx.ui.select(
		"Session conversations\n\nSessions can contain prompts, tool output, paths, screenshots, and secrets.",
		["Keep sessions off (recommended)", "Include session conversations", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || !sessionChoice || sessionChoice === "Cancel") return false;
	const syncSessions = sessionChoice === "Include session conversations";
	if (
		syncSessions &&
		!(await ctx.ui.confirm(
			"Include session conversations?",
			"I understand that session JSONL can contain prompts, tool output, paths, screenshots, and secrets.",
			{ signal },
		))
	) {
		return false;
	}
	const autoSync = automaticChoice === "Enable automatic sync";
	const choice = await ctx.ui.select(
		[
			"Review setup",
			"",
			`Target: ${safeTerminalText(targetName)}`,
			`Storage profile: ${safeTerminalText(profileName)} (${preset})`,
			`Endpoint: ${safeTerminalText(endpoint)}`,
			`Bucket: ${safeTerminalText(bucket)}`,
			`Remote path: ${formatRemotePath(prefix, namespace)}`,
			"Bucket must already exist. pi-sync will not create it.",
			`Synced content: ${syncFiles.length} built-in groups · Sessions: ${syncSessions ? "On — privacy warning acknowledged" : "Off"}`,
			`Auto-sync: ${autoSync ? "On" : "Off"}`,
			`Credentials: ${safeTerminalText(credentials.summary)}`,
		].join("\n"),
		["Save setup", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || choice !== "Save setup") return false;
	await saveNewV2Settings({
		targetName,
		storageProfileName: profileName,
		profile: {
			kind: preset === "Cloudflare R2" ? "r2" : "s3-compatible",
			endpoint,
			region,
			...credentials.profileFields,
		},
		target: {
			bucket,
			prefix,
			namespace,
			autoSync,
			syncFiles,
			syncSessions,
			extraFiles: [],
		},
	});
	if (signal?.aborted) return false;
	await refreshTargetCompletions();
	ctx.ui.notify(
		credentials.ready
			? `Destination “${safeTerminalText(targetName)}” is ready. Use Sync now when ready.`
			: `Saved destination “${safeTerminalText(targetName)}”; add credentials before syncing.`,
		"info",
	);
	return true;
}

async function showTargetSwitcher(ctx: ExtensionCommandContext, runRoute: RunRoute) {
	const raw = await readLocalConfigObject();
	if (raw?.version !== 2) {
		ctx.ui.notify("Add a second sync target before switching targets.", "info");
		return false;
	}
	const targets = ownRecord(raw.targets);
	if (!targets) {
		ctx.ui.notify("No sync targets are configured.", "warning");
		return false;
	}
	const active = typeof raw.activeTarget === "string" ? raw.activeTarget : undefined;
	const profiles = ownRecord(raw.profiles);
	const names = Object.keys(targets).sort((left, right) => left.localeCompare(right));
	const labels = new Map<string, string>();
	for (const name of names) {
		const target = ownRecord(targets[name]);
		const profileName = typeof target?.profile === "string" ? target.profile : undefined;
		const profile = profileName && profiles ? ownRecord(profiles[profileName]) : undefined;
		const label = [
			`${safeTerminalText(name)}${name === active ? " (current)" : ""}`,
			profile
				? `${safeTerminalText(profileName ?? "unknown")} · ${safeTerminalText(
						profile.kind === "webdav"
							? String(target?.path ?? "pi-sync")
							: String(target?.bucket ?? "missing bucket"),
					)}`
				: `Invalid: missing storage profile ${safeTerminalText(profileName ?? "reference")}`,
			`${normalizeSyncFiles(target?.syncFiles as string[] | undefined).length} groups · Sessions: ${target?.syncSessions === true ? "On" : "Off"}`,
		].join(" · ");
		labels.set(label, name);
	}
	const options = [...labels.keys(), BACK];
	const selected = await ctx.ui.select(
		`Switch target\n\nCurrent target: ${safeTerminalText(active ?? "none")}`,
		options,
	);
	if (!selected || selected === BACK) return false;
	const name = labels.get(selected) ?? selected.replace(/ \(current\)$/u, "");
	if (name === active) {
		ctx.ui.notify(`Target “${safeTerminalText(name)}” is already current.`, "info");
		return false;
	}
	let config: AnySyncConfig;
	try {
		config = await loadConfig(name);
	} catch (error) {
		ctx.ui.notify(
			`Cannot use target “${safeTerminalText(name)}”: ${safeTerminalText(errorMessage(error))}`,
			"error",
		);
		return false;
	}
	const targetSwitchAction = await loadTargetSwitchAction();
	const switchEffect =
		targetSwitchAction === "ask"
			? "After switching, pi-sync will ask whether to review a pull for the target."
			: targetSwitchAction === "pull"
				? "After switching, pi-sync will check the target and show exact changes before applying them."
				: "After switching, pi-sync will not pull or modify synced files.";
	const choice = await ctx.ui.select(
		[
			"Switch target",
			"",
			`From: ${safeTerminalText(active ?? "none")}`,
			`To: ${safeTerminalText(name)}`,
			`Storage: ${
				config.backend.type === "webdav"
					? `WebDAV · ${safeTerminalText(config.backend.destination.path)}`
					: storageDescription(
							config.backend.profile.kind,
							config.backend.profile.endpoint,
							config.backend.destination.bucket,
						)
			}`,
			`Synced content: ${normalizeSyncFiles(config.syncFiles).length} built-in groups · ${config.extraFiles.length} extra files`,
			`Auto-sync: ${config.autoSync ? "On" : "Off"} · Sessions: ${config.syncSessions ? "On" : "Off"}`,
			"",
			switchEffect,
		].join("\n"),
		[`Switch to ${safeTerminalText(name)}`, "Cancel"],
	);
	if (choice !== `Switch to ${safeTerminalText(name)}`) return false;
	const result = await useSyncTarget(ctx, name, (selectedTarget) =>
		runCancellableOperation(
			ctx,
			`Pulling target “${safeTerminalText(name)}”…`,
			"pull",
			runRoute,
			true,
			null,
			selectedTarget,
		),
	);
	return result.pullApplied ? "pull-attempted" : "switched";
}

async function showManageMenu(
	ctx: ExtensionCommandContext,
	_runRoute: RunRoute,
	signal?: AbortSignal,
) {
	const selected = await ctx.ui.select(
		"Manage destinations",
		[
			"Add destination",
			"Edit current destination",
			"Saved connections…",
			"Remove destination",
			BACK,
		],
		{ signal },
	);
	if (!selected || selected === BACK) return;
	if (selected === "Add destination") await showAddTarget(ctx, signal);
	else if (selected === "Edit current destination") await showEditCurrentTarget(ctx, signal);
	else if (selected === "Saved connections…") await showStorageConnections(ctx, signal);
	else await showRemoveTarget(ctx);
}

async function showAddTarget(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	let raw = await readLocalConfigObject();
	if (!raw)
		return void ctx.ui.notify("Set up the first sync target before adding another.", "info");
	if (raw.version !== 2) {
		const choice = await ctx.ui.select(
			[
				"Upgrade settings for multiple targets",
				"",
				"The existing destination, unknown fields, and local sync state will be preserved.",
				"An exact private backup is created before the atomic conversion.",
			].join("\n"),
			["Upgrade settings", "Cancel"],
		);
		if (choice !== "Upgrade settings") return;
		const currentTarget = await requiredInput(ctx, "Name the existing sync target", "default");
		if (!currentTarget) return;
		const currentProfile = await requiredInput(ctx, "Name the existing storage profile", "default");
		if (!currentProfile) return;
		const migration = await migrateLegacySettings(currentTarget, currentProfile);
		ctx.ui.notify(
			`Upgraded pi-sync settings. Backup: ${safeTerminalText(migration.backupPath)}`,
			"info",
		);
		raw = migration.settings;
	}
	let profiles = ownRecord(raw.profiles) ?? {};
	const name = await requiredInput(ctx, "Name the new destination", "work");
	if (!name) return;
	const createConnection = "Create a new saved connection…";
	let profile = await ctx.ui.select("Choose a saved connection", [
		...Object.keys(profiles).sort(),
		createConnection,
		"Cancel",
	]);
	if (!profile || profile === "Cancel") return;
	if (profile === createConnection) {
		const previousNames = new Set(Object.keys(profiles));
		if (!(await showAddStorageConnection(ctx, signal))) return;
		raw = (await readLocalConfigObject()) ?? raw;
		profiles = ownRecord(raw.profiles) ?? {};
		profile = Object.keys(profiles).find((candidate) => !previousNames.has(candidate));
		if (!profile) return;
	}
	if (ownRecord(profiles[profile])?.kind === "webdav") {
		if (await showAddWebDavTarget(ctx, name, profile, signal)) await refreshTargetCompletions();
		return;
	}
	const location = await chooseAdditionalRemoteLocation(ctx, raw, profile, name);
	if (!location) return;
	const { bucket, prefix, namespace } = location;
	const preset = await ctx.ui.select("Choose synced content", [
		"Recommended Pi settings",
		"Minimal settings",
		"Cancel",
	]);
	if (!preset || preset === "Cancel") return;
	const syncFiles =
		preset === "Minimal settings" ? ["settings.json", "AGENTS.md"] : [...DEFAULT_SYNC_FILES];
	const overlapsExistingTarget = Object.values(ownRecord(raw.targets) ?? {}).some((value) => {
		const existing =
			value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
		const selected = normalizeSyncFiles(existing?.syncFiles as string[] | undefined);
		return selected.some((item) => syncFiles.includes(item));
	});
	const choice = await ctx.ui.select(
		[
			"Review new sync target",
			"",
			`Target: ${safeTerminalText(name)}`,
			`Storage profile: ${safeTerminalText(profile)}`,
			`Bucket: ${safeTerminalText(bucket)}`,
			`Remote path: ${formatRemotePath(prefix, namespace)}`,
			"Bucket must already exist. pi-sync will not create it.",
			`Synced content: ${syncFiles.length} built-in groups · Sessions: Off`,
			...(overlapsExistingTarget
				? [
						"Warning: this target shares local content with another target; only the current target auto-syncs.",
					]
				: []),
			"Switching to this target later will not sync automatically.",
		].join("\n"),
		["Add target", "Cancel"],
	);
	if (choice !== "Add target") return;
	await addSyncTarget(name, {
		profile,
		bucket,
		prefix,
		namespace,
		autoSync: true,
		syncFiles,
		syncSessions: false,
		extraFiles: [],
	});
	await refreshTargetCompletions();
	ctx.ui.notify(`Added sync target “${safeTerminalText(name)}”.`, "info");
}

async function showEditCurrentTarget(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	const partial = await loadPartialConfig();
	if (partial.settingsVersion !== 2 || !partial.target) {
		ctx.ui.notify("Upgrade settings before editing a named target.", "info");
		return;
	}
	if (partial.storageKind === "webdav") {
		await showEditWebDavTarget(ctx, partial, signal);
		return;
	}
	const bucket = await requiredInput(ctx, "Bucket", partial.bucket ?? "pi-sync");
	if (!bucket) return;
	const prefix = await requiredInput(ctx, "Remote prefix", partial.prefix ?? "pi-sync");
	if (!prefix) return;
	const namespace = await requiredInput(ctx, "Remote namespace", partial.profile ?? partial.target);
	if (!namespace) return;
	const choice = await ctx.ui.select(
		[
			`Review target “${safeTerminalText(partial.target)}”`,
			"",
			`Bucket: ${safeTerminalText(partial.bucket ?? "missing")} → ${safeTerminalText(bucket)}`,
			`Prefix: ${safeTerminalText(partial.prefix ?? "pi-sync")} → ${safeTerminalText(prefix)}`,
			`Namespace: ${safeTerminalText(partial.profile ?? partial.target)} → ${safeTerminalText(namespace)}`,
			"Saving changes future sync destination only; it does not move or delete remote data.",
		].join("\n"),
		["Save target", "Cancel"],
	);
	if (choice !== "Save target") return;
	await updateSyncTarget(partial.target, (target) => ({ ...target, bucket, prefix, namespace }));
	ctx.ui.notify(`Saved target “${safeTerminalText(partial.target)}”.`, "info");
}

async function showRemoveTarget(ctx: ExtensionCommandContext) {
	const raw = await readLocalConfigObject();
	const targets = ownRecord(raw?.targets);
	if (raw?.version !== 2 || !targets || Object.keys(targets).length === 0) {
		ctx.ui.notify("No named sync targets are available to remove.", "info");
		return;
	}
	const selected = await ctx.ui.select("Remove sync target", [
		...Object.keys(targets).sort(),
		"Cancel",
	]);
	if (!selected || selected === "Cancel") return;
	const confirmed = await ctx.ui.confirm(
		"Remove sync target?",
		`Remove local target “${safeTerminalText(selected)}”? Remote buckets and snapshots are not deleted.`,
	);
	if (!confirmed) return;
	await removeSyncTarget(selected);
	await refreshTargetCompletions();
	ctx.ui.notify(
		`Removed sync target “${safeTerminalText(selected)}”; remote data was not deleted.`,
		"info",
	);
}

async function refreshTargetCompletions() {
	setSyncTargetCompletions(await configuredTargetNames());
}

async function showRecoveryMenu(ctx: ExtensionCommandContext, runRoute: RunRoute) {
	const lock = await inspectLock();
	const canRecover =
		lock.status === "unreadable" || (lock.status === "valid" && isStaleLock(lock.lock));
	const selected = await ctx.ui.select("History & recovery", [
		"Browse history",
		"Check setup",
		...(canRecover ? ["Recover stale operation"] : []),
		BACK,
	]);
	if (!selected || selected === BACK) return;
	if (selected === "Browse history") await runRoute("history");
	else if (selected === "Check setup") await runRoute("doctor");
	else await runRoute("unlock --stale");
}

interface ChosenRemoteLocation {
	profileName: string;
	bucket: string;
	prefix: string;
	namespace: string;
}

async function chooseInitialTargetName(ctx: ExtensionCommandContext) {
	const purpose = await ctx.ui.select("What will this target be used for?", [
		"Personal / Home",
		"Work",
		"Custom",
		"Cancel",
	]);
	if (!purpose || purpose === "Cancel") return undefined;
	if (purpose === "Personal / Home") return "home";
	if (purpose === "Work") return "work";
	return requiredInput(ctx, "Name this sync target", "default");
}

async function chooseInitialRemoteLocation(
	ctx: ExtensionCommandContext,
	preset: string,
	targetName: string,
): Promise<ChosenRemoteLocation | undefined> {
	const profileName = preset === "Cloudflare R2" ? "r2" : "s3";
	const suggested = {
		profileName,
		bucket: "pi-sync",
		prefix: "pi-sync",
		namespace: targetName,
	};
	if (preset === "Cloudflare R2") {
		const choice = await ctx.ui.select(
			[
				"Choose remote location",
				"",
				`Suggested storage profile: ${profileName}`,
				`Suggested bucket: ${suggested.bucket}`,
				`Remote path: ${formatRemotePath(suggested.prefix, suggested.namespace)}`,
				"Bucket must already exist. pi-sync will not create it.",
			].join("\n"),
			["Use suggested location (recommended)", "Customize remote location", "Cancel"],
		);
		if (!choice || choice === "Cancel") return undefined;
		if (choice === "Use suggested location (recommended)") return suggested;
		return chooseCustomRemoteLocation(ctx, targetName, profileName, true);
	}

	const choice = await ctx.ui.select(
		[
			"Choose remote location",
			"",
			`Suggested storage profile: ${profileName}`,
			`Suggested path: ${formatRemotePath("pi-sync", targetName)}`,
			"S3 bucket names may need to be globally unique and the bucket must already exist.",
		].join("\n"),
		[
			"Use existing bucket with suggested path (recommended)",
			"Customize remote location",
			"Cancel",
		],
	);
	if (!choice || choice === "Cancel") return undefined;
	if (choice === "Customize remote location") {
		return chooseCustomRemoteLocation(ctx, targetName, profileName, true);
	}
	const bucket = await requiredExistingBucket(ctx, "pi-sync-your-name");
	return bucket ? { ...suggested, bucket } : undefined;
}

async function chooseAdditionalRemoteLocation(
	ctx: ExtensionCommandContext,
	settings: Record<string, unknown>,
	profileName: string,
	targetName: string,
): Promise<Omit<ChosenRemoteLocation, "profileName"> | undefined> {
	const targets = ownRecord(settings.targets) ?? {};
	const activeTarget =
		typeof settings.activeTarget === "string" ? settings.activeTarget : undefined;
	const candidates = Object.entries(targets)
		.map(([name, value]) => ({ name, target: ownRecord(value) }))
		.filter(
			(item): item is { name: string; target: Record<string, unknown> } =>
				item.target?.profile === profileName && typeof item.target.bucket === "string",
		);
	const source =
		candidates.find((item) => item.name === activeTarget) ??
		candidates.sort((left, right) => left.name.localeCompare(right.name))[0];
	if (source) {
		const sourcePrefix =
			typeof source.target.prefix === "string" ? source.target.prefix : "pi-sync";
		const sameBucketLabel = `Same bucket as “${safeTerminalText(source.name)}” (recommended)`;
		const choice = await ctx.ui.select(
			[
				`Remote location for “${safeTerminalText(targetName)}”`,
				"",
				`Recommended bucket: ${safeTerminalText(String(source.target.bucket))}`,
				`Remote path: ${formatRemotePath(sourcePrefix, targetName)}`,
				"The namespace and local sync state remain separate.",
			].join("\n"),
			[sameBucketLabel, "Use a different bucket", "Customize remote location", "Cancel"],
		);
		if (!choice || choice === "Cancel") return undefined;
		if (choice === sameBucketLabel) {
			return {
				bucket: String(source.target.bucket),
				prefix: sourcePrefix,
				namespace: targetName,
			};
		}
		if (choice === "Use a different bucket") {
			const bucket = await requiredExistingBucket(ctx, "pi-sync");
			return bucket ? { bucket, prefix: "pi-sync", namespace: targetName } : undefined;
		}
		const custom = await chooseCustomRemoteLocation(ctx, targetName, profileName, false);
		return custom
			? { bucket: custom.bucket, prefix: custom.prefix, namespace: custom.namespace }
			: undefined;
	}

	const profileSettings = ownRecord(ownRecord(settings.profiles)?.[profileName]);
	const isR2 =
		profileSettings?.kind === "r2" ||
		isCloudflareR2Endpoint(String(profileSettings?.endpoint ?? ""));
	const suggestedLabel = isR2
		? "Use suggested location (recommended)"
		: "Use existing bucket with suggested path (recommended)";
	const choice = await ctx.ui.select(
		`Remote location for “${safeTerminalText(targetName)}”\n\nSuggested path: ${formatRemotePath("pi-sync", targetName)}`,
		[suggestedLabel, "Customize remote location", "Cancel"],
	);
	if (!choice || choice === "Cancel") return undefined;
	if (choice === "Customize remote location") {
		const custom = await chooseCustomRemoteLocation(ctx, targetName, profileName, false);
		return custom
			? { bucket: custom.bucket, prefix: custom.prefix, namespace: custom.namespace }
			: undefined;
	}
	if (isR2) return { bucket: "pi-sync", prefix: "pi-sync", namespace: targetName };
	const bucket = await requiredExistingBucket(ctx, "pi-sync-your-name");
	return bucket ? { bucket, prefix: "pi-sync", namespace: targetName } : undefined;
}

async function chooseCustomRemoteLocation(
	ctx: ExtensionCommandContext,
	targetName: string,
	initialProfileName: string,
	customizeProfileName: boolean,
): Promise<ChosenRemoteLocation | undefined> {
	const profileName = customizeProfileName
		? await requiredInput(ctx, "Storage profile name", initialProfileName)
		: initialProfileName;
	if (!profileName) return undefined;
	const bucket = await requiredExistingBucket(ctx, "pi-sync");
	if (!bucket) return undefined;
	const prefix = await requiredInput(ctx, "Remote prefix", "pi-sync");
	if (!prefix) return undefined;
	const namespace = await requiredInput(ctx, "Remote namespace", targetName);
	return namespace ? { profileName, bucket, prefix, namespace } : undefined;
}
