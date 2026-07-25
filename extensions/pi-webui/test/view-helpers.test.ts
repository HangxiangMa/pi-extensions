import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const helpers = (await import(
	`${pathToFileURL(path.join(process.cwd(), "extensions/pi-webui/src/web/ui/view-helpers.js")).href}?t=${Date.now()}`
)) as {
	withStableKeys<T>(values: T[]): Array<{ key: string; value: T }>;
};

test("transcript keys survive streaming content updates", () => {
	const initial = helpers.withStableKeys([
		{ type: "thinking", text: "Working" },
		{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "a" } },
	]);
	const updated = helpers.withStableKeys([
		{ type: "thinking", text: "Working through the result" },
		{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "b" } },
	]);

	assert.deepEqual(
		updated.map(({ key }) => key),
		initial.map(({ key }) => key),
	);
});
