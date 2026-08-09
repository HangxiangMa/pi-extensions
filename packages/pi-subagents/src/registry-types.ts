import type { SubagentThinkingLevel } from "./agents.js";
import type { TargetPolicyAudit } from "./cwd-policy.js";
import type { StructuredSubagentResult, SubagentResultFormat } from "./result-contract.js";
import type { TransportTelemetry } from "./transport-types.js";

export type AgentLifecycleState =
	| "starting"
	| "running"
	| "idle"
	| "completed"
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
	resultFormat?: SubagentResultFormat;
	structuredResult?: StructuredSubagentResult;
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
	currentTask?: string;
	error?: string;
	workspaceMode?: "worktree";
	contextTurns?: number;
	contextBytes?: number;
	contextSources?: number;
	contextTruncated?: boolean;
	resultFormat?: SubagentResultFormat;
	target?: TargetPolicyAudit;
	policy?: { inherited: string[]; overridden: string[]; unsupported: string[] };
	structuredResult?: StructuredSubagentResult;
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
	structuredResult?: StructuredSubagentResult;
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
