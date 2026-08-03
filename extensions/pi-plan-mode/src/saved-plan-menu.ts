import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";
import { type PlanExportDestinationProvider, planExportInputScreen } from "./plan-export-screen.js";

interface SavedPlanMenuOptions {
	statusText: string;
	implementationOutcome(): string;
	getExportDestination: PlanExportDestinationProvider;
	signal: AbortSignal;
	isCurrent(): boolean;
	show(): void;
	implement(): void | Promise<void>;
	exportPlan(path: string, signal: AbortSignal): Promise<boolean>;
	settings(signal: AbortSignal): Promise<boolean>;
	clear(): void;
}

export async function showSavedPlanMenu(ctx: ExtensionContext, options: SavedPlanMenuOptions) {
	if (!ctx.hasUI) {
		throw new Error(
			`${options.statusText} Use /plan show, /plan implement, /plan export, or /plan exit.`,
		);
	}
	type Screen = "saved" | "export";
	type Action = "show" | "implement" | "export" | "settings" | "clear";
	const menu = defineMenu<undefined, Screen, Action, ExtensionContext>({
		start: "saved",
		screens: {
			saved: () => ({
				kind: "actions",
				title: "Saved plan",
				lines: [options.statusText, options.implementationOutcome()],
				items: [
					{ id: "show", label: "Show saved plan", action: "show" },
					{ id: "implement", label: "Implement saved plan", action: "implement" },
					{ id: "export", label: "Export plan…", to: "export" },
					{ id: "settings", label: "Settings", action: "settings" },
					{ id: "clear", label: "Clear saved plan", action: "clear" },
				],
				hint: "close",
			}),
			export: () => planExportInputScreen(options.getExportDestination),
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
			settings: async ({ signal }) => {
				const close = await options.settings(signal);
				if (signal.aborted || !options.isCurrent()) return { kind: "rejected" };
				return close ? { kind: "close" } : { kind: "stay" };
			},
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
