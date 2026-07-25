import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import {
	consumeLocalConfigMigrationNotice,
	legacyLocalConfigPath,
	localConfigPath,
	quarantineAndRemoveConfigIfMatches,
	readLocalConfigObject,
} from "../src/config.js";
import { isDeniedPath } from "../src/paths.js";
import sync from "../src/sync.js";
import { requiredConfig, withTempHome } from "./helpers.js";

test("pi-sync uses the canonical settings filename and migrates legacy bytes privately", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const legacyPath = path.join(agentDir, "pi-sync.local.json");
		const original = `${JSON.stringify({ ...requiredConfig(), future: { retained: true } }, null, 2)}\n`;
		writeFileSync(legacyPath, original, { mode: 0o644 });

		assert.equal(localConfigPath(), path.join(agentDir, "pi-sync.json"));
		assert.equal(legacyLocalConfigPath(), legacyPath);
		assert.deepEqual(await readLocalConfigObject(), JSON.parse(original));
		assert.equal(existsSync(legacyPath), true);
		assert.equal(readFileSync(legacyPath, "utf8"), original);
		assert.equal(readFileSync(localConfigPath(), "utf8"), original);
		if (process.platform !== "win32") {
			assert.equal(statSync(localConfigPath()).mode & 0o777, 0o600);
			assert.equal(statSync(legacyPath).mode & 0o777, 0o600);
		}
		assert.match(
			consumeLocalConfigMigrationNotice() ?? "",
			/migrated.*pi-sync\.local\.json.*pi-sync\.json.*recovery copy/i,
		);
		assert.equal(consumeLocalConfigMigrationNotice(), undefined);
	});
});

test("canonical pi-sync settings take precedence without removing a legacy file", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(path.join(agentDir, "pi-sync.json"), JSON.stringify({ canonical: true }), {
			mode: 0o644,
		});
		writeFileSync(path.join(agentDir, "pi-sync.local.json"), JSON.stringify({ legacy: true }), {
			mode: 0o644,
		});

		assert.deepEqual(await readLocalConfigObject(), { canonical: true });
		assert.equal(existsSync(path.join(agentDir, "pi-sync.local.json")), true);
		if (process.platform !== "win32") {
			assert.equal(statSync(localConfigPath()).mode & 0o777, 0o600);
			assert.equal(statSync(path.join(agentDir, "pi-sync.local.json")).mode & 0o777, 0o600);
		}
		assert.match(consumeLocalConfigMigrationNotice() ?? "", /legacy.*ignored.*takes precedence/i);
	});
});

test("canonical settings remain usable when an ignored legacy path is unsafe", async (t) => {
	if (process.platform === "win32") {
		t.diagnostic("symlink precedence safety is covered on POSIX");
		return;
	}
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(path.join(agentDir, "pi-sync.json"), JSON.stringify({ canonical: true }));
		const target = path.join(agentDir, "outside.json");
		writeFileSync(target, JSON.stringify({ legacy: true }));
		symlinkSync(target, path.join(agentDir, "pi-sync.local.json"));

		assert.deepEqual(await readLocalConfigObject(), { canonical: true });
		assert.match(
			consumeLocalConfigMigrationNotice() ?? "",
			/could not verify.*private regular file/i,
		);
	});
});

test("malformed and symlinked legacy settings are not migrated", async (t) => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(path.join(agentDir, "pi-sync.local.json"), "{not-json\n");

		await assert.rejects(readLocalConfigObject(), /JSON/);
		assert.equal(existsSync(path.join(agentDir, "pi-sync.json")), false);
		assert.equal(existsSync(path.join(agentDir, "pi-sync.local.json")), true);
	});

	if (process.platform === "win32") {
		t.diagnostic("symlink migration safety is covered on POSIX");
		return;
	}
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({ version: 2, profiles: [], targets: {} }),
		);

		await assert.rejects(readLocalConfigObject(), /profiles must be an object/);
		assert.equal(existsSync(path.join(agentDir, "pi-sync.json")), false);
		assert.equal(existsSync(path.join(agentDir, "pi-sync.local.json")), true);
	});

	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const target = path.join(agentDir, "outside.json");
		writeFileSync(target, JSON.stringify(requiredConfig()));
		symlinkSync(target, path.join(agentDir, "pi-sync.local.json"));

		await assert.rejects(readLocalConfigObject(), /symlinked pi-sync config/);
		assert.equal(existsSync(path.join(agentDir, "pi-sync.json")), false);
	});
});

test("legacy v2 references keep their runtime whitespace normalization during migration", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({
				version: 2,
				activeTarget: " home ",
				profiles: {
					r2: {
						endpoint: "https://account.r2.cloudflarestorage.com",
						accessKeyId: "access",
						secretAccessKey: "secret",
					},
				},
				targets: {
					home: { profile: " r2 ", bucket: "pi-sync" },
				},
			}),
		);

		const settings = await readLocalConfigObject();
		assert.equal(settings?.activeTarget, " home ");
		assert.equal(existsSync(path.join(agentDir, "pi-sync.json")), true);
		assert.equal(existsSync(path.join(agentDir, "pi-sync.local.json")), true);
	});
});

test("migration cleanup preserves a config path replaced after validation", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const configPath = path.join(agentDir, "pi-sync.local.json");
		const replacementPath = path.join(agentDir, "replacement.json");
		const original = Buffer.from(JSON.stringify(requiredConfig()));
		const replacement = Buffer.from(JSON.stringify({ replacement: true }));
		writeFileSync(configPath, original);
		const originalStat = statSync(configPath);
		writeFileSync(replacementPath, replacement);
		renameSync(replacementPath, configPath);

		assert.equal(
			await quarantineAndRemoveConfigIfMatches(
				configPath,
				{ dev: originalStat.dev, ino: originalStat.ino },
				original,
			),
			false,
		);
		assert.deepEqual(readFileSync(configPath), replacement);
	});
});

test("session startup reports a filename migration once without exposing settings", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({ ...requiredConfig(), autoSync: false }),
		);
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext();
		const sessionStart = mock.events.get("session_start")?.[0];

		await sessionStart?.({}, ctx);
		await sessionStart?.({}, ctx);

		const migrationNotices = notifications.filter((notice) =>
			notice.message.includes("pi-sync.local.json"),
		);
		assert.equal(migrationNotices.length, 1);
		assert.equal(migrationNotices[0]?.level, "warning");
		assert.match(migrationNotices[0]?.message ?? "", /pi-sync\.json/);
		assert.doesNotMatch(migrationNotices[0]?.message ?? "", /access-key|secret-key/);
	});
});

test("pi-sync snapshots deny canonical, legacy, and migration-recovery settings files", () => {
	assert.equal(isDeniedPath("pi-sync.json"), true);
	assert.equal(isDeniedPath("pi-sync.json.example.migration-retired"), true);
	assert.equal(isDeniedPath(".pi-sync.json.example.migrate"), true);
	assert.equal(isDeniedPath(".pi-sync.json.example.tmp"), true);
	assert.equal(isDeniedPath("pi-sync.local.json"), true);
	assert.equal(isDeniedPath("pi-sync.local.json.example.migration-retired"), true);
	assert.equal(isDeniedPath(".pi-sync.local.json.example.migration-retired"), true);
});
