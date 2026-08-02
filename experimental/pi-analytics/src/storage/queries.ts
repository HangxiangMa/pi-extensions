import type { Database } from "@tursodatabase/database";
import type { ProviderErrorCategory } from "../types.js";

export type TimeRangeId = "today" | "7d" | "30d" | "all";
export interface TimeRange {
	id?: TimeRangeId;
	fromMs: number;
	toMs: number;
}

export interface OverviewStats {
	responseCycles: number;
	llmCalls: number;
	callsPerResponse: number;
	p95CallsPerResponse: number;
	toolCalls: number;
	toolErrors: number;
	skillActivations: number;
	providerErrors: number;
	recoveredErrors: number;
}

export interface ModelCount {
	provider?: string;
	model?: string;
	count: number;
}

export interface SkillStats {
	name: string;
	count: number;
	modelInitiated: number;
	userInitiated: number;
	lastOccurredAtMs: number;
	models: ModelCount[];
}

export interface ToolStats {
	name: string;
	count: number;
	errors: number;
	averageDurationMs: number;
	lastOccurredAtMs: number;
	models: ModelCount[];
}

export interface ReliabilityStats {
	http429: number;
	http5xx: number;
	recovered: number;
	terminal: number;
	categories: Record<ProviderErrorCategory, number>;
}

export interface ResponseStats {
	count: number;
	llmCalls: number;
	average: number;
	median: number;
	p95: number;
	maximum: number;
	distribution: { one: number; twoToThree: number; fourToSix: number; sevenPlus: number };
}

