import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import {
	consumeSubagentSettingsNotice,
	inspectBlockingParallelLimitSettings,
	inspectConsultResourceSettings,
	inspectCwdPolicySettings,
	inspectSubagentSettings,
	normalizeSubagentSettings,
	readSubagentSettings,
	updateBlockingMaxParallelTasksSetting,
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

test("blocking parallel limit normalizes, inspects, and updates safely", () => {
	withAgentDir((directory) => {
		assert.deepEqual(normalizeSubagentSettings({ blocking: { maxParallelTasks: 3 } }), {
			blocking: { maxParallelTasks: 3 },
		});
		assert.equal(normalizeSubagentSettings({ blocking: { maxParallelTasks: 0 } }), undefined);
		assert.equal(normalizeSubagentSettings({ blocking: { maxParallelTasks: 1.5 } }), undefined);
		assert.equal(normalizeSubagentSettings({ blocking: { maxParallelTasks: 65 } }), undefined);

		const defaultSnapshot = inspectBlockingParallelLimitSettings();
		assert.equal(defaultSnapshot.value, 8);
		assert.equal(defaultSnapshot.source, "default");
		assert.equal(defaultSnapshot.path, path.join(directory, "pi-subagents.json"));
		assert.throws(() => readFileSync(defaultSnapshot.path, "utf8"), /ENOENT/);

		writeFileSync(
			defaultSnapshot.path,
			JSON.stringify({ future: true, blocking: { futureBlocking: "keep" } }),
		);
		updateBlockingMaxParallelTasksSetting(5);
		assert.deepEqual(JSON.parse(readFileSync(defaultSnapshot.path, "utf8")), {
			future: true,
			blocking: { futureBlocking: "keep", maxParallelTasks: 5 },
		});
		const configured = inspectBlockingParallelLimitSettings();
		assert.equal(configured.value, 5);
		assert.equal(configured.source, "user settings");

		assert.throws(() => updateBlockingMaxParallelTasksSetting(65), /between 1 and 64/i);
		writeFileSync(defaultSnapshot.path, "{ malformed");
		assert.throws(() => updateBlockingMaxParallelTasksSetting(4), /malformed/i);
		assert.equal(readFileSync(defaultSnapshot.path, "utf8"), "{ malformed");
	});
});

test("blocking parallel updates seed the canonical file from legacy settings", () => {
	withAgentDir((directory) => {
		const legacyPath = path.join(directory, "pi-subagents-config.json");
		const canonicalPath = path.join(directory, "pi-subagents.json");
		const legacy = {
			future: true,
			blocking: { enabled: false, futureBlocking: "keep" },
		};
		writeFileSync(legacyPath, JSON.stringify(legacy));

		updateBlockingMaxParallelTasksSetting(6);

		assert.deepEqual(JSON.parse(readFileSync(canonicalPath, "utf8")), {
			...legacy,
			blocking: { ...legacy.blocking, maxParallelTasks: 6 },
		});
		assert.deepEqual(JSON.parse(readFileSync(legacyPath, "utf8")), legacy);
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
