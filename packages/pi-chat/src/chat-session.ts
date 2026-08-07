import { randomBytes, randomUUID } from "node:crypto";
import type { ChatIdentity } from "./identity.js";
import { formatIdentityLabel, normalizeNickname, uniqueIdentityTags } from "./identity.js";
import {
	createChatMessage,
	createHello,
	PeerRateLimiter,
	type ProtocolMessage,
	type RoomDescriptor,
	verifyHello,
} from "./protocol.js";

const MAX_TRANSCRIPT = 256;
const MAX_SEEN_MESSAGES = 1024;
const MAX_PROTOCOL_VIOLATIONS = 3;

export interface TransportPeer {
	publicKey: Buffer;
	send(message: ProtocolMessage): void;
	close(): void;
}

export interface ChatTransportListener {
	onPeer(peer: TransportPeer): void;
	onMessage(peer: TransportPeer, message: ProtocolMessage): void;
	onDisconnect(peer: TransportPeer): void;
	onError(error: Error): void;
}

export interface ChatTransport {
	start(listener: ChatTransportListener, signal?: AbortSignal): Promise<void>;
	connectPeer?(publicKey: Buffer): void;
	stop(): Promise<void>;
}

export interface TranscriptEntry {
	id: string;
	author: "local" | "remote";
	label: string;
	publicKey: string;
	text: string;
	sentAt: number;
	delivery?: "broadcast" | "not-delivered";
	deliveredTo?: number;
}

export interface ParticipantSnapshot {
	publicKey: string;
	label: string;
	nickname: string;
	muted: boolean;
}

export interface ChatSnapshot {
	state: "connecting" | "connected" | "degraded" | "disconnected";
	room: RoomDescriptor;
	localLabel: string;
	peers: ParticipantSnapshot[];
	transcript: TranscriptEntry[];
	unread: number;
	composerOpen: boolean;
	lastError?: string;
}

export interface ChatSessionOptions {
	room: RoomDescriptor;
	identity: ChatIdentity;
	nickname: string;
	transport: ChatTransport;
	now?: () => number;
	onChange?: (snapshot: ChatSnapshot) => void;
}

interface PeerState {
	peer: TransportPeer;
	authenticated: boolean;
	nickname?: string;
	muted: boolean;
	violations: number;
	limiter: PeerRateLimiter;
}

export class ChatSession {
	private readonly room: RoomDescriptor;
	private readonly identity: ChatIdentity;
	private nickname: string;
	private readonly transport: ChatTransport;
	private readonly now: () => number;
	private readonly onChange?: (snapshot: ChatSnapshot) => void;
	private readonly peers = new Map<string, PeerState>();
	private readonly transcript: TranscriptEntry[] = [];
	private readonly seen = new Set<string>();
	private readonly seenOrder: string[] = [];
	private readonly listeners = new Set<(snapshot: ChatSnapshot) => void>();
	private state: ChatSnapshot["state"] = "disconnected";
	private unread = 0;
	private viewOpen = false;
	private lastError: string | undefined;
	private generation = 0;
	private leavePromise: Promise<void> | undefined;

	constructor(options: ChatSessionOptions) {
		const nickname = normalizeNickname(options.nickname);
		if (!nickname) throw new Error("Pi Chat nickname is invalid.");
		this.room = options.room;
		this.identity = options.identity;
		this.nickname = nickname;
		this.transport = options.transport;
		this.now = options.now ?? Date.now;
		this.onChange = options.onChange;
	}

	async start(signal?: AbortSignal): Promise<void> {
		if (this.state !== "disconnected" || this.leavePromise) {
			throw new Error("Pi Chat session has already started.");
		}
		const owner = ++this.generation;
		this.state = "connecting";
		this.emit();
		try {
			await this.transport.start(
				{
					onPeer: (peer) => this.onPeer(owner, peer),
					onMessage: (peer, message) => this.onMessage(owner, peer, message),
					onDisconnect: (peer) => this.onDisconnect(owner, peer),
					onError: (error) => this.onError(owner, error),
				},
				signal,
			);
			signal?.throwIfAborted();
			if (owner !== this.generation) return;
			this.state = "connected";
			this.emit();
		} catch (error) {
			if (owner === this.generation) {
				this.state = "disconnected";
				this.lastError = safeError(error);
				this.emit();
			}
			await this.transport.stop().catch(() => undefined);
			throw error;
		}
	}

