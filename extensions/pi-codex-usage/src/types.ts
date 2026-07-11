import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type UsageSource = "pi-auth" | "codex-app-server";
export type PiModel = NonNullable<ExtensionContext["model"]>;
export type CodexUsageModel = Pick<PiModel, "id" | "name" | "provider">;

export type QueryUsageOptions = {
	clearStatusline: boolean;
	refresh: boolean;
	statusline: boolean;
	timeoutMs: number;
};

export type CachedReport = {
	createdAt: number;
	report: CodexUsageReport;
};

export type QueryUsageResult =
	| { ok: true; report: CodexUsageReport }
	| { ok: false; errors: UsageQueryError[] };

export type UsageQueryError = {
	source: UsageSource;
	message: string;
	cause?: unknown;
};

export type CodexUsageReport = {
	source: UsageSource;
	capturedAt: number;
	planType?: string;
	snapshots: NormalizedRateLimitSnapshot[];
};

export type NormalizedRateLimitSnapshot = {
	limitId: string;
	limitName?: string;
	primary?: NormalizedRateLimitWindow;
	secondary?: NormalizedRateLimitWindow;
	credits?: NormalizedCredits;
};

export type NormalizedRateLimitWindow = {
	usedPercent: number;
	windowMinutes?: number;
	resetsAt?: number;
};

export type NormalizedCredits = {
	hasCredits: boolean;
	unlimited: boolean;
	balance?: string;
};

export type RateLimitStatusPayload = {
	plan_type?: unknown;
	rate_limit?: unknown;
	additional_rate_limits?: unknown;
	credits?: unknown;
};

export type BackendRateLimitDetails = {
	primary_window?: unknown;
	secondary_window?: unknown;
};

export type BackendWindowSnapshot = {
	used_percent?: unknown;
	limit_window_seconds?: unknown;
	reset_at?: unknown;
};

export type BackendAdditionalRateLimit = {
	limit_name?: unknown;
	metered_feature?: unknown;
	rate_limit?: unknown;
};

export type BackendCreditsSnapshot = {
	has_credits?: unknown;
	unlimited?: unknown;
	balance?: unknown;
};

export type AppServerRateLimitResponse = {
	rateLimits?: unknown;
	rateLimitsByLimitId?: unknown;
};

export type AppServerRateLimitSnapshot = {
	limitId?: unknown;
	limitName?: unknown;
	primary?: unknown;
	secondary?: unknown;
	credits?: unknown;
	planType?: unknown;
};

export type AppServerWindowSnapshot = {
	usedPercent?: unknown;
	windowDurationMins?: unknown;
	resetsAt?: unknown;
};

export type AppServerCreditsSnapshot = {
	hasCredits?: unknown;
	unlimited?: unknown;
	balance?: unknown;
};

export type RpcResponse = {
	id?: unknown;
	result?: unknown;
	error?: { message?: unknown; code?: unknown };
};

export type PendingRpc = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};
