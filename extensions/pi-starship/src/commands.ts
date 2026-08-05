import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";
import { completeStarshipArguments, STARSHIP_SUBCOMMANDS } from "./command-contract.js";
import { showFooterExplanation } from "./command-inspector.js";
import { type PreviewMenuResult, showPreviewActionMenu } from "./command-preview.js";
import {
	atomicRestoreConfigDocument,
	atomicSaveConfigDocument,
	BUILT_IN_EXAMPLE,
	type LoadedStarshipConfig,
	removeConfigDocumentIfMatches,
	validateConfigDocument,
} from "./config.js";
import { inspectUnavailableModules, type StatuslineInspection } from "./modules/inspection.js";

const MAIN_ACTIONS = {
	customize: "customize",
	explain: "explain",
	modules: "modules",
	configuration: "configuration",
	help: "help",
	restore: "restore",
} as const;

const PREVIEW_ACTIONS = {
	continue: "continue",
	edit: "edit",
	cancel: "cancel",
} as const;

export interface StarshipCommandOptions {
	getLoaded(): LoadedStarshipConfig;
	getInspection?(): StatuslineInspection | undefined;
	apply(loaded: LoadedStarshipConfig, ctx: ExtensionCommandContext): void;
	settingsPath: string;
	renderPreview?(
		loaded: LoadedStarshipConfig,
		width: number,
		ctx: ExtensionCommandContext,
	): string[];
	save?: (settingsPath: string, rawDocument: string) => LoadedStarshipConfig;
	restore?: (settingsPath: string, rawDocument: string) => void;
	validate?: (settingsPath: string, rawDocument: string) => LoadedStarshipConfig;
	getMenuOwner?(): { signal: AbortSignal; isCurrent(): boolean };
}

interface WorkflowOwner {
	signal: AbortSignal;
	isCurrent(): boolean;
}

export function registerStarshipCommand(pi: ExtensionAPI, options: StarshipCommandOptions) {
	pi.registerCommand("starship", {
		description: "Customize or inspect the native Starship-style footer",
		getArgumentCompletions: completeStarshipArguments,
		handler: (args, ctx) => handleStarshipCommand(args, ctx, options),
	});
}

export async function handleStarshipCommand(
	args: string,
	ctx: ExtensionCommandContext,
	options: StarshipCommandOptions,
) {
	const normalized = args.trim();
	if (!normalized) {
		if (ctx.mode === "tui") await showMainMenu(ctx, options);
		else showHelp(ctx, options.settingsPath);
		return;
	}

	const [subcommand = "", ...trailing] = normalized.split(/\s+/u);
	const route = subcommand.toLowerCase();
	if (trailing.length > 0 || !STARSHIP_SUBCOMMANDS.some((item) => item.value === route)) {
		if (canNotify(ctx)) {
			const reason =
				trailing.length > 0
					? `Unexpected arguments for /starship ${safeText(route)}.`
					: `Unknown /starship subcommand: ${safeText(route)}.`;
			ctx.ui.notify(`${reason} Usage: /starship [settings|status|help]`, "warning");
		}
		return;
	}
	switch (route) {
		case "settings":
			await editSettings(ctx, options);
			return;
		case "status":
			showStatus(ctx, options);
			return;
		case "help":
			showHelp(ctx, options.settingsPath);
			return;
	}
}

