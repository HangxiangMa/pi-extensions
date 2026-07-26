import assert from "node:assert/strict";
import test from "node:test";
import {
	expectedRemoteHead,
	type SyncBackend,
	SyncBackendConflictError,
} from "../src/sync-backend.js";
import { snapshot } from "./helpers.js";

export function registerSyncBackendContractSuite(name: string, create: () => SyncBackend) {
	test(`${name} contract: head, revision, snapshot, history, and diagnostics`, async () => {
		const backend = create();
		assert.ok(backend.identity);
		assert.ok(backend.destination);
		assert.equal(await backend.readHead(), undefined);

		const first = snapshot([{ path: "settings.json", content: Buffer.from("first") }]);
		const firstResult = await backend.publishSnapshot(first, expectedRemoteHead(undefined));
		assert.equal(firstResult.head.snapshotId, first.id);
		assert.match(firstResult.head.revision, /\S/);
		assert.equal(backend.sameRevision(firstResult.head.revision, firstResult.head.revision), true);
		assert.deepEqual(await backend.readSnapshot(firstResult.head.snapshotRef), first);
		assert.deepEqual(await backend.listHistory(), [{ ...firstResult.head }]);
		assert.ok((await backend.diagnose()).length > 0);

		const restored = { ...first, id: "restored", createdAt: "2026-01-02T00:00:00.000Z" };
		const restoredResult = await backend.publishSnapshot(
			restored,
			expectedRemoteHead(firstResult.head),
		);
		assert.equal(
			backend.sameRevision(restoredResult.head.revision, firstResult.head.revision),
			false,
		);
		assert.deepEqual(
			(await backend.listHistory()).map((entry) => entry.snapshotId),
			[first.id, restored.id],
		);
	});

	test(`${name} contract: stale and missing-head expectations are typed conflicts`, async () => {
		const backend = create();
		const first = snapshot([{ path: "settings.json", content: Buffer.from("first") }]);
		const head = (await backend.publishSnapshot(first, { kind: "missing" })).head;

		await assert.rejects(
			backend.publishSnapshot({ ...first, id: "stale" }, { kind: "missing" }),
			SyncBackendConflictError,
		);
		await assert.rejects(
			backend.publishSnapshot(
				{ ...first, id: "wrong-revision" },
				{ kind: "revision", revision: `${head.revision}-stale` },
			),
			SyncBackendConflictError,
		);
		assert.equal((await backend.readHead())?.snapshotId, first.id);
	});

	test(`${name} contract: cancellation before commit leaves the head unchanged`, async () => {
		const backend = create();
		const controller = new AbortController();
		controller.abort(new DOMException("cancelled", "AbortError"));

		await assert.rejects(
			backend.publishSnapshot(snapshot([]), { kind: "missing" }, { signal: controller.signal }),
			(error: unknown) => error instanceof Error && error.name === "AbortError",
		);
		assert.equal(await backend.readHead(), undefined);
	});
}