	send(text: string): { id: string; deliveredTo: number } {
		if (this.state !== "connected" && this.state !== "degraded") {
			throw new Error("Pi Chat is not connected.");
		}
		const id = randomUUID();
		const message = createChatMessage(text, this.now(), id);
		let deliveredTo = 0;
		for (const state of this.peers.values()) {
			if (!state.authenticated || state.muted) continue;
			try {
				state.peer.send(message);
				deliveredTo += 1;
			} catch {
				state.violations += 1;
			}
		}
		this.pushTranscript({
			id,
			author: "local",
			label: formatIdentityLabel(this.nickname, this.identity.publicKey),
			publicKey: this.identity.publicKey.toString("hex"),
			text,
			sentAt: message.sentAt,
			delivery: deliveredTo > 0 ? "broadcast" : "not-delivered",
			deliveredTo,
		});
		this.emit();
		return { id, deliveredTo };
	}

	updateNickname(value: string): void {
		const nickname = normalizeNickname(value);
		if (!nickname) throw new Error("Pi Chat nickname is invalid.");
		this.nickname = nickname;
		for (const state of this.peers.values()) {
			if (!state.authenticated) continue;
			try {
				state.peer.send({ v: 1, type: "nickname-update", nickname });
			} catch {
				state.violations += 1;
			}
		}
		this.emit();
	}

	mute(publicKey: Uint8Array): void {
		const state = this.peers.get(keyId(publicKey));
		if (!state) return;
		state.muted = true;
		this.emit();
	}

	toggleMute(publicKey: Uint8Array): boolean | undefined {
		const state = this.peers.get(keyId(publicKey));
		if (!state?.authenticated) return undefined;
		state.muted = !state.muted;
		this.emit();
		return state.muted;
	}

