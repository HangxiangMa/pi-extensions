import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	normalizeWebDavPath,
	normalizeWebDavUrl,
	readActiveLocalConfigDocumentForRepair,
	replaceLocalConfigDocument,
	resolveV2PartialConfig,
	validateWebDavCredentials,
	validateWebDavNamespace,
} from "./config.js";
import { promptSecret } from "./secret-input.js";
import {
	addStorageProfile,
	addSyncTarget,
	saveNewV2Settings,
	updateStorageProfile,
	updateSyncTarget,
} from "./settings-management.js";
import { DEFAULT_SYNC_FILES } from "./sync-policy.js";
import type { PartialConfig } from "./types.js";

export async function repairableWebDavDestinationName() {
	const document = await readActiveLocalConfigDocumentForRepair();
	const settings = document?.parsed;
	if (settings?.version !== 2) return undefined;
	const profiles = record(settings.profiles);
	const targets = record(settings.targets);
	if (!profiles || !targets) return undefined;
	const names = Object.keys(targets).filter((name) => {
		const target = record(targets[name]);
		if (!target) return false;
		const profile =
			typeof target.profile === "string" ? record(profiles[target.profile]) : undefined;
		return (
			profile?.kind === "webdav" &&
			(Object.hasOwn(target, "bucket") ||
				Object.hasOwn(target, "prefix") ||
				typeof profile.password !== "string" ||
				profile.password.length === 0)
		);
	});
	const active = typeof settings.activeTarget === "string" ? settings.activeTarget : undefined;
	return active && names.includes(active) ? active : names.length === 1 ? names[0] : undefined;
}

export async function showRepairableWebDavDestination(ctx: ExtensionCommandContext) {
	const name = await repairableWebDavDestinationName();
	return name ? showRepairWebDavDestination(ctx, name) : false;
}

export async function showRepairWebDavDestination(
	ctx: ExtensionCommandContext,
	targetName: string,
) {
	const document = await readActiveLocalConfigDocumentForRepair();
	if (document?.parsed.version !== 2) return false;
	const profiles = record(document.parsed.profiles);
	const targets = record(document.parsed.targets);
	const target = targets && record(targets[targetName]);
	const profileName = target && typeof target.profile === "string" ? target.profile : undefined;
	const profile = profileName && profiles ? record(profiles[profileName]) : undefined;
	if (!target || !profileName || !profile || profile.kind !== "webdav") return false;
	const url = typeof profile.url === "string" ? profile.url : "";
	const username = typeof profile.username === "string" ? profile.username : "";
	let password =
		typeof profile.password === "string" && profile.password ? profile.password : undefined;
	if (!password) {
		password = await promptSecret(ctx, "WebDAV password");
		if (password === undefined) return false;
	}
	const path = await requiredInput(
		ctx,
		"WebDAV remote path",
		typeof target.path === "string"
			? target.path
			: typeof target.prefix === "string"
				? target.prefix
				: "pi-sync",
	);
	if (!path) return false;
	const namespace = await requiredInput(
		ctx,
		"Remote namespace",
		typeof target.namespace === "string" ? target.namespace : targetName,
	);
	if (!namespace) return false;
	const connection = validateConnection(ctx, url, username, password);
	const destination = validateDestination(ctx, path, namespace);
	if (!connection || !destination) return false;
	const removedTargetFields = ["bucket", "prefix"].filter((field) => Object.hasOwn(target, field));
	const removedProfileFields = [
		"endpoint",
		"region",
		"accessKeyId",
		"secretAccessKey",
		"sessionToken",
	].filter((field) => Object.hasOwn(profile, field));
	const review = await ctx.ui.select(
		[
			"Repair WebDAV destination",
			"",
			`Destination: ${safe(targetName)}`,
			`Saved connection: ${safe(profileName)}`,
			`Remote path: ${safe(`${destination.path}/profiles/${destination.namespace}/`)}`,
			`Password: configured (value hidden)`,
			...(removedTargetFields.length > 0
				? [`Remove incompatible destination fields: ${removedTargetFields.join(", ")}`]
				: []),
			...(removedProfileFields.length > 0
				? [`Remove incompatible connection fields: ${removedProfileFields.join(", ")}`]
				: []),
			"Unknown settings and every other destination remain unchanged.",
		].join("\n"),
		["Repair destination", "Cancel"],
	);
	if (review !== "Repair destination") return false;
	const nextProfile: Record<string, unknown> = { ...profile, ...connection };
	for (const field of removedProfileFields) delete nextProfile[field];
	const nextTarget: Record<string, unknown> = { ...target, ...destination };
	for (const field of removedTargetFields) delete nextTarget[field];
	const next = {
		...document.parsed,
		profiles: { ...profiles, [profileName]: nextProfile },
		targets: { ...targets, [targetName]: nextTarget },
	};
	resolveV2PartialConfig(next, targetName);
	await replaceLocalConfigDocument(document, next);
	ctx.ui.notify(`Repaired WebDAV destination “${safe(targetName)}”.`, "info");
	return true;
}