async function showMainMenu(ctx: ExtensionCommandContext, options: StarshipCommandOptions) {
	const fallbackController = new AbortController();
	const owner = options.getMenuOwner?.() ?? {
		signal: fallbackController.signal,
		isCurrent: () => !fallbackController.signal.aborted,
	};
	type Screen = "main" | "modules" | "configuration" | "help";
	type Action = "customize" | "explain" | "restore";
	const menu = defineMenu<undefined, Screen, Action, ExtensionCommandContext>({
		start: "main",
		screens: {
			main: () => {
				const loaded = options.getLoaded();
				const presentation = configurationPresentation(loaded);
				return {
					kind: "actions",
					title: "pi-starship",
					lines: [`${presentation.state} · ${presentation.health}`],
					items: [
						{
							id: MAIN_ACTIONS.customize,
							label: "Customize footer",
							description: `${presentation.state} · preview before applying`,
							action: "customize",
						},
						{
							id: MAIN_ACTIONS.explain,
							label: "Explain footer",
							description: "Why each visible module appears",
							action: "explain",
						},
						{
							id: MAIN_ACTIONS.modules,
							label: "Modules",
							description: "Browse supported modules and current states",
							to: "modules",
						},
						{
							id: MAIN_ACTIONS.configuration,
							label: "Configuration",
							description: presentation.health,
							to: "configuration",
						},
						{
							id: MAIN_ACTIONS.help,
							label: "Help",
							description: "Formats, modules, and commands",
							to: "help",
						},
						{
							id: MAIN_ACTIONS.restore,
							label: "Restore built-in…",
							description: presentation.restoreDescription,
							disabled: presentation.restoreDisabled,
							action: "restore",
						},
					],
					hint: "close",
				};
			},
			modules: () => {
				const inspection =
					options.getInspection?.() ?? inspectUnavailableModules(options.getLoaded().config);
				return {
					kind: "browse",
					title: "Modules",
					items: inspection.modules.map((module) => ({
						id: module.name,
						label: module.name,
						statusText: module.state,
						description: module.description,
						searchText: [...module.variables, ...module.styleFields, ...module.displayRules].join(
							" ",
						),
						details: [
							`Root: ${module.rootReferenced ? "Referenced" : "Not referenced"}`,
							`Reachable: ${module.reachable ? "Yes" : "No"}`,
							...modulePreviewDetails(module.preview),
							`Reason: ${module.reason}`,
							`Variables: ${module.variables.join(", ") || "none"}`,
							`Style fields: ${module.styleFields.join(", ") || "none"}`,
							`Display rules: ${module.displayRules.join(" · ") || "none"}`,
						],
					})),
					viewportSize: "adaptive",
					hint: "back",
				};
			},
			configuration: () => {
				const loaded = options.getLoaded();
				const presentation = configurationPresentation(loaded);
				return {
					kind: "detail",
					title: "Configuration",
					lines: [
						`State: ${presentation.state}`,
						`Source: ${presentation.source}`,
						`Path: ${safeText(options.settingsPath)}`,
						...diagnosticLines(loaded, true),
					],
					hint: "back",
				};
			},
			help: () => ({
				kind: "detail",
				title: "pi-starship help",
				lines: [
					"Customize footer opens the TOML editor, then previews and confirms before saving.",
					"Explain footer breaks down the modules currently showing from the existing snapshot.",
					"Modules searches every supported module and explains its current read-only state.",
					"Configuration explains state, source, path, and warnings without changing the footer.",
					`Settings: ${safeText(options.settingsPath)}`,
					"Docs: https://github.com/narumiruna/pi-extensions/tree/main/extensions/pi-starship",
				],
				hint: "back",
			}),
		},
		actions: {
			customize: async () => {
				const result = await editSettings(ctx, options);
				return result === "applied" || result === "close" ? { kind: "close" } : { kind: "stay" };
			},
			explain: async () => {
				const result = await showFooterExplanation(ctx, options.getInspection?.(), owner.signal);
				if (!isCurrentOwner(owner)) return { kind: "stay" };
				return result?.kind === "back" ? { kind: "stay" } : { kind: "close" };
			},
			restore: async () => {
				const presentation = configurationPresentation(options.getLoaded());
				if (presentation.restoreDisabled) {
					ctx.ui.notify(presentation.restoreDescription, "info");
					return { kind: "stay" };
				}
				const result = await restoreBuiltIn(ctx, options);
				return result === "applied" || result === "close" ? { kind: "close" } : { kind: "stay" };
			},
		},
	});
	try {
		await runMenu(ctx, menu, {
			getState: () => undefined,
			signal: owner.signal,
			isCurrent: owner.isCurrent,
		});
	} finally {
		fallbackController.abort(new DOMException("Starship menu closed", "AbortError"));
	}
}

