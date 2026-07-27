import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import { loadConfig, readLocalConfigObject } from "../src/config.js";
import {
	showAddGitStorageProfile,
	showAddGitTarget,
	showEditGitStorageProfile,
	showEditGitTarget,
	showGitSetup,
} from "../src/git-ui.js";
import { updateStorageProfile, updateSyncTarget } from "../src/settings-management.js";
import { showSyncSettings } from "../src/settings-ui.js";
import sync from "../src/sync.js";
import { withEnv, withTempHome } from "./helpers.js";

initTheme("dark", false);

test("Git setup stores a backend-specific destination without credentials", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const inputs = [
			"github",
			"git@github.com:owner/private-pi-sync.git",
			"pi-sync/home",
			"pi-sync",
			"home",
		];
		const reviews: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => inputs.shift(),
			select: async (title: string) => {
				reviews.push(title);
				return title === "Automatic sync for this target"
					? "Keep automatic sync off"
					: "Save setup";
			},
		});
		assert.equal(await showGitSetup(ctx, "home"), true);
		const config = await loadConfig();
		assert.equal(config.backend.type, "git");
		if (config.backend.type !== "git") return;
		assert.equal(config.backend.profile.remote, "git@github.com:owner/private-pi-sync.git");
		assert.deepEqual(config.backend.destination, {
			branch: "pi-sync/home",
			directory: "pi-sync",
			namespace: "home",
		});
		assert.equal(config.autoSync, false);
		assert.match(reviews.join("\n"), /Auto-sync: Off/);
		assert.doesNotMatch(reviews.join("\n"), /token|password/i);
		assert.match(reviews.join("\n"), /existing non-interactive Git\/SSH credentials/i);
	});
});

test("Git setup review preserves a credential-free custom SSH port", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const inputs = [
			"self-hosted",
			"ssh://git@example.com:2222/private/pi-sync.git",
			"pi-sync/home",
			"pi-sync",
			"home",
		];
		const reviews: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => inputs.shift(),
			select: async (title: string) => {
				reviews.push(title);
				return title === "Automatic sync for this target" ? "Keep automatic sync off" : "Cancel";
			},
		});
		assert.equal(await showGitSetup(ctx, "home"), false);
		assert.match(reviews.join("\n"), /ssh:\/\/example\.com:2222\/private\/pi-sync\.git/);
		assert.doesNotMatch(reviews.join("\n"), /git@example\.com/);
	});
});

test("Git settings ignore deprecated S3 automatic-sync environment overrides", async () => {
	await withEnv({ PI_SYNC_AUTO_SYNC: "false" }, () =>
		withTempHome(async (agentDir) => {
			mkdirSync(agentDir, { recursive: true });
			const setupInputs = [
				"git",
				"git@example.com:private/pi-sync.git",
				"pi-sync/home",
				"pi-sync",
				"home",
			];
			const setup = createMockContext({
				hasUI: true,
				mode: "tui",
				input: async () => setupInputs.shift(),
				select: async (title: string) =>
					title === "Automatic sync for this target" ? "Enable automatic sync" : "Save setup",
			});
			assert.equal(await showGitSetup(setup.ctx, "home"), true);
			let rendered = "";
			const settings = createMockContext({
				hasUI: true,
				mode: "tui",
				custom: async (factory: unknown) => {
					const selector = createCustomSelectorHarness(factory, 80);
					rendered = selector.render().join("\n");
					selector.handleInput("\r");
					await new Promise((resolve) => setImmediate(resolve));
					selector.handleInput("\u001b");
					return selector.result;
				},
			});
			await showSyncSettings(settings.ctx, async () => undefined);
			assert.match(rendered, /Automatic sync/);
			assert.doesNotMatch(rendered, /environment override/i);
			const config = await loadConfig();
			assert.equal(config.autoSync, false);
		}),
	);
});

test("Git setup stops after session cancellation without persisting a destination", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const controller = new AbortController();
		let resolveInput: ((value: string) => void) | undefined;
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () =>
				new Promise<string>((resolve) => {
					resolveInput = resolve;
				}),
		});
		const setup = showAddGitStorageProfile(ctx, controller.signal);
		while (!resolveInput) await new Promise((resolve) => setImmediate(resolve));
		controller.abort(new DOMException("Session replaced", "AbortError"));
		resolveInput("git");
		await assert.rejects(
			setup,
			(error: unknown) => error instanceof Error && error.name === "AbortError",
		);
		assert.equal(await readLocalConfigObject(), undefined);
	});
});

