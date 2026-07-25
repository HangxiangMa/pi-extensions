import assert from "node:assert/strict";
import test from "node:test";
import type {
	Api,
	AssistantMessage,
	Context,
	Model,
	SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import { chooseBtwHandoff, type ResolvedBtwModel, runBtwThread } from "../src/btw.js";
import {
	BtwMenuSelector,
	BtwTextRangeSelector,
	buildBtwSelectionLines,
	buildQuickHandoffSegments,
	formatBtwHandoff,
	segmentsFromLineRange,
} from "../src/handoff.js";
import {
	buildSideThreadMessages,
	completeSideThreadTurn,
	createSideThread,
	type SideThread,
} from "../src/side-thread.js";
import {
	BtwAnsweringView,
	BtwTranscriptPager,
	formatSideTranscript,
} from "../src/transcript-pager.js";

function response(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		stopReason: "stop",
		timestamp: Date.now(),
		api: "anthropic-messages",
		provider: "test",
		model: "side",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	} as AssistantMessage;
}

function keybindings(mapping: Record<string, string> = {}) {
	return {
		matches(data: string, key: string) {
			const defaults: Record<string, string> = {
				"tui.select.up": "\u001b[A",
				"tui.select.down": "\u001b[B",
				"tui.select.pageUp": "\u001b[5~",
				"tui.select.pageDown": "\u001b[6~",
				"tui.select.confirm": "\r",
				"tui.select.cancel": "\u001b",
			};
			return data === (mapping[key] ?? defaults[key]);
		},
	};
}

function messageText(context: Context): string {
	return context.messages
		.flatMap((message) => {
			if (typeof message.content === "string") return [message.content];
			return message.content
				.filter((part): part is { type: "text"; text: string } => part.type === "text")
				.map((part) => part.text);
		})
		.join("\n");
}

test("side thread sends prior successful turns and injects main context only once", async () => {
	const thread = createSideThread("MAIN-CONTEXT");
	const calls: Array<{ model: Model<Api>; context: Context; options?: SimpleStreamOptions }> = [];
	const replies = [response("A1"), response("A2"), response("A3")];
	const model = { provider: "test", id: "side" } as Model<Api>;
	const completeSimple = async (
		capturedModel: Model<Api>,
		context: Context,
		options?: SimpleStreamOptions,
	) => {
		calls.push({ model: capturedModel, context, options });
		const reply = replies[calls.length - 1];
		assert.ok(reply);
		return reply;
	};

	for (const question of ["Q1", "Q2", "Q3"]) {
		const result = await completeSideThreadTurn({
			thread,
			question,
			model,
			auth: { apiKey: "key", headers: { test: "yes" }, env: { TEST: "yes" } },
			thinkingLevel: "low",
			completeSimple,
		});
		assert.equal(result.kind, "answered");
	}

	assert.equal(calls.length, 3);
	assert.deepEqual(
		calls.map((call) => call.context.messages.map((message) => message.role)),
		[["user"], ["user", "assistant", "user"], ["user", "assistant", "user", "assistant", "user"]],
	);
	const [firstCall, secondCall, thirdCall] = calls;
	assert.ok(firstCall);
	assert.ok(secondCall);
	assert.ok(thirdCall);
	assert.equal((messageText(firstCall.context).match(/MAIN-CONTEXT/g) ?? []).length, 1);
	assert.equal((messageText(secondCall.context).match(/MAIN-CONTEXT/g) ?? []).length, 1);
	assert.equal((messageText(thirdCall.context).match(/MAIN-CONTEXT/g) ?? []).length, 1);
	assert.deepEqual(
		calls.map((call) => call.model),
		[model, model, model],
	);
	assert.deepEqual(
		calls.map((call) => call.options?.reasoning),
		["low", "low", "low"],
	);
	assert.deepEqual(
		thread.turns.map((turn) => ({ question: turn.question, answer: turn.answer })),
		[
			{ question: "Q1", answer: "A1" },
			{ question: "Q2", answer: "A2" },
			{ question: "Q3", answer: "A3" },
		],
	);
});

