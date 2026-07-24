import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { initTheme } from "@earendil-works/pi-coding-agent";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import {
	SYNC_COMMANDS,
	setSyncTargetCompletions,
	syncCommandFromMenuOption,
	syncMenuOptions,
	usage,
} from "../src/command.js";
import { localConfigPath, readLocalConfigObject, updateLocalConfig } from "../src/config.js";
import sync, {
	collectFiles,
	completeSyncArguments,
	encodeKey,
	isDeniedPath,
	loadConfig,
	mergeRemotePreservedFiles,
	parseOptions,
	posixJoin,
	safeJoin,
	safeName,
	splitArgs,
} from "../src/sync.js";
import { DEFAULT_SYNC_FILES, normalizeSyncFiles } from "../src/sync-policy.js";

import { requiredConfig, snapshot, withEnv, withTempHome } from "./helpers.js";

initTheme("dark", false);

test("sync registers the sync command and session lifecycle hooks", () => {
	const mock = createMockPi();
	sync(mock.pi);

	assert.ok(mock.commands.has("sync"));
	assert.equal(mock.commands.has("pisync"), false);
	assert.equal(typeof mock.commands.get("sync")?.getArgumentCompletions, "function");
	assert.deepEqual([...mock.events.keys()].sort(), ["session_shutdown", "session_start"]);
});

test("sync command help and errors use the public command name", async () => {
	await withTempHome(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext();
		const command = mock.commands.get("sync");

		await command?.handler("help", ctx);
		await command?.handler("unknown", ctx);

		assert.match(notifications[0]?.message ?? "", /Usage: \/sync <command>/);
		assert.match(notifications[1]?.message ?? "", /Unknown \/sync command: unknown/);
		assert.doesNotMatch(notifications.map(({ message }) => message).join("\n"), /\/pisync/);
	});
});

const expectedSyncMenuOptions = [
	"help — Show command usage",
	"use — Switch the current sync target",
	"init — Create local config template",
	"config — Show resolved configuration",
	"files — Choose synced files",
	"status — Show sync status",
	"diff — Show local/remote diff",
	"doctor — Check config, secrets, and lock state",
	"push — Upload local settings",
	"pull — Apply remote settings",
	"sync — Push or pull as needed",
	"history — Show recent remote snapshots",
	"rollback — Apply a previous snapshot",
	"unlock — Remove a stale local lock",
];

