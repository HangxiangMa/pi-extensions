import assert from "node:assert/strict";
import { test } from "vitest";
import { DEFAULT_MAX_CONTEXT_BYTES } from "../src/limits.js";
import {
	type PanelReview,
	panelReviewInstruction,
	parsePanelReview,
	parsePanelSynthesis,
} from "../src/panel-contract.js";
import { PanelEvidenceLedger } from "../src/panel-evidence.js";
import { classifyPanelFailure } from "../src/panel-failure.js";
import { planPanelBudgets, validatePanelRequest } from "../src/panel-planning.js";
import { buildPanelReviewerPrompt, buildPanelSynthesisPrompt } from "../src/panel-prompts.js";
import { reconcilePanel } from "../src/panel-reconciliation.js";

function review(overrides: Partial<PanelReview> = {}): PanelReview {
	return {
		version: "pi-subagents:panel-review:v1",
		reviewerId: "reviewer-a",
		disposition: "fail",
		blocking: true,
		findings: [
			{
				id: "F1",
				severity: "high",
				title: "Unsafe path",
				claim: "The path is unsafe.",
				evidence: ["src/a.ts:10"],
			},
		],
		missingChecks: ["runtime smoke"],
		limitations: [],
		...overrides,
	};
}

test("panel review contracts are strict, bounded, redacted, and reviewer-bound", () => {
	const parsed = parsePanelReview(JSON.stringify(review()), "reviewer-a", {
		agent: "reviewer",
		model: "provider/model",
		taskGeneration: 3,
	});
	assert.ok(parsed);
	assert.equal(parsed.provenance?.reviewerId, "reviewer-a");
	assert.equal(parsed.provenance?.taskGeneration, 3);
	assert.equal(parsed.provenance?.agent, "reviewer");
	assert.equal(
		parsePanelReview(JSON.stringify({ ...review(), reviewerId: "invented" }), "reviewer-a"),
		undefined,
	);
	assert.equal(
		parsePanelReview(JSON.stringify({ ...review(), extra: true }), "reviewer-a"),
		undefined,
	);
	assert.equal(
		parsePanelReview(
			JSON.stringify({
				...review(),
				findings: [review().findings[0], review().findings[0]],
			}),
			"reviewer-a",
		),
		undefined,
	);
	assert.match(panelReviewInstruction("reviewer-a"), /one JSON object/i);
	assert.match(panelReviewInstruction("reviewer-a"), /reviewer-a/);
});

test("panel reviewer prompts keep a byte-identical shared block and hide siblings", () => {
	const common = {
		panelId: "panel-1",
		preset: "code-review" as const,
		task: "Review the change",
		context: "shared snapshot",
	};
	const first = buildPanelReviewerPrompt({
		...common,
		reviewerId: "a",
		focus: "correctness",
	});
	const second = buildPanelReviewerPrompt({ ...common, reviewerId: "b", focus: "tests" });
	assert.equal(first.split("\n\nReviewer id:")[0], second.split("\n\nReviewer id:")[0]);
	assert.doesNotMatch(first, /Reviewer id: b|Reviewer focus:\ntests/u);
	assert.doesNotMatch(second, /Reviewer id: a|Reviewer focus:\ncorrectness/u);
});

test("panel prompts preserve required contracts at maximum input bounds", () => {
	const common = {
		panelId: "bounded-panel",
		preset: "research" as const,
		task: "t".repeat(DEFAULT_MAX_CONTEXT_BYTES),
		context: "c".repeat(DEFAULT_MAX_CONTEXT_BYTES),
	};
	const first = buildPanelReviewerPrompt({
		...common,
		reviewerId: "a",
		focus: "f".repeat(8 * 1024),
	});
	const second = buildPanelReviewerPrompt({ ...common, reviewerId: "b" });
	assert.ok(Buffer.byteLength(first, "utf8") <= DEFAULT_MAX_CONTEXT_BYTES);
	assert.ok(Buffer.byteLength(second, "utf8") <= DEFAULT_MAX_CONTEXT_BYTES);
	assert.equal(first.split("\n\nReviewer id:")[0], second.split("\n\nReviewer id:")[0]);
	assert.match(first, /Reviewer id: a/u);
	assert.match(first, /Panel review contract:/u);
	assert.match(first, /pi-subagents:panel-review:v1/u);
	assert.match(first, /Shared task:/u);
	assert.match(first, /Shared context:/u);

	const reviews = [
		review({ reviewerId: "a", blocking: false, findings: [] }),
		review({ reviewerId: "b", blocking: false, findings: [] }),
	];
	const synthesis = buildPanelSynthesisPrompt({
		panelId: "bounded-panel",
		task: common.task,
		reviews,
		failures: [],
	});
	assert.ok(Buffer.byteLength(synthesis, "utf8") <= DEFAULT_MAX_CONTEXT_BYTES);
	assert.match(synthesis, /Panel evidence artifacts:/u);
	assert.match(synthesis, /Panel synthesis contract:/u);
	assert.match(synthesis, /pi-subagents:panel-synthesis:v1/u);
});