async function editSettings(
	ctx: ExtensionCommandContext,
	options: StarshipCommandOptions,
): Promise<"applied" | "cancel" | "close"> {
	const owner = workflowOwner(options);
	if (!isCurrentOwner(owner)) return "cancel";
	if (ctx.mode !== "tui") {
		if (ctx.hasUI) ctx.ui.notify(`Edit settings manually: ${options.settingsPath}`, "info");
		return "cancel";
	}
	let draft = options.getLoaded().rawDocument ?? BUILT_IN_EXAMPLE;
	while (true) {
		const edited = await ctx.ui.editor("Customize footer — close to preview", draft);
		if (!isCurrentOwner(owner) || edited === undefined) return "cancel";
		draft = edited;
		let validated: LoadedStarshipConfig;
		try {
			validated = (options.validate ?? validateConfigDocument)(options.settingsPath, draft);
		} catch (error) {
			ctx.ui.notify(`Footer draft is invalid: ${safeText(formatError(error))}`, "error");
			const action = await showPreviewActionMenu(
				ctx,
				"Configuration needs attention",
				() => [safeText(formatError(error)), "The current footer has not changed."],
				[
					{ value: PREVIEW_ACTIONS.edit, label: "Continue editing" },
					{ value: PREVIEW_ACTIONS.cancel, label: "Discard draft" },
				],
				owner.signal,
			);
			if (!isCurrentOwner(owner)) return "cancel";
			if (action?.kind === "closed") return "close";
			if (selectedPreviewAction(action) === PREVIEW_ACTIONS.edit) continue;
			return "cancel";
		}

		const result = await reviewAndApply(ctx, options, validated, "Footer preview", false, owner);
		if (result === "edit") continue;
		return result;
	}
}

async function restoreBuiltIn(
	ctx: ExtensionCommandContext,
	options: StarshipCommandOptions,
): Promise<"applied" | "cancel" | "close"> {
	const owner = workflowOwner(options);
	if (!isCurrentOwner(owner)) return "cancel";
	const validated = (options.validate ?? validateConfigDocument)(
		options.settingsPath,
		BUILT_IN_EXAMPLE,
	);
	const result = await reviewAndApply(ctx, options, validated, "Restore preview", true, owner);
	return result === "edit" ? "cancel" : result;
}

async function reviewAndApply(
	ctx: ExtensionCommandContext,
	options: StarshipCommandOptions,
	validated: LoadedStarshipConfig,
	title: string,
	restore: boolean,
	owner: WorkflowOwner,
): Promise<"applied" | "edit" | "cancel" | "close"> {
	while (true) {
		const selection = await showPreviewActionMenu(
			ctx,
			title,
			(width) =>
				restore
					? restorePreviewBody(ctx, options, validated, width)
					: previewBody(ctx, options, validated, width),
			[
				{
					value: PREVIEW_ACTIONS.continue,
					label: restore ? "Replace with built-in…" : "Apply changes…",
				},
				...(restore ? [] : [{ value: PREVIEW_ACTIONS.edit, label: "Continue editing" }]),
				{
					value: PREVIEW_ACTIONS.cancel,
					label: restore ? "Cancel" : "Discard draft",
				},
			],
			owner.signal,
		);
		if (!isCurrentOwner(owner)) return "cancel";
		if (selection?.kind === "closed") return "close";
		const selected = selectedPreviewAction(selection);
		if (selected === PREVIEW_ACTIONS.edit) return "edit";
		if (selected !== PREVIEW_ACTIONS.continue) return "cancel";

		const confirmed = await ctx.ui.confirm(
			restore ? "Restore built-in footer?" : "Apply footer changes?",
			restore
				? `Replace ${safeText(options.settingsPath)} entirely with the built-in configuration? All custom settings, unknown fields, and comments will be removed. No backup is kept after success.`
				: "Save this configuration and apply it immediately?",
		);
		if (!isCurrentOwner(owner)) return "cancel";
		if (!confirmed) continue;

		const save = options.save ?? atomicSaveConfigDocument;
		const previous = options.getLoaded();
		let saved: LoadedStarshipConfig;
		try {
			saved = save(options.settingsPath, validated.rawDocument ?? BUILT_IN_EXAMPLE);
		} catch (error) {
			ctx.ui.notify(
				`Footer settings were not saved: ${safeText(formatError(error))}. The previous footer remains active.`,
				"error",
			);
			continue;
		}

		try {
			options.apply(saved, ctx);
		} catch (error) {
			const rollbackError = restorePreviousConfiguration(ctx, options, previous, saved);
			ctx.ui.notify(
				rollbackError
					? `Footer settings could not be applied: ${safeText(formatError(error))}. Restoring the previous configuration also failed: ${safeText(formatError(rollbackError))}.`
					: `Footer settings could not be applied: ${safeText(formatError(error))}. The previous configuration was restored.`,
				"error",
			);
			continue;
		}

		const warningSuffix =
			saved.diagnostics.length > 0
				? ` (${saved.diagnostics.length} warning${saved.diagnostics.length === 1 ? "" : "s"})`
				: "";
		ctx.ui.notify(
			restore
				? `Built-in footer restored and applied${warningSuffix}.`
				: `Footer settings saved and applied${warningSuffix}.`,
			"info",
		);
		return "applied";
	}
}

