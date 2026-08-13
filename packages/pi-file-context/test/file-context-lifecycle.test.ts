import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import { registerFileQuoteExtension } from "../src/file-context.js";

test("disposes and settles an active explorer on session replacement", async () => {
	await assertExplorerLifecycleCancellation("session_start");
});

test("disposes and settles an active explorer on session shutdown", async () => {
	await assertExplorerLifecycleCancellation("session_shutdown");
});

async function assertExplorerLifecycleCancellation(
	event: "session_start" | "session_shutdown",
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "pi-file-context-lifecycle-test-"));
	try {
		await writeFile(join(root, "example.txt"), "needle\n");
		const mock = createMockPi();
		await registerFileQuoteExtension(mock.pi, {
			loadSettings: async () => ({ settings: { openShortcut: "ctrl+alt+f" } }),
		});
		let markReady!: () => void;
		const ready = new Promise<void>((resolve) => {
			markReady = resolve;
		});
		let disposed = false;
		let customCalls = 0;
		const oldManager = { getSessionId: () => "old" };
		const newManager = { getSessionId: () => "new" };
		const makeContext = (sessionManager: object, custom?: (factory: unknown) => Promise<unknown>) =>
			createMockContext({
				mode: "tui",
				hasUI: true,
				cwd: root,
				sessionManager,
				ui: {
					theme: { fg: (_color: string, text: string) => text },
					notify() {},
					setWidget() {},
					setEditorComponent() {},
					getEditorComponent: () => undefined,
					custom: custom ?? (async () => undefined),
					pasteToEditor() {},
				},
			});
		const oldContext = makeContext(oldManager, async (factory) => {
			customCalls += 1;
			if (customCalls === 1) {
				return createCustomSelectorHarness(factory).resultPromise;
			}
			return new Promise((resolve) => {
				const component = (
					factory as (...args: unknown[]) => {
						dispose(): void;
					}
				)(
					{ terminal: { rows: 18 }, requestRender() {} },
					{
						fg: (_color: string, text: string) => text,
						bg: (_color: string, text: string) => text,
						bold: (text: string) => text,
					},
					{ matches: () => false },
					resolve,
				);
				const dispose = component.dispose.bind(component);
				component.dispose = () => {
					disposed = true;
					dispose();
				};
				markReady();
			});
		});
		const newContext = makeContext(newManager);
		await mock.events.get("session_start")?.[0]?.({}, oldContext.ctx);
		let settled = false;
		const command = Promise.resolve(
			mock.commands.get("file-context")?.handler("browse", oldContext.ctx),
		).then(() => {
			settled = true;
		});
		await ready;

		if (event === "session_start") {
			await mock.events.get(event)?.[0]?.({}, newContext.ctx);
		} else {
			await mock.events.get(event)?.[0]?.({}, oldContext.ctx);
		}
		await new Promise<void>((resolve) => setImmediate(resolve));

		assert.equal(disposed, true);
		assert.equal(settled, true);
		await command;
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