test("bare sync command opens a goal-oriented empty-state menu and cancellation is a no-op", async () => {
	await withTempHome(async (agentDir) => {
		const mock = createMockPi();
		sync(mock.pi);
		let selectedTitle: string | undefined;
		let selectedOptions: string[] | undefined;
		const { ctx, notifications, statuses } = createMockContext({
			hasUI: true,
			select: async (title: string, options: string[]) => {
				selectedTitle = title;
				selectedOptions = options;
				return undefined;
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.match(selectedTitle ?? "", /Not set up/);
		assert.deepEqual(selectedOptions, ["Set up sync", "Help"]);
		assert.deepEqual(notifications, []);
		assert.equal(statuses.size, 0);
		assert.equal(existsSync(path.join(agentDir, ".pisync")), false);
	});
});

test("sync menu options map one-to-one to the canonical command catalog", () => {
	const commandNames = SYNC_COMMANDS.map(({ name }) => name);
	const options = syncMenuOptions();

	assert.deepEqual(options, expectedSyncMenuOptions);
	assert.deepEqual(options.map(syncCommandFromMenuOption), commandNames);
	assert.equal(new Set(commandNames).size, commandNames.length);
	for (const commandName of commandNames) {
		assert.match(usage(), new RegExp(`\\b${commandName}\\b`));
	}
});

test("sync menu dispatches help through the public command path", async () => {
	await withTempHome(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			select: async () => "Help",
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.match(notifications[0]?.message ?? "", /Usage: \/sync <command>/);
	});
});

test("bare sync command reports usage without an interactive UI", async () => {
	await withTempHome(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		let selected = false;
		const { ctx, notifications } = createMockContext({
			hasUI: false,
			select: async () => {
				selected = true;
				return undefined;
			},
		});

		await mock.commands.get("sync")?.handler("", ctx);

		assert.equal(selected, false);
		assert.match(notifications[0]?.message ?? "", /Usage: \/sync <command>/);
	});
});

test("sync files persists SettingsList choices and safe extra-file candidates", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(path.join(agentDir, "custom-dir"), { recursive: true });
		writeFileSync(path.join(agentDir, "LOCAL.md"), "local\n");
		writeFileSync(path.join(agentDir, "secret-notes.md"), "secret\n");
		writeFileSync(
			localConfigPath(),
			JSON.stringify({ ...requiredConfig(), future: true, extraFiles: ["REMOTE.md"] }),
		);
		const mock = createMockPi();
		sync(mock.pi);
		let initialRender = "";
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => "Save changes",
			custom: async (factory: unknown) => {
				const selector = createCustomSelectorHarness(factory);
				initialRender = selector.render().join("\n");
				selector.handleInput("\r");
				selector.handleInput("\u001b");
				return selector.result;
			},
		});

		await mock.commands.get("sync")?.handler("files", ctx);

		assert.match(initialRender, /settings\.json/);
		assert.match(initialRender, /sessions/);
		assert.match(initialRender, /LOCAL\.md/);
		assert.match(initialRender, /REMOTE\.md/);
		assert.doesNotMatch(initialRender, /secret-notes|custom-dir/);
		const saved = await readLocalConfigObject();
		assert.equal(saved?.future, true);
		assert.deepEqual(
			saved?.syncFiles,
			DEFAULT_SYNC_FILES.filter((item) => item !== "settings.json"),
		);
		if (process.platform !== "win32") {
			assert.equal((await fs.stat(localConfigPath())).mode & 0o777, 0o600);
		}
	});
});

test("the first file-selection change creates the complete config template", async () => {
	await withTempHome(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => "Save changes",
			custom: async (factory: unknown) => {
				const selector = createCustomSelectorHarness(factory);
				selector.handleInput("\r");
				selector.handleInput("\u001b");
				return selector.result;
			},
		});

		await mock.commands.get("sync")?.handler("files", ctx);
		const saved = await readLocalConfigObject();
		const profile = (saved?.profiles as Record<string, Record<string, unknown>> | undefined)
			?.default;
		const target = (saved?.targets as Record<string, Record<string, unknown>> | undefined)?.default;
		assert.equal(profile?.endpoint, "https://<account-id>.r2.cloudflarestorage.com");
		assert.equal(target?.autoSync, true);
		assert.deepEqual(
			target?.syncFiles,
			DEFAULT_SYNC_FILES.filter((item) => item !== "settings.json"),
		);
		assert.deepEqual(target?.extraFiles, []);
	});
});

test("sync files leaves settings unchanged when draft toggles cancel each other", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(requiredConfig()));
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				const selector = createCustomSelectorHarness(factory);
				selector.handleInput("\r");
				selector.handleInput("\r");
				selector.handleInput("\u001b");
				return selector.result;
			},
		});

		await mock.commands.get("sync")?.handler("files", ctx);
		assert.equal((await readLocalConfigObject())?.syncFiles, undefined);
	});
});

test("sync files keeps environment-overridden sessions read-only", async () => {
	await withTempHome(async () => {
		mkdirSync(path.dirname(localConfigPath()), { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify({ ...requiredConfig(), syncSessions: false }));
		await withEnv({ PI_SYNC_SESSIONS: "true" }, async () => {
			const mock = createMockPi();
			sync(mock.pi);
			let sessionRender = "";
			const { ctx } = createMockContext({
				hasUI: true,
				mode: "tui",
				custom: async (factory: unknown) => {
					const selector = createCustomSelectorHarness(factory);
					for (const character of "sessions") selector.handleInput(character);
					sessionRender = selector.render().join("\n");
					selector.handleInput("\r");
					selector.handleInput("\u001b");
					return selector.result;
				},
			});

			await mock.commands.get("sync")?.handler("files", ctx);
			assert.match(sessionRender, /included \(environment, deprecated\)/);
			assert.equal((await readLocalConfigObject())?.syncSessions, false);
		});
	});
});

test("sync files has a protocol-safe non-TUI summary", async () => {
	await withTempHome(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		let customCalls = 0;
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "rpc",
			custom: async () => {
				customCalls += 1;
			},
		});

		await mock.commands.get("sync")?.handler("files", ctx);
		assert.equal(customCalls, 0);
		assert.match(
			notifications.at(-1)?.message ?? "",
			/selected files.*syncFiles.*pi-sync\.local\.json/is,
		);
	});
});

