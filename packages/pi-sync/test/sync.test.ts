import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import {
	completeSyncArguments,
	parseOptions,
	SYNC_COMMANDS,
	setSyncSetupCompletions,
	usage,
	validateCommandOptions,
} from "../src/command.js";
import { localConfigPath, readLocalConfigObject, updateLocalConfig } from "../src/config.js";
import { showFileSelection } from "../src/file-selection.js";
import sync from "../src/sync.js";
import { syncBoth } from "../src/sync-operations.js";
import { BUILT_IN_SYNC_ROOTS } from "../src/sync-policy.js";
import { v3S3Settings, withTempHome } from "./helpers.js";

initTheme("dark", false);

function selectedMultiSelectLabel(lines: readonly string[]) {
	const line = lines.find((candidate) => candidate.startsWith("→ ") || candidate.startsWith("› "));
	return line
		?.slice(2)
		.replace(/^\[(?:x| |-)\]\s+/u, "")
		.split(/\s{2,}/u)[0]
		?.trim();
}

test("sync command catalog and usage document setup-addressing routes", () => {
	assert.ok(SYNC_COMMANDS.some((command) => command.name === "use"));
	assert.match(usage(), /use <setup>/u);
	assert.match(usage(), /Version 1 and version 2 settings are unsupported/u);
	assert.doesNotMatch(usage(), /`profiles`|`targets`|--target/u);
	const readme = readFileSync(`${process.cwd()}/packages/pi-sync/README.md`, "utf8");
	for (const command of SYNC_COMMANDS) {
		assert.match(readme, new RegExp(`\\/sync ${command.name}\\b`, "u"));
	}
	for (const block of readme.matchAll(/```json\n(?<json>[\s\S]*?)\n```/gu)) {
		assert.doesNotThrow(() => JSON.parse(block.groups?.json ?? ""));
	}
});

test("--setup is canonical and --target is rejected by the breaking version 3 route", () => {
	assert.deepEqual(parseOptions(["--setup", "work", "--yes"]), {
		yes: true,
		force: false,
		stale: false,
		silent: false,
		reload: true,
		auto: false,
		setup: "work",
		args: [],
	});
	assert.throws(() => parseOptions(["--target", "work"]), /Unknown sync option: --target/u);
	assert.throws(() => parseOptions(["--setup"]), /requires a sync setup name/u);
	assert.throws(
		() => validateCommandOptions("help", parseOptions(["--setup", "work"])),
		/not supported/u,
	);
});

test("argument completion retains prior tokens and completes known setup names", () => {
	setSyncSetupCompletions(["home", "work"]);
	assert.ok(completeSyncArguments("")?.some((item) => item.value === "status"));
	assert.ok(completeSyncArguments("status --s")?.some((item) => item.value === "status --setup"));
	assert.ok(
		completeSyncArguments("status --setup w")?.some((item) => item.value === "status --setup work"),
	);
	assert.ok(completeSyncArguments("use h")?.some((item) => item.value === "use home"));
	assert.equal(completeSyncArguments("use home "), null);
});

test("extension registers command and separate startup/shutdown cancellation boundaries", () => {
	const mock = createMockPi();
	sync(mock.pi);
	assert.equal(mock.commands.get("sync")?.description?.includes("storage"), true);
	assert.equal(mock.events.get("session_start")?.length, 1);
	assert.equal(mock.events.get("session_shutdown")?.length, 1);
});

test("print and JSON modes reject before relying on no-op UI output", async () => {
	const mock = createMockPi();
	sync(mock.pi);
	const { ctx } = createMockContext({ hasUI: false, mode: "print" });
	const command = mock.commands.get("sync");
	assert.ok(command);
	await assert.rejects(async () => {
		await command.handler("help", ctx);
	}, /requires TUI or RPC mode/u);
});

test("RPC init creates a valid empty version 3 document", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext({ hasUI: true, mode: "rpc" });
		await mock.commands.get("sync")?.handler("init", ctx);
		assert.deepEqual(await readLocalConfigObject(), {
			version: 3,
			onSwitch: "ask-before-pull",
			storageConnections: {},
			syncSetups: {},
		});
		assert.match(notifications.at(-1)?.message ?? "", /Created/u);
	});
});

test("included-content route has a protocol-safe RPC summary", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		const { ctx, notifications } = createMockContext({ hasUI: true, mode: "rpc" });
		await showFileSelection(ctx, "home");
		assert.match(notifications.at(-1)?.message ?? "", /sync setup home/u);
		assert.match(notifications.at(-1)?.message ?? "", /include: settings.json/u);
		assert.match(notifications.at(-1)?.message ?? "", /sync\.include/u);
	});
});

test("included-content TUI renders textual state at narrow and wide widths", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		const rendered = new Map<number, string[]>();
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				for (const width of [32, 60, 100]) {
					const harness = createCustomSelectorHarness(factory, width);
					rendered.set(width, harness.render());
				}
				const harness = createCustomSelectorHarness(factory, 60);
				harness.handleInput("tui.select.cancel");
				return harness.result;
			},
		});
		await showFileSelection(ctx, "home");
		for (const [width, lines] of rendered) {
			assert.ok(lines.length > 0);
			assert.ok(lines.every((line) => visibleWidth(line) <= width));
			assert.match(lines.join("\n"), /Included Content|included|excluded/u);
		}
	});
});

