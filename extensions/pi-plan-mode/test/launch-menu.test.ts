import assert from "node:assert/strict";
import test from "node:test";
import { createRpcHarness, createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import {
	builtinTool,
	createMockContext,
	createMockPi,
	extensionTool,
} from "../../../test/support.js";
import planMode from "../src/plan-mode.js";

const REQUIRED_PLAN_TOOLS = ["plan_mode_question", "plan_mode_complete"];

async function settleWithin<T>(promise: Promise<T>, label: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 2_000);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function waitForOpenCount(
	tui: ReturnType<typeof createTuiHarness>,
	count: number,
	running?: Promise<unknown>,
) {
	for (let turn = 0; tui.openCount < count && turn < 100; turn += 1) {
		if (running) {
			const settled = await Promise.race([
				running.then(() => true),
				new Promise<false>((resolve) => setImmediate(() => resolve(false))),
			]);
			if (settled) break;
		} else await new Promise<void>((resolve) => setImmediate(resolve));
	}
	assert.equal(tui.openCount, count, "expected the launch menu to remain interactive");
}

function launchFixture() {
	const mock = createMockPi({
		activeTools: ["read", "write"],
		allTools: [builtinTool("read"), builtinTool("write"), extensionTool("custom")],
	});
	planMode(mock.pi);
	return mock;
}

test("inactive bare /plan opens a TUI launch menu without changing Plan state", async () => {
	const mock = launchFixture();
	const tui = createTuiHarness({ width: 42, rows: 18 });
	const context = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });

	const running = mock.commands.get("plan")?.handler("", context.ctx) as Promise<unknown>;
	await waitForOpenCount(tui, 1, running);
	const frame = tui.render();
	assert.match(frame.join("\n"), /Plan mode/);
	assert.match(frame.join("\n"), /Status: Off/i);
	assert.match(frame.join("\n"), /Start Plan mode/);
	assert.ok(frame.every((line) => line.length <= 42));
	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "write"]);
	assert.equal(mock.entries.length, 0);

	tui.press("tui.select.cancel");
	await running;
	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "write"]);
	assert.equal(mock.entries.length, 0);
	assert.equal(mock.sentUserMessages.length, 0);
});

test("the launch menu starts Plan mode only after explicit confirmation", async () => {
	const mock = launchFixture();
	const tui = createTuiHarness();
	const context = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });

	const running = mock.commands.get("plan")?.handler("", context.ctx) as Promise<unknown>;
	await waitForOpenCount(tui, 1, running);
	tui.press("tui.select.confirm");
	await running;

	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", ...REQUIRED_PLAN_TOOLS]);
	assert.equal(mock.sentUserMessages.length, 0);
	assert.equal(context.statuses.get("plan-mode"), "plan active");
});

test("launch tool choices remain draft-only until Done starts Plan mode", async () => {
	const mock = launchFixture();
	const tui = createTuiHarness();
	const context = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });

	const running = mock.commands.get("plan")?.handler("", context.ctx) as Promise<unknown>;
	await waitForOpenCount(tui, 1, running);
	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await waitForOpenCount(tui, 2);
	assert.match(tui.render().join("\n"), /Choose Plan-mode tools/);
	assert.equal(tui.isFocusable, true);
	tui.setFocused(true);
	assert.equal(tui.focused, true);

	// read is selected, write is unavailable, custom is opt-in, then the pinned Done action.
	tui.press("tui.select.down");
	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await settleWithin(tui.waitForPending(), "the staged tool toggle");
	await waitForOpenCount(tui, 3, running);
	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "write"]);
	assert.equal(mock.entries.length, 0);
	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await settleWithin(running, "launch menu completion");

	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "custom", ...REQUIRED_PLAN_TOOLS]);
	assert.equal(mock.sentUserMessages.length, 0);
});

test("launch tool drafts and help navigation cancel without side effects", async () => {
	const mock = launchFixture();
	const tui = createTuiHarness();
	const context = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });

	const running = mock.commands.get("plan")?.handler("", context.ctx) as Promise<unknown>;
	await waitForOpenCount(tui, 1, running);
	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await waitForOpenCount(tui, 2);
	tui.press("tui.select.down");
	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await settleWithin(tui.waitForPending(), "the cancelled staged tool toggle");
	await waitForOpenCount(tui, 3, running);
	tui.press("tui.select.cancel");
	await waitForOpenCount(tui, 4, running);
	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "write"]);
	assert.equal(mock.entries.length, 0);

	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await waitForOpenCount(tui, 5, running);
	assert.match(tui.render().join("\n"), /read-only exploration/i);
	tui.press("tui.select.cancel");
	await waitForOpenCount(tui, 6, running);
	tui.press("tui.select.cancel");
	await running;

	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "write"]);
	assert.equal(mock.entries.length, 0);
	assert.equal(mock.thinkingLevels.length, 0);
	assert.equal(mock.sentUserMessages.length, 0);
});