test("local config updates preserve unknown fields and reject malformed or symlinked files", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify({ future: { enabled: true } }));
		await updateLocalConfig((current) => ({ ...current, syncFiles: [] }));
		assert.deepEqual((await readLocalConfigObject())?.future, { enabled: true });

		writeFileSync(localConfigPath(), "{broken");
		await assert.rejects(
			updateLocalConfig((current) => current),
			SyntaxError,
		);
		assert.equal(readFileSync(localConfigPath(), "utf8"), "{broken");

		rmSync(localConfigPath());
		const target = path.join(agentDir, "target.json");
		writeFileSync(target, "keep\n");
		await fs.symlink(target, localConfigPath());
		await assert.rejects(
			updateLocalConfig((current) => current),
			/symlinked pi-sync config/,
		);
		assert.equal(readFileSync(target, "utf8"), "keep\n");
	});
});

test("sync files keeps prior settings when atomic publication fails", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(requiredConfig()));
		const originalRename = fs.rename;
		fs.rename = (async () => {
			throw new Error("rename failed");
		}) as typeof fs.rename;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const context = createMockContext({
				hasUI: true,
				mode: "tui",
				select: async () => "Save changes",
				custom: async (factory: unknown) => {
					const selector = createCustomSelectorHarness(factory);
					selector.handleInput("\r");
					selector.handleInput("\u001b");
					return selector.result;
				},
			});

			await mock.commands.get("sync")?.handler("files", context.ctx);
			assert.match(context.notifications.at(-1)?.message ?? "", /rename failed/);
			assert.equal((await readLocalConfigObject())?.syncFiles, undefined);
		} finally {
			fs.rename = originalRename;
		}
	});
});

test("sync files discard leaves the config byte-for-byte unchanged", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const original = `${JSON.stringify({ ...requiredConfig(), future: true }, null, "\t")}\n`;
		writeFileSync(localConfigPath(), original);
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async () => "Discard changes",
			custom: async (factory: unknown) => {
				const selector = createCustomSelectorHarness(factory);
				selector.handleInput("\r");
				selector.handleInput("\u001b");
				return selector.result;
			},
		});

		await mock.commands.get("sync")?.handler("files", ctx);
		assert.equal(readFileSync(localConfigPath(), "utf8"), original);
	});
});

test("sync rollback direct route requires a snapshot id", async () => {
	await withTempHome(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext();

		await mock.commands.get("sync")?.handler("rollback", ctx);

		assert.match(notifications[0]?.message ?? "", /Usage: \/sync rollback/);
	});
});

test("sync rollback direct route passes a provided snapshot id to rollback", async () => {
	await withTempHome(async () => {
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext();

		await mock.commands.get("sync")?.handler("rollback snapshot-id", ctx);

		assert.match(notifications[0]?.message ?? "", /Missing pi-sync config/);
		assert.doesNotMatch(notifications[0]?.message ?? "", /Usage: \/sync rollback/);
	});
});