test("side thread discards a late successful response after cancellation", async () => {
	const thread = createSideThread("context");
	const controller = new AbortController();
	let release: ((value: AssistantMessage) => void) | undefined;
	const pending = completeSideThreadTurn({
		thread,
		question: "cancel me",
		model: { provider: "test", id: "side" } as Model<Api>,
		auth: { apiKey: "key" },
		thinkingLevel: "off",
		signal: controller.signal,
		completeSimple: () =>
			new Promise<AssistantMessage>((resolve) => {
				release = resolve;
			}),
	});
	controller.abort();
	assert.ok(release);
	release(response("late answer"));

	assert.deepEqual(await pending, { kind: "aborted" });
	assert.deepEqual(thread.turns, []);
});

test("side thread does not record aborted completions", async () => {
	const thread = createSideThread("context");
	const result = await completeSideThreadTurn({
		thread,
		question: "cancel me",
		model: { provider: "test", id: "side" } as Model<Api>,
		auth: { apiKey: "key" },
		thinkingLevel: "off",
		completeSimple: async () => ({ ...response(""), stopReason: "aborted" }),
	});

	assert.equal(result.kind, "aborted");
	assert.deepEqual(thread.turns, []);
});

test("buildSideThreadMessages keeps failed display turns out of provider context", () => {
	const thread: SideThread = createSideThread("context");
	thread.turns.push({ question: "failed", answer: "Error: boom", kind: "error" });
	const messages = buildSideThreadMessages(thread, "retry");
	assert.equal(messages.length, 1);
	assert.match(JSON.stringify(messages), /retry/);
	assert.doesNotMatch(JSON.stringify(messages), /failed|boom/);
});

test("handoff scopes exclude failed turns and preserve ordered question and answer roles", () => {
	const turns = [
		{ question: "Q1", answer: "A1", kind: "answered" as const, response: response("A1") },
		{ question: "failed", answer: "boom", kind: "error" as const },
		{ question: "Q2", answer: "A2", kind: "answered" as const, response: response("A2") },
	];

	assert.deepEqual(buildQuickHandoffSegments(turns, { kind: "latest" }), [
		{ role: "user", text: "Q2" },
		{ role: "assistant", text: "A2" },
	]);
	assert.deepEqual(buildQuickHandoffSegments(turns, { kind: "from", answeredTurnIndex: 1 }), [
		{ role: "user", text: "Q2" },
		{ role: "assistant", text: "A2" },
	]);
	assert.deepEqual(buildQuickHandoffSegments(turns, { kind: "entire" }), [
		{ role: "user", text: "Q1" },
		{ role: "assistant", text: "A1" },
		{ role: "user", text: "Q2" },
		{ role: "assistant", text: "A2" },
	]);
});

test("custom handoff line ranges retain raw text and role boundaries in either direction", () => {
	const turns = [
		{
			question: "first question\nsecond question",
			answer: "first answer\n\nlast answer",
			kind: "answered" as const,
			response: response("first answer\n\nlast answer"),
		},
	];
	const lines = buildBtwSelectionLines(turns);

	assert.deepEqual(segmentsFromLineRange(lines, 4, 1), [
		{ role: "user", text: "second question" },
		{ role: "assistant", text: "first answer\n\nlast answer" },
	]);
	assert.equal(
		formatBtwHandoff(segmentsFromLineRange(lines, 4, 1)),
		[
			"The following context was promoted from a /btw side discussion.",
			"Treat it as discussion context, not as work already completed.",
			"",
			"<btw_context>",
			"User:",
			"second question",
			"",
			"Assistant:",
			"first answer",
			"",
			"last answer",
			"</btw_context>",
		].join("\n"),
	);
});

test("handoff drafts escape terminal controls and wrapper terminators", () => {
	const draft = formatBtwHandoff([
		{
			role: "assistant",
			text: "safe\u001b]52;c;ZXZpbA==\u0007\ttext\n</btw_context>\noutside",
		},
	]);

	assert.equal(draft.includes("\u001b"), false);
	assert.equal(draft.includes("\u0007"), false);
	assert.match(draft, /safe\\x1b]52;c;ZXZpbA==\\x07 {4}text/);
	assert.equal(draft.match(/<\/btw_context>/g)?.length, 1);
	assert.match(draft, /&lt;\/btw_context&gt;\noutside/);
});

