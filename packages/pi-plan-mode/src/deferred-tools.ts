import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DeferredToolLoadingMode } from "./settings.js";

const ENV_OVERRIDE_VAR = "PI_PLAN_MODE_DEFERRED";

function envDeferredToolLoadingOverride(): DeferredToolLoadingMode | undefined {
	const raw = process.env[ENV_OVERRIDE_VAR];
	return raw === "always" || raw === "never" ? raw : undefined;
}

/**
 * Reports whether the selected model and provider support Pi's native additive
 * deferred-tool-loading protocol, so a configured-but-inactive tool can be referenced by name
 * without first resending the complete active tool list.
 *
 * This mirrors the capability check in pi-firecrawl's and pi-chrome-devtools' `lazy-tools.ts`.
 * Plan mode cannot import that check from either package (extensions must stay free of
 * extension-to-extension dependencies), so the same model-capability logic is duplicated here.
 *
 * `override` lets a deployment force this on/off regardless of provider capability — some
 * assemblies (ours included) always drive tool activation client-side via `setActiveTools()`,
 * which works on any provider, making the upstream provider-capability gate below overly
 * conservative for them. Settings ("pi-plan-mode.json"'s `deferredToolLoading`) take priority;
 * `PI_PLAN_MODE_DEFERRED=always|never` is a fallback for when settings leave it at "auto".
 */
export function supportsNativeDeferredToolLoading(
	model: ExtensionContext["model"],
	override: DeferredToolLoadingMode = "auto",
): boolean {
	const resolved = override === "auto" ? (envDeferredToolLoadingOverride() ?? "auto") : override;
	if (resolved === "always") return true;
	if (resolved === "never") return false;
	if (!model) return false;
	if (model.api === "anthropic-messages") {
		const configured = compatBoolean(model.compat, "supportsToolReferences");
		if (configured !== undefined) return configured;
		if (model.provider !== "anthropic" || model.id.includes("haiku")) return false;
		const version = model.id.match(/^claude-(?:opus|sonnet|fable)-(\d+)(?:-(\d+))?(?:-|$)/);
		if (!version) return false;
		const major = Number(version[1]);
		const minor = version[2] && version[2].length < 8 ? Number(version[2]) : 0;
		return major > 4 || (major === 4 && minor >= 5);
	}
	if (model.api === "openai-completions") {
		return compatString(model.compat, "deferredToolsMode") === "kimi";
	}
	if (model.api === "openai-responses" || model.api === "openai-codex-responses") {
		return (
			compatBoolean(model.compat, "supportsAdditionalTools") === true ||
			compatBoolean(model.compat, "supportsToolSearch") === true
		);
	}
	return false;
}

function compatBoolean(value: unknown, key: string) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	return typeof record[key] === "boolean" ? record[key] : undefined;
}

function compatString(value: unknown, key: string) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	return typeof record[key] === "string" ? record[key] : undefined;
}