test("completeSyncArguments suggests commands, targets, and useful flags", () => {
	setSyncTargetCompletions(["work", "home"]);
	assert.deepEqual(
		completeSyncArguments("")?.map((item) => item.label),
		[
			"help",
			"use",
			"init",
			"config",
			"files",
			"status",
			"diff",
			"doctor",
			"push",
			"pull",
			"sync",
			"history",
			"rollback",
			"unlock",
		],
	);
	assert.deepEqual(
		completeSyncArguments("pu")?.map((item) => item.value),
		["push", "pull"],
	);
	assert.deepEqual(
		completeSyncArguments("push ")?.map((item) => item.value),
		["push --yes", "push -y", "push --force", "push --target"],
	);
	assert.deepEqual(
		completeSyncArguments("pull --f")?.map((item) => item.value),
		["pull --force"],
	);
	assert.deepEqual(
		completeSyncArguments("sync -")?.map((item) => item.value),
		["sync --yes", "sync -y", "sync --force", "sync --target"],
	);
	assert.deepEqual(
		completeSyncArguments("push --yes --f")?.map((item) => item.value),
		["push --yes --force"],
	);
	assert.deepEqual(
		completeSyncArguments("rollback 2026-06-22 --y")?.map((item) => item.value),
		["rollback 2026-06-22 --yes"],
	);
	assert.deepEqual(
		completeSyncArguments("unlock --s")?.map((item) => item.value),
		["unlock --stale"],
	);
	assert.deepEqual(
		completeSyncArguments("use w")?.map((item) => item.value),
		["use work"],
	);
	assert.deepEqual(
		completeSyncArguments("status --target h")?.map((item) => item.value),
		["status --target home"],
	);
	assert.deepEqual(
		completeSyncArguments("status ")?.map((item) => item.value),
		["status --target"],
	);
	assert.equal(completeSyncArguments("push snapshot"), null);
	assert.equal(completeSyncArguments("wat"), null);
});

test("syncFiles keeps the legacy allowlist by default and validates explicit selections safely", async () => {
	assert.deepEqual(normalizeSyncFiles(undefined), [...DEFAULT_SYNC_FILES]);
	assert.deepEqual(normalizeSyncFiles([]), []);
	assert.deepEqual(normalizeSyncFiles(["SETTINGS.JSON", "settings.json", "skills"]), [
		"settings.json",
		"skills",
	]);
	assert.throws(() => normalizeSyncFiles("settings.json"), /syncFiles must be an array/);
	assert.throws(
		() => normalizeSyncFiles(["settings.json", "unknown.json"]),
		/Unknown syncFiles item/,
	);
	assert.throws(() => normalizeSyncFiles(["settings.json", 1]), /syncFiles items must be strings/);

	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(path.join(agentDir, "pi-sync.local.json"), JSON.stringify(requiredConfig()));
		assert.deepEqual((await loadConfig()).syncFiles, [...DEFAULT_SYNC_FILES]);

		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({ ...requiredConfig(), syncFiles: [] }),
		);
		assert.deepEqual((await loadConfig()).syncFiles, []);
	});
});

test("snapshot collection includes only selected built-in files and directory groups", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-sync-selected-"));
	mkdirSync(path.join(root, "skills"));
	mkdirSync(path.join(root, "prompts"));
	writeFileSync(path.join(root, "settings.json"), "{}\n");
	writeFileSync(path.join(root, "keybindings.json"), "{}\n");
	writeFileSync(path.join(root, "skills", "demo.md"), "skill\n");
	writeFileSync(path.join(root, "prompts", "demo.md"), "prompt\n");

	assert.deepEqual(
		(await collectFiles(root, { syncFiles: ["settings.json", "skills"] })).map((file) => file.path),
		["settings.json", "skills/demo.md"],
	);
	assert.deepEqual(
		(await collectFiles(root, { syncFiles: [] })).map((file) => file.path),
		[],
	);
});

test("upload merge preserves remote built-ins and directories that this machine does not manage", () => {
	const local = snapshot([{ path: "settings.json", content: Buffer.from("local") }]);
	const remote = snapshot([
		{ path: "settings.json", content: Buffer.from("remote") },
		{ path: "keybindings.json", content: Buffer.from("remote keys") },
		{ path: "skills/demo.md", content: Buffer.from("remote skill") },
		{ path: "prompts/demo.md", content: Buffer.from("old prompt") },
	]);
	const merged = mergeRemotePreservedFiles(local, remote, {
		syncFiles: ["settings.json", "prompts"],
		syncSessions: false,
		extraFiles: [],
	});

	assert.deepEqual(
		merged.files.map((file) => file.path),
		["keybindings.json", "settings.json", "skills/demo.md"],
	);
});

