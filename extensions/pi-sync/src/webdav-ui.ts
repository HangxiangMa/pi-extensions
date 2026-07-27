import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	localConfigPath,
	normalizeWebDavPath,
	normalizeWebDavUrl,
	validateWebDavCredentials,
	validateWebDavNamespace,
} from "./config.js";
import {
	addStorageProfile,
	addSyncTarget,
	saveNewV2Settings,
	updateStorageProfile,
	updateSyncTarget,
} from "./settings-management.js";
import { DEFAULT_SYNC_FILES } from "./sync-policy.js";
import type { PartialConfig } from "./types.js";

export async function showWebDavSetup(ctx: ExtensionCommandContext, targetName: string) {
	const url = await requiredInput(
		ctx,
		"WebDAV collection URL",
		"https://cloud.example.com/remote.php/dav/files/user",
	);
	if (!url) return false;
	const username = await requiredInput(ctx, "WebDAV username", "user");
	if (!username) return false;
	const location = await chooseDestination(ctx, targetName);
	if (!location) return false;
	const connection = validateConnection(ctx, url, username);
	const destination = validateDestination(ctx, location.path, location.namespace);
	if (!connection || !destination) return false;
	const content = await chooseContent(ctx);
	if (!content) return false;
	const automatic = await ctx.ui.select("Automatic sync for this target", [
		"Enable automatic sync",
		"Keep automatic sync off",
		"Cancel",
	]);
	if (!automatic || automatic === "Cancel") return false;
	const sessions = await chooseSessions(ctx);
	if (sessions === undefined) return false;
	const profileName = "webdav";
	const review = await ctx.ui.select(
		[
			"Review WebDAV setup",
			"",
			`Target: ${safe(targetName)}`,
			`Storage profile: ${profileName} (WebDAV)`,
			`URL: ${displayUrl(connection.url)}`,
			`Remote path: ${safe(`${destination.path}/profiles/${destination.namespace}/`)}`,
			"Username: stored in the private settings file (value hidden)",
			`Password: add it privately in ${safe(localConfigPath())}; pi-sync never requests secrets in an unmasked dialog.`,
			`Conditional writes: /sync doctor verifies atomic If-Match and If-None-Match support before publication.`,
			`Synced content: ${content.length} built-in groups · Sessions: ${sessions ? "On — privacy warning acknowledged" : "Off"}`,
			`Auto-sync: ${automatic === "Enable automatic sync" ? "On" : "Off"}`,
		].join("\n"),
		["Save setup", "Cancel"],
	);
	if (review !== "Save setup") return false;
	await saveNewV2Settings({
		targetName,
		storageProfileName: profileName,
		profile: { kind: "webdav", ...connection },
		target: {
			profile: profileName,
			path: destination.path,
			namespace: destination.namespace,
			autoSync: automatic === "Enable automatic sync",
			syncFiles: content,
			syncSessions: sessions,
			extraFiles: [],
		},
	});
	ctx.ui.notify(
		`Saved target “${safe(targetName)}”; add the WebDAV password in ${safe(localConfigPath())} before syncing.`,
		"info",
	);
	return true;
}

export async function showAddWebDavTarget(
	ctx: ExtensionCommandContext,
	name: string,
	profile: string,
) {
	const location = await chooseDestination(ctx, name);
	if (!location) return false;
	const destination = validateDestination(ctx, location.path, location.namespace);
	if (!destination) return false;
	const content = await chooseContent(ctx);
	if (!content) return false;
	const review = await ctx.ui.select(
		`Review WebDAV target\n\nTarget: ${safe(name)}\nStorage profile: ${safe(profile)}\nRemote path: ${safe(`${destination.path}/profiles/${destination.namespace}/`)}\nSynced content: ${content.length} built-in groups · Sessions: Off\nSwitching later does not sync until its reviewed pull.`,
		["Add target", "Cancel"],
	);
	if (review !== "Add target") return false;
	await addSyncTarget(name, {
		profile,
		path: destination.path,
		namespace: destination.namespace,
		autoSync: true,
		syncFiles: content,
		syncSessions: false,
		extraFiles: [],
	});
	ctx.ui.notify(`Added sync target “${safe(name)}”.`, "info");
	return true;
}

export async function showEditWebDavTarget(ctx: ExtensionCommandContext, partial: PartialConfig) {
	if (!partial.target) return false;
	const remotePath = await requiredInput(ctx, "WebDAV remote path", partial.path ?? "pi-sync");
	if (!remotePath) return false;
	const namespace = await requiredInput(ctx, "Remote namespace", partial.profile ?? partial.target);
	if (!namespace) return false;
	const destination = validateDestination(ctx, remotePath, namespace);
	if (!destination) return false;
	const review = await ctx.ui.select(
		`Review target “${safe(partial.target)}”\n\nPath: ${safe(partial.path ?? "pi-sync")} → ${safe(destination.path)}\nNamespace: ${safe(partial.profile ?? partial.target)} → ${safe(destination.namespace)}\nSaving changes future sync destination only; it does not move or delete remote data.`,
		["Save target", "Cancel"],
	);
	if (review !== "Save target") return false;
	await updateSyncTarget(partial.target, (target) => ({ ...target, ...destination }));
	ctx.ui.notify(`Saved target “${safe(partial.target)}”.`, "info");
	return true;
}

