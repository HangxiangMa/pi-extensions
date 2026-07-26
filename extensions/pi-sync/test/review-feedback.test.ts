import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import {
	configuredTargetNames,
	ensureStateDir,
	loadConfig,
	localConfigPath,
	lockPath,
	readLocalConfigObject,
	readStateForConfig,
	stateDir,
	statePathForConfig,
	writeStateForConfig,
} from "../src/config.js";
import {
	addSyncTarget,
	migrateLegacySettings,
	removeSyncTarget,
} from "../src/settings-management.js";
import sync from "../src/sync.js";
import { requiredConfig, withEnv, withTempHome } from "./helpers.js";

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

test("startup does not recover a transaction owned by an active sync", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v2Settings();
		settings.targets.home.autoSync = false;
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const { target, transaction } = writeInterruptedTransaction(agentDir, "active");
		writeFileSync(
			lockPath(),
			JSON.stringify({
				id: "active-pull",
				pid: process.pid,
				command: "pull",
				startedAt: new Date().toISOString(),
			}),
		);
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext({ hasUI: true });

		await mock.events.get("session_start")?.[0]?.({}, ctx);

		assert.equal(readFileSync(target, "utf8"), '{"partial":true}\n');
		assert.equal(existsSync(transaction), true);
		assert.match(notifications.at(-1)?.message ?? "", /already running.*pull/i);
	});
});

test("startup recovers a crashed transaction after reclaiming its stale lock", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v2Settings();
		settings.targets.home.autoSync = false;
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const { target, transaction } = writeInterruptedTransaction(agentDir, "crashed");
		writeFileSync(
			lockPath(),
			JSON.stringify({
				id: "crashed-pull",
				pid: 2_147_483_647,
				command: "pull",
				startedAt: new Date(0).toISOString(),
			}),
		);
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext({ hasUI: true });

		await mock.events.get("session_start")?.[0]?.({}, ctx);

		assert.equal(readFileSync(target, "utf8"), '{"old":true}\n');
		assert.equal(existsSync(transaction), false);
		assert.equal(existsSync(lockPath()), false);
		assert.deepEqual(notifications, []);
	});
});

test("existing v2 target state migrates once to its destination-scoped path", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v2Settings();
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const config = await loadConfig();
		const legacyStatePath = path.join(
			stateDir(),
			"targets",
			`home-${createHash("sha256").update("home").digest("hex").slice(0, 10)}.state.json`,
		);
		mkdirSync(path.dirname(legacyStatePath), { recursive: true });
		writeFileSync(
			legacyStatePath,
			JSON.stringify({
				version: 1,
				profile: config.profile,
				lastAppliedSnapshot: "existing-snapshot",
				lastFileHashes: {},
			}),
		);

		assert.equal((await readStateForConfig(config)).lastAppliedSnapshot, "existing-snapshot");
		assert.equal(existsSync(statePathForConfig(config)), true);
		assert.equal(existsSync(legacyStatePath), false);
	});
});

test("legacy migration adopts state under effective environment overrides", async () => {
	await withEnv(
		{
			PI_SYNC_ENDPOINT: "https://override.r2.cloudflarestorage.com",
			PI_SYNC_BUCKET: "override-bucket",
			PI_SYNC_PREFIX: "override-prefix",
			PI_SYNC_PROFILE: "override-space",
		},
		() =>
			withTempHome(async (agentDir) => {
				mkdirSync(agentDir, { recursive: true });
				writeFileSync(localConfigPath(), JSON.stringify(requiredConfig()));
				const legacy = await loadConfig();
				await writeStateForConfig(legacy, {
					version: 1,
					profile: legacy.profile,
					lastAppliedSnapshot: "legacy-snapshot",
					lastFileHashes: {},
				});

				await migrateLegacySettings("home", "r2");
				const migrated = await loadConfig();

				assert.equal(
					migrated.backend.profile.endpoint,
					"https://override.r2.cloudflarestorage.com",
				);
				assert.equal(migrated.backend.destination.bucket, "override-bucket");
				assert.equal(migrated.backend.destination.prefix, "override-prefix");
				assert.equal(migrated.profile, "override-space");
				assert.equal((await readStateForConfig(migrated)).lastAppliedSnapshot, "legacy-snapshot");
			}),
	);
});

test("changing a target remote destination starts with fresh sync state", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v2Settings();
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const original = await loadConfig();
		await writeStateForConfig(original, {
			version: 1,
			profile: original.profile,
			lastAppliedSnapshot: "original-snapshot",
			lastFileHashes: {},
		});

		settings.targets.home.bucket = "replacement-bucket";
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const changedBucket = await loadConfig();

		assert.notEqual(statePathForConfig(changedBucket), statePathForConfig(original));
		assert.equal((await readStateForConfig(changedBucket)).lastAppliedSnapshot, undefined);
		await writeStateForConfig(changedBucket, {
			version: 1,
			profile: changedBucket.profile,
			lastAppliedSnapshot: "replacement-snapshot",
			lastFileHashes: {},
		});

		settings.profiles.r2.endpoint = "https://replacement.r2.cloudflarestorage.com";
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const changedEndpoint = await loadConfig();

		assert.notEqual(statePathForConfig(changedEndpoint), statePathForConfig(changedBucket));
		assert.equal((await readStateForConfig(changedEndpoint)).lastAppliedSnapshot, undefined);
	});
});

test("removing a non-current target preserves the active target", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v2Settings();
		settings.targets.work = { ...settings.targets.home, namespace: "work" };
		settings.targets.lab = { ...settings.targets.home, namespace: "lab" };
		settings.activeTarget = "lab";
		writeFileSync(localConfigPath(), JSON.stringify(settings));

		await removeSyncTarget("home");

		assert.equal((await readLocalConfigObject())?.activeTarget, "lab");
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
						sha256: "0".repeat(64),
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

function writeInterruptedTransaction(agentDir: string, name: string) {
	const target = path.join(agentDir, "settings.json");
	writeFileSync(target, '{"partial":true}\n');
	const transaction = path.join(stateDir(), "transactions", name);
	mkdirSync(path.join(transaction, "before"), { recursive: true });
	writeFileSync(path.join(transaction, "before", "0"), '{"old":true}\n');
	writeFileSync(
		path.join(transaction, "journal.json"),
		JSON.stringify({
			version: 1,
			root: agentDir,
			entries: [{ target, backupName: "0", kind: "file" }],
		}),
	);
	return { target, transaction };
}

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
