import { createHash } from "node:crypto";
import type { Database, Transaction } from "@tursodatabase/database";

export interface SchemaMigration {
	version: number;
	name: string;
	statements: readonly string[];
}

export class ChecksumMismatchError extends Error {
	constructor(version: number) {
		super(`Analytics migration v${version} no longer matches its applied checksum.`);
		this.name = "ChecksumMismatchError";
	}
}

export class MigrationFailedError extends Error {
	readonly version: number;
	readonly migrationName: string;

	constructor(migration: SchemaMigration, cause: unknown) {
		super(`Analytics migration v${migration.version} (${migration.name}) failed.`, { cause });
		this.name = "MigrationFailedError";
		this.version = migration.version;
		this.migrationName = migration.name;
	}
}

export class NewerSchemaError extends Error {
	constructor(databaseVersion: number, supportedVersion: number) {
		super(
			`Analytics database schema v${databaseVersion} is newer than supported v${supportedVersion}.`,
		);
		this.name = "NewerSchemaError";
	}
}

const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
	version INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	checksum TEXT NOT NULL,
	applied_at_ms INTEGER NOT NULL
)`;

export const ANALYTICS_MIGRATIONS: readonly SchemaMigration[] = [
	{
		version: 1,
		name: "initial-analytics-schema",
		statements: [
			`CREATE TABLE response_runs (
				id TEXT PRIMARY KEY,
				started_at_ms INTEGER NOT NULL,
				finished_at_ms INTEGER NOT NULL,
				duration_ms INTEGER NOT NULL,
				trigger_source TEXT NOT NULL,
				initial_provider TEXT,
				initial_model TEXT,
				outcome TEXT NOT NULL,
				attempt_count INTEGER NOT NULL,
				generation_count INTEGER NOT NULL,
				tool_call_count INTEGER NOT NULL,
				tool_error_count INTEGER NOT NULL,
				skill_activation_count INTEGER NOT NULL,
				provider_error_count INTEGER NOT NULL,
				recovered_error_count INTEGER NOT NULL
			)`,
			`CREATE TABLE model_generations (
				id TEXT PRIMARY KEY,
				run_id TEXT NOT NULL,
				ordinal INTEGER NOT NULL,
				provider TEXT,
				model TEXT,
				thinking_level TEXT,
				started_at_ms INTEGER NOT NULL,
				finished_at_ms INTEGER,
				duration_ms INTEGER,
				stop_reason TEXT,
				outcome TEXT NOT NULL,
				UNIQUE(run_id, ordinal)
			)`,
			`CREATE TABLE provider_responses (
				generation_id TEXT NOT NULL,
				ordinal INTEGER NOT NULL,
				occurred_at_ms INTEGER NOT NULL,
				status INTEGER NOT NULL,
				PRIMARY KEY(generation_id, ordinal)
			)`,
			`CREATE TABLE provider_errors (
				id TEXT PRIMARY KEY,
				run_id TEXT NOT NULL,
				generation_id TEXT,
				occurred_at_ms INTEGER NOT NULL,
				provider TEXT,
				model TEXT,
				category TEXT NOT NULL,
				recovered INTEGER NOT NULL,
				terminal INTEGER NOT NULL
			)`,
			`CREATE TABLE tool_calls (
				id TEXT PRIMARY KEY,
				run_id TEXT NOT NULL,
				ordinal INTEGER NOT NULL,
				tool_name TEXT NOT NULL,
				provider TEXT,
				model TEXT,
				started_at_ms INTEGER NOT NULL,
				finished_at_ms INTEGER,
				duration_ms INTEGER,
				is_error INTEGER NOT NULL,
				completion_state TEXT NOT NULL,
				UNIQUE(run_id, ordinal)
			)`,
			`CREATE TABLE skill_activations (
				id TEXT PRIMARY KEY,
				run_id TEXT NOT NULL,
				occurred_at_ms INTEGER NOT NULL,
				skill_name TEXT NOT NULL,
				initiated_by TEXT NOT NULL,
				provider TEXT,
				model TEXT,
				UNIQUE(run_id, skill_name)
			)`,
			"CREATE INDEX response_runs_by_time ON response_runs(started_at_ms)",
			"CREATE INDEX generations_by_model_time ON model_generations(provider, model, started_at_ms)",
			"CREATE INDEX tools_by_name_time ON tool_calls(tool_name, started_at_ms)",
			"CREATE INDEX skills_by_name_time ON skill_activations(skill_name, occurred_at_ms)",
			"CREATE INDEX skills_by_model_time ON skill_activations(provider, model, occurred_at_ms)",
			"CREATE INDEX provider_errors_by_category_time ON provider_errors(category, occurred_at_ms)",
			"CREATE INDEX provider_responses_by_time ON provider_responses(occurred_at_ms)",
		],
	},
];

export async function migrateDatabase(
	database: Database,
	options: {
		migrations?: readonly SchemaMigration[];
		retryAttempts?: number;
		retryDelayMs?: number;
	} = {},
): Promise<void> {
	const migrations = options.migrations ?? ANALYTICS_MIGRATIONS;
	validateRegistry(migrations);
	const attempts = options.retryAttempts ?? 8;
	const retryDelayMs = options.retryDelayMs ?? 10;
	await withConflictRetry(() => database.exec(CREATE_MIGRATIONS_TABLE), attempts, retryDelayMs);
	await withConflictRetry(() => applyMigrations(database, migrations), attempts, retryDelayMs);
}

function applyMigrations(
	database: Database,
	migrations: readonly SchemaMigration[],
): Promise<void> {
	const apply = database.transactionAsync(async (transaction) => {
		const applied = (await transaction.all(
			"SELECT version, name, checksum FROM schema_migrations ORDER BY version",
		)) as Array<{ version: number; name: string; checksum: string }>;
		const supportedVersion = migrations.at(-1)?.version ?? 0;
		const databaseVersion = applied.at(-1)?.version ?? 0;
		if (databaseVersion > supportedVersion) {
			throw new NewerSchemaError(databaseVersion, supportedVersion);
		}
		for (const [index, row] of applied.entries()) {
			const migration = migrations[index];
			if (!migration || row.version !== migration.version) {
				throw new Error("Analytics migration history is not contiguous.");
			}
			if (row.name !== migration.name || row.checksum !== migrationChecksum(migration)) {
				throw new ChecksumMismatchError(row.version);
			}
		}
		for (const migration of migrations.slice(applied.length)) {
			await applyOne(transaction, migration);
		}
	});
	return apply.exclusive();
}

async function applyOne(transaction: Transaction, migration: SchemaMigration): Promise<void> {
	try {
		for (const statement of migration.statements) await transaction.exec(statement);
		await transaction.run(
			"INSERT INTO schema_migrations(version, name, checksum, applied_at_ms) VALUES (?, ?, ?, ?)",
			migration.version,
			migration.name,
			migrationChecksum(migration),
			Date.now(),
		);
	} catch (error) {
		throw new MigrationFailedError(migration, error);
	}
}

export function migrationChecksum(migration: SchemaMigration): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				version: migration.version,
				name: migration.name,
				statements: migration.statements,
			}),
		)
		.digest("hex");
}

function validateRegistry(migrations: readonly SchemaMigration[]): void {
	for (const [index, migration] of migrations.entries()) {
		const expected = index + 1;
		if (migration.version !== expected) {
			throw new Error(
				`Analytics migration versions must be contiguous; expected v${expected}, received v${migration.version}.`,
			);
		}
		if (!migration.name.trim()) throw new Error(`Analytics migration v${expected} has no name.`);
		if (migration.statements.length === 0) {
			throw new Error(`Analytics migration v${expected} has no statements.`);
		}
	}
}

async function withConflictRetry<T>(
	operation: () => Promise<T>,
	attempts: number,
	delayMs: number,
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (!isTransactionConflict(error) || attempt + 1 >= attempts) throw error;
			await delay(delayMs * (attempt + 1));
		}
	}
	throw lastError;
}

function isTransactionConflict(error: unknown): boolean {
	const message =
		error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	if (
		message.includes("statement was interrupted") ||
		message.includes("database is locked") ||
		message.includes("database is busy")
	) {
		return true;
	}
	return error instanceof Error && error.cause !== undefined
		? isTransactionConflict(error.cause)
		: false;
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, Math.max(0, milliseconds)));
}
