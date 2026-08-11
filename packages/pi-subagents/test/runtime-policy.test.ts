import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
	assertSubagentDepthAllowed,
	FALLBACK_TIMEOUT_MS,
	parsePositiveInteger,
	resolveDefaultSubagentTimeoutMs,
} from "../src/execution/runtime-policy.js";

const originalTimeout = process.env.PI_SUBAGENT_TIMEOUT_MS;
const originalDepth = process.env.PI_SUBAGENT_DEPTH;
const originalMaxDepth = process.env.PI_SUBAGENT_MAX_DEPTH;

afterEach(() => {
	restoreEnvironment("PI_SUBAGENT_TIMEOUT_MS", originalTimeout);
	restoreEnvironment("PI_SUBAGENT_DEPTH", originalDepth);
	restoreEnvironment("PI_SUBAGENT_MAX_DEPTH", originalMaxDepth);
});

test("runtime policy preserves positive integer parsing compatibility", () => {
	assert.equal(parsePositiveInteger(undefined), undefined);
	assert.equal(parsePositiveInteger(""), undefined);
	assert.equal(parsePositiveInteger("invalid"), undefined);
	assert.equal(parsePositiveInteger("0"), undefined);
	assert.equal(parsePositiveInteger("-1"), undefined);
	assert.equal(parsePositiveInteger("42ms"), 42);
});

test("runtime policy resolves timeout overrides and fallback", () => {
	delete process.env.PI_SUBAGENT_TIMEOUT_MS;
	assert.equal(resolveDefaultSubagentTimeoutMs(), FALLBACK_TIMEOUT_MS);
	process.env.PI_SUBAGENT_TIMEOUT_MS = "invalid";
	assert.equal(resolveDefaultSubagentTimeoutMs(), FALLBACK_TIMEOUT_MS);
	process.env.PI_SUBAGENT_TIMEOUT_MS = "2500";
	assert.equal(resolveDefaultSubagentTimeoutMs(), 2500);
});

test("runtime policy rejects recursion at the configured boundary", () => {
	process.env.PI_SUBAGENT_DEPTH = "1";
	process.env.PI_SUBAGENT_MAX_DEPTH = "2";
	assert.doesNotThrow(() => assertSubagentDepthAllowed());
	process.env.PI_SUBAGENT_DEPTH = "2";
	assert.throws(() => assertSubagentDepthAllowed(), /depth limit reached \(2\)/);
});

function restoreEnvironment(name: string, value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
