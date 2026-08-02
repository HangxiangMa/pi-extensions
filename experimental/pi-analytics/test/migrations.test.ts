import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { connect } from "@tursodatabase/database";
import {
	ChecksumMismatchError,
	MigrationFailedError,
	migrateDatabase,
	NewerSchemaError,
	type SchemaMigration,
} from "../src/storage/migrations.js";

async function withDatabase(
	t: test.TestContext,
	callback: (file: string) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(path.join(tmpdir(), "pi-analytics-migration-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await callback(path.join(directory, "analytics.db"));
}

const first: SchemaMigration = {
	version: 1,
	name: "first",
	statements: ["CREATE TABLE first_table(id INTEGER PRIMARY KEY, value TEXT)"],
};

test("fresh migration applies the analytics schema and is idempotent", async (t) => {
	await withDatabase(t, async (file) => {
		const db = await connect(file);
		t.after(() => db.close());
		await migrateDatabase(db);
		await migrateDatabase(db);

		const versions = await db.all(
			"SELECT version, name, checksum FROM schema_migrations ORDER BY version",
		);
		assert.equal(versions.length, 1);
		assert.equal(versions[0]?.version, 1);
		assert.equal(typeof versions[0]?.checksum, "string");
		for (const table of [
			"response_runs",
			"model_generations",
			"provider_responses",
			"provider_errors",
			"tool_calls",
			"skill_activations",
		]) {
			const row = await db.get(
				"SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?",
				table,
			);
			assert.equal(row?.name, table);
		}
	});
});

test("migration rejects modified applied history and a newer database", async (t) => {
	await withDatabase(t, async (file) => {
		const db = await connect(file);
		t.after(() => db.close());
		await migrateDatabase(db, { migrations: [first] });

		await assert.rejects(
			migrateDatabase(db, {
				migrations: [{ ...first, statements: [...first.statements, "SELECT 1"] }],
			}),
			ChecksumMismatchError,
		);

		await db.run(
			"INSERT INTO schema_migrations(version, name, checksum, applied_at_ms) VALUES (?, ?, ?, ?)",
			2,
			"future",
			"future-checksum",
			Date.now(),
		);
		await assert.rejects(migrateDatabase(db, { migrations: [first] }), NewerSchemaError);
	});
});

test("failed migration rolls back its schema and history row", async (t) => {
	await withDatabase(t, async (file) => {
		const db = await connect(file);
		t.after(() => db.close());
		const broken: SchemaMigration = {
			version: 2,
			name: "broken",
			statements: ["CREATE TABLE should_rollback(id INTEGER PRIMARY KEY)", "THIS IS NOT SQL"],
		};
		await assert.rejects(
			migrateDatabase(db, { migrations: [first, broken] }),
			MigrationFailedError,
		);
		assert.equal(
			await db.get(
				"SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'should_rollback'",
			),
			undefined,
		);
		assert.equal(
			await db.get("SELECT version FROM schema_migrations WHERE version = 2"),
			undefined,
		);
	});
});

test("migration validates an immutable contiguous registry", async (t) => {
	await withDatabase(t, async (file) => {
		const db = await connect(file);
		t.after(() => db.close());
		await assert.rejects(
			migrateDatabase(db, { migrations: [{ ...first, version: 2 }] }),
			/contiguous/i,
		);
		await assert.rejects(
			migrateDatabase(db, { migrations: [first, first] }),
			/contiguous|duplicate/i,
		);
	});
});

test("two connections serialize the same migration with bounded retry", async (t) => {
	await withDatabase(t, async (file) => {
		const left = await connect(file);
		const right = await connect(file);
		t.after(async () => {
			await Promise.all([left.close(), right.close()]);
		});
		await Promise.all([
			migrateDatabase(left, { migrations: [first], retryDelayMs: 2 }),
			migrateDatabase(right, { migrations: [first], retryDelayMs: 2 }),
		]);
		const rows = await left.all("SELECT version FROM schema_migrations");
		assert.deepEqual(rows, [{ version: 1 }]);
	});
});
