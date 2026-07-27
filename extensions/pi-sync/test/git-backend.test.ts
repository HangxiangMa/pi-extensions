import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { GitSyncBackend, gitBackendIdentity, isSupportedGitVersion } from "../src/git-backend.js";
import {
	expectedRemoteHead,
	SyncBackendConflictError,
	SyncBackendPublicationOutcomeUnknownError,
} from "../src/sync-backend.js";
import { createBareRemote, gitConfig } from "./git-test-helpers.js";
import { snapshot } from "./helpers.js";

test("Git backend publishes lease-protected commits and preserves repeated-content history", async () => {
	const fixture = createBareRemote();
	try {
		const backend = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "cache"),
			allowLocalRemotes: true,
		});
		const content = snapshot([{ path: "settings.json", content: Buffer.from("one") }]);
		const first = await backend.publishSnapshot(content, { kind: "missing" });
		assert.match(
			first.head.revision,
			new RegExp(`^${gitBackendIdentity(gitConfig(fixture.remote))}:[0-9a-f]{40}$`),
		);
		const second = await backend.publishSnapshot(content, expectedRemoteHead(first.head));
		assert.notEqual(first.head.snapshotRef, second.head.snapshotRef);
		assert.equal(first.head.snapshotId, second.head.snapshotId);
		assert.deepEqual(
			(await backend.listHistory()).map((entry) => entry.snapshotRef),
			[first.head.snapshotRef, second.head.snapshotRef],
		);
		assert.deepEqual(await backend.readSnapshot(first.head.snapshotRef), content);
		const freshBackend = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "fresh-cache"),
			allowLocalRemotes: true,
		});
		assert.deepEqual(await freshBackend.readSnapshot(first.head.snapshotRef), content);
		assert.equal(
			execFileSync(
				"git",
				["--git-dir", fixture.remote, "rev-parse", "refs/heads/pi-sync/default"],
				{
					encoding: "utf8",
				},
			).trim(),
			second.head.snapshotRef,
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend rejects cached publications removed from owned-branch history", async () => {
	const fixture = createBareRemote();
	try {
		const first = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "first-cache"),
			allowLocalRemotes: true,
		});
		const old = await first.publishSnapshot(snapshot([]), { kind: "missing" });
		execFileSync("git", [
			"--git-dir",
			fixture.remote,
			"update-ref",
			"-d",
			"refs/heads/pi-sync/default",
		]);
		const replacement = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "replacement-cache"),
			allowLocalRemotes: true,
		});
		await replacement.publishSnapshot({ ...snapshot([]), id: "replacement" }, { kind: "missing" });
		await assert.rejects(first.readSnapshot(old.head.snapshotRef), /not found/i);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend returns the ref fetched after an ls-remote race", async () => {
	const fixture = createBareRemote();
	try {
		const writer = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "writer"),
			allowLocalRemotes: true,
		});
		const first = await writer.publishSnapshot(snapshot([]), { kind: "missing" });
		let secondSnapshotRef: string | undefined;
		let advanced = false;
		const reader = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "reader"),
			allowLocalRemotes: true,
			afterLsRemoteForTest: async () => {
				if (advanced) return;
				advanced = true;
				const second = await writer.publishSnapshot(
					{ ...snapshot([]), id: "second" },
					expectedRemoteHead(first.head),
				);
				secondSnapshotRef = second.head.snapshotRef;
			},
		});
		const head = await reader.readHead();
		assert.equal(head?.snapshotRef, secondSnapshotRef);
		assert.equal(head?.snapshotId, "second");
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend rejects stale independent writers with an exact lease", async () => {
	const fixture = createBareRemote();
	try {
		const first = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "first"),
			allowLocalRemotes: true,
		});
		const second = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "second"),
			allowLocalRemotes: true,
		});
		assert.equal(await first.readHead(), undefined);
		assert.equal(await second.readHead(), undefined);
		await first.publishSnapshot(snapshot([]), { kind: "missing" });
		await assert.rejects(
			second.publishSnapshot({ ...snapshot([]), id: "other" }, { kind: "missing" }),
			SyncBackendConflictError,
		);
		assert.equal((await second.readHead())?.snapshotId, "snap");
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend serializes shared-cache initialization and ref fetches", async () => {
	const fixture = createBareRemote();
	try {
		const cacheRoot = path.join(fixture.root, "shared-cache");
		const options = { cacheRoot, allowLocalRemotes: true };
		const first = new GitSyncBackend(gitConfig(fixture.remote), options);
		const second = new GitSyncBackend(gitConfig(fixture.remote), options);
		assert.deepEqual(await Promise.all([first.readHead(), second.readHead()]), [
			undefined,
			undefined,
		]);
		await first.publishSnapshot(snapshot([]), { kind: "missing" });
		const heads = await Promise.all([first.readHead(), second.readHead()]);
		assert.equal(heads[0]?.snapshotRef, heads[1]?.snapshotRef);
		const gitDir = path.join(
			cacheRoot,
			gitBackendIdentity(gitConfig(fixture.remote)).slice("git:".length),
			"repository.git",
		);
		assert.equal(
			execFileSync("git", ["--git-dir", gitDir, "for-each-ref", "refs/pisync/fetch"], {
				encoding: "utf8",
			}),
			"",
		);
		assert.doesNotMatch(readFileSync(path.join(gitDir, "config"), "utf8"), /remote\.git/);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend bootstraps its owned branch in an existing non-empty repository", async () => {
	const fixture = createBareRemote();
	const work = path.join(fixture.root, "existing-work");
	try {
		mkdirSync(work);
		execFileSync("git", ["init"], { cwd: work, stdio: "ignore" });
		writeFileSync(path.join(work, "README.md"), "existing repository\n");
		execFileSync("git", ["add", "README.md"], { cwd: work });
		execFileSync(
			"git",
			["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-m", "existing"],
			{ cwd: work, stdio: "ignore" },
		);
		const existingSha = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: work,
			encoding: "utf8",
		}).trim();
		execFileSync("git", ["remote", "add", "origin", fixture.remote], { cwd: work });
		execFileSync("git", ["push", "origin", "HEAD:refs/heads/main"], {
			cwd: work,
			stdio: "ignore",
		});
		const backend = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "cache"),
			allowLocalRemotes: true,
		});
		await backend.publishSnapshot(snapshot([]), { kind: "missing" });
		assert.equal(
			execFileSync("git", ["--git-dir", fixture.remote, "rev-parse", "refs/heads/main"], {
				encoding: "utf8",
			}).trim(),
			existingSha,
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend rejects unrelated owned refs and does not inspect a working tree", async () => {
	const fixture = createBareRemote();
	const work = path.join(fixture.root, "work");
	try {
		mkdirSync(work);
		execFileSync("git", ["init"], { cwd: work, stdio: "ignore" });
		writeFileSync(path.join(work, "unrelated.txt"), "unrelated");
		execFileSync("git", ["add", "unrelated.txt"], { cwd: work });
		execFileSync(
			"git",
			["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-m", "unrelated"],
			{ cwd: work, stdio: "ignore" },
		);
		execFileSync("git", ["remote", "add", "origin", fixture.remote], { cwd: work });
		execFileSync("git", ["push", "origin", "HEAD:refs/heads/pi-sync/default"], {
			cwd: work,
			stdio: "ignore",
		});
		const backend = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "cache"),
			allowLocalRemotes: true,
		});
		await assert.rejects(backend.readHead(), /manifest|publication/i);
		assert.equal(existsSync(path.join(work, "unrelated.txt")), true);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend repairs a corrupt private cache but refuses a symlinked cache", async () => {
	const fixture = createBareRemote();
	const config = gitConfig(fixture.remote);
	const identity = gitBackendIdentity(config).slice("git:".length);
	try {
		const corruptRoot = path.join(fixture.root, "corrupt-cache");
		const corrupt = path.join(corruptRoot, identity, "repository.git");
		mkdirSync(corrupt, { recursive: true });
		writeFileSync(path.join(corrupt, "bad"), "bad");
		const repaired = new GitSyncBackend(config, {
			cacheRoot: corruptRoot,
			allowLocalRemotes: true,
		});
		assert.equal(await repaired.readHead(), undefined);
		assert.equal(
			execFileSync("git", ["--git-dir", corrupt, "rev-parse", "--is-bare-repository"], {
				encoding: "utf8",
			}).trim(),
			"true",
		);

		if (process.platform !== "win32") {
			const symlinkRoot = path.join(fixture.root, "symlink-cache");
			const cache = path.join(symlinkRoot, identity, "repository.git");
			mkdirSync(path.dirname(cache), { recursive: true });
			symlinkSync(fixture.remote, cache);
			const unsafe = new GitSyncBackend(config, {
				cacheRoot: symlinkRoot,
				allowLocalRemotes: true,
			});
			await assert.rejects(unsafe.readHead(), /symlinked Git cache/i);

			const external = path.join(fixture.root, "external-cache");
			mkdirSync(external);
			const cacheRootLink = path.join(fixture.root, "cache-root-link");
			symlinkSync(external, cacheRootLink);
			const unsafeRoot = new GitSyncBackend(config, {
				cacheRoot: cacheRootLink,
				allowLocalRemotes: true,
			});
			await assert.rejects(unsafeRoot.readHead(), /symlinked Git cache root/i);
		}
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend rejects unsafe metadata, duplicate paths, and non-canonical content", async () => {
	const fixture = createBareRemote();
	try {
		const backend = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "cache"),
			allowLocalRemotes: true,
		});
		await assert.rejects(
			backend.publishSnapshot({ ...snapshot([]), machine: `bad\u001b[31m` }, { kind: "missing" }),
			/invalid Git snapshot/i,
		);
		const file = snapshot([{ path: "settings.json", content: Buffer.from("one") }]).files[0];
		assert.ok(file);
		await assert.rejects(
			backend.publishSnapshot({ ...snapshot([]), files: [file, file] }, { kind: "missing" }),
			/invalid Git snapshot file/i,
		);
		await assert.rejects(
			backend.publishSnapshot(
				{ ...snapshot([]), files: [{ ...file, path: "../escape" }] },
				{ kind: "missing" },
			),
			/invalid Git snapshot file/i,
		);
		await assert.rejects(
			backend.publishSnapshot(
				{ ...snapshot([]), files: [{ ...file, contentBase64: `${file.contentBase64}=` }] },
				{ kind: "missing" },
			),
			/checksum/i,
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend reconciles a lost success response and reports unreachable outcomes as unknown", async () => {
	const committedFixture = createBareRemote();
	try {
		const backend = new GitSyncBackend(gitConfig(committedFixture.remote), {
			cacheRoot: path.join(committedFixture.root, "cache"),
			allowLocalRemotes: true,
			afterPushForTest: () => {
				throw new Error("simulated lost response");
			},
		});
		const result = await backend.publishSnapshot(snapshot([]), { kind: "missing" });
		assert.equal(result.head.snapshotId, "snap");
	} finally {
		rmSync(committedFixture.root, { recursive: true, force: true });
	}

	const unknownFixture = createBareRemote();
	try {
		const backend = new GitSyncBackend(gitConfig(unknownFixture.remote), {
			cacheRoot: path.join(unknownFixture.root, "cache"),
			allowLocalRemotes: true,
			afterPushForTest: () => {
				rmSync(unknownFixture.remote, { recursive: true, force: true });
				throw new Error("simulated transport loss password=top-secret Bearer bearer-secret");
			},
		});
		await assert.rejects(
			backend.publishSnapshot(snapshot([]), { kind: "missing" }),
			(error: unknown) => {
				assert.ok(error instanceof SyncBackendPublicationOutcomeUnknownError);
				assert.doesNotMatch(error.message, /top-secret|bearer-secret/);
				return true;
			},
		);
	} finally {
		rmSync(unknownFixture.root, { recursive: true, force: true });
	}
});

