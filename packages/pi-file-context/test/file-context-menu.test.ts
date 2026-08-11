import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { test } from "vitest";
import { createMockContext } from "../../../test/support.js";
import {
	type FileContextMenuOptions,
	type FileContextMenuState,
	showFileContextMenu,
} from "../src/file-context-menu.js";

function quote(
	id: string,
	overrides: Partial<FileContextMenuState["quotes"][number]> = {},
): FileContextMenuState["quotes"][number] {
	return {
		id,
		path: "src/example.ts",
		startLine: 1,
		endLine: 1,
		text: "const example = true;",
		...overrides,
	};
}

function state(
	quotes: FileContextMenuState["quotes"] = [],
	overrides: Partial<FileContextMenuState> = {},
): FileContextMenuState {
	return {
		quotes,
		shortcut: "f8",
		maximumQuotes: 8,
		maximumBytes: 100_000,
		totalBytes: quotes.reduce((total, item) => total + Buffer.byteLength(item.text), 0),
		...overrides,
	};
}

function menuContext(width = 80, rows = 24) {
	const tui = createTuiHarness({ width, rows });
	const base = createMockContext({ mode: "tui", hasUI: true });
	const baseCtx = base.ctx as unknown as { ui: Record<string, unknown> } & Record<string, unknown>;
	return {
		tui,
		notifications: base.notifications,
		ctx: {
			...baseCtx,
			ui: { ...baseCtx.ui, custom: tui.custom },
		} as never,
	};
}

function options(
	getState: () => FileContextMenuState,
	overrides: Partial<FileContextMenuOptions> = {},
): FileContextMenuOptions {
	return {
		getState,
		isCurrent: () => true,
		signal: new AbortController().signal,
		addQuote: async () => "close" as const,
		removeQuote: () => ({ kind: "missing" }),
		...overrides,
	};
}

test("shows the primary menu immediately with visible state and disabled reasons", async () => {
	const { tui, ctx } = menuContext(20, 6);
	let removeCalls = 0;
	const running = showFileContextMenu(
		ctx,
		options(() => state(), {
			removeQuote: () => {
				removeCalls += 1;
				return { kind: "missing" };
			},
		}),
	);
	await tui.waitForOpen();

	for (const size of [
		{ width: 20, rows: 6 },
		{ width: 40, rows: 12 },
		{ width: 80, rows: 24 },
	]) {
		const frame = tui.resize(size);
		assert.ok(frame.length > 0);
		assert.ok(frame.every((line) => visibleWidth(line) <= size.width));
	}
	const initial = tui.render().join("\n");
	assert.match(initial, /File Context/u);
	assert.match(initial, /Pending quotes: 0\/8/u);
	assert.match(initial, /Shortcut: F8/u);
	assert.match(initial, /Add file quote/u);

	tui.press("tui.select.down");
	const disabled = tui.render().join("\n");
	assert.match(disabled, /\[-\].*Remove pending quote \(0\)/u);
	assert.match(disabled, /No pending quotes to remove/u);
	tui.press("tui.select.confirm");
	await tui.waitForPending();
	assert.equal(removeCalls, 0);
	assert.equal(tui.isOpen, true);

	tui.press("ctrl+c");
	assert.deepEqual(await running, { kind: "closed", reason: "close" });
});

test("closes the menu before handing off to Add", async () => {
	const { tui, ctx } = menuContext();
	let menuWasOpenDuringAdd = true;
	const running = showFileContextMenu(
		ctx,
		options(() => state(), {
			addQuote: async () => {
				menuWasOpenDuringAdd = tui.isOpen;
				return "close" as const;
			},
		}),
	);
	await tui.waitForOpen();
	tui.press("tui.select.confirm");
	await running;
	assert.equal(menuWasOpenDuringAdd, false);
});

