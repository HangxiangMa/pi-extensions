import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readLocalConfigObject } from "./config.js";
import { showAddGitStorageProfile, showEditGitStorageProfile } from "./git-ui.js";
import { errorMessage, ownRecord, requiredInput, safeTerminalText } from "./manager-helpers.js";
import {
	applyS3CredentialUpdate,
	chooseS3Credentials,
	chooseS3CredentialUpdate,
} from "./s3-credentials-ui.js";
import {
	addStorageProfile,
	removeStorageProfile,
	updateStorageProfile,
} from "./settings-management.js";
import { showAddWebDavStorageProfile, showEditWebDavStorageProfile } from "./webdav-ui.js";

const BACK = "Back";

export async function showStorageConnections(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	while (!signal?.aborted) {
		const raw = await readLocalConfigObject();
		if (raw?.version !== 2) {
			ctx.ui.notify("Upgrade settings before managing storage connections.", "info");
			return;
		}
		const profiles = ownRecord(raw.profiles) ?? {};
		const labels = new Map(
			Object.keys(profiles)
				.sort((left, right) => left.localeCompare(right))
				.map((name) => [safeTerminalText(name), name]),
		);
		const selected = await ctx.ui.select(
			"Storage connections",
			["Add storage connection", ...labels.keys(), BACK],
			{ signal },
		);
		if (signal?.aborted || !selected || selected === BACK) return;
		if (selected === "Add storage connection") {
			try {
				await showAddStorageConnection(ctx, signal);
			} catch (error) {
				ctx.ui.notify(
					`Storage connection was not added: ${safeTerminalText(errorMessage(error))} Retry from Add storage connection.`,
					"error",
				);
			}
			continue;
		}
		const name = labels.get(selected);
		if (name) await showStorageConnectionDetail(ctx, name, signal);
	}
}

async function showStorageConnectionDetail(
	ctx: ExtensionCommandContext,
	name: string,
	signal?: AbortSignal,
) {
	while (!signal?.aborted) {
		const raw = await readLocalConfigObject();
		const profiles = ownRecord(raw?.profiles) ?? {};
		const profile = ownRecord(profiles[name]);
		if (!profile) {
			ctx.ui.notify(`Storage connection “${safeTerminalText(name)}” no longer exists.`, "warning");
			return;
		}
		const usedBy = referencingSetups(raw, name);
		const selected = await ctx.ui.select(
			[
				`Storage connection “${safeTerminalText(name)}”`,
				"",
				`Type: ${connectionType(profile)}`,
				`Endpoint: ${connectionEndpoint(profile)}`,
				`Credentials: ${credentialSource(profile)}`,
				`Used by: ${usedBy.length > 0 ? usedBy.map(safeTerminalText).join(", ") : "No sync setups"}`,
				...(usedBy.length > 0
					? ["Remove unavailable: edit or remove the listed sync setups first."]
					: []),
			].join("\n"),
			[
				"Edit storage connection…",
				...(usedBy.length === 0 ? ["Remove storage connection…"] : []),
				BACK,
			],
			{ signal },
		);
		if (signal?.aborted || !selected || selected === BACK) return;
		try {
			if (selected === "Remove storage connection…") {
				const confirmed = await ctx.ui.confirm(
					"Remove storage connection?",
					`Remove local storage connection “${safeTerminalText(name)}”? Remote data and history are not deleted.`,
					{ signal },
				);
				if (!confirmed || signal?.aborted) continue;
				await removeStorageProfile(name);
				ctx.ui.notify(`Removed storage connection “${safeTerminalText(name)}”.`, "info");
				return;
			}
			await editStorageConnection(ctx, name, profile, usedBy, signal);
		} catch (error) {
			ctx.ui.notify(
				`Storage connection “${safeTerminalText(name)}” was not changed: ${safeTerminalText(errorMessage(error))} Reopen it and retry.`,
				"error",
			);
		}
	}
}

