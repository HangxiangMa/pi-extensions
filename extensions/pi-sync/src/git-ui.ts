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
	const profileName = await requiredInput(ctx, "Name this saved Git connection", "git", signal);
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
			"Review Git setup",
			"",
			`Target: ${safeTerminalText(targetName)}`,
			`Saved connection: ${safeTerminalText(profileName)} (Git)`,
			`Remote: ${safeGitRemote(remote)}`,
			`Owned branch: ${safeTerminalText(destination.branch)}`,
			`Remote directory: ${safeTerminalText(`${destination.directory}/profiles/${destination.namespace}/`)}`,
			`Synced content: ${DEFAULT_SYNC_FILES.length} built-in groups · Sessions: Off`,
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
			autoSync: true,
			syncFiles: [...DEFAULT_SYNC_FILES],
			syncSessions: false,
			extraFiles: [],
		},
	});
	if (signal?.aborted) return true;
	ctx.ui.notify(
		`Saved Git destination “${safeTerminalText(targetName)}”. Run /sync doctor.`,
		"info",
	);
	return true;
}

export async function showAddGitStorageProfile(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	const name = await requiredInput(ctx, "Name this saved Git connection", "git", signal);
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
		`Review saved connection\n\nName: ${safeTerminalText(name)}\nType: Git\nRemote: ${safeGitRemote(remote)}\nCredentials: existing Git/SSH authentication (not stored)`,
		["Add connection", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Add connection") return false;
	await addStorageProfile(name, { kind: "git", remote });
	if (signal?.aborted) return true;
	ctx.ui.notify(`Added saved connection “${safeTerminalText(name)}”.`, "info");
	return true;
}

export async function showEditGitStorageProfile(
	ctx: ExtensionCommandContext,
	name: string,
	profile: Record<string, unknown>,
	signal?: AbortSignal,
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
		`Review connection\n\nSaved connection: ${safeTerminalText(name)}\nRemote: ${safeGitRemote(remote)}\nChanging it does not move or delete remote history.`,
		["Save profile", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Save profile") return false;
	await updateStorageProfile(name, (current) => ({ ...current, kind: "git", remote }));
	if (signal?.aborted) return true;
	ctx.ui.notify(`Saved connection “${safeTerminalText(name)}”.`, "info");
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
		"Choose synced content",
		["Recommended Pi settings", "Minimal settings", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (!preset || preset === "Cancel") return false;
	const syncFiles =
		preset === "Minimal settings" ? ["settings.json", "AGENTS.md"] : [...DEFAULT_SYNC_FILES];
	const choice = await ctx.ui.select(
		`Review Git target\n\nTarget: ${safeTerminalText(name)}\nSaved connection: ${safeTerminalText(profile)}\nOwned branch: ${safeTerminalText(destination.branch)}\nRemote directory: ${safeTerminalText(`${destination.directory}/profiles/${destination.namespace}/`)}\nSynced content: ${syncFiles.length} built-in groups · Sessions: Off`,
		["Add target", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Add target") return false;
	await addSyncTarget(name, {
		profile,
		...destination,
		autoSync: true,
		syncFiles,
		syncSessions: false,
		extraFiles: [],
	});
	if (signal?.aborted) return true;
	ctx.ui.notify(`Added sync target “${safeTerminalText(name)}”.`, "info");
	return true;
}

export async function showEditGitTarget(
	ctx: ExtensionCommandContext,
	partial: PartialConfig,
	signal?: AbortSignal,
) {
	if (!partial.target) throw new Error("Git target is not configured.");
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
		`Review target “${safeTerminalText(targetName)}”\n\nBranch: ${safeTerminalText(partial.branch ?? "pi-sync")} → ${safeTerminalText(destination.branch)}\nDirectory: ${safeTerminalText(partial.directory ?? "pi-sync")} → ${safeTerminalText(destination.directory)}\nNamespace: ${safeTerminalText(partial.profile ?? targetName)} → ${safeTerminalText(destination.namespace)}\nSaving changes future sync destination only; it does not move or delete remote history.`,
		["Save target", "Cancel"],
		{ signal },
	);
	throwIfAborted(signal);
	if (choice !== "Save target") return false;
	await updateSyncTarget(targetName, (target) => ({ ...target, ...destination }));
	if (signal?.aborted) return true;
	ctx.ui.notify(`Saved target “${safeTerminalText(targetName)}”.`, "info");
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
