import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";

interface SavedPlanMenuOptions {
	statusText: string;
	signal: AbortSignal;
	isCurrent(): boolean;
	show(): void;
	implement(): void | Promise<void>;
	exportPlan(path: string, signal: AbortSignal): Promise<boolean>;
	clear(): void;
}

export async function showSavedPlanMenu(ctx: ExtensionContext, options: SavedPlanMenuOptions) {
	if (!ctx.hasUI) {
		throw new Error(
			`${options.statusText} Use /plan show, /plan implement, /plan export, or /plan exit.`,
		);
	}
	type Screen = "saved" | "export";
	type Action = "show" | "implement" | "export" | "clear";
	const menu = defineMenu<undefined, Screen, Action, ExtensionContext>({
		start: "saved",
		screens: {
			saved: () => ({
				kind: "actions",
				title: "Saved plan",
				lines: [options.statusText],
				items: [
					{ id: "show", label: "Show saved plan", action: "show" },
					{ id: "implement", label: "Implement saved plan", action: "implement" },
					{ id: "export", label: "Export plan…", to: "export" },
					{ id: "clear", label: "Clear saved plan", action: "clear" },
				],
				hint: "close",
			}),
			export: () => ({
				kind: "input",
				title: "Export plan",
				lines: ["Existing paths are never overwritten."],
				placeholder: "PLAN.md",
				action: "export",
				hint: "back",
			}),
		},
		actions: {
			show: async () => {
				options.show();
				return { kind: "close" };
			},
			implement: async () => {
				await options.implement();
				return { kind: "close" };
			},
			export: async ({ value, signal }) =>
				(await options.exportPlan(value ?? "", signal)) ? { kind: "close" } : { kind: "rejected" },
			clear: async () => {
				options.clear();
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
