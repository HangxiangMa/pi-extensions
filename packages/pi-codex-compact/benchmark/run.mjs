#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	BENCHMARK_ID,
	buildProbePrompt,
	createBenchmarkFixtures,
	PROFILES,
	SUITES,
	scoreProbeResponse,
	summarizeBenchmarkTrials,
} from "./core.mjs";
import { writeResultFile } from "./result-file.mjs";

const SYSTEM_PROMPT = [
	"You are a deterministic benchmark recovery agent.",
	"Follow the user's output schema exactly.",
	"Do not use tools.",
	"Do not invent unavailable state.",
].join("\n");
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION_ENTRY = path.join(PACKAGE_ROOT, "src", "index.ts");
const DEFAULT_MODEL = "gpt-5.6-sol";
const DEFAULT_PROFILE = "matched-tail";
const DEFAULT_TIMEOUT_MS = 300_000;
const THINKING_LEVELS = Object.freeze(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

try {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) printHelp();
	else {
		const result = options.live ? await runLiveBenchmark(options) : createDryRun(options);
		await publishResult(result, options.output);
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`Benchmark failed: ${terminalText(message)}\n`);
	process.exitCode = 1;
}

function createDryRun(benchmarkOptions) {
	const profile = PROFILES[benchmarkOptions.profile];
	const fixtures = createBenchmarkFixtures(fixtureOptions(benchmarkOptions));
	return {
		benchmark: BENCHMARK_ID,
		mode: "dry-run",
		createdAt: new Date().toISOString(),
		note: "No provider request was made. Pass --live to execute the quota-consuming benchmark.",
		config: publicConfig(benchmarkOptions, profile),
		fixtures: fixtures.map(fixtureMetadata),
		plannedProviderRequests: fixtures.length * 5,
		requestBreakdownPerFixture: {
			fullContextQualityProbe: 1,
			piNativeCompaction: 1,
			piNativeQualityProbe: 1,
			codexRemoteCompaction: 1,
			codexRemoteQualityProbe: 1,
		},
		costWarning:
			"USD values are Pi model-catalog estimates from returned usage, not an OpenAI subscription invoice. Live cost is unknown until requests finish.",
	};
}

