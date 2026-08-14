import { createHash } from "node:crypto";

export const BENCHMARK_ID = "pi-codex-compact-comparison:v2";
export const FIXTURE_ID = "multi-state-compaction-recall:v2";

export const CATEGORIES = Object.freeze([
	"exact_recall",
	"relational_state",
	"tool_history",
	"distractor_resolution",
	"task_continuation",
]);

export const PROFILES = Object.freeze({
	production: Object.freeze({
		piKeepRecentTokens: 20_000,
		codexReplacementTokenBudget: 64_000,
	}),
	"matched-tail": Object.freeze({
		piKeepRecentTokens: 20_000,
		codexReplacementTokenBudget: 20_000,
	}),
});

export const SUITES = Object.freeze({
	exploratory: Object.freeze({
		seeds: Object.freeze([1]),
		densities: Object.freeze([120]),
		questionsPerCategory: 3,
	}),
	calibration: Object.freeze({
		seeds: Object.freeze([111]),
		densities: Object.freeze([120, 160, 200]),
		questionsPerCategory: 15,
	}),
	confirmatory: Object.freeze({
		seeds: Object.freeze([301, 302, 303, 304]),
		densities: Object.freeze([180, 200]),
		questionsPerCategory: 15,
	}),
});

const STATES = Object.freeze(["DONE", "IN_PROGRESS", "BLOCKED", "QUEUED", "VERIFYING"]);
const BASE_TIMESTAMP = Date.UTC(2026, 7, 14, 0, 0, 0);
const EMPTY_USAGE = Object.freeze({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }),
});

export function createBenchmarkFixture(options = {}) {
	const seed = options.seed ?? 1;
	const density = options.density ?? 120;
	const targetTokens = options.targetTokens ?? 50_000;
	const questionsPerCategory = options.questionsPerCategory ?? 15;
	const epochs = options.epochs ?? 10;
	const estimateTokens = options.estimateTokens ?? estimateMessageTokens;
	validateFixtureOptions({ seed, density, targetTokens, questionsPerCategory, epochs });

	const fixtureId = `${FIXTURE_ID}:s${String(seed).padStart(3, "0")}:d${density}`;
	const candidates = [];
	const epochMessages = Array.from({ length: epochs }, () => []);
	for (let epoch = 0; epoch < epochs; epoch += 1) {
		const indexes = Array.from({ length: density }, (_value, index) => index).filter(
			(index) => index % epochs === epoch,
		);
		const messages = epochMessages[epoch];
		appendExactState({ candidates, epoch, indexes, messages, seed });
		appendRelationalState({ candidates, density, epoch, indexes, messages, seed });
		appendToolHistory({ candidates, density, epoch, indexes, messages, seed });
		appendDistractorState({ candidates, density, epoch, indexes, messages, seed });
		appendTaskState({ candidates, density, epoch, indexes, messages, seed });
	}

	const historyForFillerCharacters = (fillerCharacters) => {
		const messages = [];
		for (let epoch = 0; epoch < epochs; epoch += 1) {
			messages.push(...epochMessages[epoch]);
			const epochCharacters =
				Math.floor(fillerCharacters / epochs) + (epoch < fillerCharacters % epochs ? 1 : 0);
			if (epochCharacters > 0) messages.push(...fillerMessages(seed, epoch, epochCharacters));
		}
		return stampMessages(messages, seed);
	};
	const baseHistory = historyForFillerCharacters(0);
	const baseTokens = estimateMessages(baseHistory, estimateTokens);
	if (baseTokens > targetTokens) {
		throw new Error(
			`density ${density} needs at least ${baseTokens} tokens, above target ${targetTokens}`,
		);
	}
	const messages = fitHistoryToTarget({
		build: historyForFillerCharacters,
		estimateTokens,
		targetTokens,
	});
	const historyEstimatedTokens = estimateMessages(messages, estimateTokens);
	const sharedTail = stampMessages(
		[
			userMessage(
				`Resume synthetic project ${seed}. No authoritative state changed after the final epoch. ` +
					"Use final corrections and actual tool outputs; archival notebooks remain irrelevant.",
			),
			assistantText("Ready to continue from the recorded project state."),
		],
		seed,
		messages.length,
	);
	const allMessages = [...messages, ...sharedTail];
	return {
		id: fixtureId,
		fixtureVersion: FIXTURE_ID,
		seed,
		density,
		targetTokens,
		historyEstimatedTokens,
		estimatedTokens: estimateMessages(allMessages, estimateTokens),
		messages: allMessages,
		questions: selectQuestions(fixtureId, candidates, questionsPerCategory),
		authoritativeRecords: candidates.length,
		epochs,
		sharedTailMessageCount: sharedTail.length,
	};
}

