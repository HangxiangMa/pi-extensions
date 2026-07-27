import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { requiredInput } from "./manager-helpers.js";
import { promptSecret } from "./secret-input.js";

export interface ChosenS3Credentials {
	profileFields: { accessKeyId?: string; secretAccessKey?: string };
	summary: string;
	ready: boolean;
	replace?: boolean;
}

export async function chooseS3CredentialUpdate(
	ctx: ExtensionCommandContext,
	profile: Record<string, unknown>,
) {
	const hasStored =
		typeof profile.accessKeyId === "string" && typeof profile.secretAccessKey === "string";
	if (hasStored) {
		const action = await ctx.ui.select("Credentials", [
			"Keep current credentials",
			"Change credential source",
			"Cancel",
		]);
		if (!action || action === "Cancel") return undefined;
		if (action === "Keep current credentials") {
			return { profileFields: {}, summary: "Unchanged (values hidden)", ready: true };
		}
	}
	const selected = await chooseS3Credentials(ctx);
	return selected ? { ...selected, replace: true } : undefined;
}

export function applyS3CredentialUpdate(
	profile: Record<string, unknown>,
	credentials: ChosenS3Credentials,
) {
	const next = { ...profile };
	if (credentials.replace) {
		delete next.accessKeyId;
		delete next.secretAccessKey;
		delete next.sessionToken;
	}
	return { ...next, ...credentials.profileFields };
}

export async function chooseS3Credentials(
	ctx: ExtensionCommandContext,
): Promise<ChosenS3Credentials | undefined> {
	const choice = await ctx.ui.select(
		"Credentials\n\nStored secret values are masked during input and never shown afterward.",
		[
			"Use environment credentials",
			"Store credentials privately",
			"Create private settings template",
			"Cancel",
		],
	);
	if (!choice || choice === "Cancel") return undefined;
	if (choice === "Use environment credentials") {
		const ready = Boolean(
			(process.env.PI_SYNC_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID) &&
				(process.env.PI_SYNC_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY),
		);
		return {
			profileFields: {},
			summary: ready
				? "Environment credentials detected"
				: "Environment credentials are currently missing",
			ready,
		};
	}
	if (choice === "Create private settings template") {
		return {
			profileFields: {},
			summary: "Credentials must be completed later in the private settings file",
			ready: false,
		};
	}
	const accessKeyId = await requiredInput(ctx, "Access key ID", "access-key-id");
	if (!accessKeyId) return undefined;
	const secretAccessKey = await promptSecret(ctx, "Secret access key");
	if (secretAccessKey === undefined) return undefined;
	return {
		profileFields: { accessKeyId, secretAccessKey },
		summary: "Stored privately (values hidden)",
		ready: true,
	};
}
