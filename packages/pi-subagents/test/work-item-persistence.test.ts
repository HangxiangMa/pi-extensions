import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { WorkItemLedger } from "../src/work-item-ledger.js";
import {
	createSessionWorkItemPersistence,
	inspectSessionWorkflows,
	WorkItemPersistence,
} from "../src/work-item-persistence.js";

test("session workflow persistence is bounded, redacted, and read-only inspectable", async () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-work-ledger-session-"));
	const persistence = createSessionWorkItemPersistence("session", "wf", { stateDir: directory });
	const ledger = WorkItemLedger.create({
		workflowId: "wf",
		items: [
			{
				id: "task",
				objective: "visible <private>secret</private>",
				dependencies: [],
				readPaths: ["src/<private>secret</private>"],
			},
		],
	});
	ledger.start("task", "agent-task");
	await persistence.save(ledger.snapshot());
	const inspected = inspectSessionWorkflows("session", { stateDir: directory });
	assert.equal(inspected.invalid, 0);
	assert.equal(inspected.workflows[0]?.items[0]?.state, "interrupted");
	assert.equal(inspected.workflows[0]?.items[0]?.objective, "visible [private content omitted]");
	assert.equal(inspected.workflows[0]?.items[0]?.readPaths[0], "src/[private content omitted]");
	rmSync(directory, { recursive: true, force: true });
});

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