export function createBenchmarkFixtures(options = {}) {
	const seeds = options.seeds ?? [1];
	const densities = options.densities ?? [120];
	return densities.flatMap((density) =>
		seeds.map((seed) =>
			createBenchmarkFixture({
				...options,
				seed,
				density,
				seeds: undefined,
				densities: undefined,
			}),
		),
	);
}

export function buildProbePrompt(questions) {
	if (!Array.isArray(questions) || questions.length === 0) {
		throw new Error("questions must be a non-empty array");
	}
	const rendered = questions.map((question) => `${question.id}: ${question.question}`).join("\n");
	return [
		"Answer every benchmark question from the supplied project history.",
		'Return exactly one JSON object shaped as {"answers":{"QUESTION_ID":"VALUE"}}.',
		"Include every listed question ID and no other keys.",
		"Every value must be the exact canonical value, with no explanation or extra punctuation.",
		"Use an empty string when a value is unavailable.",
		"Return no Markdown or comments.",
		"",
		rendered,
	].join("\n");
}

export function scoreProbeResponse(text, questions) {
	let answers = {};
	let parseError;
	try {
		answers = parseAnswers(text);
	} catch (error) {
		parseError = error instanceof Error ? error.message : String(error);
	}
	const scores = questions.map((question) => {
		const actualValue = answers[question.id];
		const actual =
			typeof actualValue === "string" || typeof actualValue === "number"
				? String(actualValue).trim()
				: "";
		const expected = String(question.expected);
		return {
			questionId: question.id,
			category: question.category,
			epoch: question.epoch,
			expected,
			actual,
			matched: actual === expected,
		};
	});
	const aggregate = aggregateScores(scores);
	return {
		...aggregate,
		parseError,
		byCategory: groupedScores(scores, (score) => score.category),
		byEpoch: groupedScores(scores, (score) => String(score.epoch)),
		scores,
	};
}

export function summarizeNumbers(values) {
	if (!Array.isArray(values) || values.length === 0) return undefined;
	if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
		throw new Error("summarizeNumbers accepts only finite numbers");
	}
	const ordered = [...values].sort((left, right) => left - right);
	const center = quantile(ordered, 0.5);
	const deviations = ordered
		.map((value) => Math.abs(value - center))
		.sort((left, right) => left - right);
	return {
		count: ordered.length,
		median: round(center),
		medianAbsoluteDeviation: round(quantile(deviations, 0.5)),
		min: round(ordered[0]),
		max: round(ordered.at(-1)),
	};
}

