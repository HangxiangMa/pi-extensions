import assert from "node:assert/strict";
import { test } from "vitest";
import type { SubagentParams } from "../src/params.js";
import { createBlockingWorkLedger } from "../src/workflow-planning.js";

test("workflow planning never assigns default integration ownership to a verifier", () => {
	const tasks = [
		{ id: "implementation", agent: "worker", task: "implement" },
		{
			id: "verification",
			agent: "reviewer",
			task: "verify",
			dependsOn: ["implementation"],
			verifierFor: "implementation",
			resultFormat: "structured-v2" as const,
		},
	];
	const params = { workflow: { tasks } } as SubagentParams;
	const ledger = createBlockingWorkLedger(params, tasks, undefined);
	assert.equal(ledger?.get("implementation")?.integrationOwner, true);
	assert.equal(ledger?.get("verification")?.integrationOwner, false);
});
