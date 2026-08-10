import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
	DEFAULT_FILE_CONTEXT_SETTINGS,
	loadFileContextSettings,
} from "../src/file-context-settings.js";

async function withTempSettings(run: (settingsPath: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "pi-file-context-settings-test-"));
	try {
		await run(join(root, "pi-file-context.json"));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test("missing settings use F8 without creating a file", async () => {
	await withTempSettings(async (settingsPath) => {
		const result = await loadFileContextSettings(settingsPath);
		assert.deepEqual(result, { settings: { openShortcut: "f8" } });
		await assert.rejects(readFile(settingsPath, "utf8"), { code: "ENOENT" });
	});
});

test("settings normalize a custom shortcut and allow disabling it", async () => {
	await withTempSettings(async (settingsPath) => {
		await writeFile(settingsPath, JSON.stringify({ openShortcut: "Ctrl+Alt+R", future: true }));
		assert.deepEqual(await loadFileContextSettings(settingsPath), {
			settings: { openShortcut: "ctrl+alt+r" },
		});

		await writeFile(settingsPath, JSON.stringify({ openShortcut: null }));
		assert.deepEqual(await loadFileContextSettings(settingsPath), {
			settings: { openShortcut: null },
		});
	});
});

test("malformed or invalid settings keep the default and return an observable warning", async () => {
	await withTempSettings(async (settingsPath) => {
		await writeFile(settingsPath, "{broken");
		const malformed = await loadFileContextSettings(settingsPath);
		assert.deepEqual(malformed.settings, DEFAULT_FILE_CONTEXT_SETTINGS);
		assert.match(malformed.warning ?? "", /cannot parse/i);
		assert.equal(await readFile(settingsPath, "utf8"), "{broken");

		for (const openShortcut of ["ctrl+not-a-key", "ctrl+f1"]) {
			await writeFile(settingsPath, JSON.stringify({ openShortcut }));
			const invalid = await loadFileContextSettings(settingsPath);
			assert.deepEqual(invalid.settings, DEFAULT_FILE_CONTEXT_SETTINGS);
			assert.match(invalid.warning ?? "", /openShortcut/);
		}
	});
});