export function summarizeBenchmarkTrials(trials) {
	if (!Array.isArray(trials) || trials.length === 0) {
		throw new Error("at least one completed trial is required");
	}
	const arms = ["full", "native", "codex"];
	const armScores = (selected, arm) => selected.flatMap((trial) => trial.arms[arm].quality.scores);
	const qualityFor = (selected, filter = () => true) =>
		Object.fromEntries(
			arms.map((arm) => [arm, aggregateScores(armScores(selected, arm).filter(filter))]),
		);
	const groupTrials = (selector) => {
		const keys = [...new Set(trials.map(selector))].sort(naturalCompare);
		return Object.fromEntries(
			keys.map((key) => [
				String(key),
				qualityFor(trials.filter((trial) => selector(trial) === key)),
			]),
		);
	};
	const categories = [...new Set(armScores(trials, "full").map((score) => score.category))].sort();
	const epochs = [...new Set(armScores(trials, "full").map((score) => score.epoch))].sort(
		(left, right) => left - right,
	);
	const paired = pairedOutcomes(trials);
	const fullQuality = aggregateScores(armScores(trials, "full"));
	const minimumAnswerabilityRate = 0.98;
	const failedFullContextFixtures = trials
		.map((trial) => ({
			id: trial.fixture.id,
			seed: trial.fixture.seed,
			density: trial.fixture.density,
			...aggregateScores(trial.arms.full.quality.scores),
		}))
		.filter((fixture) => fixture.rate < minimumAnswerabilityRate);
	return {
		trials: trials.length,
		independentSeeds: new Set(trials.map((trial) => trial.fixture.seed)).size,
		quality: {
			overall: qualityFor(trials),
			byDensity: groupTrials((trial) => trial.fixture.density),
			bySeed: groupTrials((trial) => trial.fixture.seed),
			byCategory: Object.fromEntries(
				categories.map((category) => [
					category,
					qualityFor(trials, (score) => score.category === category),
				]),
			),
			byEpoch: Object.fromEntries(
				epochs.map((epoch) => [
					String(epoch),
					qualityFor(trials, (score) => score.epoch === epoch),
				]),
			),
		},
		fullContextControl: {
			...fullQuality,
			minimumAnswerabilityRate,
			passed: failedFullContextFixtures.length === 0,
			failedFixtures: failedFullContextFixtures,
		},
		pairedCodexVsNative: paired,
		resources: Object.fromEntries(
			arms.map((arm) => [arm, summarizeArm(trials.map((trial) => trial.arms[arm]))]),
		),
		codexMinusNative: summarizePairedMetrics(trials),
		totalRecordedCostUsd: round(trials.reduce((total, trial) => total + trialCost(trial), 0)),
		statisticalUnit:
			"Questions are nested outcomes within fixture responses; seeds, not question rows, are the independent replications.",
	};
}

function appendExactState({ candidates, epoch, indexes, messages, seed }) {
	const records = indexes.map((index) => {
		const key = `parameter-${seed}-${index + 1}`;
		const value = `value-${nonce(seed, "exact", index, 24)}`;
		candidates.push({
			category: "exact_recall",
			epoch,
			question: `What is the exact authoritative value of ${key}?`,
			expected: value,
		});
		return `${key}=${value}`;
	});
	messages.push(
		userMessage(`Record the synthetic exact ledger generated for epoch ${epoch}.`),
		assistantText(
			`AUTHORITATIVE EXACT LEDGER, epoch ${epoch}: ${records.join("; ")}. Preserve every key and value exactly.`,
		),
	);
}

function appendRelationalState({ candidates, epoch, indexes, messages, seed }) {
	const records = indexes.map((index) => {
		const source = `route-source-${seed}-${index + 1}`;
		const target = `route-target-${nonce(seed, "relation", index, 22)}`;
		candidates.push({
			category: "relational_state",
			epoch,
			question: `Where does ${source} route directly?`,
			expected: target,
		});
		return `${source}->${target}`;
	});
	messages.push(
		userMessage(`Record the generated directed routes for epoch ${epoch}.`),
		assistantText(
			`AUTHORITATIVE DIRECTED ROUTES, epoch ${epoch}: ${records.join("; ")}. Every arrow is directional and current.`,
		),
	);
}

