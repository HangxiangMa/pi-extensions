import assert from "node:assert/strict";
import test from "node:test";
import type { ExecResult } from "@earendil-works/pi-coding-agent";
import { createMockContext, createMockPi } from "../../../test/support.js";
import githubPr, {
	commandCompletions,
	formatCompactStatus,
	formatDetailedStatus,
	normalizeGhPrView,
	parseCommand,
	runGhPrView,
} from "../src/github-pr.js";

type ExecCall = { command: string; args: string[]; options?: { cwd?: string } };
type ExecFunction = (
	command: string,
	args: string[],
	options?: { cwd?: string },
) => Promise<ExecResult>;

const okResult = (stdout: unknown): ExecResult => ({
	stdout: JSON.stringify(stdout),
	stderr: "",
	code: 0,
	killed: false,
});

const samplePr = {
	number: 123,
	title: "Add PR status extension",
	url: "https://github.com/narumiruna/pi-extensions/pull/123",
	state: "OPEN",
	isDraft: false,
	reviewDecision: "APPROVED",
	latestReviews: [
		{ state: "APPROVED", author: { login: "alice" } },
		{ state: "COMMENTED", author: { login: "bob" } },
	],
	reviews: [
		{ state: "COMMENTED", author: { login: "alice" } },
		{ state: "APPROVED", author: { login: "alice" } },
		{ state: "COMMENTED", author: { login: "bob" } },
	],
	comments: [{}, {}],
	statusCheckRollup: [
		{ status: "COMPLETED", conclusion: "SUCCESS" },
		{ state: "FAILURE" },
		{ status: "IN_PROGRESS" },
	],
	updatedAt: "2026-06-24T12:00:00Z",
};

test("github-pr registers command, tool, and session events", () => {
	const mock = createMockPi();
	githubPr(mock.pi);

	assert.ok(mock.commands.has("pr"));
	assert.deepEqual(
		mock.tools.map((tool) => tool.name),
		["github_pr_status"],
	);
	assert.deepEqual([...mock.events.keys()].sort(), [
		"agent_end",
		"session_shutdown",
		"session_start",
	]);
});

test("github-pr command parsing and completions cover subcommands", () => {
	assert.deepEqual(parseCommand(""), { action: "show" });
	assert.deepEqual(parseCommand("123"), { action: "show", target: "123" });
	assert.deepEqual(parseCommand("status 123"), { action: "show", target: "123" });
	assert.deepEqual(parseCommand("refresh"), { action: "refresh", target: undefined });
	assert.equal(parseCommand("clear now"), "Usage: /pr clear");
	assert.deepEqual(commandCompletions("ref"), [
		{ value: "refresh", label: "refresh", description: "Refresh the last selected PR" },
	]);
	assert.equal(commandCompletions("refresh "), null);
});

