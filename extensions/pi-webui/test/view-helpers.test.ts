import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const helpers = (await import(
	`${pathToFileURL(path.join(process.cwd(), "extensions/pi-webui/src/web/ui/view-helpers.js")).href}?t=${Date.now()}`
)) as {
	withStableKeys<T>(values: T[]): Array<{ key: string; value: T }>;
	createRenderBatcher(
		schedule: (callback: () => void) => void,
		render: (extra: { transcriptAnnouncement?: string; scrollToLatest?: boolean }) => void,
	): ((extra?: { transcriptAnnouncement?: string; scrollToLatest?: boolean }) => void) & {
		cancel(): void;
	};
	allowTranscriptAutoScroll(following: boolean, active?: boolean): boolean;
	shouldBatchConversationEvent(type: string): boolean;
	shouldScrollForConversationEvent(type: string, following: boolean): boolean;
	withPublishedConversation<T extends { messages: unknown[]; tools: unknown[] }>(
		model: T,
		messages: unknown[],
		tools: unknown[],
	): T;
};

test("conversation renders batch bursts while preserving important view signals", () => {
	const scheduled: Array<() => void> = [];
	const renders: Array<{ transcriptAnnouncement?: string; scrollToLatest?: boolean }> = [];
	const batch = helpers.createRenderBatcher(
		(callback) => scheduled.push(callback),
		(extra) => renders.push(extra),
	);

	batch({ scrollToLatest: true });
	batch({ transcriptAnnouncement: "Tool completed." });
	batch({ transcriptAnnouncement: "" });

	assert.equal(scheduled.length, 1);
	assert.deepEqual(renders, []);
	scheduled[0]?.();
	assert.deepEqual(renders, [{ transcriptAnnouncement: "Tool completed.", scrollToLatest: true }]);

	batch();
	assert.equal(scheduled.length, 2);
});

test("cancelled conversation renders cannot publish stale signals", () => {
	const scheduled: Array<() => void> = [];
	const renders: Array<{ transcriptAnnouncement?: string }> = [];
	const batch = helpers.createRenderBatcher(
		(callback) => scheduled.push(callback),
		(extra) => renders.push(extra),
	);

	batch({ transcriptAnnouncement: "Tool completed." });
	batch.cancel();
	scheduled[0]?.();
	assert.deepEqual(renders, []);

	batch({ transcriptAnnouncement: "New completed message from Pi." });
	scheduled[1]?.();
	assert.deepEqual(renders, [
		{ transcriptAnnouncement: "New completed message from Pi.", scrollToLatest: false },
	]);
});

test("only transcript-heavy conversation events are batched", () => {
	assert.equal(helpers.shouldBatchConversationEvent("message"), true);
	assert.equal(helpers.shouldBatchConversationEvent("tool"), true);
	assert.equal(helpers.shouldBatchConversationEvent("activity"), false);
	assert.equal(helpers.shouldBatchConversationEvent("session-ended"), false);
	assert.equal(helpers.shouldBatchConversationEvent("snapshot"), false);
});

test("immediate composer renders retain the published transcript", () => {
	const publishedMessages = [{ id: "assistant", content: "published" }];
	const publishedTools = [{ id: "tool", phase: "start" }];
	const pending = {
		text: "new input",
		activity: "idle",
		messages: [{ id: "assistant", content: "pending stream" }],
		tools: [{ id: "tool", phase: "update" }],
	};

	const rendered = helpers.withPublishedConversation(pending, publishedMessages, publishedTools);
	assert.equal(rendered.text, "new input");
	assert.equal(rendered.activity, "idle");
	assert.equal(rendered.messages, publishedMessages);
	assert.equal(rendered.tools, publishedTools);
	assert.equal(
		helpers.withPublishedConversation(pending, pending.messages, pending.tools),
		pending,
	);
});

test("delayed transcript renders use the current follow state", () => {
	assert.equal(helpers.allowTranscriptAutoScroll(true), true);
	assert.equal(helpers.allowTranscriptAutoScroll(false), false);
	assert.equal(helpers.allowTranscriptAutoScroll(true, false), false);
});

test("authoritative conversation snapshots preserve follow scrolling", () => {
	assert.equal(helpers.shouldScrollForConversationEvent("snapshot", true), true);
	assert.equal(helpers.shouldScrollForConversationEvent("snapshot", false), false);
	assert.equal(helpers.shouldScrollForConversationEvent("activity", true), false);
	assert.equal(helpers.shouldScrollForConversationEvent("session-ended", true), false);
});

test("transcript keys survive streaming content updates", () => {
	const initial = helpers.withStableKeys([
		{ type: "thinking", text: "Working" },
		{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "a" } },
	]);
	const updated = helpers.withStableKeys([
		{ type: "thinking", text: "Working through the result" },
		{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "b" } },
	]);

	assert.deepEqual(
		updated.map(({ key }) => key),
		initial.map(({ key }) => key),
	);
});