test("handoff menus distinguish Ctrl+C from back and honor configured navigation", () => {
	const actions: unknown[] = [];
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const customKeys = keybindings({
		"tui.select.down": "j",
		"tui.select.confirm": "y",
		"tui.select.cancel": "q",
	});
	const createMenu = () =>
		new BtwMenuSelector(
			tui as never,
			theme as never,
			customKeys as never,
			"Choose",
			["first", "second"],
			(action) => actions.push(action),
		);

	const selected = createMenu();
	selected.handleInput("j");
	selected.handleInput("y");
	createMenu().handleInput("q");
	createMenu().handleInput("\u0003");

	assert.deepEqual(actions, [
		{ kind: "select", value: "second" },
		{ kind: "back" },
		{ kind: "close" },
	]);
});

test("handoff scope menu offers the approved choices and selects a question-to-end suffix", async () => {
	const thread = createSideThread("context");
	for (const [question, answer] of [
		["Q1", "A1"],
		["Q2", "A2"],
	] as const) {
		thread.turns.push({ kind: "answered", question, answer, response: response(answer) });
	}
	const prompts: Array<{ title: string; options: string[] }> = [];
	const selections = ["From a question onward…", "2. Q2"];
	const ctx = { ui: {} } as never;

	const result = await chooseBtwHandoff(thread, ctx, {
		showMenu: async (_ctx, title, options) => {
			prompts.push({ title, options: [...options] });
			const value = selections.shift();
			return value ? { kind: "select", value } : { kind: "back" };
		},
	});

	assert.deepEqual(prompts[0], {
		title: "Bring what back to the main thread?",
		options: [
			"Latest question and answer",
			"From a question onward…",
			"Select a text range…",
			"Entire side thread",
			"Cancel",
		],
	});
	assert.equal(result.kind, "handoff");
	assert.doesNotMatch(result.kind === "handoff" ? result.draft : "", /Q1|A1/);
	assert.match(result.kind === "handoff" ? result.draft : "", /Q2[\s\S]*A2/);
});

test("handoff scope menu propagates Ctrl+C as a side-thread close", async () => {
	const thread = createSideThread("context");
	thread.turns.push({ kind: "answered", question: "Q", answer: "A", response: response("A") });

	const result = await chooseBtwHandoff(thread, { ui: {} } as never, {
		showMenu: async () => ({ kind: "close" }),
	});

	assert.deepEqual(result, { kind: "closed" });
});

test("side-thread command loop opens the composer before the first question", async () => {
	const ctx = {
		ui: { notify() {} },
		sessionManager: { getBranch: () => [] },
	} as never;
	const selected: ResolvedBtwModel = {
		model: { provider: "test", id: "side" } as Model<Api>,
		auth: { apiKey: "key" },
	};
	const transcriptSizes: number[] = [];
	const questions: string[] = [];
	const interactions = [{ kind: "submit" as const, question: "Q1" }, { kind: "close" as const }];

	const result = await runBtwThread({
		selected,
		thinkingLevel: "off",
		ctx,
		dependencies: {
			interact: async (thread) => {
				transcriptSizes.push(thread.turns.length);
				return interactions.shift() ?? { kind: "close" };
			},
			ask: async (thread, question) => {
				questions.push(question);
				const assistant = response("A1");
				thread.turns.push({ kind: "answered", question, answer: "A1", response: assistant });
				return { kind: "answered", response: assistant, answer: "A1" };
			},
		},
	});

	assert.deepEqual(transcriptSizes, [0, 1]);
	assert.deepEqual(questions, ["Q1"]);
	assert.deepEqual(result, { kind: "closed" });
});