function appendToolHistory({ candidates, epoch, indexes, messages, seed }) {
	messages.push(userMessage(`Run and retain every synthetic read-only probe for epoch ${epoch}.`));
	const calls = [{ type: "text", text: `Running authoritative probes for epoch ${epoch}.` }];
	const results = [];
	for (const index of indexes) {
		const probe = `probe-${seed}-${index + 1}`;
		const callId = `call-${seed}-${index + 1}-${nonce(seed, "call", index, 8)}`;
		const result = `probe-result-${nonce(seed, "tool", index, 26)}`;
		calls.push({
			type: "toolCall",
			id: callId,
			name: "database_query",
			arguments: { project: seed, probe },
		});
		results.push(toolResultMessage(callId, "database_query", `${probe}=${result}`));
		candidates.push({
			category: "tool_history",
			epoch,
			question: `What exact authoritative output value did ${probe} return?`,
			expected: result,
		});
	}
	messages.push(assistantMessage(calls), ...results);
	messages.push(assistantText(`All authoritative epoch ${epoch} probe results were recorded.`));
}

function appendDistractorState({ candidates, epoch, indexes, messages, seed }) {
	const obsolete = [];
	const final = [];
	for (const index of indexes) {
		const field = `corrected-field-${seed}-${index + 1}`;
		obsolete.push(`${field}=obsolete-${nonce(seed, "obsolete", index, 20)}`);
		const finalValue = `final-${nonce(seed, "final", index, 24)}`;
		final.push(`${field}=${finalValue}`);
		candidates.push({
			category: "distractor_resolution",
			epoch,
			question: `What is the final authoritative value of ${field}?`,
			expected: finalValue,
		});
	}
	messages.push(
		userMessage(`Review the provisional candidate ledger for epoch ${epoch}.`),
		assistantText(
			`SUPERSEDED CANDIDATES, epoch ${epoch}: ${obsolete.join("; ")}. Every value in this ledger is obsolete.`,
		),
		userMessage(`Apply the generated final corrections for epoch ${epoch}.`),
		assistantText(
			`FINAL AUTHORITATIVE CORRECTIONS, epoch ${epoch}: ${final.join("; ")}. These values replace every candidate exactly.`,
		),
	);
}

function appendTaskState({ candidates, epoch, indexes, messages, seed }) {
	const records = indexes.map((index) => {
		const task = `work-item-${seed}-${index + 1}`;
		const state =
			STATES[Number.parseInt(digest(seed, "state", index).slice(0, 8), 16) % STATES.length];
		const receipt = `receipt-${nonce(seed, "receipt", index, 18)}`;
		const next = `next-${nonce(seed, "next", index, 18)}`;
		const expected = `${state}|receipt=${receipt}|next=${next}`;
		candidates.push({
			category: "task_continuation",
			epoch,
			question:
				`What is the exact current checkpoint for ${task}? ` +
				"Return STATE|receipt=VALUE|next=VALUE.",
			expected,
		});
		return `${task}:${expected}`;
	});
	messages.push(
		userMessage(`Record the current generated work checkpoints for epoch ${epoch}.`),
		assistantText(
			`AUTHORITATIVE WORK CHECKPOINT, epoch ${epoch}: ${records.join("; ")}. Keep each state, receipt, and next action associated with its work item.`,
		),
	);
}

function selectQuestions(fixtureId, candidates, questionsPerCategory) {
	const selected = [];
	for (const category of CATEGORIES) {
		const available = candidates.filter((candidate) => candidate.category === category);
		for (let index = 0; index < questionsPerCategory; index += 1) {
			const position = Math.min(
				available.length - 1,
				Math.floor(((index + 0.5) * available.length) / questionsPerCategory),
			);
			selected.push({
				...available[position],
				id: `q-${category}-${String(index + 1).padStart(2, "0")}`,
				fixtureId,
			});
		}
	}
	return selected;
}

