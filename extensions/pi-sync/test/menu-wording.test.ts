import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createMockContext } from "../../../test/support.js";
import { localConfigPath, readLocalConfigObject } from "../src/config.js";
import { showSyncManager } from "../src/manager-ui.js";
import { updateStorageProfile } from "../src/settings-management.js";
import { withTempHome } from "./helpers.js";

function settings() {
	return {
		version: 2,
		activeTarget: "home",
		profiles: {
			r2: {
				kind: "r2",
				endpoint: "https://account.r2.cloudflarestorage.com",
				region: "auto",
				accessKeyId: "access",
				secretAccessKey: "secret",
			},
		},
		targets: {
			home: {
				profile: "r2",
				bucket: "home-bucket",
				prefix: "pi-sync",
				namespace: "home",
				autoSync: true,
				syncFiles: ["settings.json"],
				syncSessions: false,
				extraFiles: [],
			},
			work: {
				profile: "r2",
				bucket: "work-bucket",
				prefix: "pi-sync",
				namespace: "work",
				autoSync: false,
				syncFiles: ["AGENTS.md"],
				syncSessions: true,
				extraFiles: [],
			},
		},
	};
}

test("main shows Switch sync setup only when multiple setups are useful", async () => {
	await withSettings(settings(), async () => {
		let options: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (_title: string, nextOptions: string[]) => {
				options = nextOptions;
				return undefined;
			},
		});
		await showSyncManager(ctx, async () => undefined);
		assert.deepEqual(options, [
			"Sync now (recommended)",
			"Switch sync setup",
			"Status & changes",
			"Settings",
			"More…",
		]);
	});
});

test("switch preview rejects a concurrent post-switch behavior change", async () => {
	const value = { ...settings(), targetSwitchAction: "ask" as const };
	await withSettings(value, async () => {
		const choices = ["Switch sync setup", "work · r2 · work-bucket", "Switch to work"];
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				const choice = choices.shift();
				if (choice === "Switch to work") {
					writeFileSync(
						localConfigPath(),
						`${JSON.stringify({ ...value, targetSwitchAction: "pull" }, null, "\t")}\n`,
					);
				}
				assert.ok(title.length > 0);
				return choice;
			},
		});
		await showSyncManager(ctx, async () => undefined);
		assert.match(
			notifications.at(-1)?.message ?? "",
			/setup-switch behavior changed.*reopen it and retry/i,
		);
		assert.equal((await readLocalConfigObject())?.activeTarget, "home");
	});
});

test("editing a non-current setup never mutates the current setup", async () => {
	await withSettings(settings(), async () => {
		const choices = [
			"More…",
			"Sync setups…",
			"work",
			"Edit sync setup…",
			"Save sync setup",
			"Back",
			"Back",
			undefined,
		];
		const inputs = ["updated-work", "work-prefix", "work-space"];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => choices.shift(),
			input: async () => inputs.shift(),
		});
		await showSyncManager(ctx, async () => undefined);
		const saved = (await readLocalConfigObject()) as ReturnType<typeof settings>;
		assert.equal(saved.targets.home.bucket, "home-bucket");
		assert.equal(saved.targets.work.bucket, "updated-work");
		assert.equal(saved.targets.work.prefix, "work-prefix");
		assert.equal(saved.targets.work.namespace, "work-space");
	});
});

test("invalid non-current setups stay visible with repair-oriented detail", async () => {
	const value = settings();
	value.targets.work.profile = "missing";
	await withSettings(value, async () => {
		const choices = ["More…", "Sync setups…", "work", "Back", "Back", undefined];
		const calls: Array<{ title: string; options: string[] }> = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string, options: string[]) => {
				calls.push({ title, options });
				return choices.shift();
			},
		});
		await showSyncManager(ctx, async () => undefined);
		assert.doesNotMatch(calls[0]?.options.join("\n") ?? "", /Switch sync setup/);
		assert.deepEqual(calls[2]?.options, ["Add sync setup", "home (current)", "work", "Back"]);
		assert.match(calls[3]?.title ?? "", /Status: Invalid/);
		assert.match(calls[3]?.title ?? "", /missing storage connection "missing"/);
		assert.doesNotMatch(calls[3]?.options.join("\n") ?? "", /Make current/);
		assert.deepEqual(calls[3]?.options, ["Edit sync setup…", "Remove sync setup…", "Back"]);
	});
});

