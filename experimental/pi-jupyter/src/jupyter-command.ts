import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

export type JupyterScrollDirection = "up" | "down" | "page-up" | "page-down" | "top";

export type JupyterCommand =
	| { action: "menu" }
	| { action: "open"; path?: string }
	| { action: "toggle"; path?: string }
	| { action: "focus" | "refresh" | "close" }
	| { action: "scroll"; direction: JupyterScrollDirection; lines?: number };

export type JupyterCommandActions = {
	showMenu(ctx: ExtensionCommandContext): Promise<void>;
	open(ctx: ExtensionCommandContext, path?: string): Promise<void>;
	toggle(ctx: ExtensionCommandContext, path?: string): Promise<void>;
	focus(ctx: ExtensionCommandContext): void;
	refresh(ctx: ExtensionCommandContext): Promise<void>;
	close(ctx: ExtensionCommandContext): void | Promise<void>;
	scroll(
		direction: JupyterScrollDirection,
		lines: number | undefined,
		ctx: ExtensionCommandContext,
	): void;
};

const ROOT_COMPLETIONS: AutocompleteItem[] = [
	{ value: "open ", label: "open", description: "Open a notebook preview" },
	{ value: "focus", label: "focus", description: "Focus the open preview" },
	{ value: "refresh", label: "refresh", description: "Reload the selected notebook" },
	{ value: "close", label: "close", description: "Close the preview" },
	{ value: "toggle ", label: "toggle", description: "Toggle the preview" },
	{ value: "scroll ", label: "scroll", description: "Advanced scrolling controls" },
];

const SCROLL_COMPLETIONS: AutocompleteItem[] = [
	{ value: "scroll up ", label: "scroll up", description: "Scroll up by lines" },
	{ value: "scroll down ", label: "scroll down", description: "Scroll down by lines" },
	{ value: "scroll page-up", label: "scroll page-up", description: "Scroll up one page" },
	{ value: "scroll page-down", label: "scroll page-down", description: "Scroll down one page" },
	{ value: "scroll top", label: "scroll top", description: "Return to the top" },
];

export function registerJupyterCommand(pi: ExtensionAPI, actions: JupyterCommandActions): void {
	pi.registerCommand("jupyter", {
		description: "Manage the current Jupyter notebook preview",
		getArgumentCompletions: completeJupyterArguments,
		handler: async (args, ctx) => {
			const command = parseJupyterCommand(args);
			switch (command.action) {
				case "menu":
					await actions.showMenu(ctx);
					return;
				case "open":
					await actions.open(ctx, command.path);
					return;
				case "toggle":
					await actions.toggle(ctx, command.path);
					return;
				case "focus":
					actions.focus(ctx);
					return;
				case "refresh":
					await actions.refresh(ctx);
					return;
				case "close":
					await actions.close(ctx);
					return;
				case "scroll":
					actions.scroll(command.direction, command.lines, ctx);
			}
		},
	});
}

export function completeJupyterArguments(prefix: string): AutocompleteItem[] | null {
	if (
		prefix.startsWith("open ") ||
		prefix.startsWith("toggle ") ||
		prefix.startsWith("scroll up ") ||
		prefix.startsWith("scroll down ")
	) {
		return null;
	}
	const completions = prefix.startsWith("scroll ") ? SCROLL_COMPLETIONS : ROOT_COMPLETIONS;
	const filtered = completions.filter((item) => item.value.startsWith(prefix));
	return filtered.length > 0 ? filtered : null;
}

export function parseJupyterCommand(rawArgs: string): JupyterCommand {
	const args = rawArgs.trim();
	if (!args) return { action: "menu" };
	const [action = "", ...rest] = args.split(/\s+/);
	const remainder = args.slice(action.length).trim();
	switch (action) {
		case "open":
		case "toggle":
			return remainder ? { action, path: remainder } : { action };
		case "focus":
		case "refresh":
		case "close":
			assertNoArguments(`/jupyter ${action}`, remainder);
			return { action };
		case "scroll":
			return parseScrollCommand(rest);
		default:
			throw new Error(`Unknown /jupyter action: ${action}. Run /jupyter to see available actions.`);
	}
}

function parseScrollCommand(parts: string[]): JupyterCommand {
	const [direction, ...rest] = parts;
	if (!direction || !["up", "down", "page-up", "page-down", "top"].includes(direction)) {
		throw new Error(`Unknown /jupyter scroll action: ${direction ?? "(missing)"}.`);
	}
	if (direction === "up" || direction === "down") {
		if (rest.length > 1)
			throw new Error(`/jupyter scroll ${direction} accepts at most one line count.`);
		return {
			action: "scroll",
			direction,
			lines: rest[0] === undefined ? undefined : parsePositiveLineCount(rest[0]),
		};
	}
	assertNoArguments(`/jupyter scroll ${direction}`, rest.join(" "));
	return { action: "scroll", direction: direction as JupyterScrollDirection };
}

function parsePositiveLineCount(value: string): number {
	if (!/^[1-9]\d*$/.test(value)) throw new Error("Scroll amount must be one positive integer.");
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new Error("Scroll amount must be one positive integer.");
	return parsed;
}

function assertNoArguments(command: string, args: string): void {
	if (args) throw new Error(`${command} does not accept arguments.`);
}