test("side-thread command loop immediately accepts another question after each answer", async () => {
	const ctx = {
		ui: { notify() {} },
		sessionManager: {
			getBranch: () => [
				{ type: "message", message: { role: "user", content: [{ type: "text", text: "main" }] } },
			],
		},
	} as never;
	const selected: ResolvedBtwModel = {
		model: { provider: "test", id: "side" } as Model<Api>,
		auth: { apiKey: "key" },
	};
	const questions: string[] = [];
	const transcriptSizes: number[] = [];
	const interactions = [{ kind: "submit" as const, question: "Q2" }, { kind: "close" as const }];

	await runBtwThread({
		initialQuestion: "Q1",
		selected,
		thinkingLevel: "medium",
		ctx,
		dependencies: {
			ask: async (thread, question, capturedSelected, capturedThinking) => {
				questions.push(question);
				assert.equal(capturedSelected, selected);
				assert.equal(capturedThinking, "medium");
				const assistant = response(`A${questions.length}`);
				thread.turns.push({
					kind: "answered",
					question,
					answer: `A${questions.length}`,
					response: assistant,
				});
				return { kind: "answered", response: assistant, answer: `A${questions.length}` };
			},
			interact: async (thread) => {
				transcriptSizes.push(thread.turns.length);
				return interactions.shift() ?? { kind: "close" };
			},
		},
	});

	assert.deepEqual(questions, ["Q1", "Q2"]);
	assert.deepEqual(transcriptSizes, [1, 2]);
});

test("cancelling an in-progress side answer exits without reopening the composer", async () => {
	const notifications: Array<{ message: string; level: string }> = [];
	const ctx = {
		ui: {
			notify(message: string, level: string) {
				notifications.push({ message, level });
			},
		},
		sessionManager: { getBranch: () => [] },
	} as never;
	let interactions = 0;

	await runBtwThread({
		initialQuestion: "Q1",
		selected: {
			model: { provider: "test", id: "side" } as Model<Api>,
			auth: { apiKey: "key" },
		},
		thinkingLevel: "off",
		ctx,
		dependencies: {
			ask: async () => ({ kind: "aborted" }),
			interact: async () => {
				interactions += 1;
				return { kind: "close" };
			},
		},
	});

	assert.equal(interactions, 0);
	assert.deepEqual(notifications, [{ message: "Cancelled", level: "info" }]);
});

test("cancelled handoff selection restores the unsubmitted side-question draft", async () => {
	const ctx = {
		ui: { notify() {} },
		sessionManager: { getBranch: () => [] },
	} as never;
	const drafts: Array<string | undefined> = [];
	let interactions = 0;
	const result = await runBtwThread({
		initialQuestion: "Q1",
		selected: {
			model: { provider: "test", id: "side" } as Model<Api>,
			auth: { apiKey: "key" },
		},
		thinkingLevel: "off",
		ctx,
		dependencies: {
			ask: async (thread) => {
				const assistant = response("A1");
				thread.turns.push({ kind: "answered", question: "Q1", answer: "A1", response: assistant });
				return { kind: "answered", response: assistant, answer: "A1" };
			},
			interact: async (_thread, _atBottom, _ctx, draft) => {
				drafts.push(draft);
				interactions += 1;
				return interactions === 1
					? { kind: "promote", questionDraft: "unfinished question" }
					: { kind: "close" };
			},
			chooseHandoff: async () => ({ kind: "back" }),
		},
	});

	assert.deepEqual(drafts, [undefined, "unfinished question"]);
	assert.deepEqual(result, { kind: "closed" });
});

test("cancelled main-editor loading returns to the side composer with its draft", async () => {
	const ctx = {
		ui: { notify() {} },
		sessionManager: { getBranch: () => [] },
	} as never;
	const drafts: Array<string | undefined> = [];
	let interactions = 0;
	const result = await runBtwThread({
		initialQuestion: "Q1",
		selected: {
			model: { provider: "test", id: "side" } as Model<Api>,
			auth: { apiKey: "key" },
		},
		thinkingLevel: "off",
		ctx,
		dependencies: {
			ask: async (thread) => {
				const assistant = response("A1");
				thread.turns.push({ kind: "answered", question: "Q1", answer: "A1", response: assistant });
				return { kind: "answered", response: assistant, answer: "A1" };
			},
			interact: async (_thread, _atBottom, _ctx, draft) => {
				drafts.push(draft);
				interactions += 1;
				return interactions === 1
					? { kind: "promote", questionDraft: "unfinished question" }
					: { kind: "close" };
			},
			chooseHandoff: async () => ({ kind: "handoff", draft: "selected draft" }),
			deliverHandoff: async () => "back",
		},
	});

	assert.deepEqual(drafts, [undefined, "unfinished question"]);
	assert.deepEqual(result, { kind: "closed" });
});