test("forced pushes preserve remote files outside this machine's selection", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(path.join(agentDir, "settings.json"), '{"local":true}\n');
		writeFileSync(
			localConfigPath(),
			JSON.stringify({ ...requiredConfig(), syncFiles: ["settings.json"] }),
		);

		const remote = {
			...snapshot([
				{ path: "settings.json", content: Buffer.from("remote settings\n") },
				{ path: "keybindings.json", content: Buffer.from("remote keys\n") },
			]),
			id: "remote-snapshot",
		};
		const remoteBody = gzipSync(Buffer.from(JSON.stringify(remote), "utf8"));
		let latest = {
			version: 1,
			profile: "default",
			snapshot: remote.id,
			sha256: createHash("sha256").update(remoteBody).digest("hex"),
			createdAt: remote.createdAt,
			machine: remote.machine,
			syncSessions: false,
		};
		let uploadedBody: Buffer | undefined;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (input, init) => {
			const url = new URL(String(input));
			const method = init?.method ?? "GET";
			if (method === "GET" && url.pathname.endsWith("/latest.json")) {
				return Response.json(latest);
			}
			if (method === "GET" && url.pathname.endsWith(`/snapshots/${remote.id}.json.gz`)) {
				return new Response(new Uint8Array(remoteBody));
			}
			if (method === "PUT" && url.pathname.includes("/snapshots/")) {
				uploadedBody = Buffer.from(init?.body as Uint8Array);
				return new Response(null, { status: 200 });
			}
			if (method === "PUT" && url.pathname.endsWith("/latest.json")) {
				latest = JSON.parse(Buffer.from(init?.body as Uint8Array).toString("utf8"));
				return new Response(null, { status: 200 });
			}
			if (method === "GET" && url.pathname.endsWith("/history.json")) {
				return new Response(null, { status: 404 });
			}
			if (method === "PUT" && url.pathname.endsWith("/history.json")) {
				return new Response(null, { status: 200 });
			}
			throw new Error(`Unexpected S3 request: ${method} ${url.pathname}`);
		}) as typeof globalThis.fetch;

		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx, notifications } = createMockContext();
			const statusUpdates: Array<[string, string | undefined]> = [];
			const mutableContext = ctx as unknown as {
				ui: { setStatus(key: string, value: string | undefined): void };
			};
			const setStatus = mutableContext.ui.setStatus.bind(mutableContext.ui);
			mutableContext.ui.setStatus = (key, value) => {
				statusUpdates.push([key, value]);
				setStatus(key, value);
			};
			await mock.commands.get("sync")?.handler("push --yes --force", ctx);

			assert.deepEqual(statusUpdates, [
				["sync", "pushing default"],
				["sync", undefined],
			]);
			assert.ok(uploadedBody, JSON.stringify(notifications));
			const uploaded = JSON.parse(gunzipSync(uploadedBody).toString("utf8"));
			assert.deepEqual(
				uploaded.files.map((file: { path: string }) => file.path),
				["keybindings.json", "settings.json"],
			);
			assert.equal(notifications.at(-1)?.level, "info");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("syncSessions config defaults off and supports file plus env overrides", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({ ...requiredConfig(), syncSessions: true }),
		);

		await withEnv({}, async () => {
			assert.equal((await loadConfig()).syncSessions, true);
		});
		await withEnv({ PI_SYNC_SESSIONS: "false" }, async () => {
			assert.equal((await loadConfig()).syncSessions, false);
		});
		await withEnv({ PI_SYNC_SESSIONS: "" }, async () => {
			assert.equal((await loadConfig()).syncSessions, false);
		});
		await withEnv({ PI_SYNC_SESSIONS: "tru" }, async () => {
			assert.equal((await loadConfig()).syncSessions, false);
		});
		await withEnv({ PI_SYNC_SESSIONS: "yes" }, async () => {
			assert.equal((await loadConfig()).syncSessions, true);
		});

		rmSync(path.join(agentDir, "pi-sync.local.json"));
		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({ ...requiredConfig(), extraFiles: "APPEND_SYSTEM.md" }),
		);
		await withEnv({}, async () => {
			assert.deepEqual((await loadConfig()).extraFiles, []);
		});
		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({
				...requiredConfig(),
				extraFiles: [
					"LOCAL.md",
					"LOCAL.md",
					"local.md",
					"skills/demo.md",
					"nested\\x",
					"skills",
					"SESSIONS",
					"settings.json",
					"Settings.json",
					"AGENTS.md",
					"append_system.md",
					".",
					"..",
					".git",
					"node_modules",
					".pisync",
					".env",
					"pi-sync.local.json",
					"secret.txt",
					"token.json",
					1,
					"",
				],
			}),
		);
		await withEnv({}, async () => {
			assert.deepEqual((await loadConfig()).extraFiles, ["LOCAL.md"]);
		});

		const customAgentDir = path.join(agentDir, "custom-agent");
		mkdirSync(customAgentDir, { recursive: true });
		writeFileSync(
			path.join(customAgentDir, "pi-sync.local.json"),
			JSON.stringify({ ...requiredConfig(), profile: "custom" }),
		);
		await withEnv({ PI_CODING_AGENT_DIR: customAgentDir }, async () => {
			assert.equal((await loadConfig()).profile, "custom");
		});

		const tildeAgentDir = path.join(path.dirname(agentDir), "agent-tilde");
		mkdirSync(tildeAgentDir, { recursive: true });
		writeFileSync(
			path.join(tildeAgentDir, "pi-sync.local.json"),
			JSON.stringify({ ...requiredConfig(), profile: "tilde" }),
		);
		await withEnv({ PI_CODING_AGENT_DIR: "~/.pi/agent-tilde" }, async () => {
			assert.equal((await loadConfig()).profile, "tilde");
		});

		rmSync(path.join(agentDir, "pi-sync.local.json"));
		writeFileSync(path.join(agentDir, "pi-sync.local.json"), JSON.stringify(requiredConfig()));
		await withEnv({}, async () => {
			assert.equal((await loadConfig()).syncSessions, false);
		});
	});
});