function fitHistoryToTarget({ build, estimateTokens, targetTokens }) {
	let lowerCharacters = 0;
	let upperCharacters = Math.max(1_024, targetTokens * 6);
	while (estimateMessages(build(upperCharacters), estimateTokens) < targetTokens) {
		upperCharacters *= 2;
	}
	while (lowerCharacters + 1 < upperCharacters) {
		const middle = Math.floor((lowerCharacters + upperCharacters) / 2);
		if (estimateMessages(build(middle), estimateTokens) < targetTokens) lowerCharacters = middle;
		else upperCharacters = middle;
	}
	const lower = build(lowerCharacters);
	const upper = build(upperCharacters);
	const lowerDistance = Math.abs(estimateMessages(lower, estimateTokens) - targetTokens);
	const upperDistance = Math.abs(estimateMessages(upper, estimateTokens) - targetTokens);
	return lowerDistance <= upperDistance ? lower : upper;
}

function fillerMessages(seed, epoch, targetCharacters) {
	const header = `UNRELATED ARCHIVAL MATERIAL FOR EPOCH ${epoch}. Ignore it for active-project continuation. `;
	let text = header;
	let index = 0;
	while (text.length < targetCharacters) {
		text +=
			`Archive notebook ${epoch}-${index} is unrelated. Its obsolete simulation values ` +
			`${nonce(seed + epoch, "archive-a", index, 16)} and ` +
			`${nonce(seed + epoch, "archive-b", index, 16)} update no active state. `;
		index += 1;
	}
	return [
		userMessage(text.slice(0, targetCharacters)),
		assistantText(`Archived unrelated epoch ${epoch} material; active state is unchanged.`),
	];
}

function stampMessages(messages, seed, offset = 0) {
	const base = BASE_TIMESTAMP + seed * 1_000_000;
	return messages.map((message, index) => ({
		...structuredClone(message),
		timestamp: base + offset + index + 1,
	}));
}

function userMessage(content) {
	return { role: "user", content, timestamp: 0 };
}

function assistantText(text) {
	return assistantMessage([{ type: "text", text }]);
}

function assistantMessage(content) {
	return {
		role: "assistant",
		content,
		api: "openai-codex-responses",
		provider: "openai-codex",
		model: "benchmark-fixture",
		usage: structuredClone(EMPTY_USAGE),
		stopReason: "stop",
		timestamp: 0,
	};
}

function toolResultMessage(toolCallId, toolName, text) {
	return {
		role: "toolResult",
		toolCallId,
		toolName,
		content: [{ type: "text", text: `AUTHORITATIVE TOOL OUTPUT ${text}` }],
		isError: false,
		timestamp: 0,
	};
}

function digest(seed, namespace, index) {
	return createHash("sha256")
		.update(`pi-codex-compact-benchmark-v2:${seed}:${namespace}:${index}`)
		.digest("hex");
}

function nonce(seed, namespace, index, length) {
	return digest(seed, namespace, index).slice(0, length);
}

function estimateMessages(messages, estimateTokens) {
	return messages.reduce((total, message) => total + estimateTokens(message), 0);
}

function estimateMessageTokens(message) {
	return Math.ceil(JSON.stringify(message).length / 4);
}

function validateFixtureOptions({ seed, density, targetTokens, questionsPerCategory, epochs }) {
	if (!Number.isSafeInteger(seed) || seed < 1) throw new Error("seed must be a positive integer");
	if (!Number.isSafeInteger(density) || density < 1 || density > 1_000) {
		throw new Error("density must be an integer between 1 and 1000");
	}
	if (!Number.isSafeInteger(targetTokens) || targetTokens < 25_000 || targetTokens > 180_000) {
		throw new Error("targetTokens must be an integer between 25000 and 180000");
	}
	if (
		!Number.isSafeInteger(questionsPerCategory) ||
		questionsPerCategory < 1 ||
		questionsPerCategory > density
	) {
		throw new Error("questionsPerCategory must be an integer between 1 and density");
	}
	if (!Number.isSafeInteger(epochs) || epochs < 2 || epochs > 20 || epochs > density) {
		throw new Error("epochs must be an integer between 2 and min(20, density)");
	}
}

