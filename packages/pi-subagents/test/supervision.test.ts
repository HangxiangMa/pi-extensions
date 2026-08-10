import assert from "node:assert/strict";
import { test } from "vitest";
import type { SingleResult } from "../src/runner.js";
import { runHedgedAttempt } from "../src/supervision.js";

function result(exitCode: number, output: string): SingleResult {
	return {
		agent: "scout",
		agentSource: "built-in",
		task: "inspect",
		exitCode,
		messages: [],
		stderr: exitCode === 0 ? "" : "failed",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
			contextTokens: 0,
			turns: 0,
		},
		finalOutput: output,
	};
}

test("hedged supervision stops waiting for an abort-ignoring loser after bounded grace", async () => {
	let calls = 0;
	const startedAt = Date.now();
	const attempted = await runHedgedAttempt(
		async () => {
			calls++;
			if (calls === 1) {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return result(0, "winner");
			}
			return new Promise<SingleResult>(() => undefined);
		},
		undefined,
		1,
		10,
	);
	assert.equal(attempted.result.finalOutput, "winner");
	assert.ok(Date.now() - startedAt < 200);
});

test("hedged supervision waits for the other active attempt after the first failure", async () => {
	let calls = 0;
	const attempted = await runHedgedAttempt(
		async () => {
			calls++;
			const call = calls;
			await new Promise((resolve) => setTimeout(resolve, call === 1 ? 20 : 30));
			return call === 1 ? result(1, "") : result(0, "recovered");
		},
		undefined,
		1,
	);
	assert.equal(attempted.hedged, true);
	assert.equal(attempted.result.exitCode, 0);
	assert.equal(attempted.result.finalOutput, "recovered");
});
