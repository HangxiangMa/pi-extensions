import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createMockContext } from "../../../test/support.js";
import { loadConfig, localConfigPath, readLocalConfigObject } from "../src/config.js";
import {
	addSyncSetup,
	updateStorageConnection,
	updateSyncSetup,
} from "../src/settings-management.js";
import { errorMessage, redact } from "../src/sync-format.js";
import { v3S3Settings, withTempHome } from "./helpers.js";

test("shared connection edits reject a stale dependent-setup preview", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		await addSyncSetup("work", {
			storage: { connection: "r2", bucket: "pi-sync-test", path: "pi-sync/work" },
			sync: { include: ["settings.json"], automatic: false },
		});
		await assert.rejects(
			updateStorageConnection("r2", (value) => value, ["home"]),
			/usage changed/u,
		);
	});
});

test("setup edits are validated as one complete document before publication", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		const before = readFileSync(localConfigPath());
		await assert.rejects(
			updateSyncSetup("home", (setup) => ({
				...setup,
				storage: { connection: "r2", bucket: "pi-sync-test", path: "../escape" },
			})),
			/safe relative path/u,
		);
		assert.deepEqual(readFileSync(localConfigPath()), before);
	});
});

test("credential-bearing validation errors and formatting redact exact secrets", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v3S3Settings();
		settings.storageConnections.r2.endpoint = "https://user:private-secret@example.com";
		writeFileSync(localConfigPath(), JSON.stringify(settings), { mode: 0o600 });
		await assert.rejects(loadConfig(), (error: unknown) => {
			assert.doesNotMatch(errorMessage(error), /private-secret/u);
			return true;
		});
		assert.equal(redact("private-secret"), "priv…cret");
	});
});

test("non-TUI invalid setup feedback is observable and secret-free", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v3S3Settings();
		settings.syncSetups.home.storage.path = "../bad";
		writeFileSync(localConfigPath(), JSON.stringify(settings), { mode: 0o600 });
		const { notifications } = createMockContext({ hasUI: true });
		let validationError: unknown;
		try {
			await loadConfig();
		} catch (error) {
			validationError = error;
		}
		notifications.push({ message: errorMessage(validationError), level: "error" });
		assert.match(notifications.at(-1)?.message ?? "", /safe relative path/u);
		assert.doesNotMatch(notifications.at(-1)?.message ?? "", /secret-key/u);
		assert.equal(await readLocalConfigObject().catch(() => undefined), undefined);
	});
});
