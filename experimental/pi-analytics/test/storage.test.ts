import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
	AnalyticsDatabaseOpenError,
	AnalyticsStorageUnavailableError,
	openAnalyticsDatabase,
} from "../src/storage/database.js";
import { type AnalyticsSnapshot, resolveTimeRange } from "../src/storage/queries.js";
import { AnalyticsStore } from "../src/storage/store.js";
import type { SettledRun } from "../src/types.js";

function emptyAnalyticsSnapshot(): AnalyticsSnapshot {
	return {
		overview: {
			responseCycles: 0,
			llmCalls: 0,
			callsPerResponse: 0,
			p95CallsPerResponse: 0,
			toolCalls: 0,
			toolErrors: 0,
			skillActivations: 0,
			providerErrors: 0,
			recoveredErrors: 0,
		},
		skills: [],
		tools: [],
		reliability: {
			http429: 0,
			http5xx: 0,
			recovered: 0,
			terminal: 0,
			categories: {
				dns: 0,
				timeout: 0,
				connection_refused: 0,
				connection_reset: 0,
				tls: 0,
				network_other: 0,
				provider_other: 0,
			},
		},
		responses: {
			count: 0,
			llmCalls: 0,
			average: 0,
			median: 0,
			p95: 0,
			maximum: 0,
			distribution: { one: 0, twoToThree: 0, fourToSix: 0, sevenPlus: 0 },
		},
	};
}

function run(id: string, startedAtMs: number, options: Partial<SettledRun> = {}): SettledRun {
	return {
		id,
		startedAtMs,
		finishedAtMs: startedAtMs + 100,
		durationMs: 100,
		triggerSource: "interactive",
		initialProvider: "openai",
		initialModel: "gpt-test",
		outcome: "success",
		attemptCount: 1,
		generations: [],
		tools: [],
		skills: [],
		providerErrors: [],
		toolErrorCount: 0,
		providerErrorCount: 0,
		recoveredErrorCount: 0,
		...options,
	};
}

async function fixture(t: test.TestContext): Promise<{ file: string; store: AnalyticsStore }> {
	const directory = await mkdtemp(path.join(tmpdir(), "pi-analytics-store-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const file = path.join(directory, "analytics.db");
	const database = await openAnalyticsDatabase({ path: file });
	const store = new AnalyticsStore(database);
	t.after(() => store.close().catch(() => undefined));
	return { file, store };
}

test("store close drains an in-flight dashboard query before closing the driver", async () => {
	let release!: () => void;
	const blocked = new Promise<AnalyticsSnapshot>((resolve) => {
		release = () => resolve(emptyAnalyticsSnapshot());
	});
	let driverClosed = false;
	const store = new AnalyticsStore(
		{
			connection: {} as never,
			path: "/tmp/test.db",
			async close() {
				driverClosed = true;
			},
		},
		{ querySnapshot: async () => blocked },
	);
	const reading = store.getSnapshot({ fromMs: 0, toMs: 1 });
	const closing = store.close();
	await Promise.resolve();
	assert.equal(driverClosed, false);
	release();
	await reading;
	await closing;
	assert.equal(driverClosed, true);
});

test("database opens privately, migrates, and closes idempotently", async (t) => {
	const { file, store } = await fixture(t);
	if (process.platform !== "win32") {
		assert.equal((await stat(file)).mode & 0o777, 0o600);
		assert.equal((await stat(`${file}-wal`)).mode & 0o777, 0o600);
	}
	await store.close();
	await store.close();
});

test("database startup refuses linked database and WAL files", async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "pi-analytics-linked-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const target = path.join(directory, "target");
	await writeFile(target, "do not replace");
	const databasePath = path.join(directory, "analytics.db");
	await symlink(target, databasePath);
	await assert.rejects(openAnalyticsDatabase({ path: databasePath }), AnalyticsDatabaseOpenError);
	assert.equal(await readFile(target, "utf8"), "do not replace");
	await rm(databasePath);
	await writeFile(databasePath, "");
	await symlink(target, `${databasePath}-wal`);
	await assert.rejects(openAnalyticsDatabase({ path: databasePath }), AnalyticsDatabaseOpenError);
	assert.equal(await readFile(target, "utf8"), "do not replace");
});

test("missing native storage is a typed local failure", async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "pi-analytics-unavailable-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await assert.rejects(
		openAnalyticsDatabase({
			path: path.join(directory, "analytics.db"),
			loadModule: async () => {
				throw new Error("missing native binding at /private/user/path");
			},
		}),
		AnalyticsStorageUnavailableError,
	);
});

