/**
 * Blocking execution stays in one module so preflight, confirmation, cancellation generation,
 * launch, and settlement retain one ordered lifecycle owner across every mode.
 */
import type { AgentToolResult, AgentToolUpdateCallback } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { AdaptiveScheduler } from "./adaptive-scheduler.js";
import { evaluateDelegationAdmission } from "./admission-policy.js";
import {
	type AgentConfig,
	type AgentScope,
	discoverAgents,
	type SubagentSettings,
	type SubagentThinkingLevel,
} from "./agents.js";
import {
	chainStatus,
	fanInStatus,
	parallelStatus,
	singleStatus,
	startSubagentStatus,
} from "./blocking-status.js";
import { issueCapabilityGrant } from "./capability-grant.js";
import {
	assertDelegationTargetAllowed,
	type ResolvedSubagentTarget,
	resolveSubagentTarget,
	targetPolicyAudit,
} from "./cwd-policy.js";
import {
	appendDelegationContract,
	type DelegationContract,
	normalizeDelegationContract,
} from "./delegation-contract.js";
import {
	acknowledgeExecutionPlan,
	createExecutionPlan,
	resolveContractTools,
} from "./execution-plan.js";
import {
	DEFAULT_MAX_CONTEXT_BYTES,
	MAX_BLOCKING_PARALLEL_CONCURRENCY,
	MAX_SUBAGENT_TIMEOUT_MS,
	truncateUtf8,
} from "./limits.js";
import { calculateOrchestrationMetrics } from "./orchestration-metrics.js";
import { executePanel, preflightPanelExecution } from "./panel-execution.js";
import { validatePanelRequest } from "./panel-planning.js";
import { hasUsableAggregator, type SubagentParams } from "./params.js";
import { appendResultInstruction, type SubagentResultFormat } from "./result-contract.js";
import {
	buildFanInContext,
	formatResultFailure,
	getResultFinalOutput,
	isResultError,
	mapWithConcurrencyLimit,
	type OnUpdateCallback,
	runSingleAgent,
	type SingleResult,
	type SubagentDetails,
} from "./runner.js";
import { safeTerminalLine } from "./safe-text.js";
import {
	DEFAULT_DELEGATION_CWD_POLICY,
	readSubagentSettings,
	resolveBlockingMaxParallelTasks,
	resolveSubagentThinkingLevel,
} from "./settings.js";
import { isRetryableResult, runHedgedAttempt, supervisionDelay } from "./supervision.js";
import { TimeoutProgressJournal, TURN_TERMINATION_VERSION } from "./timeout-checkpoint.js";
import type { TurnLimits } from "./turn-budget.js";
import { requiresIndependentVerification } from "./verification-policy.js";
import type { WorkItemLedger } from "./work-item-ledger.js";
import {
	createSessionWorkItemPersistence,
	type WorkItemPersistence,
} from "./work-item-persistence.js";
import { createBlockingWorkLedger, resolveWorkflowTasks } from "./workflow-planning.js";

export const FALLBACK_TIMEOUT_MS = 10 * 60 * 1000;