test("normalizeGhPrView summarizes approved reviews, failed CI, and comments", () => {
	const status = normalizeGhPrView(samplePr);

	assert.deepEqual(status.checks, { passed: 1, failed: 1, pending: 1, total: 3 });
	assert.deepEqual(status.comments, { issue: 2, reviews: 3, total: 5 });
	assert.deepEqual(status.review.approvedBy, ["alice"]);
	assert.match(formatCompactStatus(status), /PR #123 ❌ ci 1 failed approved 💬5/);
	assert.match(formatDetailedStatus(status), /Review: APPROVED by alice/);
});

test("normalizeGhPrView summarizes pending, changes-requested, draft, and missing comments", () => {
	const changesRequested = normalizeGhPrView({
		...samplePr,
		reviewDecision: "CHANGES_REQUESTED",
		latestReviews: [{ state: "CHANGES_REQUESTED", author: { login: "carol" } }],
		comments: undefined,
		statusCheckRollup: [{ status: "QUEUED" }],
	});
	const draft = normalizeGhPrView({
		...samplePr,
		isDraft: true,
		reviewDecision: "REVIEW_REQUIRED",
		latestReviews: [],
		reviews: [],
		comments: undefined,
		statusCheckRollup: [],
	});

	assert.deepEqual(changesRequested.comments, { issue: 0, reviews: 3, total: 3 });
	assert.match(formatCompactStatus(changesRequested), /🟡 ci 1 pending changes requested/);
	assert.match(formatDetailedStatus(changesRequested), /CHANGES_REQUESTED by carol/);
	assert.deepEqual(draft.comments, { issue: 0, reviews: 0, total: 0 });
	assert.match(formatCompactStatus(draft), /⚪ ci none draft 💬0/);
});

test("runGhPrView calls gh pr view and reports actionable failures", async () => {
	const calls: ExecCall[] = [];
	const pi = {
		exec: async (command, args, options) => {
			calls.push({ command, args, options });
			return okResult(samplePr);
		},
	} satisfies { exec: ExecFunction };

	const status = await runGhPrView(pi, "/repo", "123");

	assert.equal(status.number, 123);
	assert.deepEqual(calls, [
		{
			command: "gh",
			args: [
				"pr",
				"view",
				"123",
				"--json",
				"number,title,url,state,isDraft,reviewDecision,latestReviews,reviews,comments,statusCheckRollup,updatedAt",
			],
			options: { cwd: "/repo", signal: undefined, timeout: 10_000 },
		},
	]);

	await assert.rejects(
		runGhPrView(
			{
				exec: async () => {
					throw new Error("spawn gh ENOENT");
				},
			},
			"/repo",
		),
		/GitHub CLI not available/,
	);
	await assert.rejects(
		runGhPrView(
			{
				exec: async () => ({ stdout: "", stderr: "not logged in", code: 1, killed: false }),
			},
			"/repo",
		),
		/gh auth login/,
	);
	await assert.rejects(
		runGhPrView(
			{
				exec: async () => ({
					stdout: "",
					stderr: "not a GitHub repository",
					code: 1,
					killed: false,
				}),
			},
			"/repo",
		),
		/No GitHub pull request found/,
	);
	await assert.rejects(
		runGhPrView(
			{
				exec: async () => ({
					stdout: "",
					stderr: "no pull requests found",
					code: 1,
					killed: false,
				}),
			},
			"/repo",
		),
		/No GitHub pull request found/,
	);
});

test("/pr updates and clears status and widget", async () => {
	const mock = createMockPi();
	installExec(mock, async () => okResult(samplePr));
	githubPr(mock.pi);

	const command = mock.commands.get("pr");
	assert.ok(command);
	const context = createMockContext({ cwd: "/repo" });

	await command.handler("123", context.ctx);
	assert.match(context.statuses.get("github-pr") ?? "", /PR #123/);
	assert.deepEqual(
		context.widgets.get("github-pr"),
		formatDetailedStatus(normalizeGhPrView(samplePr)).split("\n"),
	);
	assert.equal(context.notifications[0]?.level, "info");

	await command.handler("clear", context.ctx);
	assert.equal(context.statuses.get("github-pr"), undefined);
	assert.equal(context.widgets.get("github-pr"), undefined);
});

test("github_pr_status tool returns structured PR status", async () => {
	const mock = createMockPi();
	installExec(mock, async () => okResult(samplePr));
	githubPr(mock.pi);

	const tool = mock.tools[0];
	const execute = tool.execute as ExecTool;
	const context = createMockContext({ cwd: "/repo" });
	const result = await execute("tool-call", { target: "123" }, undefined, undefined, context.ctx);

	assert.match(result.content[0]?.text ?? "", /PR #123 Add PR status extension/);
	assert.equal(result.details.number, 123);
	assert.match(context.statuses.get("github-pr") ?? "", /approved/);
});

test("agent_end refresh does not run before a PR is selected", async () => {
	const mock = createMockPi();
	const calls = installExec(mock, async () => okResult(samplePr));
	githubPr(mock.pi);

	const handler = mock.events.get("agent_end")?.[0];
	assert.ok(handler);
	await handler({}, createMockContext({ cwd: "/repo" }).ctx);

	assert.equal(calls.length, 0);
});

function installExec(mock: ReturnType<typeof createMockPi>, exec: ExecFunction): ExecCall[] {
	const calls: ExecCall[] = [];
	(mock.rawPi as typeof mock.rawPi & { exec: ExecFunction }).exec = async (
		command,
		args,
		options,
	) => {
		calls.push({ command, args, options });
		return exec(command, args, options);
	};
	return calls;
}

type ExecTool = (
	toolCallId: string,
	params: { target?: string },
	signal: AbortSignal | undefined,
	onUpdate: undefined,
	ctx: never,
) => Promise<{ content: Array<{ text?: string }>; details: { number: number } }>;
