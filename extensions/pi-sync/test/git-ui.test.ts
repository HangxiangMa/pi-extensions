import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createMockContext } from "../../../test/support.js";
import {
	loadConfig,
	loadPartialConfig,
	localConfigPath,
	readLocalConfigObject,
} from "../src/config.js";
import {
	showAddGitStorageProfile,
	showAddGitTarget,
	showEditGitTarget,
	showGitSetup,
} from "../src/git-ui.js";
import { v3S3Settings, withTempHome } from "./helpers.js";

test("first Git setup writes the exact version 3 connection and setup shapes", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const inputs = ["github", "git@github.com:user/pi-sync.git", "pi-sync/home", "pi-sync/home"];
		const choices = ["Enable automatic sync", "Save setup"];
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => inputs.shift(),
			select: async () => choices.shift(),
		});
		assert.equal(await showGitSetup(ctx, "home"), true);
		const raw = await readLocalConfigObject();
		assert.deepEqual(raw?.storageConnections.github, {
			type: "git",
			remote: "git@github.com:user/pi-sync.git",
		});
		assert.deepEqual(raw?.syncSetups.home.storage, {
			connection: "github",
			branch: "pi-sync/home",
			path: "pi-sync/home",
		});
		assert.equal(raw?.syncSetups.home.sync.automatic, true);
		assert.doesNotMatch(JSON.stringify(raw), /password|secretAccessKey/u);
		assert.match(notifications.at(-1)?.message ?? "", /Saved Git sync setup/u);
	});
});

test("Git connection reuse adds an independent setup with a reviewed path", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v3S3Settings();
		writeFileSync(localConfigPath(), JSON.stringify(settings), { mode: 0o600 });
		const connectionInputs = ["git", "https://github.com/user/pi-sync.git"];
		const connectionCtx = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => connectionInputs.shift(),
			select: async () => "Add storage connection",
		});
		assert.equal(await showAddGitStorageProfile(connectionCtx.ctx), true);

		const setupInputs = ["pi-sync/work", "pi-sync/work"];
		const choices = ["Minimal settings", "Keep automatic sync off", "Add sync setup"];
		const setupCtx = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => setupInputs.shift(),
			select: async () => choices.shift(),
		});
		assert.equal(await showAddGitTarget(setupCtx.ctx, "work", "git"), true);
		const config = await loadConfig("work");
		assert.equal(config.connectionName, "git");
		assert.equal(config.storagePath, "pi-sync/work");
		assert.equal(config.automatic, false);
	});
});

test("Git setup edit persists one reviewed branch and complete storage path", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v3S3Settings();
		(settings.storageConnections as Record<string, unknown>).git = {
			type: "git",
			remote: "git@github.com:user/pi-sync.git",
		};
		(settings.syncSetups as Record<string, unknown>).work = {
			storage: { connection: "git", branch: "pi-sync/work", path: "pi-sync/work" },
			sync: { include: ["settings.json"], automatic: false },
		};
		writeFileSync(localConfigPath(), JSON.stringify(settings), { mode: 0o600 });
		const inputs = ["pi-sync/archive", "archives/work"];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => inputs.shift(),
			select: async () => "Save sync setup",
		});
		await showEditGitTarget(ctx, await loadPartialConfig("work"));
		const config = await loadConfig("work");
		assert.equal(config.backend.type, "git");
		if (config.backend.type !== "git") return;
		assert.equal(config.backend.destination.branch, "pi-sync/archive");
		assert.equal(config.storagePath, "archives/work");
	});
});

test("Git setup cancellation and secret-bearing remotes leave settings unchanged", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const before = Buffer.from(`${JSON.stringify(v3S3Settings())}\n`);
		writeFileSync(localConfigPath(), before, { mode: 0o600 });
		const inputs = ["bad", "https://user:secret@example.com/repo.git"];
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => inputs.shift(),
		});
		assert.equal(await showAddGitStorageProfile(ctx), false);
		assert.deepEqual(readFileSync(localConfigPath()), before);
		assert.doesNotMatch(notifications.at(-1)?.message ?? "", /secret/u);
	});
});
