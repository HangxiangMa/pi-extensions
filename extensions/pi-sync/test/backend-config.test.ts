import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createSyncBackend } from "../src/backend-factory.js";
import {
	loadConfig,
	localConfigPath,
	readStateForConfig,
	statePathForConfig,
} from "../src/config.js";
import { requiredConfig, withTempHome } from "./helpers.js";

test("flat and version 2 settings normalize to the S3 backend factory", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(requiredConfig()));
		const flat = await loadConfig();
		assert.equal(flat.backend.type, "s3");
		assert.equal(flat.backend.profile.endpoint, requiredConfig().endpoint);
		assert.equal(flat.backend.destination.bucket, requiredConfig().bucket);
		assert.equal(createSyncBackend(flat).capability, "read-check-write-verify");

		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				version: 2,
				activeTarget: "home",
				profiles: {
					r2: {
						kind: "r2",
						endpoint: requiredConfig().endpoint,
						accessKeyId: requiredConfig().accessKeyId,
						secretAccessKey: requiredConfig().secretAccessKey,
					},
				},
				targets: {
					home: { profile: "r2", bucket: requiredConfig().bucket },
				},
			}),
		);
		const versionTwo = await loadConfig();
		assert.equal(versionTwo.backend.type, "s3");
		assert.equal(versionTwo.backend.profile.kind, "r2");
		assert.equal(versionTwo.backend.destination.namespace, "home");
		assert.equal(createSyncBackend(versionTwo).capability, "read-check-write-verify");
	});
});

test("profile aliases resolving to one backend destination are rejected", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		const profile = {
			kind: "s3-compatible",
			endpoint: requiredConfig().endpoint,
			accessKeyId: requiredConfig().accessKeyId,
			secretAccessKey: requiredConfig().secretAccessKey,
		};
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				version: 2,
				activeTarget: "home",
				profiles: { first: profile, alias: profile },
				targets: {
					home: { profile: "first", bucket: "shared", namespace: "same" },
					work: { profile: "alias", bucket: "shared", namespace: "same" },
				},
			}),
		);

		await assert.rejects(loadConfig(), /use the same remote destination/);
	});
});

test("legacy ETag state remains readable but is not reinterpreted as a backend revision", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(requiredConfig()));
		const config = await loadConfig();
		mkdirSync(path.dirname(statePathForConfig(config)), { recursive: true });
		writeFileSync(
			statePathForConfig(config),
			JSON.stringify({
				version: 1,
				profile: "default",
				lastAppliedSnapshot: "legacy",
				lastRemoteEtag: '"legacy-etag"',
				lastFileHashes: {},
			}),
		);

		const state = await readStateForConfig(config);
		assert.equal(state.lastRemoteEtag, '"legacy-etag"');
		assert.equal(state.lastRemoteRevision, undefined);
	});
});
