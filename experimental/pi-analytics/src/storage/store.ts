import type { Database, Transaction } from "@tursodatabase/database";
import type { SettledRun } from "../types.js";
import type { OpenedAnalyticsDatabase } from "./database.js";
import type { AnalyticsSnapshot, TimeRange } from "./queries.js";
import { querySnapshot } from "./queries.js";

const MAX_PENDING_RUNS = 100;
const WRITE_ATTEMPTS = 6;

export class AnalyticsStore {
	private readonly pending: SettledRun[] = [];
	private readonly activeQueries = new Set<Promise<unknown>>();
	private readonly query: typeof querySnapshot;
	private mutationTail: Promise<void> = Promise.resolve();
	private closed = false;
	private closePromise: Promise<void> | undefined;

	constructor(
		private readonly opened: OpenedAnalyticsDatabase,
		dependencies: { querySnapshot?: typeof querySnapshot } = {},
	) {
		this.query = dependencies.querySnapshot ?? querySnapshot;
	}

	get path(): string {
		return this.opened.path;
	}

	recordRun(run: SettledRun): Promise<void> {
		if (this.closed) return Promise.reject(new Error("Analytics store is closed."));
		if (this.pending.length >= MAX_PENDING_RUNS) this.pending.shift();
		this.pending.push(run);
		return this.enqueueMutation(() => this.flushPending());
	}

	getSnapshot(range: TimeRange): Promise<AnalyticsSnapshot> {
		if (this.closed) return Promise.reject(new Error("Analytics store is closed."));
		const query = (async () => {
			await this.mutationTail;
			return this.query(this.opened.connection, range);
		})();
		this.activeQueries.add(query);
		void query.finally(() => this.activeQueries.delete(query)).catch(() => undefined);
		return query;
	}

	clearAll(): Promise<number> {
		if (this.closed) return Promise.reject(new Error("Analytics store is closed."));
		let deleted = 0;
		return this.enqueueMutation(async () => {
			await withWriteRetry(async () => {
				const transaction = this.opened.connection.transactionAsync(async (tx) => {
					const row = (await tx.get("SELECT COUNT(*) AS count FROM response_runs")) as {
						count?: number;
					};
					deleted = Number(row?.count ?? 0);
					for (const table of [
						"provider_responses",
						"provider_errors",
						"tool_calls",
						"skill_activations",
						"model_generations",
						"response_runs",
					]) {
						await tx.exec(`DELETE FROM ${table}`);
					}
				});
				await transaction.immediate();
			});
		}).then(() => deleted);
	}

	close(): Promise<void> {
		if (this.closePromise) return this.closePromise;
		this.closed = true;
		this.closePromise = (async () => {
			await this.mutationTail.catch(() => undefined);
			await Promise.allSettled([...this.activeQueries]);
			let pendingError: unknown;
			try {
				await this.flushPending();
			} catch (error) {
				pendingError = error;
				this.pending.length = 0;
			}
			await this.opened.close();
			if (pendingError !== undefined) {
				throw new Error("Analytics pending writes could not be saved before close.", {
					cause: pendingError,
				});
			}
		})();
		return this.closePromise;
	}

	private enqueueMutation(operation: () => Promise<void>): Promise<void> {
		const result = this.mutationTail.then(operation);
		this.mutationTail = result.catch(() => undefined);
		return result;
	}

	private async flushPending(): Promise<void> {
		while (this.pending.length > 0) {
			const run = this.pending[0];
			if (!run) return;
			await withWriteRetry(() => writeRun(this.opened.connection, run));
			this.pending.shift();
		}
	}
}

async function writeRun(database: Database, run: SettledRun): Promise<void> {
	const transaction = database.transactionAsync(async (tx) => {
		const existing = await tx.get("SELECT id FROM response_runs WHERE id = ?", run.id);
		if (existing) return;
		await insertRun(tx, run);
		for (const generation of run.generations) {
			await tx.run(
				`INSERT INTO model_generations(
					id, run_id, ordinal, provider, model, thinking_level, started_at_ms,
					finished_at_ms, duration_ms, stop_reason, outcome
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				generation.id,
				run.id,
				generation.ordinal,
				generation.provider ?? null,
				generation.model ?? null,
				generation.thinkingLevel ?? null,
				generation.startedAtMs,
				generation.finishedAtMs ?? null,
				generation.durationMs ?? null,
				generation.stopReason ?? null,
				generation.outcome,
			);
			for (const response of generation.responses) {
				await tx.run(
					`INSERT INTO provider_responses(generation_id, ordinal, occurred_at_ms, status)
					 VALUES (?, ?, ?, ?)`,
					generation.id,
					response.ordinal,
					response.occurredAtMs,
					response.status,
				);
			}
		}
		for (const tool of run.tools) {
			await tx.run(
				`INSERT INTO tool_calls(
					id, run_id, ordinal, tool_name, provider, model, started_at_ms,
					finished_at_ms, duration_ms, is_error, completion_state
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				tool.id,
				run.id,
				tool.ordinal,
				tool.name,
				tool.provider ?? null,
				tool.model ?? null,
				tool.startedAtMs,
				tool.finishedAtMs ?? null,
				tool.durationMs ?? null,
				tool.isError ? 1 : 0,
				tool.completionState,
			);
		}
		for (const skill of run.skills) {
			await tx.run(
				`INSERT INTO skill_activations(
					id, run_id, occurred_at_ms, skill_name, initiated_by, provider, model
				) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				skill.id,
				run.id,
				skill.occurredAtMs,
				skill.name,
				skill.initiatedBy,
				skill.provider ?? null,
				skill.model ?? null,
			);
		}
		for (const error of run.providerErrors) {
			await tx.run(
				`INSERT INTO provider_errors(
					id, run_id, generation_id, occurred_at_ms, provider, model,
					category, recovered, terminal
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				error.id,
				run.id,
				error.generationId ?? null,
				error.occurredAtMs,
				error.provider ?? null,
				error.model ?? null,
				error.category,
				error.recovered ? 1 : 0,
				error.terminal ? 1 : 0,
			);
		}
	});
	await transaction.immediate();
}

function insertRun(tx: Transaction, run: SettledRun): Promise<unknown> {
	return tx.run(
		`INSERT INTO response_runs(
			id, started_at_ms, finished_at_ms, duration_ms, trigger_source,
			initial_provider, initial_model, outcome, attempt_count, generation_count,
			tool_call_count, tool_error_count, skill_activation_count,
			provider_error_count, recovered_error_count
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		run.id,
		run.startedAtMs,
		run.finishedAtMs,
		run.durationMs,
		run.triggerSource,
		run.initialProvider ?? null,
		run.initialModel ?? null,
		run.outcome,
		run.attemptCount,
		run.generations.length,
		run.tools.length,
		run.toolErrorCount,
		run.skills.length,
		run.providerErrorCount,
		run.recoveredErrorCount,
	);
}

async function withWriteRetry(operation: () => Promise<void>): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
		try {
			await operation();
			return;
		} catch (error) {
			lastError = error;
			if (!isConflict(error) || attempt + 1 >= WRITE_ATTEMPTS) throw error;
			await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
		}
	}
	throw lastError;
}

function isConflict(error: unknown): boolean {
	const message =
		error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	return (
		message.includes("statement was interrupted") ||
		message.includes("database is locked") ||
		message.includes("database is busy")
	);
}
