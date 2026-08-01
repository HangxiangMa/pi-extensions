import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";

interface SavedPlanMenuOptions {
	statusText: string;
	signal: AbortSignal;
	isCurrent(): boolean;
	show(): void;
	implement(): void | Promise<void>;
	clear(): void;
}

export async function showSavedPlanMenu(ctx: ExtensionContext, options: SavedPlanMenuOptions) {
	if (!ctx.hasUI) {
		throw new Error(`${options.statusText} Use /plan show, /plan implement, or /plan exit.`);
	}
	type Action = "show" | "implement" | "clear";
	const menu = defineMenu<undefined, "saved", Action, ExtensionContext>({
		start: "saved",
		screens: {
			saved: () => ({
				kind: "actions",
				title: "Saved plan",
				lines: [options.statusText],
				items: [
					{ id: "show", label: "Show saved plan", action: "show" },
					{ id: "implement", label: "Implement saved plan", action: "implement" },
					{ id: "clear", label: "Clear saved plan", action: "clear" },
				],
				hint: "close",
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
