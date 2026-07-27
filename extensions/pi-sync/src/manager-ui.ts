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
import { showAddGitTarget, showEditGitTarget, showGitSetup } from "./git-ui.js";
import { inspectLock, isStaleLock } from "./lock.js";
import {
	errorMessage,
	formatRemotePath,
	ownRecord,
	requiredExistingBucket,
	requiredInput,
	safeTerminalText,
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
import { countValidSyncSetups, showSyncSetups } from "./sync-setups-ui.js";
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
	"Switch sync setup",
	"Status & changes",
	"Settings",
	"More…",
] as const;
const MORE_MENU_ACTIONS = [
	"Pull from remote…",
	"Push to remote…",
	"Sync setups…",
	"Storage connections…",
	"History & recovery…",
	"Help",
	"Back",
] as const;
const BACK = "Back";

type MainMenuAction = (typeof MAIN_MENU_ACTIONS)[number];
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
				| "Sync setups…"
				| "Storage connections…"
				| "History & recovery…"
				| "Help"
				| "Set up sync"
				| "Use existing settings"
				| "Repair WebDAV storage location"
		) {
			case "Sync now (recommended)":
				await runCancellableOperation(ctx, "Checking current sync setup…", "sync", runRoute, true);
				break;
			case "Switch sync setup": {
				const result = await showTargetSwitcher(ctx, runRoute);
				if (result === "pull-attempted") return;
				if (result === "switched") continue;
				break;
			}
			case "Status & changes":
				await runCancellableOperation(ctx, "Checking current sync setup…", "diff", runRoute);
				break;
			case "Settings":
				await showSyncSettings(ctx, runRoute);
				break;
			case "More…":
				if ((await showMoreMenu(ctx, runRoute, sessionSignal)) === "exit") return;
				break;
			case "Sync setups…":
				if ((await showSyncSetupManager(ctx, runRoute, sessionSignal)) === "exit") return;
				break;
			case "Storage connections…":
				await showStorageConnections(ctx, sessionSignal);
				break;
			case "Repair WebDAV storage location":
				await showRepairableWebDavDestination(ctx, sessionSignal);
				break;
			case "History & recovery…":
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
	if (selected === "Pull from remote…") {
		const result = await runCancellableOperation(
			ctx,
			"Checking remote changes…",
			"pull",
			runRoute,
			true,
			"Pull check cancelled; no local files were changed.",
		);
		if (result === "applied") return "exit" as const;
		return;
	}
	if (selected === "Push to remote…") {
		await runCancellableOperation(
			ctx,
			"Preparing push preview…",
			"push",
			runRoute,
			true,
			"Push preparation cancelled; no remote files were changed.",
		);
		return;
	}
	if (selected === "Sync setups…") return showSyncSetupManager(ctx, runRoute, signal);
	else if (selected === "Storage connections…") await showStorageConnections(ctx, signal);
	else if (selected === "History & recovery…") await showRecoveryMenu(ctx, runRoute);
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
			actions: repairableWebDav ? ["Repair WebDAV storage location", "Help"] : ["Help"],
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
				"No sync setups are configured.",
				"Add a sync setup using an existing storage connection.",
				"",
				"What do you want to do?",
			].join("\n"),
			actions: ["Sync setups…", "Storage connections…", "Help"],
		};
	}
	try {
		const config = await loadConfig();
		const target = config.target ?? "default";
		const storage = backendStorageDescription(config);
		const warnings = config.backend.type === "s3" ? deprecatedPiSyncEnvironmentWarnings() : [];
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
		const canSwitch = (await countValidSyncSetups(configuredTargets, signal)) > 1;
		const mainActions = MAIN_MENU_ACTIONS.filter(
			(action) => action !== "Switch sync setup" || canSwitch,
		);
		return {
			title: [
				"Pi Sync",
				"",
				`Current sync setup: ${safeTerminalText(target)}`,
				`Storage: ${storage}`,
				`Included: ${builtInCount} built-in group${builtInCount === 1 ? "" : "s"} · ${extraFileCount} extra file${extraFileCount === 1 ? "" : "s"} · Sessions ${config.syncSessions ? "on" : "off"}`,
				`Automatic sync: ${config.autoSync ? "On" : "Off"}`,
				`Last applied: ${lastAppliedSnapshot}`,
				"Remote status: Not checked",
				...warnings.map((warning) => `Warning: ${safeTerminalText(warning)}`),
				...(noSyncedContent
					? [
							"",
							"No included content is selected. Choose included content in Settings before syncing.",
						]
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
					? ["Status & changes", "History & recovery…", "Help"]
					: noSyncedContent
						? ["Settings", ...(canSwitch ? ["Switch sync setup"] : []), "Status & changes", "More…"]
						: mainActions,
		};
	} catch (error) {
		if (signal?.aborted) throw error;
		return {
			title: [
				"Pi Sync",
				"",
				"Settings need attention. Automatic sync is paused.",
				`Current sync setup: ${safeTerminalText(typeof raw.activeTarget === "string" ? raw.activeTarget : "default")}`,
				`Error: ${safeTerminalText(errorMessage(error))}`,
				`File: ${safeTerminalText(await activeLocalConfigPath())}`,
				"",
				"What do you want to do?",
			].join("\n"),
			actions: ["Sync setups…", "Storage connections…", "History & recovery…", "Help"],
		};
	}
}

function backendStorageDescription(config: AnySyncConfig) {
	const connection = safeTerminalText(config.storageProfile ?? "default");
	switch (config.backend.type) {
		case "s3": {
			const type =
				config.backend.profile.kind === "r2" ||
				isCloudflareR2Endpoint(config.backend.profile.endpoint)
					? "Cloudflare R2"
					: "S3-compatible";
			return `${type} · ${connection} · ${safeTerminalText(config.backend.destination.bucket)}`;
		}
		case "webdav":
			return `WebDAV · ${connection} · ${safeTerminalText(config.backend.destination.path)}`;
		case "git":
			return `Git · ${connection} · ${safeTerminalText(config.backend.destination.branch)}`;
	}
}

export async function showSetupWizard(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	if (ctx.mode !== "tui") return false;
	const preset = await ctx.ui.select(
		"Set up sync\n\nWhere will Pi settings be stored?",
		["Cloudflare R2", "Other S3-compatible storage", "WebDAV", "Git", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || !preset || preset === "Cancel") return false;
	const targetName = await chooseInitialTargetName(ctx);
	if (!targetName) return false;
	if (preset === "WebDAV") {
		const saved = await showWebDavSetup(ctx, targetName, signal);
		if (signal?.aborted) return false;
		if (saved) await refreshTargetCompletions();
		return saved;
	}
	if (preset === "Git") {
		const saved = await showGitSetup(ctx, targetName, signal);
		if (signal?.aborted) return false;
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
		"Automatic sync for this setup",
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
			"Review sync setup",
			"",
			`Sync setup: ${safeTerminalText(targetName)}`,
			`Storage connection: ${safeTerminalText(profileName)} (${preset})`,
			`Endpoint: ${safeTerminalText(endpoint)}`,
			`Bucket: ${safeTerminalText(bucket)}`,
			`Storage location: ${formatRemotePath(prefix, namespace)}`,
			"Bucket must already exist. pi-sync will not create it.",
			`Included content: ${syncFiles.length} built-in groups · Sessions: ${syncSessions ? "On — privacy warning acknowledged" : "Off"}`,
			`Automatic sync: ${autoSync ? "On" : "Off"}`,
			`Credentials: ${safeTerminalText(credentials.summary)}`,
		].join("\n"),
		["Save sync setup", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || choice !== "Save sync setup") return false;
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
			? `Sync setup “${safeTerminalText(targetName)}” is ready. Use Sync now when ready.`
			: `Saved sync setup “${safeTerminalText(targetName)}”; add credentials before syncing.`,
		"info",
	);
	return true;
}

async function showTargetSwitcher(
	ctx: ExtensionCommandContext,
	runRoute: RunRoute,
	selectedName?: string,
) {
	const raw = await readLocalConfigObject();
	if (raw?.version !== 2) {
		ctx.ui.notify("Add a second sync setup before switching setups.", "info");
		return false;
	}
	const targets = ownRecord(raw.targets);
	if (!targets) {
		ctx.ui.notify("No sync setups are configured.", "warning");
		return false;
	}
	const active = typeof raw.activeTarget === "string" ? raw.activeTarget : undefined;
	let name = selectedName;
	if (!name) {
		const profiles = ownRecord(raw.profiles);
		const labels = new Map<string, string>();
		for (const candidate of Object.keys(targets).sort((left, right) => left.localeCompare(right))) {
			const target = ownRecord(targets[candidate]);
			const profileName = typeof target?.profile === "string" ? target.profile : undefined;
			const profile = profileName && profiles ? ownRecord(profiles[profileName]) : undefined;
			const location = profile
				? profile.kind === "webdav"
					? String(target?.path ?? "pi-sync")
					: profile.kind === "git"
						? String(target?.branch ?? "pi-sync")
						: String(target?.bucket ?? "missing bucket")
				: `invalid: missing connection ${profileName ?? "reference"}`;
			const label = `${safeTerminalText(candidate)}${candidate === active ? " (current)" : ""} · ${safeTerminalText(profileName ?? "unknown")} · ${safeTerminalText(location)}`;
			labels.set(label, candidate);
		}
		const selected = await ctx.ui.select(
			`Switch sync setup\n\nCurrent sync setup: ${safeTerminalText(active ?? "none")}`,
			[...labels.keys(), BACK],
		);
		if (!selected || selected === BACK) return false;
		name = labels.get(selected);
	}
	if (!name || !Object.hasOwn(targets, name)) {
		ctx.ui.notify(
			`Sync setup “${safeTerminalText(name ?? "unknown")}” no longer exists.`,
			"warning",
		);
		return false;
	}
	if (name === active) {
		ctx.ui.notify(`Sync setup “${safeTerminalText(name)}” is already current.`, "info");
		return false;
	}
	let config: AnySyncConfig;
	try {
		config = await loadConfig(name);
	} catch (error) {
		ctx.ui.notify(
			`Cannot use sync setup “${safeTerminalText(name)}”: ${safeTerminalText(errorMessage(error))}`,
			"error",
		);
		return false;
	}
	const targetSwitchAction = await loadTargetSwitchAction();
	const switchEffect =
		targetSwitchAction === "ask"
			? "After switching, pi-sync will ask whether to review a pull for this setup."
			: targetSwitchAction === "pull"
				? "After switching, pi-sync will check this setup and show exact changes before applying them."
				: "After switching, pi-sync will not pull or modify synced files.";
	const choice = await ctx.ui.select(
		[
			"Switch sync setup",
			"",
			`From: ${safeTerminalText(active ?? "none")}`,
			`To: ${safeTerminalText(name)}`,
			`Storage: ${backendStorageDescription(config)}`,
			`Included content: ${normalizeSyncFiles(config.syncFiles).length} built-in groups · ${config.extraFiles.length} extra files`,
			`Automatic sync: ${config.autoSync ? "On" : "Off"} · Sessions: ${config.syncSessions ? "On" : "Off"}`,
			"",
			switchEffect,
		].join("\n"),
		[`Switch to ${safeTerminalText(name)}`, "Cancel"],
	);
	if (choice !== `Switch to ${safeTerminalText(name)}`) return false;
	try {
		const result = await useSyncTarget(
			ctx,
			name,
			(selectedTarget) =>
				runCancellableOperation(
					ctx,
					`Pulling sync setup “${safeTerminalText(name)}”…`,
					"pull",
					runRoute,
					true,
					null,
					selectedTarget,
				),
			targetSwitchAction,
		);
		return result.pullApplied ? "pull-attempted" : "switched";
	} catch (error) {
		ctx.ui.notify(
			`Sync setup “${safeTerminalText(name)}” was not switched: ${safeTerminalText(errorMessage(error))}`,
			"error",
		);
		return false;
	}
}

async function showSyncSetupManager(
	ctx: ExtensionCommandContext,
	runRoute: RunRoute,
	signal?: AbortSignal,
) {
	return showSyncSetups(
		ctx,
		{
			add: async (setupSignal) => {
				await showAddTarget(ctx, setupSignal);
			},
			edit: async (name, setupSignal) => {
				await showEditTarget(ctx, name, setupSignal);
			},
			makeCurrent: async (name) => {
				const result = await showTargetSwitcher(ctx, runRoute, name);
				return result === "pull-attempted" ? "exit" : undefined;
			},
			remove: async (name) => {
				await showRemoveTarget(ctx, name);
			},
		},
		signal,
	);
}

async function showAddTarget(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	let raw = await readLocalConfigObject();
	if (!raw) return void ctx.ui.notify("Set up the first sync setup before adding another.", "info");
	if (raw.version !== 2) {
		const choice = await ctx.ui.select(
			[
				"Upgrade settings for multiple sync setups",
				"",
				"The existing storage location, unknown fields, and local sync state will be preserved.",
				"An exact private backup is created before the atomic conversion.",
			].join("\n"),
			["Upgrade settings", "Cancel"],
		);
		if (choice !== "Upgrade settings") return;
		const currentTarget = await requiredInput(ctx, "Name the existing sync setup", "default");
		if (!currentTarget) return;
		const currentProfile = await requiredInput(
			ctx,
			"Name the existing storage connection",
			"default",
		);
		if (!currentProfile) return;
		const migration = await migrateLegacySettings(currentTarget, currentProfile);
		ctx.ui.notify(
			`Upgraded pi-sync settings. Backup: ${safeTerminalText(migration.backupPath)}`,
			"info",
		);
		raw = migration.settings;
	}
	let profiles = ownRecord(raw.profiles) ?? {};
	const name = await requiredInput(ctx, "Name the new sync setup", "work");
	if (!name) return;
	const createConnection = "Add a new storage connection…";
	let profile = await ctx.ui.select("Choose a storage connection", [
		...Object.keys(profiles).sort(),
		createConnection,
		"Cancel",
	]);
	if (!profile || profile === "Cancel") return;
	if (profile === createConnection) {
		const previousNames = new Set(Object.keys(profiles));
		if (!(await showAddStorageConnection(ctx, signal))) return;
		if (signal?.aborted) return;
		raw = (await readLocalConfigObject()) ?? raw;
		profiles = ownRecord(raw.profiles) ?? {};
		profile = Object.keys(profiles).find((candidate) => !previousNames.has(candidate));
		if (!profile) return;
	}
	const storageKind = ownRecord(profiles[profile])?.kind;
	if (storageKind === "webdav") {
		const saved = await showAddWebDavTarget(ctx, name, profile, signal);
		if (signal?.aborted) return;
		if (saved) await refreshTargetCompletions();
		return;
	}
	if (storageKind === "git") {
		const saved = await showAddGitTarget(ctx, name, profile, signal);
		if (signal?.aborted) return;
		if (saved) await refreshTargetCompletions();
		return;
	}
	const location = await chooseAdditionalRemoteLocation(ctx, raw, profile, name);
	if (!location) return;
	const { bucket, prefix, namespace } = location;
	const preset = await ctx.ui.select("Choose included content", [
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
			"Review new sync setup",
			"",
			`Sync setup: ${safeTerminalText(name)}`,
			`Storage connection: ${safeTerminalText(profile)}`,
			`Bucket: ${safeTerminalText(bucket)}`,
			`Storage location: ${formatRemotePath(prefix, namespace)}`,
			"Bucket must already exist. pi-sync will not create it.",
			`Included content: ${syncFiles.length} built-in groups · Sessions: Off`,
			...(overlapsExistingTarget
				? [
						"Warning: this setup shares local content with another setup; only the current setup syncs automatically.",
					]
				: []),
			"Adding this setup does not sync or modify remote data.",
		].join("\n"),
		["Add sync setup", "Cancel"],
	);
	if (choice !== "Add sync setup") return;
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
	if (signal?.aborted) return;
	await refreshTargetCompletions();
	ctx.ui.notify(`Added sync setup “${safeTerminalText(name)}”.`, "info");
}

async function showEditTarget(ctx: ExtensionCommandContext, name: string, signal?: AbortSignal) {
	const partial = await loadPartialConfig(name);
	if (partial.settingsVersion !== 2 || !partial.target) {
		ctx.ui.notify("Upgrade settings before editing a named sync setup.", "info");
		return;
	}
	if (partial.storageKind === "webdav") {
		await showEditWebDavTarget(ctx, partial, signal);
		return;
	}
	if (partial.storageKind === "git") {
		await showEditGitTarget(ctx, partial, signal);
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
			`Review sync setup “${safeTerminalText(partial.target)}”`,
			"",
			`Bucket: ${safeTerminalText(partial.bucket ?? "missing")} → ${safeTerminalText(bucket)}`,
			`Prefix: ${safeTerminalText(partial.prefix ?? "pi-sync")} → ${safeTerminalText(prefix)}`,
			`Namespace: ${safeTerminalText(partial.profile ?? partial.target)} → ${safeTerminalText(namespace)}`,
			"Saving changes the future storage location only; it does not move or delete remote data.",
		].join("\n"),
		["Save sync setup", "Cancel"],
	);
	if (choice !== "Save sync setup") return;
	await updateSyncTarget(partial.target, (target) => ({ ...target, bucket, prefix, namespace }));
	ctx.ui.notify(`Saved sync setup “${safeTerminalText(partial.target)}”.`, "info");
}

