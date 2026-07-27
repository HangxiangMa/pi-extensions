import fs from "node:fs/promises";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";
import {
	agentDir,
	deprecatedPiSyncEnvironmentWarnings,
	isExplicitlyEnabled,
	loadPartialConfig,
	localConfigPath,
	updateLocalConfig,
} from "./config.js";
import {
	DEFAULT_SYNC_FILES,
	isSafeExtraFileName,
	normalizeExtraFiles,
	normalizeSyncFiles,
} from "./sync-policy.js";

const INCLUDED = "included";
const EXCLUDED = "excluded";
const BUILT_IN_PREFIX = "builtin:";
const EXTRA_PREFIX = "extra:";
const SESSIONS_ID = "sessions";

interface SelectionDraft {
	builtIns: Set<string>;
	extras: Set<string>;
	sessions: boolean;
}

export async function showFileSelection(ctx: ExtensionCommandContext, targetName?: string) {
	const partial = await loadPartialConfig(targetName);
	const original: SelectionDraft = {
		builtIns: new Set(normalizeSyncFiles(partial.syncFiles)),
		extras: new Set(normalizeExtraFiles(partial.extraFiles)),
		sessions: isExplicitlyEnabled(partial.syncSessions),
	};
	const draft = cloneDraft(original);
	const s3 = partial.storageKind !== "webdav" && partial.storageKind !== "git";
	const sessionEnvironmentOverride = s3 && Object.hasOwn(process.env, "PI_SYNC_SESSIONS");
	const extraCandidates = await listExtraFileCandidates(draft.extras);

	if (ctx.mode !== "tui") {
		ctx.ui.notify(
			[
				`pi-sync included content for sync setup ${safeTerminalText(partial.target ?? "default")}:`,
				`built-ins: ${[...draft.builtIns].join(", ") || "none"}`,
				`sessions: ${draft.sessions ? INCLUDED : EXCLUDED}${sessionEnvironmentOverride ? " (PI_SYNC_SESSIONS, deprecated)" : ""}`,
				`extra files: ${[...draft.extras].map(safeTerminalText).join(", ") || "none"}`,
				`Edit syncFiles, syncSessions, and extraFiles in ${safeTerminalText(localConfigPath())}.`,
				...(s3 ? deprecatedPiSyncEnvironmentWarnings() : []),
			].join("\n"),
			"info",
		);
		return;
	}

	while (true) {
		await showDraftEditor(
			ctx,
			partial.target ?? "default",
			draft,
			extraCandidates,
			sessionEnvironmentOverride,
		);
		if (sameDraft(original, draft)) return;
		const choice = await ctx.ui.select(formatDraftPreview(original, draft), [
			"Save changes",
			"Discard changes",
			"Continue editing",
		]);
		if (choice === "Continue editing") continue;
		if (choice !== "Save changes") {
			ctx.ui.notify("Synced-content changes discarded.", "info");
			return;
		}
		try {
			await persistSelectionDraft(draft, targetName, sessionEnvironmentOverride);
			ctx.ui.notify(
				`Saved included content for sync setup “${safeTerminalText(partial.target ?? "default")}”. It applies to the next manual or automatic sync.`,
				"info",
			);
		} catch (error) {
			ctx.ui.notify(`Could not save pi-sync file selection: ${errorMessage(error)}`, "error");
		}
		return;
	}
}

