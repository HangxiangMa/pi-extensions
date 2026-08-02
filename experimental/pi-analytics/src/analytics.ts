import { randomUUID } from "node:crypto";
import path from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { ResponseCollector } from "./collector.js";
import { type AnalyticsMenuDataSource, showAnalyticsMenu } from "./menu.js";
import { SkillTracker } from "./skills.js";
import { AnalyticsDatabaseOpenError, openAnalyticsDatabase } from "./storage/database.js";
import {
	ChecksumMismatchError,
	MigrationFailedError,
	NewerSchemaError,
} from "./storage/migrations.js";
import type { AnalyticsSnapshot, TimeRange } from "./storage/queries.js";
import { AnalyticsStore } from "./storage/store.js";
import type { ModelIdentity, SettledRun, TriggerSource } from "./types.js";

const EXPERIMENTAL_WARNING = "pi-analytics is experimental; its metrics and dashboard may change.";

export interface AnalyticsStorePort {
	readonly path: string;
	recordRun(run: SettledRun): Promise<void>;
	getSnapshot(range: TimeRange): Promise<AnalyticsSnapshot>;
	clearAll(): Promise<number>;
	close(): Promise<void>;
}

interface AnalyticsDependencies {
	openStore(path: string): Promise<AnalyticsStorePort>;
	getAgentDir(): string;
	now(): number;
	createId(): string;
	platform(): string;
}

