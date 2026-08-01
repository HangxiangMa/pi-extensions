import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	consumeSubagentSettingsNotice,
	inspectConsultResourceSettings,
	inspectSubagentSettings,
	normalizeSubagentSettings,
	readSubagentSettings,
	updateConsultResourceSetting,
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

		writeFileSync(settingsPath, "{ broken");
		assert.throws(() => updateConsultResourceSetting("all"), /malformed/i);
		assert.equal(readFileSync(settingsPath, "utf8"), "{ broken");
	});
});