test("side-thread command loop loads an explicit handoff without mutating the session", async () => {
	const branch = [{ type: "message", message: { role: "user", content: "main" } }];
	const ctx = {
		ui: { notify() {} },
		sessionManager: { getBranch: () => branch },
	} as never;
	const assistant = response("A1");
	const delivered: string[] = [];
	const result = await runBtwThread({
		initialQuestion: "Q1",
		selected: {
			model: { provider: "test", id: "side" } as Model<Api>,
			auth: { apiKey: "key" },
		},
		thinkingLevel: "off",
		ctx,
		dependencies: {
			ask: async (thread) => {
				thread.turns.push({ kind: "answered", question: "Q1", answer: "A1", response: assistant });
				return { kind: "answered", response: assistant, answer: "A1" };
			},
			interact: async () => ({ kind: "promote", questionDraft: "" }),
			chooseHandoff: async () => ({
				kind: "handoff",
				draft: "selected draft",
			}),
			deliverHandoff: async (draft) => {
				delivered.push(draft);
				return "loaded";
			},
		},
	});

	assert.deepEqual(result, { kind: "closed" });
	assert.deepEqual(delivered, ["selected draft"]);
	assert.equal(branch.length, 1);
});

test("empty transcript composer accepts the first side-thread question", () => {
	const actions: unknown[] = [];
	const tui = { terminal: { rows: 24 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const composer = new BtwTranscriptPager(tui as never, theme as never, [], (action) =>
		actions.push(action),
	);

	composer.focused = true;
	const emptyLines = composer.render(40);
	const emptyView = emptyLines.join("\n");
	assert.match(emptyLines[0] ?? "", /─ btw · side thread/);
	assert.doesNotMatch(emptyView, /turns|Q1|You:|Assistant:|%|history/);
	assert.match(emptyView, /btw • Enter send • Ctrl\+C exit/);
	assert.equal(emptyView.includes(CURSOR_MARKER), true);
	for (const character of "first question") composer.handleInput(character);
	composer.handleInput("\r");

	assert.deepEqual(actions, [{ kind: "submit", question: "first question" }]);
});

test("transcript offers opt-in promotion only after a successful answer", () => {
	initTheme("dark");
	const actions: unknown[] = [];
	const tui = { terminal: { rows: 24 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const empty = new BtwTranscriptPager(tui as never, theme as never, [], (action) =>
		actions.push(action),
	);
	empty.handleInput("\u0012");
	assert.doesNotMatch(empty.render(80).join("\n"), /bring to main/i);

	const answered = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[{ question: "Q1", answer: "A1", kind: "answered", response: response("A1") }],
		(action) => actions.push(action),
	);
	assert.match(answered.render(80).join("\n"), /Ctrl\+R bring to main/);
	answered.handleInput("\u0012");

	assert.deepEqual(actions, [{ kind: "promote", questionDraft: "" }]);
});

test("text range selector anchors with Space, extends, confirms, and stays width-safe", () => {
	const actions: unknown[] = [];
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return `[${text}]`;
		},
		bold(text: string) {
			return text;
		},
	};
	const selector = new BtwTextRangeSelector(
		tui as never,
		theme as never,
		keybindings({
			"tui.select.down": "j",
			"tui.select.confirm": "y",
		}) as never,
		[
			{
				question: "question one\nquestion two",
				answer: "answer one\nanswer two",
				kind: "answered",
				response: response("answer one\nanswer two"),
			},
		],
		(action) => actions.push(action),
	);

	selector.handleInput("j");
	selector.handleInput(" ");
	selector.handleInput("j");
	selector.handleInput("j");
	const narrow = selector.render(24);
	assert.ok(narrow.every((line) => visibleWidth(line) <= 24));
	assert.match(selector.render(80).join("\n"), /Space anchor.*navigate\/extend.*confirm.*back/);
	selector.handleInput("y");

	assert.deepEqual(actions, [
		{
			kind: "confirm",
			segments: [
				{ role: "user", text: "question two" },
				{ role: "assistant", text: "answer one\nanswer two" },
			],
		},
	]);
});

test("text range selector distinguishes back from closing the side thread", () => {
	const actions: unknown[] = [];
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const turns = [
		{ question: "Q", answer: "A", kind: "answered" as const, response: response("A") },
	];
	const customKeys = keybindings({ "tui.select.cancel": "q" });
	new BtwTextRangeSelector(tui as never, theme as never, customKeys as never, turns, (action) =>
		actions.push(action),
	).handleInput("q");
	new BtwTextRangeSelector(tui as never, theme as never, customKeys as never, turns, (action) =>
		actions.push(action),
	).handleInput("\u0003");

	assert.deepEqual(actions, [{ kind: "back" }, { kind: "close" }]);
});

test("text range selector scrolls raw lines and escapes controls in its display", () => {
	const tui = { terminal: { rows: 8 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = Array.from({ length: 20 }, (_, index) =>
		index === 19 ? "latest\u001b[2J" : `line ${index + 1}`,
	).join("\n");
	const selector = new BtwTextRangeSelector(
		tui as never,
		theme as never,
		keybindings() as never,
		[{ question: "Q", answer, kind: "answered", response: response(answer) }],
		() => undefined,
	);
	for (let index = 0; index < 20; index += 1) selector.handleInput("\u001b[B");
	const rendered = selector.render(60).join("\n");

	assert.match(rendered, /latest\\x1b\[2J/);
	assert.equal(rendered.includes("\u001b[2J"), false);
});

test("side-thread header and footer remain visible when the editor grows", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const composer = new BtwTranscriptPager(tui as never, theme as never, [], () => undefined);
	composer.focused = true;
	for (const character of "long input ".repeat(30)) composer.handleInput(character);
	const rendered = composer.render(20);

	assert.match(rendered[0] ?? "", /btw/);
	assert.match(rendered.join("\n"), /Ctrl\+C/);
	assert.equal(rendered.join("\n").includes(CURSOR_MARKER), true);
	assert.ok(rendered.length <= tui.terminal.rows - 3);
});

test("constrained composer keeps an earlier editor cursor visible", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const composer = new BtwTranscriptPager(tui as never, theme as never, [], () => undefined);
	composer.focused = true;
	const text = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n");
	composer.handleInput(`\u001b[200~${text}\u001b[201~`);
	for (let index = 0; index < 9; index += 1) composer.handleInput("\u001b[A");

	const rendered = composer.render(20).join("\n");
	assert.equal(rendered.includes(CURSOR_MARKER), true);
	assert.match(rendered, /Ctrl\+C/);
});

test("side-thread header stays fixed across narrow renders and history scrolling", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
	const pager = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[{ question: "question", answer, kind: "answered", response: response(answer) }],
		() => undefined,
		{ startAtBottom: true },
	);

	const initial = pager.render(80);
	pager.handleInput("\u001b[5~");
	const scrolled = pager.render(80);
	const narrow = pager.render(8);
	assert.match(initial[0] ?? "", /─ btw · side thread/);
	assert.match(scrolled[0] ?? "", /─ btw · side thread/);
	assert.match(narrow[0] ?? "", /btw/);
	assert.ok(narrow.every((line) => visibleWidth(line) <= 8));
});

