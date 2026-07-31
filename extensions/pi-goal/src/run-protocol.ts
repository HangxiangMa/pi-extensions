import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { validateObjective } from "./command.js";
import type { GoalCommandController } from "./commands.js";
import {
	formatError,
	type GoalRuntime,
	type GoalStateSnapshot,
	isTerminalGoalStatus,
	type StatusContext,
} from "./runtime.js";

export const GOAL_RUN_START_CHANNEL = "pi-goal:v1:start";
export const GOAL_RUN_CANCEL_CHANNEL = "pi-goal:v1:cancel";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_CANCEL_REASON_LENGTH = 1_000;

export type GoalRunStatus = Exclude<GoalStateSnapshot["status"], "queued">;
export type GoalRunErrorCode =
	| "RPC_DISABLED"
	| "INVALID_REQUEST"
	| "NO_ACTIVE_SESSION"
	| "RUN_ID_IN_USE"
	| "RUN_NOT_FOUND"
	| "GOAL_ALREADY_EXISTS"
	| "ACTIVATION_FAILED"
	| "SUPERSEDED";

export type GoalRunEvent =
	| {
			type: "state";
			runId: string;
			goalId: string;
			status: GoalRunStatus;
			summary?: string;
			reason?: string;
	  }
	| {
			type: "error";
			runId: string;
			operation: "start" | "cancel";
			error: { code: GoalRunErrorCode; message: string };
	  };

interface GoalRunStartPayload {
	runId: string;
	objective: string;
	tokenBudget?: number;
}

interface BoundSession {
	generation: number;
	ctx: StatusContext;
}

interface ManagedRun {
	runId: string;
	generation: number;
	goalId?: string;
	lastStatus?: GoalRunStatus;
	closed: boolean;
	cancelRequested: boolean;
	cancelReason?: string;
}

export function goalRunEventChannel(runId: string) {
	return `pi-goal:v1:event:${runId}`;
}

function parseRunId(data: unknown): string | undefined {
	if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
	const runId = Reflect.get(data, "runId");
	return typeof runId === "string" && RUN_ID_PATTERN.test(runId) ? runId : undefined;
}

function currentActiveGoal(runtime: GoalRuntime) {
	return runtime.activeGoal;
}

function parseStartPayload(data: unknown): string | Omit<GoalRunStartPayload, "runId"> {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return "start payload must be an object";
	}
	const objectiveValue = Reflect.get(data, "objective");
	if (typeof objectiveValue !== "string") return "objective must be a string";
	const objective = objectiveValue.trim();
	const objectiveError = validateObjective(objective);
	if (objectiveError) return objectiveError;
	const tokenBudgetValue = Reflect.get(data, "tokenBudget");
	if (
		tokenBudgetValue !== undefined &&
		(typeof tokenBudgetValue !== "number" ||
			!Number.isFinite(tokenBudgetValue) ||
			!Number.isSafeInteger(tokenBudgetValue) ||
			tokenBudgetValue <= 0)
	) {
		return "tokenBudget must be a positive integer";
	}
	return { objective, tokenBudget: tokenBudgetValue as number | undefined };
}

function parseCancelReason(data: unknown): string | undefined | { error: string } {
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return { error: "cancel payload must be an object" };
	}
	const reasonValue = Reflect.get(data, "reason");
	if (reasonValue === undefined) return undefined;
	if (typeof reasonValue !== "string") return { error: "reason must be a string" };
	const reason = reasonValue.trim();
	if (reason.length > MAX_CANCEL_REASON_LENGTH) {
		return { error: `reason must be at most ${MAX_CANCEL_REASON_LENGTH} characters` };
	}
	return reason || undefined;
}

export class GoalRunController {
	private readonly runtime: GoalRuntime;
	private readonly commands: GoalCommandController;
	private generation = 0;
	private session?: BoundSession;
	private run?: ManagedRun;
	private readonly usedRunIds = new Set<string>();

	constructor(runtime: GoalRuntime, commands: GoalCommandController) {
		this.runtime = runtime;
		this.commands = commands;
		this.runtime.setGoalStateSink((snapshot) => this.handleGoalState(snapshot));
	}

	register(pi: ExtensionAPI) {
		pi.events.on(GOAL_RUN_START_CHANNEL, (data) => {
			void this.handleStart(data);
		});
		pi.events.on(GOAL_RUN_CANCEL_CHANNEL, (data) => {
			this.handleCancel(data);
		});
	}

	bindSession(ctx: StatusContext) {
		this.generation += 1;
		this.session = { generation: this.generation, ctx };
		this.closeCurrentRun();
		this.usedRunIds.clear();
	}

	unbindSession() {
		this.generation += 1;
		this.session = undefined;
		this.closeCurrentRun();
		this.usedRunIds.clear();
	}

