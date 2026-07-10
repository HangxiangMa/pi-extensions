import type { Usage } from "@earendil-works/pi-ai";

export interface GoalAccountingState {
	status: string;
	baselineTokens: number;
	tokensUsed: number;
	timeUsedSeconds: number;
	activeStartedAt?: number;
	updatedAt: number;
}

interface AssistantUsageEntryLike {
	type?: unknown;
	message?: unknown;
}

interface UsageContext {
	sessionManager?: unknown;
}

export function checkpointGoalActiveTime(
	goal: GoalAccountingState,
	now: number,
	continueClock: boolean,
) {
	const accumulated = nonNegativeFiniteNumber(goal.timeUsedSeconds);
	const startedAt = goal.activeStartedAt;
	if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
		goal.timeUsedSeconds = accumulated + Math.max(0, now - startedAt) / 1000;
	} else {
		goal.timeUsedSeconds = accumulated;
	}
	goal.activeStartedAt = continueClock ? now : undefined;
}

export function updateGoalUsage(
	goal: GoalAccountingState,
	ctx: UsageContext,
	continueClock = goal.status === "active",
) {
	const now = Date.now();
	const baselineTokens = nonNegativeFiniteNumber(goal.baselineTokens);
	goal.baselineTokens = baselineTokens;
	goal.tokensUsed = Math.max(0, currentTokenTotal(ctx) - baselineTokens);
	checkpointGoalActiveTime(goal, now, continueClock);
	goal.updatedAt = now;
}

export function formatDuration(seconds: number) {
	const wholeSeconds = Math.max(0, Math.floor(nonNegativeFiniteNumber(seconds)));
	if (wholeSeconds < 60) return `${wholeSeconds}s`;
	const minutes = Math.floor(wholeSeconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h${minutes % 60}m`;
}

export function formatTokenCount(value: number) {
	if (value < 1_000) return `${value}`;
	if (value < 1_000_000) {
		return `${Number.isInteger(value / 1_000) ? value / 1_000 : (value / 1_000).toFixed(1)}k`;
	}
	return `${Number.isInteger(value / 1_000_000) ? value / 1_000_000 : (value / 1_000_000).toFixed(1)}m`;
}

export function isNonNegativeFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function nonNegativeFiniteNumber(value: unknown) {
	return isNonNegativeFiniteNumber(value) ? value : 0;
}

export function normalizeTokenBudget(value: unknown) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? value
		: undefined;
}

export function assistantUsageTokens(value: unknown) {
	const usage = normalizeUsage(value);
	if (!usage) return 0;
	if (isNonNegativeFiniteNumber(usage.totalTokens)) return usage.totalTokens;
	return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

export function cumulativeAssistantTokens(entries: unknown[]) {
	let total = 0;
	for (const entry of entries) {
		const candidate = entry as AssistantUsageEntryLike;
		if (candidate?.type !== "message") continue;
		const message = candidate.message as { role?: unknown; usage?: unknown } | undefined;
		if (message?.role !== "assistant") continue;
		total += assistantUsageTokens(message.usage);
	}
	return total;
}

export function currentTokenTotal(ctx: UsageContext): number {
	const sessionManager = ctx.sessionManager as { getBranch?: () => unknown[] } | undefined;
	return cumulativeAssistantTokens(sessionManager?.getBranch?.() ?? []);
}

function normalizeUsage(value: unknown): Usage | undefined {
	if (!value || typeof value !== "object") return undefined;
	const usage = value as Partial<Usage>;
	return {
		input: nonNegativeFiniteNumber(usage.input),
		output: nonNegativeFiniteNumber(usage.output),
		cacheRead: nonNegativeFiniteNumber(usage.cacheRead),
		cacheWrite: nonNegativeFiniteNumber(usage.cacheWrite),
		totalTokens: isNonNegativeFiniteNumber(usage.totalTokens)
			? usage.totalTokens
			: nonNegativeFiniteNumber(usage.input) +
				nonNegativeFiniteNumber(usage.output) +
				nonNegativeFiniteNumber(usage.cacheRead) +
				nonNegativeFiniteNumber(usage.cacheWrite),
		cost: {
			input: nonNegativeFiniteNumber(usage.cost?.input),
			output: nonNegativeFiniteNumber(usage.cost?.output),
			cacheRead: nonNegativeFiniteNumber(usage.cost?.cacheRead),
			cacheWrite: nonNegativeFiniteNumber(usage.cost?.cacheWrite),
			total: nonNegativeFiniteNumber(usage.cost?.total),
		},
	};
}
