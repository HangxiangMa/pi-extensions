import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { RecallMessageRecord } from "../src/messages.js";
import { ScopedRecallPicker } from "../src/picker.js";

function saved(id: string, sessionId: string, cwd: string, text: string): RecallMessageRecord {
	return {
		type: "recall_message",
		version: 1,
		id,
		savedAt: "2026-08-04T12:00:00.000Z",
		source: {
			sessionId,
			entryId: `entry-${id}`,
			sessionName: `Session ${sessionId}`,
			cwd,
			messageTimestamp: Date.parse("2026-08-04T11:00:00.000Z"),
		},
		role: id === "one" ? "user" : "assistant",
		text,
	};
}

function createPicker(records: RecallMessageRecord[]) {
	let result: unknown;
	let renders = 0;
	const picker = new ScopedRecallPicker({
		tui: { terminal: { rows: 12 }, requestRender: () => renders++ } as never,
		theme: {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
		} as never,
		keybindings: {
			matches(data: string, key: string) {
				return (
					(data === "up" && key === "tui.select.up") ||
					(data === "down" && key === "tui.select.down") ||
					(data === "enter" && key === "tui.select.confirm") ||
					(data === "escape" && key === "tui.select.cancel")
				);
			},
			getKeys: () => [],
		} as never,
		records,
		current: { sessionId: "current", cwd: "/work/project" },
		initialScope: "cwd",
		complete: (value) => {
			result = value;
		},
	});
	return { picker, result: () => result, renders: () => renders };
}

test("defaults to Current cwd and cycles scope forward and backward with visible counts", () => {
	const { picker, renders } = createPicker([
		saved("one", "current", "/work/project", "one"),
		saved("two", "other", "/work/project", "two"),
		saved("three", "elsewhere", "/other", "three"),
	]);
	assert.match(picker.render(80).join("\n"), /Scope: Current cwd \(2\).*Tab change scope/);
	picker.handleInput("\t");
	assert.match(picker.render(80).join("\n"), /Scope: All \(3\)/);
	picker.handleInput("\t");
	assert.match(picker.render(80).join("\n"), /Scope: Current session \(1\)/);
	picker.handleInput("\u001b[Z");
	assert.match(picker.render(80).join("\n"), /Scope: All \(3\)/);
	assert.equal(renders(), 3);
});

test("preserves a selected saved id across scope changes when still visible", () => {
	const { picker, result } = createPicker([
		saved("one", "current", "/work/project", "one"),
		saved("two", "other", "/work/project", "two"),
		saved("three", "elsewhere", "/other", "three"),
	]);
	picker.handleInput("down");
	picker.handleInput("\t");
	picker.handleInput("enter");
	assert.deepEqual(result(), {
		kind: "selected",
		recordId: "one",
		scope: "all",
	});
});

test("falls back to the first newest record when selection leaves the scope", () => {
	const { picker, result } = createPicker([
		saved("one", "current", "/work/project", "one"),
		saved("two", "other", "/work/project", "two"),
		saved("three", "elsewhere", "/other", "three"),
	]);
	picker.handleInput("\t");
	picker.handleInput("\t");
	picker.handleInput("enter");
	assert.deepEqual(result(), {
		kind: "selected",
		recordId: "one",
		scope: "session",
	});
});

test("escape returns to the menu while ctrl+c closes the whole Recall flow", () => {
	const records = [saved("one", "current", "/work/project", "one")];
	const back = createPicker(records);
	back.picker.handleInput("escape");
	assert.deepEqual(back.result(), { kind: "back", scope: "cwd", selectedId: "one" });
	const close = createPicker(records);
	close.picker.handleInput("\u0003");
	assert.deepEqual(close.result(), { kind: "close", scope: "cwd", selectedId: "one" });
});

test("empty scopes remain switchable and rendered output is sanitized and width-safe", () => {
	const { picker } = createPicker([
		saved("unsafe", "other", "/other", "unsafe\u001b]8;;https://bad\u0007link\u001b[31m"),
	]);
	const empty = picker.render(24);
	assert.match(empty.join("\n"), /No saved messages/);
	picker.handleInput("\t");
	const all = picker.render(24);
	assert.ok(all.every((line) => visibleWidth(line) <= 24));
	const rendered = all.join("\n");
	assert.equal(rendered.includes("\u001b]"), false);
	assert.equal(rendered.includes("\u001b[31m"), false);
	assert.equal(rendered.includes("https://bad"), false);
	picker.dispose();
	picker.handleInput("\t");
	assert.match(picker.render(24).join("\n"), /Scope: All \(1\)/);
});