async function showDraftEditor(
	ctx: ExtensionCommandContext,
	targetName: string,
	draft: SelectionDraft,
	extraCandidates: string[],
	sessionEnvironmentOverride: boolean,
) {
	const items: SettingItem[] = [
		...DEFAULT_SYNC_FILES.map((fileName) => ({
			id: `${BUILT_IN_PREFIX}${fileName}`,
			label: fileName,
			description: fileName.includes(".")
				? `Sync the top-level ${fileName} file when present.`
				: `Recursively sync every safe file under ${fileName}/.`,
			currentValue: draft.builtIns.has(fileName) ? INCLUDED : EXCLUDED,
			values: [INCLUDED, EXCLUDED],
		})),
		{
			id: SESSIONS_ID,
			label: "sessions",
			description: sessionEnvironmentOverride
				? "Read-only because deprecated PI_SYNC_SESSIONS currently overrides this setup. Move it into sync setup settings before the future major removal."
				: "Session JSONL may contain prompts, tool output, paths, images, and secrets. Sync only to storage you trust.",
			currentValue: sessionEnvironmentOverride
				? `${draft.sessions ? INCLUDED : EXCLUDED} (environment, deprecated)`
				: draft.sessions
					? INCLUDED
					: EXCLUDED,
			...(sessionEnvironmentOverride ? {} : { values: [INCLUDED, EXCLUDED] }),
		},
		...extraCandidates.map((fileName) => ({
			id: `${EXTRA_PREFIX}${fileName}`,
			label: safeTerminalText(fileName),
			description:
				"Additional safe top-level file. It may be absent locally and pulled from another machine.",
			currentValue: draft.extras.has(fileName) ? INCLUDED : EXCLUDED,
			values: [INCLUDED, EXCLUDED],
		})),
	];

	await ctx.ui.custom((tui, theme, _keybindings, done) => {
		const container = new Container();
		const title = new Text("", 1, 0);
		const hint = new Text("", 1, 0);
		const updateChrome = () => {
			title.setText(
				theme.fg("accent", theme.bold(`Included Content · ${safeTerminalText(targetName)}`)),
			);
			hint.setText(theme.fg("dim", "Draft only · Esc reviews Save, Discard, or Continue editing."));
		};
		updateChrome();
		container.addChild(title);
		const settingsList = new SettingsList(
			items,
			Math.min(items.length + 2, 15),
			getSettingsListTheme(),
			(id, newValue) => updateDraft(draft, id, newValue === INCLUDED),
			() => done(undefined),
		);
		container.addChild(settingsList);
		container.addChild(hint);
		return {
			render(width: number) {
				return container.render(width);
			},
			invalidate() {
				updateChrome();
				container.invalidate();
			},
			handleInput(data: string) {
				settingsList.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

function updateDraft(draft: SelectionDraft, id: string, included: boolean) {
	if (id.startsWith(BUILT_IN_PREFIX)) {
		const fileName = id.slice(BUILT_IN_PREFIX.length);
		if (included) draft.builtIns.add(fileName);
		else draft.builtIns.delete(fileName);
		return;
	}
	if (id.startsWith(EXTRA_PREFIX)) {
		const fileName = id.slice(EXTRA_PREFIX.length);
		if (included) draft.extras.add(fileName);
		else draft.extras.delete(fileName);
		return;
	}
	if (id === SESSIONS_ID) {
		draft.sessions = included;
		return;
	}
	throw new Error(`Unknown file selection: ${id}`);
}

async function persistSelectionDraft(
	draft: SelectionDraft,
	targetName: string | undefined,
	sessionEnvironmentOverride: boolean,
) {
	await updateLocalConfig((current) => {
		const selection = {
			syncFiles: DEFAULT_SYNC_FILES.filter((candidate) => draft.builtIns.has(candidate)),
			...(!sessionEnvironmentOverride ? { syncSessions: draft.sessions } : {}),
			extraFiles: [...draft.extras],
		};
		if (current.version !== 2) return { ...current, ...selection };
		const targets = asObject(current.targets);
		const selectedTarget =
			targetName ?? (typeof current.activeTarget === "string" ? current.activeTarget : undefined);
		if (!targets || !selectedTarget) throw new Error("Current sync setup is not configured.");
		const target = asObject(targets[selectedTarget]);
		if (!target) throw new Error(`Sync setup not found: ${selectedTarget}`);
		return {
			...current,
			targets: { ...targets, [selectedTarget]: { ...target, ...selection } },
		};
	});
}

function formatDraftPreview(original: SelectionDraft, draft: SelectionDraft) {
	const lines = ["Review synced-content changes", ""];
	for (const item of DEFAULT_SYNC_FILES) {
		if (original.builtIns.has(item) === draft.builtIns.has(item)) continue;
		lines.push(`${draft.builtIns.has(item) ? "Include" : "Exclude"}: ${item}`);
	}
	for (const item of new Set([...original.extras, ...draft.extras])) {
		if (original.extras.has(item) === draft.extras.has(item)) continue;
		lines.push(`${draft.extras.has(item) ? "Include" : "Exclude"}: ${safeTerminalText(item)}`);
	}
	if (original.sessions !== draft.sessions) {
		lines.push(`${draft.sessions ? "Include" : "Exclude"}: sessions`);
		if (draft.sessions)
			lines.push("Warning: sessions may contain prompts, tool output, images, and secrets.");
	}
	lines.push("", "Saving does not start a network sync.");
	return lines.join("\n");
}

async function listExtraFileCandidates(configured: Set<string>) {
	const candidates = new Map([...configured].map((fileName) => [fileName.toLowerCase(), fileName]));
	try {
		for (const entry of await fs.readdir(agentDir(), { withFileTypes: true })) {
			if (!entry.isFile() || !isSafeExtraFileName(entry.name)) continue;
			if (!candidates.has(entry.name.toLowerCase())) {
				candidates.set(entry.name.toLowerCase(), entry.name);
			}
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	return [...candidates.values()].sort((left, right) => left.localeCompare(right));
}

function cloneDraft(value: SelectionDraft): SelectionDraft {
	return {
		builtIns: new Set(value.builtIns),
		extras: new Set(value.extras),
		sessions: value.sessions,
	};
}

function sameDraft(left: SelectionDraft, right: SelectionDraft) {
	return (
		left.sessions === right.sessions &&
		sameSet(left.builtIns, right.builtIns) &&
		sameSet(left.extras, right.extras)
	);
}

function sameSet(left: Set<string>, right: Set<string>) {
	return left.size === right.size && [...left].every((item) => right.has(item));
}

function asObject(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function safeTerminalText(value: string) {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Escape untrusted terminal controls.
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "?");
}

function errorMessage(error: unknown) {
	return safeTerminalText(error instanceof Error ? error.message : String(error));
}
