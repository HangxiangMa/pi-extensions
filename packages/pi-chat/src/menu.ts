import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { MenuDefinition } from "@narumitw/pi-tui-kit";
import type { ChatSnapshot } from "./chat-session.js";
import { normalizeNickname } from "./identity.js";
import { createPublicRoom, parseInvite, type RoomDescriptor } from "./protocol.js";
import { type ChatSettings, descriptorFromRememberedRoom, type WidgetMode } from "./settings.js";
import { sanitizeSingleLine } from "./text.js";

export interface JoinRoomOptions {
	remember: boolean;
}

export interface ChatMenuSource {
	settingsPath: string;
	getSettings(): ChatSettings;
	getSnapshot(): ChatSnapshot | undefined;
	getRestoreError(): string | undefined;
	createPrivateRoom(): RoomDescriptor;
	joinRoom(
		room: RoomDescriptor,
		ctx: ExtensionCommandContext,
		signal: AbortSignal,
		options?: JoinRoomOptions,
	): Promise<boolean>;
	openChat(ctx: ExtensionCommandContext): Promise<void>;
	retryRememberedRoom(ctx: ExtensionCommandContext, signal: AbortSignal): Promise<void>;
	forgetRememberedRoom(signal: AbortSignal): Promise<void>;
	leaveRoom(signal: AbortSignal): Promise<void>;
	toggleMute(publicKey: string): boolean | undefined;
	updateNickname(value: string, signal: AbortSignal): Promise<void>;
	updateWidgetMode(value: WidgetMode, signal: AbortSignal): Promise<void>;
	getIdentityResetPreview(): { current: string; next: string };
	resetIdentity(signal: AbortSignal): Promise<void>;
}

interface ChatMenuState {
	settings: ChatSettings;
	snapshot?: ChatSnapshot;
	pendingRoom?: RoomDescriptor;
	restoreError?: string;
}

type Screen =
	| "main"
	| "invite"
	| "joinInvite"
	| "joinPublic"
	| "joinAnother"
	| "participants"
	| "settings"
	| "changeNickname"
	| "widget"
	| "resetIdentity"
	| "leave"
	| "forget"
	| "status"
	| "help";
type Action =
	| "createPrivate"
	| "joinPending"
	| "joinInvite"
	| "joinPublic"
	| "retry"
	| "forget"
	| "open"
	| "leave"
	| "toggleMute"
	| "changeNickname"
	| "setWidget"
	| "resetIdentity";

