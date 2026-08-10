import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import {
	captureSemanticResourceGeneration,
	captureSemanticSnapshot,
	evaluateSemanticCompatibility,
	isSemanticSnapshot,
} from "../src/semantic-snapshot.js";

const base = {
	agentName: "worker",
	agentManifest: { version: "v1", capabilities: ["implementation"] },
	rolePrompt: "private prompt text",
	tools: ["read", "edit"],
	model: "provider/model",
	thinkingLevel: "medium",
	transport: "rpc",
	trust: { kind: "session-trusted", projectTrusted: true },
	repository: { kind: "git-commit", generation: "abc123" },
	artifacts: { schema: "v1" },
	workflowGeneration: 2,
	schedulerPolicy: "dependency-aware-v1",
};

test("semantic resource generation changes without exposing resource contents", async () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-semantic-resources-"));
	const file = path.join(directory, "SKILL.md");
	writeFileSync(file, "private skill contents");
	const first = await captureSemanticResourceGeneration([directory]);
	writeFileSync(file, "changed private skill contents");
	const second = await captureSemanticResourceGeneration([directory]);
	assert.notEqual(first, second);
	assert.doesNotMatch(first, /private|skill|contents/);
	rmSync(directory, { recursive: true, force: true });
});

test("semantic snapshot stores bounded hashes instead of prompts, secrets, or paths", () => {
	const snapshot = captureSemanticSnapshot(base);
	const serialized = JSON.stringify(snapshot);
	assert.doesNotMatch(serialized, /private prompt text/);
	assert.doesNotMatch(serialized, /provider\/model/);
	assert.match(snapshot.digest, /^[a-f0-9]{64}$/);
	assert.equal(Object.keys(snapshot.components).length > 5, true);
});

test("semantic compatibility detects artifact and policy skew before continuation", () => {
	const previous = captureSemanticSnapshot(base);
	assert.deepEqual(evaluateSemanticCompatibility(previous, captureSemanticSnapshot(base)), {
		status: "compatible",
		changedComponents: [],
	});
	const changedArtifact = captureSemanticSnapshot({ ...base, artifacts: { schema: "v2" } });
	assert.deepEqual(evaluateSemanticCompatibility(previous, changedArtifact), {
		status: "needs-revalidation",
		changedComponents: ["artifacts"],
	});
	const changedScheduler = captureSemanticSnapshot({
		...base,
		schedulerPolicy: "legacy-fifo",
	});
	assert.deepEqual(evaluateSemanticCompatibility(previous, changedScheduler), {
		status: "warning",
		changedComponents: ["schedulerPolicy"],
	});
});

test("semantic snapshot validation rejects missing compatibility components", () => {
	const snapshot = captureSemanticSnapshot(base);
	assert.equal(isSemanticSnapshot(snapshot), true);
	assert.equal(isSemanticSnapshot({ ...snapshot, components: {} }), false);
	const forged = {
		...snapshot,
		components: { ...snapshot.components, tools: "0".repeat(64) },
	};
	assert.equal(isSemanticSnapshot(forged), false);
	assert.deepEqual(evaluateSemanticCompatibility(snapshot, forged), {
		status: "rejected",
		changedComponents: ["invalid-snapshot"],
	});
});

test("unknown semantic snapshot versions are rejected", () => {
	const snapshot = captureSemanticSnapshot(base);
	assert.deepEqual(
		evaluateSemanticCompatibility(
			{ ...snapshot, version: "pi-subagents:semantic-snapshot:v0" } as never,
			snapshot,
		),
		{ status: "rejected", changedComponents: ["version"] },
	);
});