async function editStorageConnection(
	ctx: ExtensionCommandContext,
	name: string,
	profile: Record<string, unknown>,
	usedBy: string[],
	signal?: AbortSignal,
) {
	if (profile.kind === "webdav") {
		await showEditWebDavStorageProfile(ctx, name, profile, signal, usedBy);
		return;
	}
	if (profile.kind === "git") {
		await showEditGitStorageProfile(ctx, name, profile, signal, usedBy);
		return;
	}
	const endpoint = await requiredInput(
		ctx,
		"Endpoint",
		String(profile.endpoint ?? "https://s3.example.com"),
	);
	if (!endpoint || signal?.aborted) return;
	const region = await requiredInput(ctx, "Region", String(profile.region ?? "auto"));
	if (!region || signal?.aborted) return;
	const credentials = await chooseS3CredentialUpdate(ctx, profile, signal);
	if (!credentials || signal?.aborted) return;
	const save = await ctx.ui.select(
		[
			"Review storage connection",
			"",
			`Storage connection: ${safeTerminalText(name)}`,
			`Endpoint: ${safeTerminalText(String(profile.endpoint ?? "missing"))} → ${safeTerminalText(endpoint)}`,
			`Region: ${safeTerminalText(String(profile.region ?? "auto"))} → ${safeTerminalText(region)}`,
			`Credentials: ${safeTerminalText(credentials.summary)}`,
			`Affected sync setups: ${usedBy.length > 0 ? usedBy.map(safeTerminalText).join(", ") : "None"}`,
			"Saving changes future storage access for every affected setup; it does not move remote data.",
		].join("\n"),
		["Save storage connection", "Cancel"],
		{ signal },
	);
	if (save !== "Save storage connection" || signal?.aborted) return;
	await updateStorageProfile(
		name,
		(current) => applyS3CredentialUpdate({ ...current, endpoint, region }, credentials),
		usedBy,
	);
	if (signal?.aborted) return;
	ctx.ui.notify(`Saved storage connection “${safeTerminalText(name)}”.`, "info");
}

export async function showAddStorageConnection(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	const preset = await ctx.ui.select(
		"Storage type",
		["Cloudflare R2", "Other S3-compatible storage", "WebDAV", "Git", "Cancel"],
		{ signal },
	);
	if (signal?.aborted || !preset || preset === "Cancel") return false;
	if (preset === "WebDAV") return showAddWebDavStorageProfile(ctx, signal);
	if (preset === "Git") return showAddGitStorageProfile(ctx, signal);
	const name = await requiredInput(
		ctx,
		"Name this storage connection",
		preset === "Cloudflare R2" ? "r2" : "s3",
	);
	if (!name || signal?.aborted) return false;
	const endpoint = await requiredInput(
		ctx,
		"Endpoint",
		preset === "Cloudflare R2"
			? "https://<account-id>.r2.cloudflarestorage.com"
			: "https://s3.example.com",
	);
	if (!endpoint || signal?.aborted) return false;
	const region =
		preset === "Cloudflare R2" ? "auto" : await requiredInput(ctx, "Region", "us-east-1");
	if (!region || signal?.aborted) return false;
	const credentials = await chooseS3Credentials(ctx, signal);
	if (!credentials || signal?.aborted) return false;
	const save = await ctx.ui.select(
		[
			"Review storage connection",
			"",
			`Name: ${safeTerminalText(name)}`,
			`Type: ${preset}`,
			`Endpoint: ${safeTerminalText(endpoint)}`,
			`Region: ${safeTerminalText(region)}`,
			`Credentials: ${safeTerminalText(credentials.summary)}`,
			"Adding a connection does not contact remote storage or start syncing.",
		].join("\n"),
		["Add storage connection", "Cancel"],
		{ signal },
	);
	if (save !== "Add storage connection" || signal?.aborted) return false;
	await addStorageProfile(name, {
		kind: preset === "Cloudflare R2" ? "r2" : "s3-compatible",
		endpoint,
		region,
		...credentials.profileFields,
	});
	if (signal?.aborted) return true;
	ctx.ui.notify(`Added storage connection “${safeTerminalText(name)}”.`, "info");
	return true;
}

function referencingSetups(raw: Record<string, unknown> | undefined, connection: string) {
	return Object.entries(ownRecord(raw?.targets) ?? {})
		.filter(([, value]) => ownRecord(value)?.profile === connection)
		.map(([name]) => name)
		.sort((left, right) => left.localeCompare(right));
}

function connectionType(profile: Record<string, unknown>) {
	if (profile.kind === "git") return "Git";
	if (profile.kind === "webdav") return "WebDAV";
	if (profile.kind === "r2") return "Cloudflare R2";
	return "S3-compatible";
}

function connectionEndpoint(profile: Record<string, unknown>) {
	const value =
		profile.kind === "git"
			? profile.remote
			: profile.kind === "webdav"
				? profile.url
				: profile.endpoint;
	if (typeof value !== "string" || value.length === 0) return "Missing";
	if (profile.kind === "git") return safeTerminalText(value);
	try {
		return safeTerminalText(new URL(value).host);
	} catch {
		return "Invalid";
	}
}

function credentialSource(profile: Record<string, unknown>) {
	if (profile.kind === "git") return "Git credential helper or SSH configuration";
	if (profile.kind === "webdav") return profile.password ? "Settings file" : "Missing";
	if (profile.accessKeyId && profile.secretAccessKey) return "Settings file";
	return "Environment or missing";
}