test("side-thread header is presentation-only", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 24 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const thread = createSideThread("main context");
	thread.turns.push({
		question: "previous question",
		answer: "previous answer",
		kind: "answered",
		response: response("previous answer"),
	});
	const snapshot = structuredClone(thread.turns);
	const pager = new BtwTranscriptPager(tui as never, theme as never, thread.turns, () => undefined);

	assert.match(pager.render(80)[0] ?? "", /btw · side thread/);
	assert.deepEqual(thread.turns, snapshot);
	assert.doesNotMatch(
		JSON.stringify(buildSideThreadMessages(thread, "next question")),
		/side thread/,
	);
});

test("transcript pager starts later turns at the bottom and respects narrow widths", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const longAnswer = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n");
	const turns = [
		{
			question: "Q1",
			answer: longAnswer,
			kind: "answered" as const,
			response: response(longAnswer),
		},
	];
	const pager = new BtwTranscriptPager(tui as never, theme as never, turns, () => undefined, {
		startAtBottom: true,
	});
	const lines = pager.render(20);

	assert.ok(lines.every((line) => visibleWidth(line) <= 20));
	assert.ok(lines.length <= tui.terminal.rows - 3);
	assert.doesNotMatch(lines.join("\n"), /Q1|You:|Assistant:|turns|%|history/);
	assert.match(lines.join("\n"), /btw.*Enter.*Ctrl\+C/);
});