function modulePreviewDetails(preview: string): string[] {
	const lines = preview ? preview.split("\n") : ["(no current preview)"];
	return lines.map((line, index) => `${index === 0 ? "Preview: " : "         "}${line}`);
}

function workflowOwner(options: StarshipCommandOptions): WorkflowOwner {
	if (options.getMenuOwner) return options.getMenuOwner();
	const controller = new AbortController();
	return { signal: controller.signal, isCurrent: () => true };
}

function isCurrentOwner(owner: WorkflowOwner): boolean {
	return !owner.signal.aborted && owner.isCurrent();
}

function restorePreviousConfiguration(
	ctx: ExtensionCommandContext,
	options: StarshipCommandOptions,
	previous: LoadedStarshipConfig,
	saved: LoadedStarshipConfig,
): unknown {
	try {
		if (saved.rawDocument === undefined || saved.fileIdentity === undefined) {
			throw new Error("The saved settings document identity is unavailable");
		}
		removeConfigDocumentIfMatches(options.settingsPath, saved.rawDocument, saved.fileIdentity);
		if (previous.rawDocument !== undefined) {
			(options.restore ?? atomicRestoreConfigDocument)(options.settingsPath, previous.rawDocument);
		}
		options.apply(previous, ctx);
		return undefined;
	} catch (error) {
		return error;
	}
}

function restorePreviewBody(
	ctx: ExtensionCommandContext,
	options: StarshipCommandOptions,
	loaded: LoadedStarshipConfig,
	width: number,
): string[] {
	const current = configurationPresentation(options.getLoaded());
	return [
		`Current: ${current.state}`,
		`Path: ${safeText(options.settingsPath)}`,
		"The entire settings document will be replaced, including custom settings, unknown fields, and comments.",
		"No backup is kept after a successful restore.",
		"",
		...previewBody(ctx, options, loaded, width),
	];
}

function previewBody(
	ctx: ExtensionCommandContext,
	options: StarshipCommandOptions,
	loaded: LoadedStarshipConfig,
	width: number,
): string[] {
	let lines: string[];
	try {
		lines = options.renderPreview?.(loaded, width, ctx) ?? [
			"Live preview is unavailable until the footer is ready.",
			"The draft is valid and can still be applied.",
		];
	} catch (error) {
		lines = [`Preview unavailable: ${safeText(formatError(error))}`];
	}
	const warning =
		loaded.diagnostics.length === 0
			? "Draft validation: Healthy"
			: `Draft validation: ${loaded.diagnostics.length} warning${loaded.diagnostics.length === 1 ? "" : "s"}`;
	return [...lines, "", warning];
}

function selectedPreviewAction<Value extends string>(
	result: PreviewMenuResult<Value> | undefined,
): Value | null {
	return result?.kind === "selected" ? result.value : null;
}

