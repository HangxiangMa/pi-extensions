import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createSyncBackend } from "../src/backend-factory.js";
import { loadConfig, localConfigPath, statePathForConfig } from "../src/config.js";
import { normalizeGitRemoteIdentity } from "../src/git-config.js";
import { withEnv, withTempHome } from "./helpers.js";

const settings = {
	version: 2,
	activeTarget: "home",
	profiles: {
		github: {
			kind: "git",
			remote: "git@github.com:owner/private-pi-sync.git",
		},
	},
	targets: {
		home: {
			profile: "github",
			branch: "pi-sync/home",
			directory: "pi-sync",
			namespace: "home",
			autoSync: true,
		},
	},
};

test("Git remote identity preserves absolute versus home-relative scp paths", () => {
	assert.notEqual(
		normalizeGitRemoteIdentity("git@example.com:/owner/repo.git"),
		normalizeGitRemoteIdentity("git@example.com:owner/repo.git"),
	);
	assert.equal(
		normalizeGitRemoteIdentity("git@EXAMPLE.com:owner/repo.git/"),
		normalizeGitRemoteIdentity("git@example.com:owner/repo.git"),
	);
});

test("Git config resolves an exhaustive secret-free backend destination", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const config = await loadConfig();
		assert.equal(config.backend.type, "git");
		if (config.backend.type !== "git") return;
		assert.deepEqual(config.backend.profile, {
			kind: "git",
			remote: "git@github.com:owner/private-pi-sync.git",
		});
		assert.deepEqual(config.backend.destination, {
			branch: "pi-sync/home",
			directory: "pi-sync",
			namespace: "home",
		});
		assert.match(statePathForConfig(config), new RegExp(`${path.sep}targets${path.sep}home-`));
		assert.equal(createSyncBackend(config).capability, "lease-protected");
		assert.doesNotMatch(createSyncBackend(config).destination, /credential|token|password/i);
	});
});

test("Git profiles never inherit deprecated S3 environment credentials or policy", async () => {
	await withEnv(
		{
			PI_SYNC_ENDPOINT: "https://ignored.example.com",
			PI_SYNC_BUCKET: "ignored",
			PI_SYNC_ACCESS_KEY_ID: "ignored-access",
			PI_SYNC_SECRET_ACCESS_KEY: "ignored-secret",
			PI_SYNC_AUTO_SYNC: "false",
			PI_SYNC_SESSIONS: "true",
		},
		() =>
			withTempHome(async (agentDir) => {
				mkdirSync(agentDir, { recursive: true });
				writeFileSync(localConfigPath(), JSON.stringify(settings));
				const config = await loadConfig();
				assert.equal(config.backend.type, "git");
				assert.equal(config.autoSync, true);
				assert.equal(config.syncSessions, false);
				assert.doesNotMatch(JSON.stringify(config.backend), /ignored/);
			}),
	);
});

test("Git state identity changes with branch, directory, namespace, and remote", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(settings));
		const first = await loadConfig();
		if (first.backend.type !== "git") return;
		const variants = [
			{
				...first.backend,
				profile: { ...first.backend.profile, remote: "ssh://git@example.com/x.git" },
			},
			{ ...first.backend, destination: { ...first.backend.destination, branch: "pi-sync/work" } },
			{ ...first.backend, destination: { ...first.backend.destination, directory: "other" } },
			{ ...first.backend, destination: { ...first.backend.destination, namespace: "work" } },
		];
		for (const backend of variants) {
			assert.notEqual(statePathForConfig(first), statePathForConfig({ ...first, backend }));
		}
	});
});

test("Git config rejects mixed backend fields and unsafe remotes, refs, and paths", async () => {
	const cases: Array<[string, Record<string, unknown>, RegExp]> = [
		[
			"credential URL",
			{ remote: "https://user:token@example.com/repo.git" },
			/credentials|userinfo/i,
		],
		["unsafe scheme", { remote: "ext::sh -c evil" }, /remote/i],
		["option-like SSH path", { remote: "git@example.com:-oProxyCommand=evil" }, /remote/i],
		["Windows local path", { remote: "C:\\private\\repo.git" }, /remote/i],
		["full ref", { branch: "refs/heads/main" }, /branch/i],
		["special at branch", { branch: "@" }, /branch/i],
		["hidden ref segment", { branch: "feature/.hidden" }, /branch/i],
		["option branch", { branch: "--upload-pack=evil" }, /branch/i],
		["traversal directory", { directory: "../escape" }, /directory/i],
		["git metadata directory", { directory: ".git/hooks" }, /directory/i],
		["mixed profile", { endpoint: "https://s3.example.com" }, /mixes backend fields/i],
		["mixed target", { bucket: "bucket" }, /mixes backend fields/i],
	];
	for (const [name, mutation, pattern] of cases) {
		await withTempHome(async (agentDir) => {
			mkdirSync(agentDir, { recursive: true });
			const next = structuredClone(settings) as typeof settings & Record<string, unknown>;
			if (name === "mixed profile" || Object.hasOwn(mutation, "remote")) {
				Object.assign(next.profiles.github, mutation);
			} else {
				Object.assign(next.targets.home, mutation);
			}
			writeFileSync(localConfigPath(), JSON.stringify(next));
			await assert.rejects(loadConfig(), pattern, name);
		});
	}
});

test("Git settings reserve each effective remote branch for one target", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				...settings,
				targets: {
					home: settings.targets.home,
					work: {
						...settings.targets.home,
						directory: "different-directory",
						namespace: "work",
					},
				},
			}),
		);
		await assert.rejects(loadConfig(), /same remote destination/i);
	});
});

test("Git settings reject duplicate effective destinations across profile aliases", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				...settings,
				profiles: {
					one: settings.profiles.github,
					two: { ...settings.profiles.github },
				},
				targets: {
					home: { ...settings.targets.home, profile: "one" },
					work: { ...settings.targets.home, profile: "two" },
				},
			}),
		);
		await assert.rejects(loadConfig(), /same remote destination/i);
	});
});