test("scrollable transcript reveals history controls only when they are useful", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
	const composer = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[{ question: "question", answer, kind: "answered", response: response(answer) }],
		() => undefined,
		{ startAtBottom: true },
	);

	const rendered = composer.render(80).join("\n");
	assert.match(rendered, /↑ older.*PgUp\/PgDn history/);
	assert.match(composer.render(40).join("\n"), /PgUp\/PgDn/);
});

test("transcript honors an explicit top start on its first render", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
	const composer = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[{ question: "FIRST QUESTION", answer, kind: "answered", response: response(answer) }],
		() => undefined,
	);
	const rendered = composer.render(80).join("\n");

	assert.match(rendered, /FIRST QUESTION/);
	assert.doesNotMatch(rendered, /line 20/);
});

test("transcript keeps following the bottom when PageUp has no scrollback", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 100 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = `EARLIEST ${"middle content ".repeat(20)}LATEST`;
	const composer = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[{ question: "question", answer, kind: "answered", response: response(answer) }],
		() => undefined,
		{ startAtBottom: true },
	);
	composer.render(80);
	composer.handleInput("\u001b[5~");
	tui.terminal.rows = 10;

	assert.match(composer.render(20).join("\n"), /LATEST/);
});

test("transcript preserves an intentional scroll position across fit and reflow", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = `EARLIEST ${"middle content ".repeat(20)}LATEST`;
	const composer = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[{ question: "question", answer, kind: "answered", response: response(answer) }],
		() => undefined,
		{ startAtBottom: true },
	);
	composer.render(20);
	for (let index = 0; index < 20; index += 1) composer.handleInput("\u001b[5~");
	tui.terminal.rows = 100;
	composer.render(80);
	tui.terminal.rows = 10;
	const reflowed = composer.render(20).join("\n");

	assert.doesNotMatch(reflowed, /LATEST/);
});

test("transcript stays anchored to the latest answer when terminal width changes", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = `${"reflow content ".repeat(20)}LATEST`;
	const composer = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[{ question: "question", answer, kind: "answered", response: response(answer) }],
		() => undefined,
		{ startAtBottom: true },
	);

	assert.match(composer.render(80).join("\n"), /LATEST/);
	assert.match(composer.render(20).join("\n"), /LATEST/);
});

test("answering view keeps following the bottom when PageUp has no scrollback", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 100 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = `EARLIEST ${"middle content ".repeat(20)}LATEST`;
	const view = new BtwAnsweringView(
		tui as never,
		theme as never,
		[{ question: "Earlier question", answer, kind: "answered", response: response(answer) }],
		"CURRENT QUESTION",
		() => undefined,
	);
	try {
		view.render(80);
		view.handleInput("\u001b[5~");
		tui.terminal.rows = 10;
		assert.match(view.render(20).join("\n"), /CURRENT QUESTION/);
	} finally {
		view.dispose();
	}
});

test("answering view preserves an intentional scroll position across fit and reflow", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = `EARLIEST ${"middle content ".repeat(20)}LATEST`;
	const view = new BtwAnsweringView(
		tui as never,
		theme as never,
		[{ question: "Earlier question", answer, kind: "answered", response: response(answer) }],
		"CURRENT QUESTION",
		() => undefined,
	);
	try {
		view.render(20);
		for (let index = 0; index < 20; index += 1) view.handleInput("\u001b[5~");
		tui.terminal.rows = 100;
		view.render(80);
		tui.terminal.rows = 10;
		const reflowed = view.render(20).join("\n");
		assert.doesNotMatch(reflowed, /CURRENT QUESTION/);
	} finally {
		view.dispose();
	}
});