export async function showAddWebDavStorageProfile(ctx: ExtensionCommandContext) {
	const name = await requiredInput(ctx, "Name the storage profile", "webdav");
	if (!name) return false;
	const url = await requiredInput(ctx, "WebDAV collection URL", "https://cloud.example.com/dav");
	if (!url) return false;
	const username = await requiredInput(ctx, "WebDAV username", "user");
	if (!username) return false;
	const connection = validateConnection(ctx, url, username);
	if (!connection) return false;
	const review = await ctx.ui.select(
		`Review storage profile\n\nName: ${safe(name)}\nType: WebDAV\nURL: ${displayUrl(connection.url)}\nUsername: stored privately (value hidden)\nAdd the password privately in ${safe(localConfigPath())}; it is never requested or displayed.`,
		["Add profile", "Cancel"],
	);
	if (review !== "Add profile") return false;
	await addStorageProfile(name, { kind: "webdav", ...connection });
	ctx.ui.notify(`Added storage profile “${safe(name)}”.`, "info");
	return true;
}

export async function showEditWebDavStorageProfile(
	ctx: ExtensionCommandContext,
	name: string,
	profile: Record<string, unknown>,
) {
	const url = await requiredInput(
		ctx,
		"WebDAV collection URL",
		String(profile.url ?? "https://cloud.example.com/dav"),
	);
	if (!url) return false;
	const username = await requiredInput(ctx, "WebDAV username", String(profile.username ?? "user"));
	if (!username) return false;
	const connection = validateConnection(ctx, url, username);
	if (!connection) return false;
	const review = await ctx.ui.select(
		`Review connection\n\nProfile: ${safe(name)}\nURL: ${displayUrl(connection.url)}\nUsername: stored privately (value hidden)\nPassword remains unchanged and is never shown.`,
		["Save profile", "Cancel"],
	);
	if (review !== "Save profile") return false;
	await updateStorageProfile(name, (current) => ({ ...current, ...connection }));
	ctx.ui.notify(`Saved storage profile “${safe(name)}”.`, "info");
	return true;
}

async function chooseDestination(ctx: ExtensionCommandContext, targetName: string) {
	const remotePath = await requiredInput(ctx, "WebDAV remote path", "pi-sync");
	if (!remotePath) return undefined;
	const namespace = await requiredInput(ctx, "Remote namespace", targetName);
	return namespace ? { path: remotePath, namespace } : undefined;
}

async function chooseContent(ctx: ExtensionCommandContext) {
	const choice = await ctx.ui.select("Choose an initial sync preset", [
		"Recommended Pi settings",
		"Minimal settings",
		"Cancel",
	]);
	if (!choice || choice === "Cancel") return undefined;
	return choice === "Minimal settings" ? ["settings.json", "AGENTS.md"] : [...DEFAULT_SYNC_FILES];
}

async function chooseSessions(ctx: ExtensionCommandContext) {
	const choice = await ctx.ui.select(
		"Session conversations\n\nSessions can contain prompts, tool output, paths, screenshots, and secrets.",
		["Keep sessions off (recommended)", "Include session conversations", "Cancel"],
	);
	if (!choice || choice === "Cancel") return undefined;
	if (choice !== "Include session conversations") return false;
	return ctx.ui.confirm(
		"Include session conversations?",
		"I understand that session JSONL can contain prompts, tool output, paths, screenshots, and secrets.",
	);
}

async function requiredInput(ctx: ExtensionCommandContext, title: string, placeholder: string) {
	const value = await ctx.ui.input(title, placeholder);
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	if (!trimmed) {
		ctx.ui.notify(`${title} is required.`, "warning");
		return undefined;
	}
	return trimmed;
}

function validateConnection(ctx: ExtensionCommandContext, url: string, username: string) {
	try {
		const normalizedUrl = normalizeWebDavUrl(url);
		if (!normalizedUrl) throw new Error("WebDAV URL is required.");
		validateWebDavCredentials(username);
		return { url: normalizedUrl, username: username.trim() };
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return undefined;
	}
}

function validateDestination(ctx: ExtensionCommandContext, path: string, namespace: string) {
	try {
		const normalizedPath = normalizeWebDavPath(path);
		validateWebDavNamespace(namespace.trim());
		return { path: normalizedPath, namespace: namespace.trim() };
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return undefined;
	}
}

function displayUrl(value: string) {
	try {
		return `${new URL(value).origin}/…`;
	} catch {
		return "invalid URL (value hidden)";
	}
}

function safe(value: string) {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Settings values are untrusted terminal input.
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "�");
}
