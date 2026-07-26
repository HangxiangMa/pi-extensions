import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { decodeSnapshot } from "../src/snapshot-codec.js";
import { snapshot } from "./helpers.js";

test("snapshot decoding bounds decompressed output and honors cancellation", async () => {
	const encoded = gzipSync(
		Buffer.from(
			JSON.stringify(snapshot([{ path: "settings.json", content: Buffer.from("x".repeat(4096)) }])),
		),
	);
	await assert.rejects(
		decodeSnapshot(encoded, { maxOutputLength: 1024 }),
		/maxOutputLength|larger than|buffer|exceeds/i,
	);

	const controller = new AbortController();
	controller.abort(new DOMException("cancelled", "AbortError"));
	await assert.rejects(
		decodeSnapshot(encoded, { signal: controller.signal }),
		(error: unknown) => error instanceof Error && error.name === "AbortError",
	);

	const activeController = new AbortController();
	const expanding = decodeSnapshot(gzipSync(Buffer.alloc(16 * 1024 * 1024)), {
		signal: activeController.signal,
	});
	activeController.abort(new DOMException("disposed", "AbortError"));
	await assert.rejects(
		expanding,
		(error: unknown) => error instanceof Error && error.name === "AbortError",
	);
});