test("answering view preserves the transcript and offers compact cancellation", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 24 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	let cancelled = 0;
	const view = new BtwAnsweringView(
		tui as never,
		theme as never,
		[
			{
				question: "Earlier question",
				answer: "Earlier answer",
				kind: "answered",
				response: response("Earlier answer"),
			},
		],
		"Current question",
		() => {
			cancelled += 1;
		},
	);
	try {
		const rendered = view.render(80).join("\n");
		assert.match(rendered, /─ btw · side thread/);
		assert.match(rendered, /Earlier question/);
		assert.match(rendered, /Earlier answer/);
		assert.match(rendered, /Current question/);
		assert.match(rendered, /Answering….*Ctrl\+C cancel/);
		assert.doesNotMatch(rendered, /openai|codex|provider|model/i);
		view.handleInput("\u0003");
		assert.equal(cancelled, 1);
		assert.equal(view.signal.aborted, true);
	} finally {
		view.dispose();
	}
});

test("answering view never exceeds the available height in a short terminal", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 4 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const view = new BtwAnsweringView(tui as never, theme as never, [], "question", () => undefined);

	try {
		assert.ok(view.render(40).length <= tui.terminal.rows - 3);
	} finally {
		view.dispose();
	}
});

test("answering view keeps the pending question visible after terminal reflow", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 10 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const answer = "earlier content ".repeat(20);
	const view = new BtwAnsweringView(
		tui as never,
		theme as never,
		[{ question: "Earlier question", answer, kind: "answered", response: response(answer) }],
		"CURRENT QUESTION",
		() => undefined,
	);

	try {
		assert.match(view.render(80).join("\n"), /CURRENT QUESTION/);
		assert.match(view.render(20).join("\n"), /CURRENT QUESTION/);
	} finally {
		view.dispose();
	}
});

test("transcript renders like a plain conversation without role labels", () => {
	initTheme("dark");
	const tui = { terminal: { rows: 24 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const composer = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[
			{
				question: "How does this work?",
				answer: "It uses the current context.",
				kind: "answered",
				response: response("It uses the current context."),
			},
		],
		() => undefined,
	);
	const rendered = composer.render(60).join("\n");

	assert.match(rendered, /How does this work\?/);
	assert.match(rendered, /It uses the current context\./);
	assert.doesNotMatch(rendered, /Q1|You:|Assistant:|turns|%/);
	assert.equal(rendered.includes("\u001b]133;"), false);
});

test("side transcript escapes executable terminal controls", () => {
	const formatted = formatSideTranscript([
		{
			question: "question\u001b]52;c;ZXZpbA==\u0007",
			answer: "answer\u001b[2J",
			kind: "answered",
			response: response("answer"),
		},
	]);

	assert.equal(formatted.includes("\u001b"), false);
	assert.equal(formatted.includes("\u0007"), false);
	assert.equal(formatted.includes("\\x1b"), true);
	assert.doesNotMatch(formatted, /Q1|---|You:|Assistant:/);
	assert.equal(formatted, "question\\x1b]52;c;ZXZpbA==\\x07\n\nanswer\\x1b[2J");
});

test("transcript composer submits typed questions by default and only Ctrl+C closes it", () => {
	const actions: unknown[] = [];
	const tui = { terminal: { rows: 24 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const turns = [
		{ question: "Q1", answer: "A1", kind: "answered" as const, response: response("A1") },
	];

	const composer = new BtwTranscriptPager(tui as never, theme as never, turns, (action) =>
		actions.push(action),
	);
	composer.handleInput("q");
	composer.handleInput("\x1b");
	composer.handleInput("f");
	composer.handleInput("\r");

	const close = new BtwTranscriptPager(tui as never, theme as never, turns, (action) =>
		actions.push(action),
	);
	close.handleInput("\u0003");

	const blank = new BtwTranscriptPager(tui as never, theme as never, turns, (action) =>
		actions.push(action),
	);
	blank.handleInput("\r");
	const blankWarning = blank.render(60).join("\n");
	assert.match(blankWarning, /cannot be empty/i);
	assert.match(blankWarning, /Ctrl\+C exit/);
	assert.match(blank.render(20).join("\n"), /Empty.*Ctrl\+C/);

	assert.deepEqual(actions, [{ kind: "submit", question: "qf" }, { kind: "close" }]);
});