	subscribe(listener: (snapshot: ChatSnapshot) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	setViewOpen(open: boolean): void {
		if (this.viewOpen === open) return;
		this.viewOpen = open;
		if (open) this.unread = 0;
		this.emit();
	}

	leave(): Promise<void> {
		if (this.leavePromise) return this.leavePromise;
		this.leavePromise = this.leaveOwned();
		return this.leavePromise;
	}

	snapshot(): ChatSnapshot {
		const authenticated: Array<[string, PeerState, string]> = [];
		for (const [publicKey, value] of this.peers) {
			if (value.authenticated && value.nickname) {
				authenticated.push([publicKey, value, value.nickname]);
			}
		}
		const tags = uniqueIdentityTags([
			this.identity.publicKey,
			...authenticated.map(([, value]) => value.peer.publicKey),
		]);
		const localKey = this.identity.publicKey.toString("hex");
		const peers = authenticated
			.map(([publicKey, value, nickname]) => ({
				publicKey,
				nickname,
				label: `${nickname}~${tags.get(publicKey) ?? formatIdentityLabel(nickname, value.peer.publicKey).split("~").at(-1)}`,
				muted: value.muted,
			}))
			.sort((left, right) => left.label.localeCompare(right.label));
		return {
			state: this.state,
			room: this.room,
			localLabel: `${this.nickname}~${tags.get(localKey) ?? formatIdentityLabel(this.nickname, this.identity.publicKey).split("~").at(-1)}`,
			peers,
			transcript: this.transcript.map((entry) => {
				const tag = tags.get(entry.publicKey);
				const nickname = entry.label.split("~", 1)[0] ?? entry.label;
				return { ...entry, label: tag ? `${nickname}~${tag}` : entry.label };
			}),
			unread: this.unread,
			composerOpen: this.viewOpen,
			...(this.lastError ? { lastError: this.lastError } : {}),
		};
	}

	private onPeer(owner: number, peer: TransportPeer): void {
		if (owner !== this.generation || this.state === "disconnected") {
			peer.close();
			return;
		}
		const id = keyId(peer.publicKey);
		const previous = this.peers.get(id);
		if (previous && previous.peer !== peer) previous.peer.close();
		const state: PeerState = {
			peer,
			authenticated: false,
			muted: previous?.muted ?? false,
			violations: 0,
			limiter: new PeerRateLimiter({ burst: 3, refillPerSecond: 1, now: this.now }),
		};
		this.peers.set(id, state);
		try {
			peer.send(
				createHello(
					this.room,
					this.nickname,
					this.identity.publicKey,
					peer.publicKey,
					randomBytes(16),
				),
			);
		} catch {
			peer.close();
			this.peers.delete(id);
		}
	}

	private onMessage(owner: number, peer: TransportPeer, message: ProtocolMessage): void {
		if (owner !== this.generation) return;
		const id = keyId(peer.publicKey);
		const state = this.peers.get(id);
		if (!state || state.peer !== peer) return;
		if (!state.authenticated) {
			const hello = verifyHello(message, this.room, peer.publicKey, this.identity.publicKey);
			if (!hello) {
				this.violate(id, state);
				return;
			}
			state.authenticated = true;
			state.nickname = hello.nickname;
			const knownPeers = [...this.peers.values()]
				.filter((candidate) => candidate !== state && candidate.authenticated)
				.map((candidate) => candidate.peer.publicKey.toString("hex"));
			if (knownPeers.length > 0) {
				state.peer.send({ v: 1, type: "peer-list", publicKeys: knownPeers.slice(0, 16) });
			}
			for (const candidate of this.peers.values()) {
				if (candidate !== state && candidate.authenticated) {
					candidate.peer.send({ v: 1, type: "peer-list", publicKeys: [id] });
				}
			}
			this.emit();
			return;
		}
		if (message.type === "hello") return;
		if (message.type === "peer-list") {
			for (const publicKey of message.publicKeys) {
				if (publicKey !== this.identity.publicKey.toString("hex") && !this.peers.has(publicKey)) {
					this.transport.connectPeer?.(Buffer.from(publicKey, "hex"));
				}
			}
			return;
		}
		if (message.type === "goodbye") {
			this.peers.delete(id);
			peer.close();
			this.emit();
			return;
		}
		if (message.type === "nickname-update") {
			const nickname = normalizeNickname(message.nickname);
			if (!nickname) this.violate(id, state);
			else {
				state.nickname = nickname;
				this.emit();
			}
			return;
		}
		if (message.type !== "chat" || state.muted) return;
		if (!state.limiter.accept()) {
			this.violate(id, state);
			return;
		}
		const seenId = `${id}:${message.id}`;
		if (this.seen.has(seenId)) return;
		this.remember(seenId);
		this.pushTranscript({
			id: message.id,
			author: "remote",
			label: formatIdentityLabel(state.nickname ?? "peer", peer.publicKey),
			publicKey: id,
			text: message.text,
			sentAt: message.sentAt,
		});
		if (!this.viewOpen) this.unread += 1;
		this.emit();
	}

	private onDisconnect(owner: number, peer: TransportPeer): void {
		if (owner !== this.generation) return;
		const id = keyId(peer.publicKey);
		if (this.peers.get(id)?.peer === peer) {
			this.peers.delete(id);
			this.emit();
		}
	}

	private onError(owner: number, error: Error): void {
		if (owner !== this.generation) return;
		this.state = "degraded";
		this.lastError = safeError(error);
		this.emit();
	}

	private violate(id: string, state: PeerState): void {
		state.violations += 1;
		if (state.violations > MAX_PROTOCOL_VIOLATIONS) {
			state.peer.close();
			this.peers.delete(id);
			this.emit();
		}
	}

	private remember(id: string): void {
		this.seen.add(id);
		this.seenOrder.push(id);
		if (this.seenOrder.length > MAX_SEEN_MESSAGES) {
			const removed = this.seenOrder.shift();
			if (removed) this.seen.delete(removed);
		}
	}

	private pushTranscript(entry: TranscriptEntry): void {
		this.transcript.push(entry);
		if (this.transcript.length > MAX_TRANSCRIPT) this.transcript.shift();
	}

	private async leaveOwned(): Promise<void> {
		this.generation += 1;
		for (const state of this.peers.values()) {
			if (state.authenticated) {
				try {
					state.peer.send({ v: 1, type: "goodbye" });
				} catch {
					// Best-effort departure notice.
				}
			}
			state.peer.close();
		}
		this.peers.clear();
		await this.transport.stop().catch((error) => {
			this.lastError = safeError(error);
		});
		this.state = "disconnected";
		this.unread = 0;
		this.transcript.length = 0;
		this.emit();
	}

	private emit(): void {
		const snapshot = this.snapshot();
		this.onChange?.(snapshot);
		for (const listener of this.listeners) listener(snapshot);
	}
}

function keyId(publicKey: Uint8Array): string {
	return Buffer.from(publicKey).toString("hex");
}

function safeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
