import type { ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";
import { canSelectToolInPlanMode } from "./tool-policy.js";
import { toolPolicyLabel } from "./tool-selection.js";

const TOOL_SELECTOR_VIEWPORT_SIZE = 10;

interface PlanToolMenuOptions {
	tools: readonly ToolInfo[];
	signal: AbortSignal;
	isCurrent(): boolean;
	getSelectedNames(): ReadonlySet<string>;
	toggle(toolName: string, selected: boolean, signal: AbortSignal): void;
}

export async function showPlanToolMenu(ctx: ExtensionContext, options: PlanToolMenuOptions) {
	const toolById = new Map(options.tools.map((tool, index) => [`${index}:${tool.name}`, tool]));
	const menu = defineMenu<undefined, "tools", "toggle", ExtensionContext>({
		start: "tools",
		screens: {
			tools: () => {
				const selectedNames = options.getSelectedNames();
				return {
					kind: "multiSelect",
					title: "Plan-mode tools",
					lines: ["Non-built-in tools run at user risk."],
					enableSearch: true,
					viewportSize: TOOL_SELECTOR_VIEWPORT_SIZE,
					items: options.tools.map((tool, index) => {
						const selectable = canSelectToolInPlanMode(tool);
						const policy = toolPolicyLabel(tool);
						const description = tool.description ?? "No description available";
						return {
							id: `${index}:${tool.name}`,
							label: tool.name,
							description: `${policy} · ${description}`,
							searchText: `${policy} ${description}`,
							selected: selectedNames.has(tool.name),
							disabled: !selectable,
							disabledReason: selectable ? undefined : "Blocked by Plan-mode policy",
						};
					}),
					action: "toggle",
					hint: "close",
					doneLabel: "Done",
				};
			},
		},
		actions: {
			toggle: async ({ itemId, selected, signal }) => {
				const tool = toolById.get(itemId);
				if (signal.aborted || !options.isCurrent() || !tool || !canSelectToolInPlanMode(tool)) {
					return { kind: "rejected" };
				}
				options.toggle(tool.name, selected === true, signal);
				return { kind: "stay" };
			},
		},
	});
	await runMenu(ctx, menu, {
		getState: () => undefined,
		signal: options.signal,
		isCurrent: options.isCurrent,
	});
}
