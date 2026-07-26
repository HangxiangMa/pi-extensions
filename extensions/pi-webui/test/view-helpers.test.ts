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
	allowTranscriptAutoScroll(requested: boolean, following: boolean, active?: boolean): boolean;
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

test("a delayed transcript render cannot override a user who stopped following", () => {
	assert.equal(helpers.allowTranscriptAutoScroll(true, true), true);
	assert.equal(helpers.allowTranscriptAutoScroll(true, false), false);
	assert.equal(helpers.allowTranscriptAutoScroll(false, true), false);
	assert.equal(helpers.allowTranscriptAutoScroll(true, true, false), false);
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