export function createAnalyticsExtension(
	dependencies: Partial<AnalyticsDependencies> = {},
): (pi: ExtensionAPI) => void {
	const deps: AnalyticsDependencies = {
		openStore:
			dependencies.openStore ??
			(async (databasePath) =>
				new AnalyticsStore(await openAnalyticsDatabase({ path: databasePath }))),
		getAgentDir: dependencies.getAgentDir ?? getAgentDir,
		now: dependencies.now ?? Date.now,
		createId: dependencies.createId ?? randomUUID,
		platform: dependencies.platform ?? runtimePlatform,
	};

	return function analyticsExtension(pi: ExtensionAPI): void {
		let sessionGeneration = 0;
		let sessionController = new AbortController();
		let collector = new ResponseCollector();
		let skillTracker: SkillTracker | undefined;
		let store: AnalyticsStorePort | undefined;
		let storageFailure: string | undefined;
		let startupTask: Promise<void> | undefined;
		let writeFailureActive = false;
		let pendingTriggerSource: TriggerSource = "unknown";
		let pendingAttemptWithoutRun = false;

		pi.registerCommand("analytics", {
			description: "Open local Pi usage analytics",
			handler: async (args, ctx) => {
				if (args.trim()) {
					if (!ctx.hasUI || (ctx.mode !== "tui" && ctx.mode !== "rpc")) {
						throw new Error("/analytics does not accept arguments.");
					}
					ctx.ui.notify("/analytics does not accept arguments.", "warning");
					return;
				}
				if (!ctx.hasUI || (ctx.mode !== "tui" && ctx.mode !== "rpc")) {
					throw new Error("/analytics requires Pi TUI or RPC mode.");
				}
				const generation = sessionGeneration;
				const owner = sessionController;
				const source = menuSource(generation, owner.signal);
				await showAnalyticsMenu(ctx, source, {
					signal: owner.signal,
					isCurrent: () => generation === sessionGeneration && !owner.signal.aborted,
				});
			},
		});

		pi.on("session_start", async (_event, ctx) => {
			const generation = ++sessionGeneration;
			if (ctx.hasUI) ctx.ui.notify(EXPERIMENTAL_WARNING, "warning");
			sessionController.abort(new DOMException("Analytics session replaced", "AbortError"));
			sessionController = new AbortController();
			collector = new ResponseCollector();
			skillTracker = new SkillTracker(ctx.cwd);
			store = undefined;
			storageFailure = undefined;
			writeFailureActive = false;
			pendingTriggerSource = "unknown";
			pendingAttemptWithoutRun = false;
			const databasePath = path.join(deps.getAgentDir(), "pi-analytics.db");
			const task = (async () => {
				try {
					const opened = await deps.openStore(databasePath);
					if (generation !== sessionGeneration) {
						await opened.close();
						return;
					}
					store = opened;
				} catch (error) {
					if (generation !== sessionGeneration) return;
					storageFailure = storageFailureMessage(error, deps.platform());
					safeNotify(ctx, storageFailure, "warning");
				}
			})();
			startupTask = task;
			await task;
			if (startupTask === task) startupTask = undefined;
		});

		pi.on("input", (event, ctx) => {
			const now = deps.now();
			const tracker = skillTracker;
			tracker?.observeInput(event.text, event.source, now);
			if (event.source !== "extension") pendingTriggerSource = event.source;
			if (!tracker || !collector.hasActiveRun()) return;
			const explicit = tracker.consumeExplicitSkill();
			if (!explicit || !tracker.hasAvailableSkill(explicit.name)) return;
			collector.activateSkill({
				name: explicit.name,
				initiatedBy: "user",
				now: explicit.observedAtMs,
				model: modelIdentity(ctx, pi),
			});
		});

		pi.on("before_agent_start", async (event, ctx) => {
			const generation = sessionGeneration;
			const tracker = skillTracker;
			if (!tracker) return;
			const skills = availableSkills(pi, event.systemPromptOptions.skills ?? []);
			await tracker.setAvailableSkills(skills);
			if (generation !== sessionGeneration || tracker !== skillTracker) return;
			const explicit = tracker.consumeExplicitSkill();
			const interrupted = collector.begin({
				id: deps.createId(),
				now: deps.now(),
				triggerSource: explicit?.source ?? pendingTriggerSource,
				model: modelIdentity(ctx, pi),
			});
			pendingTriggerSource = "unknown";
			if (interrupted) await persistRun(interrupted, ctx, generation);
			if (explicit && skills.some(({ name }) => name === explicit.name)) {
				collector.activateSkill({
					name: explicit.name,
					initiatedBy: "user",
					now: explicit.observedAtMs,
					model: modelIdentity(ctx, pi),
				});
			}
		});

		pi.on("agent_start", () => {
			if (collector.hasActiveRun()) collector.beginAttempt();
			else pendingAttemptWithoutRun = true;
		});

		pi.on("turn_start", (_event, ctx) => {
			ensureRun(ctx, "extension");
		});

		pi.on("before_provider_request", (_event, ctx) => {
			ensureRun(ctx, "extension");
			collector.beginGeneration({
				id: deps.createId(),
				now: deps.now(),
				model: modelIdentity(ctx, pi),
			});
		});

		pi.on("after_provider_response", (event) => {
			collector.recordProviderResponse({ status: event.status, now: deps.now() });
		});

		pi.on("message_end", (event) => {
			if (event.message.role !== "assistant") return;
			collector.finishGeneration({
				now: deps.now(),
				stopReason: event.message.stopReason,
				errorMessage: event.message.errorMessage,
			});
		});

		pi.on("tool_execution_start", (event, ctx) => {
			ensureRun(ctx, "extension");
			collector.beginTool({
				id: event.toolCallId,
				name: event.toolName,
				now: deps.now(),
				model: modelIdentity(ctx, pi),
			});
		});

		pi.on("tool_result", async (event, ctx) => {
			if (event.toolName === "read" && !isBuiltinReadTool(pi)) return;
			const generation = sessionGeneration;
			const tracker = skillTracker;
			if (!tracker) return;
			const name = await tracker.matchSuccessfulRead({
				toolName: event.toolName,
				input: event.input,
				isError: event.isError,
			});
			if (!name || generation !== sessionGeneration || tracker !== skillTracker) return;
			collector.activateSkill({
				name,
				initiatedBy: "model",
				now: deps.now(),
				model: modelIdentity(ctx, pi),
			});
		});

		pi.on("tool_execution_end", (event) => {
			collector.finishTool({ id: event.toolCallId, now: deps.now(), isError: event.isError });
		});

		pi.on("agent_settled", async (_event, ctx) => {
			const generation = sessionGeneration;
			const run = collector.settle(deps.now());
			pendingAttemptWithoutRun = false;
			pendingTriggerSource = "unknown";
			skillTracker?.clearPending();
			if (run) await persistRun(run, ctx, generation);
		});

		pi.on("session_shutdown", async (_event, ctx) => {
			const activeStore = store;
			const activeStartup = startupTask;
			++sessionGeneration;
			sessionController.abort(new DOMException("Analytics session shut down", "AbortError"));
			skillTracker?.clearPending();
			skillTracker = undefined;
			store = undefined;
			const run = collector.interrupt(deps.now());
			if (run && activeStore) {
				await activeStore.recordRun(run).catch(() => {
					safeNotify(ctx, "Analytics could not save the interrupted response cycle.", "warning");
				});
			}
			await activeStartup?.catch(() => undefined);
			await activeStore?.close().catch(() => {
				safeNotify(
					ctx,
					"Analytics storage shutdown was incomplete; some pending metrics may not have been saved.",
					"warning",
				);
			});
		});

		function ensureRun(ctx: ExtensionContext, triggerSource: TriggerSource): void {
			if (collector.hasActiveRun()) return;
			collector.begin({
				id: deps.createId(),
				now: deps.now(),
				triggerSource,
				model: modelIdentity(ctx, pi),
			});
			if (pendingAttemptWithoutRun) {
				pendingAttemptWithoutRun = false;
				collector.beginAttempt();
			}
		}

		async function persistRun(
			run: SettledRun,
			ctx: ExtensionContext,
			generation: number,
		): Promise<void> {
			const activeStore = store;
			if (!activeStore) return;
			try {
				await activeStore.recordRun(run);
				if (generation !== sessionGeneration || activeStore !== store) return;
				if (writeFailureActive) {
					writeFailureActive = false;
					safeNotify(ctx, "Local analytics storage recovered.", "info");
				}
			} catch {
				if (generation !== sessionGeneration || activeStore !== store || writeFailureActive) return;
				writeFailureActive = true;
				safeNotify(
					ctx,
					"Analytics could not save a response cycle; it will retry while this Pi session remains open.",
					"warning",
				);
			}
		}

		function menuSource(generation: number, signal: AbortSignal): AnalyticsMenuDataSource {
			return {
				path: store?.path ?? path.join(deps.getAgentDir(), "pi-analytics.db"),
				async load(range) {
					assertCurrent(generation, signal);
					const activeStore = store;
					if (!activeStore) {
						return {
							kind: "unavailable",
							message: storageFailure ?? unavailableMessage(deps.platform()),
						};
					}
					const snapshot = await activeStore.getSnapshot(range);
					assertCurrent(generation, signal);
					return { kind: "ready", snapshot };
				},
				async clearAll() {
					assertCurrent(generation, signal);
					const activeStore = store;
					if (!activeStore) return 0;
					const count = await activeStore.clearAll();
					assertCurrent(generation, signal);
					return count;
				},
			};
		}

		function assertCurrent(generation: number, signal: AbortSignal): void {
			if (generation !== sessionGeneration || signal.aborted) {
				throw new DOMException("Analytics interaction replaced", "AbortError");
			}
		}
	};
}

