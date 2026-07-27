import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import { loadConfig, localConfigPath, readLocalConfigObject } from "../src/config.js";
import sync from "../src/sync.js";
import {
	repairableWebDavDestinationName,
	showAddWebDavStorageProfile,
	showAddWebDavTarget,
	showEditWebDavStorageProfile,
	showEditWebDavTarget,
	showRepairWebDavDestination,
} from "../src/webdav-ui.js";
import { withTempHome } from "./helpers.js";

test("first-time WebDAV setup collects a masked password and stores a usable profile", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const mock = createMockPi();
		sync(mock.pi);
		const selections = [
			"Set up sync",
			"WebDAV",
			"Personal / Home",
			"Recommended Pi settings",
			"Enable automatic sync",
			"Keep sessions off (recommended)",
			"Save setup",
			undefined,
		];
		const inputs = [
			"https://cloud.example.com/remote.php/dav/files/user",
			"user",
			"pi-sync",
			"home",
		];
		const inputTitles: string[] = [];
		const rendered: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				rendered.push(title);
				return selections.shift();
			},
			input: async (title: string) => {
				inputTitles.push(title);
				return inputs.shift();
			},
			custom: secretInput("app-password", rendered),
		});

		await mock.commands.get("sync")?.handler("", ctx);

		const saved = await readLocalConfigObject();
		const profile = (saved?.profiles as Record<string, Record<string, unknown>>)?.webdav;
		const target = (saved?.targets as Record<string, Record<string, unknown>>)?.home;
		assert.equal(profile.kind, "webdav");
		assert.equal(profile.url, "https://cloud.example.com/remote.php/dav/files/user/");
		assert.equal(profile.username, "user");
		assert.equal(profile.password, "app-password");
		assert.equal(target.path, "pi-sync");
		assert.equal(target.namespace, "home");
		assert.deepEqual(inputTitles, [
			"WebDAV collection URL",
			"WebDAV username",
			"WebDAV remote path",
			"Remote namespace",
		]);
		assert.doesNotMatch(rendered.join("\n"), /app-password/);
		assert.match(rendered.join("\n"), /Password: configured/i);
	});
});

test("WebDAV setup cannot continue after its session is aborted", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify({ version: 2, profiles: {}, targets: {} }));
		const controller = new AbortController();
		let resolveInput: ((value: string) => void) | undefined;
		let inputCalls = 0;
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => {
				inputCalls += 1;
				return await new Promise<string>((resolve) => {
					resolveInput = resolve;
				});
			},
		});
		const setup = showAddWebDavStorageProfile(ctx, controller.signal);
		while (!resolveInput) await new Promise((resolve) => setImmediate(resolve));
		controller.abort(new DOMException("Session replaced", "AbortError"));
		resolveInput("dav");
		await assert.rejects(
			setup,
			(error: unknown) => error instanceof Error && error.name === "AbortError",
		);
		assert.equal(inputCalls, 1);
		assert.deepEqual((await readLocalConfigObject())?.profiles, {});
	});
});

test("WebDAV profile and target management preserve hidden credentials", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({ version: 2, profiles: {}, targets: {}, futureField: "preserved" }),
		);
		const selections = [
			"Add profile",
			"Recommended Pi settings",
			"Add target",
			"Keep current password",
			"Save profile",
			"Save target",
		];
		const inputs = [
			"dav",
			"https://cloud.example.com/remote.php/dav/files/user",
			"private-user",
			"pi-sync",
			"home",
			"https://cloud.example.com/remote.php/dav/files/private-user",
			"new-private-user",
			"new-path",
			"new-space",
		];
		const rendered: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				rendered.push(title);
				return selections.shift();
			},
			input: async () => inputs.shift(),
			custom: secretInput("private-password", rendered),
		});
		assert.equal(await showAddWebDavStorageProfile(ctx), true);
		assert.equal(await showAddWebDavTarget(ctx, "home", "dav"), true);
		let saved = await readLocalConfigObject();
		const originalProfile = requireRecord(saved?.profiles).dav;
		assert.equal(await showEditWebDavStorageProfile(ctx, "dav", originalProfile), true);
		assert.equal(
			await showEditWebDavTarget(ctx, {
				settingsVersion: 2,
				storageKind: "webdav",
				target: "home",
				path: "pi-sync",
				profile: "home",
			}),
			true,
		);
		saved = await readLocalConfigObject();
		const profile = requireRecord(saved?.profiles).dav;
		const target = requireRecord(saved?.targets).home;
		assert.equal(profile.username, "new-private-user");
		assert.equal(target.path, "new-path");
		assert.equal(target.namespace, "new-space");
		assert.equal(saved?.futureField, "preserved");
		const output = rendered.join("\n");
		assert.doesNotMatch(output, /private-user|new-private-user|remote\.php/);
		assert.match(output, /value hidden/);

		const beforeInvalidEdit = readFileSync(localConfigPath());
		const invalidInputs = ["http://cloud.example.com/dav", "private-user"];
		const { ctx: invalidCtx } = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => invalidInputs.shift(),
		});
		assert.equal(await showEditWebDavStorageProfile(invalidCtx, "dav", profile), false);
		assert.deepEqual(readFileSync(localConfigPath()), beforeInvalidEdit);
	});
});

