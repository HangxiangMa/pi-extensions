import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { WorkItemLedger } from "../src/work-item-ledger.js";
import { WorkItemPersistence } from "../src/work-item-persistence.js";

test("WorkItemPersistence atomically restores inert workflow evidence and quarantines corruption", async () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-work-ledger-"));
	const file = path.join(directory, "workflow.json");
	const persistence = new WorkItemPersistence(file);
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [{ id: "task", objective: "task", dependencies: [] }],
	});
	ledger.start("task", "agent-task");
	await persistence.save(ledger.snapshot());
	const restored = persistence.load();
	assert.equal(restored?.get("task")?.state, "interrupted");
	assert.equal(existsSync(file), true);
	const malformed = ledger.snapshot();
	malformed.items[0].generation = malformed.generation + 1;
	writeFileSync(file, JSON.stringify(malformed));
	assert.equal(persistence.load(), undefined);

	writeFileSync(file, "not-json");
	assert.equal(persistence.load(), undefined);
	assert.equal(
		readdirSync(directory).some((entry) => entry.startsWith("workflow.json.invalid-")),
		true,
	);
	rmSync(directory, { recursive: true, force: true });
});
