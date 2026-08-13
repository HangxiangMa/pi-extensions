import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

const packageRoot = path.resolve("packages/pi-tui-kit");

test("built package roots resolve separate production and testing exports", async (t) => {
	const productionSpecifier = "@narumitw/pi-tui-kit";
	const testingSpecifier = "@narumitw/pi-tui-kit/testing";
	const production = await import(productionSpecifier);
	const testing = await import(testingSpecifier);
	assert.equal(production.PI_EXTENSION_MENU_API_VERSION, 12);
	assert.equal(typeof production.formatInteractionHints, "function");
	assert.equal(typeof production.runConfirmation, "function");
	assert.equal(typeof production.runCustomInteraction, "function");
	assert.equal(typeof production.runLiveChoice, "function");
	assert.equal("createTuiHarness" in production, false);
	assert.equal("createRpcHarness" in production, false);
	assert.deepEqual(Object.keys(testing).sort(), ["createRpcHarness", "createTuiHarness"]);

	const cacheRoot = path.resolve("node_modules/.cache");
	mkdirSync(cacheRoot, { recursive: true });
	const fixture = mkdtempSync(path.join(cacheRoot, "pi-tui-kit-testing-export-"));
	t.onTestFinished(() => rmSync(fixture, { recursive: true, force: true }));
	writeFileSync(
		path.join(fixture, "usage.ts"),
		`import { PI_EXTENSION_MENU_API_VERSION, type BrowseDetailDocument, type ChoiceScreen, type LiveChoiceItem, type MenuBrowseItem } from "@narumitw/pi-tui-kit";\n` +
			`import { createRpcHarness, createTuiHarness } from "@narumitw/pi-tui-kit/testing";\n` +
			`const version: 12 = PI_EXTENSION_MENU_API_VERSION;\n` +
			`const document: BrowseDetailDocument = { content: "  exact", format: { kind: "text" } };\n` +
			`const item: MenuBrowseItem = { id: "one", label: "One", detailDocument: document };\n` +
			`const choice: LiveChoiceItem = { id: "active", label: "Active", confirmationDisabled: true, confirmationDisabledReason: "Already active" };\n` +
			`const screen: ChoiceScreen<"select"> = { kind: "choice", title: "Records", enableSearch: true, items: [{ id: "one", label: "One", searchText: "alias" }], action: "select" };\n` +
			`void version;\nvoid item;\nvoid choice;\nvoid screen;\nvoid createTuiHarness();\nvoid createRpcHarness([]);\n`,
	);
	writeFileSync(
		path.join(fixture, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "NodeNext",
				moduleResolution: "NodeNext",
				strict: true,
				noEmit: true,
				skipLibCheck: true,
			},
			include: ["usage.ts"],
		}),
	);
	const tsc = path.resolve("node_modules/.bin/tsc");
	execFileSync(tsc, ["-p", path.join(fixture, "tsconfig.json")], {
		cwd: packageRoot,
		stdio: "pipe",
	});
});