test("panel synthesis rejects fabricated reviewers and omitted blocking objections", () => {
	const reviews = [review(), review({ reviewerId: "reviewer-b", blocking: false, findings: [] })];
	const valid = {
		version: "pi-subagents:panel-synthesis:v1",
		disposition: "fail",
		summary: "One blocker remains.",
		validReviewerIds: ["reviewer-a", "reviewer-b"],
		failedReviewerIds: [],
		agreements: [],
		disagreements: [],
		objections: [
			{
				reviewerId: "reviewer-a",
				findingId: "F1",
				resolution: "unresolved",
				evidence: [],
			},
		],
		limitations: [],
	};
	assert.ok(parsePanelSynthesis(JSON.stringify(valid), reviews, []));
	assert.equal(
		parsePanelSynthesis(
			JSON.stringify({ ...valid, validReviewerIds: ["reviewer-a", "invented"] }),
			reviews,
			[],
		),
		undefined,
	);
	assert.equal(
		parsePanelSynthesis(JSON.stringify({ ...valid, objections: [] }), reviews, []),
		undefined,
	);
});

test("panel planning reserves synthesis and cleanup before launch", () => {
	const budgets = planPanelBudgets(10_000, 3);
	assert.equal(
		budgets.reviewMs + budgets.finalizationMs + budgets.synthesisMs + budgets.cleanupMs,
		10_000,
	);
	assert.ok(budgets.synthesisMs > 0);
	assert.ok(budgets.cleanupMs > 0);
	assert.ok(budgets.reviewerTimeoutMs <= budgets.reviewMs);
	assert.throws(() => planPanelBudgets(3, 2), /too small/i);

	assert.throws(
		() =>
			validatePanelRequest({
				task: "review",
				reviewers: [
					{ id: "same", agent: "reviewer" },
					{ id: "same", agent: "explorer" },
				],
				synthesizer: { agent: "reviewer" },
			}),
		/unique/i,
	);
	assert.throws(
		() =>
			validatePanelRequest({
				task: "review",
				reviewers: [
					{ id: "unsafe\u001b", agent: "reviewer" },
					{ id: "safe", agent: "reviewer" },
				],
				synthesizer: { agent: "reviewer" },
			}),
		/safe identifier/i,
	);
	assert.throws(
		() =>
			validatePanelRequest(
				{
					task: "review",
					reviewers: [
						{ id: "a", agent: "reviewer" },
						{ id: "b", agent: "reviewer" },
						{ id: "c", agent: "reviewer" },
					],
					synthesizer: { agent: "reviewer" },
				},
				2,
			),
		/configured max/i,
	);
});

test("evidence ledger accepts monotonic current-generation artifacts only", () => {
	const ledger = new PanelEvidenceLedger("panel-1", 3);
	assert.equal(ledger.publish(review(), 1), true);
	assert.equal(ledger.publish(review({ disposition: "partial" }), 1), false);
	assert.equal(ledger.publish(review({ reviewerId: "reviewer-b" }), 2), false);
	assert.equal(ledger.latest("reviewer-a")?.revision, 1);
	assert.equal(ledger.snapshot().length, 1);
	const generated = new PanelEvidenceLedger("panel-generation", 2);
	assert.equal(
		generated.publish(
			{
				...review(),
				provenance: { reviewerId: "reviewer-a", taskGeneration: 1 },
			},
			1,
		),
		true,
	);
	assert.equal(
		generated.publish(
			{
				...review({ disposition: "partial" }),
				provenance: { reviewerId: "reviewer-a", taskGeneration: 2 },
			},
			2,
		),
		false,
	);

	const bounded = new PanelEvidenceLedger("panel-bounded", 2);
	const large = review({
		findings: [
			{
				...review().findings[0],
				claim: "x".repeat(13 * 1024),
			},
		],
	});
	assert.equal(bounded.publish(large, 1), true);
	assert.equal(bounded.publish({ ...large, reviewerId: "reviewer-b" }, 1), false);
});

test("panel recovery distinguishes transient failures from semantic failures", () => {
	assert.deepEqual(classifyPanelFailure({ launchFailed: true }), {
		kind: "transient-launch",
		retryable: true,
	});
	assert.deepEqual(classifyPanelFailure({ resultContractInvalid: true }), {
		kind: "invalid-contract",
		retryable: false,
	});
	assert.deepEqual(classifyPanelFailure({ stopReason: "semantic-stall" }), {
		kind: "semantic-stall",
		retryable: false,
	});
});

test("reconciliation never turns corroboration or votes into verification", () => {
	const result = reconcilePanel({
		reviews: [review(), review({ reviewerId: "reviewer-b" })],
		failures: [],
		minValidReviews: 2,
	});
	assert.equal(result.kind, "ready-for-synthesis");
	assert.equal(result.blockingObjections.length, 2);
	assert.equal(result.verified, false);

	const insufficient = reconcilePanel({
		reviews: [review()],
		failures: [{ reviewerId: "reviewer-b", kind: "semantic-stall", retryable: false }],
		minValidReviews: 2,
	});
	assert.equal(insufficient.kind, "insufficient-panel");
	assert.equal(insufficient.partialReviews.length, 1);
	assert.equal(insufficient.consensus, false);
});
