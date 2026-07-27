import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
	loadConfig,
	localConfigPath,
	readStateForConfig,
	stateDir,
	statePathForConfig,
} from "../src/config.js";
import { updateStorageProfile } from "../src/settings-management.js";
import { withTempHome } from "./helpers.js";

const settings = {
	version: 2,
	activeTarget: "home",
	profiles: {
		dav: {
			kind: "webdav",
			url: "https://cloud.example.com/remote.php/dav/files/user",
			username: "user",
			password: "secret",
		},
	},
	targets: {
		home: { profile: "dav", path: "pi-sync", namespace: "home", autoSync: true },
	},
};

test("version 2 resolves a WebDAV profile and destination without environment overrides", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		process.env.PI_SYNC_ENDPOINT = "https://ignored.example.com";
		process.env.PI_SYNC_AUTO_SYNC = "false";
		process.env.PI_SYNC_SESSIONS = "true";
		try {
			const config = await loadConfig();
			assert.equal(config.backend.type, "webdav");
			if (config.backend.type !== "webdav") return;
			assert.equal(
				config.backend.profile.url,
				"https://cloud.example.com/remote.php/dav/files/user/",
			);
			assert.equal(config.backend.profile.password, "secret");
			assert.deepEqual(config.backend.destination, { path: "pi-sync", namespace: "home" });
			assert.equal(config.autoSync, true);
			assert.equal(config.syncSessions, false);
			assert.match(statePathForConfig(config), new RegExp(`${path.sep}targets${path.sep}home-`));
		} finally {
			delete process.env.PI_SYNC_ENDPOINT;
			delete process.env.PI_SYNC_AUTO_SYNC;
			delete process.env.PI_SYNC_SESSIONS;
		}
	});
});

test("WebDAV targets do not adopt target-name-only legacy S3 state", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const config = await loadConfig();
		const legacyPath = path.join(
			stateDir(),
			"targets",
			`home-${createHash("sha256").update("home").digest("hex").slice(0, 10)}.state.json`,
		);
		mkdirSync(path.dirname(legacyPath), { recursive: true });
		writeFileSync(
			legacyPath,
			JSON.stringify({
				version: 1,
				profile: "home",
				lastAppliedSnapshot: "unrelated-s3-snapshot",
				lastFileHashes: {},
			}),
		);

		assert.equal((await readStateForConfig(config)).lastAppliedSnapshot, undefined);
		assert.equal(existsSync(legacyPath), true);
		assert.equal(existsSync(statePathForConfig(config)), false);
	});
});

test("WebDAV state identity changes with the authenticated username", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const first = await loadConfig();
		if (first.backend.type !== "webdav") return;
		const second = {
			...first,
			backend: {
				...first.backend,
				profile: { ...first.backend.profile, username: "other-user" },
			},
		};
		assert.notEqual(statePathForConfig(first), statePathForConfig(second));
	});
});

test("WebDAV settings reject aliased profiles that resolve to one remote destination", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				...settings,
				profiles: {
					first: settings.profiles.dav,
					second: { ...settings.profiles.dav, url: `${settings.profiles.dav.url}/` },
				},
				targets: {
					home: { profile: "first", path: "pi-sync", namespace: "shared" },
					work: { profile: "second", path: "pi-sync", namespace: "shared" },
				},
			}),
		);
		await assert.rejects(loadConfig(), /same remote destination/);
	});
});

test("WebDAV settings allow separate authenticated users at one collection URL", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				...settings,
				profiles: {
					first: { ...settings.profiles.dav, username: "alice" },
					second: { ...settings.profiles.dav, username: "bob" },
				},
				targets: {
					home: { profile: "first", path: "pi-sync", namespace: "shared" },
					work: { profile: "second", path: "pi-sync", namespace: "shared" },
				},
			}),
		);

		await assert.doesNotReject(loadConfig());
	});
});

test("WebDAV profile edits reject newly duplicated remote destinations", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				...settings,
				profiles: {
					first: settings.profiles.dav,
					second: { ...settings.profiles.dav, url: "https://other.example.com/dav" },
				},
				targets: {
					home: { profile: "first", path: "pi-sync", namespace: "shared" },
					work: { profile: "second", path: "pi-sync", namespace: "shared" },
				},
			}),
		);
		await assert.rejects(
			updateStorageProfile("second", (profile) => ({
				...profile,
				url: `${settings.profiles.dav.url}/`,
			})),
			/same remote destination/,
		);
	});
});

test("WebDAV settings reject mixed backend fields and unsafe URLs", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				...settings,
				profiles: { dav: { ...settings.profiles.dav, accessKeyId: "mixed" } },
			}),
		);
		await assert.rejects(loadConfig(), /mixes backend fields/);
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				...settings,
				profiles: { dav: { ...settings.profiles.dav, url: "http://cloud.example.com/dav" } },
			}),
		);
		await assert.rejects(loadConfig(), /HTTPS is required/);
	});
});
