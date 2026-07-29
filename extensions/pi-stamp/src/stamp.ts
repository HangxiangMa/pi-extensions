import type { EntryRenderer, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Component, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import {
	DEFAULT_STAMP_SETTINGS,
	formatMessageStampLabel,
	formatStampLabel,
	type StampSettings,
} from "./format.js";
import { showStampMenu } from "./menu.js";
import { createStampSettingsRuntime, type StampSettingsRuntime } from "./settings.js";

export const STAMP_ENTRY_TYPE = "pi-stamp";

export interface MessageStampDataV1 {
	version: 1;
	role: "user" | "assistant";
	timestamp: number;
}

export interface MessageStampDataV2 {
	version: 2;
	role: "user" | "assistant";
	timestamp: number;
	previousTimestamp?: number;
}

export interface AssistantMessageStampDataV3 {
	version: 3;
	role: "assistant";
	timestamp: number;
	previousTimestamp?: number;
	completedAt: number;
	firstContentAt?: number;
}

export type MessageStampData =
	| MessageStampDataV1
	| MessageStampDataV2
	| AssistantMessageStampDataV3;

export interface StampExtensionOptions {
	settingsRuntime?: StampSettingsRuntime;
	now?: () => number;
}

interface AssistantTimingObservation {
	timestamp: number;
	firstContentAt?: number;
}

interface FinalizedAssistantTiming extends AssistantTimingObservation {
	completedAt: number;
}

export function formatStampTime(timestamp: number): string | undefined {
	return formatStampLabel(timestamp, undefined, {
		...DEFAULT_STAMP_SETTINGS,
		dateContext: "never",
	});
}

export function isMessageStampData(value: unknown): value is MessageStampData {
	if (!isRecord(value) || !isStampRole(value.role) || !isValidTimestamp(value.timestamp)) {
		return false;
	}
	if (value.version === 1) {
		return hasOnlyKeys(value, ["version", "role", "timestamp"]);
	}
	if (value.version === 2) {
		return (
			hasOnlyKeys(value, ["version", "role", "timestamp", "previousTimestamp"]) &&
			(!Object.hasOwn(value, "previousTimestamp") || isValidTimestamp(value.previousTimestamp))
		);
	}
	if (
		value.version !== 3 ||
		value.role !== "assistant" ||
		!hasOnlyKeys(value, [
			"version",
			"role",
			"timestamp",
			"previousTimestamp",
			"completedAt",
			"firstContentAt",
		]) ||
		!isValidTimestamp(value.completedAt) ||
		value.completedAt < value.timestamp ||
		(Object.hasOwn(value, "previousTimestamp") && !isValidTimestamp(value.previousTimestamp))
	) {
		return false;
	}
	return (
		!Object.hasOwn(value, "firstContentAt") ||
		(isValidTimestamp(value.firstContentAt) &&
			value.firstContentAt >= value.timestamp &&
			value.firstContentAt <= value.completedAt)
	);
}

export function createStampEntryRenderer(
	getSettings: () => Readonly<StampSettings>,
): EntryRenderer<MessageStampData> {
	return (entry, _options, theme) => {
		if (!isMessageStampData(entry.data)) return undefined;
		const data = entry.data;
		return dynamicRightAlignedText(() => {
			const label = formatMessageStampLabel(
				{
					timestamp: data.timestamp,
					...(data.version === 1 ? {} : { previousTimestamp: data.previousTimestamp }),
					...(data.version === 3
						? {
								completedAt: data.completedAt,
								firstContentAt: data.firstContentAt,
							}
						: {}),
				},
				getSettings(),
			);
			return label ? theme.fg("dim", label) : undefined;
		});
	};
}

export const renderStampEntry = createStampEntryRenderer(() => DEFAULT_STAMP_SETTINGS);

function dynamicRightAlignedText(getText: () => string | undefined): Component {
	return {
		render(width) {
			if (width < 1) return [];
			const text = getText();
			if (!text) return [];
			return wrapTextWithAnsi(text, width).map((line) => {
				const leftPadding = " ".repeat(Math.max(0, width - visibleWidth(line)));
				return `${leftPadding}${line}`;
			});
		},
		invalidate() {},
	};
}

export default function stampExtension(
	pi: ExtensionAPI,
	options: StampExtensionOptions = {},
): void {
	const settingsRuntime = options.settingsRuntime ?? createStampSettingsRuntime();
	const now = options.now ?? Date.now;
	pi.registerEntryRenderer(
		STAMP_ENTRY_TYPE,
		createStampEntryRenderer(() => settingsRuntime.get().settings),
	);

	let generation = 0;
	let sessionController = new AbortController();
	let tuiSessionActive = false;
	let lastStampTimestamp: number | undefined;
	let activeAssistantTiming: AssistantTimingObservation | undefined;
	let finalizedAssistantTiming: FinalizedAssistantTiming | undefined;
	const pendingUserStamps: Array<{ role: "user"; timestamp: number }> = [];

	pi.registerCommand("stamp", {
		description: "Configure message timestamp presentation",
		handler: async (args, ctx) => {
			if (args.trim()) throw new Error("/stamp does not accept arguments.");
			if (ctx.mode === "print" || ctx.mode === "json") {
				throw new Error(`/stamp is unavailable in ${ctx.mode} mode; use TUI or RPC mode.`);
			}
			const commandGeneration = generation;
			const commandController = sessionController;
			await showStampMenu(ctx, settingsRuntime, {
				signal: commandController.signal,
				isCurrent: () =>
					commandGeneration === generation &&
					commandController === sessionController &&
					!commandController.signal.aborted,
			});
		},
	});

	const appendVersion2Stamp = (role: "user" | "assistant", timestamp: number): void => {
		const stamp: MessageStampDataV2 = {
			version: 2,
			role,
			timestamp,
			...(lastStampTimestamp === undefined ? {} : { previousTimestamp: lastStampTimestamp }),
		};
		if (!isMessageStampData(stamp)) return;
		pi.appendEntry<MessageStampDataV2>(STAMP_ENTRY_TYPE, stamp);
		lastStampTimestamp = timestamp;
	};

	const appendAssistantStamp = (
		timestamp: number,
		timing: FinalizedAssistantTiming | undefined,
	): void => {
		if (!timing || timing.timestamp !== timestamp) {
			appendVersion2Stamp("assistant", timestamp);
			return;
		}
		const stamp: AssistantMessageStampDataV3 = {
			version: 3,
			role: "assistant",
			timestamp,
			...(lastStampTimestamp === undefined ? {} : { previousTimestamp: lastStampTimestamp }),
			completedAt: timing.completedAt,
			...(timing.firstContentAt === undefined ? {} : { firstContentAt: timing.firstContentAt }),
		};
		if (!isMessageStampData(stamp)) {
			appendVersion2Stamp("assistant", timestamp);
			return;
		}
		pi.appendEntry<AssistantMessageStampDataV3>(STAMP_ENTRY_TYPE, stamp);
		lastStampTimestamp = timestamp;
	};

	const flushPendingUsers = (): void => {
		if (!tuiSessionActive) {
			pendingUserStamps.length = 0;
			return;
		}
		while (pendingUserStamps.length > 0) {
			const stamp = pendingUserStamps[0];
			if (!stamp) break;
			appendVersion2Stamp(stamp.role, stamp.timestamp);
			pendingUserStamps.shift();
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		sessionController.abort(new Error("pi-stamp session replaced"));
		sessionController = new AbortController();
		const controller = sessionController;
		const currentGeneration = ++generation;
		pendingUserStamps.length = 0;
		activeAssistantTiming = undefined;
		finalizedAssistantTiming = undefined;
		tuiSessionActive = ctx.mode === "tui";
		lastStampTimestamp = lastStampTimestampFromBranch(ctx.sessionManager.getBranch());
		try {
			const state = await settingsRuntime.reload(controller.signal);
			if (
				controller.signal.aborted ||
				currentGeneration !== generation ||
				controller !== sessionController
			) {
				return;
			}
			if (state.issue && ctx.hasUI) {
				ctx.ui.notify(safeTerminalText(state.issue.message), "warning");
			}
		} catch (error) {
			if (controller.signal.aborted) return;
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Could not load pi-stamp settings: ${safeTerminalText(formatError(error))}`,
					"warning",
				);
			}
		}
	});

	pi.on("turn_start", () => {
		activeAssistantTiming = undefined;
		finalizedAssistantTiming = undefined;
	});

	pi.on("message_start", (event) => {
		flushPendingUsers();
		if (
			!tuiSessionActive ||
			event.message.role !== "assistant" ||
			!isValidTimestamp(event.message.timestamp)
		) {
			return;
		}
		activeAssistantTiming = { timestamp: event.message.timestamp };
		finalizedAssistantTiming = undefined;
	});

	pi.on("message_update", (event) => {
		if (
			!tuiSessionActive ||
			event.message.role !== "assistant" ||
			!activeAssistantTiming ||
			activeAssistantTiming.timestamp !== event.message.timestamp ||
			activeAssistantTiming.firstContentAt !== undefined ||
			!isMeaningfulAssistantUpdate(event.assistantMessageEvent)
		) {
			return;
		}
		const firstContentAt = now();
		if (isValidTimestamp(firstContentAt)) activeAssistantTiming.firstContentAt = firstContentAt;
	});

	pi.on("message_end", (event) => {
		if (!tuiSessionActive || !isValidTimestamp(event.message.timestamp)) return;
		if (event.message.role === "user") {
			pendingUserStamps.push({ role: "user", timestamp: event.message.timestamp });
			return;
		}
		if (event.message.role !== "assistant") return;
		const completedAt = now();
		if (!isValidTimestamp(completedAt) || completedAt < event.message.timestamp) {
			activeAssistantTiming = undefined;
			finalizedAssistantTiming = undefined;
			return;
		}
		const firstContentAt =
			activeAssistantTiming?.timestamp === event.message.timestamp &&
			isValidTimestamp(activeAssistantTiming.firstContentAt) &&
			activeAssistantTiming.firstContentAt >= event.message.timestamp &&
			activeAssistantTiming.firstContentAt <= completedAt
				? activeAssistantTiming.firstContentAt
				: undefined;
		finalizedAssistantTiming = {
			timestamp: event.message.timestamp,
			completedAt,
			...(firstContentAt === undefined ? {} : { firstContentAt }),
		};
		activeAssistantTiming = undefined;
	});

	pi.on("turn_end", (event) => {
		if (!tuiSessionActive || event.message.role !== "assistant") return;
		const timing = finalizedAssistantTiming;
		activeAssistantTiming = undefined;
		finalizedAssistantTiming = undefined;
		appendAssistantStamp(event.message.timestamp, timing);
	});

	pi.on("agent_end", () => {
		flushPendingUsers();
		activeAssistantTiming = undefined;
		finalizedAssistantTiming = undefined;
	});

	pi.on("session_shutdown", async () => {
		sessionController.abort(new Error("pi-stamp session shut down"));
		generation += 1;
		flushPendingUsers();
		pendingUserStamps.length = 0;
		activeAssistantTiming = undefined;
		finalizedAssistantTiming = undefined;
		tuiSessionActive = false;
		lastStampTimestamp = undefined;
		await settingsRuntime.flush();
	});
}

function lastStampTimestampFromBranch(entries: readonly unknown[]): number | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (
			isRecord(entry) &&
			entry.type === "custom" &&
			entry.customType === STAMP_ENTRY_TYPE &&
			isMessageStampData(entry.data)
		) {
			return entry.data.timestamp;
		}
	}
	return undefined;
}

function isMeaningfulAssistantUpdate(value: unknown): boolean {
	if (!isRecord(value) || typeof value.type !== "string") return false;
	if (
		value.type === "text_delta" ||
		value.type === "thinking_delta" ||
		value.type === "toolcall_delta"
	) {
		return typeof value.delta === "string" && value.delta.length > 0;
	}
	if (value.type === "text_end" || value.type === "thinking_end") {
		return typeof value.content === "string" && value.content.length > 0;
	}
	return value.type === "toolcall_end" && isRecord(value.toolCall);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
	const allowedKeys = new Set(allowed);
	return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStampRole(value: unknown): value is MessageStampData["role"] {
	return value === "user" || value === "assistant";
}

function isValidTimestamp(value: unknown): value is number {
	return (
		typeof value === "number" && Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
	);
}

function safeTerminalText(value: string): string {
	return [...value]
		.map((character) => {
			const codePoint = character.codePointAt(0) ?? 0;
			return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? " " : character;
		})
		.join("")
		.trim();
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