export async function showWebDavSetup(ctx: ExtensionCommandContext, targetName: string) {
	const url = await requiredInput(
		ctx,
		"WebDAV collection URL",
		"https://cloud.example.com/remote.php/dav/files/user",
	);
	if (!url) return false;
	const username = await requiredInput(ctx, "WebDAV username", "user");
	if (!username) return false;
	const password = await promptSecret(ctx, "WebDAV password");
	if (password === undefined) return false;
	const location = await chooseDestination(ctx, targetName);
	if (!location) return false;
	const connection = validateConnection(ctx, url, username, password);
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
			"Password: configured (value hidden)",
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
	ctx.ui.notify(`Destination “${safe(targetName)}” is ready. Use Sync now when ready.`, "info");
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
	const password = await promptSecret(ctx, "WebDAV password");
	if (password === undefined) return false;
	const connection = validateConnection(ctx, url, username, password);
	if (!connection) return false;
	const review = await ctx.ui.select(
		`Review saved connection\n\nName: ${safe(name)}\nType: WebDAV\nURL: ${displayUrl(connection.url)}\nUsername: stored privately (value hidden)\nPassword: configured (value hidden)`,
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
	let password: string | undefined;
	let replacePassword = false;
	if (typeof profile.password === "string" && profile.password.length > 0) {
		const passwordAction = await ctx.ui.select("WebDAV password", [
			"Keep current password",
			"Replace password",
			"Cancel",
		]);
		if (!passwordAction || passwordAction === "Cancel") return false;
		replacePassword = passwordAction === "Replace password";
	} else {
		replacePassword = true;
	}
	if (replacePassword) {
		password = await promptSecret(ctx, "New WebDAV password");
		if (password === undefined) return false;
	}
	const connection = validateConnection(ctx, url, username, password);
	if (!connection) return false;
	const review = await ctx.ui.select(
		`Review connection\n\nSaved connection: ${safe(name)}\nURL: ${displayUrl(connection.url)}\nUsername: stored privately (value hidden)\nPassword: ${replacePassword ? "will be replaced" : "unchanged"} (value hidden)`,
		["Save profile", "Cancel"],
	);
	if (review !== "Save profile") return false;
	await updateStorageProfile(name, (current) => ({
		...current,
		...connection,
		...(replacePassword ? { password } : {}),
	}));
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

function validateConnection(
	ctx: ExtensionCommandContext,
	url: string,
	username: string,
	password?: string,
) {
	try {
		const normalizedUrl = normalizeWebDavUrl(url);
		if (!normalizedUrl) throw new Error("WebDAV URL is required.");
		validateWebDavCredentials(username, password);
		return {
			url: normalizedUrl,
			username: username.trim(),
			...(password === undefined ? {} : { password }),
		};
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

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function safe(value: string) {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Settings values are untrusted terminal input.
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "�");
}
