import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { WorkspaceManager } from "../src/workspace.js";

test("WorkspaceManager cleans only persisted worktrees with a matching owner marker", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagent-worktree-test-"));
	const cwd = path.join(root, "nested");
	mkdirSync(cwd);
	writeFileSync(`${root}.owner`, "right-owner", { mode: 0o600 });
	const manager = new WorkspaceManager();
	await manager.cleanupPersisted("wrong-owner", cwd);
	assert.equal(existsSync(root), true);
	await manager.cleanupPersisted("right-owner", cwd);
	assert.equal(existsSync(root), false);
	assert.equal(existsSync(`${root}.owner`), false);
	rmSync(root, { recursive: true, force: true });
});
