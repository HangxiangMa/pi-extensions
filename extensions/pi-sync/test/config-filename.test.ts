import assert from "node:assert/strict";
import {
	closeSync,
	existsSync,
	ftruncateSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	symlinkSync,
	writeFileSync,
	writeSync,
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
import {
	withConfigFileLinkForTest,
	withConfigReplacementInstalledHookForTest,
} from "../src/config-file.js";
import { isDeniedPath } from "../src/paths.js";
import {
	migrateLegacySettings,
	withLegacySettingsReadHookForTest,
} from "../src/settings-management.js";
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

test("targetless v2 legacy settings migrate and retain the recoverable manager flow", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({ version: 2, profiles: { r2: {} }, targets: {} }),
		);

		const settings = await readLocalConfigObject();
		assert.deepEqual(settings?.targets, {});
		assert.equal(settings?.activeTarget, undefined);
		assert.equal(existsSync(path.join(agentDir, "pi-sync.json")), true);

		const mock = createMockPi();
		sync(mock.pi);
		let options: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (_title: string, nextOptions: string[]) => {
				options = nextOptions;
				return undefined;
			},
		});
		await mock.commands.get("sync")?.handler("", ctx);

		assert.deepEqual(options, ["Manage targets & storage", "Help"]);
	});
});

test("legacy validation errors identify the file that needs repair", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const legacyPath = path.join(agentDir, "pi-sync.local.json");
		writeFileSync(legacyPath, JSON.stringify({ version: 2, profiles: [], targets: {} }));
		const mock = createMockPi();
		sync(mock.pi);
		let title = "";
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (nextTitle: string) => {
				title = nextTitle;
				return undefined;
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.match(title, /Settings file needs repair/);
		assert.match(title, new RegExp(`File: ${legacyPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`));
		assert.doesNotMatch(title, /File: .*pi-sync\.json/);
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

test("flat settings can upgrade while filename migration falls back to the legacy path", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const legacyPath = path.join(agentDir, "pi-sync.local.json");
		const original = `${JSON.stringify(requiredConfig(), null, 2)}\n`;
		writeFileSync(legacyPath, original);

		await withConfigFileLinkForTest(
			async () => {
				throw Object.assign(new Error("hard links are unavailable"), { code: "ENOTSUP" });
			},
			async () => {
				const result = await migrateLegacySettings("home", "r2");
				assert.equal(readFileSync(result.backupPath, "utf8"), original);
				assert.equal(result.settings.version, 2);
				assert.equal(existsSync(localConfigPath()), true);
				assert.equal(existsSync(legacyPath), true);
				assert.equal((await readLocalConfigObject())?.activeTarget, "home");
			},
		);
	});
});

test("flat settings upgrade preserves a canonical file created before commit", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const legacyPath = path.join(agentDir, "pi-sync.local.json");
		const canonicalPath = localConfigPath();
		const concurrent = `${JSON.stringify({ concurrent: true }, null, 2)}\n`;
		writeFileSync(legacyPath, `${JSON.stringify(requiredConfig(), null, 2)}\n`);

		await withConfigFileLinkForTest(
			async () => {
				throw Object.assign(new Error("hard links are unavailable"), { code: "ENOTSUP" });
			},
			() =>
				withLegacySettingsReadHookForTest(
					async () => writeFileSync(canonicalPath, concurrent),
					async () => {
						await assert.rejects(
							migrateLegacySettings("home", "r2"),
							/canonical settings.*created concurrently/i,
						);
						assert.equal(readFileSync(canonicalPath, "utf8"), concurrent);
						assert.equal(existsSync(legacyPath), true);
					},
				),
		);
	});
});

test("flat settings upgrade rejects an edit that lands after its source snapshot", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const legacyPath = path.join(agentDir, "pi-sync.local.json");
		const original = `${JSON.stringify(requiredConfig(), null, 2)}\n`;
		const replacement = `${JSON.stringify({ ...requiredConfig(), bucket: "new-bucket" }, null, 2)}\n`;
		writeFileSync(legacyPath, original);

		await withConfigFileLinkForTest(
			async () => {
				throw Object.assign(new Error("hard links are unavailable"), { code: "ENOTSUP" });
			},
			() =>
				withLegacySettingsReadHookForTest(
					async () => writeFileSync(legacyPath, replacement),
					async () => {
						await assert.rejects(
							migrateLegacySettings("home", "r2"),
							/settings changed during migration/,
						);
						assert.equal(existsSync(localConfigPath()), false);
						assert.equal(readFileSync(legacyPath, "utf8"), replacement);
					},
				),
		);
	});
});

test("canonical schema migration restores source edits when hard links are unavailable", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const canonicalPath = localConfigPath();
		const original = `${JSON.stringify(requiredConfig(), null, 2)}\n`;
		const replacement = `${JSON.stringify({ ...requiredConfig(), bucket: "late-edit" }, null, 2)}\n`;
		writeFileSync(canonicalPath, original);
		const descriptor = openSync(canonicalPath, "r+");
		try {
			await withConfigFileLinkForTest(
				async () => {
					throw Object.assign(new Error("hard links are unavailable"), { code: "ENOTSUP" });
				},
				() =>
					withConfigReplacementInstalledHookForTest(
						async () => {
							ftruncateSync(descriptor, 0);
							writeSync(descriptor, replacement, 0, "utf8");
						},
						async () => {
							await assert.rejects(
								migrateLegacySettings("home", "r2"),
								/settings changed during migration/,
							);
						},
					),
			);
		} finally {
			closeSync(descriptor);
		}
		assert.equal(readFileSync(canonicalPath, "utf8"), replacement);
	});
});

test("canonical schema migration retains writes made through the original descriptor", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const canonicalPath = localConfigPath();
		writeFileSync(canonicalPath, `${JSON.stringify(requiredConfig(), null, 2)}\n`);
		const descriptor = openSync(canonicalPath, "r+");
		try {
			await withConfigFileLinkForTest(
				async () => {
					throw Object.assign(new Error("hard links are unavailable"), { code: "ENOTSUP" });
				},
				async () => {
					await migrateLegacySettings("home", "r2");
					ftruncateSync(descriptor, 0);
					writeSync(descriptor, "late descriptor edit\n", 0, "utf8");
				},
			);
		} finally {
			closeSync(descriptor);
		}

		const recoveryFiles = readdirSync(agentDir).filter(
			(name) => name.startsWith(".pi-sync.json.") && name.endsWith(".schema-migration-source"),
		);
		assert.equal(recoveryFiles.length, 1);
		assert.equal(
			readFileSync(path.join(agentDir, recoveryFiles[0] ?? ""), "utf8"),
			"late descriptor edit\n",
		);
		assert.equal((await readLocalConfigObject())?.activeTarget, "home");
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
