import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { createCustomSelectorHarness, createMockContext } from "../../../test/support.js";
import {
	loadConfig,
	localConfigPath,
	readLocalConfigObject,
	statePathForConfig,
	updateLocalConfig,
} from "../src/config.js";
import { showRemoteSelectionReview } from "../src/remote-selection-ui.js";
import { expectedRemoteHead } from "../src/sync-backend.js";
import { snapshot, v3S3Settings, withTempHome } from "./helpers.js";
import { MemorySyncBackend } from "./memory-sync-backend.js";

initTheme("dark", false);

test("remote selection review adopts policy only after session acknowledgement", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		const backend = new MemorySyncBackend();
		await publishSelection(backend, ["settings.json", "pi-starship.toml", "sessions"]);
		let confirmations = 0;
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			confirm: async () => {
				confirmations += 1;
				return true;
			},
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 100);
				assert.match(harness.render().join("\n"), /Adopt remote included content/u);
				harness.handleInput("tui.select.confirm");
				await harness.waitForPending();
				return harness.result;
			},
		});

		await showRemoteSelectionReview(ctx, "home", undefined, () => backend);

		assert.equal(confirmations, 1);
		assert.deepEqual((await readLocalConfigObject())?.syncSetups.home.sync.include, [
			"settings.json",
			"pi-starship.toml",
			"sessions",
		]);
		assert.equal(existsSync(path.join(agentDir, "pi-starship.toml")), false);
		assert.equal(existsSync(statePathForConfig(await loadConfig())), false);
		assert.match(notifications.at(-1)?.message ?? "", /No files were pulled/u);
	});
});

test("remote selection review keeps local policy without changing settings", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const before = Buffer.from(`${JSON.stringify(v3S3Settings())}\n`);
		writeFileSync(localConfigPath(), before, { mode: 0o600 });
		const backend = new MemorySyncBackend();
		await publishSelection(backend, ["settings.json", "pi-starship.toml"]);
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 100);
				harness.handleInput("tui.select.down");
				harness.handleInput("tui.select.confirm");
				await harness.waitForPending();
				return harness.result;
			},
		});

		await showRemoteSelectionReview(ctx, "home", undefined, () => backend);

		assert.deepEqual(readFileSync(localConfigPath()), before);
		assert.match(notifications.at(-1)?.message ?? "", /Kept local.*force push/i);
	});
});

test("legacy remote selection offers read-only partial discovery", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const before = Buffer.from(`${JSON.stringify(v3S3Settings())}\n`);
		writeFileSync(localConfigPath(), before, { mode: 0o600 });
		const backend = new MemorySyncBackend();
		await backend.publishSnapshot(
			{
				...snapshot([
					{ path: "settings.json", content: Buffer.from("settings") },
					{ path: "pi-starship.toml", content: Buffer.from("starship") },
				]),
				id: "legacy",
			},
			{ kind: "missing" },
		);
		const rendered: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 80);
				harness.handleInput("tui.select.confirm");
				await harness.waitForPending();
				rendered.push(harness.render().join("\n"));
				harness.dispose();
				return harness.result;
			},
		});

		await showRemoteSelectionReview(ctx, "home", undefined, () => backend);

		assert.match(rendered.join("\n"), /partial.*pi-starship\.toml/is);
		assert.deepEqual(readFileSync(localConfigPath()), before);
	});
});

test("remote selection adoption rejects a changed remote head and preserves settings", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const before = Buffer.from(`${JSON.stringify(v3S3Settings())}\n`);
		writeFileSync(localConfigPath(), before, { mode: 0o600 });
		const backend = new MemorySyncBackend();
		await publishSelection(backend, ["settings.json", "pi-starship.toml", "sessions"]);
		const controller = new AbortController();
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			confirm: async () => {
				await publishSelection(backend, ["settings.json", "models.json"]);
				return true;
			},
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 100);
				harness.handleInput("tui.select.confirm");
				await harness.waitForPending();
				return harness.result;
			},
		});

		await showRemoteSelectionReview(ctx, "home", controller.signal, () => backend);

		assert.deepEqual(readFileSync(localConfigPath()), before);
		assert.match(notifications.at(-1)?.message ?? "", /Remote changed while.*open/i);
	});
});

test("remote selection adoption rejects a concurrent local include change", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		const backend = new MutatingReadBackend(async () => {
			await updateLocalConfig((settings) => ({
				...settings,
				syncSetups: {
					...settings.syncSetups,
					home: {
						...settings.syncSetups.home,
						sync: { ...settings.syncSetups.home.sync, include: ["models.json"] },
					},
				},
			}));
		});
		await publishSelection(backend, ["settings.json", "pi-starship.toml"]);
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 100);
				harness.handleInput("tui.select.confirm");
				await harness.waitForPending();
				return harness.result;
			},
		});

		await showRemoteSelectionReview(ctx, "home", undefined, () => backend);

		assert.deepEqual((await readLocalConfigObject())?.syncSetups.home.sync.include, [
			"models.json",
		]);
		assert.match(notifications.at(-1)?.message ?? "", /included content changed.*reopen/i);
	});
});

test("remote selection review disposes on session replacement without side effects", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const before = Buffer.from(`${JSON.stringify(v3S3Settings())}\n`);
		writeFileSync(localConfigPath(), before, { mode: 0o600 });
		const backend = new MemorySyncBackend();
		await publishSelection(backend, ["settings.json", "pi-starship.toml"]);
		const controller = new AbortController();
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory, 80);
				controller.abort(new DOMException("Session replaced", "AbortError"));
				harness.dispose();
				return harness.result;
			},
		});

		await showRemoteSelectionReview(ctx, "home", controller.signal, () => backend);

		assert.deepEqual(readFileSync(localConfigPath()), before);
		assert.deepEqual(notifications, []);
	});
});

class MutatingReadBackend extends MemorySyncBackend {
	private snapshotReads = 0;

	constructor(private readonly mutate: () => Promise<void>) {
		super();
	}

	override async readSnapshot(reference: string, signal?: AbortSignal) {
		this.snapshotReads += 1;
		if (this.snapshotReads === 2) await this.mutate();
		return super.readSnapshot(reference, signal);
	}
}

async function publishSelection(backend: MemorySyncBackend, include: string[]) {
	return backend.publishSnapshot(
		{
			...snapshot([]),
			id: `selection-${include.length}`,
			selection: { version: 1, include },
		},
		expectedRemoteHead(await backend.readHead()),
	);
}
