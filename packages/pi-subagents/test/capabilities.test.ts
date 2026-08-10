import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeCapabilityManifest, projectCapabilityManifest } from "../src/capabilities.js";

test("capability manifest normalizes stable bounded declarations", () => {
	const manifest = normalizeCapabilityManifest({
		version: "pi-subagents:capabilities:v1",
		capabilities: ["repository-search", "code-evidence", "repository-search"],
		modalities: ["text"],
		resultFormats: ["structured-v2"],
		authority: { filesystem: "read", network: "none", secrets: "none" },
		verificationRoles: ["evidence-review"],
		contextStrengths: ["repository"],
		costHint: "low",
		latencyHint: "medium",
		limitations: ["No implementation"],
	});
	assert.deepEqual(manifest?.capabilities, ["repository-search", "code-evidence"]);
	assert.equal(manifest?.authority?.filesystem, "read");
	assert.equal(manifest?.costHint, "low");
	assert.deepEqual(manifest?.contextStrengths, ["repository"]);
	assert.deepEqual(projectCapabilityManifest(manifest), manifest);
});

test("capability manifest distinguishes absent, empty, and malformed declarations", () => {
	assert.equal(normalizeCapabilityManifest(undefined), undefined);
	assert.deepEqual(
		normalizeCapabilityManifest({
			version: "pi-subagents:capabilities:v1",
			capabilities: [],
		}),
		{
			version: "pi-subagents:capabilities:v1",
			capabilities: [],
			modalities: [],
			resultFormats: [],
			verificationRoles: [],
			limitations: [],
		},
	);
	assert.equal(
		normalizeCapabilityManifest({
			version: "pi-subagents:capabilities:v2",
			capabilities: [],
		}),
		undefined,
	);
});
