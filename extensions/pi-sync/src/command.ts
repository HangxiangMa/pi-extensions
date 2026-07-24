import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { CommandArgumentCompletion, CommandOptions } from "./types.js";

const YES_FLAG_COMPLETIONS: readonly CommandArgumentCompletion[] = [
	{ value: "--yes", label: "--yes", description: "Skip confirmation prompts" },
	{ value: "-y", label: "-y", description: "Skip confirmation prompts" },
];
export const SYNC_COMMANDS = [
	{ name: "help", description: "Show command usage" },
	{ name: "use", description: "Switch the current sync target", usageSuffix: " <target>" },
	{ name: "init", description: "Create local config template" },
	{ name: "config", description: "Show resolved configuration" },
	{ name: "files", description: "Choose synced files" },
	{ name: "status", description: "Show sync status" },
	{ name: "diff", description: "Show local/remote diff" },
	{ name: "doctor", description: "Check config, secrets, and lock state" },
	{ name: "push", description: "Upload local settings" },
	{ name: "pull", description: "Apply remote settings" },
	{ name: "sync", description: "Push or pull as needed" },
	{ name: "history", description: "Show recent remote snapshots" },
	{ name: "rollback", description: "Apply a previous snapshot", usageSuffix: " <snapshot>" },
	{ name: "unlock", description: "Remove a stale local lock", usageSuffix: " --stale" },
] as const;

export type SyncCommandName = (typeof SYNC_COMMANDS)[number]["name"];

const SYNC_COMMAND_COMPLETIONS: readonly CommandArgumentCompletion[] = SYNC_COMMANDS.map(
	({ name, description }) => ({ value: name, label: name, description }),
);
let targetCompletionNames: string[] = [];

export function setSyncTargetCompletions(names: readonly string[]) {
	targetCompletionNames = [...new Set(names)].sort((left, right) => left.localeCompare(right));
}
const TARGET_FLAG_COMPLETION = {
	value: "--target",
	label: "--target",
	description: "Address a target without switching",
} as const;
const SYNC_FLAG_COMPLETIONS: Record<string, readonly CommandArgumentCompletion[]> = {
	config: [TARGET_FLAG_COMPLETION],
	files: [TARGET_FLAG_COMPLETION],
	status: [TARGET_FLAG_COMPLETION],
	diff: [TARGET_FLAG_COMPLETION],
	doctor: [TARGET_FLAG_COMPLETION],
	push: [
		...YES_FLAG_COMPLETIONS,
		{ value: "--force", label: "--force", description: "Overwrite visible remote changes" },
		TARGET_FLAG_COMPLETION,
	],
	pull: [
		...YES_FLAG_COMPLETIONS,
		{ value: "--force", label: "--force", description: "Overwrite local changes" },
		TARGET_FLAG_COMPLETION,
	],
	sync: [
		...YES_FLAG_COMPLETIONS,
		{ value: "--force", label: "--force", description: "Resolve conflicts by forcing action" },
		TARGET_FLAG_COMPLETION,
	],
	history: [TARGET_FLAG_COMPLETION],
	rollback: [...YES_FLAG_COMPLETIONS, TARGET_FLAG_COMPLETION],
	unlock: [{ value: "--stale", label: "--stale", description: "Remove only a stale lock" }],
};

