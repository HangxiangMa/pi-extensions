import { BorderedLoader, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { setSyncSetupCompletions } from "./command.js";
import {
	activeLocalConfigPath,
	configuredSyncSetupNames,
	isCloudflareR2Endpoint,
	loadConfig,
	loadOnSwitch,
	loadPartialConfig,
	localConfigPath,
	readLocalConfigObject,
	readStateForConfig,
} from "./config.js";
import { showAddGitTarget, showEditGitTarget, showGitSetup } from "./git-ui.js";
import { inspectLock, isStaleLock } from "./lock.js";
import {
	errorMessage,
	ownRecord,
	requiredExistingBucket,
	requiredInput,
	safeTerminalText,
} from "./manager-helpers.js";
import { chooseS3Credentials } from "./s3-credentials-ui.js";
import {
	addSyncSetup,
	removeSyncSetup,
	saveNewV3Settings,
	updateSyncSetup,
} from "./settings-management.js";
import { showSyncSettings } from "./settings-ui.js";
import { type SetupPullOutcome, useSyncSetup } from "./setup-switch.js";
import { showAddStorageConnection, showStorageConnections } from "./storage-connections-ui.js";
import { DEFAULT_SYNC_INCLUDE, syncIncludeSelection } from "./sync-policy.js";
import { countValidSyncSetups, showSyncSetups } from "./sync-setups-ui.js";
import type { AnySyncConfig } from "./types.js";
import { showAddWebDavTarget, showEditWebDavTarget, showWebDavSetup } from "./webdav-ui.js";

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
) => Promise<SetupPullOutcome | undefined>;

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
		) {
			case "Sync now (recommended)":
				await runCancellableOperation(ctx, "Checking current sync setup…", "sync", runRoute, true);
				break;
			case "Switch sync setup": {
				const result = await showSetupSwitcher(ctx, runRoute, undefined, sessionSignal);
				if (result === "pull-attempted") return;
				if (result === "switched") continue;
				break;
			}
			case "Status & changes":
				await runCancellableOperation(ctx, "Checking current sync setup…", "diff", runRoute);
				break;
			case "Settings":
				await showSyncSettings(ctx, runRoute, sessionSignal);
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
	let routeResult: SetupPullOutcome | undefined;
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
		return {
			title: [
				"Manage sync",
				"",
				"Settings file needs repair. Automatic sync and settings writes are paused.",
				`Error: ${safeTerminalText(errorMessage(error))}`,
				`File: ${safeTerminalText(await activeLocalConfigPath())}`,
				"",
				"Repair the JSON file, then reopen /sync.",
			].join("\n"),
			actions: ["Help"],
		};
	}
	if (!raw) {
		return {
			title: ["Manage sync", "", "Not set up.", "", "What do you want to do?"].join("\n"),
			actions: ["Set up sync", "Help"],
		};
	}
	const configuredTargets = ownRecord(raw.syncSetups);
	if (raw.version === 3 && configuredTargets && Object.keys(configuredTargets).length === 0) {
		return {
			title: [
				"Manage sync",
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
		const target = config.setupName;
		const storage = backendStorageDescription(config);
		const warnings: string[] = [];
		const lock = await inspectLock();
		const liveLock = lock.status === "valid" && !isStaleLock(lock.lock);
		const recoverableLock =
			lock.status === "unreadable" || (lock.status === "valid" && isStaleLock(lock.lock));
		const selection = syncIncludeSelection(config.include);
		const builtInCount = selection.builtIns.length;
		const extraFileCount = selection.custom.length;
		const noSyncedContent = config.include.length === 0;
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
				"Manage sync",
				"",
				`Current sync setup: ${safeTerminalText(target)}`,
				`Storage: ${storage}`,
				`Included: ${builtInCount} built-in group${builtInCount === 1 ? "" : "s"} · ${extraFileCount} extra path${extraFileCount === 1 ? "" : "s"} · Sessions ${selection.sessions ? "on" : "off"}`,
				`Automatic sync: ${config.automatic ? "On" : "Off"}`,
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
				"Manage sync",
				"",
				"Settings need attention. Automatic sync is paused.",
				`Current sync setup: ${safeTerminalText(typeof raw.activeSyncSetup === "string" ? raw.activeSyncSetup : "none")}`,
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
	const connection = safeTerminalText(config.connectionName);
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
	if (ctx.mode !== "tui") {
		ctx.ui.notify(
			`Guided sync setup requires TUI mode for masked credential input. Create version 3 settings in ${safeTerminalText(localConfigPath())}.`,
			"warning",
		);
		return false;
	}
	const preset = await ctx.ui.select(
		"Set up sync\n\nWhere will Pi settings be stored?",
		["Cloudflare R2", "Other S3-compatible storage", "WebDAV", "Git", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || !preset || preset === "Cancel") return false;
	const targetName = await chooseInitialTargetName(ctx, signal);
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
		signal,
	);
	if (!endpoint) return false;
	let region = "auto";
	if (preset !== "Cloudflare R2") {
		const selectedRegion = await requiredInput(ctx, "Storage region", "us-east-1", signal);
		if (!selectedRegion) return false;
		region = selectedRegion;
	}
	const location = await chooseInitialRemoteLocation(ctx, preset, targetName, signal);
	if (!location) return false;
	const { connectionName, bucket, path: storagePath } = location;
	const credentials = await chooseS3Credentials(ctx, signal);
	if (!credentials) return false;
	const contentChoice = await ctx.ui.select(
		"Choose an initial sync preset",
		["Recommended Pi settings", "Minimal settings", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || !contentChoice || contentChoice === "Cancel") return false;
	const syncFiles =
		contentChoice === "Minimal settings"
			? ["settings.json", "AGENTS.md"]
			: [...DEFAULT_SYNC_INCLUDE];
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
			`Storage connection: ${safeTerminalText(connectionName)} (${preset})`,
			`Endpoint: ${safeTerminalText(endpoint)}`,
			`Bucket: ${safeTerminalText(bucket)}`,
			`Storage location: ${safeTerminalText(storagePath)}`,
			"Bucket must already exist. pi-sync will not create it.",
			`Included content: ${syncFiles.length} built-in groups · Sessions: ${syncSessions ? "On — privacy warning acknowledged" : "Off"}`,
			`Automatic sync: ${autoSync ? "On" : "Off"}`,
			`Credentials: ${safeTerminalText(credentials.summary)}`,
		].join("\n"),
		["Save sync setup", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || choice !== "Save sync setup") return false;
	await saveNewV3Settings({
		setupName: targetName,
		connectionName,
		connection: {
			type: "s3",
			endpoint,
			region,
			credentials: {
				accessKeyId: credentials.profileFields.accessKeyId ?? "",
				secretAccessKey: credentials.profileFields.secretAccessKey ?? "",
			},
		},
		setup: {
			storage: { connection: connectionName, bucket, path: storagePath },
			sync: {
				include: [...syncFiles, ...(syncSessions ? ["sessions"] : [])],
				automatic: autoSync,
			},
		},
	});
	if (signal?.aborted) return false;
	await refreshTargetCompletions();
	if (signal?.aborted) return true;
	ctx.ui.notify(
		credentials.ready
			? `Sync setup “${safeTerminalText(targetName)}” is ready. Use Sync now when ready.`
			: `Saved sync setup “${safeTerminalText(targetName)}”; add credentials before syncing.`,
		"info",
	);
	return true;
}

async function showSetupSwitcher(
	ctx: ExtensionCommandContext,
	runRoute: RunRoute,
	selectedName?: string,
	signal?: AbortSignal,
) {
	const raw = await readLocalConfigObject();
	if (signal?.aborted) return false;
	if (raw?.version !== 3) {
		ctx.ui.notify("Add a second sync setup before switching setups.", "info");
		return false;
	}
	const targets = ownRecord(raw.syncSetups);
	if (!targets) {
		ctx.ui.notify("No sync setups are configured.", "warning");
		return false;
	}
	const active = typeof raw.activeSyncSetup === "string" ? raw.activeSyncSetup : undefined;
	let name = selectedName;
	if (!name) {
		const profiles = ownRecord(raw.storageConnections);
		const labels = new Map<string, string>();
		for (const candidate of Object.keys(targets).sort((left, right) => left.localeCompare(right))) {
			const target = ownRecord(targets[candidate]);
			const storage = ownRecord(target?.storage);
			const profileName = typeof storage?.connection === "string" ? storage.connection : undefined;
			const profile = profileName && profiles ? ownRecord(profiles[profileName]) : undefined;
			const location = profile
				? profile.type === "git"
					? `${String(storage?.branch ?? "missing branch")}:${String(storage?.path ?? "missing path")}`
					: profile.type === "s3"
						? `${String(storage?.bucket ?? "missing bucket")}/${String(storage?.path ?? "missing path")}`
						: String(storage?.path ?? "missing path")
				: `invalid: missing connection ${profileName ?? "reference"}`;
			const label = `${safeTerminalText(candidate)}${candidate === active ? " (current)" : ""} · ${safeTerminalText(profileName ?? "unknown")} · ${safeTerminalText(location)}`;
			labels.set(label, candidate);
		}
		const selected = await ctx.ui.select(
			`Switch sync setup\n\nCurrent sync setup: ${safeTerminalText(active ?? "none")}`,
			[...labels.keys(), BACK],
			{ signal },
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
		if (signal?.aborted) return false;
	} catch (error) {
		ctx.ui.notify(
			`Cannot use sync setup “${safeTerminalText(name)}”: ${safeTerminalText(errorMessage(error))}`,
			"error",
		);
		return false;
	}
	const onSwitch = await loadOnSwitch();
	if (signal?.aborted) return false;
	const switchEffect =
		onSwitch === "ask-before-pull"
			? "After switching, pi-sync will ask whether to review a pull for this setup."
			: onSwitch === "pull-after-switch"
				? "After switching, pi-sync will check this setup and show exact changes before applying them."
				: "After switching, pi-sync will not pull or modify synced files.";
	const choice = await ctx.ui.select(
		[
			"Switch sync setup",
			"",
			`From: ${safeTerminalText(active ?? "none")}`,
			`To: ${safeTerminalText(name)}`,
			`Storage: ${backendStorageDescription(config)}`,
			`Included content: ${config.include.length} paths`,
			`Automatic sync: ${config.automatic ? "On" : "Off"} · Sessions: ${config.include.includes("sessions") ? "On" : "Off"}`,
			"",
			switchEffect,
		].join("\n"),
		[`Switch to ${safeTerminalText(name)}`, "Cancel"],
		{ signal },
	);
	if (signal?.aborted || choice !== `Switch to ${safeTerminalText(name)}`) return false;
	try {
		const result = await useSyncSetup(
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
			onSwitch,
			signal,
		);
		return result.pullApplied ? "pull-attempted" : "switched";
	} catch (error) {
		if (signal?.aborted) return false;
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
			makeCurrent: async (name, setupSignal) => {
				const result = await showSetupSwitcher(ctx, runRoute, name, setupSignal);
				return result === "pull-attempted" ? "exit" : undefined;
			},
			remove: async (name, setupSignal) => {
				await showRemoveTarget(ctx, name, setupSignal);
			},
		},
		signal,
	);
}

async function showAddTarget(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	let raw = await readLocalConfigObject();
	if (signal?.aborted) return;
	if (!raw) return void ctx.ui.notify("Set up the first sync setup before adding another.", "info");
	if (raw.version !== 3) {
		ctx.ui.notify(
			"Version 1 and version 2 settings are unsupported and are never migrated.",
			"error",
		);
		return;
	}
	let profiles = ownRecord(raw.storageConnections) ?? {};
	const name = await requiredInput(ctx, "Name the new sync setup", "work", signal);
	if (!name) return;
	const createConnection = "Add a new storage connection…";
	let profile = await ctx.ui.select(
		"Choose a storage connection",
		[...Object.keys(profiles).sort(), createConnection, "Cancel"],
		{ signal },
	);
	if (!profile || profile === "Cancel") return;
	if (profile === createConnection) {
		const previousNames = new Set(Object.keys(profiles));
		if (!(await showAddStorageConnection(ctx, signal))) return;
		if (signal?.aborted) return;
		raw = (await readLocalConfigObject()) ?? raw;
		if (signal?.aborted) return;
		profiles = ownRecord(raw.storageConnections) ?? {};
		profile = Object.keys(profiles).find((candidate) => !previousNames.has(candidate));
		if (!profile) return;
	}
	const storageKind = ownRecord(profiles[profile])?.type;
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
	const location = await chooseAdditionalRemoteLocation(ctx, raw, profile, name, signal);
	if (!location) return;
	const { bucket, path: storagePath } = location;
	const preset = await ctx.ui.select(
		"Choose included content",
		["Recommended Pi settings", "Minimal settings", "Cancel"],
		{ signal },
	);
	if (!preset || preset === "Cancel") return;
	const syncFiles =
		preset === "Minimal settings" ? ["settings.json", "AGENTS.md"] : [...DEFAULT_SYNC_INCLUDE];
	const overlapsExistingTarget = Object.values(ownRecord(raw.syncSetups) ?? {}).some((value) => {
		const existing = ownRecord(value);
		const sync = ownRecord(existing?.sync);
		const selected = syncIncludeSelection(
			Array.isArray(sync?.include) ? sync.include : [],
		).builtIns;
		return selected.some((item) => syncFiles.includes(item));
	});
	const choice = await ctx.ui.select(
		[
			"Review new sync setup",
			"",
			`Sync setup: ${safeTerminalText(name)}`,
			`Storage connection: ${safeTerminalText(profile)}`,
			`Bucket: ${safeTerminalText(bucket)}`,
			`Storage location: ${safeTerminalText(storagePath)}`,
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
		{ signal },
	);
	if (signal?.aborted || choice !== "Add sync setup") return;
	await addSyncSetup(name, {
		storage: { connection: profile, bucket, path: storagePath },
		sync: { include: syncFiles, automatic: true },
	});
	if (signal?.aborted) return;
	await refreshTargetCompletions();
	ctx.ui.notify(`Added sync setup “${safeTerminalText(name)}”.`, "info");
}

async function showEditTarget(ctx: ExtensionCommandContext, name: string, signal?: AbortSignal) {
	const partial = await loadPartialConfig(name);
	if (signal?.aborted) return;
	if (!partial.setupName) {
		ctx.ui.notify("Create version 3 settings before editing a named sync setup.", "info");
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
	const bucket = await requiredInput(ctx, "Bucket", partial.bucket ?? "pi-sync", signal);
	if (!bucket) return;
	const storagePath = await requiredInput(ctx, "Storage path", partial.storagePath, signal);
	if (!storagePath) return;
	const normalizedPath = storagePath.replace(/^\/+|\/+$/gu, "");
	const choice = await ctx.ui.select(
		[
			`Review sync setup “${safeTerminalText(partial.setupName)}”`,
			"",
			`Bucket: ${safeTerminalText(partial.bucket ?? "missing")} → ${safeTerminalText(bucket)}`,
			`Storage path: ${safeTerminalText(partial.storagePath ?? "missing")} → ${safeTerminalText(normalizedPath)}`,
			"Saving changes the future storage location only; it does not move or delete remote data.",
		].join("\n"),
		["Save sync setup", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || choice !== "Save sync setup") return;
	await updateSyncSetup(partial.setupName, (setup) => {
		if (typeof setup.storage.bucket !== "string") {
			throw new Error("Sync setup storage type changed; reopen it.");
		}
		return {
			...setup,
			storage: { ...setup.storage, bucket, path: normalizedPath },
		};
	});
	if (signal?.aborted) return;
	ctx.ui.notify(`Saved sync setup “${safeTerminalText(partial.setupName)}”.`, "info");
}

async function showRemoveTarget(ctx: ExtensionCommandContext, name: string, signal?: AbortSignal) {
	const confirmed = await ctx.ui.confirm(
		"Remove sync setup?",
		`Remove local sync setup “${safeTerminalText(name)}”? Remote data and history are not deleted.`,
		{ signal },
	);
	if (signal?.aborted || !confirmed) return;
	await removeSyncSetup(name);
	if (signal?.aborted) return;
	await refreshTargetCompletions();
	ctx.ui.notify(
		`Removed sync setup “${safeTerminalText(name)}”; remote data was not deleted.`,
		"info",
	);
}

async function refreshTargetCompletions() {
	setSyncSetupCompletions(await configuredSyncSetupNames());
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
	connectionName: string;
	bucket: string;
	path: string;
}

async function chooseInitialTargetName(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	const purpose = await ctx.ui.select(
		"What will this sync setup be used for?",
		["Personal / Home", "Work", "Custom", "Cancel"],
		{ signal },
	);
	if (!purpose || purpose === "Cancel") return undefined;
	if (purpose === "Personal / Home") return "home";
	if (purpose === "Work") return "work";
	return requiredInput(ctx, "Name this sync setup", "default", signal);
}

async function chooseInitialRemoteLocation(
	ctx: ExtensionCommandContext,
	preset: string,
	setupName: string,
	signal?: AbortSignal,
): Promise<ChosenRemoteLocation | undefined> {
	const connectionName = preset === "Cloudflare R2" ? "r2" : "s3";
	const suggested = {
		connectionName,
		bucket: "pi-sync",
		path: `pi-sync/${setupName}`,
	};
	if (preset === "Cloudflare R2") {
		const choice = await ctx.ui.select(
			[
				"Choose storage location",
				"",
				`Suggested storage connection: ${connectionName}`,
				`Suggested bucket: ${suggested.bucket}`,
				`Remote path: ${safeTerminalText(suggested.path)}`,
				"Bucket must already exist. pi-sync will not create it.",
			].join("\n"),
			["Use suggested location (recommended)", "Customize remote location", "Cancel"],
			{ signal },
		);
		if (!choice || choice === "Cancel") return undefined;
		if (choice === "Use suggested location (recommended)") return suggested;
		return chooseCustomRemoteLocation(ctx, setupName, connectionName, true, signal);
	}

	const choice = await ctx.ui.select(
		[
			"Choose storage location",
			"",
			`Suggested storage connection: ${connectionName}`,
			`Suggested path: ${safeTerminalText(suggested.path)}`,
			"S3 bucket names may need to be globally unique and the bucket must already exist.",
		].join("\n"),
		[
			"Use existing bucket with suggested path (recommended)",
			"Customize remote location",
			"Cancel",
		],
		{ signal },
	);
	if (!choice || choice === "Cancel") return undefined;
	if (choice === "Customize remote location") {
		return chooseCustomRemoteLocation(ctx, setupName, connectionName, true, signal);
	}
	const bucket = await requiredExistingBucket(ctx, "pi-sync-your-name", signal);
	return bucket ? { ...suggested, bucket } : undefined;
}

async function chooseAdditionalRemoteLocation(
	ctx: ExtensionCommandContext,
	settings: Record<string, unknown>,
	connectionName: string,
	setupName: string,
	signal?: AbortSignal,
): Promise<Omit<ChosenRemoteLocation, "connectionName"> | undefined> {
	const setups = ownRecord(settings.syncSetups) ?? {};
	const currentSetup =
		typeof settings.activeSyncSetup === "string" ? settings.activeSyncSetup : undefined;
	const candidates = Object.entries(setups)
		.map(([name, value]) => ({ name, storage: ownRecord(ownRecord(value)?.storage) }))
		.filter(
			(item): item is { name: string; storage: Record<string, unknown> } =>
				item.storage?.connection === connectionName && typeof item.storage.bucket === "string",
		);
	const source =
		candidates.find((item) => item.name === currentSetup) ??
		candidates.sort((left, right) => left.name.localeCompare(right.name))[0];
	if (source) {
		const sourcePath =
			typeof source.storage.path === "string" ? source.storage.path : "pi-sync/home";
		const sourceParent = sourcePath.includes("/")
			? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
			: "pi-sync";
		const suggestedPath = `${sourceParent}/${setupName}`;
		const sameBucketLabel = `Same bucket as “${safeTerminalText(source.name)}” (recommended)`;
		const choice = await ctx.ui.select(
			[
				`Storage location for “${safeTerminalText(setupName)}”`,
				"",
				`Recommended bucket: ${safeTerminalText(String(source.storage.bucket))}`,
				`Remote path: ${safeTerminalText(suggestedPath)}`,
				"The complete path and local sync state remain separate.",
			].join("\n"),
			[sameBucketLabel, "Use a different bucket", "Customize remote location", "Cancel"],
			{ signal },
		);
		if (!choice || choice === "Cancel") return undefined;
		if (choice === sameBucketLabel) {
			return { bucket: String(source.storage.bucket), path: suggestedPath };
		}
		if (choice === "Use a different bucket") {
			const bucket = await requiredExistingBucket(ctx, "pi-sync", signal);
			return bucket ? { bucket, path: `pi-sync/${setupName}` } : undefined;
		}
		const custom = await chooseCustomRemoteLocation(ctx, setupName, connectionName, false, signal);
		return custom ? { bucket: custom.bucket, path: custom.path } : undefined;
	}

	const connectionSettings = ownRecord(ownRecord(settings.storageConnections)?.[connectionName]);
	const isR2 = isCloudflareR2Endpoint(String(connectionSettings?.endpoint ?? ""));
	const suggestedPath = `pi-sync/${setupName}`;
	const suggestedLabel = isR2
		? "Use suggested location (recommended)"
		: "Use existing bucket with suggested path (recommended)";
	const choice = await ctx.ui.select(
		`Storage location for “${safeTerminalText(setupName)}”\n\nSuggested path: ${safeTerminalText(suggestedPath)}`,
		[suggestedLabel, "Customize remote location", "Cancel"],
		{ signal },
	);
	if (!choice || choice === "Cancel") return undefined;
	if (choice === "Customize remote location") {
		const custom = await chooseCustomRemoteLocation(ctx, setupName, connectionName, false, signal);
		return custom ? { bucket: custom.bucket, path: custom.path } : undefined;
	}
	if (isR2) return { bucket: "pi-sync", path: suggestedPath };
	const bucket = await requiredExistingBucket(ctx, "pi-sync-your-name", signal);
	return bucket ? { bucket, path: suggestedPath } : undefined;
}

async function chooseCustomRemoteLocation(
	ctx: ExtensionCommandContext,
	setupName: string,
	initialConnectionName: string,
	customizeConnectionName: boolean,
	signal?: AbortSignal,
): Promise<ChosenRemoteLocation | undefined> {
	const connectionName = customizeConnectionName
		? await requiredInput(ctx, "Storage connection name", initialConnectionName, signal)
		: initialConnectionName;
	if (!connectionName) return undefined;
	const bucket = await requiredExistingBucket(ctx, "pi-sync", signal);
	if (!bucket) return undefined;
	const storagePath = await requiredInput(ctx, "Storage path", `pi-sync/${setupName}`, signal);
	if (!storagePath) return undefined;
	return { connectionName, bucket, path: storagePath.replace(/^\/+|\/+$/gu, "") };
}
