import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { captureWorkflowTreeIdentity } from "../src/workflow-tree-identity.js";

function repository(): string {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-workflow-tree-"));
	execFileSync("git", ["init", "-q", root]);
	execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
	execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
	writeFileSync(path.join(root, "tracked.txt"), "base\n");
	execFileSync("git", ["-C", root, "add", "tracked.txt"]);
	execFileSync("git", ["-C", root, "commit", "-qm", "initial"]);
	return root;
}

test("workflow tree identity distinguishes clean, staged, unstaged, and untracked bytes", async () => {
	const root = repository();
	try {
		const clean = await captureWorkflowTreeIdentity(root);
		assert.equal(clean.kind, "git-commit");

		writeFileSync(path.join(root, "tracked.txt"), "first\n");
		const first = await captureWorkflowTreeIdentity(root);
		assert.equal(first.kind, "git-dirty");
		writeFileSync(path.join(root, "tracked.txt"), "second\n");
		const second = await captureWorkflowTreeIdentity(root);
		assert.notEqual(first.digest, second.digest);

		execFileSync("git", ["-C", root, "add", "tracked.txt"]);
		const staged = await captureWorkflowTreeIdentity(root);
		assert.equal(staged.kind, "git-dirty");
		assert.notEqual(staged.digest, second.digest);

		writeFileSync(path.join(root, "tracked.txt"), "base\n");
		const indexOnlyFirst = await captureWorkflowTreeIdentity(root);
		assert.equal(indexOnlyFirst.kind, "git-dirty");
		assert.notEqual(indexOnlyFirst.digest, clean.digest);
		writeFileSync(path.join(root, "tracked.txt"), "third\n");
		execFileSync("git", ["-C", root, "add", "tracked.txt"]);
		writeFileSync(path.join(root, "tracked.txt"), "base\n");
		const indexOnlySecond = await captureWorkflowTreeIdentity(root);
		assert.notEqual(indexOnlyFirst.digest, indexOnlySecond.digest);

		execFileSync("git", ["-C", root, "reset", "--hard", "-q", "HEAD"]);
		writeFileSync(path.join(root, "untracked.txt"), "one\n");
		const untrackedOne = await captureWorkflowTreeIdentity(root);
		writeFileSync(path.join(root, "untracked.txt"), "two\n");
		const untrackedTwo = await captureWorkflowTreeIdentity(root);
		assert.notEqual(untrackedOne.digest, untrackedTwo.digest);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("workflow tree identity frames untracked entries without chosen-content collisions", async () => {
	const root = repository();
	try {
		writeFileSync(path.join(root, "a"), Buffer.from("X\0untracked\0file\0b\0Y"));
		const embeddedMarker = await captureWorkflowTreeIdentity(root);
		writeFileSync(path.join(root, "a"), "X");
		writeFileSync(path.join(root, "b"), "Y");
		const separateEntry = await captureWorkflowTreeIdentity(root);
		assert.notEqual(embeddedMarker.digest, separateEntry.digest);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("workflow tree identity hashes symlink metadata without following outside content", async () => {
	const root = repository();
	const outside = mkdtempSync(path.join(os.tmpdir(), "pi-workflow-tree-outside-"));
	try {
		writeFileSync(path.join(outside, "secret.txt"), "secret-one\n");
		symlinkSync(path.join(outside, "secret.txt"), path.join(root, "link"));
		const before = await captureWorkflowTreeIdentity(root);
		writeFileSync(path.join(outside, "secret.txt"), "secret-two\n");
		const afterOutsideChange = await captureWorkflowTreeIdentity(root);
		assert.equal(before.digest, afterOutsideChange.digest);
		rmSync(path.join(root, "link"));
		symlinkSync("different-target", path.join(root, "link"));
		const changedLink = await captureWorkflowTreeIdentity(root);
		assert.notEqual(before.digest, changedLink.digest);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	}
});

test("workflow tree identity fails closed for unsupported, oversized, and cancelled snapshots", async () => {
	const plain = mkdtempSync(path.join(os.tmpdir(), "pi-workflow-tree-plain-"));
	await assert.rejects(() => captureWorkflowTreeIdentity(plain), /Git repository/i);
	rmSync(plain, { recursive: true, force: true });

	const root = repository();
	try {
		writeFileSync(path.join(root, "large.txt"), "x".repeat(4096));
		await assert.rejects(
			() => captureWorkflowTreeIdentity(root, { maxBytes: 1024 }),
			/size limit/i,
		);
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			() => captureWorkflowTreeIdentity(root, { signal: controller.signal }),
			(error: unknown) => error instanceof Error && error.name === "AbortError",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
