import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createMockContext, createMockPi } from "../../../test/support.js";
import stamp, { formatStampTime, isMessageStampData, STAMP_ENTRY_TYPE } from "../src/stamp.js";

const USER_TIMESTAMP = new Date(2026, 0, 2, 5, 6, 7, 123).getTime();
const ASSISTANT_TIMESTAMP = new Date(2026, 0, 2, 5, 6, 9, 456).getTime();

test("stamp registers one entry renderer and only passive lifecycle handlers", () => {
	const mock = createMockPi();
	stamp(mock.pi);

	assert.deepEqual([...mock.entryRenderers.keys()], [STAMP_ENTRY_TYPE]);
	assert.equal(mock.commands.size, 0);
	assert.equal(mock.tools.length, 0);
	assert.deepEqual([...mock.events.keys()].sort(), [
		"agent_end",
		"message_end",
		"message_start",
		"session_shutdown",
		"session_start",
		"turn_end",
	]);
});

test("formatStampTime uses zero-padded local 24-hour time and rejects invalid values", () => {
	assert.equal(formatStampTime(USER_TIMESTAMP), "05:06:07");
	assert.equal(formatStampTime(Number.NaN), undefined);
	assert.equal(formatStampTime(Number.POSITIVE_INFINITY), undefined);
	assert.equal(formatStampTime(10 ** 20), undefined);
});

test("isMessageStampData accepts only the current finite persisted schema", () => {
	assert.equal(isMessageStampData({ version: 1, role: "user", timestamp: USER_TIMESTAMP }), true);
	assert.equal(
		isMessageStampData({ version: 1, role: "assistant", timestamp: ASSISTANT_TIMESTAMP }),
		true,
	);
	assert.equal(isMessageStampData({ version: 2, role: "user", timestamp: USER_TIMESTAMP }), false);
	assert.equal(
		isMessageStampData({ version: 1, role: "toolResult", timestamp: USER_TIMESTAMP }),
		false,
	);
	assert.equal(isMessageStampData({ version: 1, role: "user", timestamp: Number.NaN }), false);
	assert.equal(isMessageStampData(null), false);
});

test("entry renderer uses the callback theme, right-aligns, and stays width-safe", () => {
	const mock = createMockPi();
	stamp(mock.pi);
	const renderer = mock.entryRenderers.get(STAMP_ENTRY_TYPE);
	assert.ok(renderer);

	const colors: string[] = [];
	const component = renderer(
		{
			data: { version: 1, role: "user", timestamp: USER_TIMESTAMP },
		},
		{ expanded: false },
		{
			fg(color: string, text: string) {
				colors.push(color);
				return text;
			},
		},
	) as { render(width: number): string[] } | undefined;

	assert.ok(component);
	assert.deepEqual(colors, ["dim"]);
	assert.equal(component.render(12).join("\n"), "    05:06:07");
	assert.equal(component.render(8).join("\n"), "05:06:07");
	for (const width of [1, 4, 8, 10]) {
		for (const line of component.render(width)) {
			assert.ok(visibleWidth(line) <= width, `${JSON.stringify(line)} exceeded width ${width}`);
		}
	}

	assert.equal(
		renderer({ data: { version: 99 } }, { expanded: false }, { fg: () => "" }),
		undefined,
	);
});

test("Pi persists stamp entries across reopen without adding them to model context", (t) => {
	const sessionDir = mkdtempSync(`${os.tmpdir()}/pi-stamp-session-`);
	t.after(() => rmSync(sessionDir, { recursive: true, force: true }));
	const session = SessionManager.create(process.cwd(), sessionDir);
	const stampData = { version: 1, role: "user", timestamp: USER_TIMESTAMP } as const;

	session.appendMessage(userMessage(USER_TIMESTAMP));
	session.appendCustomEntry(STAMP_ENTRY_TYPE, stampData);
	session.appendMessage(assistantMessage(ASSISTANT_TIMESTAMP));
	const sessionFile = session.getSessionFile();
	assert.ok(sessionFile);

	const reopened = SessionManager.open(sessionFile, sessionDir);
	assert.deepEqual(
		reopened.getBranch().map((entry) => entry.type),
		["message", "custom", "message"],
	);
	const restoredStamp = reopened.getBranch().at(1);
	assert.equal(restoredStamp?.type, "custom");
	if (restoredStamp?.type !== "custom") assert.fail("Expected restored custom stamp entry");
	assert.equal(restoredStamp.customType, STAMP_ENTRY_TYPE);
	assert.deepEqual(restoredStamp.data, stampData);
	assert.deepEqual(
		reopened.buildSessionContext().messages.map((message) => message.role),
		["user", "assistant"],
	);
});

test("TUI lifecycle appends one user stamp before the assistant and one assistant stamp at turn end", async () => {
	const mock = createMockPi();
	stamp(mock.pi);
	const { ctx } = createMockContext({ mode: "tui" });
	const user = userMessage(USER_TIMESTAMP);
	const assistant = assistantMessage(ASSISTANT_TIMESTAMP);

	await emit(mock, "session_start", { reason: "startup" }, ctx);
	await emit(mock, "message_start", { message: user }, ctx);
	await emit(mock, "message_end", { message: user }, ctx);
	assert.deepEqual(mock.entries, []);

	await emit(mock, "message_start", { message: assistant }, ctx);
	assert.deepEqual(mock.entries, [stampEntry("user", USER_TIMESTAMP)]);

	await emit(mock, "message_end", { message: assistant }, ctx);
	await emit(mock, "turn_end", { message: assistant, toolResults: [], turnIndex: 0 }, ctx);
	assert.deepEqual(mock.entries, [
		stampEntry("user", USER_TIMESTAMP),
		stampEntry("assistant", ASSISTANT_TIMESTAMP),
	]);

	await emit(mock, "agent_end", { messages: [user, assistant] }, ctx);
	await emit(mock, "session_shutdown", { reason: "quit" }, ctx);
	assert.equal(mock.entries.length, 2);
	assert.deepEqual(mock.sentMessages, []);
	assert.deepEqual(mock.sentUserMessages, []);
});

