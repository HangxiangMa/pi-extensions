import { defineTool, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

interface ActiveGoal {
	text: string;
	startedAt: number;
	iteration: number;
}

interface GoalCompleteDetails {
	goal: string;
	summary: string;
}

let activeGoal: ActiveGoal | undefined;

const goalCompleteTool = defineTool({
	name: "goal_complete",
	label: "Goal Complete",
	description:
		"Mark the active /goal as complete. Only call this after the requested goal is fully done and verified.",
	promptSnippet: "Mark the active /goal as complete after fully finishing and verifying it",
	promptGuidelines: [
		"When a /goal is active, keep working until the goal is complete; do not stop with only a plan or partial progress.",
		"Call goal_complete only after the requested goal is fully implemented, verified, and no known required work remains.",
	],
	parameters: Type.Object({
		summary: Type.String({
			description: "Concise summary of what was completed and how it was verified.",
		}),
	}),
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const completedGoal = activeGoal;
		activeGoal = undefined;
		ctx.ui.setStatus("goal", undefined);

		const goal = completedGoal?.text ?? "unknown goal";
		const summary = params.summary.trim();

		ctx.ui.notify(`Goal complete: ${goal}`, "info");

		return {
			content: [{ type: "text", text: `Goal complete: ${summary}` }],
			details: { goal, summary } satisfies GoalCompleteDetails,
			terminate: true,
		};
	},
});

export default function goal(pi: ExtensionAPI) {
	pi.registerTool(goalCompleteTool);

	pi.registerCommand("goal", {
		description: "Run a goal to completion: /goal <goal_to_complete>",
		handler: async (args, ctx) => {
			const goalText = args.trim();
			if (!goalText) {
				ctx.ui.notify("Usage: /goal <goal_to_complete>", "warning");
				return;
			}

			activeGoal = {
				text: goalText,
				startedAt: Date.now(),
				iteration: 0,
			};

			ctx.ui.setStatus("goal", `goal: ${goalText}`);
			ctx.ui.notify(`Goal started: ${goalText}`, "info");

			const prompt = buildGoalPrompt(goalText);
			if (ctx.isIdle()) {
				pi.sendUserMessage(prompt);
			} else {
				pi.sendUserMessage(prompt, { deliverAs: "followUp" });
			}
		},
	});

	pi.registerCommand("goal-stop", {
		description: "Stop the active /goal loop",
		handler: async (_args, ctx) => {
			if (!activeGoal) {
				ctx.ui.notify("No active goal.", "info");
				return;
			}

			const stoppedGoal = activeGoal.text;
			activeGoal = undefined;
			ctx.ui.setStatus("goal", undefined);
			ctx.ui.notify(`Goal stopped: ${stoppedGoal}`, "warning");
		},
	});

	pi.registerCommand("goal-status", {
		description: "Show the active /goal status",
		handler: async (_args, ctx) => {
			if (!activeGoal) {
				ctx.ui.notify("No active goal.", "info");
				return;
			}

			ctx.ui.notify(`Active goal: ${activeGoal.text} (iteration ${activeGoal.iteration})`, "info");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (activeGoal) ctx.ui.setStatus("goal", `goal: ${activeGoal.text}`);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setStatus("goal", undefined);
	});

	pi.on("before_agent_start", (event) => {
		if (!activeGoal) return;

		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildGoalSystemPrompt(activeGoal.text)}`,
		};
	});

	pi.on("agent_end", (_event, ctx) => {
		if (!activeGoal) return;

		activeGoal.iteration += 1;
		ctx.ui.setStatus("goal", `goal: ${activeGoal.text} (${activeGoal.iteration})`);

		pi.sendUserMessage(buildContinuePrompt(activeGoal), { deliverAs: "followUp" });
	});
}

function buildGoalPrompt(goalText: string) {
	return `Goal mode is active. Complete this goal fully:\n\n${goalText}\n\nKeep working until the goal is done. Do not stop after planning or partial progress. When the goal is fully complete and verified, call the goal_complete tool with a concise completion summary.`;
}

function buildGoalSystemPrompt(goalText: string) {
	return `Active /goal: ${goalText}\n\nGoal-mode rules:\n- Continue making concrete progress until the active goal is fully complete.\n- Do not end your response with only a plan, TODO list, or partial progress.\n- Verify the result when possible using appropriate checks.\n- If the goal is not complete at the end of a turn, expect an automatic follow-up and continue from where you left off.\n- Only call the goal_complete tool after the goal is fully complete and verified.`;
}

function buildContinuePrompt(goal: ActiveGoal) {
	return `Continue the active /goal until it is complete:\n\n${goal.text}\n\nThis is automatic continuation #${goal.iteration}. If the goal is not complete yet, keep working and verify progress. If it is fully complete and verified, call the goal_complete tool.`;
}
