import type { SubagentThinkingLevel } from "./agents.js";
import type { CapabilityGrant } from "./capability-grant.js";
import type { TargetPolicyAudit } from "./cwd-policy.js";
import type { DelegationContract } from "./delegation-contract.js";
import type { ExecutionPlan } from "./execution-plan.js";
import type { ClassifiedSubagentOutcome } from "./outcome.js";
import type { AnyStructuredSubagentResult, SubagentResultFormat } from "./result-contract.js";
import type { SemanticCompatibility, SemanticSnapshot } from "./semantic-snapshot.js";
import type { TurnTerminationReport } from "./timeout-checkpoint.js";
import type { TransportTelemetry } from "./transport-types.js";

export type AgentLifecycleState =
	| "starting"
	| "running"
	| "idle"
	| "completed"
	| "blocked"
	| "needs-input"
	| "abstained"
	| "stale"
	| "interrupted"
	| "failed"
	| "closed";

export interface AgentTurn {
	task: string;
	output: string;
	startedAt: number;
	completedAt: number;
	exitCode: number;
	truncated?: boolean;
	termination?: TurnTerminationReport;
}

export interface AgentMailboxMessage {
	id: string;
	senderId: string;
	recipientId: string;
	content: string;
	createdAt: number;
	readAt?: number;
	deduplicationKey?: string;
}

export interface ManagedAgent {
	id: string;
	agent: string;
	parentId?: string;
	rootId: string;
	depth: number;
	children: string[];
	state: AgentLifecycleState;
	createdAt: number;
	updatedAt: number;
	cwd: string;
	agentScope?: "user" | "project" | "both";
	thinkingLevel?: SubagentThinkingLevel;
	timeoutMs?: number;
	currentTimeoutMs?: number;
	idleTimeoutMs?: number;
	currentIdleTimeoutMs?: number;
	maxTurns?: number;
	currentMaxTurns?: number;
	maxToolCalls?: number;
	currentMaxToolCalls?: number;
	currentTask?: string;
	history: AgentTurn[];
	error?: string;
	context?: string;
	contextSourceIds?: string[];
	contextTruncated?: boolean;
	contextTurns?: number;
	contextBytes?: number;
	workspaceMode?: "worktree";
	spawnIdempotencyKey?: string;
	spawnRequestHash?: string;
	contract?: DelegationContract;
	resultFormat?: SubagentResultFormat;
	structuredResult?: AnyStructuredSubagentResult;
	outcome?: ClassifiedSubagentOutcome;
	executionPlan?: ExecutionPlan;
	capabilityGrant?: CapabilityGrant;
	semanticSnapshot?: SemanticSnapshot;
	semanticCompatibility?: SemanticCompatibility;
	termination?: TurnTerminationReport;
	telemetry?: TransportTelemetry;
	target?: TargetPolicyAudit;
	policy?: { inherited: string[]; overridden: string[]; unsupported: string[] };
	mailbox: AgentMailboxMessage[];
	currentMailboxMessageIds?: string[];
}

export interface AgentRunInspectionSummary {
	id: string;
	agent: string;
	state: AgentLifecycleState;
	createdAt: number;
	updatedAt: number;
	historyCount: number;
	unreadMessages: number;
}

export interface AgentRunInspectionDetail extends AgentRunInspectionSummary {
	cwd: string;
	thinkingLevel?: SubagentThinkingLevel;
	timeoutMs?: number;
	currentTimeoutMs?: number;
	idleTimeoutMs?: number;
	currentIdleTimeoutMs?: number;
	maxTurns?: number;
	currentMaxTurns?: number;
	maxToolCalls?: number;
	currentMaxToolCalls?: number;
	currentTask?: string;
	error?: string;
	workspaceMode?: "worktree";
	contextTurns?: number;
	contextBytes?: number;
	contextSources?: number;
	contextTruncated?: boolean;
	contract?: DelegationContract;
	resultFormat?: SubagentResultFormat;
	target?: TargetPolicyAudit;
	policy?: { inherited: string[]; overridden: string[]; unsupported: string[] };
	structuredResult?: AnyStructuredSubagentResult;
	outcome?: ClassifiedSubagentOutcome;
	executionPlan?: ExecutionPlan;
	capabilityGrant?: CapabilityGrant;
	semanticSnapshot?: SemanticSnapshot;
	semanticCompatibility?: SemanticCompatibility;
	termination?: TurnTerminationReport;
	telemetry?: TransportTelemetry;
}

export interface AgentInspectionCounts {
	activeAgents: number;
	retainedAgents: number;
}

export interface TurnOutcome {
	output: string;
	exitCode: number;
	aborted?: boolean;
	truncated?: boolean;
	error?: string;
	policy?: ManagedAgent["policy"];
	structuredResult?: AnyStructuredSubagentResult;
	outcome?: ClassifiedSubagentOutcome;
	executionPlan?: ExecutionPlan;
	termination?: TurnTerminationReport;
	telemetry?: TransportTelemetry;
}

export interface AgentTurnCompletion {
	agent: ManagedAgent;
	task: string;
	output: string;
	error?: string;
}

export interface AgentRegistryOptions {
	maxAgents?: number;
	maxActiveTurns?: number;
	maxHistoryTurns?: number;
	maxDepth?: number;
	maxChildrenPerAgent?: number;
	maxMailboxMessages?: number;
	maxMailboxMessageBytes?: number;
	maxTaskBytes?: number;
	maxTurnOutputBytes?: number;
	idleTtlMs?: number;
	now?: () => number;
	onChange?: (agents: ManagedAgent[]) => void | Promise<void>;
	onTurnComplete?: (completion: AgentTurnCompletion) => void | Promise<void>;
}