export function createChatMenu(source: ChatMenuSource) {
	let pendingRoom: RoomDescriptor | undefined;
	const getState = async (): Promise<ChatMenuState> => ({
		settings: source.getSettings(),
		snapshot: source.getSnapshot(),
		pendingRoom,
		...(source.getRestoreError() ? { restoreError: source.getRestoreError() } : {}),
	});
	const menu: MenuDefinition<ChatMenuState, Screen, Action> = {
		start: "main",
		screens: {
			main: ({ state }) => mainScreen(state),
			invite: ({ state }) => {
				const room = state.pendingRoom ?? state.snapshot?.room;
				return {
					kind: "review",
					title: "Private room invite",
					lines: [
						"Anyone with this bearer invite can join.",
						"After confirmation, choose whether to save it privately for restart restore.",
					],
					content: room?.invite ?? "Invite is unavailable.",
					format: { kind: "text" },
					viewportSize: "adaptive",
					...(state.pendingRoom
						? {
								confirm: {
									id: "join-private",
									label: "Join private room",
									action: "joinPending" as const,
								},
							}
						: {}),
					hint: "back",
				};
			},
			joinInvite: () => ({
				kind: "input",
				title: "Join with invite",
				lines: [
					"Paste a pichat:v1 invite. It grants access to the private room.",
					"You will choose Join and remember, Join once, or Cancel before networking starts.",
				],
				placeholder: "pichat:v1:…",
				action: "joinInvite",
				hint: "back",
			}),
			joinPublic: () => ({
				kind: "input",
				title: "Join public room",
				lines: ["Use a lowercase room slug. Public rooms are guessable and open to anyone."],
				placeholder: "pi-dev",
				action: "joinPublic",
				hint: "back",
			}),
			joinAnother: () => ({
				kind: "actions",
				title: "Join another room",
				lines: ["A successfully remembered join replaces the room restored at startup."],
				items: [
					{ id: "public", label: "Join public room", to: "joinPublic" },
					{ id: "invite", label: "Join with invite", to: "joinInvite" },
					{ id: "create", label: "Create private room", action: "createPrivate" },
				],
				hint: "back",
			}),
			participants: ({ state }) => ({
				kind: "choice",
				title: "Direct participants",
				lines: state.snapshot?.peers.length
					? ["Select a peer to toggle local mute. Full public keys are shown in details."]
					: ["No authenticated direct peers are connected."],
				items:
					state.snapshot?.peers.map((peer) => ({
						id: peer.publicKey,
						label: sanitizeSingleLine(peer.label),
						description: peer.muted ? "Muted locally" : "Receiving messages",
						details: [peer.publicKey],
					})) ?? [],
				action: "toggleMute",
				viewportSize: 10,
				hint: "back",
			}),
			settings: ({ state }) => ({
				kind: "actions",
				title: "Pi Chat settings",
				lines: [
					`Nickname: ${sanitizeSingleLine(state.settings.nickname ?? "not set")}`,
					`Joined room display: ${state.settings.widgetMode ?? "count"}`,
					`Restart: ${restartDescription(state.settings)}`,
					`User settings · ${sanitizeSingleLine(source.settingsPath)}`,
				],
				items: [
					{ id: "nickname", label: "Change nickname", to: "changeNickname" },
					{ id: "widget", label: "Joined room display", to: "widget" },
					{ id: "reset", label: "Reset identity…", to: "resetIdentity" },
				],
				hint: "back",
			}),
			changeNickname: () => ({
				kind: "input",
				title: "Change nickname",
				lines: ["The immutable fingerprint remains attached to the new nickname."],
				placeholder: "Mika",
				action: "changeNickname",
				hint: "back",
			}),
			widget: ({ state }) => ({
				kind: "choice",
				title: "Joined room display",
				lines: ["Choose how much room content remains visible above the Pi editor."],
				items: [
					{
						id: "dock",
						label: "Room dock",
						description: "Status, input target, and up to three recent messages",
					},
					{ id: "latest", label: "Latest message", description: "Show one recent message" },
					{ id: "count", label: "Status only", description: "Hide message text" },
					{ id: "off", label: "Hidden", description: "Show no persistent room widget" },
				],
				action: "setWidget",
				currentItemId: state.settings.widgetMode ?? "count",
				initialItemId: state.settings.widgetMode ?? "count",
				hint: "back",
			}),
			resetIdentity: () => {
				const preview = source.getIdentityResetPreview();
				return {
					kind: "review",
					title: "Reset Pi Chat identity?",
					lines: [
						`Current: ${preview.current}`,
						`New: ${preview.next}`,
						"Resetting changes your fingerprint, forgets startup restore, and leaves the room.",
					],
					content: "This cannot restore trust or blocked state associated with the old public key.",
					format: { kind: "text" },
					confirm: { id: "reset", label: "Reset identity", action: "resetIdentity" },
					hint: "back",
				};
			},
			leave: ({ state }) => {
				const forgetsCurrent = state.settings.resume?.activeRoomId === state.snapshot?.room.id;
				return {
					kind: "review",
					title: forgetsCurrent ? "Leave and forget room?" : "Leave room?",
					lines: [
						`Room: ${sanitizeSingleLine(state.snapshot?.room.label ?? "unknown")}`,
						forgetsCurrent
							? "Leaving disconnects peers, clears this transcript, and disables startup restore."
							: "Leaving disconnects peers and clears this ephemeral transcript.",
					],
					content: "Messages already received by other peers cannot be withdrawn.",
					format: { kind: "text" },
					confirm: {
						id: "leave",
						label: forgetsCurrent ? "Leave and forget room" : "Leave room",
						action: "leave",
					},
					hint: "back",
				};
			},
			forget: ({ state }) => {
				const room = rememberedRoom(state.settings);
				return {
					kind: "review",
					title: "Forget saved room?",
					lines: [
						`Room: ${sanitizeSingleLine(room?.label ?? "unknown")}`,
						"Pi Chat will not reconnect to this room at startup.",
					],
					content: "This does not withdraw messages already received by peers.",
					format: { kind: "text" },
					confirm: { id: "forget", label: "Forget saved room", action: "forget" },
					hint: "back",
				};
			},
			status: ({ state }) => ({
				kind: "detail",
				title: "Pi Chat status",
				lines: state.snapshot
					? [
							`State: ${state.snapshot.state}`,
							`Room: ${sanitizeSingleLine(state.snapshot.room.label)}`,
							`Identity: ${sanitizeSingleLine(state.snapshot.localLabel)}`,
							`Direct peers: ${state.snapshot.peers.length}`,
							`Unread: ${state.snapshot.unread}`,
							`Restart: ${restartDescription(state.settings)}`,
							...(state.snapshot.lastError
								? [`Attention: ${sanitizeSingleLine(state.snapshot.lastError)}`]
								: []),
						]
					: [
							"State: disconnected",
							`Restart: ${restartDescription(state.settings)}`,
							...(state.restoreError
								? [`Attention: ${sanitizeSingleLine(state.restoreError)}`]
								: []),
							`Settings: ${sanitizeSingleLine(source.settingsPath)}`,
						],
				hint: "back",
			}),
			help: () => ({
				kind: "detail",
				title: "Pi Chat help",
				lines: [
					"Pi Chat is experimental and TUI-only.",
					"Chat stays outside Pi sessions, prompts, model context, and repository files.",
					"Private invites are bearer secrets. Public rooms are guessable.",
					"Noise encrypts direct streams, but peers and DHT infrastructure may observe network metadata.",
					"There is no offline delivery, authoritative room count, or message withdrawal.",
				],
				hint: "back",
			}),
		},
		actions: {
			createPrivate: () => {
				pendingRoom = source.createPrivateRoom();
				return { kind: "to", screen: "invite" };
			},
			joinPending: async ({ ctx, signal }) => {
				if (!pendingRoom) return { kind: "rejected", error: new Error("Invite is unavailable") };
				if (!(await source.joinRoom(pendingRoom, ctx, signal)) || signal.aborted) {
					return { kind: "stay" };
				}
				await source.openChat(ctx);
				return { kind: "close" };
			},
			joinInvite: async ({ ctx, signal, value }) => {
				let room: RoomDescriptor;
				try {
					room = parseInvite(value ?? "");
				} catch (error) {
					return { kind: "rejected", error };
				}
				if (!(await source.joinRoom(room, ctx, signal)) || signal.aborted) return { kind: "stay" };
				await source.openChat(ctx);
				return { kind: "close" };
			},
			joinPublic: async ({ ctx, signal, value }) => {
				let room: RoomDescriptor;
				try {
					room = createPublicRoom((value ?? "").replace(/^#/u, ""));
				} catch (error) {
					return { kind: "rejected", error };
				}
				const confirmed = await ctx.ui.confirm(
					"Join public room?",
					"Anyone can join or record it. DHT and direct peers may observe network metadata.",
					{ signal },
				);
				if (!confirmed || signal.aborted) return { kind: "stay" };
				if (!(await source.joinRoom(room, ctx, signal, { remember: true })) || signal.aborted) {
					return { kind: "stay" };
				}
				await source.openChat(ctx);
				return { kind: "close" };
			},
			retry: async ({ ctx, signal }) => {
				await source.retryRememberedRoom(ctx, signal);
				return { kind: "close" };
			},
			forget: async ({ signal }) => {
				await source.forgetRememberedRoom(signal);
				return { kind: "to", screen: "main" };
			},
			open: async ({ ctx }) => {
				await source.openChat(ctx);
				return { kind: "close" };
			},
			leave: async ({ signal }) => {
				await source.leaveRoom(signal);
				return { kind: "to", screen: "main" };
			},
			toggleMute: ({ itemId }) => {
				const muted = source.toggleMute(itemId);
				return muted === undefined
					? { kind: "rejected", error: new Error("Peer is no longer connected") }
					: { kind: "to", screen: "participants" };
			},
			changeNickname: async ({ signal, value }) => {
				const nickname = normalizeNickname(value);
				if (!nickname) return { kind: "rejected", error: new Error("Nickname is invalid") };
				await source.updateNickname(nickname, signal);
				return { kind: "to", screen: "settings" };
			},
			setWidget: async ({ signal, itemId }) => {
				if (itemId !== "dock" && itemId !== "count" && itemId !== "latest" && itemId !== "off") {
					return { kind: "rejected", error: new Error("Widget mode is invalid") };
				}
				await source.updateWidgetMode(itemId, signal);
				return { kind: "to", screen: "settings" };
			},
			resetIdentity: async ({ signal }) => {
				await source.resetIdentity(signal);
				return { kind: "to", screen: "settings" };
			},
		},
	};
	return { menu, getState };
}

export async function showChatMenu(
	ctx: ExtensionCommandContext,
	source: ChatMenuSource,
	ownership: { signal: AbortSignal; isCurrent: () => boolean },
): Promise<void> {
	const { runMenu } = await import("@narumitw/pi-tui-kit");
	if (ownership.signal.aborted || !ownership.isCurrent()) return;
	const controller = createChatMenu(source);
	await runMenu(ctx, controller.menu, {
		getState: controller.getState,
		signal: ownership.signal,
		isCurrent: ownership.isCurrent,
		onError: (_ctx, error) => {
			if (ownership.isCurrent() && !ownership.signal.aborted) {
				ctx.ui.notify(`Pi Chat failed: ${sanitizeSingleLine(safeError(error))}`, "error");
			}
		},
	});
}

function mainScreen(state: ChatMenuState) {
	const remembered = rememberedRoom(state.settings);
	if (!state.snapshot || state.snapshot.state === "disconnected") {
		if (remembered) {
			return {
				kind: "actions" as const,
				title: state.restoreError
					? `Pi Chat · could not restore ${sanitizeSingleLine(remembered.label)}`
					: `Pi Chat · ${sanitizeSingleLine(remembered.label)} remembered`,
				lines: [
					state.restoreError
						? `Attention: ${sanitizeSingleLine(state.restoreError)}`
						: "Disconnected. This room is configured to reconnect at startup.",
					`Restart surface: ${state.settings.resume?.surface === "chat" ? "open chat" : "Pi/LLM"}`,
				],
				items: [
					{ id: "retry", label: `Retry ${remembered.label}`, action: "retry" as const },
					{ id: "another", label: "Join another room", to: "joinAnother" as const },
					{ id: "forget", label: `Forget ${remembered.label}…`, to: "forget" as const },
					{ id: "settings", label: "Settings", to: "settings" as const },
					{ id: "status", label: "Status", to: "status" as const },
					{ id: "help", label: "Help", to: "help" as const },
				],
				hint: "close" as const,
			};
		}
		return {
			kind: "actions" as const,
			title: "Pi Chat · disconnected",
			lines: ["Experimental peer-to-peer chat. Messages never enter model context."],
			items: [
				{ id: "public", label: "Join public room", to: "joinPublic" as const },
				{ id: "invite", label: "Join with invite", to: "joinInvite" as const },
				{ id: "create", label: "Create private room", action: "createPrivate" as const },
				{ id: "settings", label: "Settings", to: "settings" as const },
				{ id: "status", label: "Status", to: "status" as const },
				{ id: "help", label: "Help", to: "help" as const },
			],
			hint: "close" as const,
		};
	}
	const restoresCurrent = remembered?.id === state.snapshot.room.id;
	return {
		kind: "actions" as const,
		title: `Pi Chat · ${sanitizeSingleLine(state.snapshot.room.label)}`,
		lines: [
			`${state.snapshot.state} · ${state.snapshot.peers.length} direct peers · ${state.snapshot.unread} unread`,
			`Current input: ${state.snapshot.composerOpen ? state.snapshot.room.label : "Pi/LLM"}`,
			restoresCurrent
				? `Restart: restore this room and ${state.settings.resume?.surface === "chat" ? "open chat" : "stay in Pi/LLM"}`
				: "Restart: this room will not reconnect",
			state.snapshot.localLabel,
		],
		items: [
			{
				id: "open",
				label: `Open chat in ${sanitizeSingleLine(state.snapshot.room.label)}`,
				action: "open" as const,
			},
			{ id: "participants", label: "Show participants", to: "participants" as const },
			...(state.snapshot.room.invite
				? [{ id: "invite", label: "Show room invite", to: "invite" as const }]
				: []),
			{ id: "settings", label: "Settings", to: "settings" as const },
			{ id: "status", label: "Status", to: "status" as const },
			{ id: "help", label: "Help", to: "help" as const },
			{
				id: "leave",
				label: restoresCurrent ? "Leave and forget room…" : "Leave room…",
				to: "leave" as const,
			},
		],
		hint: "close" as const,
	};
}

function rememberedRoom(settings: ChatSettings): RoomDescriptor | undefined {
	const resume = settings.resume;
	const remembered = resume?.rooms.find(({ id }) => id === resume.activeRoomId);
	if (!remembered) return undefined;
	try {
		return descriptorFromRememberedRoom(remembered);
	} catch {
		return undefined;
	}
}

function restartDescription(settings: ChatSettings): string {
	const room = rememberedRoom(settings);
	if (!room) return "no room remembered";
	return `${room.label} · ${settings.resume?.surface === "chat" ? "open chat" : "stay in Pi/LLM"}`;
}

function safeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