test("store atomically publishes a run and returns reconciled analytics", async (t) => {
	const { store } = await fixture(t);
	const started = new Date(2026, 7, 2, 12).getTime();
	await store.recordRun(
		run("run-1", started, {
			outcome: "recovered_success",
			attemptCount: 2,
			generations: [
				{
					id: "g1",
					ordinal: 0,
					provider: "openai",
					model: "gpt-a",
					startedAtMs: started,
					finishedAtMs: started + 10,
					durationMs: 10,
					stopReason: "error",
					outcome: "error",
					responses: [
						{ ordinal: 0, occurredAtMs: started + 1, status: 429 },
						{ ordinal: 1, occurredAtMs: started + 2, status: 500 },
					],
				},
				{
					id: "g2",
					ordinal: 1,
					provider: "anthropic",
					model: "claude-b",
					startedAtMs: started + 20,
					finishedAtMs: started + 40,
					durationMs: 20,
					stopReason: "stop",
					outcome: "stop",
					responses: [{ ordinal: 0, occurredAtMs: started + 21, status: 200 }],
				},
			],
			tools: [
				{
					id: "tool-1",
					ordinal: 0,
					name: "read",
					provider: "openai",
					model: "gpt-a",
					startedAtMs: started + 5,
					finishedAtMs: started + 15,
					durationMs: 10,
					isError: true,
					completionState: "finished",
				},
			],
			skills: [
				{
					id: "skill-1",
					name: "reviewing-code",
					initiatedBy: "model",
					occurredAtMs: started + 5,
					provider: "openai",
					model: "gpt-a",
				},
			],
			providerErrors: [
				{
					id: "error-1",
					generationId: "g1",
					occurredAtMs: started + 10,
					provider: "openai",
					model: "gpt-a",
					category: "timeout",
					recovered: true,
					terminal: false,
				},
			],
			toolErrorCount: 1,
			providerErrorCount: 3,
			recoveredErrorCount: 3,
		}),
	);

	const snapshot = await store.getSnapshot({ fromMs: started - 1, toMs: started + 1_000 });
	assert.deepEqual(snapshot.overview, {
		responseCycles: 1,
		llmCalls: 2,
		callsPerResponse: 2,
		p95CallsPerResponse: 2,
		toolCalls: 1,
		toolErrors: 1,
		skillActivations: 1,
		providerErrors: 3,
		recoveredErrors: 3,
	});
	assert.equal(snapshot.skills[0]?.name, "reviewing-code");
	assert.deepEqual(snapshot.skills[0]?.models, [{ provider: "openai", model: "gpt-a", count: 1 }]);
	assert.equal(snapshot.tools[0]?.averageDurationMs, 10);
	assert.equal(snapshot.reliability.http429, 1);
	assert.equal(snapshot.reliability.http5xx, 1);
	assert.equal(snapshot.reliability.categories.timeout, 1);
	assert.deepEqual(snapshot.responses.distribution, {
		one: 0,
		twoToThree: 1,
		fourToSix: 0,
		sevenPlus: 0,
	});
});