test("Add destination can create a WebDAV connection without leaving the manager flow", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
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
						bucket: "pi-sync",
						prefix: "pi-sync",
						namespace: "home",
					},
				},
			}),
		);
		const selections = [
			"More…",
			"Manage destinations",
			"Add destination",
			"Create a new saved connection…",
			"WebDAV",
			"Add profile",
			"Recommended Pi settings",
			"Add target",
			undefined,
		];
		const inputs = ["work", "dav", "https://cloud.example.com/dav", "user", "pi-sync", "work"];
		const rendered: string[] = [];
		const mock = createMockPi();
		sync(mock.pi);
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			select: async (title: string) => {
				rendered.push(title);
				return selections.shift();
			},
			input: async () => inputs.shift(),
			custom: secretInput("app-password", rendered),
		});

		await mock.commands.get("sync")?.handler("", ctx);

		const saved = await readLocalConfigObject();
		assert.equal(requireRecord(saved?.profiles).dav.password, "app-password");
		assert.equal(requireRecord(saved?.targets).work.profile, "dav");
		assert.equal(requireRecord(saved?.targets).work.path, "pi-sync");
		assert.doesNotMatch(rendered.join("\n"), /app-password/);
	});
});

test("WebDAV repair detection includes incompatible profile-only fields", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				version: 2,
				activeTarget: "webdav",
				profiles: {
					webdav: {
						kind: "webdav",
						url: "https://cloud.example.com/dav",
						username: "user",
						password: "secret",
						accessKeyId: "incompatible",
					},
				},
				targets: {
					webdav: { profile: "webdav", path: "pi-sync", namespace: "webdav" },
				},
			}),
		);
		assert.equal(await repairableWebDavDestinationName(), "webdav");
	});
});

test("WebDAV repair removes incompatible fields and fills missing credentials through TUI", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				version: 2,
				activeTarget: "webdav",
				futureField: { preserved: true },
				profiles: {
					webdav: {
						kind: "webdav",
						url: "https://cloud.example.com/dav",
						username: "user",
					},
				},
				targets: {
					webdav: {
						profile: "webdav",
						bucket: "pi-sync",
						prefix: "pi-sync",
						namespace: "webdav",
						futureTarget: "preserved",
					},
				},
			}),
		);
		const inputs = ["pi-sync", "webdav"];
		const reviews: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: secretInput("app-password", reviews),
			input: async () => inputs.shift(),
			select: async (title: string) => {
				reviews.push(title);
				return "Repair destination";
			},
		});

		assert.equal(await showRepairWebDavDestination(ctx, "webdav"), true);
		const saved = await readLocalConfigObject();
		const profile = requireRecord(saved?.profiles).webdav;
		const target = requireRecord(saved?.targets).webdav;
		assert.equal(profile.password, "app-password");
		assert.equal(target.path, "pi-sync");
		assert.equal(Object.hasOwn(target, "bucket"), false);
		assert.equal(Object.hasOwn(target, "prefix"), false);
		assert.equal(target.futureTarget, "preserved");
		assert.deepEqual(saved?.futureField, { preserved: true });
		assert.equal((await loadConfig()).backend.type, "webdav");
		assert.doesNotMatch(reviews.join("\n"), /app-password/);
	});
});

function secretInput(secret: string, rendered: string[] = []) {
	return async (factory: unknown) => {
		const harness = createCustomSelectorHarness(factory, 50);
		rendered.push(harness.handleInput(secret).join("\n"));
		harness.handleInput("tui.input.submit");
		return harness.result;
	};
}

function requireRecord(value: unknown): Record<string, Record<string, unknown>> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, Record<string, unknown>>;
}
