import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";

interface MenuLifecycle {
	signal: AbortSignal;
	isCurrent(): boolean;
}

interface PlanMenuOptions extends MenuLifecycle {
	statusText: string;
	hasReadyPlan: boolean;
	show(): void;
	finalize(): void;
	implement(): void | Promise<void>;
	save(): void;
	tools(): Promise<void>;
	stay(): void;
	exit(): void;
}

export async function showPlanModeMenu(ctx: ExtensionContext, options: PlanMenuOptions) {
	type Action = "show" | "finalize" | "implement" | "save" | "tools" | "stay" | "exit";
	const menu = defineMenu<undefined, "main", Action, ExtensionContext>({
		start: "main",
		screens: {
			main: () => ({
				kind: "actions",
				title: "Plan mode",
				lines: [options.statusText],
				items: options.hasReadyPlan
					? [
							{ id: "show", label: "Show latest proposed plan", action: "show" },
							{ id: "implement", label: "Implement this plan", action: "implement" },
							{ id: "save", label: "Save for later", action: "save" },
							{ id: "tools", label: "Configure Plan-mode tools", action: "tools" },
							{ id: "stay", label: "Stay in Plan mode", action: "stay" },
							{ id: "exit", label: "Exit Plan mode", action: "exit" },
						]
					: [
							{ id: "finalize", label: "Request final plan", action: "finalize" },
							{ id: "tools", label: "Configure Plan-mode tools", action: "tools" },
							{ id: "stay", label: "Stay in Plan mode", action: "stay" },
							{ id: "exit", label: "Exit Plan mode", action: "exit" },
						],
				hint: "close",
			}),
		},
		actions: {
			show: async () => {
				options.show();
				return { kind: "close" };
			},
			finalize: async () => {
				options.finalize();
				return { kind: "close" };
			},
			implement: async () => {
				await options.implement();
				return { kind: "close" };
			},
			save: async () => {
				options.save();
				return { kind: "close" };
			},
			tools: async () => {
				await options.tools();
				return { kind: "stay" };
			},
			stay: async () => {
				options.stay();
				return { kind: "close" };
			},
			exit: async () => {
				options.exit();
				return { kind: "close" };
			},
		},
	});
	await runMenu(ctx, menu, {
		getState: () => undefined,
		signal: options.signal,
		isCurrent: options.isCurrent,
	});
}

interface ReadyPlanMenuOptions extends MenuLifecycle {
	implement(): void | Promise<void>;
	save(): void;
	stay(): void;
	exit(): void;
}

export async function showReadyPlanMenu(ctx: ExtensionContext, options: ReadyPlanMenuOptions) {
	type Action = "implement" | "save" | "stay" | "exit";
	const menu = defineMenu<undefined, "ready", Action, ExtensionContext>({
		start: "ready",
		screens: {
			ready: () => ({
				kind: "actions",
				title: "Proposed plan ready. What next?",
				items: [
					{ id: "implement", label: "Implement this plan", action: "implement" },
					{ id: "save", label: "Save for later", action: "save" },
					{ id: "stay", label: "Stay in Plan mode", action: "stay" },
					{ id: "exit", label: "Exit Plan mode", action: "exit" },
				],
				hint: "close",
			}),
		},
		actions: {
			implement: async () => {
				await options.implement();
				return { kind: "close" };
			},
			save: async () => {
				options.save();
				return { kind: "close" };
			},
			stay: async () => {
				options.stay();
				return { kind: "close" };
			},
			exit: async () => {
				options.exit();
				return { kind: "close" };
			},
		},
	});
	await runMenu(ctx, menu, {
		getState: () => undefined,
		signal: options.signal,
		isCurrent: options.isCurrent,
	});
}