async function showRemoveTarget(ctx: ExtensionCommandContext, name: string) {
	const confirmed = await ctx.ui.confirm(
		"Remove sync setup?",
		`Remove local sync setup “${safeTerminalText(name)}”? Remote data and history are not deleted.`,
	);
	if (!confirmed) return;
	await removeSyncTarget(name);
	await refreshTargetCompletions();
	ctx.ui.notify(
		`Removed sync setup “${safeTerminalText(name)}”; remote data was not deleted.`,
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
	const purpose = await ctx.ui.select("What will this sync setup be used for?", [
		"Personal / Home",
		"Work",
		"Custom",
		"Cancel",
	]);
	if (!purpose || purpose === "Cancel") return undefined;
	if (purpose === "Personal / Home") return "home";
	if (purpose === "Work") return "work";
	return requiredInput(ctx, "Name this sync setup", "default");
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
				"Choose storage location",
				"",
				`Suggested storage connection: ${profileName}`,
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
			"Choose storage location",
			"",
			`Suggested storage connection: ${profileName}`,
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
				`Storage location for “${safeTerminalText(targetName)}”`,
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
		`Storage location for “${safeTerminalText(targetName)}”\n\nSuggested path: ${formatRemotePath("pi-sync", targetName)}`,
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
		? await requiredInput(ctx, "Storage connection name", initialProfileName)
		: initialProfileName;
	if (!profileName) return undefined;
	const bucket = await requiredExistingBucket(ctx, "pi-sync");
	if (!bucket) return undefined;
	const prefix = await requiredInput(ctx, "Remote prefix", "pi-sync");
	if (!prefix) return undefined;
	const namespace = await requiredInput(ctx, "Remote namespace", targetName);
	return namespace ? { profileName, bucket, prefix, namespace } : undefined;
}
