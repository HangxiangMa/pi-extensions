import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	defineMenu,
	type InputScreen,
	type ReviewScreen,
	type RunTaskResult,
	runMenu,
	runTask,
} from "../src/index.js";

type Screen = "main";
type Action = "run";

const commandMenu = defineMenu<undefined, Screen, Action>({
	start: "main",
	screens: {
		main: () => ({
			kind: "actions",
			title: "Command menu",
			items: [{ id: "run", label: "Run", action: "run" }],
		}),
	},
	actions: {
		run: async ({ ctx }) => {
			await ctx.waitForIdle();
			return { kind: "close" };
		},
	},
});

const lifecycleMenu = defineMenu<undefined, Screen, Action, ExtensionContext>({
	start: "main",
	screens: {
		main: () => ({
			kind: "actions",
			title: "Lifecycle menu",
			items: [{ id: "run", label: "Run", action: "run" }],
		}),
	},
	actions: {
		run: async ({ ctx }) => {
			ctx.isIdle();
			// @ts-expect-error Lifecycle handlers must not gain command-only session methods.
			await ctx.waitForIdle();
			return { kind: "close" };
		},
	},
});

const inputScreen: InputScreen<Action> = {
	kind: "input",
	title: "Value",
	action: "run",
};
const reviewScreen: ReviewScreen<Action> = {
	kind: "review",
	title: "Review",
	content: "exact content",
	confirm: { id: "apply", label: "Apply", action: "run" },
};
void inputScreen;
void reviewScreen;

const invalidInputScreen: InputScreen<Action> = {
	kind: "input",
	title: "Invalid",
	// @ts-expect-error Input actions stay within the menu action id union.
	action: "missing",
};
const invalidReviewScreen: ReviewScreen<Action> = {
	kind: "review",
	title: "Invalid",
	content: "content",
	// @ts-expect-error Review confirmation actions stay within the menu action id union.
	confirm: { id: "apply", label: "Apply", action: "missing" },
};
void invalidInputScreen;
void invalidReviewScreen;

declare const commandContext: ExtensionCommandContext;
declare const lifecycleContext: ExtensionContext;

void runMenu(commandContext, commandMenu, { getState: () => undefined });
void runMenu(lifecycleContext, lifecycleMenu, { getState: () => undefined });

const commandTask: Promise<RunTaskResult<number>> = runTask(commandContext, {
	label: "Command task",
	task: async ({ ctx, signal }) => {
		await ctx.waitForIdle();
		if (signal.aborted) return 0;
		return 1;
	},
});
void commandTask;

void runTask(lifecycleContext, {
	label: "Lifecycle task",
	task: async ({ ctx }) => {
		ctx.isIdle();
		// @ts-expect-error Lifecycle tasks must not gain command-only session methods.
		await ctx.waitForIdle();
	},
});

// @ts-expect-error A command-only menu cannot run with a lifecycle context.
void runMenu(lifecycleContext, commandMenu, { getState: () => undefined });
