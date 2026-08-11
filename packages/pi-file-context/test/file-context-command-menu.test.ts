import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { registerFileQuoteExtension } from "../src/file-context.js";

async function withTempProject(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "pi-file-context-menu-command-test-"));
	try {
		await writeFile(join(root, "example.ts"), "export const example = true;\n");
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function waitForNextOpen(
	tui: ReturnType<typeof createTuiHarness>,
	previousCount: number,
): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (tui.openCount > previousCount && tui.isOpen) return;
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	throw new Error("Timed out waiting for the next File Context screen");
}

test("makes the no-argument command a menu and advertises compatibility routes", async () => {
	await withTempProject(async (root) => {
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "f8" } }),
		});
		const command = mock.commands.get("file-context");
		assert.ok(command?.getArgumentCompletions);
		assert.deepEqual(
			(command.getArgumentCompletions("") as Array<{ value: string }>).map(({ value }) => value),
			["browse", "remove"],
		);
		assert.deepEqual(
			(command.getArgumentCompletions("br") as Array<{ value: string }>).map(({ value }) => value),
			["browse"],
		);

		const tui = createTuiHarness({ width: 40, rows: 12 });
		const base = createMockContext({ mode: "tui", hasUI: true, cwd: root });
		const baseCtx = base.ctx as unknown as { ui: Record<string, unknown> } & Record<
			string,
			unknown
		>;
		const context = {
			...base,
			ctx: {
				...baseCtx,
				ui: { ...baseCtx.ui, custom: tui.custom },
			} as never,
		};
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		const running = Promise.resolve(command?.handler("", context.ctx));
		await tui.waitForOpen();
		const frame = tui.render().join("\n");
		assert.match(frame, /File Context/u);
		assert.match(frame, /Add file quote/u);
		assert.match(frame, /Remove pending quote \(0\)/u);
		tui.press("ctrl+c");
		await running;
	});
});

test("keeps browse and the configured shortcut as direct explorer paths", async () => {
	for (const route of ["browse", "shortcut"] as const) {
		await withTempProject(async (root) => {
			const mock = createMockPi();
			await registerFileQuoteExtension(mock.pi, {
				loadSettings: async () => ({ settings: { openShortcut: "f8" } }),
			});
			const pasted: string[] = [];
			const context = createMockContext({
				mode: "tui",
				hasUI: true,
				cwd: root,
				ui: {
					theme: { fg: (_color: string, text: string) => text },
					notify() {},
					setWidget() {},
					async custom() {
						return { kind: "reference", path: "example.ts" };
					},
					pasteToEditor(value: string) {
						pasted.push(value);
					},
				},
			});
			await mock.events.get("session_start")?.[0]?.({}, context.ctx);
			if (route === "browse") {
				await mock.commands.get("file-context")?.handler("browse", context.ctx);
			} else {
				await mock.shortcuts.get("f8")?.handler(context.ctx);
			}
			assert.deepEqual(pasted, ["@example.ts "]);
		});
	}
});

test("reports project scanning failures and returns to a retryable menu", async () => {
	await withTempProject(async (root) => {
		const mock = createMockPi();
		let rejectScan: ((error: Error) => void) | undefined;
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "f8" } }),
			discoverFiles: async () =>
				new Promise<string[]>((_resolve, reject) => {
					rejectScan = reject;
				}),
		});
		const tui = createTuiHarness({ width: 40, rows: 12 });
		const base = createMockContext({ mode: "tui", hasUI: true, cwd: root });
		const baseCtx = base.ctx as unknown as { ui: Record<string, unknown> } & Record<
			string,
			unknown
		>;
		const ctx = {
			...baseCtx,
			ui: { ...baseCtx.ui, custom: tui.custom },
		} as never;
		await mock.events.get("session_start")?.[0]?.({}, ctx);
		const running = Promise.resolve(mock.commands.get("file-context")?.handler("", ctx));
		await tui.waitForOpen();
		const menuOpenCount = tui.openCount;
		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await waitForNextOpen(tui, menuOpenCount);
		const scanOpenCount = tui.openCount;
		rejectScan?.(new Error("scan \u001b[31mfailed"));
		await waitForNextOpen(tui, scanOpenCount);
		assert.match(tui.render().join("\n"), /Add file quote/u);
		assert.ok(!(base.notifications.at(-1)?.message ?? "").includes("\u001b"));
		assert.match(base.notifications.at(-1)?.message ?? "", /could not scan.*retry/iu);
		tui.press("ctrl+c");
		await running;
	});
});

test("shows cancellable project scanning before Add and returns to the menu on cancellation", async () => {
	await withTempProject(async (root) => {
		const mock = createMockPi();
		let scanSignal: AbortSignal | undefined;
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "f8" } }),
			discoverFiles: async (_root, { signal } = {}) => {
				scanSignal = signal;
				return new Promise<string[]>((_resolve, reject) => {
					signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
				});
			},
		});
		const tui = createTuiHarness({ width: 40, rows: 12 });
		const base = createMockContext({ mode: "tui", hasUI: true, cwd: root });
		const baseCtx = base.ctx as unknown as { ui: Record<string, unknown> } & Record<
			string,
			unknown
		>;
		const ctx = {
			...baseCtx,
			ui: { ...baseCtx.ui, custom: tui.custom },
		} as never;
		await mock.events.get("session_start")?.[0]?.({}, ctx);
		const running = Promise.resolve(mock.commands.get("file-context")?.handler("", ctx));
		await tui.waitForOpen();
		const menuOpenCount = tui.openCount;
		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await waitForNextOpen(tui, menuOpenCount);
		assert.match(tui.render().join("\n"), /Scanning project files/u);
		const scanOpenCount = tui.openCount;
		tui.press("tui.select.cancel");
		await waitForNextOpen(tui, scanOpenCount);
		assert.equal(scanSignal?.aborted, true);
		assert.match(tui.render().join("\n"), /Add file quote/u);
		tui.press("ctrl+c");
		await running;
	});
});