export interface AnalyticsSnapshot {
	overview: OverviewStats;
	skills: SkillStats[];
	tools: ToolStats[];
	reliability: ReliabilityStats;
	responses: ResponseStats;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const ERROR_CATEGORIES: readonly ProviderErrorCategory[] = [
	"dns",
	"timeout",
	"connection_refused",
	"connection_reset",
	"tls",
	"network_other",
	"provider_other",
];

export function resolveTimeRange(id: TimeRangeId, now = Date.now()): TimeRange {
	let fromMs = 0;
	if (id === "today") {
		const date = new Date(now);
		fromMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	} else if (id === "7d") fromMs = now - 7 * DAY_MS;
	else if (id === "30d") fromMs = now - 30 * DAY_MS;
	return { id, fromMs, toMs: now + 1 };
}

export async function querySnapshot(
	database: Database,
	range: TimeRange,
): Promise<AnalyticsSnapshot> {
	const [runs, skillRows, toolRows, categoryRows, statusRows] = await Promise.all([
		database.all(
			`SELECT generation_count, tool_call_count, tool_error_count,
			        skill_activation_count, provider_error_count, recovered_error_count
			 FROM response_runs
			 WHERE started_at_ms >= ? AND started_at_ms < ?
			 ORDER BY generation_count`,
			range.fromMs,
			range.toMs,
		),
		database.all(
			`SELECT s.skill_name, s.initiated_by, s.provider, s.model,
			        COUNT(*) AS count, MAX(s.occurred_at_ms) AS last_at
			 FROM skill_activations s
			 JOIN response_runs r ON r.id = s.run_id
			 WHERE r.started_at_ms >= ? AND r.started_at_ms < ?
			 GROUP BY s.skill_name, s.initiated_by, s.provider, s.model`,
			range.fromMs,
			range.toMs,
		),
		database.all(
			`SELECT t.tool_name, t.provider, t.model, COUNT(*) AS count,
			        SUM(t.is_error) AS errors, AVG(COALESCE(t.duration_ms, 0)) AS average_duration,
			        MAX(t.started_at_ms) AS last_at
			 FROM tool_calls t
			 JOIN response_runs r ON r.id = t.run_id
			 WHERE r.started_at_ms >= ? AND r.started_at_ms < ?
			 GROUP BY t.tool_name, t.provider, t.model`,
			range.fromMs,
			range.toMs,
		),
		database.all(
			`SELECT e.category, COUNT(*) AS count, SUM(e.terminal) AS terminal
			 FROM provider_errors e
			 JOIN response_runs r ON r.id = e.run_id
			 WHERE r.started_at_ms >= ? AND r.started_at_ms < ?
			 GROUP BY e.category`,
			range.fromMs,
			range.toMs,
		),
		database.all(
			`SELECT p.status, COUNT(*) AS count
			 FROM provider_responses p
			 JOIN model_generations g ON g.id = p.generation_id
			 JOIN response_runs r ON r.id = g.run_id
			 WHERE r.started_at_ms >= ? AND r.started_at_ms < ?
			 GROUP BY p.status`,
			range.fromMs,
			range.toMs,
		),
	]);

	const generationCounts = runs.map((row) => numberValue(row.generation_count));
	const responseStats = responseStatistics(generationCounts);
	const overview: OverviewStats = {
		responseCycles: runs.length,
		llmCalls: sum(generationCounts),
		callsPerResponse: responseStats.average,
		p95CallsPerResponse: responseStats.p95,
		toolCalls: sum(runs.map((row) => numberValue(row.tool_call_count))),
		toolErrors: sum(runs.map((row) => numberValue(row.tool_error_count))),
		skillActivations: sum(runs.map((row) => numberValue(row.skill_activation_count))),
		providerErrors: sum(runs.map((row) => numberValue(row.provider_error_count))),
		recoveredErrors: sum(runs.map((row) => numberValue(row.recovered_error_count))),
	};

	const categories = Object.fromEntries(
		ERROR_CATEGORIES.map((category) => [category, 0]),
	) as Record<ProviderErrorCategory, number>;
	let terminal = 0;
	for (const row of categoryRows) {
		const category = String(row.category) as ProviderErrorCategory;
		if (category in categories) categories[category] = numberValue(row.count);
		terminal += numberValue(row.terminal);
	}
	let http429 = 0;
	let http5xx = 0;
	for (const row of statusRows) {
		const status = numberValue(row.status);
		if (status === 429) http429 += numberValue(row.count);
		if (status >= 500 && status < 600) http5xx += numberValue(row.count);
	}

	return {
		overview,
		skills: foldSkills(skillRows),
		tools: foldTools(toolRows),
		reliability: {
			http429,
			http5xx,
			recovered: overview.recoveredErrors,
			terminal,
			categories,
		},
		responses: responseStats,
	};
}

function foldSkills(rows: Array<Record<string, unknown>>): SkillStats[] {
	const result = new Map<string, SkillStats>();
	for (const row of rows) {
		const name = String(row.skill_name);
		const count = numberValue(row.count);
		const item = result.get(name) ?? {
			name,
			count: 0,
			modelInitiated: 0,
			userInitiated: 0,
			lastOccurredAtMs: 0,
			models: [],
		};
		item.count += count;
		if (row.initiated_by === "user") item.userInitiated += count;
		else item.modelInitiated += count;
		item.lastOccurredAtMs = Math.max(item.lastOccurredAtMs, numberValue(row.last_at));
		mergeModelCount(item.models, {
			provider: optionalString(row.provider),
			model: optionalString(row.model),
			count,
		});
		result.set(name, item);
	}
	return [...result.values()]
		.map((item) => ({ ...item, models: sortModels(item.models) }))
		.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function foldTools(rows: Array<Record<string, unknown>>): ToolStats[] {
	const result = new Map<string, ToolStats & { weightedDuration: number }>();
	for (const row of rows) {
		const name = String(row.tool_name);
		const count = numberValue(row.count);
		const average = numberValue(row.average_duration);
		const item = result.get(name) ?? {
			name,
			count: 0,
			errors: 0,
			averageDurationMs: 0,
			weightedDuration: 0,
			lastOccurredAtMs: 0,
			models: [],
		};
		item.count += count;
		item.errors += numberValue(row.errors);
		item.weightedDuration += average * count;
		item.averageDurationMs = item.count > 0 ? item.weightedDuration / item.count : 0;
		item.lastOccurredAtMs = Math.max(item.lastOccurredAtMs, numberValue(row.last_at));
		mergeModelCount(item.models, {
			provider: optionalString(row.provider),
			model: optionalString(row.model),
			count,
		});
		result.set(name, item);
	}
	return [...result.values()]
		.map(({ weightedDuration: _, ...item }) => ({ ...item, models: sortModels(item.models) }))
		.sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function responseStatistics(generationCounts: number[]): ResponseStats {
	const sorted = [...generationCounts].sort((left, right) => left - right);
	const count = sorted.length;
	const llmCalls = sum(sorted);
	const nearestRank = (percentile: number) =>
		count === 0 ? 0 : (sorted[Math.max(0, Math.ceil(percentile * count) - 1)] ?? 0);
	const median =
		count === 0
			? 0
			: count % 2 === 1
				? (sorted[Math.floor(count / 2)] ?? 0)
				: ((sorted[count / 2 - 1] ?? 0) + (sorted[count / 2] ?? 0)) / 2;
	return {
		count,
		llmCalls,
		average: count > 0 ? llmCalls / count : 0,
		median,
		p95: nearestRank(0.95),
		maximum: sorted.at(-1) ?? 0,
		distribution: {
			one: sorted.filter((value) => value === 1).length,
			twoToThree: sorted.filter((value) => value >= 2 && value <= 3).length,
			fourToSix: sorted.filter((value) => value >= 4 && value <= 6).length,
			sevenPlus: sorted.filter((value) => value >= 7).length,
		},
	};
}

function mergeModelCount(models: ModelCount[], next: ModelCount): void {
	const existing = models.find(
		({ provider, model }) => provider === next.provider && model === next.model,
	);
	if (existing) existing.count += next.count;
	else models.push(next);
}

function sortModels(models: ModelCount[]): ModelCount[] {
	return models.sort(
		(left, right) =>
			right.count - left.count ||
			`${left.provider ?? ""}/${left.model ?? ""}`.localeCompare(
				`${right.provider ?? ""}/${right.model ?? ""}`,
			),
	);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0;
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