function modelIdentity(ctx: ExtensionContext, pi: ExtensionAPI): ModelIdentity | undefined {
	if (!ctx.model) return undefined;
	return {
		provider: ctx.model.provider,
		model: ctx.model.id,
		thinkingLevel: pi.getThinkingLevel(),
	};
}

export function isBuiltinReadTool(pi: ExtensionAPI): boolean {
	const read = pi.getAllTools().find(({ name }) => name === "read");
	return read?.sourceInfo.source === "builtin";
}

function availableSkills(
	pi: ExtensionAPI,
	systemSkills: ReadonlyArray<{ name: string; filePath: string }>,
): Array<{ name: string; filePath: string }> {
	const result = [...systemSkills];
	const seen = new Set(result.map(({ name }) => name));
	const getCommands = (pi as ExtensionAPI & { getCommands?: ExtensionAPI["getCommands"] })
		.getCommands;
	for (const command of typeof getCommands === "function" ? getCommands.call(pi) : []) {
		if (command.source !== "skill" || seen.has(command.name.replace(/^skill:/u, ""))) continue;
		const name = command.name.replace(/^skill:/u, "");
		seen.add(name);
		result.push({ name, filePath: command.sourceInfo.path });
	}
	return result;
}

function runtimePlatform(): string {
	if (process.platform !== "linux") return `${process.platform}-${process.arch}`;
	const report = process.report?.getReport() as
		| { header?: { glibcVersionRuntime?: unknown } }
		| undefined;
	const glibc = report?.header?.glibcVersionRuntime;
	return `linux-${process.arch}-${glibc ? "glibc" : "non-glibc"}`;
}

function storageFailureMessage(error: unknown, platform: string): string {
	if (error instanceof AnalyticsDatabaseOpenError) {
		return `${error.message}\nExisting files were not replaced. Repair or restore them before retrying.\nNo analytics are being collected.`;
	}
	if (error instanceof NewerSchemaError) {
		return `${error.message}\nUpdate pi-analytics before using this database.\nNo analytics are being collected.`;
	}
	if (error instanceof ChecksumMismatchError) {
		return `${error.message}\nRestore a known database backup or update pi-analytics.\nNo analytics are being collected.`;
	}
	if (error instanceof MigrationFailedError) {
		return `${error.message}\nThe previous valid schema was preserved.\nNo analytics are being collected.`;
	}
	return unavailableMessage(platform);
}

function unavailableMessage(platform: string): string {
	return [
		"Analytics storage is unavailable.",
		`Platform: ${platform}`,
		"Supported: Linux glibc x64/arm64, macOS arm64, Windows x64.",
		"No analytics are being collected.",
	].join("\n");
}

function safeNotify(ctx: ExtensionContext, message: string, level: "info" | "warning"): void {
	try {
		ctx.ui.notify(message, level);
	} catch {
		// A replaced Pi context cannot receive lifecycle feedback.
	}
}

export default createAnalyticsExtension();
