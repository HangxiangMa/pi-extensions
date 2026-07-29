import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "../src/index.js";

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

declare const commandContext: ExtensionCommandContext;
declare const lifecycleContext: ExtensionContext;

void runMenu(commandContext, commandMenu, { getState: () => undefined });
void runMenu(lifecycleContext, lifecycleMenu, { getState: () => undefined });

// @ts-expect-error A command-only menu cannot run with a lifecycle context.
void runMenu(lifecycleContext, commandMenu, { getState: () => undefined });
