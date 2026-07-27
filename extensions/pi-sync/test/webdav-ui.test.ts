import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { localConfigPath, readLocalConfigObject } from "../src/config.js";
import sync from "../src/sync.js";
import {
	showAddWebDavStorageProfile,
	showAddWebDavTarget,
	showEditWebDavStorageProfile,
	showEditWebDavTarget,
} from "../src/webdav-ui.js";
import { withTempHome } from "./helpers.js";

test("first-time WebDAV setup stores a discriminated profile without requesting a password", async () => {
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
		});

		await mock.commands.get("sync")?.handler("", ctx);

		const saved = await readLocalConfigObject();
		const profile = (saved?.profiles as Record<string, Record<string, unknown>>)?.webdav;
		const target = (saved?.targets as Record<string, Record<string, unknown>>)?.home;
		assert.equal(profile.kind, "webdav");
		assert.equal(profile.url, "https://cloud.example.com/remote.php/dav/files/user/");
		assert.equal(profile.username, "user");
		assert.equal(Object.hasOwn(profile, "password"), false);
		assert.equal(target.path, "pi-sync");
		assert.equal(target.namespace, "home");
		assert.deepEqual(inputTitles, [
			"WebDAV collection URL",
			"WebDAV username",
			"WebDAV remote path",
			"Remote namespace",
		]);
		assert.match(rendered.join("\n"), /never requests secrets|add it privately/i);
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

function requireRecord(value: unknown): Record<string, Record<string, unknown>> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, Record<string, unknown>>;
}
