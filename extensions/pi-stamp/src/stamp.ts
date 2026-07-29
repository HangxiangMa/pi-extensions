import type { EntryRenderer, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export const STAMP_ENTRY_TYPE = "pi-stamp";

export interface MessageStampData {
	version: 1;
	role: "user" | "assistant";
	timestamp: number;
}

export function formatStampTime(timestamp: number): string | undefined {
	if (!Number.isFinite(timestamp)) return undefined;
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return undefined;
	return [date.getHours(), date.getMinutes(), date.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

export function isMessageStampData(value: unknown): value is MessageStampData {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<MessageStampData>;
	return (
		candidate.version === 1 &&
		(candidate.role === "user" || candidate.role === "assistant") &&
		typeof candidate.timestamp === "number" &&
		formatStampTime(candidate.timestamp) !== undefined
	);
}

export const renderStampEntry: EntryRenderer<MessageStampData> = (entry, _options, theme) => {
	if (!isMessageStampData(entry.data)) return undefined;
	const time = formatStampTime(entry.data.timestamp);
	if (!time) return undefined;
	return new Text(theme.fg("dim", time), 0, 0);
};

export default function stampExtension(pi: ExtensionAPI): void {
	pi.registerEntryRenderer(STAMP_ENTRY_TYPE, renderStampEntry);

	let tuiSessionActive = false;
	const pendingUserStamps: MessageStampData[] = [];

	const appendStamp = (stamp: MessageStampData): void => {
		pi.appendEntry<MessageStampData>(STAMP_ENTRY_TYPE, stamp);
	};

	const flushPendingUsers = (): void => {
		if (!tuiSessionActive) {
			pendingUserStamps.length = 0;
			return;
		}
		for (const stamp of pendingUserStamps.splice(0)) appendStamp(stamp);
	};

	pi.on("session_start", (_event, ctx) => {
		pendingUserStamps.length = 0;
		tuiSessionActive = ctx.mode === "tui";
	});

	pi.on("message_end", (event) => {
		if (!tuiSessionActive || event.message.role !== "user") return;
		const stamp: MessageStampData = {
			version: 1,
			role: "user",
			timestamp: event.message.timestamp,
		};
		if (isMessageStampData(stamp)) pendingUserStamps.push(stamp);
	});

	pi.on("message_start", () => {
		flushPendingUsers();
	});

	pi.on("turn_end", (event) => {
		if (!tuiSessionActive || event.message.role !== "assistant") return;
		const stamp: MessageStampData = {
			version: 1,
			role: "assistant",
			timestamp: event.message.timestamp,
		};
		if (isMessageStampData(stamp)) appendStamp(stamp);
	});

	pi.on("agent_end", () => {
		flushPendingUsers();
	});

	pi.on("session_shutdown", () => {
		flushPendingUsers();
		pendingUserStamps.length = 0;
		tuiSessionActive = false;
	});
}