test("sync config output reports session sync and privacy warning", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			path.join(agentDir, "pi-sync.local.json"),
			JSON.stringify({ ...requiredConfig(), syncSessions: true }),
		);
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext();

		await withEnv({}, async () => {
			await mock.commands.get("sync")?.handler("config", ctx);
		});

		assert.match(notifications[0]?.message ?? "", /syncSessions: enabled/);
		assert.match(notifications[0]?.message ?? "", /session JSONL can contain/);
	});
});

test("argument and option helpers parse quoted command lines", () => {
	assert.deepEqual(splitArgs("push --yes 'snapshot one' \"two words\""), [
		"push",
		"--yes",
		"snapshot one",
		"two words",
	]);
	assert.deepEqual(parseOptions(["--yes", "--force", "snapshot-id"]), {
		yes: true,
		force: true,
		stale: false,
		silent: false,
		reload: true,
		auto: false,
		args: ["snapshot-id"],
	});
});

test("path and key helpers normalize safe names and reject escapes", () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-sync-test-"));
	assert.equal(safeJoin(root, "skills/demo.md"), path.join(root, "skills", "demo.md"));
	assert.equal(
		safeJoin(root, path.join(root, "skills/demo.md")),
		path.join(root, "skills/demo.md"),
	);
	assert.throws(() => safeJoin(root, "../escape"), /Unsafe path/);
	assert.equal(isDeniedPath("skills/.env.local"), true);
	assert.equal(isDeniedPath(".git"), true);
	assert.equal(isDeniedPath("node_modules"), true);
	assert.equal(isDeniedPath(".pisync"), true);
	assert.equal(isDeniedPath("skills/demo.md"), false);
	assert.equal(encodeKey("a b/c+d"), "a%20b/c%2Bd");
	assert.equal(posixJoin("/prefix/", "profile", "/latest.json"), "prefix/profile/latest.json");
	assert.equal(safeName("team/prod"), "team_prod");
});
