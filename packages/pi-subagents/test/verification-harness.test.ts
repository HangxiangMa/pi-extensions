import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import {
	captureVerificationSubmission,
	runVerificationChecks,
} from "../src/verification-harness.js";

function repository(): string {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-verification-harness-test-"));
	execFileSync("git", ["init", "-q", root]);
	execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
	execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
	writeFileSync(path.join(root, "tracked.txt"), "base\n");
	execFileSync("git", ["-C", root, "add", "tracked.txt"]);
	execFileSync("git", ["-C", root, "commit", "-qm", "initial"]);
	return root;
}

test("verification harness binds patch metadata and isolates generated check output", async () => {
	const root = repository();
	try {
		writeFileSync(path.join(root, "tracked.txt"), "submitted\n");
		mkdirSync(path.join(root, "src"));
		writeFileSync(path.join(root, "src", "new.txt"), "new\n");
		const before = await captureVerificationSubmission(root);
		assert.deepEqual(before.changedPaths, ["src/new.txt", "tracked.txt"]);
		assert.match(before.patchDigest, /^[a-f0-9]{64}$/u);
		assert.match(before.baseRepositoryGeneration, /^[a-f0-9]{40,64}$/u);

		const result = await runVerificationChecks(
			root,
			[
				{
					id: "isolated-build",
					command: "node",
					args: [
						"-e",
						"require('fs').writeFileSync('generated.txt', require('fs').readFileSync('tracked.txt')); console.log('ok <private>secret</private>')",
					],
				},
			],
			undefined,
		);
		assert.equal(result.checks[0]?.status, "passed");
		assert.match(result.checks[0]?.stdout ?? "", /ok/u);
		assert.match(result.checks[0]?.stdout ?? "", /private content omitted/u);
		assert.doesNotMatch(result.checks[0]?.stdout ?? "", /secret/u);
		assert.equal(existsSync(path.join(root, "generated.txt")), false);
		assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "submitted\n");
		assert.equal(existsSync(result.disposableDirectory), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("verification harness resolves installed dependencies without copying generated output back", async () => {
	const root = repository();
	try {
		writeFileSync(path.join(root, ".gitignore"), "node_modules/\n");
		writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({ scripts: { verify: "node verify-dependency.mjs" } }),
		);
		writeFileSync(
			path.join(root, "verify-dependency.mjs"),
			'import fixture from "review-fixture"; console.log(fixture);\n',
		);
		const fixture = path.join(root, "node_modules", "review-fixture");
		mkdirSync(fixture, { recursive: true });
		writeFileSync(
			path.join(fixture, "package.json"),
			JSON.stringify({ name: "review-fixture", type: "module", exports: "./index.js" }),
		);
		writeFileSync(path.join(fixture, "index.js"), 'export default "installed-tree-ok";\n');

		const result = await runVerificationChecks(root, [
			{ id: "npm-check", command: "npm", args: ["run", "verify"] },
		]);
		assert.equal(result.checks[0]?.status, "passed");
		assert.match(result.checks[0]?.stdout ?? "", /installed-tree-ok/u);
		assert.equal(existsSync(path.join(root, "generated.txt")), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("verification harness terminates descendant processes that retain captured streams", {
	skip: process.platform === "win32",
}, async () => {
	const root = repository();
	const descendantPid = path.join(root, "descendant.pid");
	const lateSideEffect = path.join(root, "late-side-effect");
	try {
		const result = await runVerificationChecks(root, [
			{
				id: "timeout-group",
				command: "node",
				args: [
					"-e",
					[
						"const {spawn}=require('node:child_process');",
						"const {writeFileSync}=require('node:fs');",
						`const code=${JSON.stringify(
							`process.on('SIGTERM',()=>{});setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(lateSideEffect)},'survived'),500);setTimeout(()=>{},1500)`,
						)};`,
						"const child=spawn(process.execPath,['-e',code],{stdio:['ignore','inherit','inherit']});",
						`writeFileSync(${JSON.stringify(descendantPid)},String(child.pid));`,
						"setTimeout(()=>{},1500);",
					].join(""),
				],
				timeoutMs: 100,
			},
		]);
		assert.equal(result.checks[0]?.exitCode, 124);
		await new Promise((resolve) => setTimeout(resolve, 700));
		assert.equal(existsSync(lateSideEffect), false, "descendant survived check timeout");
	} finally {
		if (existsSync(descendantPid)) {
			try {
				process.kill(Number(readFileSync(descendantPid, "utf8")), "SIGKILL");
			} catch {
				// The process group was already terminated.
			}
		}
		rmSync(root, { recursive: true, force: true });
	}
});

test("verification harness fails closed for unsafe commands, failed checks, and cancellation", async () => {
	const root = repository();
	try {
		await assert.rejects(
			() =>
				runVerificationChecks(root, [{ id: "unsafe", command: "sh", args: ["-c", "echo unsafe"] }]),
			/unsafe verification command/i,
		);
		const failed = await runVerificationChecks(root, [
			{ id: "fails", command: "node", args: ["-e", "process.exit(7)"] },
		]);
		assert.equal(failed.checks[0]?.status, "failed");
		assert.equal(failed.checks[0]?.exitCode, 7);

		symlinkSync(path.join(root, "tracked.txt"), path.join(root, "external-link"));
		await assert.rejects(() => runVerificationChecks(root, []), /external symlink/i);

		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			() =>
				runVerificationChecks(
					root,
					[{ id: "cancelled", command: "node", args: ["-e", "setTimeout(()=>{}, 1000)"] }],
					controller.signal,
				),
			/abort|cancel/i,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