export function splitArgs(input: string) {
	return (
		input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((arg) => arg.replace(/^['"]|['"]$/g, "")) ??
		[]
	);
}

export function parseOptions(args: string[]): CommandOptions {
	const values: string[] = [];
	let yes = false;
	let force = false;
	let stale = false;
	let target: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--yes" || arg === "-y") yes = true;
		else if (arg === "--force") force = true;
		else if (arg === "--stale") stale = true;
		else if (arg === "--target") {
			const name = args[index + 1];
			if (!name || name.startsWith("-")) throw new Error("--target requires a target name.");
			if (target !== undefined) throw new Error("--target may be provided only once.");
			target = name;
			index += 1;
		} else if (arg.startsWith("-")) {
			throw new Error(`Unknown sync option: ${arg}`);
		} else values.push(arg);
	}
	return {
		yes,
		force,
		stale,
		silent: false,
		reload: true,
		auto: false,
		...(target === undefined ? {} : { target }),
		args: values,
	};
}

export function validateCommandOptions(command: string, options: CommandOptions) {
	const targetAllowed = new Set([
		"config",
		"files",
		"status",
		"diff",
		"doctor",
		"push",
		"pull",
		"sync",
		"history",
		"rollback",
	]);
	if (options.target && !targetAllowed.has(command)) {
		throw new Error(`--target is not supported by /sync ${command}.`);
	}
	if ((options.yes || options.force) && !["push", "pull", "sync", "rollback"].includes(command)) {
		throw new Error(`Confirmation/force options are not supported by /sync ${command}.`);
	}
	if (options.stale && command !== "unlock") {
		throw new Error(`--stale is not supported by /sync ${command}.`);
	}
	const expectedValues = command === "rollback" || command === "use" ? 1 : 0;
	if (options.args.length !== expectedValues) {
		if (command === "rollback")
			throw new Error("Usage: /sync rollback <snapshot-id> [--yes] [--target <name>]");
		if (command === "use") throw new Error("Usage: /sync use <target>");
		throw new Error(`Unexpected argument for /sync ${command}: ${options.args.join(" ")}`);
	}
}

export function completeSyncArguments(argumentPrefix: string): CommandArgumentCompletion[] | null {
	const prefix = argumentPrefix.trimStart();
	if (prefix === "") return [...SYNC_COMMAND_COMPLETIONS];

	const trailingSpace = /\s$/.test(prefix);
	const tokens = splitArgs(prefix);
	if (tokens.length === 0) return [...SYNC_COMMAND_COMPLETIONS];

	const [command] = tokens;
	if (tokens.length === 1 && !trailingSpace) {
		const matches = SYNC_COMMAND_COMPLETIONS.filter((item) => item.value.startsWith(command));
		return matches.length > 0 ? [...matches] : null;
	}

	const args = tokens.slice(1);
	if (command === "use") {
		if (args.length > 1 || (trailingSpace && args.length > 0)) return null;
		return completeTargetValue(prefix, trailingSpace ? "" : (args[0] ?? ""));
	}
	const targetFlagIndex = args.lastIndexOf("--target");
	if (targetFlagIndex >= 0 && targetFlagIndex === args.length - (trailingSpace ? 1 : 2)) {
		const currentTarget = trailingSpace ? "" : (args.at(-1) ?? "");
		if (!currentTarget.startsWith("-")) return completeTargetValue(prefix, currentTarget);
	}

	const flagCompletions = SYNC_FLAG_COMPLETIONS[command];
	if (!flagCompletions) return null;

	const completedArgs = trailingSpace ? args : args.slice(0, -1);
	const completedValues = completedArgs.filter((arg) => !arg.startsWith("-"));
	if (command === "rollback" ? completedValues.length > 1 : completedValues.length > 0) {
		return null;
	}

	const current = trailingSpace ? "" : (args.at(-1) ?? "");
	if (current && !current.startsWith("-")) return null;

	const currentRaw = trailingSpace ? "" : (prefix.match(/\S+$/)?.[0] ?? "");
	const completionPrefix = trailingSpace
		? prefix
		: prefix.slice(0, prefix.length - currentRaw.length);
	const matches = flagCompletions.filter((item) => item.value.startsWith(current));
	return matches.length > 0
		? matches.map((item) => ({ ...item, value: `${completionPrefix}${item.value}` }))
		: null;
}

function completeTargetValue(prefix: string, current: string) {
	const currentRaw = current ? (prefix.match(/\S+$/u)?.[0] ?? "") : "";
	const completionPrefix = currentRaw ? prefix.slice(0, prefix.length - currentRaw.length) : prefix;
	const matches = targetCompletionNames.filter((name) => name.startsWith(current));
	return matches.length > 0
		? matches.map((name) => ({
				value: `${completionPrefix}${name}`,
				label: name,
				description: "Sync target",
			}))
		: null;
}

export function syncMenuOptions() {
	return SYNC_COMMANDS.map(({ name, description }) => `${name} — ${description}`);
}

export function syncCommandFromMenuOption(option: string): SyncCommandName | undefined {
	return SYNC_COMMANDS.find(({ name, description }) => option === `${name} — ${description}`)?.name;
}

export async function resolveSyncCommand(input: string, ctx: ExtensionCommandContext) {
	const [subcommand, ...rest] = splitArgs(input);
	if (subcommand) return { subcommand, rest };
	if (!ctx.hasUI) {
		ctx.ui.notify(usage(), "info");
		return undefined;
	}

	const selectedOption = await ctx.ui.select("pi-sync", syncMenuOptions());
	const selected = selectedOption ? syncCommandFromMenuOption(selectedOption) : undefined;
	if (!selected) return undefined;
	if (selected !== "rollback") return { subcommand: selected, rest: [] };

	const target = (await ctx.ui.input("Rollback snapshot", "snapshot id"))?.trim();
	if (!target) {
		ctx.ui.notify("Rollback cancelled.", "info");
		return undefined;
	}
	return { subcommand: selected, rest: [target] };
}

export function usage() {
	const commands = SYNC_COMMANDS.map(
		(command) => `${command.name}${"usageSuffix" in command ? command.usageSuffix : ""}`,
	).join(", ");
	return [
		"Usage: /sync <command>",
		`Commands: ${commands}`,
		"Settings: use /sync init or edit profiles and targets in ~/.pi/agent/pi-sync.local.json (or $PI_CODING_AGENT_DIR/pi-sync.local.json). Existing PI_SYNC_* overrides still work but are deprecated for future major-version removal.",
	].join("\n");
}
