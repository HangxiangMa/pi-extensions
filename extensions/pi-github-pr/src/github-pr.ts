import type {
	ExecResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "UNKNOWN";
export type CheckState = "pass" | "fail" | "pending" | "none";

type JsonRecord = Record<string, unknown>;

type PrCommand =
	| { action: "show"; target?: string }
	| { action: "refresh"; target?: string }
	| { action: "clear" }
	| { action: "help" };

export interface CheckSummary {
	passed: number;
	failed: number;
	pending: number;
	total: number;
}

export interface ReviewSummary {
	decision: ReviewDecision;
	approvedBy: string[];
	changesRequestedBy: string[];
	commentedBy: string[];
	total: number;
}

export interface CommentSummary {
	issue: number;
	reviews: number;
	total: number;
}

export interface PullRequestStatus {
	number: number;
	title: string;
	url: string;
	state: string;
	isDraft: boolean;
	updatedAt?: string;
	review: ReviewSummary;
	checks: CheckSummary;
	comments: CommentSummary;
}

const STATUS_KEY = "github-pr";
const GH_TIMEOUT_MS = 10_000;
const GH_PR_FIELDS = [
	"number",
	"title",
	"url",
	"state",
	"isDraft",
	"reviewDecision",
	"latestReviews",
	"reviews",
	"comments",
	"statusCheckRollup",
	"updatedAt",
];

const COMMAND_COMPLETIONS = [
	{ value: "status", label: "status", description: "Show the current branch PR" },
	{ value: "refresh", label: "refresh", description: "Refresh the last selected PR" },
	{ value: "clear", label: "clear", description: "Clear the PR status widget" },
	{ value: "help", label: "help", description: "Show /pr usage" },
];

const toolParameters = Type.Object({
	target: Type.Optional(
		Type.String({ description: "PR number, URL, or branch. Defaults to the current branch PR." }),
	),
});

export default function githubPr(pi: ExtensionAPI) {
	let lastTarget: string | undefined;

	const fetchAndDisplay = async (
		ctx: ExtensionContext,
		target: string | undefined,
		signal?: AbortSignal,
	) => {
		ctx.ui.setStatus(STATUS_KEY, "checking…");
		const status = await runGhPrView(pi, ctx.cwd, target, signal);
		lastTarget = target ?? String(status.number);
		renderStatus(ctx, status);
		return status;
	};

	pi.registerCommand("pr", {
		description: "Show GitHub pull request review, CI, and comment status",
		getArgumentCompletions: commandCompletions,
		handler: async (args, ctx) => {
			const command = parseCommand(args);
			if (typeof command === "string") {
				ctx.ui.notify(command, "warning");
				return;
			}

			if (command.action === "help") {
				ctx.ui.notify(helpText(), "info");
				return;
			}

			if (command.action === "clear") {
				lastTarget = undefined;
				clearStatus(ctx);
				ctx.ui.notify("GitHub PR status cleared.", "info");
				return;
			}

			const target = command.action === "refresh" ? (command.target ?? lastTarget) : command.target;
			try {
				const status = await fetchAndDisplay(ctx, target);
				ctx.ui.notify(formatDetailedStatus(status), "info");
			} catch (error) {
				renderError(ctx, error);
			}
		},
	});

	pi.registerTool({
		name: "github_pr_status",
		label: "GitHub PR Status",
		description:
			"Show GitHub pull request review, CI, and comment status using GitHub CLI (`gh`). Requires `gh auth login`.",
		promptSnippet: "Check GitHub pull request review, CI, and comment status",
		promptGuidelines: [
			"Use github_pr_status when the user asks about the current GitHub pull request, approvals, CI, comments, or review state.",
		],
		parameters: toolParameters,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const status = await fetchAndDisplay(ctx, cleanTarget(params.target), signal);
				return {
					content: [{ type: "text", text: formatDetailedStatus(status) }],
					details: status,
				};
			} catch (error) {
				renderError(ctx, error);
				throw error;
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		lastTarget = undefined;
		clearStatus(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		lastTarget = undefined;
		clearStatus(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (!lastTarget) return;
		try {
			await fetchAndDisplay(ctx, lastTarget, ctx.signal);
		} catch (error) {
			renderError(ctx, error);
		}
	});
}

export function parseCommand(args: string): PrCommand | string {
	const trimmed = args.trim();
	if (!trimmed) return { action: "show" };

	const [first = "", ...rest] = trimmed.split(/\s+/);
	const target = rest.join(" ").trim() || undefined;

	if (first === "status") return { action: "show", target };
	if (first === "refresh") return { action: "refresh", target };
	if (first === "clear") return target ? "Usage: /pr clear" : { action: "clear" };
	if (first === "help") return target ? "Usage: /pr help" : { action: "help" };
	return { action: "show", target: trimmed };
}

export function commandCompletions(prefix: string) {
	const trimmed = prefix.trimStart();
	if (!trimmed) return [...COMMAND_COMPLETIONS];
	if (/\s/.test(trimmed)) return null;
	const matches = COMMAND_COMPLETIONS.filter(
		(item) => item.value.startsWith(trimmed) || item.label.startsWith(trimmed),
	);
	return matches.length > 0 ? matches : null;
}

export async function runGhPrView(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	target?: string,
	signal?: AbortSignal,
): Promise<PullRequestStatus> {
	const args = ["pr", "view", ...targetArgs(target), "--json", GH_PR_FIELDS.join(",")];
	let result: ExecResult;

	try {
		result = await pi.exec("gh", args, { cwd, signal, timeout: GH_TIMEOUT_MS });
	} catch (error) {
		throw new Error(
			`GitHub CLI not available. Install gh and run: gh auth login. ${formatError(error)}`,
		);
	}

	if (result.killed) throw new Error("gh pr view timed out or was cancelled.");
	if (result.code !== 0) throw new Error(formatGhFailure(result));

	try {
		return normalizeGhPrView(JSON.parse(result.stdout));
	} catch (error) {
		throw new Error(`Failed to parse gh pr view output: ${formatError(error)}`);
	}
}

function targetArgs(target: string | undefined): string[] {
	const cleaned = cleanTarget(target);
	return cleaned ? [cleaned] : [];
}

function cleanTarget(target: string | undefined): string | undefined {
	const cleaned = target?.trim();
	return cleaned || undefined;
}

export function normalizeGhPrView(value: unknown): PullRequestStatus {
	const pr = objectRecord(value);
	const number = requiredNumber(pr.number, "number");
	const title = optionalString(pr.title) ?? "(untitled PR)";
	const url = optionalString(pr.url) ?? "";
	const state = optionalString(pr.state) ?? "UNKNOWN";
	const reviews = arrayValue(pr.reviews);
	const latestReviews = arrayValue(pr.latestReviews);
	const comments = summarizeComments(pr.comments, reviews.length);

	return {
		number,
		title,
		url,
		state,
		isDraft: pr.isDraft === true,
		updatedAt: optionalString(pr.updatedAt),
		review: summarizeReviews(pr.reviewDecision, latestReviews.length > 0 ? latestReviews : reviews),
		checks: summarizeChecks(pr.statusCheckRollup),
		comments,
	};
}

function summarizeChecks(value: unknown): CheckSummary {
	const checks = arrayValue(value);
	const summary: CheckSummary = { passed: 0, failed: 0, pending: 0, total: checks.length };

	for (const check of checks) {
		const state = checkState(check);
		if (state === "pass") summary.passed += 1;
		else if (state === "fail") summary.failed += 1;
		else summary.pending += 1;
	}

	return summary;
}

function checkState(value: unknown): Exclude<CheckState, "none"> {
	const check = objectRecord(value);
	const state = optionalString(check.state)?.toUpperCase();
	const status = optionalString(check.status)?.toUpperCase();
	const conclusion = optionalString(check.conclusion)?.toUpperCase();

	if (state === "SUCCESS") return "pass";
	if (state === "FAILURE" || state === "ERROR") return "fail";
	if (state === "PENDING" || state === "EXPECTED") return "pending";

	if (status && status !== "COMPLETED") return "pending";
	if (conclusion === "SUCCESS" || conclusion === "SKIPPED" || conclusion === "NEUTRAL") {
		return "pass";
	}
	if (
		conclusion === "FAILURE" ||
		conclusion === "CANCELLED" ||
		conclusion === "TIMED_OUT" ||
		conclusion === "ACTION_REQUIRED" ||
		conclusion === "STARTUP_FAILURE"
	) {
		return "fail";
	}

	return "pending";
}

function summarizeReviews(decisionValue: unknown, reviewValues: unknown[]): ReviewSummary {
	const latestByAuthor = new Map<string, JsonRecord>();
	let anonymousIndex = 0;

	for (const reviewValue of reviewValues) {
		const review = objectRecord(reviewValue);
		const author = authorLogin(review) ?? `review-${anonymousIndex++}`;
		latestByAuthor.set(author, review);
	}

	const summary: ReviewSummary = {
		decision: reviewDecision(decisionValue),
		approvedBy: [],
		changesRequestedBy: [],
		commentedBy: [],
		total: reviewValues.length,
	};

	for (const [author, review] of latestByAuthor) {
		const state = optionalString(review.state)?.toUpperCase();
		if (state === "APPROVED") summary.approvedBy.push(author);
		else if (state === "CHANGES_REQUESTED") summary.changesRequestedBy.push(author);
		else if (state === "COMMENTED") summary.commentedBy.push(author);
	}

	return summary;
}

function summarizeComments(commentsValue: unknown, reviewCount: number): CommentSummary {
	const issue = countValue(commentsValue);
	return { issue, reviews: reviewCount, total: issue + reviewCount };
}

function countValue(value: unknown): number {
	if (Array.isArray(value)) return value.length;
	const object = objectRecord(value);
	const totalCount = object.totalCount;
	if (typeof totalCount === "number") return totalCount;
	const nodes = object.nodes;
	return Array.isArray(nodes) ? nodes.length : 0;
}

function reviewDecision(value: unknown): ReviewDecision {
	if (value === "APPROVED" || value === "CHANGES_REQUESTED" || value === "REVIEW_REQUIRED") {
		return value;
	}
	return "UNKNOWN";
}

function authorLogin(review: JsonRecord): string | undefined {
	const author = objectRecord(review.author);
	return optionalString(author.login);
}

function checkOverall(checks: CheckSummary): CheckState {
	if (checks.total === 0) return "none";
	if (checks.failed > 0) return "fail";
	if (checks.pending > 0) return "pending";
	return "pass";
}

export function formatCompactStatus(status: PullRequestStatus): string {
	return [
		`PR #${status.number}`,
		formatCheckCompact(status.checks),
		formatReviewCompact(status),
		`💬${status.comments.total}`,
	].join(" ");
}

function formatCheckCompact(checks: CheckSummary): string {
	switch (checkOverall(checks)) {
		case "pass":
			return "✅ ci ✓";
		case "fail":
			return `❌ ci ${checks.failed} failed`;
		case "pending":
			return `🟡 ci ${checks.pending} pending`;
		case "none":
			return "⚪ ci none";
	}
}

function formatReviewCompact(status: PullRequestStatus): string {
	if (status.isDraft) return "draft";
	switch (status.review.decision) {
		case "APPROVED":
			return "approved";
		case "CHANGES_REQUESTED":
			return "changes requested";
		case "REVIEW_REQUIRED":
			return "review required";
		case "UNKNOWN":
			return "review ?";
	}
}

export function formatDetailedStatus(status: PullRequestStatus): string {
	return [
		`PR #${status.number} ${status.title}`,
		`State: ${status.state}${status.isDraft ? " (draft)" : ""}`,
		`Review: ${formatReviewDetailed(status)}`,
		`CI: ${status.checks.passed} passed, ${status.checks.failed} failed, ${status.checks.pending} pending (${status.checks.total} total)`,
		`Comments: ${status.comments.issue} issue comments, ${status.comments.reviews} reviews`,
		`Updated: ${status.updatedAt ?? "unknown"}`,
		status.url,
	]
		.filter(Boolean)
		.join("\n");
}

function formatReviewDetailed(status: PullRequestStatus): string {
	if (status.isDraft) return "draft";
	const review = status.review;
	if (review.decision === "APPROVED") return `APPROVED${by(review.approvedBy)}`;
	if (review.decision === "CHANGES_REQUESTED") {
		return `CHANGES_REQUESTED${by(review.changesRequestedBy)}`;
	}
	if (review.decision === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
	return review.total > 0 ? `UNKNOWN (${review.total} reviews)` : "UNKNOWN";
}

function by(names: string[]): string {
	return names.length > 0 ? ` by ${names.join(", ")}` : "";
}

function renderStatus(ctx: ExtensionContext, status: PullRequestStatus) {
	ctx.ui.setStatus(STATUS_KEY, formatCompactStatus(status));
	ctx.ui.setWidget(STATUS_KEY, formatDetailedStatus(status).split("\n"));
}

function clearStatus(ctx: ExtensionContext | ExtensionCommandContext) {
	ctx.ui.setStatus(STATUS_KEY, undefined);
	ctx.ui.setWidget(STATUS_KEY, undefined);
}

function renderError(ctx: ExtensionContext | ExtensionCommandContext, error: unknown) {
	const message = formatError(error);
	ctx.ui.setStatus(STATUS_KEY, `error: ${truncate(message, 24)}`);
	ctx.ui.setWidget(STATUS_KEY, [`GitHub PR status failed: ${message}`]);
	ctx.ui.notify(`GitHub PR status failed: ${message}`, "error");
}

function helpText() {
	return [
		"Usage: /pr [status|refresh|clear|help|<number|url|branch>]",
		"/pr              Show the current branch PR",
		"/pr 123          Show PR #123",
		"/pr refresh      Refresh the last selected PR",
		"/pr clear        Clear the PR status",
		"Requires GitHub CLI: gh auth login",
	].join("\n");
}

function formatGhFailure(result: ExecResult): string {
	const output = (result.stderr || result.stdout).trim();
	const lower = output.toLowerCase();
	if (/not found|enoent|spawn gh/.test(lower)) {
		return "GitHub CLI not found. Install gh and run: gh auth login.";
	}
	if (/not logged in|authentication|auth login|gh auth/.test(lower)) {
		return `GitHub CLI is not authenticated. Run: gh auth login. ${output}`;
	}
	if (/no pull requests|could not resolve|not a github repository/.test(lower)) {
		return `No GitHub pull request found. ${output}`;
	}
	return `gh pr view failed (${result.code}): ${output || "no output"}`;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function arrayValue(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	const object = objectRecord(value);
	return Array.isArray(object.nodes) ? object.nodes : [];
}

function objectRecord(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function requiredNumber(value: unknown, name: string): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	throw new Error(`Missing numeric PR ${name}`);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
