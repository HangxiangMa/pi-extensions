import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	consumeSubagentSettingsNotice,
	inspectConsultResourceSettings,
	inspectCwdPolicySettings,
	inspectSubagentSettings,
	normalizeSubagentSettings,
	readSubagentSettings,
	updateConsultResourceSetting,
	updateCwdPolicySetting,
} from "../src/settings.js";

function withAgentDir(run: (directory: string) => void): void {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-settings-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = directory;
	try {
		run(directory);
	} finally {
		consumeSubagentSettingsNotice();
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(directory, { recursive: true, force: true });
	}
}

test("consult resources normalize strictly and default without creating settings", () => {
	withAgentDir((directory) => {
		assert.deepEqual(normalizeSubagentSettings({ consult: { resources: "none" } }), {
			consult: { resources: "none" },
		});
		assert.deepEqual(normalizeSubagentSettings({ consult: { resources: "all" } }), {
			consult: { resources: "all" },
		});
		assert.equal(normalizeSubagentSettings({ consult: { resources: "unsafe" } }), undefined);

		const inspected = inspectConsultResourceSettings();
		assert.equal(inspected.value, "project-context");
		assert.equal(inspected.source, "default");
		assert.equal(inspected.error, undefined);
		assert.equal(inspected.path, path.join(directory, "pi-subagents.json"));
		assert.equal(readSubagentSettings(), undefined);
		assert.throws(() => readFileSync(inspected.path, "utf8"), /ENOENT/);
	});
});

test("cwd policies normalize strictly and default without creating settings", () => {
	withAgentDir((directory) => {
		assert.deepEqual(
			normalizeSubagentSettings({
				cwdPolicy: { consultation: "current-workspace", delegation: "anywhere" },
			}),
			{ cwdPolicy: { consultation: "current-workspace", delegation: "anywhere" } },
		);
		assert.equal(
			normalizeSubagentSettings({ cwdPolicy: { consultation: "trusted-targets" } }),
			undefined,
		);
		assert.equal(normalizeSubagentSettings({ cwdPolicy: { delegation: "invalid" } }), undefined);

		const inspected = inspectCwdPolicySettings();
		assert.equal(inspected.consultation.value, "anywhere");
		assert.equal(inspected.consultation.source, "default");
		assert.equal(inspected.delegation.value, "trusted-targets");
		assert.equal(inspected.delegation.source, "default");
		assert.equal(inspected.path, path.join(directory, "pi-subagents.json"));
		assert.throws(() => readFileSync(inspected.path, "utf8"), /ENOENT/);
	});
});

test("cwd policy inspection reports per-field sources", () => {
	withAgentDir((directory) => {
		writeFileSync(
			path.join(directory, "pi-subagents.json"),
			JSON.stringify({ cwdPolicy: { consultation: "current-workspace" } }),
		);
		const inspected = inspectCwdPolicySettings();
		assert.equal(inspected.consultation.value, "current-workspace");
		assert.equal(inspected.consultation.source, "user settings");
		assert.equal(inspected.delegation.value, "trusted-targets");
		assert.equal(inspected.delegation.source, "default");
	});
});

test("cwd policy updates preserve unknown fields and reject invalid files", () => {
	withAgentDir((directory) => {
		const settingsPath = path.join(directory, "pi-subagents.json");
		writeFileSync(
			settingsPath,
			JSON.stringify({ future: true, cwdPolicy: { future: 7, consultation: "anywhere" } }),
		);
		updateCwdPolicySetting("delegation", "current-workspace");
		assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), {
			future: true,
			cwdPolicy: {
				future: 7,
				consultation: "anywhere",
				delegation: "current-workspace",
			},
		});

		writeFileSync(settingsPath, JSON.stringify({ cwdPolicy: [] }));
		assert.throws(() => updateCwdPolicySetting("consultation", "current-workspace"), /invalid/i);
	});
});

test("pure settings inspection preserves pending notices", () => {
	withAgentDir((directory) => {
		writeFileSync(
			path.join(directory, "pi-subagents-config.json"),
			JSON.stringify({ consult: { resources: "all" } }),
		);
		assert.equal(readSubagentSettings()?.consult?.resources, "all");
		const snapshot = inspectSubagentSettings();
		assert.equal(snapshot.settings?.consult?.resources, "all");
		assert.equal(snapshot.source, "user settings");
		assert.match(consumeSubagentSettingsNotice() ?? "", /legacy/i);
	});
});

test("consult resource updates preserve unknown fields and reject invalid files", () => {
	withAgentDir((directory) => {
		const settingsPath = path.join(directory, "pi-subagents.json");
		writeFileSync(
			settingsPath,
			JSON.stringify({ future: { keep: true }, consult: { future: 7, resources: "all" } }),
		);
		updateConsultResourceSetting("none");
		assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), {
			future: { keep: true },
			consult: { future: 7, resources: "none" },
		});

		writeFileSync(settingsPath, '{"SECRET_SETTINGS_BYTES":"unterminated');
		assert.throws(
			() => updateConsultResourceSetting("all"),
			(error: unknown) =>
				error instanceof Error &&
				/malformed/i.test(error.message) &&
				!error.message.includes("SECRET_SETTINGS_BYTES"),
		);
		const inspected = inspectSubagentSettings();
		assert.match(inspected.error ?? "", /malformed JSON/i);
		assert.doesNotMatch(inspected.error ?? "", /SECRET_SETTINGS_BYTES/);
		assert.equal(readFileSync(settingsPath, "utf8"), '{"SECRET_SETTINGS_BYTES":"unterminated');
	});
});