test("successive user messages flush in source order at the following message boundaries", async () => {
	const mock = createMockPi();
	stamp(mock.pi);
	const { ctx } = createMockContext({ mode: "tui" });
	const first = userMessage(USER_TIMESTAMP);
	const second = userMessage(USER_TIMESTAMP + 1_000);
	const assistant = assistantMessage(ASSISTANT_TIMESTAMP);

	await emit(mock, "session_start", { reason: "startup" }, ctx);
	await emit(mock, "message_end", { message: first }, ctx);
	await emit(mock, "message_start", { message: second }, ctx);
	await emit(mock, "message_end", { message: second }, ctx);
	await emit(mock, "message_start", { message: assistant }, ctx);

	assert.deepEqual(mock.entries, [
		stampEntry("user", USER_TIMESTAMP),
		stampEntry("user", USER_TIMESTAMP + 1_000),
	]);
});

test("assistant tool and error turns receive one stamp without stamping tool results", async () => {
	const mock = createMockPi();
	stamp(mock.pi);
	const { ctx } = createMockContext({ mode: "tui" });
	const toolAssistant = assistantMessage(ASSISTANT_TIMESTAMP, "toolUse");
	const errorAssistant = assistantMessage(ASSISTANT_TIMESTAMP + 2_000, "error");

	await emit(mock, "session_start", { reason: "startup" }, ctx);
	await emit(
		mock,
		"message_end",
		{
			message: {
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "read",
				content: [],
				isError: false,
				timestamp: ASSISTANT_TIMESTAMP + 1_000,
			},
		},
		ctx,
	);
	await emit(mock, "turn_end", { message: toolAssistant, toolResults: [], turnIndex: 0 }, ctx);
	await emit(mock, "turn_end", { message: errorAssistant, toolResults: [], turnIndex: 1 }, ctx);

	assert.deepEqual(mock.entries, [
		stampEntry("assistant", ASSISTANT_TIMESTAMP),
		stampEntry("assistant", ASSISTANT_TIMESTAMP + 2_000),
	]);
});

test("agent end and shutdown flush a pending user at most once and reload resets state", async () => {
	const mock = createMockPi();
	stamp(mock.pi);
	const { ctx } = createMockContext({ mode: "tui" });

	await emit(mock, "session_start", { reason: "startup" }, ctx);
	await emit(mock, "message_end", { message: userMessage(USER_TIMESTAMP) }, ctx);
	await emit(mock, "agent_end", { messages: [] }, ctx);
	await emit(mock, "session_shutdown", { reason: "reload" }, ctx);
	assert.deepEqual(mock.entries, [stampEntry("user", USER_TIMESTAMP)]);

	await emit(mock, "session_start", { reason: "reload" }, ctx);
	await emit(mock, "agent_end", { messages: [] }, ctx);
	assert.equal(mock.entries.length, 1);

	await emit(mock, "message_end", { message: userMessage(USER_TIMESTAMP + 1_000) }, ctx);
	await emit(mock, "session_shutdown", { reason: "quit" }, ctx);
	assert.deepEqual(mock.entries, [
		stampEntry("user", USER_TIMESTAMP),
		stampEntry("user", USER_TIMESTAMP + 1_000),
	]);
});

test("print, JSON, and RPC sessions never append stamp entries", async () => {
	for (const mode of ["print", "json", "rpc"] as const) {
		const mock = createMockPi();
		stamp(mock.pi);
		const { ctx } = createMockContext({ mode });
		const assistant = assistantMessage(ASSISTANT_TIMESTAMP);

		await emit(mock, "session_start", { reason: "startup" }, ctx);
		await emit(mock, "message_end", { message: userMessage(USER_TIMESTAMP) }, ctx);
		await emit(mock, "message_start", { message: assistant }, ctx);
		await emit(mock, "turn_end", { message: assistant, toolResults: [], turnIndex: 0 }, ctx);
		await emit(mock, "agent_end", { messages: [] }, ctx);
		await emit(mock, "session_shutdown", { reason: "quit" }, ctx);

		assert.deepEqual(mock.entries, [], mode);
	}
});

function stampEntry(role: "user" | "assistant", timestamp: number) {
	return {
		customType: STAMP_ENTRY_TYPE,
		data: { version: 1, role, timestamp },
	};
}

function userMessage(timestamp: number) {
	return { role: "user" as const, content: "hello", timestamp };
}

function assistantMessage(timestamp: number, stopReason: "stop" | "toolUse" | "error" = "stop") {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text: "hello" }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test-model",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp,
	};
}

async function emit(
	mock: ReturnType<typeof createMockPi>,
	name: string,
	event: unknown,
	ctx: unknown,
): Promise<void> {
	for (const handler of mock.events.get(name) ?? []) {
		await handler(event, ctx);
	}
}
