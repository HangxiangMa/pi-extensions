import assert from "node:assert/strict";
import { test } from "vitest";
import { classifyStructuredOutcome } from "../src/outcome.js";

test("typed outcomes recommend failure-specific recovery without replaying semantic work", () => {
	assert.deepEqual(classifyStructuredOutcome("needs-input", "missing-dependency"), {
		status: "needs-input",
		reasonCode: "missing-dependency",
		recoveryActions: ["supply-input"],
		retryable: false,
	});
	assert.deepEqual(classifyStructuredOutcome("failed", "transient-transport"), {
		status: "failed",
		reasonCode: "transient-transport",
		recoveryActions: ["retry"],
		retryable: true,
	});
	assert.deepEqual(classifyStructuredOutcome("stale", "dependency-superseded"), {
		status: "stale",
		reasonCode: "dependency-superseded",
		recoveryActions: ["revalidate"],
		retryable: false,
	});
});

test("unclassified semantic failures stop instead of blindly retrying", () => {
	const outcome = classifyStructuredOutcome("failed", "semantic-conflict");
	assert.equal(outcome.retryable, false);
	assert.deepEqual(outcome.recoveryActions, ["stop"]);
});