function parseAnswers(text) {
	if (typeof text !== "string") throw new Error("probe response is not text");
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("probe response does not contain a JSON object");
	const value = JSON.parse(text.slice(start, end + 1));
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("probe response JSON is not an object");
	}
	if (typeof value.answers !== "object" || value.answers === null || Array.isArray(value.answers)) {
		throw new Error("probe response JSON has no answers object");
	}
	return value.answers;
}

function aggregateScores(scores) {
	const matched = scores.filter((score) => score.matched).length;
	return {
		matched,
		total: scores.length,
		rate: scores.length === 0 ? 0 : round(matched / scores.length),
	};
}

function groupedScores(scores, selector) {
	const keys = [...new Set(scores.map(selector))].sort(naturalCompare);
	return Object.fromEntries(
		keys.map((key) => [
			String(key),
			aggregateScores(scores.filter((score) => selector(score) === key)),
		]),
	);
}

function pairedOutcomes(trials) {
	const outcomes = { bothMatched: 0, codexOnly: 0, nativeOnly: 0, bothMissed: 0 };
	for (const trial of trials) {
		const native = new Map(
			trial.arms.native.quality.scores.map((score) => [score.questionId, score.matched]),
		);
		for (const score of trial.arms.codex.quality.scores) {
			const nativeMatched = native.get(score.questionId) ?? false;
			if (nativeMatched && score.matched) outcomes.bothMatched += 1;
			else if (score.matched) outcomes.codexOnly += 1;
			else if (nativeMatched) outcomes.nativeOnly += 1;
			else outcomes.bothMissed += 1;
		}
	}
	return outcomes;
}

function summarizeArm(samples) {
	const values = (selector) => samples.map(selector).filter((value) => value !== undefined);
	return {
		compactionLatencyMs: summarizeNumbers(values((sample) => sample.compaction?.latencyMs)),
		compactionCostUsd: summarizeNumbers(values((sample) => sample.compaction?.costUsd)),
		compactionInputTokens: summarizeNumbers(values((sample) => sample.compaction?.inputTokens)),
		compactionOutputTokens: summarizeNumbers(values((sample) => sample.compaction?.outputTokens)),
		estimatedTokensAfter: summarizeNumbers(
			values((sample) => sample.compaction?.estimatedTokensAfter),
		),
		probeLatencyMs: summarizeNumbers(values((sample) => sample.probe?.latencyMs)),
		probeCostUsd: summarizeNumbers(values((sample) => sample.probe?.costUsd)),
		probeInputTokens: summarizeNumbers(values((sample) => sample.probe?.inputTokens)),
		endToEndLatencyMs: summarizeNumbers(values((sample) => sample.total?.latencyMs)),
		endToEndCostUsd: summarizeNumbers(values((sample) => sample.total?.costUsd)),
	};
}

function summarizePairedMetrics(trials) {
	const difference = (selector) =>
		summarizeNumbers(
			trials
				.map((trial) => {
					const native = selector(trial.arms.native);
					const codex = selector(trial.arms.codex);
					return native === undefined || codex === undefined ? undefined : codex - native;
				})
				.filter((value) => value !== undefined),
		);
	return {
		compactionLatencyMs: difference((arm) => arm.compaction?.latencyMs),
		compactionCostUsd: difference((arm) => arm.compaction?.costUsd),
		probeInputTokens: difference((arm) => arm.probe?.inputTokens),
		qualityRate: difference((arm) => arm.quality?.rate),
		endToEndLatencyMs: difference((arm) => arm.total?.latencyMs),
		endToEndCostUsd: difference((arm) => arm.total?.costUsd),
	};
}

function trialCost(trial) {
	return Object.values(trial.arms).reduce(
		(total, arm) => total + (arm.compaction?.costUsd ?? 0) + (arm.probe?.costUsd ?? 0),
		0,
	);
}

function naturalCompare(left, right) {
	if (typeof left === "number" && typeof right === "number") return left - right;
	return String(left).localeCompare(String(right));
}

function quantile(sorted, value) {
	const index = (sorted.length - 1) * value;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) return sorted[lower];
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function round(value) {
	return Number(value.toFixed(6));
}