test("skill model breakdown merges user and model activation rows", async (t) => {
	const { store } = await fixture(t);
	for (const [index, initiatedBy] of ["model", "user"].entries()) {
		await store.recordRun(
			run(`skill-run-${index}`, index + 1, {
				skills: [
					{
						id: `skill-${index}`,
						name: "reviewing-code",
						initiatedBy: initiatedBy as "model" | "user",
						occurredAtMs: index + 1,
						provider: "openai",
						model: "gpt-test",
					},
				],
			}),
		);
	}
	const skill = (await store.getSnapshot({ fromMs: 0, toMs: 10 })).skills[0];
	assert.equal(skill?.modelInitiated, 1);
	assert.equal(skill?.userInitiated, 1);
	assert.deepEqual(skill?.models, [{ provider: "openai", model: "gpt-test", count: 2 }]);
});

test("run publication is idempotent and rolls back conflicting child rows", async (t) => {
	const { store } = await fixture(t);
	await store.recordRun(run("one", 1));
	await store.recordRun(run("one", 1));
	await store.recordRun(
		run("two", 2, {
			tools: [
				{
					id: "shared",
					ordinal: 0,
					name: "read",
					startedAtMs: 2,
					isError: false,
					completionState: "finished",
				},
			],
		}),
	);
	await assert.rejects(
		store.recordRun(
			run("three", 3, {
				tools: [
					{
						id: "shared",
						ordinal: 0,
						name: "bash",
						startedAtMs: 3,
						isError: false,
						completionState: "finished",
					},
				],
			}),
		),
	);
	const snapshot = await store.getSnapshot({ fromMs: 0, toMs: 10 });
	assert.equal(snapshot.overview.responseCycles, 2);
	await assert.rejects(store.close(), /pending writes could not be saved/i);
});

test("two stores write the same database and clear committed observations transactionally", async (t) => {
	const directory = await mkdtemp(path.join(tmpdir(), "pi-analytics-concurrent-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const file = path.join(directory, "analytics.db");
	const left = new AnalyticsStore(await openAnalyticsDatabase({ path: file }));
	const right = new AnalyticsStore(await openAnalyticsDatabase({ path: file }));
	t.after(async () => Promise.all([left.close(), right.close()]));
	await Promise.all(
		Array.from({ length: 20 }, (_, index) =>
			(index % 2 ? left : right).recordRun(run(`run-${index}`, index + 1)),
		),
	);
	assert.equal((await left.getSnapshot({ fromMs: 0, toMs: 100 })).overview.responseCycles, 20);
	assert.equal(await left.clearAll(), 20);
	assert.equal((await left.getSnapshot({ fromMs: 0, toMs: 100 })).overview.responseCycles, 0);
});

test("response statistics honor exact bounds and nearest-rank percentiles", async (t) => {
	const { store } = await fixture(t);
	for (const [index, calls] of [1, 2, 3, 4, 7, 9].entries()) {
		await store.recordRun(
			run(`range-${index}`, 100 + index, {
				generations: Array.from({ length: calls }, (_, ordinal) => ({
					id: `range-${index}-generation-${ordinal}`,
					ordinal,
					startedAtMs: 100 + index,
					outcome: "stop" as const,
					responses: [],
				})),
			}),
		);
	}
	const snapshot = await store.getSnapshot({ fromMs: 101, toMs: 105 });
	assert.equal(snapshot.responses.count, 4);
	assert.equal(snapshot.responses.average, 4);
	assert.equal(snapshot.responses.median, 3.5);
	assert.equal(snapshot.responses.p95, 7);
	assert.equal(snapshot.responses.maximum, 7);
	assert.deepEqual(snapshot.responses.distribution, {
		one: 0,
		twoToThree: 2,
		fourToSix: 1,
		sevenPlus: 1,
	});
});

test("time ranges use local Today and rolling windows", () => {
	const now = new Date(2026, 7, 2, 15, 30).getTime();
	assert.equal(resolveTimeRange("today", now).fromMs, new Date(2026, 7, 2).getTime());
	assert.equal(resolveTimeRange("7d", now).fromMs, now - 7 * 24 * 60 * 60 * 1_000);
	assert.equal(resolveTimeRange("30d", now).fromMs, now - 30 * 24 * 60 * 60 * 1_000);
	assert.equal(resolveTimeRange("all", now).fromMs, 0);
	assert.equal(resolveTimeRange("all", now).toMs, now + 1);
});
