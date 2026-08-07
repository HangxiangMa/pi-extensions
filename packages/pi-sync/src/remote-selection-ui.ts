import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";
import { createSyncBackend, type SyncBackendFactory } from "./backend-factory.js";
import { loadConfig, loadPartialConfig } from "./config.js";
import { readSnapshotForHead } from "./remote-snapshot.js";
import { updateSyncSetup } from "./settings-management.js";
import type { RemoteHead, SyncBackend } from "./sync-backend.js";
import { errorMessage, safeTerminalText } from "./sync-format.js";
import {
	inspectRemoteSelection,
	type RemoteSelectionState,
	sameSyncInclude,
} from "./sync-policy.js";
import type { AnySyncConfig } from "./types.js";

const STATUS_KEY = "sync";

export async function showRemoteSelectionReview(
	ctx: ExtensionCommandContext,
	setupName?: string,
	signal?: AbortSignal,
	factory: SyncBackendFactory = createSyncBackend,
) {
	try {
		const config = await loadConfig(setupName);
		if (signal?.aborted) return;
		const storageReview = await loadPartialConfig(config.setupName);
		if (signal?.aborted) return;
		ctx.ui.setStatus(STATUS_KEY, `checking remote selection for ${config.setupName}`);
		const backend = await factory(config);
		if (signal?.aborted) return;
		const head = await backend.readHead(signal);
		if (signal?.aborted) return;
		if (!head) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.notify("Remote storage has no snapshot or included-content policy yet.", "info");
			return;
		}
		const snapshot = await readSnapshotForHead(backend, head, signal);
		if (signal?.aborted) return;
		const state = inspectRemoteSelection(config.include, snapshot);
		ctx.ui.setStatus(STATUS_KEY, undefined);

		if (ctx.mode !== "tui") {
			ctx.ui.notify(
				formatRemoteSelectionSummary(config, state),
				state.kind === "different" ? "warning" : "info",
			);
			return;
		}
		if (state.kind === "same") {
			ctx.ui.notify("Remote included content already matches this sync setup.", "info");
			return;
		}
		if (state.kind === "legacy") {
			await showLegacyDiscovery(ctx, config, state.discovered, signal);
			return;
		}
		await showSelectionDifference(ctx, config, storageReview, backend, head, state, signal);
	} catch (error) {
		if (signal?.aborted) return;
		ctx.ui.notify(`Could not review remote included content: ${errorMessage(error)}`, "error");
	} finally {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

async function showSelectionDifference(
	ctx: ExtensionCommandContext,
	config: AnySyncConfig,
	storageReview: Awaited<ReturnType<typeof loadPartialConfig>>,
	backend: SyncBackend,
	reviewedHead: RemoteHead,
	state: Extract<RemoteSelectionState, { kind: "different" }>,
	sessionSignal?: AbortSignal,
) {
	type Screen = "choice" | "review";
	type Action = "adopt" | "keep" | "cancel";
	const menu = defineMenu<undefined, Screen, Action, ExtensionCommandContext>({
		start: "choice",
		screens: {
			choice: () => ({
				kind: "actions",
				title: `Remote included content · ${safeTerminalText(config.setupName)}`,
				lines: [
					"The remote selection differs from this local sync setup.",
					"No settings or files have been changed.",
				],
				items: [
					{
						id: "adopt",
						label: "Adopt remote included content",
						description: "Save the reviewed remote paths locally without pulling files.",
						action: "adopt",
					},
					{
						id: "keep",
						label: "Keep local included content",
						description: "Make no settings change; a reviewed force push can publish it later.",
						action: "keep",
					},
					{
						id: "review",
						label: "Review paths",
						description: "Compare exact local-only and remote-only selection paths.",
						to: "review",
					},
					{ id: "cancel", label: "Cancel", action: "cancel" },
				],
				hint: "close",
			}),
			review: () => ({
				kind: "review",
				title: `Review remote included content · ${safeTerminalText(config.setupName)}`,
				content: formatSelectionDifference(config.include, state),
				format: { kind: "text" },
				viewportSize: "adaptive",
				hint: "back",
			}),
		},
		actions: {
			adopt: async ({ signal: actionSignal }) => {
				const signal = sessionSignal
					? AbortSignal.any([sessionSignal, actionSignal])
					: actionSignal;
				try {
					if (!config.include.includes("sessions") && state.include.includes("sessions")) {
						const acknowledged = await ctx.ui.confirm(
							"Adopt session conversations?",
							"Session JSONL may contain prompts, tool output, file paths, images, and secrets. This saves the selection only; it does not pull files.",
							{ signal },
						);
						if (signal.aborted) return { kind: "close" as const };
						if (!acknowledged) return { kind: "stay" as const };
					}
					if (signal.aborted) return { kind: "close" as const };
					const currentHead = await backend.readHead(signal);
					if (signal.aborted) return { kind: "close" as const };
					if (!currentHead || !backend.sameRevision(reviewedHead.revision, currentHead.revision)) {
						throw new Error(
							"Remote changed while the included-content review was open; reopen it.",
						);
					}
					const currentSnapshot = await readSnapshotForHead(backend, currentHead, signal);
					if (signal.aborted) return { kind: "close" as const };
					const currentState = inspectRemoteSelection(config.include, currentSnapshot);
					if (
						currentState.kind === "legacy" ||
						!sameSyncInclude(currentState.include, state.include)
					) {
						throw new Error(
							"Remote included content changed while the review was open; reopen it.",
						);
					}
					await updateSyncSetup(
						config.setupName,
						(setup) => ({
							...setup,
							sync: { ...setup.sync, include: [...state.include] },
						}),
						{
							expectedStorage: storageReview,
							expectedInclude: config.include,
							signal,
						},
					);
					if (signal.aborted) return { kind: "close" as const };
					ctx.ui.notify(
						`Saved remote included content for sync setup “${safeTerminalText(config.setupName)}”. No files were pulled; review Sync now separately.`,
						"info",
					);
					return { kind: "close" as const };
				} catch (error) {
					if (signal.aborted) return { kind: "close" as const };
					ctx.ui.notify(`Could not adopt remote included content: ${errorMessage(error)}`, "error");
					return { kind: "close" as const };
				}
			},
			keep: async () => {
				ctx.ui.notify(
					"Kept local included content. No settings or files changed; use a reviewed force push to publish the local selection.",
					"info",
				);
				return { kind: "close" };
			},
			cancel: async () => ({ kind: "close" }),
		},
	});
	await runMenu(ctx, menu, {
		getState: () => undefined,
		signal: sessionSignal,
		isCurrent: () => !sessionSignal?.aborted,
	});
}

async function showLegacyDiscovery(
	ctx: ExtensionCommandContext,
	config: AnySyncConfig,
	discovered: string[],
	signal?: AbortSignal,
) {
	const menu = defineMenu<undefined, "choice" | "review", "back", ExtensionCommandContext>({
		start: "choice",
		screens: {
			choice: () => ({
				kind: "actions",
				title: `Remote included content · ${safeTerminalText(config.setupName)}`,
				lines: [
					"This legacy snapshot has no portable included-content policy.",
					"Discovered paths are partial and read-only; preserved files may not have been selected.",
				],
				items: [
					{ id: "review", label: "Review discovered paths", to: "review" },
					{ id: "back", label: "Back", action: "back" },
				],
				hint: "close",
			}),
			review: () => ({
				kind: "review",
				title: "Partial discovery from legacy snapshot",
				content: [
					"Partial discovery only — not an authoritative selection.",
					"",
					...(discovered.length > 0
						? discovered.map((item) => `Discovered: ${safeTerminalText(item)}`)
						: ["No safe paths were discovered."]),
					"",
					"Use Add custom path… in the local Included Content editor if needed.",
				].join("\n"),
				format: { kind: "text" },
				viewportSize: "adaptive",
				hint: "back",
			}),
		},
		actions: { back: async () => ({ kind: "close" }) },
	});
	await runMenu(ctx, menu, {
		getState: () => undefined,
		signal,
		isCurrent: () => !signal?.aborted,
	});
}

function formatSelectionDifference(
	localInclude: readonly string[],
	state: Extract<RemoteSelectionState, { kind: "different" }>,
) {
	return [
		"Remote-only selection:",
		...(state.remoteOnly.length > 0
			? state.remoteOnly.map((item) => `+ ${safeTerminalText(item)}`)
			: ["(none)"]),
		"",
		"Local-only selection:",
		...(state.localOnly.length > 0
			? state.localOnly.map((item) => `- ${safeTerminalText(item)}`)
			: ["(none)"]),
		"",
		`Remote order: ${state.include.map(safeTerminalText).join(", ") || "none"}`,
		`Local order: ${localInclude.map(safeTerminalText).join(", ") || "none"}`,
		"",
		"Adopting saves settings only and does not pull files.",
	].join("\n");
}

function formatRemoteSelectionSummary(config: AnySyncConfig, state: RemoteSelectionState) {
	if (state.kind === "same") {
		return `Remote included content for “${safeTerminalText(config.setupName)}” matches local settings.`;
	}
	if (state.kind === "legacy") {
		return `Remote snapshot for “${safeTerminalText(config.setupName)}” has no portable included-content policy; ${state.discovered.length} safe path${state.discovered.length === 1 ? " was" : "s were"} discovered, but the result is partial and read-only.`;
	}
	return [
		`Remote included content for “${safeTerminalText(config.setupName)}” differs from local settings.`,
		`Remote-only: ${state.remoteOnly.map(safeTerminalText).join(", ") || "none"}`,
		`Local-only: ${state.localOnly.map(safeTerminalText).join(", ") || "none"}`,
		"Use TUI Settings to review or adopt it; RPC is read-only.",
	].join("\n");
}
