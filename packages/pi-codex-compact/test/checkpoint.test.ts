import assert from "node:assert/strict";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { CompactionEntry, SessionEntry } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import {
	buildReplacementHistory,
	checkpointMarker,
	createCheckpointDetails,
	fallbackSummary,
	fingerprintMessage,
	latestCheckpoint,
	parseCheckpointDetails,
	projectCheckpointContext,
} from "../src/checkpoint.js";

function user(text: string, timestamp = 1): AgentMessage {
	return { role: "user", content: [{ type: "text", text }], timestamp };
}

function rawUser(text: string) {
	return { role: "user", content: [{ type: "input_text", text }] };
}

const opaque = { type: "compaction", encrypted_content: "opaque" };

function checkpoint(kept: AgentMessage[] = [user("kept", 2)], id = "checkpoint-123") {
	return createCheckpointDetails({
		modelId: "gpt-5.6",
		replacementHistory: [rawUser("old"), opaque],
		keptMessages: kept,
		checkpointId: id,
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

test("builds newest-first bounded replacement history and puts opaque item last", () => {
	const history = buildReplacementHistory(
		[rawUser("oldest"), { type: "compaction", encrypted_content: "old" }, rawUser("newest")],
		opaque,
		{ tokenBudget: 2, byteBudget: 2048 },
	);
	assert.equal(history.at(-1)?.type, "compaction");
	assert.equal(history.at(-1)?.encrypted_content, "opaque");
	assert.match(JSON.stringify(history), /newest/);
	assert.doesNotMatch(JSON.stringify(history), /encrypted_content":"old/);
});

test("partially truncates the oldest fitting text item", () => {
	const history = buildReplacementHistory(
		[rawUser("abcdefghijklmnopqrstuvwxyz".repeat(4))],
		opaque,
		{
			tokenBudget: 10,
			byteBudget: 2048,
		},
	);
	assert.equal(history.length, 2);
	assert.match(JSON.stringify(history[0]), /\[truncated\]/);
	assert.match(JSON.stringify(history[0]), /wxyz/);
});

test("drops media that cannot fit the checkpoint byte budget", () => {
	const media = {
		role: "user",
		content: [{ type: "input_image", image_url: `data:image/png;base64,${"x".repeat(1024)}` }],
	};
	const history = buildReplacementHistory([rawUser("small"), media], opaque, {
		tokenBudget: 100,
		byteBudget: 512,
	});
	assert.equal(history.length, 2);
	assert.match(JSON.stringify(history[0]), /small/);
	assert.doesNotMatch(JSON.stringify(history), /input_image/);
});

test("validates versioned details and rejects malformed or unbounded persisted data", () => {
	const details = checkpoint();
	assert.deepEqual(parseCheckpointDetails(details), details);
	assert.equal(parseCheckpointDetails({ ...details, version: 2 }), undefined);
	assert.equal(parseCheckpointDetails({ ...details, replacementHistory: [] }), undefined);
	assert.equal(parseCheckpointDetails({ ...details, keptMessageFingerprints: ["bad"] }), undefined);
	assert.doesNotMatch(JSON.stringify(details), /token|authorization|header/i);
});

test("projects only an exact summary and kept suffix while preserving unrelated context", () => {
	const before = user("before", 0);
	const kept = user("kept", 2);
	const after = user("after", 3);
	const details = checkpoint([kept]);
	const summary: AgentMessage = {
		role: "compactionSummary",
		summary: fallbackSummary(details.checkpointId),
		tokensBefore: 100,
		timestamp: 1,
	};
	const projected = projectCheckpointContext([before, summary, kept, after], details);
	assert.ok(projected);
	assert.deepEqual(projected?.[0], before);
	assert.equal(projected?.[1].role, "user");
	assert.match(JSON.stringify(projected?.[1]), new RegExp(details.checkpointId));
	assert.deepEqual(projected?.[2], after);
	assert.equal(projectCheckpointContext([summary, user("changed", 2), after], details), undefined);
	assert.equal(projectCheckpointContext([kept, after], details), undefined);
});

test("uses canonical SHA-256 message fingerprints", () => {
	const message = user("same");
	assert.match(fingerprintMessage(message), /^[a-f0-9]{64}$/);
	assert.equal(fingerprintMessage(message), fingerprintMessage({ ...message }));
	assert.notEqual(fingerprintMessage(message), fingerprintMessage(user("different")));
	assert.match(checkpointMarker("checkpoint-123"), /injection failed/i);
});

test("selects the newest checkpoint on the active branch and ignores forks before it", () => {
	const first = checkpoint([], "checkpoint-first");
	const second = checkpoint([], "checkpoint-second");
	const entry = (
		id: string,
		details: ReturnType<typeof checkpoint>,
		parentId: string | null,
	): CompactionEntry => ({
		type: "compaction",
		id,
		parentId,
		timestamp: "2026-01-01T00:00:00.000Z",
		summary: fallbackSummary(details.checkpointId),
		firstKeptEntryId: "kept",
		tokensBefore: 10,
		details,
	});
	const branch = [entry("first", first, null), entry("second", second, "first")] as SessionEntry[];
	assert.equal(latestCheckpoint(branch)?.details.checkpointId, "checkpoint-second");
	assert.equal(latestCheckpoint(branch.slice(0, 1))?.details.checkpointId, "checkpoint-first");
	const native = {
		...entry("native", second, "second"),
		details: undefined,
		summary: "native summary",
	};
	assert.equal(latestCheckpoint([...branch, native]), undefined);
	assert.equal(latestCheckpoint([]), undefined);
});