	private async handleStart(data: unknown) {
		const runId = parseRunId(data);
		if (!runId) return;
		const session = this.session;
		if (!session) {
			this.emitError(runId, "start", "NO_ACTIVE_SESSION", "No active pi-goal session.");
			return;
		}
		if (!this.runtime.settings.rpc.enabled) {
			this.emitError(runId, "start", "RPC_DISABLED", "Managed run RPC is disabled.");
			return;
		}
		if (this.usedRunIds.has(runId)) {
			this.emitError(runId, "start", "RUN_ID_IN_USE", "runId was already used in this session.");
			return;
		}
		const parsed = parseStartPayload(data);
		if (typeof parsed === "string") {
			this.emitError(runId, "start", "INVALID_REQUEST", parsed);
			return;
		}
		if (this.runtime.activeGoal || (this.run && !this.run.closed)) {
			this.emitError(runId, "start", "GOAL_ALREADY_EXISTS", "A Goal already exists.");
			return;
		}

		const run: ManagedRun = {
			runId,
			generation: session.generation,
			closed: false,
			cancelRequested: false,
		};
		this.run = run;
		this.usedRunIds.add(runId);

		try {
			await this.commands.startGoal(
				parsed.objective,
				parsed.tokenBudget,
				session.ctx,
				(goal) => {
					if (this.ownsRun(run, session.generation)) run.goalId = goal.id;
				},
				() => this.ownsRun(run, session.generation),
			);
		} catch (error) {
			if (this.ownsRun(run, session.generation)) {
				this.closeCurrentRun();
				this.emitError(
					runId,
					"start",
					"ACTIVATION_FAILED",
					`Goal activation failed: ${formatError(error)}`,
				);
			}
			return;
		}

		if (!this.ownsRun(run, session.generation)) return;
		if (!run.goalId) {
			this.closeCurrentRun();
			this.emitError(runId, "start", "ACTIVATION_FAILED", "Goal activation did not create a Goal.");
			return;
		}
		if (currentActiveGoal(this.runtime)?.id !== run.goalId) {
			this.closeCurrentRun();
			this.emitError(runId, "start", "SUPERSEDED", "The managed Goal was superseded.");
			return;
		}
		if (run.cancelRequested) this.cancelActiveRun(run, session, run.cancelReason);
	}

	private handleCancel(data: unknown) {
		const runId = parseRunId(data);
		if (!runId) return;
		const session = this.session;
		if (!session) {
			this.emitError(runId, "cancel", "NO_ACTIVE_SESSION", "No active pi-goal session.");
			return;
		}
		const reason = parseCancelReason(data);
		if (reason && typeof reason === "object") {
			this.emitError(runId, "cancel", "INVALID_REQUEST", reason.error);
			return;
		}
		const run = this.run;
		if (!run || run.closed || run.runId !== runId || run.generation !== session.generation) {
			this.emitError(runId, "cancel", "RUN_NOT_FOUND", "No active managed run matches runId.");
			return;
		}
		if (!run.goalId) {
			run.cancelRequested = true;
			run.cancelReason = reason;
			return;
		}
		this.cancelActiveRun(run, session, reason);
	}

	private cancelActiveRun(run: ManagedRun, session: BoundSession, reason: string | undefined) {
		if (!this.ownsRun(run, session.generation)) return;
		const goal = this.runtime.activeGoal;
		if (!goal || goal.id !== run.goalId) {
			this.closeCurrentRun();
			this.emitError(run.runId, "cancel", "SUPERSEDED", "The managed Goal was superseded.");
			return;
		}
		if (goal.status !== "active") {
			this.closeCurrentRun();
			this.emitError(run.runId, "cancel", "RUN_NOT_FOUND", "The managed run is no longer active.");
			return;
		}
		this.runtime.setTerminalReason(goal.id, reason ?? "goal cancelled by managed run");
		this.commands.pauseGoal(session.ctx);
	}

	private handleGoalState(snapshot: GoalStateSnapshot) {
		const run = this.run;
		if (!run || run.closed || !run.goalId || run.goalId !== snapshot.goalId) return;
		if (snapshot.status === "queued" || run.lastStatus === snapshot.status) return;
		const status = snapshot.status;
		run.lastStatus = status;
		const event: GoalRunEvent = {
			type: "state",
			runId: run.runId,
			goalId: snapshot.goalId,
			status,
			...(snapshot.summary ? { summary: snapshot.summary } : {}),
			...(snapshot.reason ? { reason: snapshot.reason } : {}),
		};
		if (isTerminalGoalStatus(status)) {
			run.closed = true;
			this.run = undefined;
		}
		this.runtime.pi.events.emit(goalRunEventChannel(run.runId), event);
	}

	private emitError(
		runId: string,
		operation: "start" | "cancel",
		code: GoalRunErrorCode,
		message: string,
	) {
		this.runtime.pi.events.emit(goalRunEventChannel(runId), {
			type: "error",
			runId,
			operation,
			error: { code, message },
		} satisfies GoalRunEvent);
	}

	private ownsRun(run: ManagedRun, generation: number) {
		return (
			this.session?.generation === generation &&
			this.generation === generation &&
			this.run === run &&
			!run.closed
		);
	}

	private closeCurrentRun() {
		if (this.run) this.run.closed = true;
		this.run = undefined;
	}
}
