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
import {
	BtwBringToMainPreview,
	BtwMenuSelector,
	BtwTextRangeSelector,
	buildBtwSelectionLines,
	buildQuickBringToMainSegments,
	formatBtwBringToMain,
	segmentsFromLineRange,
	segmentsFromTextRange,
} from "../src/bring-to-main.js";
import {
	chooseBringToMain,
	loadBringToMainDraft,
	type ResolvedBtwModel,
	runBtwThread,
} from "../src/btw.js";
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
	const defaults: Record<string, string> = {
		"tui.select.up": "\u001b[A",
		"tui.select.down": "\u001b[B",
		"tui.select.pageUp": "\u001b[5~",
		"tui.select.pageDown": "\u001b[6~",
		"tui.select.confirm": "\r",
		"tui.select.cancel": "\u001b",
	};
	const labels: Record<string, string> = {
		"tui.select.up": "up",
		"tui.select.down": "down",
		"tui.select.pageUp": "pageUp",
		"tui.select.pageDown": "pageDown",
		"tui.select.confirm": "enter",
		"tui.select.cancel": "escape",
	};
	return {
		matches(data: string, key: string) {
			return data === (mapping[key] ?? defaults[key]);
		},
		getKeys(key: string) {
			return [mapping[key] ?? labels[key]];
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

test("bring-to-main scopes exclude failed turns and preserve ordered question and answer roles", () => {
	const turns = [
		{ question: "Q1", answer: "A1", kind: "answered" as const, response: response("A1") },
		{ question: "failed", answer: "boom", kind: "error" as const },
		{ question: "Q2", answer: "A2", kind: "answered" as const, response: response("A2") },
	];

	assert.deepEqual(buildQuickBringToMainSegments(turns, { kind: "latest" }), [
		{ role: "user", text: "Q2" },
		{ role: "assistant", text: "A2" },
	]);
	assert.deepEqual(buildQuickBringToMainSegments(turns, { kind: "from", answeredTurnIndex: 1 }), [
		{ role: "user", text: "Q2" },
		{ role: "assistant", text: "A2" },
	]);
	assert.deepEqual(buildQuickBringToMainSegments(turns, { kind: "entire" }), [
		{ role: "user", text: "Q1" },
		{ role: "assistant", text: "A1" },
		{ role: "user", text: "Q2" },
		{ role: "assistant", text: "A2" },
	]);
});

test("custom bring-to-main line ranges retain raw text and role boundaries in either direction", () => {
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
		formatBtwBringToMain(segmentsFromLineRange(lines, 4, 1)),
		[
			"The following context was brought back from a /btw side discussion.",
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

test("bring-to-main drafts escape terminal controls and wrapper terminators", () => {
	const draft = formatBtwBringToMain([
		{
			role: "assistant",
			text: 'safe\u001b]52;c;ZXZpbA==\u0007\ttext\n<btw_context>\n<btw_context >\n<btw_context role="nested">\n</btw_context>\n</btw_context >\n</btw_context\n>\noutside',
		},
	]);

	assert.equal(draft.includes("\u001b"), false);
	assert.equal(draft.includes("\u0007"), false);
	assert.match(draft, /safe\\x1b]52;c;ZXZpbA==\\x07 {4}text/);
	assert.equal(draft.match(/<btw_context(?=[ \t\r\n>])/g)?.length, 1);
	assert.equal(draft.match(/<\/btw_context[ \t\r\n]*>/g)?.length, 1);
	assert.match(draft, /&lt;btw_context>/);
	assert.match(draft, /&lt;btw_context >/);
	assert.match(draft, /&lt;btw_context role="nested">/);
	assert.match(draft, /&lt;\/btw_context&gt;/);
	assert.match(draft, /&lt;\/btw_context &gt;/);
	assert.match(draft, /&lt;\/btw_context\n&gt;\noutside/);
});

test("bring-to-main menus distinguish Ctrl+C from back and honor configured navigation", () => {
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
	assert.match(selected.render(80).join("\n"), /Y confirm.*Q back.*Ctrl\+C close/);
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

test("bring-to-main selectors keep one content row visible in five-row terminals", () => {
	const tui = { terminal: { rows: 5 }, requestRender() {} };
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
	const keys = keybindings();
	const menu = new BtwMenuSelector(
		tui as never,
		theme as never,
		keys as never,
		"Choose",
		["first", "second"],
		() => undefined,
	);
	const preview = new BtwBringToMainPreview(
		tui as never,
		theme as never,
		keys as never,
		"preview content",
		{ lines: 1, messages: 1, tokens: 4 },
		() => undefined,
	);
	const selector = new BtwTextRangeSelector(
		tui as never,
		theme as never,
		keys as never,
		[
			{
				question: "selectable content",
				answer: "answer",
				kind: "answered",
				response: response("answer"),
			},
		],
		() => undefined,
	);

	assert.match(menu.render(80).join("\n"), /first/);
	assert.match(preview.render(80).join("\n"), /preview content/);
	assert.match(selector.render(80).join("\n"), /selectable content/);
});

test("bring-to-main scope menu offers the approved choices and selects a question-to-end suffix", async () => {
	const thread = createSideThread("context");
	for (const [question, answer] of [
		["Q1", "A1"],
		["Q2", "A2"],
	] as const) {
		thread.turns.push({ kind: "answered", question, answer, response: response(answer) });
	}
	const prompts: Array<{ title: string; options: string[] }> = [];
	const selections = ["From a question onward…  Choose a starting question", "2. Q2"];
	const ctx = { ui: {} } as never;

	const result = await chooseBringToMain(thread, ctx, {
		showMenu: async (_ctx, title, options) => {
			prompts.push({ title, options: [...options] });
			const value = selections.shift();
			return value ? { kind: "select", value } : { kind: "back" };
		},
		showPreview: async () => ({ kind: "bring" }),
	});

	assert.deepEqual(prompts[0], {
		title: "Bring what back to the main thread?",
		options: [
			"Latest question and answer  1 Q&A · ~2 tokens",
			"From a question onward…  Choose a starting question",
			"Select exact text…  Lines or characters",
			"Entire side thread  2 Q&A · ~3 tokens",
			"Cancel  Return to the side thread",
		],
	});
	assert.equal(result.kind, "bringToMain");
	assert.doesNotMatch(result.kind === "bringToMain" ? result.draft : "", /Q1|A1/);
	assert.match(result.kind === "bringToMain" ? result.draft : "", /Q2[\s\S]*A2/);
});

test("large bring-to-main scopes preview the exact draft and support Back", async () => {
	const thread = createSideThread("context");
	for (const [question, answer] of [
		["Q1", "A1"],
		["Q2", "A2"],
	] as const) {
		thread.turns.push({ kind: "answered", question, answer, response: response(answer) });
	}
	let scopeMenuCount = 0;
	let previewDraft = "";
	const result = await chooseBringToMain(thread, { ui: {} } as never, {
		showMenu: async (_ctx, title, options) => {
			if (title !== "Bring what back to the main thread?") return { kind: "back" };
			scopeMenuCount += 1;
			const prefix = scopeMenuCount === 1 ? "Entire side thread" : "Latest question and answer";
			const value = options.find((option) => option.startsWith(prefix));
			return value ? { kind: "select", value } : { kind: "back" };
		},
		showPreview: async (_ctx, draft, summary) => {
			previewDraft = draft;
			assert.deepEqual(summary, { lines: 4, messages: 4, tokens: 3 });
			return { kind: "back" };
		},
	});

	assert.match(previewDraft, /Q1[\s\S]*A1[\s\S]*Q2[\s\S]*A2/);
	assert.equal(scopeMenuCount, 2);
	assert.equal(result.kind, "bringToMain");
	assert.doesNotMatch(result.kind === "bringToMain" ? result.draft : "", /Q1|A1/);
});

test("custom text ranges pass their exact formatted draft through preview", async () => {
	const thread = createSideThread("context");
	thread.turns.push({ kind: "answered", question: "Q", answer: "A", response: response("A") });
	const exactDraft = formatBtwBringToMain([{ role: "assistant", text: "exact excerpt" }]);
	let previewDraft = "";
	let selectorCustomOptions: unknown;
	let editor = "main draft";
	const ctx = {
		ui: {
			getEditorText: () => editor,
			setEditorText: (text: string) => {
				editor = text;
			},
			custom: async (_factory: unknown, customOptions?: unknown) => {
				selectorCustomOptions = customOptions;
				return {
					kind: "bringToMain",
					draft: exactDraft,
					summary: { lines: 1, messages: 1, tokens: 4 },
				};
			},
		},
	} as never;

	const result = await chooseBringToMain(thread, ctx, {
		showMenu: async (_ctx, _title, options) => {
			const value = options.find((option) => option.startsWith("Select exact text"));
			return value ? { kind: "select", value } : { kind: "back" };
		},
		showPreview: async (_ctx, draft) => {
			previewDraft = draft;
			return { kind: "bring" };
		},
	});

	assert.equal(selectorCustomOptions, undefined);
	assert.equal(previewDraft, exactDraft);
	assert.deepEqual(result, {
		kind: "bringToMain",
		draft: exactDraft,
		summary: { lines: 1, messages: 1, tokens: 4 },
	});
});

test("exact text selection survives returning from preview", async () => {
	const thread = createSideThread("context");
	thread.turns.push({
		kind: "answered",
		question: "abcd",
		answer: "answer",
		response: response("answer"),
	});
	let editor = "main draft";
	let selectorCount = 0;
	const ctx = {
		ui: {
			getEditorText: () => editor,
			setEditorText: (text: string) => {
				editor = text;
			},
			custom: async (
				factory: (...args: never[]) => {
					handleInput(data: string): void;
					render(width: number): string[];
				},
			) => {
				let result: unknown;
				const component = factory(
					{ terminal: { rows: 10 }, requestRender() {} } as never,
					{
						fg: (_color: string, text: string) => text,
						bg: (_color: string, text: string) => text,
						bold: (text: string) => text,
					} as never,
					keybindings() as never,
					((value: unknown) => {
						result = value;
					}) as never,
				);
				selectorCount += 1;
				if (selectorCount === 1) {
					component.handleInput("\u001b[1;2C");
					component.handleInput("\u001b[1;2C");
				} else {
					assert.match(component.render(80).join("\n"), /Selected: 1 line · 1 message/);
				}
				component.handleInput("\r");
				return result;
			},
		},
	} as never;
	let previewCount = 0;

	const result = await chooseBringToMain(thread, ctx, {
		showMenu: async (_ctx, _title, options) => {
			const value = options.find((option) => option.startsWith("Select exact text"));
			return value ? { kind: "select", value } : { kind: "back" };
		},
		showPreview: async () => {
			previewCount += 1;
			return previewCount === 1 ? { kind: "back" } : { kind: "bring" };
		},
	});

	assert.equal(selectorCount, 2);
	assert.equal(result.kind, "bringToMain");
	assert.match(result.kind === "bringToMain" ? result.draft : "", /User:\nab/);
});

test("bring-to-main preview renders exact content and configured Bring and Back keys", () => {
	const actions: unknown[] = [];
	const tui = { terminal: { rows: 9 }, requestRender() {} };
	const theme = {
		fg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	};
	const preview = new BtwBringToMainPreview(
		tui as never,
		theme as never,
		keybindings({ "tui.select.confirm": "y", "tui.select.cancel": "q" }) as never,
		"line one\nline two",
		{ lines: 2, messages: 1, tokens: 4 },
		(action) => actions.push(action),
	);

	assert.ok(preview.render(40).every((line) => visibleWidth(line) <= 40));
	const rendered = preview.render(80).join("\n");
	assert.match(rendered, /Preview · 1 message · 2 lines · ~4 tokens/);
	assert.match(rendered, /line one[\s\S]*line two/);
	assert.match(rendered, /Y bring.*Q back.*Ctrl\+C close/);
	preview.handleInput("q");

	assert.deepEqual(actions, [{ kind: "back" }]);
});

test("bring-to-main preview wraps long lines without hiding content", () => {
	const content = "abcdefghijklmnopqrstuvwxyz0123456789";
	const preview = new BtwBringToMainPreview(
		{ terminal: { rows: 12 }, requestRender() {} } as never,
		{
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
		} as never,
		keybindings() as never,
		content,
		{ lines: 1, messages: 1, tokens: 9 },
		() => undefined,
	);

	const contentRows = preview.render(12).slice(1, -1);
	assert.equal(contentRows.join("").replaceAll("\u001b[0m", ""), content);
});

test("bring-to-main scope menu propagates Ctrl+C as a side-thread close", async () => {
	const thread = createSideThread("context");
	thread.turns.push({ kind: "answered", question: "Q", answer: "A", response: response("A") });

	const result = await chooseBringToMain(thread, { ui: {} } as never, {
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

test("cancelled bring-to-main selection restores the unsubmitted side-question draft", async () => {
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
					? { kind: "bringToMain", questionDraft: "unfinished question" }
					: { kind: "close" };
			},
			chooseBringToMain: async () => ({ kind: "back" }),
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
					? { kind: "bringToMain", questionDraft: "unfinished question" }
					: { kind: "close" };
			},
			chooseBringToMain: async () => ({
				kind: "bringToMain",
				draft: "selected draft",
				summary: { lines: 1, messages: 1, tokens: 4 },
			}),
			deliverBringToMain: async () => "back",
		},
	});

	assert.deepEqual(drafts, [undefined, "unfinished question"]);
	assert.deepEqual(result, { kind: "closed" });
});

test("side-thread command loop loads an explicit bring-to-main draft without mutating the session", async () => {
	const branch = [{ type: "message", message: { role: "user", content: "main" } }];
	const ctx = {
		ui: { notify() {} },
		sessionManager: { getBranch: () => branch },
	} as never;
	const assistant = response("A1");
	const delivered: Array<{ draft: string; summary: unknown }> = [];
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
			interact: async () => ({ kind: "bringToMain", questionDraft: "" }),
			chooseBringToMain: async () => ({
				kind: "bringToMain",
				draft: "selected draft",
				summary: { lines: 1, messages: 1, tokens: 4 },
			}),
			deliverBringToMain: async (draft, _ctx, summary) => {
				delivered.push({ draft, summary });
				return "loaded";
			},
		},
	});

	assert.deepEqual(result, { kind: "closed" });
	assert.deepEqual(delivered, [
		{
			draft: "selected draft",
			summary: { lines: 1, messages: 1, tokens: 4 },
		},
	]);
	assert.equal(branch.length, 1);
});

test("appending a bring-to-main draft is recommended and reports the concrete outcome", async () => {
	let editor = "original editor";
	let customOptions: unknown;
	let menuOptions: string[] = [];
	const notifications: string[] = [];
	const ctx = {
		ui: {
			getEditorText: () => editor,
			custom: async (
				factory: (
					_tui: unknown,
					_theme: unknown,
					_keys: unknown,
					_done: (value: unknown) => void,
				) => unknown,
				options?: unknown,
			) => {
				const entryText = editor;
				let result: unknown;
				customOptions = options;
				const component = factory({}, {}, keybindings(), (value) => {
					result = value;
				}) as { handleInput(data: string): void; options?: readonly string[] };
				menuOptions = [...(component.options ?? [])];
				editor = "newer editor";
				component.handleInput("\r");
				editor = entryText;
				return result;
			},
			setEditorText: (text: string) => {
				editor = text;
			},
			notify(message: string) {
				notifications.push(message);
			},
		},
	} as never;

	const result = await loadBringToMainDraft("brought context", ctx, {
		lines: 1,
		messages: 1,
		tokens: 4,
	});

	assert.equal(result, "loaded");
	assert.equal(customOptions, undefined);
	assert.deepEqual(menuOptions, [
		"Append after current draft  Recommended",
		"⚠ Replace current draft  Discards current editor text",
		"Cancel  Return to the side thread",
	]);
	assert.equal(editor, "newer editor\n\nbrought context");
	assert.deepEqual(notifications, [
		"Appended 1 message (~4 tokens) to the existing main-editor draft. Review and submit when ready.",
	]);
});

test("replace requires destructive confirmation with Back selected first", async () => {
	let editor = "original editor";
	const menus: string[][] = [];
	const choices = [
		"⚠ Replace current draft  Discards current editor text",
		"Back  Keep current editor text",
		"Cancel  Return to the side thread",
	];
	const ctx = {
		ui: {
			getEditorText: () => editor,
			custom: async (factory: (...args: unknown[]) => unknown) => {
				const component = factory({}, {}, keybindings(), () => undefined) as {
					options?: readonly string[];
				};
				menus.push([...(component.options ?? [])]);
				return { kind: "select", value: choices.shift() };
			},
			setEditorText: (text: string) => {
				editor = text;
			},
			notify() {},
		},
	} as never;

	const result = await loadBringToMainDraft("brought context", ctx, {
		lines: 1,
		messages: 1,
		tokens: 4,
	});

	assert.equal(result, "back");
	assert.deepEqual(menus[1], [
		"Back  Keep current editor text",
		"⚠ Replace current draft  Cannot be undone",
	]);
	assert.equal(editor, "original editor");
});

test("confirmed replace reports the discarded-draft outcome", async () => {
	let editor = "original editor";
	const notifications: string[] = [];
	const choices = [
		"⚠ Replace current draft  Discards current editor text",
		"⚠ Replace current draft  Cannot be undone",
	];
	const ctx = {
		ui: {
			getEditorText: () => editor,
			custom: async () => ({ kind: "select", value: choices.shift() }),
			setEditorText: (text: string) => {
				editor = text;
			},
			notify(message: string) {
				notifications.push(message);
			},
		},
	} as never;

	const result = await loadBringToMainDraft("brought context", ctx, {
		lines: 1,
		messages: 2,
		tokens: 4,
	});

	assert.equal(result, "loaded");
	assert.equal(editor, "brought context");
	assert.deepEqual(notifications, [
		"Replaced the main-editor draft with 2 messages (~4 tokens). Review and submit when ready.",
	]);
});

test("replace re-prompts instead of discarding an editor update made during confirmation", async () => {
	let editor = "original editor";
	const targets = [
		"⚠ Replace current draft  Discards current editor text",
		"⚠ Replace current draft  Cannot be undone",
		"Cancel  Return to the side thread",
	];
	let menuCount = 0;
	const ctx = {
		ui: {
			getEditorText: () => editor,
			setEditorText: (text: string) => {
				editor = text;
			},
			custom: async (
				factory: (...args: never[]) => {
					handleInput(data: string): void;
					options?: readonly string[];
				},
			) => {
				const entryText = editor;
				let result: unknown;
				const component = factory(
					{ requestRender() {} } as never,
					{} as never,
					keybindings() as never,
					((value: unknown) => {
						result = value;
					}) as never,
				);
				const target = targets[menuCount];
				assert.ok(target);
				const index = component.options?.indexOf(target) ?? -1;
				assert.ok(index >= 0);
				if (menuCount === 1) editor = "concurrent editor update";
				for (let step = 0; step < index; step += 1) component.handleInput("\u001b[B");
				component.handleInput("\r");
				editor = entryText;
				menuCount += 1;
				return result;
			},
			notify() {},
		},
	} as never;

	const result = await loadBringToMainDraft("brought context", ctx, {
		lines: 1,
		messages: 1,
		tokens: 4,
	});

	assert.equal(result, "back");
	assert.equal(menuCount, 3);
	assert.equal(editor, "concurrent editor update");
});

test("empty main editor receives an editable draft with a concrete success message", async () => {
	let editor = "";
	const notifications: string[] = [];
	const ctx = {
		ui: {
			getEditorText: () => editor,
			setEditorText: (text: string) => {
				editor = text;
			},
			notify(message: string) {
				notifications.push(message);
			},
		},
	} as never;

	const result = await loadBringToMainDraft("brought context", ctx, {
		lines: 1,
		messages: 1,
		tokens: 1,
	});

	assert.equal(result, "loaded");
	assert.equal(editor, "brought context");
	assert.deepEqual(notifications, [
		"Brought 1 message (~1 token) to the main editor. Review and submit when ready.",
	]);
});

test("cancelling bring-to-main loading preserves editor updates made while the menu is open", async () => {
	let editor = "original editor";
	const ctx = {
		ui: {
			getEditorText: () => editor,
			custom: async (
				factory: (
					_tui: unknown,
					_theme: unknown,
					_keys: unknown,
					_done: (value: unknown) => void,
				) => unknown,
				options?: unknown,
			) => {
				assert.equal(options, undefined);
				const entryText = editor;
				let result: unknown;
				const component = factory({ requestRender() {} }, {}, keybindings(), (value) => {
					result = value;
				}) as { handleInput(data: string): void };
				editor = "newer editor";
				component.handleInput("\u001b[B");
				component.handleInput("\u001b[B");
				component.handleInput("\r");
				editor = entryText;
				return result;
			},
			setEditorText: (text: string) => {
				editor = text;
			},
			notify() {},
		},
	} as never;

	const result = await loadBringToMainDraft("brought context", ctx, {
		lines: 1,
		messages: 1,
		tokens: 4,
	});

	assert.equal(result, "back");
	assert.equal(editor, "newer editor");
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

test("transcript offers opt-in bring-to-main action only after a successful answer", () => {
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
	assert.match(answered.render(40).join("\n"), /Ctrl\+R/);
	assert.match(answered.render(29).join("\n"), /Ctrl\+R/);
	answered.handleInput("\u0012");

	assert.deepEqual(actions, [{ kind: "bringToMain", questionDraft: "" }]);
});

test("bring-to-main preserves expanded large-paste content in the composer draft", () => {
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
	const pager = new BtwTranscriptPager(
		tui as never,
		theme as never,
		[{ question: "Q1", answer: "A1", kind: "answered", response: response("A1") }],
		(action) => actions.push(action),
	);
	const pasted = "large paste ".repeat(100);
	pager.handleInput(`\u001b[200~${pasted}\u001b[201~`);
	pager.handleInput("\u0012");

	assert.deepEqual(actions, [{ kind: "bringToMain", questionDraft: pasted }]);
});

test("character ranges preserve a selected newline at the next line start", () => {
	const lines = buildBtwSelectionLines([
		{ question: "foo\nbar", answer: "A", kind: "answered", response: response("A") },
	]);

	assert.deepEqual(segmentsFromTextRange(lines, { line: 0, column: 0 }, { line: 1, column: 0 }), [
		{ role: "user", text: "foo\n" },
	]);
	assert.deepEqual(segmentsFromTextRange(lines, { line: 0, column: 3 }, { line: 1, column: 0 }), [
		{ role: "user", text: "\n" },
	]);
});

test("character ranges treat extended grapheme clusters as single characters", () => {
	const lines = buildBtwSelectionLines([
		{
			question: "e\u0301👍🏽👨‍👩‍👧",
			answer: "A",
			kind: "answered",
			response: response("A"),
		},
	]);

	assert.deepEqual(segmentsFromTextRange(lines, { line: 0, column: 0 }, { line: 0, column: 1 }), [
		{ role: "user", text: "e\u0301" },
	]);
	assert.deepEqual(segmentsFromTextRange(lines, { line: 0, column: 1 }, { line: 0, column: 3 }), [
		{ role: "user", text: "👍🏽👨‍👩‍👧" },
	]);
});

test("character ranges preserve exact text and role boundaries in either direction", () => {
	const lines = buildBtwSelectionLines([
		{ question: "abc", answer: "de\nfgh", kind: "answered", response: response("de\nfgh") },
	]);
	const expected = [
		{ role: "user" as const, text: "bc" },
		{ role: "assistant" as const, text: "de" },
	];

	assert.deepEqual(
		segmentsFromTextRange(lines, { line: 0, column: 1 }, { line: 1, column: 2 }),
		expected,
	);
	assert.deepEqual(
		segmentsFromTextRange(lines, { line: 1, column: 2 }, { line: 0, column: 1 }),
		expected,
	);
});

test("text range selector exposes selection status, non-color markers, and configured actions", () => {
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
	const selector = new BtwTextRangeSelector(
		tui as never,
		theme as never,
		keybindings({
			"tui.select.up": "k",
			"tui.select.down": "j",
			"tui.select.confirm": "y",
			"tui.select.cancel": "q",
		}) as never,
		[{ question: "abc", answer: "de", kind: "answered", response: response("de") }],
		(action) => actions.push(action),
	);

	const empty = selector.render(100).join("\n");
	assert.match(empty, /Select text to bring to main/);
	assert.match(empty, /Selected: none/);
	assert.match(empty, /Y bring.*Q back.*Ctrl\+C close/);
	assert.match(selector.render(40).join("\n"), /Y bring.*Q back.*Ctrl\+C close/);
	selector.handleInput(" ");
	const selected = selector.render(100).join("\n");
	assert.match(selected, /Selected: 1 line · 1 message · ~1 token/);
	assert.match(selected, /●> User/);
	assert.match(selected, /K\/J extend lines/);
});

test("text range selector moves like an editor and extends character selection with Shift+Arrows", () => {
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
			"tui.select.up": "k",
			"tui.select.down": "j",
			"tui.select.confirm": "y",
		}) as never,
		[{ question: "abc", answer: "de", kind: "answered", response: response("de") }],
		(action) => actions.push(action),
	);

	selector.handleInput("j");
	selector.handleInput("k");
	selector.handleInput("\u001b[C");
	selector.handleInput("\u001b[1;2C");
	selector.handleInput("\u001b[1;2C");
	selector.handleInput("\u001b[1;2B");
	const narrow = selector.render(24);
	assert.ok(narrow.every((line) => visibleWidth(line) <= 24));
	assert.match(selector.render(120).join("\n"), /Shift\+Arrows select.*Arrows move.*Y bring.*back/);
	selector.handleInput("y");

	assert.deepEqual(actions, [
		{
			kind: "confirm",
			segments: [
				{ role: "user", text: "bc" },
				{ role: "assistant", text: "de" },
			],
		},
	]);
});

test("Shift+Arrow selects one complete grapheme cluster", () => {
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
	const selector = new BtwTextRangeSelector(
		tui as never,
		theme as never,
		keybindings({ "tui.select.confirm": "y" }) as never,
		[{ question: "e\u0301👍🏽", answer: "A", kind: "answered", response: response("A") }],
		(action) => actions.push(action),
	);

	selector.handleInput("\u001b[1;2C");
	selector.handleInput("y");

	assert.deepEqual(actions, [{ kind: "confirm", segments: [{ role: "user", text: "e\u0301" }] }]);
});

test("text range selector uses Space to select and extend whole raw lines", () => {
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
		keybindings({ "tui.select.down": "j", "tui.select.confirm": "y" }) as never,
		[
			{
				question: "one\ntwo",
				answer: "three",
				kind: "answered",
				response: response("three"),
			},
		],
		(action) => actions.push(action),
	);

	selector.handleInput(" ");
	selector.handleInput("j");
	selector.handleInput("j");
	assert.match(selector.render(120).join("\n"), /Space clear.*extend lines/);
	selector.handleInput("y");

	assert.deepEqual(actions, [
		{
			kind: "confirm",
			segments: [
				{ role: "user", text: "one\ntwo" },
				{ role: "assistant", text: "three" },
			],
		},
	]);
});

