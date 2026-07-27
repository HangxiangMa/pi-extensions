import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { isCloudflareR2Endpoint } from "./config.js";

export function formatRemotePath(prefix: string, namespace: string) {
	return safeTerminalText(`${prefix}/profiles/${namespace}/`);
}

export async function requiredExistingBucket(ctx: ExtensionCommandContext, example: string) {
	const value = await ctx.ui.input("Existing bucket", `Example: ${example}`);
	if (value === undefined) return undefined;
	const normalized = value.trim();
	if (!normalized) {
		ctx.ui.notify("Enter the name of an existing R2/S3 bucket, or cancel setup.", "warning");
		return undefined;
	}
	return normalized;
}

export async function requiredInput(
	ctx: ExtensionCommandContext,
	title: string,
	placeholder: string,
	signal?: AbortSignal,
) {
	const value = await ctx.ui.input(title, placeholder, { signal });
	if (signal?.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new DOMException("The operation was aborted", "AbortError");
	}
	if (value === undefined) return undefined;
	const normalized = value.trim() || placeholder;
	return normalized.includes("<") || normalized.includes(">") ? undefined : normalized;
}

export function storageDescription(
	kind: string | undefined,
	endpoint: string | undefined,
	bucket: string | undefined,
) {
	const label =
		kind === "r2" || isCloudflareR2Endpoint(endpoint) ? "Cloudflare R2" : "S3-compatible";
	return `${label} · ${safeTerminalText(bucket ?? "bucket missing")}`;
}

export function ownRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

export function safeTerminalText(value: string) {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Escape untrusted terminal controls.
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "?");
}

export function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
