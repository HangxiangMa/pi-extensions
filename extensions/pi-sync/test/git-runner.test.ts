import assert from "node:assert/strict";
import test from "node:test";
import { runGit } from "../src/git-runner.js";

test("Git runner strips inherited Git control variables and closes stdin", async () => {
	const previous = process.env.GIT_DIR;
	process.env.GIT_DIR = "/credential-bearing/untrusted/repository";
	try {
		const result = await runGit(["-c", "alias.dump=!env", "dump"], {
			env: {
				GIT_DIR: "/another/untrusted/repository",
				GIT_TERMINAL_PROMPT: "1",
				GIT_CONFIG_NOSYSTEM: "0",
				GIT_ASKPASS: "evil",
			},
		});
		const output = result.stdout.toString("utf8");
		assert.doesNotMatch(output, /^GIT_DIR=/mu);
		assert.match(output, /^GIT_TERMINAL_PROMPT=0$/mu);
		assert.match(output, /^GIT_CONFIG_NOSYSTEM=1$/mu);
		assert.match(output, /^GIT_ASKPASS=$/mu);
		assert.match(output, /^SSH_ASKPASS=$/mu);
	} finally {
		if (previous === undefined) delete process.env.GIT_DIR;
		else process.env.GIT_DIR = previous;
	}
});

test("Git runner reports a missing executable without hanging", async () => {
	await assert.rejects(runGit(["--version"], { env: { PATH: "" } }), /ENOENT|spawn git/i);
});

test("Git runner bounds time and honors caller cancellation", async () => {
	await assert.rejects(
		runGit(["-c", "alias.wait=!sleep 10", "wait"], { timeoutMs: 20 }),
		/timed out/i,
	);
	const controller = new AbortController();
	setTimeout(() => controller.abort(new DOMException("cancelled", "AbortError")), 20);
	await assert.rejects(
		runGit(["-c", "alias.wait=!sleep 10", "wait"], { signal: controller.signal }),
		(error: unknown) => error instanceof Error && error.name === "AbortError",
	);
});

test("Git runner rejects output beyond its configured bound", async () => {
	if (process.platform === "win32") return;
	await assert.rejects(
		runGit(["-c", "alias.spam=!yes pi-sync", "spam"], { maxOutputBytes: 128 }),
		/output exceeds/i,
	);
});