async function runLiveBenchmark(benchmarkOptions) {
	const sourceAgentDir = resolveAgentDir(benchmarkOptions.agentDir);
	const authPath = path.join(sourceAgentDir, "auth.json");
	if (!existsSync(authPath)) {
		throw new Error(`OpenAI Codex credentials were not found at ${authPath}`);
	}
	const temporaryRoot = await mkdtemp(path.join(tmpdir(), "pi-codex-compact-benchmark-"));
	const temporaryAgentDir = path.join(temporaryRoot, "agent");
	const profile = PROFILES[benchmarkOptions.profile];
	try {
		await mkdir(temporaryAgentDir, { recursive: true });
		await writeFile(
			path.join(temporaryAgentDir, "pi-codex-compact.json"),
			`${JSON.stringify(
				{
					enabled: true,
					requestTimeoutMs: benchmarkOptions.timeoutMs,
					maxRetries: 0,
					replacementTokenBudget: profile.codexReplacementTokenBudget,
					notifyOnFallback: false,
				},
				null,
				2,
			)}\n`,
			{ mode: 0o600 },
		);
	} catch (error) {
		await rm(temporaryRoot, { recursive: true, force: true });
		throw error;
	}

	const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = temporaryAgentDir;
	const activeSessions = new Set();
	let cancelled = false;
	const lifecycleController = new AbortController();
	const cancel = () => {
		cancelled = true;
		lifecycleController.abort();
		for (const session of activeSessions) {
			session.abortCompaction();
			void session.abort().catch(() => undefined);
		}
	};
	process.once("SIGINT", cancel);
	process.once("SIGTERM", cancel);
	try {
		const sdk = await import("@earendil-works/pi-coding-agent");
		if (cancelled) throw new Error("cancelled");
		const modelsPath = path.join(sourceAgentDir, "models.json");
		const modelRuntime = await sdk.ModelRuntime.create({
			authPath,
			modelsPath: existsSync(modelsPath) ? modelsPath : null,
			signal: lifecycleController.signal,
		});
		if (cancelled) throw new Error("cancelled");
		const model = modelRuntime.getModel("openai-codex", benchmarkOptions.model);
		if (!model) throw new Error(`Unknown openai-codex model: ${benchmarkOptions.model}`);
		if (model.api !== "openai-codex-responses") {
			throw new Error(`${model.provider}/${model.id} does not use openai-codex-responses`);
		}
		if (!modelRuntime.hasConfiguredAuth("openai-codex")) {
			throw new Error("OpenAI Codex OAuth is not configured; run /login openai-codex in Pi");
		}
		const fixtures = createBenchmarkFixtures({
			...fixtureOptions(benchmarkOptions),
			estimateTokens: sdk.estimateTokens,
		});
		for (const fixture of fixtures) {
			assertFixtureIntegrity(fixture);
			if (fixture.estimatedTokens + 16_384 >= model.contextWindow) {
				throw new Error(
					`Fixture ${fixture.id} leaves too little room in the ${model.contextWindow}-token model context`,
				);
			}
		}

		const trials = [];
		let stopReason = "completed";
		for (let index = 0; index < fixtures.length; index += 1) {
			if (cancelled) throw new Error("cancelled");
			const recordedCost = trials.reduce((total, trial) => total + trial.recordedCostUsd, 0);
			if (trials.length > 0 && recordedCost >= benchmarkOptions.maxCostUsd) {
				stopReason = "estimated-cost-guard";
				break;
			}
			const fixture = fixtures[index];
			process.stderr.write(
				`[fixture ${index + 1}/${fixtures.length}] ${fixture.id}; ` +
					`records=${fixture.authoritativeRecords}; questions=${fixture.questions.length}\n`,
			);
			const trial = await runTrial({
				activeSessions,
				benchmarkOptions,
				fixture,
				isCancelled: () => cancelled,
				model,
				modelRuntime,
				profile,
				sdk,
				signal: lifecycleController.signal,
				temporaryAgentDir,
				trialIndex: index,
			});
			trials.push(trial);
			if (benchmarkOptions.output) {
				await writeResultFile(
					benchmarkOptions.output,
					createLiveResult({
						benchmarkOptions,
						fixtures,
						model,
						profile,
						stopReason: index + 1 === fixtures.length ? "completed" : "in-progress",
						trials,
					}),
				);
			}
		}
		if (trials.length === 0) throw new Error("no benchmark trial completed");
		return createLiveResult({
			benchmarkOptions,
			fixtures,
			model,
			profile,
			stopReason,
			trials,
		});
	} finally {
		await Promise.allSettled(
			[...activeSessions].map((session) => closeSession(session, activeSessions)),
		);
		process.off("SIGINT", cancel);
		process.off("SIGTERM", cancel);
		if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

function createLiveResult({ benchmarkOptions, fixtures, model, profile, stopReason, trials }) {
	const summary = summarizeBenchmarkTrials(trials);
	return {
		benchmark: BENCHMARK_ID,
		mode: "live",
		status: stopReason,
		measuredAt: new Date().toISOString(),
		config: {
			...publicConfig(benchmarkOptions, profile),
			provider: model.provider,
			api: model.api,
			contextWindow: model.contextWindow,
			modelCostRatesPerMillionTokens: model.cost,
			retries: {
				piSummarizationRetries: 0,
				providerRetries: 0,
				codexRemoteRetries: 0,
			},
			transport: "sse",
			systemPromptSha256: createHash("sha256").update(SYSTEM_PROMPT).digest("hex"),
		},
		plannedFixtures: fixtures.length,
		completedFixtures: trials.length,
		fixtures: fixtures.map(fixtureMetadata),
		costSemantics:
			"usage.cost uses Pi's current model catalog and is an estimate, not an OpenAI subscription invoice.",
		qualitySemantics:
			"Quality is deterministic exact recall of seeded synthetic state. Full-context control checks answerability; it is not a general coding-quality score.",
		evidenceRole: {
			suite: benchmarkOptions.suite,
			primaryEligible:
				benchmarkOptions.confirmatoryProtocolEligible &&
				stopReason === "completed" &&
				summary.fullContextControl.passed,
			reason:
				benchmarkOptions.suite !== "confirmatory"
					? "Exploratory and calibration outcomes are not primary confirmatory evidence."
					: benchmarkOptions.confirmatoryProtocolEligible
						? "Confirmatory evidence is primary only when every planned fixture completed and every full-context fixture passed."
						: "The confirmatory suite changed a locked protocol control other than calibrated densities, so this run is diagnostic.",
		},
		trials,
		summary,
	};
}

async function runTrial(input) {
	const {
		activeSessions,
		benchmarkOptions,
		fixture,
		isCancelled,
		model,
		modelRuntime,
		profile,
		sdk,
		signal,
		temporaryAgentDir,
		trialIndex,
	} = input;
	const sessions = {};
	try {
		for (const arm of ["full", "native", "codex"]) {
			if (isCancelled()) throw new Error("cancelled");
			sessions[arm] = await createBenchmarkSession({
				activeSessions,
				arm,
				benchmarkOptions,
				fixture,
				model,
				modelRuntime,
				profile,
				isCancelled,
				sdk,
				temporaryAgentDir,
			});
			if (isCancelled()) throw new Error("cancelled");
		}
		const compactionOrder = trialIndex % 2 === 0 ? ["native", "codex"] : ["codex", "native"];
		const compactions = {};
		let providerRequestStarted = false;
		const spaceProviderRequest = async () => {
			if (providerRequestStarted) await requestDelay(benchmarkOptions.requestDelayMs, signal);
			providerRequestStarted = true;
		};
		for (let index = 0; index < compactionOrder.length; index += 1) {
			const arm = compactionOrder[index];
			await spaceProviderRequest();
			process.stderr.write(`  compacting ${arm} arm on ${terminalText(model.id)}\n`);
			compactions[arm] = await compactArm({
				arm,
				isCancelled,
				sessionState: sessions[arm],
			});
		}

		const rotations = [
			["full", "native", "codex"],
			["native", "codex", "full"],
			["codex", "full", "native"],
		];
		const evaluationOrder = rotations[trialIndex % rotations.length];
		const arms = {};
		for (let index = 0; index < evaluationOrder.length; index += 1) {
			const arm = evaluationOrder[index];
			await spaceProviderRequest();
			process.stderr.write(`  probing ${arm} arm on ${terminalText(model.id)}\n`);
			const evaluation = await probeArm({
				arm,
				fixture,
				isCancelled,
				probeThinking: benchmarkOptions.probeThinking,
				sessionState: sessions[arm],
			});
			const compaction = compactions[arm];
			arms[arm] = {
				arm,
				checkpoint: compaction?.checkpoint ?? { kind: "uncompressed-full-context" },
				compaction: compaction?.metrics,
				probe: evaluation.probe,
				quality: evaluation.quality,
				total: {
					latencyMs: round((compaction?.metrics.latencyMs ?? 0) + evaluation.probe.latencyMs),
					costUsd: round((compaction?.metrics.costUsd ?? 0) + evaluation.probe.costUsd),
				},
			};
		}
		const trial = {
			trial: trialIndex + 1,
			fixture: fixtureMetadata(fixture),
			compactionOrder,
			evaluationOrder,
			arms,
		};
		return { ...trial, recordedCostUsd: round(trialCost(trial)) };
	} finally {
		await Promise.allSettled(
			Object.values(sessions)
				.reverse()
				.map(({ session }) => closeSession(session, activeSessions)),
		);
	}
}

async function createBenchmarkSession(input) {
	const {
		activeSessions,
		arm,
		benchmarkOptions,
		fixture,
		isCancelled,
		model,
		modelRuntime,
		profile,
		sdk,
		temporaryAgentDir,
	} = input;
	const sessionManager = sdk.SessionManager.inMemory(PACKAGE_ROOT);
	sessionManager.appendModelChange(model.provider, model.id);
	sessionManager.appendThinkingLevelChange(benchmarkOptions.compactionThinking);
	for (const message of fixture.messages) sessionManager.appendMessage(structuredClone(message));
	const settingsManager = sdk.SettingsManager.inMemory({
		transport: "sse",
		compaction: {
			enabled: false,
			reserveTokens: 16_384,
			keepRecentTokens: profile.piKeepRecentTokens,
		},
		retry: {
			enabled: false,
			maxRetries: 0,
			provider: {
				timeoutMs: benchmarkOptions.timeoutMs,
				maxRetries: 0,
				maxRetryDelayMs: 0,
			},
		},
	});
	const resourceLoader = new sdk.DefaultResourceLoader({
		cwd: PACKAGE_ROOT,
		agentDir: temporaryAgentDir,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		additionalExtensionPaths: arm === "codex" ? [EXTENSION_ENTRY] : [],
		systemPromptOverride: () => SYSTEM_PROMPT,
		appendSystemPromptOverride: () => [],
	});
	await resourceLoader.reload();
	if (isCancelled()) throw new Error("cancelled");
	const loadErrors = resourceLoader.getExtensions().errors;
	if (loadErrors.length > 0) {
		throw new Error(
			`Could not load benchmark extensions: ${loadErrors.map((error) => `${error.path}: ${error.error}`).join("; ")}`,
		);
	}
	let session;
	try {
		({ session } = await sdk.createAgentSession({
			cwd: PACKAGE_ROOT,
			agentDir: temporaryAgentDir,
			model,
			thinkingLevel: benchmarkOptions.compactionThinking,
			modelRuntime,
			settingsManager,
			resourceLoader,
			sessionManager,
			noTools: "all",
		}));
		activeSessions.add(session);
		if (isCancelled()) throw new Error("cancelled");
		const extensionErrors = [];
		await session.bindExtensions({
			mode: "json",
			onError: (error) => extensionErrors.push(error),
		});
		if (isCancelled()) throw new Error("cancelled");
		return { extensionErrors, session };
	} catch (error) {
		if (session) await closeSession(session, activeSessions);
		throw error;
	}
}

async function compactArm({ arm, isCancelled, sessionState }) {
	const { extensionErrors, session } = sessionState;
	assertSessionReady({ arm, extensionErrors, isCancelled, operation: "compaction" });
	const started = performance.now();
	const compaction = await session.compact();
	const latencyMs = performance.now() - started;
	assertSessionReady({ arm, extensionErrors, isCancelled, operation: "compaction" });
	const isCodexCheckpoint =
		compaction.details?.kind === "pi-codex-remote-compaction" &&
		compaction.details?.protocol === "remote-compaction-v2";
	if (arm === "codex" && !isCodexCheckpoint) {
		throw new Error(
			"Codex arm did not produce a Remote V2 checkpoint; refusing to report a Pi fallback as Codex",
		);
	}
	if (arm === "native" && isCodexCheckpoint) {
		throw new Error("Native arm unexpectedly produced a Codex checkpoint");
	}
	const usage = requireUsage(compaction.usage, `${arm} compaction`);
	return {
		checkpoint: checkpointMetrics(compaction, isCodexCheckpoint),
		metrics: {
			latencyMs: round(latencyMs),
			tokensBefore: compaction.tokensBefore,
			estimatedTokensAfter: compaction.estimatedTokensAfter ?? 0,
			inputTokens: inputTokens(usage),
			outputTokens: usage.output,
			costUsd: round(usageCost(usage)),
			usage,
		},
	};
}

async function probeArm({ arm, fixture, isCancelled, probeThinking, sessionState }) {
	const { extensionErrors, session } = sessionState;
	assertSessionReady({ arm, extensionErrors, isCancelled, operation: "quality probe" });
	session.setThinkingLevel(probeThinking);
	const messageCountBefore = session.messages.length;
	const started = performance.now();
	await session.prompt(buildProbePrompt(fixture.questions), { source: "rpc" });
	const latencyMs = performance.now() - started;
	assertSessionReady({ arm, extensionErrors, isCancelled, operation: "quality probe" });
	const probeMessage = session.messages
		.slice(messageCountBefore)
		.reverse()
		.find((message) => message.role === "assistant");
	if (probeMessage?.role !== "assistant") {
		throw new Error(`${arm} quality probe produced no assistant message`);
	}
	if (probeMessage.stopReason === "error" || probeMessage.stopReason === "aborted") {
		throw new Error(
			`${arm} quality probe ended with ${probeMessage.stopReason}: ${probeMessage.errorMessage ?? "unknown error"}`,
		);
	}
	const text = probeMessage.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
	const usage = requireUsage(probeMessage.usage, `${arm} quality probe`);
	return {
		probe: {
			latencyMs: round(latencyMs),
			inputTokens: inputTokens(usage),
			outputTokens: usage.output,
			costUsd: round(usageCost(usage)),
			stopReason: probeMessage.stopReason,
			usage,
		},
		quality: scoreProbeResponse(text, fixture.questions),
	};
}

function assertSessionReady({ arm, extensionErrors, isCancelled, operation }) {
	if (isCancelled()) throw new Error("cancelled");
	if (extensionErrors.length > 0) {
		throw new Error(
			`Extension error during ${arm} ${operation}: ${formatExtensionErrors(extensionErrors)}`,
		);
	}
}

async function closeSession(session, activeSessions) {
	if (!session || !activeSessions.has(session)) return;
	session.abortCompaction();
	try {
		if (session.isStreaming) await session.abort().catch(() => undefined);
		await session.extensionRunner
			.emit({ type: "session_shutdown", reason: "quit" })
			.catch(() => undefined);
	} finally {
		session.dispose();
		activeSessions.delete(session);
	}
}

function checkpointMetrics(compaction, isCodexCheckpoint) {
	const summaryBytes = Buffer.byteLength(compaction.summary, "utf8");
	if (!isCodexCheckpoint) return { kind: "pi-native-plaintext", summaryBytes };
	const history = compaction.details.replacementHistory;
	const opaque = history.at(-1);
	return {
		kind: "codex-remote-v2",
		summaryBytes,
		replacementItems: history.length,
		retainedPlaintextItems: Math.max(0, history.length - 1),
		replacementBytes: Buffer.byteLength(JSON.stringify(history), "utf8"),
		opaqueItemBytes: Buffer.byteLength(JSON.stringify(opaque), "utf8"),
		opaqueItemSha256: createHash("sha256").update(JSON.stringify(opaque)).digest("hex"),
	};
}

function requireUsage(usage, label) {
	if (!usage || typeof usage !== "object") throw new Error(`${label} returned no usage`);
	for (const field of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]) {
		if (typeof usage[field] !== "number" || !Number.isFinite(usage[field])) {
			throw new Error(`${label} returned invalid usage.${field}`);
		}
	}
	if (typeof usage.cost?.total !== "number" || !Number.isFinite(usage.cost.total)) {
		throw new Error(`${label} returned invalid usage.cost.total`);
	}
	return structuredClone(usage);
}

function inputTokens(usage) {
	return usage.input + usage.cacheRead + usage.cacheWrite;
}

function usageCost(usage) {
	return usage.cost.total;
}

function formatExtensionErrors(errors) {
	return errors
		.map((error) =>
			typeof error === "object" && error !== null && "error" in error
				? String(error.error)
				: String(error),
		)
		.join("; ");
}

function assertFixtureIntegrity(fixture) {
	const userText = fixture.messages
		.filter((message) => message.role === "user")
		.map((message) => message.content)
		.join("\n");
	const serializedMessages = JSON.stringify(fixture.messages);
	for (const question of fixture.questions) {
		if (userText.includes(question.expected)) {
			throw new Error(`${fixture.id} leaks ${question.id}'s answer into historical user text`);
		}
		if (serializedMessages.includes(question.question)) {
			throw new Error(`${fixture.id} includes ${question.id}'s question before compaction`);
		}
	}
}

function publicConfig(benchmarkOptions, profile) {
	return {
		model: benchmarkOptions.model,
		suite: benchmarkOptions.suite,
		seeds: benchmarkOptions.seeds,
		densities: benchmarkOptions.densities,
		questionsPerCategory: benchmarkOptions.questionsPerCategory,
		epochs: benchmarkOptions.epochs,
		profile: benchmarkOptions.profile,
		fixtureTargetTokens: benchmarkOptions.fixtureTokens,
		requestTimeoutMs: benchmarkOptions.timeoutMs,
		requestDelayMs: benchmarkOptions.requestDelayMs,
		maxEstimatedCostUsd: benchmarkOptions.maxCostUsd,
		compactionThinkingLevel: benchmarkOptions.compactionThinking,
		probeThinkingLevel: benchmarkOptions.probeThinking,
		piKeepRecentTokens: profile.piKeepRecentTokens,
		codexReplacementTokenBudget: profile.codexReplacementTokenBudget,
		compactionOrder: "alternating by fixture",
		evaluationOrder: "three-way rotation by fixture",
		toolsDuringProbe: [],
		suiteDefaultsUsed: benchmarkOptions.suiteDefaultsUsed,
		confirmatoryProtocolEligible: benchmarkOptions.confirmatoryProtocolEligible,
		studyDesign: benchmarkOptions.suiteDefaultsUsed
			? benchmarkOptions.profile === "matched-tail"
				? "Matched 20K retained-tail comparison; calibration outcomes are exploratory and confirmatory seeds are held out by the predefined suites."
				: "Shipped retention-policy comparison; calibration outcomes are exploratory and confirmatory seeds are held out by the predefined suites."
			: "Suite controls were overridden; the caller must document calibration separation and predeclare confirmatory seeds and densities.",
	};
}

function fixtureOptions(benchmarkOptions) {
	return {
		seeds: benchmarkOptions.seeds,
		densities: benchmarkOptions.densities,
		targetTokens: benchmarkOptions.fixtureTokens,
		questionsPerCategory: benchmarkOptions.questionsPerCategory,
		epochs: benchmarkOptions.epochs,
	};
}

function fixtureMetadata(fixture) {
	return {
		id: fixture.id,
		fixtureVersion: fixture.fixtureVersion,
		seed: fixture.seed,
		density: fixture.density,
		targetTokens: fixture.targetTokens,
		historyEstimatedTokens: fixture.historyEstimatedTokens,
		estimatedTokens: fixture.estimatedTokens,
		messageCount: fixture.messages.length,
		sharedTailMessageCount: fixture.sharedTailMessageCount,
		authoritativeRecords: fixture.authoritativeRecords,
		questionCount: fixture.questions.length,
		qualityCategories: [...new Set(fixture.questions.map((question) => question.category))],
		epochs: fixture.epochs,
		fixtureSha256: createHash("sha256")
			.update(JSON.stringify({ messages: fixture.messages, questions: fixture.questions }))
			.digest("hex"),
	};
}

function trialCost(trial) {
	return Object.values(trial.arms).reduce(
		(total, arm) => total + (arm.compaction?.costUsd ?? 0) + arm.probe.costUsd,
		0,
	);
}

async function requestDelay(milliseconds, signal) {
	if (milliseconds === 0) return;
	await delay(milliseconds, undefined, { signal });
}

async function publishResult(value, outputPath) {
	if (outputPath) {
		await writeResultFile(outputPath, value);
		process.stderr.write(`Wrote benchmark result to ${terminalText(path.resolve(outputPath))}\n`);
	}
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseArguments(args) {
	const parsed = {
		agentDir: undefined,
		compactionThinking: "medium",
		densities: undefined,
		epochs: 10,
		fixtureTokens: 50_000,
		help: false,
		live: false,
		maxCostUsd: 20,
		model: DEFAULT_MODEL,
		output: undefined,
		probeThinking: "low",
		profile: DEFAULT_PROFILE,
		questionsPerCategory: undefined,
		requestDelayMs: 300,
		seeds: undefined,
		suite: "exploratory",
		timeoutMs: DEFAULT_TIMEOUT_MS,
	};
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--") continue;
		if (argument === "--help" || argument === "-h") parsed.help = true;
		else if (argument === "--live") parsed.live = true;
		else if (argument === "--agent-dir") parsed.agentDir = requireValue(args, ++index, argument);
		else if (argument === "--compaction-thinking") {
			parsed.compactionThinking = thinkingLevel(requireValue(args, ++index, argument), argument);
		} else if (argument === "--densities") {
			parsed.densities = integerList(requireValue(args, ++index, argument), argument, 1, 1_000);
		} else if (argument === "--epochs") {
			parsed.epochs = boundedInteger(requireValue(args, ++index, argument), argument, 2, 20);
		} else if (argument === "--fixture-tokens") {
			parsed.fixtureTokens = boundedInteger(
				requireValue(args, ++index, argument),
				argument,
				25_000,
				180_000,
			);
		} else if (argument === "--max-cost-usd") {
			parsed.maxCostUsd = boundedNumber(
				requireValue(args, ++index, argument),
				argument,
				0.01,
				1_000,
			);
		} else if (argument === "--model") parsed.model = requireValue(args, ++index, argument);
		else if (argument === "--output") parsed.output = requireValue(args, ++index, argument);
		else if (argument === "--probe-thinking") {
			parsed.probeThinking = thinkingLevel(requireValue(args, ++index, argument), argument);
		} else if (argument === "--profile") {
			const profile = requireValue(args, ++index, argument);
			if (!Object.hasOwn(PROFILES, profile)) {
				throw new Error(`--profile must be one of: ${Object.keys(PROFILES).join(", ")}`);
			}
			parsed.profile = profile;
		} else if (argument === "--questions-per-category") {
			parsed.questionsPerCategory = boundedInteger(
				requireValue(args, ++index, argument),
				argument,
				1,
				100,
			);
		} else if (argument === "--request-delay-ms") {
			parsed.requestDelayMs = boundedInteger(
				requireValue(args, ++index, argument),
				argument,
				0,
				5_000,
			);
		} else if (argument === "--seeds") {
			parsed.seeds = integerList(requireValue(args, ++index, argument), argument, 1, 1_000_000);
		} else if (argument === "--suite") {
			const suite = requireValue(args, ++index, argument);
			if (!Object.hasOwn(SUITES, suite)) {
				throw new Error(`--suite must be one of: ${Object.keys(SUITES).join(", ")}`);
			}
			parsed.suite = suite;
		} else if (argument === "--timeout-ms") {
			parsed.timeoutMs = boundedInteger(
				requireValue(args, ++index, argument),
				argument,
				30_000,
				600_000,
			);
		} else throw new Error(`Unknown argument: ${argument}`);
	}
	const suite = SUITES[parsed.suite];
	parsed.seeds ??= [...suite.seeds];
	parsed.densities ??= [...suite.densities];
	parsed.questionsPerCategory ??= suite.questionsPerCategory;
	parsed.suiteDefaultsUsed =
		arraysEqual(parsed.seeds, suite.seeds) &&
		arraysEqual(parsed.densities, suite.densities) &&
		parsed.questionsPerCategory === suite.questionsPerCategory;
	parsed.confirmatoryProtocolEligible =
		parsed.suite === "confirmatory" &&
		arraysEqual(parsed.seeds, SUITES.confirmatory.seeds) &&
		parsed.questionsPerCategory === SUITES.confirmatory.questionsPerCategory &&
		parsed.epochs === 10 &&
		parsed.fixtureTokens === 50_000 &&
		parsed.compactionThinking === "medium" &&
		parsed.probeThinking === "low" &&
		parsed.profile === DEFAULT_PROFILE &&
		parsed.model === DEFAULT_MODEL;
	const minimumDensity = Math.min(...parsed.densities);
	if (parsed.questionsPerCategory > minimumDensity) {
		throw new Error("--questions-per-category cannot exceed the smallest density");
	}
	if (parsed.epochs > minimumDensity) {
		throw new Error("--epochs cannot exceed the smallest density");
	}
	return parsed;
}

function requireValue(args, index, option) {
	const value = args[index];
	if (!value) throw new Error(`${option} requires a value`);
	return value;
}

function boundedInteger(value, option, minimum, maximum) {
	const number = Number(value);
	if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
		throw new Error(`${option} must be an integer between ${minimum} and ${maximum}`);
	}
	return number;
}