test("current setup detail explains why removal is unavailable", async () => {
	await withSettings(settings(), async () => {
		const choices = ["More…", "Sync setups…", "home (current)", "Back", "Back", undefined];
		const calls: Array<{ title: string; options: string[] }> = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string, options: string[]) => {
				calls.push({ title, options });
				return choices.shift();
			},
		});
		await showSyncManager(ctx, async () => undefined);
		assert.match(calls[3]?.title ?? "", /Endpoint: https:\/\/account\.r2\.cloudflarestorage\.com/);
		assert.match(calls[3]?.title ?? "", /Storage location: home-bucket\/pi-sync\/profiles\/home/);
		assert.match(calls[3]?.title ?? "", /Remove unavailable: switch to another setup first/);
		assert.deepEqual(calls[3]?.options, ["Edit sync setup…", "Back"]);
	});
});

test("setup and connection lists escape terminal controls in stored names", async () => {
	const value = settings();
	const profiles = value.profiles as Record<string, typeof value.profiles.r2>;
	const targets = value.targets as Record<string, typeof value.targets.work>;
	profiles["unsafe\u001b[31m"] = { ...value.profiles.r2 };
	targets["unsafe\u0007setup"] = {
		...value.targets.work,
		profile: "unsafe\u001b[31m",
		bucket: "other-bucket",
	};
	await withSettings(value, async () => {
		const choices = [
			"More…",
			"Sync setups…",
			"Back",
			"More…",
			"Storage connections…",
			"Back",
			undefined,
		];
		const rendered: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string, options: string[]) => {
				rendered.push(title, ...options);
				return choices.shift();
			},
		});
		await showSyncManager(ctx, async () => undefined);
		const output = rendered.join("\n");
		assert.equal(output.includes("\u001b"), false);
		assert.equal(output.includes("\u0007"), false);
		assert.match(output, /unsafe\?\[31m/);
		assert.match(output, /unsafe\?setup/);
	});
});

test("shared storage connection edits reject stale dependent previews", async () => {
	await withSettings(settings(), async () => {
		const before = JSON.stringify(await readLocalConfigObject());
		await assert.rejects(
			updateStorageProfile("r2", (profile) => ({ ...profile, region: "other" }), ["home"]),
			/usage changed.*review the affected sync setups/i,
		);
		assert.equal(JSON.stringify(await readLocalConfigObject()), before);
	});
});

test("shared storage connection edits preview every affected setup", async () => {
	await withSettings(settings(), async () => {
		const choices = [
			"More…",
			"Storage connections…",
			"r2",
			"Edit storage connection…",
			"Keep current credentials",
			"Save storage connection",
			"Back",
			"Back",
			undefined,
		];
		const inputs = ["https://new.example.com", "us-east-1"];
		const titles: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				titles.push(title);
				return choices.shift();
			},
			input: async () => inputs.shift(),
		});
		await showSyncManager(ctx, async () => undefined);
		const review = titles.find((title) => title.includes("Review storage connection")) ?? "";
		assert.match(review, /Affected sync setups: home, work/);
		assert.match(review, /account\.r2\.cloudflarestorage\.com.*new\.example\.com/s);
		const saved = (await readLocalConfigObject()) as ReturnType<typeof settings>;
		assert.equal(saved.profiles.r2.endpoint, "https://new.example.com");
	});
});

async function withSettings(value: unknown, run: () => Promise<void>) {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), `${JSON.stringify(value, null, "\t")}\n`);
		await run();
	});
}