test("inactive bare /plan adapts the launch menu to RPC", async () => {
	const mock = launchFixture();
	const rpc = createRpcHarness([{ kind: "select", response: "Start Plan mode" }]);
	const context = createMockContext({
		mode: "rpc",
		hasUI: true,
		select: rpc.ui.select,
		input: rpc.ui.input,
		custom: rpc.ui.custom,
	});

	await mock.commands.get("plan")?.handler("", context.ctx);
	rpc.assertConsumed();
	assert.equal(
		rpc.dialogs[0]?.title,
		"Plan mode\nStatus: Off — normal tools are active.\nWhen started: read, plan_mode_question, plan_mode_complete",
	);
	assert.deepEqual(rpc.dialogs[0]?.options, [
		"Start Plan mode",
		"Choose tools, then start…",
		"How Plan mode works",
	]);
	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", ...REQUIRED_PLAN_TOOLS]);
	assert.equal(mock.sentUserMessages.length, 0);
});

test("RPC stages tool changes until the explicit start action", async () => {
	const mock = launchFixture();
	const rpc = createRpcHarness([
		{ kind: "select", response: "Choose tools, then start…" },
		{ kind: "select", response: "[ ] custom" },
		{ kind: "select", response: "Done — start Plan mode" },
	]);
	const context = createMockContext({
		mode: "rpc",
		hasUI: true,
		select: rpc.ui.select,
		input: rpc.ui.input,
		custom: rpc.ui.custom,
	});

	await mock.commands.get("plan")?.handler("", context.ctx);
	rpc.assertConsumed();
	assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "custom", ...REQUIRED_PLAN_TOOLS]);
	assert.equal(mock.sentUserMessages.length, 0);
});

test("Ctrl+C and external disposal discard the inactive launch interaction", async () => {
	for (const ending of ["ctrl-c", "dispose"] as const) {
		const mock = launchFixture();
		const tui = createTuiHarness();
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: tui.custom,
		});
		const running = mock.commands.get("plan")?.handler("", context.ctx) as Promise<unknown>;
		await waitForOpenCount(tui, 1, running);
		if (ending === "ctrl-c") tui.press("ctrl+c");
		else tui.dispose();
		await settleWithin(running, `${ending} launch cancellation`);

		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "write"]);
		assert.equal(mock.entries.length, 0);
		assert.equal(mock.thinkingLevels.length, 0);
		assert.equal(mock.sentUserMessages.length, 0);
	}
});

test("session replacement and shutdown discard staged launch tools", async () => {
	for (const ending of ["replacement", "shutdown"] as const) {
		const mock = launchFixture();
		const tui = createTuiHarness();
		const context = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });
		const running = mock.commands.get("plan")?.handler("", context.ctx) as Promise<unknown>;
		await waitForOpenCount(tui, 1, running);
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await waitForOpenCount(tui, 2, running);
		tui.press("tui.select.down");
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await settleWithin(tui.waitForPending(), "the lifecycle draft toggle");
		await waitForOpenCount(tui, 3, running);

		if (ending === "replacement") {
			await mock.events.get("session_start")?.[0]?.({ reason: "resume" }, context.ctx);
		} else await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);
		await settleWithin(running, `${ending} launch cancellation`);

		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "write"]);
		assert.equal(mock.thinkingLevels.length, 0);
		assert.equal(mock.sentUserMessages.length, 0);
		const latest = mock.entries.at(-1)?.data as { selectedToolNames?: string[] } | undefined;
		assert.equal(latest?.selectedToolNames, undefined);
	}
});

test("/plan start is deterministic and bare /plan rejects non-interactive modes", async () => {
	for (const mode of ["print", "json"] as const) {
		const rejected = launchFixture();
		const rejectedContext = createMockContext({ mode, hasUI: false });
		await assert.rejects(
			rejected.commands.get("plan")?.handler("", rejectedContext.ctx) as Promise<unknown>,
			/\/plan start.*\/plan <prompt>/i,
		);
		assert.deepEqual(rejected.rawPi.getActiveTools(), ["read", "write"]);
		assert.equal(rejected.entries.length, 0);

		const started = launchFixture();
		const startedContext = createMockContext({ mode, hasUI: false });
		await started.commands.get("plan")?.handler("start", startedContext.ctx);
		assert.deepEqual(started.rawPi.getActiveTools(), ["read", ...REQUIRED_PLAN_TOOLS]);
		assert.equal(started.sentUserMessages.length, 0);
	}
});

test("start is completed while longer start text remains an inline prompt", async () => {
	const mock = launchFixture();
	const context = createMockContext({ mode: "tui", hasUI: true });
	const completions = mock.commands.get("plan")?.getArgumentCompletions?.("") as
		| Array<{ value: string }>
		| undefined;
	assert.ok(completions?.some((item) => item.value === "start"));

	await mock.commands.get("plan")?.handler("start a migration", context.ctx);
	assert.equal(mock.sentUserMessages.at(-1)?.text, "start a migration");
});
