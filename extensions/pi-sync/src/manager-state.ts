import {
	activeLocalConfigPath,
	isCloudflareR2Endpoint,
	loadConfig,
	readLocalConfigObject,
	readStateForConfig,
} from "./config.js";
import { inspectLock, isStaleLock } from "./lock.js";
import { errorMessage, ownRecord, safeTerminalText } from "./manager-helpers.js";
import { syncIncludeSelection } from "./sync-policy.js";
import { countValidSyncSetups } from "./sync-setups-ui.js";
import type { AnySyncConfig } from "./types.js";

export const MAIN_MENU_ACTIONS = [
	"Sync now (recommended)",
	"Switch sync setup",
	"Status & changes",
	"Settings",
	"More…",
] as const;

export async function describeManagerState(
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
		const lock = await inspectLock();
		const liveLock = lock.status === "valid" && !isStaleLock(lock.lock);
		const recoverableLock =
			lock.status === "unreadable" || (lock.status === "valid" && isStaleLock(lock.lock));
		const selection = syncIncludeSelection(config.include);
		const noSyncedContent = config.include.length === 0;
		const syncState =
			liveLock || recoverableLock
				? undefined
				: await readStateForConfig(config).catch(() => undefined);
		const lastAppliedSnapshot =
			liveLock || recoverableLock
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
				`Current sync setup: ${safeTerminalText(config.setupName)}`,
				`Storage: ${backendStorageDescription(config)}`,
				`Included: ${selection.builtIns.length} built-in group${selection.builtIns.length === 1 ? "" : "s"} · ${selection.custom.length} extra path${selection.custom.length === 1 ? "" : "s"} · Sessions ${selection.sessions ? "on" : "off"}`,
				`Automatic sync: ${config.automatic ? "On" : "Off"}`,
				`Last applied: ${lastAppliedSnapshot}`,
				"Remote status: Not checked",
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

export function backendStorageDescription(config: AnySyncConfig) {
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