test("opens Help from the menu and Escape returns without side effects", async () => {
	const { tui, ctx } = menuContext();
	let addCalls = 0;
	const running = showFileContextMenu(
		ctx,
		options(() => state(), {
			addQuote: async () => {
				addCalls += 1;
				return "close" as const;
			},
		}),
	);
	await tui.waitForOpen();
	tui.press("tui.select.down");
	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await tui.waitForOpen();
	assert.match(tui.render().join("\n"), /Pending quotes are attached.*next prompt/u);
	tui.press("tui.select.cancel");
	await tui.waitForOpen();
	assert.match(tui.render().join("\n"), /Add file quote/u);
	assert.equal(addCalls, 0);
	tui.press("ctrl+c");
	await running;
});

test("previews and repeatedly removes exact duplicate-looking quotes by stable ID", async () => {
	const { tui, ctx, notifications } = menuContext(40, 12);
	let current = state([
		quote("quote-1", { text: "first snapshot\nwith details" }),
		quote("quote-2", { text: "second snapshot\nwith details" }),
	]);
	const removedIds: string[] = [];
	const running = showFileContextMenu(
		ctx,
		options(() => current, {
			removeQuote: (id) => {
				const selected = current.quotes.find((item) => item.id === id);
				if (!selected) return { kind: "missing" };
				removedIds.push(id);
				current = state(current.quotes.filter((item) => item.id !== id));
				return { kind: "removed", quote: selected, remaining: current.quotes.length };
			},
		}),
	);
	await tui.waitForOpen();
	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await tui.waitForOpen();
	const firstChoice = tui.render().join("\n");
	assert.match(firstChoice, /src\/example\.ts/u);
	assert.match(firstChoice, /Lines: 1-1/u);
	assert.match(firstChoice, /first snapshot.*with details/u);

	tui.press("tui.select.confirm");
	await tui.waitForPending();
	await tui.waitForOpen();
	assert.match(tui.render().join("\n"), /second snapshot.*with details/u);
	tui.press("tui.select.confirm");
	await tui.waitForPending();
	await tui.waitForOpen();

	assert.deepEqual(removedIds, ["quote-1", "quote-2"]);
	assert.match(tui.render().join("\n"), /Pending quotes: 0\/8/u);
	assert.equal(
		notifications.filter(({ message }) => /Removed pending quote/u.test(message)).length,
		2,
	);
	tui.press("ctrl+c");
	await running;
});

test("sanitizes untrusted quote text and keeps cancellation side-effect free", async () => {
	const { tui, ctx } = menuContext(32, 12);
	const unsafe = quote("quote-unsafe", {
		path: "src/unsafe\u001b[31m.ts",
		text: "first\u0000 line\nsecond",
	});
	let removeCalls = 0;
	const running = showFileContextMenu(
		ctx,
		options(() => state([unsafe]), {
			removeQuote: () => {
				removeCalls += 1;
				return { kind: "missing" };
			},
		}),
	);
	await tui.waitForOpen();
	tui.press("tui.select.down");
	tui.press("tui.select.confirm");
	await tui.waitForOpen();
	const frame = tui.render();
	assert.ok(frame.every((line) => visibleWidth(line) <= 32));
	assert.ok(frame.every((line) => !line.includes("\u001b[31m") && !line.includes("\u0000")));
	tui.press("tui.select.cancel");
	await tui.waitForOpen();
	assert.equal(removeCalls, 0);
	tui.press("ctrl+c");
	await running;
});

test("disables Add at either hard pending limit", async () => {
	for (const limited of [
		state(Array.from({ length: 8 }, (_, index) => quote(`quote-${index}`))),
		state([quote("quote-bytes")], { totalBytes: 100_000 }),
	]) {
		const { tui, ctx } = menuContext();
		let addCalls = 0;
		const running = showFileContextMenu(
			ctx,
			options(() => limited, {
				addQuote: async () => {
					addCalls += 1;
					return "close" as const;
				},
			}),
		);
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /\[-\].*Add file quote/u);
		tui.press("tui.select.confirm");
		await tui.waitForPending();
		assert.equal(addCalls, 0);
		tui.press("ctrl+c");
		await running;
	}
});
