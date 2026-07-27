import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createMockContext } from "../../../test/support.js";
import { localConfigPath } from "../src/config.js";
import { showSyncManager } from "../src/manager-ui.js";
import { withTempHome } from "./helpers.js";

function settings() {
	return {
		version: 3,
		activeSyncSetup: "home",
		onSwitch: "ask-before-pull",
		storageConnections: {
			r2: {
				type: "s3",
				endpoint: "https://example.r2.cloudflarestorage.com",
				region: "auto",
				credentials: { accessKeyId: "access", secretAccessKey: "secret" },
			},
			git: { type: "git", remote: "git@github.com:user/pi-sync.git" },
		},
		syncSetups: {
			home: {
				storage: { connection: "r2", bucket: "home-bucket", path: "pi-sync/home" },
				sync: { include: ["settings.json", "AGENTS.md"], automatic: true },
			},
			work: {
				storage: { connection: "git", branch: "pi-sync/work", path: "pi-sync/work" },
				sync: { include: ["settings.json"], automatic: false },
			},
		},
	};
}

async function withSettings(run: () => Promise<void>) {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(settings()), { mode: 0o600 });
		await run();
	});
}

test("main menu uses only storage connection and sync setup resource wording", async () => {
	await withSettings(async () => {
		const titles: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				titles.push(title);
				return undefined;
			},
		});
		await showSyncManager(ctx, async () => undefined);
		const rendered = titles.join("\n");
		assert.match(rendered, /Manage sync/u);
		assert.match(rendered, /Current sync setup: home/u);
		assert.match(rendered, /Storage: Cloudflare R2 · r2 · home-bucket/u);
		assert.match(rendered, /Automatic sync: On/u);
		assert.doesNotMatch(
			rendered,
			/storage profile|sync target|saved connection|remote destination/iu,
		);
	});
});

test("Sync setups list and detail expose current marker, Make current, edit, remove, and Back", async () => {
	await withSettings(async () => {
		const titles: string[] = [];
		const optionsSeen: string[][] = [];
		const choices = ["More…", "Sync setups…", "work", "Back", "Back", "Back", undefined];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string, options: string[]) => {
				titles.push(title);
				optionsSeen.push(options);
				return choices.shift();
			},
		});
		await showSyncManager(ctx, async () => undefined);
		const list = optionsSeen.find((items) => items.includes("home (current)"));
		assert.ok(list?.includes("Add sync setup"));
		assert.ok(list?.includes("Back"));
		const detail = optionsSeen.find((items) => items.includes("Make current…"));
		assert.deepEqual(detail, ["Make current…", "Edit sync setup…", "Remove sync setup…", "Back"]);
		assert.match(titles.join("\n"), /Storage connection: git/u);
	});
});

test("Storage connections list and detail are symmetric and redact credentials", async () => {
	await withSettings(async () => {
		const titles: string[] = [];
		const optionsSeen: string[][] = [];
		const choices = ["More…", "Storage connections…", "r2", "Back", "Back", "Back", undefined];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string, options: string[]) => {
				titles.push(title);
				optionsSeen.push(options);
				return choices.shift();
			},
		});
		await showSyncManager(ctx, async () => undefined);
		const list = optionsSeen.find((items) => items.includes("Add storage connection"));
		assert.ok(list?.includes("r2"));
		assert.ok(list?.includes("Back"));
		const detail = titles.find((title) => title.includes("Storage connection “r2”")) ?? "";
		assert.match(detail, /Credentials: Settings file/u);
		assert.match(detail, /Used by: home/u);
		assert.doesNotMatch(detail, /access|secret/u);
	});
});

test("invalid settings open a read-only repair state without mutating bytes", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const bytes = Buffer.from('{"version":2,"password":"hidden"}\n');
		writeFileSync(localConfigPath(), bytes, { mode: 0o600 });
		const titles: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				titles.push(title);
				return undefined;
			},
		});
		await showSyncManager(ctx, async () => undefined);
		assert.match(titles.join("\n"), /Settings file needs repair/u);
		assert.doesNotMatch(titles.join("\n"), /hidden/u);
	});
});