test("Shift+Arrow switches a Space line selection to character selection", () => {
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
	const selector = new BtwTextRangeSelector(
		tui as never,
		theme as never,
		keybindings({ "tui.select.confirm": "y" }) as never,
		[{ question: "one", answer: "three", kind: "answered", response: response("three") }],
		(action) => actions.push(action),
	);

	selector.handleInput(" ");
	selector.handleInput(" ");
	selector.handleInput("y");
	assert.deepEqual(actions, []);
	selector.handleInput(" ");
	selector.handleInput("\u001b[1;2C");
	selector.handleInput("y");

	assert.deepEqual(actions, [{ kind: "confirm", segments: [{ role: "user", text: "o" }] }]);
});

test("text range selector keeps a horizontally moved character cursor visible", () => {
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
	const selector = new BtwTextRangeSelector(
		tui as never,
		theme as never,
		keybindings() as never,
		[{ question: "0123456789ABCDEFGHIJ", answer: "A", kind: "answered", response: response("A") }],
		() => undefined,
	);
	for (let index = 0; index < 18; index += 1) selector.handleInput("\u001b[C");
	const rendered = selector.render(24);

	assert.ok(rendered.every((line) => visibleWidth(line) <= 24));
	assert.match(rendered.join("\n"), /….*│I/);
});

test("text range selector measures terminal cells to keep a CJK cursor visible", () => {
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
	const selector = new BtwTextRangeSelector(
		tui as never,
		theme as never,
		keybindings() as never,
		[{ question: "界".repeat(12), answer: "A", kind: "answered", response: response("A") }],
		() => undefined,
	);
	for (let index = 0; index < 10; index += 1) selector.handleInput("\u001b[C");
	const rendered = selector.render(24);

	assert.ok(rendered.every((line) => visibleWidth(line) <= 24));
	assert.match(rendered.find((line) => line.includes("User")) ?? "", /│/);
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
	const compact = composer.render(40).join("\n");
	assert.match(compact, /Ctrl\+R/);
	assert.match(compact, /PgUp\/PgDn/);
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
