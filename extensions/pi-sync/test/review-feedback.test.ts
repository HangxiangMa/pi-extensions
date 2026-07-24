import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import {
	configuredTargetNames,
	ensureStateDir,
	loadConfig,
	localConfigPath,
	lockPath,
} from "../src/config.js";
import { addSyncTarget } from "../src/settings-management.js";
import sync from "../src/sync.js";
import { requiredConfig, withTempHome } from "./helpers.js";

test("legacy settings reject explicit target selection before destructive network work", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(requiredConfig()));
		let requests = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			requests += 1;
			throw new Error("network must not be reached");
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx, notifications } = createMockContext({ hasUI: true });

			await mock.commands.get("sync")?.handler("push --target work --yes", ctx);

			assert.equal(requests, 0);
			assert.deepEqual(await configuredTargetNames(), []);
			assert.match(notifications.at(-1)?.message ?? "", /--target.*version 2/i);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("duplicate destination validation uses normalized S3 key segments", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v2Settings();
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const duplicate = {
			...settings.targets.home,
			bucket: " /personal-pi/ ",
			prefix: " /pi-sync/ ",
			namespace: " /home/ ",
		};

		await assert.rejects(
			addSyncTarget("work", duplicate),
			/duplicates the remote destination of “home”/,
		);

		settings.targets.work = duplicate;
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		await assert.rejects(loadConfig(), /targets "home" and "work" use the same remote destination/);
	});
});

test("recovery menu passes explicit stale confirmation for unreadable lock metadata", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v2Settings()));
		await ensureStateDir();
		writeFileSync(lockPath(), "");
		const mock = createMockPi();
		sync(mock.pi);
		const selections = ["History & recovery", "Recover stale operation", undefined];
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => selections.shift(),
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.equal(existsSync(lockPath()), false);
		assert.match(notifications.at(-1)?.message ?? "", /Removed unreadable pi-sync lock/);
	});
});

test("history selection acquires the rollback lock before reading or applying a snapshot", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v2Settings()));
		await ensureStateDir();
		writeFileSync(
			lockPath(),
			JSON.stringify({
				id: "active-push",
				pid: process.pid,
				command: "push",
				startedAt: new Date().toISOString(),
			}),
		);
		let requests = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (input) => {
			requests += 1;
			const url = new URL(String(input));
			if (!url.pathname.endsWith("/history.json")) {
				throw new Error(`Unexpected unlocked snapshot request: ${url.pathname}`);
			}
			return Response.json({
				version: 1,
				snapshots: [
					{
						version: 1,
						profile: "home",
						snapshot: "snapshot-1",
						sha256: "checksum",
						createdAt: "2026-07-24T00:00:00.000Z",
						machine: "remote",
					},
				],
			});
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			let confirmations = 0;
			const { ctx, notifications } = createMockContext({
				hasUI: true,
				mode: "tui",
				select: async (_title: string, options: string[]) => options[0],
				confirm: async () => {
					confirmations += 1;
					return false;
				},
			});

			await mock.commands.get("sync")?.handler("history", ctx);

			assert.equal(requests, 1);
			assert.equal(confirmations, 0);
			assert.match(notifications.at(-1)?.message ?? "", /already running.*push/i);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

function v2Settings() {
	return {
		version: 2,
		activeTarget: "home",
		profiles: {
			r2: {
				kind: "r2",
				endpoint: "https://account.r2.cloudflarestorage.com",
				region: "auto",
				accessKeyId: "access-key",
				secretAccessKey: "secret-key",
			},
		},
		targets: {
			home: {
				profile: "r2",
				bucket: "personal-pi",
				prefix: "pi-sync",
				namespace: "home",
				autoSync: true,
				syncFiles: ["settings.json"],
				syncSessions: false,
				extraFiles: [],
			},
		} as Record<string, Record<string, unknown>>,
	};
}
