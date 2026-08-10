import assert from "node:assert/strict";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { resolveMenuScreen } from "@narumitw/pi-tui-kit";
import { createRpcHarness, createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import toolExtension from "../src/index.js";
import { createToolCatalog, createToolMenu } from "../src/tool-catalog.js";

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
	assert.deepEqual(deploy.details?.slice(0, 5), [
		"Source: deploy.ts",
		"Scope: user",
		"Origin: package",
		"Path: /home/test/.pi/extensions/deploy.ts",
		"Base directory: /home/test/.pi/extensions",
	]);
	assert.match(deploy.details?.join("\n") ?? "", /Parameter schema\n\{\n {2}"type": "object"/u);
	assert.match(
		deploy.details?.join("\n") ?? "",
		/Effective prompt snippet\nNone in the current system prompt\./u,
	);
	assert.match(deploy.details?.join("\n") ?? "", /Prompt guidelines\nNone/u);

	const read = catalog.items[1];
	assert.match(read?.details?.join("\n") ?? "", /"required": \[\n {4}"path"\n {2}\]/u);
	assert.match(
		read?.details?.join("\n") ?? "",
		/Effective prompt snippet\nRead file contents from the current workspace/u,
	);
	assert.match(read?.details?.join("\n") ?? "", /Prompt guidelines\n• Use read before editing/u);
});

test("browse menu exposes searchable list-to-detail progressive disclosure", () => {
	const menu = createToolMenu();
	const screen = resolveMenuScreen(menu, "tools", {
		tools: configuredTools as never,
		activeToolNames: ["read"],
		toolSnippets: { read: "Read file contents from the current workspace" },
	});
	assert.equal(screen.kind, "browse");
	if (screen.kind !== "browse") return;
	assert.equal(screen.viewportSize, "adaptive");
	assert.equal(screen.hint, "close");
	assert.match(
		screen.items.find(({ id }) => id === "read")?.searchText ?? "",
		/builtin temporary/u,
	);
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

test("terminal controls are stripped by the browse display boundary", async () => {
	const unsafeTools = [
		{
			...configuredTools[0],
			name: "read\u001b]0;owned\u0007",
			description: "Read\u001b[31m file",
		},
	];
	const menu = createToolMenu();
	const tui = createTuiHarness({ width: 100, rows: 24 });
	const base = createMockContext({ hasUI: true, mode: "tui" }).ctx as unknown as {
		ui: Record<string, unknown>;
		[key: string]: unknown;
	};
	const { runMenu } = await import("@narumitw/pi-tui-kit");
	const running = runMenu({ ...base, ui: { ...base.ui, custom: tui.custom } } as never, menu, {
		getState: () => ({ tools: unsafeTools as never, activeToolNames: [], toolSnippets: {} }),
		isCurrent: () => true,
	});
	await tui.waitForOpen();
	const frame = tui.render().join("\n");
	assert.equal(frame.includes("\u001b]0;owned"), false);
	assert.equal(frame.includes("\u0007"), false);
	tui.press("ctrl+c");
	await running;
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
	assert.equal((tui.result as { kind?: unknown } | undefined)?.kind, "close");
});