function diagnosticLines(loaded: LoadedStarshipConfig, includeSummary: boolean): string[] {
	const diagnostics = loaded.diagnostics
		.slice(0, 8)
		.map((item) => `${safeText(item.path || "root")}: ${safeText(item.message)}`);
	const remaining = loaded.diagnostics.length - diagnostics.length;
	return [
		...(includeSummary ? [`Health: ${configurationHealth(loaded)}`] : []),
		...(diagnostics.length > 0 ? diagnostics : ["No configuration warnings."]),
		...(remaining > 0 ? [`${remaining} additional warnings not shown.`] : []),
	];
}

interface ConfigurationPresentation {
	state: string;
	source: string;
	health: string;
	restoreDisabled: boolean;
	restoreDescription: string;
}

function configurationPresentation(loaded: LoadedStarshipConfig): ConfigurationPresentation {
	const healthyMissing =
		loaded.source === "built-in" &&
		loaded.rawDocument === undefined &&
		loaded.diagnostics.length === 0;
	const savedBuiltIn = loaded.source === "user" && loaded.rawDocument === BUILT_IN_EXAMPLE;
	const fallback = loaded.source === "built-in" && loaded.diagnostics.length > 0;
	return {
		state: healthyMissing
			? "Built-in defaults"
			: savedBuiltIn
				? "Saved built-in configuration"
				: fallback
					? "Built-in fallback"
					: "Custom configuration",
		source: healthyMissing
			? "No settings file"
			: loaded.source === "user"
				? "User file"
				: "Built-in fallback",
		health: configurationHealth(loaded),
		restoreDisabled: healthyMissing || savedBuiltIn,
		restoreDescription: healthyMissing
			? "Already using defaults · no file to replace"
			: savedBuiltIn
				? "Built-in configuration already saved"
				: fallback
					? "Preview before replacing invalid settings"
					: "Preview before replacing the document",
	};
}

function configurationHealth(loaded: LoadedStarshipConfig): string {
	const errors = loaded.diagnostics.filter((item) => item.severity === "error").length;
	if (errors > 0) return `${errors} error${errors === 1 ? "" : "s"}`;
	const warnings = loaded.diagnostics.length;
	return warnings === 0 ? "Healthy" : `${warnings} warning${warnings === 1 ? "" : "s"}`;
}

function showStatus(ctx: ExtensionCommandContext, options: StarshipCommandOptions) {
	if (!canNotify(ctx)) return;
	const loaded = options.getLoaded();
	const diagnostics = loaded.diagnostics
		.slice(0, 5)
		.map((item) => `${safeText(item.path || "root")}: ${safeText(item.message)}`)
		.join("; ");
	ctx.ui.notify(
		[
			`pi-starship source: ${loaded.source}`,
			`path: ${options.settingsPath}`,
			diagnostics ? `warnings: ${diagnostics}` : "warnings: none",
		].join("\n"),
		loaded.diagnostics.length > 0 ? "warning" : "info",
	);
}

function showHelp(ctx: ExtensionCommandContext, settingsPath: string) {
	if (!canNotify(ctx)) return;
	ctx.ui.notify(
		[
			"/starship — customize, explain, or inspect the footer in TUI mode",
			"/starship settings — customize, preview, and apply TOML",
			"/starship status — show source, path, and warnings",
			"/starship help — show this help",
			`Settings: ${settingsPath}`,
			"Format/module docs: https://github.com/narumiruna/pi-extensions/tree/main/extensions/pi-starship",
		].join("\n"),
		"info",
	);
}

function canNotify(ctx: ExtensionCommandContext): boolean {
	return ctx.mode === "tui" || ctx.hasUI;
}

function safeText(value: string): string {
	return Array.from(value, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		const unsafe =
			codePoint <= 0x08 ||
			(codePoint >= 0x0b && codePoint <= 0x1f) ||
			(codePoint >= 0x7f && codePoint <= 0x9f);
		return unsafe ? `\\u${codePoint.toString(16).padStart(4, "0")}` : character;
	}).join("");
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
