import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createRpcHarness, createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import toolExtension from "../src/index.js";
import { createToolCatalog } from "../src/tool-catalog.js";

initTheme("dark", false);

const configuredTools = [
	{
		name: "read",
		description: "Read a file from disk.",
		parameters: {
			type: "object",
			properties: { path: { type: "string", description: "File path" } },
			required: ["path"],
		},
		promptGuidelines: ["Use read before editing a file."],
		sourceInfo: {
			path: "<builtin:read>",
			source: "builtin",
			scope: "temporary",
			origin: "top-level",
		},
	},
	{
		name: "deploy",
		description: "Deploy the current project.",
		parameters: { type: "object", properties: {} },
		promptGuidelines: undefined,
		sourceInfo: {
			path: "/home/test/.pi/extensions/deploy.ts",
			source: "deploy.ts",
			scope: "user",
			origin: "package",
			baseDir: "/home/test/.pi/extensions",
		},
	},
] as const;

test("catalog lists every tool alphabetically with active state and complete exposed metadata", () => {
	const catalog = createToolCatalog(configuredTools as never, ["read"], {
		read: "Read file contents from the current workspace",
	});
	assert.equal(catalog.title, "Tools · 1/2 active");
	assert.deepEqual(
		catalog.items.map(({ id, statusText }) => ({ id, statusText })),
		[
			{ id: "deploy", statusText: "inactive" },
			{ id: "read", statusText: "active" },
		],
	);

	const deploy = catalog.items[0];
	assert.ok(deploy);
	assert.equal(deploy.description, "Deploy the current project.");
	assert.match(
		deploy.detailContent,
		/Source: deploy\.ts\nScope: user\nOrigin: package\nPath: \/home\/test/u,
	);
	assert.match(deploy.detailContent, /Parameter schema\n\{\n {2}"type": "object"/u);
	assert.match(
		deploy.detailContent,
		/Effective prompt snippet\nNone in the current system prompt\./u,
	);
	assert.match(deploy.detailContent, /Prompt guidelines\nNone/u);

	const read = catalog.items[1];
	assert.match(read?.detailContent ?? "", /"required": \[\n {4}"path"\n {2}\]/u);
	assert.match(
		read?.detailContent ?? "",
		/Effective prompt snippet\nRead file contents from the current workspace/u,
	);
	assert.match(read?.detailContent ?? "", /Prompt guidelines\n• Use read before editing/u);
});

test("TUI browser searches across exposed tool metadata", async () => {
	const mock = createMockPi({ allTools: [...configuredTools], activeTools: ["read"] });
	toolExtension(mock.pi);
	await mock.events.get("session_start")?.[0]?.({}, createMockContext({ hasUI: true }).ctx);
	const command = mock.commands.get("tool");
	assert.ok(command);
	const tui = createTuiHarness({ width: 100, rows: 24 });
	const base = createMockContext({
		hasUI: true,
		mode: "tui",
		getSystemPromptOptions: () => ({ cwd: "/home/test/project", toolSnippets: {} }),
	}).ctx as unknown as {
		ui: Record<string, unknown>;
		[key: string]: unknown;
	};
	const running = command.handler("", { ...base, ui: { ...base.ui, custom: tui.custom } });
	await tui.waitForOpen();
	for (const size of [
		{ width: 60, rows: 16 },
		{ width: 24, rows: 8 },
		{ width: 8, rows: 4 },
		{ width: 1, rows: 1 },
	]) {
		const lines = tui.resize(size);
		assert.ok(lines.length <= Math.max(1, size.rows - 3), `${size.width}x${size.rows}`);
		assert.ok(
			lines.every((line) => visibleWidth(line) <= size.width),
			`${size.width}x${size.rows}`,
		);
	}
	tui.resize({ width: 100, rows: 24 });
	tui.type("builtin temporary");
	const frame = stripVTControlCharacters(tui.render().join("\n"));
	assert.match(frame, /read.*\[active\]/u);
	assert.doesNotMatch(frame, /deploy/u);
	tui.press("ctrl+c");
	await running;
});

test("/tool supports RPC list and detail navigation", async () => {
	const mock = createMockPi({ allTools: [...configuredTools], activeTools: ["read"] });
	toolExtension(mock.pi);
	await mock.events.get("session_start")?.[0]?.({}, createMockContext({ hasUI: true }).ctx);
	const command = mock.commands.get("tool");
	assert.ok(command);
	const rpc = createRpcHarness([
		{ kind: "select", response: "read [active]" },
		{ kind: "select", response: "Next" },
		{ kind: "select", response: "Next" },
		{ kind: "select", response: "Next" },
		{ kind: "select", response: "Back" },
		{ kind: "select", response: "Close" },
	]);
	let promptOptionReads = 0;
	const base = createMockContext({
		hasUI: true,
		mode: "rpc",
		getSystemPromptOptions: () => {
			promptOptionReads += 1;
			return {
				cwd: "/home/test/project",
				selectedTools: ["read"],
				toolSnippets: { read: "Read file contents from the current workspace" },
			};
		},
	}).ctx as unknown as {
		ui: Record<string, unknown>;
		[key: string]: unknown;
	};
	await command.handler("", { ...base, ui: { ...base.ui, ...rpc.ui } });
	rpc.assertConsumed();
	const detailPages = rpc.dialogs
		.slice(1, 5)
		.map(({ title }) => title)
		.join("\n");
	assert.match(detailPages, /Parameter schema/u);
	assert.match(detailPages, /^ {2}"type": "object",$/mu);
	assert.match(detailPages, /^ {4}"path": \{$/mu);
	assert.match(detailPages, /Read file contents from the current workspace/u);
	assert.match(detailPages, /Use read before editing/u);
	assert.equal(promptOptionReads, 1);
});

test("/tool rejects arguments and noninteractive modes before opening the catalog", async () => {
	const mock = createMockPi({ allTools: [...configuredTools], activeTools: ["read"] });
	toolExtension(mock.pi);
	const command = mock.commands.get("tool");
	assert.ok(command);
	await assert.rejects(async () => {
		await command.handler("read", createMockContext({ hasUI: true, mode: "tui" }).ctx);
	}, /does not accept arguments/u);
	for (const mode of ["print", "json"] as const) {
		await assert.rejects(async () => {
			await command.handler("", createMockContext({ hasUI: false, mode }).ctx);
		}, /requires TUI or RPC mode/u);
	}
});

test("nested parameter schema indentation survives the TUI detail boundary", async () => {
	const mock = createMockPi({ allTools: [...configuredTools], activeTools: ["read"] });
	toolExtension(mock.pi);
	await mock.events.get("session_start")?.[0]?.({}, createMockContext({ hasUI: true }).ctx);
	const command = mock.commands.get("tool");
	assert.ok(command);
	const tui = createTuiHarness({ width: 100, rows: 24 });
	const base = createMockContext({
		hasUI: true,
		mode: "tui",
		getSystemPromptOptions: () => ({ cwd: "/home/test/project", toolSnippets: {} }),
	}).ctx as unknown as {
		ui: Record<string, unknown>;
		[key: string]: unknown;
	};
	const running = command.handler("", { ...base, ui: { ...base.ui, custom: tui.custom } });
	await tui.waitForOpen();
	tui.type("builtin temporary");
	tui.press("tui.select.confirm");
	await tui.waitForOpen();
	const frame = stripVTControlCharacters(tui.render().join("\n"));
	assert.match(frame, /^ {2}"type": "object",$/mu);
	assert.match(frame, /^ {4}"path": \{$/mu);
	const narrowFrame = tui.resize({ width: 20, rows: 24 });
	assert.ok(narrowFrame.every((line) => visibleWidth(line) <= 20));
	const narrowText = stripVTControlCharacters(narrowFrame.join("\n"));
	assert.match(narrowText, /^ {2}"type": "object",$/mu);
	tui.press("tui.select.pageDown");
	const scrolledNarrowFrame = tui.render();
	assert.ok(scrolledNarrowFrame.every((line) => visibleWidth(line) <= 20));
	assert.match(stripVTControlCharacters(scrolledNarrowFrame.join("\n")), /^ {4}"path": \{$/mu);
	tui.resize({ width: 100, rows: 24 });
	tui.press("tui.select.cancel");
	await tui.waitForOpen();
	assert.match(stripVTControlCharacters(tui.render().join("\n")), /Search: > builtin temporary/u);
	tui.press("ctrl+c");
	await running;
});

test("terminal controls are stripped by the browse display boundary", async () => {
	const unsafeTools = [
		{
			...configuredTools[0],
			name: "read\u001b]0;owned\u0007",
			description: "Read\u001b[31m file",
		},
	];
	const mock = createMockPi({ allTools: unsafeTools as never, activeTools: [] });
	toolExtension(mock.pi);
	await mock.events.get("session_start")?.[0]?.({}, createMockContext({ hasUI: true }).ctx);
	const command = mock.commands.get("tool");
	assert.ok(command);
	const tui = createTuiHarness({ width: 100, rows: 24 });
	const base = createMockContext({
		hasUI: true,
		mode: "tui",
		getSystemPromptOptions: () => ({ cwd: "/home/test/project", toolSnippets: {} }),
	}).ctx as unknown as {
		ui: Record<string, unknown>;
		[key: string]: unknown;
	};
	const running = command.handler("", { ...base, ui: { ...base.ui, custom: tui.custom } });
	await tui.waitForOpen();
	const frame = tui.render().join("\n");
	assert.equal(frame.includes("\u001b]0;owned"), false);
	assert.equal(frame.includes("\u0007"), false);
	tui.press("ctrl+c");
	await running;
});

test("session replacement aborts and disposes an open menu", async () => {
	const mock = createMockPi({ allTools: [...configuredTools], activeTools: ["read"] });
	toolExtension(mock.pi);
	const lifecycle = createMockContext({ hasUI: true, mode: "tui" }).ctx;
	await mock.events.get("session_start")?.[0]?.({}, lifecycle);
	const command = mock.commands.get("tool");
	assert.ok(command);
	const tui = createTuiHarness({ width: 100, rows: 24 });
	const base = createMockContext({
		hasUI: true,
		mode: "tui",
		getSystemPromptOptions: () => ({ cwd: "/home/test/project", toolSnippets: {} }),
	}).ctx as unknown as {
		ui: Record<string, unknown>;
		[key: string]: unknown;
	};
	const running = command.handler("", { ...base, ui: { ...base.ui, custom: tui.custom } });
	await tui.waitForOpen();
	await mock.events.get("session_start")?.[0]?.({}, lifecycle);
	await running;
	assert.equal(tui.isOpen, false);
	assert.equal((tui.result as { kind?: unknown } | undefined)?.kind, "stale");
});

test("session shutdown aborts and disposes an open menu", async () => {
	const mock = createMockPi({ allTools: [...configuredTools], activeTools: ["read"] });
	toolExtension(mock.pi);
	const lifecycle = createMockContext({ hasUI: true, mode: "tui" }).ctx;
	await mock.events.get("session_start")?.[0]?.({}, lifecycle);
	const command = mock.commands.get("tool");
	assert.ok(command);
	const tui = createTuiHarness({ width: 100, rows: 24 });
	const base = createMockContext({
		hasUI: true,
		mode: "tui",
		getSystemPromptOptions: () => ({ cwd: "/home/test/project", toolSnippets: {} }),
	}).ctx as unknown as {
		ui: Record<string, unknown>;
		[key: string]: unknown;
	};
	const running = command.handler("", { ...base, ui: { ...base.ui, custom: tui.custom } });
	await tui.waitForOpen();
	await mock.events.get("session_shutdown")?.[0]?.({}, lifecycle);
	await running;
	assert.equal(tui.isOpen, false);
	assert.equal((tui.result as { kind?: unknown } | undefined)?.kind, "stale");
});