test("Git is available through the existing setup manager and config route", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const mock = createMockPi();
		sync(mock.pi);
		const selections = [
			"Set up sync",
			"Git",
			"Personal / Home",
			"Keep automatic sync off",
			"Save setup",
			undefined,
		];
		const inputs = [
			"github",
			"git@github.com:owner/private-pi-sync.git",
			"pi-sync/home",
			"pi-sync",
			"home",
		];
		const rendered: string[] = [];
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				rendered.push(title);
				return selections.shift();
			},
			input: async () => inputs.shift(),
		});
		await mock.commands.get("sync")?.handler("", ctx);
		assert.equal((await loadConfig()).backend.type, "git");
		await mock.commands.get("sync")?.handler("config", ctx);
		const output = notifications.map((item) => item.message).join("\n");
		assert.match(output, /kind: git/i);
		assert.match(output, /branch: pi-sync\/home/i);
		assert.doesNotMatch(output, /accessKeyId|secretAccessKey|password:/i);
		assert.match(rendered.join("\n"), /Consistency: Exact expected-branch lease/);
	});
});

test("Git saved connections and targets add and edit through one destination model", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const setupInputs = [
			"git",
			"ssh://git@example.com/pi-sync.git",
			"pi-sync/home",
			"pi-sync",
			"home",
		];
		const setup = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => setupInputs.shift(),
			select: async () => "Save setup",
		});
		await showGitSetup(setup.ctx, "home");

		const addProfileInputs = ["backup", "https://git.example.com/owner/pi-sync.git"];
		const addProfile = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => addProfileInputs.shift(),
			select: async () => "Add connection",
		});
		assert.equal(await showAddGitStorageProfile(addProfile.ctx), true);

		const addTargetInputs = ["pi-sync/work", "settings", "work"];
		const targetSelections = ["Minimal settings", "Keep automatic sync off", "Add target"];
		const addTarget = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => addTargetInputs.shift(),
			select: async () => targetSelections.shift(),
		});
		assert.equal(await showAddGitTarget(addTarget.ctx, "work", "backup"), true);
		await updateStorageProfile("backup", (profile) => ({
			...profile,
			futureProfileField: { retained: true },
		}));
		await updateSyncTarget("work", (target) => ({
			...target,
			futureTargetField: ["retained"],
		}));

		const invalidTargetInputs = ["pi-sync/work", "settings-v2", "work"];
		const invalidTarget = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => invalidTargetInputs.shift(),
			select: async () => "Save target",
		});
		assert.equal(
			await showEditGitTarget(invalidTarget.ctx, {
				settingsVersion: 2,
				storageKind: "git",
				target: "work",
				storageProfile: "backup",
				remote: "https://git.example.com/owner/pi-sync.git",
				branch: "pi-sync/work",
				directory: "settings",
				profile: "work",
			}),
			false,
		);
		assert.match(invalidTarget.notifications.at(-1)?.message ?? "", /choose a new owned branch/i);

		const editProfileInputs = ["git@git.example.com:owner/new.git"];
		const editProfile = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => editProfileInputs.shift(),
			select: async () => "Save profile",
		});
		await showEditGitStorageProfile(editProfile.ctx, "backup", {
			kind: "git",
			remote: "https://git.example.com/owner/pi-sync.git",
		});

		const editTargetInputs = ["pi-sync/work-v2", "settings-v2", "work"];
		const editTarget = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => editTargetInputs.shift(),
			select: async () => "Save target",
		});
		await showEditGitTarget(editTarget.ctx, {
			settingsVersion: 2,
			storageKind: "git",
			target: "work",
			storageProfile: "backup",
			remote: "git@git.example.com:owner/new.git",
			branch: "pi-sync/work",
			directory: "settings",
			profile: "work",
		});

		const saved = await readLocalConfigObject();
		const profiles = saved?.profiles as Record<string, Record<string, unknown>>;
		const targets = saved?.targets as Record<string, Record<string, unknown>>;
		assert.equal(profiles.backup.remote, "git@git.example.com:owner/new.git");
		assert.deepEqual(profiles.backup.futureProfileField, { retained: true });
		assert.deepEqual(targets.work.futureTargetField, ["retained"]);
		assert.equal(targets.work.autoSync, false);
		assert.deepEqual(
			{
				branch: targets.work.branch,
				directory: targets.work.directory,
				namespace: targets.work.namespace,
			},
			{ branch: "pi-sync/work-v2", directory: "settings-v2", namespace: "work" },
		);
	});
});
