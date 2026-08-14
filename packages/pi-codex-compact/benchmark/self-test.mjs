#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	BENCHMARK_ID,
	buildProbePrompt,
	CATEGORIES,
	createBenchmarkFixture,
	scoreProbeResponse,
	summarizeBenchmarkTrials,
	summarizeNumbers,
} from "./core.mjs";
import { writeResultFile } from "./result-file.mjs";

assert.equal(BENCHMARK_ID, "pi-codex-compact-comparison:v2");

const fixtureOptions = {
	seed: 301,
	density: 120,
	targetTokens: 50_000,
	questionsPerCategory: 10,
	epochs: 10,
};
const fixture = createBenchmarkFixture(fixtureOptions);
const repeated = createBenchmarkFixture(fixtureOptions);
const differentSeed = createBenchmarkFixture({ ...fixtureOptions, seed: 302 });

assert.deepEqual(repeated, fixture, "the same seed must reproduce the whole fixture");
assert.notDeepEqual(
	differentSeed.questions.map((question) => question.expected),
	fixture.questions.map((question) => question.expected),
	"different seeds must produce different authoritative values",
);
assert.ok(
	Math.abs(fixture.historyEstimatedTokens - fixture.targetTokens) / fixture.targetTokens <= 0.02,
	`fixed-length fixture drifted to ${fixture.historyEstimatedTokens} tokens`,
);
assert.equal(fixture.authoritativeRecords, fixture.density * CATEGORIES.length);
assert.equal(fixture.questions.length, CATEGORIES.length * fixtureOptions.questionsPerCategory);
assert.deepEqual(
	[...new Set(fixture.questions.map((question) => question.category))].sort(),
	[...CATEGORIES].sort(),
);
assert.deepEqual(
	[...new Set(fixture.questions.map((question) => question.epoch))].sort((a, b) => a - b),
	Array.from({ length: fixtureOptions.epochs }, (_, index) => index),
	"selected questions must cover every history epoch",
);

const userHistory = fixture.messages
	.filter((message) => message.role === "user")
	.map((message) => message.content)
	.join("\n");
for (const question of fixture.questions) {
	assert.equal(
		userHistory.includes(question.expected),
		false,
		`expected value leaked into a retained user message: ${question.id}`,
	);
	assert.equal(
		JSON.stringify(fixture.messages).includes(question.question),
		false,
		`quality question appeared before compaction: ${question.id}`,
	);
}

for (const density of [120, 200]) {
	const fixedLength = createBenchmarkFixture({
		...fixtureOptions,
		density,
		questionsPerCategory: 15,
	});
	assert.ok(
		Math.abs(fixedLength.historyEstimatedTokens - fixedLength.targetTokens) /
			fixedLength.targetTokens <=
			0.02,
		`density ${density} drifted to ${fixedLength.historyEstimatedTokens} tokens`,
	);
}

const prompt = buildProbePrompt(fixture.questions);
for (const question of fixture.questions) assert.match(prompt, new RegExp(question.id));

const perfectAnswers = Object.fromEntries(
	fixture.questions.map((question) => [question.id, question.expected]),
);
const perfect = scoreProbeResponse(JSON.stringify({ answers: perfectAnswers }), fixture.questions);
assert.equal(perfect.matched, fixture.questions.length);
assert.equal(perfect.rate, 1);
assert.equal(perfect.parseError, undefined);
assert.equal(perfect.byCategory.exact_recall.rate, 1);
assert.equal(perfect.byEpoch["0"].rate, 1);

const malformed = scoreProbeResponse("not JSON", fixture.questions);
assert.equal(malformed.matched, 0);
assert.ok(malformed.parseError);

const oneQuestionFixture = createBenchmarkFixture({
	seed: 401,
	density: 20,
	targetTokens: 30_000,
	questionsPerCategory: 1,
	epochs: 5,
});
const makeQuality = (wrongFirst = false) => {
	const answers = Object.fromEntries(
		oneQuestionFixture.questions.map((question, index) => [
			question.id,
			wrongFirst && index === 0 ? "wrong" : question.expected,
		]),
	);
	return scoreProbeResponse(JSON.stringify({ answers }), oneQuestionFixture.questions);
};
const metric = (value) => ({
	compaction: {
		latencyMs: 100 + value,
		costUsd: 0.1 + value / 100,
		inputTokens: 1_000,
		outputTokens: 100,
		estimatedTokensAfter: 500,
	},
	probe: { latencyMs: 50, costUsd: 0.05, inputTokens: 600, outputTokens: 60 },
	total: { latencyMs: 150 + value, costUsd: 0.15 + value / 100 },
});
const trials = [401, 402].map((seed, index) => ({
	fixture: { seed, density: 20 },
	arms: {
		full: { probe: metric(0).probe, quality: makeQuality(false) },
		native: { ...metric(index), quality: makeQuality(true) },
		codex: { ...metric(index + 10), quality: makeQuality(false) },
	},
}));
const summary = summarizeBenchmarkTrials(trials);
assert.equal(summary.trials, 2);
assert.equal(summary.independentSeeds, 2);
assert.equal(summary.quality.overall.full.rate, 1);
assert.equal(summary.quality.overall.codex.rate, 1);
assert.equal(summary.quality.overall.native.matched, 8);
assert.equal(summary.fullContextControl.passed, true);
assert.deepEqual(summary.fullContextControl.failedFixtures, []);
assert.equal(summary.pairedCodexVsNative.codexOnly, 2);
assert.equal(summary.pairedCodexVsNative.nativeOnly, 0);
assert.equal(summary.quality.byDensity["20"].codex.rate, 1);
assert.equal(summary.quality.bySeed["401"].full.rate, 1);
assert.equal(summary.codexMinusNative.compactionLatencyMs.median, 10);
const failedControlTrials = structuredClone(trials);
failedControlTrials[0].arms.full.quality.scores[0].matched = false;
const failedControlSummary = summarizeBenchmarkTrials(failedControlTrials);
assert.equal(failedControlSummary.fullContextControl.passed, false);
assert.equal(failedControlSummary.fullContextControl.failedFixtures.length, 1);
assert.deepEqual(summarizeNumbers([3, 1, 2]), {
	count: 3,
	median: 2,
	medianAbsoluteDeviation: 1,
	min: 1,
	max: 3,
});

const resultDirectory = await mkdtemp(path.join(tmpdir(), "pi-codex-compact-result-test-"));
try {
	const resultPath = path.join(resultDirectory, "result.json");
	const original = '{"status":"previous"}\n';
	await writeFile(resultPath, original, "utf8");
	await assert.rejects(
		writeResultFile(
			resultPath,
			{ status: "replacement" },
			{
				renameFile: async () => {
					throw new Error("simulated publication failure");
				},
			},
		),
		/simulated publication failure/,
	);
	assert.equal(await readFile(resultPath, "utf8"), original);
	assert.deepEqual(await readdir(resultDirectory), ["result.json"]);

	await writeResultFile(resultPath, { status: "replacement" });
	assert.deepEqual(JSON.parse(await readFile(resultPath, "utf8")), { status: "replacement" });
	assert.deepEqual(await readdir(resultDirectory), ["result.json"]);
} finally {
	await rm(resultDirectory, { recursive: true, force: true });
}

process.stdout.write("pi-codex-compact benchmark self-test passed\n");