test("included-content TUI lists built-in and custom paths exactly once", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		for (const root of BUILT_IN_SYNC_ROOTS) {
			const target = path.join(agentDir, root);
			if (root.includes(".")) writeFileSync(target, "{}\n");
			else mkdirSync(target);
		}
		writeFileSync(path.join(agentDir, "custom.json"), "{}\n");
		const before = Buffer.from(`${JSON.stringify(v3S3Settings())}\n`);
		writeFileSync(localConfigPath(), before, { mode: 0o600 });
		let customCalls = 0;
		const labels: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				customCalls += 1;
				const harness = createCustomSelectorHarness(factory, 100);
				for (let index = 0; index < 32; index += 1) {
					const label = selectedMultiSelectLabel(harness.render());
					if (!label || labels.includes(label)) break;
					labels.push(label);
					harness.handleInput("tui.select.down");
				}
				harness.handleInput("tui.select.cancel");
				return harness.result;
			},
		});
		await showFileSelection(ctx, "home");
		assert.equal(customCalls, 1);
		assert.deepEqual(labels, [...BUILT_IN_SYNC_ROOTS, "custom.json", "sessions"]);
		assert.deepEqual(readFileSync(localConfigPath()), before);
	});
});

test("included-content TUI saves a discovered custom path once", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(path.join(agentDir, "settings.json"), "{}\n");
		writeFileSync(path.join(agentDir, "custom.json"), "{}\n");
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		let screen = 0;
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				screen += 1;
				const harness = createCustomSelectorHarness(factory, 100);
				if (screen === 1) {
					for (let index = 0; index < BUILT_IN_SYNC_ROOTS.length; index += 1) {
						harness.handleInput("tui.select.down");
					}
					harness.handleInput("tui.select.confirm");
					await harness.waitForPending();
					await Promise.resolve();
				} else if (screen === 2) {
					harness.handleInput("tui.select.cancel");
				} else {
					harness.handleInput("tui.select.confirm");
				}
				return harness.result;
			},
		});
		await showFileSelection(ctx, "home");
		assert.equal(screen, 3);
		assert.deepEqual((await readLocalConfigObject())?.syncSetups.home.sync.include, [
			"settings.json",
			"custom.json",
		]);
		assert.match(notifications.at(-1)?.message ?? "", /Saved included content/u);
	});
});

test("included-content save preserves a concurrent include change", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		let editorVisits = 0;
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				if (title.includes("Included Content")) {
					editorVisits += 1;
					return editorVisits === 1 ? "settings.json" : undefined;
				}
				await updateLocalConfig((current) => ({
					...current,
					syncSetups: {
						...current.syncSetups,
						home: {
							...current.syncSetups.home,
							sync: { ...current.syncSetups.home.sync, include: ["models.json"] },
						},
					},
				}));
				return "Save changes";
			},
		});
		await showFileSelection(ctx, "home");
		assert.deepEqual((await readLocalConfigObject())?.syncSetups.home.sync.include, [
			"models.json",
		]);
		assert.match(notifications.at(-1)?.message ?? "", /included content changed.*reopen/iu);
	});
});

test("included-content editor disposes on session cancellation without saving", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const before = Buffer.from(`${JSON.stringify(v3S3Settings())}\n`);
		writeFileSync(localConfigPath(), before, { mode: 0o600 });
		const controller = new AbortController();
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 60);
				controller.abort(new DOMException("Session replaced", "AbortError"));
				harness.dispose();
				return harness.result;
			},
		});
		await showFileSelection(ctx, "home", controller.signal);
		assert.deepEqual(readFileSync(localConfigPath()), before);
		assert.deepEqual(notifications, []);
	});
});

test("an empty include reports no selected content before remote transport", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const settings = v3S3Settings({ include: [] });
		writeFileSync(localConfigPath(), JSON.stringify(settings), { mode: 0o600 });
		let fetches = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = async () => {
			fetches += 1;
			throw new Error("unexpected transport");
		};
		try {
			const { ctx, notifications } = createMockContext({ hasUI: true, mode: "rpc" });
			await syncBoth(ctx, {
				yes: true,
				force: false,
				stale: false,
				silent: false,
				reload: false,
				auto: false,
				args: [],
			});
			assert.equal(fetches, 0);
			assert.match(notifications.at(-1)?.message ?? "", /includes no files/u);
			assert.doesNotMatch(notifications.at(-1)?.message ?? "", /up to date/iu);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("unknown and trailing direct arguments fail observably without changing settings", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const before = Buffer.from(`${JSON.stringify(v3S3Settings())}\n`);
		writeFileSync(localConfigPath(), before, { mode: 0o600 });
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext({ hasUI: true, mode: "rpc" });
		await mock.commands.get("sync")?.handler("status trailing", ctx);
		assert.match(notifications.at(-1)?.message ?? "", /Unexpected argument/u);
		assert.deepEqual(readFileSync(localConfigPath()), before);
	});
});

test("unsupported settings pause startup automatic sync and remain unchanged", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const bytes = Buffer.from('{"version":2,"secret":"hidden"}\n');
		writeFileSync(localConfigPath(), bytes, { mode: 0o600 });
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx, notifications } = createMockContext({ hasUI: true, mode: "tui" });
		await mock.events.get("session_start")?.[0]?.({}, ctx);
		const output = notifications.map((item) => item.message).join("\n");
		assert.match(output, /auto sync skipped|version 3 is required/u);
		assert.doesNotMatch(output, /hidden/u);
		assert.deepEqual(readFileSync(localConfigPath()), bytes);
	});
});
