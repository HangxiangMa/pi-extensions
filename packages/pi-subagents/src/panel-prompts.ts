import { DEFAULT_MAX_CONTEXT_BYTES, truncateUtf8 } from "./limits.js";
import {
	type PanelReview,
	panelReviewInstruction,
	panelSynthesisInstruction,
} from "./panel-contract.js";
import type { PanelFailure } from "./panel-failure.js";
import type { PanelPreset } from "./panel-planning.js";

const PRESET_GUIDANCE: Record<PanelPreset, string> = {
	"code-review":
		"Review correctness, regressions, baseline security, maintainability, tests, and integration risk.",
	research:
		"Assess source quality, evidence traceability, contradictory evidence, uncertainty, and unsupported claims.",
	"security-review":
		"Review trust boundaries, authority, injection, data exposure, unsafe side effects, and missing mitigations.",
	custom: "Apply the shared task and your assigned focus without inventing unstated requirements.",
};

export function buildPanelReviewerPrompt(input: {
	panelId: string;
	preset: PanelPreset;
	task: string;
	context?: string;
	reviewerId: string;
	focus?: string;
}): string {
	const shared = [
		`Panel: ${input.panelId}`,
		`Preset: ${input.preset}`,
		`Shared task:\n${input.task}`,
		input.context ? `Shared context:\n${input.context}` : undefined,
		`Preset guidance:\n${PRESET_GUIDANCE[input.preset]}`,
	]
		.filter((part): part is string => Boolean(part))
		.join("\n\n");
	const reviewer = [
		`Reviewer id: ${input.reviewerId}`,
		input.focus ? `Reviewer focus:\n${input.focus}` : undefined,
		"Work independently and do not assume another reviewer will catch or resolve a problem.",
		`Panel review contract:\n${panelReviewInstruction(input.reviewerId)}`,
	]
		.filter((part): part is string => Boolean(part))
		.join("\n\n");
	return truncateUtf8(`${shared}\n\n${reviewer}`, DEFAULT_MAX_CONTEXT_BYTES).text;
}

export function buildPanelSynthesisPrompt(input: {
	panelId: string;
	task: string;
	reviews: readonly PanelReview[];
	failures: readonly PanelFailure[];
}): string {
	const validIds = input.reviews.map((review) => review.reviewerId);
	const failedIds = input.failures
		.map((failure) => failure.reviewerId)
		.filter((id): id is string => Boolean(id));
	const artifacts = input.reviews.map((review) => ({
		reviewerId: review.reviewerId,
		disposition: review.disposition,
		blocking: review.blocking,
		findings: review.findings,
		missingChecks: review.missingChecks,
		limitations: review.limitations,
		provenance: review.provenance,
	}));
	const prompt = [
		`Panel: ${input.panelId}`,
		`Shared task:\n${input.task}`,
		`Panel evidence artifacts:\n${JSON.stringify(artifacts)}`,
		`Failed or invalid reviewers:\n${JSON.stringify(input.failures)}`,
		"Reconcile evidence without majority voting and without erasing dissent.",
		`Panel synthesis contract:\n${panelSynthesisInstruction(validIds, failedIds)}`,
	].join("\n\n");
	return truncateUtf8(prompt, DEFAULT_MAX_CONTEXT_BYTES).text;
}