function boundedNumber(value, option, minimum, maximum) {
	const number = Number(value);
	if (!Number.isFinite(number) || number < minimum || number > maximum) {
		throw new Error(`${option} must be a number between ${minimum} and ${maximum}`);
	}
	return number;
}

function integerList(value, option, minimum, maximum) {
	const values = value.split(",").map((part) => boundedInteger(part, option, minimum, maximum));
	if (values.length === 0) throw new Error(`${option} requires at least one integer`);
	return [...new Set(values)];
}

function arraysEqual(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function thinkingLevel(value, option) {
	if (!THINKING_LEVELS.includes(value)) {
		throw new Error(`${option} is not a supported Pi thinking level`);
	}
	return value;
}

function resolveAgentDir(input) {
	const raw = input ?? process.env.PI_CODING_AGENT_DIR ?? path.join(homedir(), ".pi", "agent");
	if (raw === "~") return homedir();
	if (raw.startsWith(`~${path.sep}`)) return path.join(homedir(), raw.slice(2));
	return path.resolve(raw);
}

function printHelp() {
	process.stdout.write("Usage: node packages/pi-codex-compact/benchmark/run.mjs [options]\n\n");
	process.stdout.write("Without --live, the command performs a zero-network dry run.\n\n");
	process.stdout.write(
		"  --live                         Execute provider calls and consume quota or billable usage.\n",
	);
	process.stdout.write(
		`  --model <id>                   OpenAI Codex model (default: ${DEFAULT_MODEL}).\n`,
	);
	process.stdout.write(
		"  --suite <name>                 exploratory, calibration, or confirmatory (default: exploratory).\n",
	);
	process.stdout.write(
		"  --seeds <csv>                  Override the suite's deterministic seeds.\n",
	);
	process.stdout.write("  --densities <csv>              Override records per category.\n");
	process.stdout.write(
		"  --questions-per-category <n>   Override scored questions per category.\n",
	);
	process.stdout.write(
		"  --epochs <n>                   History epochs from 2 to 20 (default: 10).\n",
	);
	process.stdout.write(
		`  --profile <name>               production or matched-tail (default: ${DEFAULT_PROFILE}).\n`,
	);
	process.stdout.write("  --fixture-tokens <count>       Fixed history target (default: 50000).\n");
	process.stdout.write(
		"  --compaction-thinking <level>  Compaction thinking level (default: medium).\n",
	);
	process.stdout.write(
		"  --probe-thinking <level>       Evaluation thinking level (default: low).\n",
	);
	process.stdout.write(
		"  --max-cost-usd <amount>        Stop before another fixture after this estimate (default: 20).\n",
	);
	process.stdout.write("  --request-delay-ms <ms>        Delay between requests (default: 300).\n");
	process.stdout.write(
		`  --timeout-ms <ms>              Per-request timeout (default: ${DEFAULT_TIMEOUT_MS}).\n`,
	);
	process.stdout.write(
		"  --agent-dir <path>             Source Pi auth/models directory (default: current Pi dir).\n",
	);
	process.stdout.write("  --output <path>                Checkpoint and write the JSON result.\n");
	process.stdout.write("  -h, --help                     Show this help.\n");
}

function terminalText(value) {
	return [...String(value)]
		.filter((character) => {
			const codePoint = character.codePointAt(0);
			return codePoint > 31 && (codePoint < 127 || codePoint > 159);
		})
		.join("");
}

function round(value) {
	return Number(value.toFixed(6));
}