test("Git backend disables local pre-push hooks in its private cache", async () => {
	if (process.platform === "win32") return;
	const fixture = createBareRemote();
	const config = gitConfig(fixture.remote);
	const identity = gitBackendIdentity(config).slice("git:".length);
	const cacheRoot = path.join(fixture.root, "cache");
	const gitDir = path.join(cacheRoot, identity, "repository.git");
	const marker = path.join(fixture.root, "hook-ran");
	try {
		const backend = new GitSyncBackend(config, { cacheRoot, allowLocalRemotes: true });
		await backend.readHead();
		mkdirSync(path.join(gitDir, "hooks"), { recursive: true });
		const hook = path.join(gitDir, "hooks", "pre-push");
		writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o700 });
		await backend.publishSnapshot(snapshot([]), { kind: "missing" });
		assert.equal(existsSync(marker), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git doctor rejects a corrupt active snapshot bundle", async () => {
	const fixture = createBareRemote();
	const corruptWork = path.join(fixture.root, "corrupt-work");
	try {
		const backend = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "cache"),
			allowLocalRemotes: true,
		});
		await backend.publishSnapshot(snapshot([]), { kind: "missing" });
		execFileSync("git", ["clone", "--branch", "pi-sync/default", fixture.remote, corruptWork], {
			stdio: "ignore",
		});
		writeFileSync(
			path.join(corruptWork, "pi-sync", "profiles", "default", "snapshot.json.gz"),
			"corrupt",
		);
		execFileSync("git", ["add", "."], { cwd: corruptWork });
		execFileSync(
			"git",
			["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-m", "corrupt"],
			{ cwd: corruptWork, stdio: "ignore" },
		);
		execFileSync("git", ["push", "origin", "HEAD:refs/heads/pi-sync/default"], {
			cwd: corruptWork,
			stdio: "ignore",
		});
		const diagnostics = await backend.diagnose();
		assert.ok(
			diagnostics.some(
				(item) => item.level === "error" && /checksum|snapshot bundle/i.test(item.message),
			),
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git diagnostics redact remote and private cache paths", async () => {
	const fixture = createBareRemote();
	const cacheRoot = path.join(fixture.root, "private-cache");
	const backend = new GitSyncBackend(gitConfig(fixture.remote), {
		cacheRoot,
		allowLocalRemotes: true,
	});
	rmSync(fixture.remote, { recursive: true, force: true });
	try {
		const output = (await backend.diagnose()).map((item) => item.message).join("\n");
		assert.doesNotMatch(output, new RegExp(fixture.remote.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
		assert.doesNotMatch(output, new RegExp(cacheRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
		assert.match(output, /git remote:/i);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend rejects malformed opaque revisions instead of treating them as missing", async () => {
	const fixture = createBareRemote();
	try {
		const backend = new GitSyncBackend(gitConfig(fixture.remote), {
			cacheRoot: path.join(fixture.root, "cache"),
			allowLocalRemotes: true,
		});
		assert.throws(() => backend.sameRevision("bad", "also-bad"), /invalid Git remote revision/i);
		await assert.rejects(
			backend.publishSnapshot(snapshot([]), { kind: "revision", revision: "bad" }),
			SyncBackendConflictError,
		);
		assert.equal(await backend.readHead(), undefined);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test("Git backend requires a supported Git version", () => {
	assert.equal(isSupportedGitVersion("git version 2.29.9"), false);
	assert.equal(isSupportedGitVersion("git version 2.30.0"), true);
	assert.equal(isSupportedGitVersion("git version 3.0.0.windows.1"), true);
	assert.equal(isSupportedGitVersion("malformed"), false);
});

test("Git backend production validation rejects local and credential-bearing remotes", () => {
	const local = gitConfig("/tmp/private.git");
	assert.throws(() => new GitSyncBackend(local), /SSH or HTTPS/i);
	const credential = gitConfig("https://user:token@example.com/private.git");
	assert.throws(() => new GitSyncBackend(credential), /credentials/i);
});
