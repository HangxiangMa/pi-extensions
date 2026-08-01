import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { createMockContext, createMockPi } from "../../../test/support.js";
import piStarshipRuntime from "../src/pi-starship.js";

function piStarship(pi: Parameters<typeof piStarshipRuntime>[0]) {
	return piStarshipRuntime(pi, {
		githubPrExec: (command, args, options) =>
			pi.exec(command, args, {
				cwd: options.cwd,
				signal: options.signal,
				timeout: options.timeout,
			}),
	});
}

test("session replacement disposes an open settings preview before returning", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-stale-preview-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = root;
	try {
		const mock = createMockPi();
		(mock.rawPi as typeof mock.rawPi & { exec: () => Promise<ExecResult> }).exec = async () =>
			gitResult();
		piStarship(mock.pi);
		const tui = createTuiHarness({ width: 40, rows: 12 });
		const oldContext = createMockContext({
			mode: "tui",
			custom: tui.custom,
			editor: async () => "format = 'draft'\n",
		});
		const newContext = createMockContext({ mode: "tui", cwd: "/work/replacement" });
		await emit(mock.events, "session_start", {}, oldContext.ctx);
		let settled = false;
		const command = Promise.resolve(
			mock.commands.get("starship")?.handler("settings", oldContext.ctx),
		);
		void command.then(() => {
			settled = true;
		});
		await tui.waitForOpen();
		await emit(mock.events, "session_start", {}, newContext.ctx);
		await flushAsync();
		try {
			assert.equal(settled, true);
			assert.equal(tui.isOpen, false);
		} finally {
			if (!settled) tui.dispose();
			await command;
		}
		assert.equal(existsSync(join(root, "pi-starship.toml")), false);
		await emit(mock.events, "session_shutdown", {}, newContext.ctx);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("session shutdown disposes an open settings preview before returning", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-shutdown-preview-"));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = root;
	try {
		const mock = createMockPi();
		(mock.rawPi as typeof mock.rawPi & { exec: () => Promise<ExecResult> }).exec = async () =>
			gitResult();
		piStarship(mock.pi);
		const tui = createTuiHarness({ width: 40, rows: 12 });
		const context = createMockContext({
			mode: "tui",
			custom: tui.custom,
			editor: async () => "format = 'draft'\n",
		});
		await emit(mock.events, "session_start", {}, context.ctx);
		let settled = false;
		const command = Promise.resolve(
			mock.commands.get("starship")?.handler("settings", context.ctx),
		);
		void command.then(() => {
			settled = true;
		});
		await tui.waitForOpen();
		await emit(mock.events, "session_shutdown", {}, context.ctx);
		await flushAsync();
		try {
			assert.equal(settled, true);
			assert.equal(tui.isOpen, false);
		} finally {
			if (!settled) tui.dispose();
			await command;
		}
		assert.equal(existsSync(join(root, "pi-starship.toml")), false);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

async function emit(
	events: ReadonlyMap<string, Array<(...args: unknown[]) => unknown>>,
	name: string,
	...args: unknown[]
) {
	for (const handler of events.get(name) ?? []) await handler(...args);
}

type ExecResult = { stdout: string; stderr: string; code: number; killed: boolean };

function gitResult(stdout = "## main\n"): ExecResult {
	return { stdout, stderr: "", code: 0, killed: false };
}

async function flushAsync() {
	await Promise.resolve();
	await new Promise<void>((resolve) => setImmediate(resolve));
	await Promise.resolve();
}
