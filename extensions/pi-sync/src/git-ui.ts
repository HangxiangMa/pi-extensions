import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	normalizeGitBranch,
	normalizeGitDirectory,
	normalizeGitRemote,
	validateGitNamespace,
} from "./git-config.js";
import { requiredInput, safeTerminalText } from "./manager-helpers.js";
import {
	addStorageProfile,
	addSyncTarget,
	saveNewV2Settings,
	updateStorageProfile,
	updateSyncTarget,
} from "./settings-management.js";
import { DEFAULT_SYNC_FILES } from "./sync-policy.js";
import type { PartialConfig } from "./types.js";

export async function showGitSetup(
	ctx: ExtensionCommandContext,
	targetName: string,
	signal?: AbortSignal,
) {
	const profileName = await requiredInput(ctx, "Name this Git storage connection", "git", signal);
	if (!profileName) return false;
	const remoteInput = await requiredInput(
		ctx,
		"Git SSH or HTTPS remote",
		"git@github.com:owner/private-pi-sync.git",
		signal,
	);
	if (!remoteInput) return false;
	const destination = await promptGitDestination(ctx, targetName, signal);
	if (!destination) return false;
	const automatic = await ctx.ui.select(
		"Automatic sync for this setup",
		["Enable automatic sync", "Keep automatic sync off", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (!automatic || automatic === "Cancel") return false;
	let remote: string | undefined;
	try {
		remote = normalizeGitRemote(remoteInput);
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return false;
	}
	if (!remote) return false;
	const choice = await ctx.ui.select(
		[
			"Review Git sync setup",
			"",
			`Sync setup: ${safeTerminalText(targetName)}`,
			`Storage connection: ${safeTerminalText(profileName)} (Git)`,
			`Remote: ${safeGitRemote(remote)}`,
			`Owned branch: ${safeTerminalText(destination.branch)}`,
			`Storage location: ${safeTerminalText(`${destination.directory}/profiles/${destination.namespace}/`)}`,
			`Included content: ${DEFAULT_SYNC_FILES.length} built-in groups · Sessions: Off`,
			`Automatic sync: ${automatic === "Enable automatic sync" ? "On" : "Off"}`,
			"Authentication: existing non-interactive Git/SSH credentials; no credentials are stored by pi-sync.",
			"The remote repository must already exist. The owned branch may be created on first push.",
		].join("\n"),
		["Save setup", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Save setup") return false;
	await saveNewV2Settings({
		targetName,
		storageProfileName: profileName,
		profile: { kind: "git", remote },
		target: {
			...destination,
			autoSync: automatic === "Enable automatic sync",
			syncFiles: [...DEFAULT_SYNC_FILES],
			syncSessions: false,
			extraFiles: [],
		},
	});
	if (signal?.aborted) return true;
	ctx.ui.notify(
		`Saved Git sync setup “${safeTerminalText(targetName)}”. Run /sync doctor.`,
		"info",
	);
	return true;
}

export async function showAddGitStorageProfile(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	const name = await requiredInput(ctx, "Name this Git storage connection", "git", signal);
	if (!name) return false;
	const remoteInput = await requiredInput(
		ctx,
		"Git SSH or HTTPS remote",
		"git@github.com:owner/private-pi-sync.git",
		signal,
	);
	if (!remoteInput) return false;
	let remote: string | undefined;
	try {
		remote = normalizeGitRemote(remoteInput);
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return false;
	}
	if (!remote) return false;
	const choice = await ctx.ui.select(
		`Review storage connection\n\nName: ${safeTerminalText(name)}\nType: Git\nRemote: ${safeGitRemote(remote)}\nCredentials: existing Git/SSH authentication (not stored)\nAdding a connection does not contact the remote or start syncing.`,
		["Add storage connection", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Add storage connection") return false;
	await addStorageProfile(name, { kind: "git", remote });
	if (signal?.aborted) return true;
	ctx.ui.notify(`Added storage connection “${safeTerminalText(name)}”.`, "info");
	return true;
}

export async function showEditGitStorageProfile(
	ctx: ExtensionCommandContext,
	name: string,
	profile: Record<string, unknown>,
	signal?: AbortSignal,
	affectedSetups?: string[],
) {
	const remoteInput = await requiredInput(
		ctx,
		"Git SSH or HTTPS remote",
		typeof profile.remote === "string"
			? profile.remote
			: "git@github.com:owner/private-pi-sync.git",
		signal,
	);
	if (!remoteInput) return false;
	let remote: string | undefined;
	try {
		remote = normalizeGitRemote(remoteInput);
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return false;
	}
	if (!remote) return false;
	const choice = await ctx.ui.select(
		`Review storage connection\n\nStorage connection: ${safeTerminalText(name)}\nRemote: ${safeGitRemote(String(profile.remote ?? "missing"))} → ${safeGitRemote(remote)}\nAffected sync setups: ${affectedSetups && affectedSetups.length > 0 ? affectedSetups.map(safeTerminalText).join(", ") : "None"}\nSaving changes future storage access for every affected setup; it does not move or delete remote history.`,
		["Save storage connection", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Save storage connection") return false;
	await updateStorageProfile(
		name,
		(current) => ({ ...current, kind: "git", remote }),
		affectedSetups,
	);
	if (signal?.aborted) return true;
	ctx.ui.notify(`Saved storage connection “${safeTerminalText(name)}”.`, "info");
	return true;
}

export async function showAddGitTarget(
	ctx: ExtensionCommandContext,
	name: string,
	profile: string,
	signal?: AbortSignal,
) {
	const destination = await promptGitDestination(ctx, name, signal);
	if (!destination) return false;
	const preset = await ctx.ui.select(
		"Choose included content",
		["Recommended Pi settings", "Minimal settings", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (!preset || preset === "Cancel") return false;
	const syncFiles =
		preset === "Minimal settings" ? ["settings.json", "AGENTS.md"] : [...DEFAULT_SYNC_FILES];
	const automatic = await ctx.ui.select(
		"Automatic sync for this setup",
		["Enable automatic sync", "Keep automatic sync off", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (!automatic || automatic === "Cancel") return false;
	const choice = await ctx.ui.select(
		`Review Git sync setup\n\nSync setup: ${safeTerminalText(name)}\nStorage connection: ${safeTerminalText(profile)}\nOwned branch: ${safeTerminalText(destination.branch)}\nStorage location: ${safeTerminalText(`${destination.directory}/profiles/${destination.namespace}/`)}\nIncluded content: ${syncFiles.length} built-in groups · Sessions: Off\nAutomatic sync: ${automatic === "Enable automatic sync" ? "On" : "Off"}`,
		["Add sync setup", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Add sync setup") return false;
	await addSyncTarget(name, {
		profile,
		...destination,
		autoSync: automatic === "Enable automatic sync",
		syncFiles,
		syncSessions: false,
		extraFiles: [],
	});
	if (signal?.aborted) return true;
	ctx.ui.notify(`Added sync setup “${safeTerminalText(name)}”.`, "info");
	return true;
}

export async function showEditGitTarget(
	ctx: ExtensionCommandContext,
	partial: PartialConfig,
	signal?: AbortSignal,
) {
	if (!partial.target) throw new Error("Git sync setup is not configured.");
	const targetName = partial.target;
	const destination = await promptGitDestination(ctx, targetName, signal, partial);
	if (!destination) return false;
	const currentBranch = normalizeGitBranch(partial.branch);
	const currentDirectory = normalizeGitDirectory(partial.directory);
	const currentNamespace = partial.profile ?? targetName;
	const treeLocationChanged =
		destination.directory !== currentDirectory || destination.namespace !== currentNamespace;
	if (treeLocationChanged && destination.branch === currentBranch) {
		ctx.ui.notify(
			"Choose a new owned branch when changing the Git directory or namespace; pi-sync does not move existing remote history.",
			"error",
		);
		return false;
	}
	const choice = await ctx.ui.select(
		`Review sync setup “${safeTerminalText(targetName)}”\n\nBranch: ${safeTerminalText(partial.branch ?? "pi-sync")} → ${safeTerminalText(destination.branch)}\nDirectory: ${safeTerminalText(partial.directory ?? "pi-sync")} → ${safeTerminalText(destination.directory)}\nNamespace: ${safeTerminalText(partial.profile ?? targetName)} → ${safeTerminalText(destination.namespace)}\nSaving changes the future storage location only; it does not move or delete remote history.`,
		["Save sync setup", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Save sync setup") return false;
	await updateSyncTarget(targetName, (target) => ({ ...target, ...destination }));
	if (signal?.aborted) return true;
	ctx.ui.notify(`Saved sync setup “${safeTerminalText(targetName)}”.`, "info");
	return true;
}

async function promptGitDestination(
	ctx: ExtensionCommandContext,
	targetName: string,
	signal?: AbortSignal,
	current: PartialConfig = {},
) {
	const branchInput = await requiredInput(
		ctx,
		"Owned Git branch",
		current.branch ?? `pi-sync/${targetName}`,
		signal,
	);
	if (!branchInput) return undefined;
	const directoryInput = await requiredInput(
		ctx,
		"Git repository directory",
		current.directory ?? "pi-sync",
		signal,
	);
	if (!directoryInput) return undefined;
	const namespace = await requiredInput(
		ctx,
		"Remote namespace",
		current.profile ?? targetName,
		signal,
	);
	if (!namespace) return undefined;
	try {
		const branch = normalizeGitBranch(branchInput);
		const directory = normalizeGitDirectory(directoryInput);
		validateGitNamespace(namespace);
		return { branch, directory, namespace };
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return undefined;
	}
}

function throwIfAborted(signal?: AbortSignal) {
	if (!signal?.aborted) return;
	throw signal.reason instanceof Error
		? signal.reason
		: new DOMException("The operation was aborted", "AbortError");
}

function safeGitRemote(remote: string) {
	try {
		const url = new URL(remote);
		return safeTerminalText(`${url.protocol}//${url.host}${url.pathname}`);
	} catch {
		return safeTerminalText(remote);
	}
}