export function parsePositiveInteger(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveDefaultSubagentTimeoutMs(): number {
	return parsePositiveInteger(process.env.PI_SUBAGENT_TIMEOUT_MS) ?? FALLBACK_TIMEOUT_MS;
}

export function assertSubagentDepthAllowed(): void {
	const depth = Number.parseInt(process.env.PI_SUBAGENT_DEPTH ?? "0", 10) || 0;
	const maxDepth = parsePositiveInteger(process.env.PI_SUBAGENT_MAX_DEPTH) ?? 1;
	if (depth >= maxDepth) {
		throw new Error(`Subagent recursion depth limit reached (${maxDepth})`);
	}
}

export async function executeSubagent(
	toolCallId: string,
	params: SubagentParams,
	signal: AbortSignal | undefined,
	onUpdate: AgentToolUpdateCallback<SubagentDetails> | undefined,
	ctx: ExtensionContext,
	settingsOverride?: SubagentSettings,
): Promise<AgentToolResult<SubagentDetails> & { isError?: boolean }> {
	assertSubagentDepthAllowed();
	const agentScope: AgentScope = params.agentScope ?? "user";
	if ((agentScope === "project" || agentScope === "both") && !ctx.isProjectTrusted()) {
		throw new Error("Project-local subagent definitions require a trusted project");
	}
	const aggregator = hasUsableAggregator(params.aggregator) ? params.aggregator : undefined;
	const config = settingsOverride ?? readSubagentSettings();
	const maxParallelTasks = resolveBlockingMaxParallelTasks(config);
	const discovery = discoverAgents(ctx.cwd, agentScope, config);
	const agents = discovery.agents;
	const resolvedWorkflowTasks = resolveWorkflowTasks(params, agents);
	const confirmProjectAgents = params.confirmProjectAgents ?? true;
	const resolveTimeoutMs = (agentName: string, localTimeoutMs?: number) =>
		localTimeoutMs ??
		params.timeoutMs ??
		agents.find((agent) => agent.name === agentName)?.timeoutMs ??
		resolveDefaultSubagentTimeoutMs();
	const resolveThinkingLevel = (agentName: string, localThinkingLevel?: SubagentThinkingLevel) =>
		resolveSubagentThinkingLevel(agents, agentName, params.thinkingLevel, localThinkingLevel);
	let orchestrationDeadline: number | undefined;
	const resolveTurnLimits = (local?: TurnLimits): TurnLimits => ({
		idleTimeoutMs: local?.idleTimeoutMs ?? params.idleTimeoutMs,
		maxTurns: local?.maxTurns ?? params.maxTurns,
		maxToolCalls: local?.maxToolCalls ?? params.maxToolCalls,
	});
	const resolveExecutionBudget = (
		agentName: string,
		localTimeoutMs?: number,
	):
		| {
				timeoutMs: number;
				workTimeoutReason: "work_timeout" | "orchestration_timeout";
				workTimeoutReportLimit: number;
		  }
		| undefined => {
		const requested = resolveTimeoutMs(agentName, localTimeoutMs);
		if (orchestrationDeadline === undefined) {
			return {
				timeoutMs: requested,
				workTimeoutReason: "work_timeout",
				workTimeoutReportLimit: requested,
			};
		}
		const remaining = Math.floor(orchestrationDeadline - Date.now());
		if (remaining < 1) return undefined;
		const orchestrationLimited = remaining < requested;
		return {
			timeoutMs: Math.min(requested, remaining),
			workTimeoutReason: orchestrationLimited ? "orchestration_timeout" : "work_timeout",
			workTimeoutReportLimit: orchestrationLimited
				? Math.floor(params.totalTimeoutMs as number)
				: requested,
		};
	};

	const hasChain = (params.chain?.length ?? 0) > 0;
	const hasTasks = (params.tasks?.length ?? 0) > 0;
	const hasWorkflow = (params.workflow?.tasks.length ?? 0) > 0;
	const hasPanel = params.panel !== undefined;
	const hasSingle = Boolean(params.agent && params.task);
	const modeCount =
		Number(hasChain) +
		Number(hasTasks) +
		Number(hasWorkflow) +
		Number(hasPanel) +
		Number(hasSingle);
	let workLedger: WorkItemLedger | undefined;
	const workflowScheduling: ReturnType<AdaptiveScheduler["decide"]>[] = [];

	const makeDetails =
		(mode: "single" | "parallel" | "chain" | "workflow" | "panel") =>
		(results: SingleResult[], aggregator?: SingleResult): SubagentDetails => {
			const workflow = workLedger?.snapshot();
			const metricResults = aggregator ? [...results, aggregator] : results;
			return {
				mode,
				agentScope,
				projectAgentsDir: discovery.projectAgentsDir,
				results,
				aggregator,
				workflow,
				schedulerDecisions:
					workflowScheduling.length > 0 ? workflowScheduling.slice(-64) : undefined,
				metrics: calculateOrchestrationMetrics(workflow, metricResults),
			};
		};
	const exhaustedResult = (
		agentName: string,
		task: string,
		thinkingLevel: SubagentThinkingLevel | undefined,
		step?: number,
	): SingleResult => {
		const limit = Math.floor(params.totalTimeoutMs as number);
		const message = `Subagent orchestration deadline expired after ${limit}ms`;
		return {
			agent: agentName,
			agentSource: agents.find((agent) => agent.name === agentName)?.source ?? "unknown",
			task,
			exitCode: 124,
			messages: [],
			stderr: message,
			errorMessage: message,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				cost: 0,
				contextTokens: 0,
				turns: 0,
			},
			thinkingLevel,
			step,
			finalOutput: "",
			timedOut: true,
			stopReason: "timeout",
			termination: {
				version: TURN_TERMINATION_VERSION,
				reason: "orchestration_timeout",
				limit,
				checkpoint: new TimeoutProgressJournal().checkpoint(task),
				finalization: { attempted: false, status: "skipped", durationMs: 0 },
			},
		};
	};

	if (modeCount !== 1 || (aggregator && !hasTasks)) {
		const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
		const reason =
			modeCount !== 1
				? "Provide exactly one mode."
				: "Aggregator is only valid with parallel tasks.";
		return {
			content: [
				{
					type: "text",
					text: `Invalid parameters. ${reason}\nAvailable agents: ${available}`,
				},
			],
			details: makeDetails("single")([]),
		};
	}
	if (
		(hasWorkflow || hasPanel) &&
		(Number.parseInt(process.env.PI_SUBAGENT_DEPTH ?? "0", 10) || 0) > 0
	) {
		throw new Error("Explicit workflow and panel recursion is disabled until separately evaluated");
	}
	if (params.panel) {
		validatePanelRequest(params.panel, maxParallelTasks);
		for (const agentName of [
			...params.panel.reviewers.map((reviewer) => reviewer.agent),
			params.panel.synthesizer.agent,
		]) {
			if (!agents.some((agent) => agent.name === agentName)) {
				throw new Error(`Unknown panel agent: ${agentName}`);
			}
		}
	}
	if (
		(hasTasks && (params.tasks?.length ?? 0) > maxParallelTasks) ||
		(hasWorkflow && (params.workflow?.tasks.length ?? 0) > maxParallelTasks) ||
		(hasPanel && (params.panel?.reviewers.length ?? 0) > maxParallelTasks)
	) {
		const count = hasWorkflow
			? (params.workflow?.tasks.length ?? 0)
			: hasPanel
				? (params.panel?.reviewers.length ?? 0)
				: (params.tasks?.length ?? 0);
		throw new Error(`Too many delegated tasks (${count}). Configured max is ${maxParallelTasks}.`);
	}

	const nonWorkflowRetryConfigured =
		!hasWorkflow &&
		Boolean(
			params.retryPolicy ||
				params.hedgeAfterMs ||
				params.tasks?.some((task) => task.retryPolicy || task.hedgeAfterMs) ||
				params.chain?.some((task) => task.retryPolicy || task.hedgeAfterMs) ||
				aggregator?.retryPolicy ||
				aggregator?.hedgeAfterMs,
		);
	if (nonWorkflowRetryConfigured) {
		throw new Error("Retry and hedge policies are supported only by explicit workflow tasks");
	}
	if (hasWorkflow && params.workflow) {
		for (const task of resolvedWorkflowTasks) {
			const contract = normalizeDelegationContract(task.contract);
			if (params.workflow.honorAdmission) {
				const admission = contract?.admission;
				const decision = evaluateDelegationAdmission({
					contextPressure: admission?.contextPressure ?? "low",
					independentWorkItems: admission?.independentWorkItems ?? 1,
					coupling: admission?.coupling ?? "dense",
					verificationRequired: admission?.verificationRequired ?? false,
					verificationAvailable: admission?.verificationAvailable ?? false,
					capabilitiesSupported: true,
					budgetAllowsChildren: admission?.budgetAllowsChildren ?? false,
					generationCurrent: true,
					requirementsComplete: admission?.requirementsComplete ?? false,
				});
				if (
					decision.recommendation === "parent-owned-direct" ||
					decision.recommendation === "abstain-insufficient-evidence"
				) {
					throw new Error(
						`Admission declined workflow task ${task.id}: ${decision.reasonCodes.join(", ")}`,
					);
				}
			}
			if (
				requiresIndependentVerification({
					contract,
					integrationOwner: task.integrationOwner === true,
					requiredCapabilities: task.requiredCapabilities ?? [],
				})
			) {
				const verifier = resolvedWorkflowTasks.find(
					(candidate) =>
						candidate.verifierFor === task.id &&
						candidate.dependsOn?.includes(task.id) &&
						candidate.agent !== task.agent,
				);
				if (!verifier) {
					throw new Error(
						`Workflow task ${task.id} requires a distinct dependent verifier before launch`,
					);
				}
			}
			if (!task.retryPolicy && !task.hedgeAfterMs) continue;
			const policy = contract?.sideEffectPolicy;
			if (
				(task.retryPolicy && policy !== "read-only" && policy !== "idempotent") ||
				(task.hedgeAfterMs && policy !== "read-only")
			) {
				throw new Error(
					`Workflow task ${task.id} must declare an idempotent retry or read-only hedge delegation contract`,
				);
			}
		}
	}
	workLedger = createBlockingWorkLedger(params, resolvedWorkflowTasks, aggregator);
	let workflowPersistence: WorkItemPersistence | undefined;
	if (hasWorkflow && workLedger) {
		const owner =
			ctx.sessionManager.getSessionId?.() ??
			ctx.sessionManager.getSessionFile?.() ??
			`ephemeral:${ctx.cwd}`;
		workflowPersistence = createSessionWorkItemPersistence(owner, workLedger.workflowId);
	}
	const persistWorkLedger = async () => {
		if (workflowPersistence && workLedger) await workflowPersistence.save(workLedger.snapshot());
	};

	const delegationPolicy = config?.cwdPolicy?.delegation ?? DEFAULT_DELEGATION_CWD_POLICY;
	const resolveTarget = (cwd: string | undefined): ResolvedSubagentTarget => {
		const target = resolveSubagentTarget({
			workspace: ctx.cwd,
			requestedCwd: cwd,
			currentProjectTrusted: ctx.isProjectTrusted(),
		});
		assertDelegationTargetAllowed(target, delegationPolicy);
		return target;
	};
	const singleTarget = hasSingle ? resolveTarget(params.cwd) : undefined;
	const panelTarget = hasPanel ? resolveTarget(undefined) : undefined;
	const chainTargets = params.chain?.map((step) => resolveTarget(step.cwd)) ?? [];
	const parallelTargets = params.tasks?.map((task) => resolveTarget(task.cwd)) ?? [];
	const workflowTargets = resolvedWorkflowTasks.map((task) => resolveTarget(task.cwd));
	const aggregatorTarget = aggregator ? resolveTarget(aggregator.cwd) : undefined;
	if (params.panel && panelTarget) {
		await preflightPanelExecution({
			panel: params.panel,
			agents,
			signal,
			target: panelTarget,
			resolveThinkingLevel,
			resolveTimeoutMs,
		});
	}
	const attachTarget = (result: SingleResult, target: ResolvedSubagentTarget): SingleResult => {
		result.target = targetPolicyAudit(target);
		return result;
	};
	type ContractRequest = {
		contract?: unknown;
		resultFormat?: SubagentResultFormat;
	};
	const prepareTask = (task: string, local?: ContractRequest) => {
		const contracted = appendDelegationContract(task, local?.contract ?? params.contract);
		const resultFormat = local?.resultFormat ?? params.resultFormat;
		return {
			text: appendResultInstruction(contracted.text, resultFormat, DEFAULT_MAX_CONTEXT_BYTES),
			contract: contracted.contract,
			resultFormat,
		};
	};
	const launchPolicy = (
		target: ResolvedSubagentTarget,
		prepared: { contract?: DelegationContract; resultFormat?: SubagentResultFormat },
		displayTask: string,
		agentName: string,
		thinkingLevel: SubagentThinkingLevel | undefined,
		timeoutMs: number,
		taskGeneration = 0,
		budget?: NonNullable<ReturnType<typeof resolveExecutionBudget>>,
		turnLimits?: TurnLimits,
	) => {
		const agent = agents.find((candidate) => candidate.name === agentName);
		const effectiveTools = agent ? resolveContractTools(agent.tools, prepared.contract) : undefined;
		const executionPlan = agent
			? createExecutionPlan({
					contract: prepared.contract,
					agent,
					effectiveTools,
					target: targetPolicyAudit(target),
					workspaceMode: "shared",
					transport: "subprocess",
					resultFormat: prepared.resultFormat ?? "text",
					model: agent.model,
					thinkingLevel,
					timeoutMs,
					taskGeneration,
				})
			: undefined;
		if (executionPlan) {
			const acknowledgement = acknowledgeExecutionPlan(executionPlan);
			if (acknowledgement.status === "rejected") {
				throw new Error(`Execution plan rejected: ${JSON.stringify(acknowledgement)}`);
			}
		}
		const capabilityGrant = executionPlan
			? issueCapabilityGrant(executionPlan, Date.now(), Math.max(1, timeoutMs + 60_000))
			: undefined;
		return {
			projectTrust: target.trust.projectTrusted,
			turnLimits,
			workTimeoutReason: budget?.workTimeoutReason,
			workTimeoutReportLimit: budget?.workTimeoutReportLimit,
			orchestrationDeadlineAt: budget ? orchestrationDeadline : undefined,
			tools: effectiveTools,
			contract: prepared.contract,
			resultFormat: prepared.resultFormat,
			displayTask,
			executionPlan,
			capabilityGrant,
		};
	};

	// Build and acknowledge every contracted plan before confirmation or child launch.
	if (hasSingle && singleTarget && params.agent && params.task) {
		const prepared = prepareTask(params.task, params);
		launchPolicy(
			singleTarget,
			prepared,
			params.task,
			params.agent,
			resolveThinkingLevel(params.agent, params.thinkingLevel),
			resolveTimeoutMs(params.agent, params.timeoutMs),
		);
	}
	for (const [index, step] of (params.chain ?? []).entries()) {
		const prepared = prepareTask(step.task, step);
		launchPolicy(
			chainTargets[index],
			prepared,
			step.task,
			step.agent,
			resolveThinkingLevel(step.agent, step.thinkingLevel),
			resolveTimeoutMs(step.agent, step.timeoutMs),
		);
	}
	for (const [index, task] of (params.tasks ?? []).entries()) {
		const prepared = prepareTask(task.task, task);
		launchPolicy(
			parallelTargets[index],
			prepared,
			task.task,
			task.agent,
			resolveThinkingLevel(task.agent, task.thinkingLevel),
			resolveTimeoutMs(task.agent, task.timeoutMs),
		);
	}
	for (const [index, task] of resolvedWorkflowTasks.entries()) {
		const prepared = prepareTask(task.task, task);
		launchPolicy(
			workflowTargets[index],
			prepared,
			task.task,
			task.agent,
			resolveThinkingLevel(task.agent, task.thinkingLevel),
			resolveTimeoutMs(task.agent, task.timeoutMs),
			workLedger?.get(task.id)?.taskGeneration ?? 0,
		);
	}
	if (aggregator && aggregatorTarget) {
		const prepared = prepareTask(aggregator.task, aggregator);
		launchPolicy(
			aggregatorTarget,
			prepared,
			aggregator.task,
			aggregator.agent,
			resolveThinkingLevel(aggregator.agent, aggregator.thinkingLevel),
			resolveTimeoutMs(aggregator.agent, aggregator.timeoutMs),
		);
	}

	const startWorkItem = (id: string, agentName: string) => {
		if (workLedger?.get(id)?.state === "ready") {
			return workLedger.start(id, `agent:${agentName}`);
		}
		return workLedger?.get(id);
	};
	const settleWorkItem = (id: string, result: SingleResult, taskGeneration: number) => {
		if (!workLedger) return;
		if (workLedger.get(id)?.taskGeneration !== taskGeneration) {
			result.outcome = {
				status: "stale",
				reasonCode: "stale-task-generation",
				recoveryActions: ["discard", "replan"],
				retryable: false,
			};
		}
		if (result.outcome?.status === "stale") {
			workLedger.invalidate(id, result.outcome.reasonCode ?? "stale-result");
			return;
		}
		if (isResultError(result)) {
			const state =
				result.outcome?.status === "blocked"
					? "blocked"
					: result.outcome?.status === "needs-input"
						? "needs-input"
						: result.aborted || result.outcome?.status === "interrupted"
							? "interrupted"
							: "failed";
			workLedger.settle(
				id,
				state,
				result.outcome?.reasonCode ?? result.errorMessage ?? result.stopReason,
			);
			return;
		}
		const structured =
			result.structuredResult?.version === "pi-subagents:result:v2"
				? result.structuredResult
				: undefined;
		workLedger.complete(id, {
			taskGeneration,
			executionPlanId: result.executionPlan?.id,
			artifacts: (structured?.artifacts ?? []).map((artifact) => ({
				id: artifact.id,
				kind: artifact.kind,
				version: artifact.version ?? artifact.digest ?? "unversioned",
				digest: artifact.digest,
				verified:
					structured?.verification.some((verification) => verification.status === "passed") ??
					false,
			})),
			verificationAccepted:
				structured?.verification.some((verification) => verification.status === "passed") ?? false,
		});
	};

	if (agentScope === "project" || agentScope === "both") {
		const requestedAgentNames = new Set<string>();
		if (params.chain) for (const step of params.chain) requestedAgentNames.add(step.agent);
		if (params.tasks) for (const t of params.tasks) requestedAgentNames.add(t.agent);
		for (const task of resolvedWorkflowTasks) requestedAgentNames.add(task.agent);
		if (aggregator) requestedAgentNames.add(aggregator.agent);
		if (params.panel) {
			for (const reviewer of params.panel.reviewers) requestedAgentNames.add(reviewer.agent);
			requestedAgentNames.add(params.panel.synthesizer.agent);
		}
		if (params.agent) requestedAgentNames.add(params.agent);

		const projectAgentsRequested = Array.from(requestedAgentNames)
			.map((name) => agents.find((a) => a.name === name))
			.filter((a): a is AgentConfig => a?.source === "project");

		if (projectAgentsRequested.length > 0) {
			if (!ctx.isProjectTrusted()) {
				throw new Error("Project-local subagent definitions require a trusted project");
			}
			if (confirmProjectAgents && ctx.hasUI) {
				const names = projectAgentsRequested
					.map((agent) => safeTerminalLine(agent.name, 256))
					.join(", ");
				const dir = safeTerminalLine(discovery.projectAgentsDir ?? "(unknown)");
				const ok = await ctx.ui.confirm(
					"Run project-local agents?",
					`Agents: ${names}\nSource: ${dir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
				);
				if (signal?.aborted) {
					const error = new Error("Subagent call was aborted during project-agent confirmation");
					error.name = "AbortError";
					throw error;
				}
				if (!ok) {
					return {
						content: [{ type: "text", text: "Canceled: project-local agents not approved." }],
						details: makeDetails(
							hasChain
								? "chain"
								: hasTasks
									? "parallel"
									: hasWorkflow
										? "workflow"
										: hasPanel
											? "panel"
											: "single",
						)([]),
					};
				}
			}
		}
	}

	orchestrationDeadline =
		params.totalTimeoutMs === undefined
			? undefined
			: Date.now() + Math.floor(params.totalTimeoutMs);
	if (params.panel && panelTarget) {
		return executePanel({
			toolCallId,
			params,
			panel: params.panel,
			signal,
			onUpdate,
			ctx,
			agents,
			agentScope,
			projectAgentsDir: discovery.projectAgentsDir,
			maxParallelTasks,
			target: panelTarget,
			resolveThinkingLevel,
			resolveTimeoutMs,
		});
	}
	if (params.workflow && resolvedWorkflowTasks.length > 0 && workLedger) {
		await persistWorkLedger();
		const status = startSubagentStatus(
			ctx,
			toolCallId,
			parallelStatus(0, resolvedWorkflowTasks.length, 0),
		);
		const scheduler = new AdaptiveScheduler();
		const taskById = new Map(
			resolvedWorkflowTasks.map((task, index) => [task.id, { task, index }]),
		);
		const resultsById = new Map<string, SingleResult>();
		const deadline = orchestrationDeadline;
		const cancelWorkflowGeneration = () => {
			for (const item of workLedger.snapshot().items) {
				if (item.state === "running") workLedger.invalidate(item.id, "parent-aborted");
			}
		};
		signal?.addEventListener("abort", cancelWorkflowGeneration, { once: true });
		try {
			while (true) {
				const snapshot = workLedger.snapshot();
				const remainingBudgetMs =
					deadline === undefined
						? MAX_SUBAGENT_TIMEOUT_MS
						: Math.max(0, Math.floor(deadline - Date.now()));
				const decision = scheduler.decide(snapshot, {
					maxConcurrency: Math.min(MAX_BLOCKING_PARALLEL_CONCURRENCY, maxParallelTasks),
					activeCount: 0,
					transportCapacity: MAX_BLOCKING_PARALLEL_CONCURRENCY,
					remainingBudgetMs,
				});
				workflowScheduling.push(decision);
				if (decision.selected.length === 0) break;
				status.update(
					parallelStatus(resultsById.size, resolvedWorkflowTasks.length, decision.selected.length),
				);
				const batch = await mapWithConcurrencyLimit(
					decision.selected,
					decision.effectiveConcurrency,
					async (workItemId) => {
						const entry = taskById.get(workItemId);
						if (!entry) throw new Error(`Missing workflow task ${workItemId}`);
						const { task, index } = entry;
						const dependencies = (task.dependsOn ?? [])
							.map((dependency) => resultsById.get(dependency))
							.filter((result): result is SingleResult => result !== undefined);
						const dependencyContext = dependencies.length
							? `\n\nDependency results:\n${buildFanInContext(dependencies)}`
							: "";
						const displayTask = task.task;
						const taskWithContext = truncateUtf8(
							`${task.task}${dependencyContext}`,
							DEFAULT_MAX_CONTEXT_BYTES,
						).text;
						const prepared = prepareTask(taskWithContext, task);
						const target = workflowTargets[index];
						const thinkingLevel = resolveThinkingLevel(task.agent, task.thinkingLevel);
						const startedItem = startWorkItem(workItemId, task.agent);
						const acceptedTaskGeneration = startedItem?.taskGeneration ?? 0;
						await persistWorkLedger();
						const runAttempt = (attemptSignal: AbortSignal | undefined) => {
							const budget = resolveExecutionBudget(task.agent, task.timeoutMs);
							if (!budget) {
								return Promise.resolve(exhaustedResult(task.agent, displayTask, thinkingLevel));
							}
							return runSingleAgent(
								ctx.cwd,
								agents,
								task.agent,
								prepared.text,
								target.cwd,
								undefined,
								attemptSignal,
								thinkingLevel,
								budget.timeoutMs,
								undefined,
								makeDetails("workflow"),
								undefined,
								launchPolicy(
									target,
									prepared,
									displayTask,
									task.agent,
									thinkingLevel,
									budget.timeoutMs,
									acceptedTaskGeneration,
									budget,
									resolveTurnLimits(task),
								),
							);
						};
						const maxAttempts = task.retryPolicy?.maxAttempts ?? 1;
						let result: SingleResult | undefined;
						let hedged = false;
						for (let attempt = 1; attempt <= maxAttempts; attempt++) {
							if (attempt > 1 && deadline !== undefined && Date.now() >= deadline) break;
							const attempted = await runHedgedAttempt(runAttempt, signal, task.hedgeAfterMs);
							hedged ||= attempted.hedged;
							result = attachTarget(
								{
									...attempted.result,
									attemptCount: attempt,
									hedged: hedged || undefined,
								},
								target,
							);
							if (!isRetryableResult(result) || attempt >= maxAttempts) break;
							if (deadline !== undefined && Date.now() >= deadline) break;
							await supervisionDelay(task.retryPolicy?.backoffMs ?? 0, signal);
						}
						if (!result) throw new Error(`Workflow task ${workItemId} produced no result`);
						if (workLedger.get(workItemId)?.taskGeneration !== acceptedTaskGeneration) {
							result.outcome = {
								status: "stale",
								reasonCode: "cancelled-generation",
								recoveryActions: ["discard", "replan"],
								retryable: false,
							};
						}
						resultsById.set(workItemId, result);
						settleWorkItem(workItemId, result, acceptedTaskGeneration);
						await persistWorkLedger();
						return result;
					},
					signal,
				);
				if (batch.length === 0 || signal?.aborted) break;
			}
			for (const item of workLedger.snapshot().items) {
				if (item.state !== "pending" && item.state !== "ready") continue;
				if (signal?.aborted) {
					workLedger.settle(item.id, "interrupted", "parent-aborted");
				} else if (deadline !== undefined && Date.now() >= deadline) {
					workLedger.settle(item.id, "blocked", "budget-exhausted");
				} else {
					const dependencyBlocked = item.dependencies.some(
						(dependency) => workLedger.get(dependency)?.state !== "completed",
					);
					workLedger.settle(
						item.id,
						dependencyBlocked ? "blocked" : "needs-input",
						dependencyBlocked ? "dependency-not-completed" : "artifact-version-mismatch",
					);
				}
			}
			await persistWorkLedger();
			const results = resolvedWorkflowTasks.map((task) => {
				const completed = resultsById.get(task.id);
				if (completed) return completed;
				const item = workLedger.get(task.id);
				const outcomeStatus =
					item?.state === "interrupted"
						? "interrupted"
						: item?.state === "needs-input"
							? "needs-input"
							: "blocked";
				const reasonCode = item?.outcomeReason ?? "dependency-not-satisfied";
				return {
					agent: task.agent,
					agentSource: agents.find((agent) => agent.name === task.agent)?.source ?? "unknown",
					task: task.task,
					exitCode: 1,
					messages: [],
					stderr: "Workflow dependency was not satisfied",
					errorMessage: `Workflow task did not start: ${reasonCode}`,
					aborted: outcomeStatus === "interrupted",
					outcome: {
						status: outcomeStatus,
						reasonCode,
						recoveryActions:
							outcomeStatus === "needs-input"
								? ["supply-input"]
								: outcomeStatus === "interrupted"
									? ["retry"]
									: ["resolve-dependency"],
						retryable: outcomeStatus === "interrupted",
					},
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						cost: 0,
						contextTokens: 0,
						turns: 0,
					},
					finalOutput: "",
				} satisfies SingleResult;
			});
			const successCount = results.filter((result) => !isResultError(result)).length;
			const attemptCount = results.reduce((sum, result) => sum + (result.attemptCount ?? 1), 0);
			const hedgeCount = results.filter((result) => result.hedged).length;
			const isError = successCount !== results.length;
			return {
				content: [
					{
						type: "text",
						text: `Workflow: ${successCount}/${results.length} succeeded; ${attemptCount} attempt(s), ${hedgeCount} hedged task(s).`,
					},
				],
				details: { ...makeDetails("workflow")(results), isError },
				isError: isError || undefined,
			};
		} finally {
			signal?.removeEventListener("abort", cancelWorkflowGeneration);
			try {
				await persistWorkLedger();
			} finally {
				status.clear();
			}
		}
	}

	if (params.chain && params.chain.length > 0) {
		const results: SingleResult[] = [];
		let previousOutput = "";
		const status = startSubagentStatus(ctx, toolCallId, chainStatus(0, params.chain.length));

		try {
			for (let i = 0; i < params.chain.length; i++) {
				const step = params.chain[i];
				status.update(chainStatus(i + 1, params.chain.length, step.agent));
				const taskWithContext = truncateUtf8(
					step.task.replace(/\{previous\}/g, previousOutput),
					DEFAULT_MAX_CONTEXT_BYTES,
				).text;
				const prepared = prepareTask(taskWithContext, step);

				// Create update callback that includes all previous results
				const chainUpdate: OnUpdateCallback | undefined = onUpdate
					? (partial) => {
							// Combine completed results with current streaming result
							const currentResult = partial.details?.results[0];
							if (currentResult) {
								const allResults = [...results, currentResult];
								onUpdate({
									content: partial.content,
									details: makeDetails("chain")(allResults),
								});
							}
						}
					: undefined;

				const target = chainTargets[i];
				const thinkingLevel = resolveThinkingLevel(step.agent, step.thinkingLevel);
				const budget = resolveExecutionBudget(step.agent, step.timeoutMs);
				const taskGeneration = startWorkItem(`step-${i + 1}`, step.agent)?.taskGeneration ?? 0;
				const result = attachTarget(
					budget
						? await runSingleAgent(
								ctx.cwd,
								agents,
								step.agent,
								prepared.text,
								target.cwd,
								i + 1,
								signal,
								thinkingLevel,
								budget.timeoutMs,
								chainUpdate,
								makeDetails("chain"),
								undefined,
								launchPolicy(
									target,
									prepared,
									taskWithContext,
									step.agent,
									thinkingLevel,
									budget.timeoutMs,
									taskGeneration,
									budget,
									resolveTurnLimits(step),
								),
							)
						: exhaustedResult(step.agent, taskWithContext, thinkingLevel, i + 1),
					target,
				);
				results.push(result);
				settleWorkItem(`step-${i + 1}`, result, taskGeneration);

				const isError = isResultError(result);
				if (isError) {
					const errorMsg = formatResultFailure(result);
					return {
						content: [
							{ type: "text", text: `Chain stopped at step ${i + 1} (${step.agent}): ${errorMsg}` },
						],
						details: { ...makeDetails("chain")(results), isError: true },
						isError: true,
					};
				}
				previousOutput = result.structuredResult
					? JSON.stringify(result.structuredResult)
					: getResultFinalOutput(result);
			}
			return {
				content: [
					{
						type: "text",
						text: getResultFinalOutput(results[results.length - 1]) || "(no output)",
					},
				],
				details: makeDetails("chain")(results),
			};
		} finally {
			status.clear();
		}
	}

	if (params.tasks && params.tasks.length > 0) {
		const status = startSubagentStatus(
			ctx,
			toolCallId,
			parallelStatus(0, params.tasks.length, params.tasks.length),
		);

		try {
			// Track all results for streaming updates
			const allResults: SingleResult[] = new Array(params.tasks.length);

			// Initialize placeholder results
			for (let i = 0; i < params.tasks.length; i++) {
				allResults[i] = {
					agent: params.tasks[i].agent,
					agentSource: "unknown",
					task: params.tasks[i].task,
					exitCode: -1, // -1 = still running
					messages: [],
					stderr: "",
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						cost: 0,
						contextTokens: 0,
						turns: 0,
					},
					thinkingLevel: resolveThinkingLevel(params.tasks[i].agent, params.tasks[i].thinkingLevel),
					finalOutput: "",
				};
			}

			let doneCount = 0;
			let runningCount = params.tasks.length;

			const emitParallelUpdate = () => {
				status.update(parallelStatus(doneCount, allResults.length, runningCount));
				if (onUpdate) {
					const pendingAggregator: SingleResult | undefined =
						aggregator && !signal?.aborted && doneCount === allResults.length
							? {
									agent: aggregator.agent,
									agentSource:
										agents.find((agent) => agent.name === aggregator.agent)?.source ?? "unknown",
									task: aggregator.task,
									exitCode: -1,
									messages: [],
									stderr: "",
									usage: {
										input: 0,
										output: 0,
										cacheRead: 0,
										cacheWrite: 0,
										cost: 0,
										contextTokens: 0,
										turns: 0,
									},
									thinkingLevel: resolveThinkingLevel(aggregator.agent, aggregator.thinkingLevel),
									timeoutMs: resolveTimeoutMs(aggregator.agent, aggregator.timeoutMs),
									finalOutput: "",
								}
							: undefined;
					onUpdate({
						content: [
							{
								type: "text",
								text: `Parallel: ${doneCount}/${allResults.length} done, ${runningCount} running...`,
							},
						],
						details: makeDetails("parallel")([...allResults], pendingAggregator),
					});
				}
			};

			const results = await mapWithConcurrencyLimit(
				params.tasks,
				MAX_BLOCKING_PARALLEL_CONCURRENCY,
				async (t, index) => {
					const target = parallelTargets[index];
					const prepared = prepareTask(t.task, t);
					const thinkingLevel = resolveThinkingLevel(t.agent, t.thinkingLevel);
					const budget = resolveExecutionBudget(t.agent, t.timeoutMs);
					const taskGeneration = startWorkItem(`task-${index + 1}`, t.agent)?.taskGeneration ?? 0;
					const result = attachTarget(
						budget
							? await runSingleAgent(
									ctx.cwd,
									agents,
									t.agent,
									prepared.text,
									target.cwd,
									undefined,
									signal,
									thinkingLevel,
									budget.timeoutMs,
									(partial) => {
										if (partial.details?.results[0]) {
											allResults[index] = { ...partial.details.results[0], exitCode: -1 };
											emitParallelUpdate();
										}
									},
									makeDetails("parallel"),
									undefined,
									launchPolicy(
										target,
										prepared,
										t.task,
										t.agent,
										thinkingLevel,
										budget.timeoutMs,
										taskGeneration,
										budget,
										resolveTurnLimits(t),
									),
								)
							: exhaustedResult(t.agent, t.task, thinkingLevel),
						target,
					);
					allResults[index] = result;
					settleWorkItem(`task-${index + 1}`, result, taskGeneration);
					doneCount += 1;
					runningCount -= 1;
					emitParallelUpdate();
					return result;
				},
				signal,
				(task, index) => {
					const taskGeneration =
						startWorkItem(`task-${index + 1}`, task.agent)?.taskGeneration ?? 0;
					const skipped: SingleResult = {
						...allResults[index],
						task: task.task,
						exitCode: 130,
						stopReason: "aborted",
						aborted: true,
						errorMessage: "Subagent was not started because the parent call was aborted",
					};
					allResults[index] = skipped;
					settleWorkItem(`task-${index + 1}`, skipped, taskGeneration);
					doneCount += 1;
					runningCount -= 1;
					emitParallelUpdate();
					return skipped;
				},
			);

			let aggregatorResult: SingleResult | undefined;
			if (aggregator && !signal?.aborted) {
				status.update(fanInStatus(aggregator.agent));
				const fanInContext = buildFanInContext(results);
				const aggregatorTask = truncateUtf8(
					aggregator.task.includes("{previous}")
						? aggregator.task.replace(/\{previous\}/g, fanInContext)
						: `${aggregator.task}\n\nParallel task outputs:\n\n${fanInContext}`,
					DEFAULT_MAX_CONTEXT_BYTES,
				).text;
				const prepared = prepareTask(aggregatorTask, aggregator);
				const target = aggregatorTarget as ResolvedSubagentTarget;
				const thinkingLevel = resolveThinkingLevel(aggregator.agent, aggregator.thinkingLevel);
				const budget = resolveExecutionBudget(aggregator.agent, aggregator.timeoutMs);
				const taskGeneration = startWorkItem("aggregator", aggregator.agent)?.taskGeneration ?? 0;
				aggregatorResult = attachTarget(
					budget
						? await runSingleAgent(
								ctx.cwd,
								agents,
								aggregator.agent,
								prepared.text,
								target.cwd,
								undefined,
								signal,
								thinkingLevel,
								budget.timeoutMs,
								(partial) => {
									status.update(fanInStatus(aggregator.agent));
									if (onUpdate && partial.details?.results[0]) {
										onUpdate({
											content: partial.content,
											details: makeDetails("parallel")(results, partial.details.results[0]),
										});
									}
								},
								makeDetails("parallel"),
								undefined,
								launchPolicy(
									target,
									prepared,
									aggregatorTask,
									aggregator.agent,
									thinkingLevel,
									budget.timeoutMs,
									taskGeneration,
									budget,
									resolveTurnLimits(aggregator),
								),
							)
						: exhaustedResult(aggregator.agent, aggregatorTask, thinkingLevel),
					target,
				);
				settleWorkItem("aggregator", aggregatorResult, taskGeneration);
			}

			const successCount = results.filter((result) => !isResultError(result)).length;
			const summaries = results.map((result) => {
				const failed = isResultError(result);
				const output = getResultFinalOutput(result);
				const error = result.errorMessage || result.stderr.trim();
				const summaryText = failed ? formatResultFailure(result) : output || error;
				const preview = truncateUtf8(summaryText, 160).text;
				return `[${result.agent}] ${failed ? "failed" : "completed"}: ${preview || "(no output)"}`;
			});
			const aggregatorFailed = aggregatorResult ? isResultError(aggregatorResult) : false;
			const aggregatorOutput = aggregatorResult ? getResultFinalOutput(aggregatorResult) : "";
			const aggregatorError =
				aggregatorResult?.errorMessage || aggregatorResult?.stderr.trim() || "";
			return {
				content: [
					{
						type: "text",
						text: aggregatorResult
							? aggregatorFailed
								? formatResultFailure(aggregatorResult)
								: aggregatorOutput ||
									aggregatorError ||
									`(aggregator ${aggregatorResult.agent} produced no output)`
							: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}`,
					},
				],
				details: {
					...makeDetails("parallel")(results, aggregatorResult),
					isError: aggregatorFailed,
				},
				isError: aggregatorResult ? aggregatorFailed : undefined,
			};
		} finally {
			status.clear();
		}
	}

	if (params.agent && params.task) {
		const status = startSubagentStatus(ctx, toolCallId, singleStatus(params.agent));

		try {
			const target = singleTarget as ResolvedSubagentTarget;
			const prepared = prepareTask(params.task, params);
			const thinkingLevel = resolveThinkingLevel(params.agent, params.thinkingLevel);
			const budget = resolveExecutionBudget(params.agent, params.timeoutMs);
			const taskGeneration = startWorkItem("task-1", params.agent)?.taskGeneration ?? 0;
			const result = attachTarget(
				budget
					? await runSingleAgent(
							ctx.cwd,
							agents,
							params.agent,
							prepared.text,
							target.cwd,
							undefined,
							signal,
							thinkingLevel,
							budget.timeoutMs,
							onUpdate,
							makeDetails("single"),
							undefined,
							launchPolicy(
								target,
								prepared,
								params.task,
								params.agent,
								thinkingLevel,
								budget.timeoutMs,
								taskGeneration,
								budget,
								resolveTurnLimits(params),
							),
						)
					: exhaustedResult(params.agent, params.task, thinkingLevel),
				target,
			);
			settleWorkItem("task-1", result, taskGeneration);
			const isError = isResultError(result);
			if (isError) {
				const errorMsg = formatResultFailure(result);
				return {
					content: [{ type: "text", text: `Agent ${result.stopReason || "failed"}: ${errorMsg}` }],
					details: { ...makeDetails("single")([result]), isError: true },
					isError: true,
				};
			}
			return {
				content: [{ type: "text", text: getResultFinalOutput(result) || "(no output)" }],
				details: makeDetails("single")([result]),
			};
		} finally {
			status.clear();
		}
	}

	const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
	return {
		content: [{ type: "text", text: `Invalid parameters. Available agents: ${available}` }],
		details: makeDetails("single")([]),
	};
}
