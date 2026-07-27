import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readLocalConfigObject } from "./config.js";
import { ownRecord, requiredInput, safeTerminalText } from "./manager-helpers.js";
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
	const raw = await readLocalConfigObject();
	if (raw?.version !== 2) {
		ctx.ui.notify("Upgrade settings before managing saved connections.", "info");
		return;
	}
	const profiles = ownRecord(raw.profiles) ?? {};
	const selected = await ctx.ui.select(
		"Saved connections",
		["Add saved connection", ...Object.keys(profiles).sort(), BACK],
		{ signal },
	);
	if (!selected || selected === BACK) return;
	if (selected === "Add saved connection") {
		await showAddStorageConnection(ctx, signal);
		return;
	}
	const action = await ctx.ui.select(
		`Saved connection “${safeTerminalText(selected)}”`,
		["Edit connection", "Remove saved connection", BACK],
		{ signal },
	);
	if (!action || action === BACK) return;
	if (action === "Remove saved connection") {
		const confirmed = await ctx.ui.confirm(
			"Remove saved connection?",
			`Remove saved connection “${safeTerminalText(selected)}”? Remote buckets and snapshots are not deleted.`,
		);
		if (!confirmed) return;
		await removeStorageProfile(selected);
		ctx.ui.notify(`Removed saved connection “${safeTerminalText(selected)}”.`, "info");
		return;
	}
	const profile = ownRecord(profiles[selected]);
	if (!profile) return;
	if (profile.kind === "webdav") {
		await showEditWebDavStorageProfile(ctx, selected, profile, signal);
		return;
	}
	const endpoint = await requiredInput(
		ctx,
		"Endpoint",
		String(profile.endpoint ?? "https://s3.example.com"),
	);
	if (!endpoint) return;
	const region = await requiredInput(ctx, "Region", String(profile.region ?? "auto"));
	if (!region) return;
	const credentials = await chooseS3CredentialUpdate(ctx, profile);
	if (!credentials) return;
	const save = await ctx.ui.select(
		`Review connection\n\nSaved connection: ${safeTerminalText(selected)}\nEndpoint: ${safeTerminalText(endpoint)}\nRegion: ${safeTerminalText(region)}\nCredentials: ${safeTerminalText(credentials.summary)}`,
		["Save profile", "Cancel"],
	);
	if (save !== "Save profile") return;
	await updateStorageProfile(selected, (current) =>
		applyS3CredentialUpdate({ ...current, endpoint, region }, credentials),
	);
	ctx.ui.notify(`Saved connection “${safeTerminalText(selected)}”.`, "info");
}

export async function showAddStorageConnection(ctx: ExtensionCommandContext, signal?: AbortSignal) {
	const preset = await ctx.ui.select(
		"Storage type",
		["Cloudflare R2", "Other S3-compatible storage", "WebDAV", "Cancel"],
		{ signal },
	);
	if (!preset || preset === "Cancel") return false;
	if (preset === "WebDAV") return showAddWebDavStorageProfile(ctx, signal);
	const name = await requiredInput(
		ctx,
		"Name this saved connection",
		preset === "Cloudflare R2" ? "r2" : "s3",
	);
	if (!name) return false;
	const endpoint = await requiredInput(
		ctx,
		"Endpoint",
		preset === "Cloudflare R2"
			? "https://<account-id>.r2.cloudflarestorage.com"
			: "https://s3.example.com",
	);
	if (!endpoint) return false;
	const region =
		preset === "Cloudflare R2" ? "auto" : await requiredInput(ctx, "Region", "us-east-1");
	if (!region) return false;
	const credentials = await chooseS3Credentials(ctx);
	if (!credentials) return false;
	const save = await ctx.ui.select(
		`Review saved connection\n\nName: ${safeTerminalText(name)}\nType: ${preset}\nEndpoint: ${safeTerminalText(endpoint)}\nRegion: ${safeTerminalText(region)}\nCredentials: ${safeTerminalText(credentials.summary)}`,
		["Add connection", "Cancel"],
	);
	if (save !== "Add connection") return false;
	await addStorageProfile(name, {
		kind: preset === "Cloudflare R2" ? "r2" : "s3-compatible",
		endpoint,
		region,
		...credentials.profileFields,
	});
	ctx.ui.notify(`Added saved connection “${safeTerminalText(name)}”.`, "info");
	return true;
}
