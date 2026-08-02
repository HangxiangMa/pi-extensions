import { chmod, lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import type { Database } from "@tursodatabase/database";
import {
	ChecksumMismatchError,
	MigrationFailedError,
	migrateDatabase,
	NewerSchemaError,
} from "./migrations.js";

export interface TursoModule {
	connect(
		path: string,
		options?: { timeout?: number; defaultQueryTimeout?: number },
	): Promise<Database>;
}

export class AnalyticsStorageUnavailableError extends Error {
	constructor(cause: unknown) {
		super("Local analytics storage is unavailable on this runtime.", { cause });
		this.name = "AnalyticsStorageUnavailableError";
	}
}

export class AnalyticsDatabaseOpenError extends Error {
	constructor(cause: unknown) {
		super("The local analytics database could not be opened safely.", { cause });
		this.name = "AnalyticsDatabaseOpenError";
	}
}

export interface OpenedAnalyticsDatabase {
	readonly connection: Database;
	readonly path: string;
	close(): Promise<void>;
}

export async function openAnalyticsDatabase(options: {
	path: string;
	loadModule?: () => Promise<TursoModule>;
	connectionTimeoutMs?: number;
	queryTimeoutMs?: number;
}): Promise<OpenedAnalyticsDatabase> {
	const loadModule = options.loadModule ?? defaultModuleLoader;
	let module: TursoModule;
	try {
		module = await loadModule();
	} catch (error) {
		throw new AnalyticsStorageUnavailableError(error);
	}

	let database: Database | undefined;
	try {
		await mkdir(path.dirname(options.path), { recursive: true, mode: 0o700 });
		await preparePrivateFile(options.path);
		await preparePrivateFile(`${options.path}-wal`);
		database = await module.connect(options.path, {
			timeout: options.connectionTimeoutMs ?? 5_000,
			defaultQueryTimeout: options.queryTimeoutMs ?? 5_000,
		});
		await migrateDatabase(database);
		await protectDatabaseFiles(options.path);
		let closed = false;
		return {
			connection: database,
			path: options.path,
			async close() {
				if (closed) return;
				closed = true;
				await database?.close();
			},
		};
	} catch (error) {
		await database?.close().catch(() => undefined);
		if (isMigrationError(error)) throw error;
		throw new AnalyticsDatabaseOpenError(error);
	}
}

async function protectDatabaseFiles(databasePath: string): Promise<void> {
	for (const filePath of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
		await preparePrivateFile(filePath, filePath.endsWith("-shm"));
	}
}

async function preparePrivateFile(filePath: string, optional = false): Promise<void> {
	if (optional) {
		try {
			await lstat(filePath);
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return;
			throw error;
		}
	} else {
		try {
			const handle = await open(filePath, "wx", 0o600);
			await handle.close();
		} catch (error) {
			if (!isNodeError(error) || error.code !== "EEXIST") throw error;
		}
	}
	const metadata = await lstat(filePath);
	if (!metadata.isFile() || metadata.isSymbolicLink()) {
		throw new Error("Analytics database files must be regular files, not links.");
	}
	if (process.platform !== "win32") await chmod(filePath, 0o600);
}

function isMigrationError(
	error: unknown,
): error is ChecksumMismatchError | MigrationFailedError | NewerSchemaError {
	return (
		error instanceof ChecksumMismatchError ||
		error instanceof MigrationFailedError ||
		error instanceof NewerSchemaError
	);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

async function defaultModuleLoader(): Promise<TursoModule> {
	const specifier = "@tursodatabase/database";
	return import(specifier);
}
