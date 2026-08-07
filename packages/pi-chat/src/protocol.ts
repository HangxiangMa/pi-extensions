import { createHash, createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { normalizeNickname } from "./identity.js";

export const PROTOCOL_VERSION = 1;
export const MAX_FRAME_BYTES = 16 * 1024;
export const MAX_MESSAGE_BYTES = 4 * 1024;
const PUBLIC_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/u;

export interface RoomDescriptor {
	kind: "private" | "public";
	label: string;
	id: string;
	topic: Buffer;
	key: Buffer;
	invite?: string;
}

export interface HelloMessage {
	v: 1;
	type: "hello";
	roomId: string;
	nonce: string;
	nickname: string;
	proof: string;
}

export interface ChatMessage {
	v: 1;
	type: "chat";
	text: string;
	sentAt: number;
	id: string;
}

export interface PresenceMessage {
	v: 1;
	type: "nickname-update" | "goodbye" | "ping" | "pong";
	nickname?: string;
}

export interface PeerListMessage {
	v: 1;
	type: "peer-list";
	publicKeys: string[];
}

export type ProtocolMessage = HelloMessage | ChatMessage | PresenceMessage | PeerListMessage;

export function createPrivateRoom(secret: Uint8Array): RoomDescriptor {
	if (secret.byteLength !== 32) throw new Error("Private room secrets must be 32 bytes.");
	const bytes = Buffer.from(secret);
	const topic = domainHash("pi-chat/discovery/private/v1", bytes);
	return {
		kind: "private",
		label: `private ${shortRoomId(topic)}`,
		id: topic.toString("base64url"),
		topic,
		key: deriveRoomKey(bytes),
		invite: `pichat:v1:${bytes.toString("base64url")}`,
	};
}

export function parseInvite(value: string): RoomDescriptor {
	const match = /^pichat:v1:([A-Za-z0-9_-]{43})$/u.exec(value.trim());
	const encodedSecret = match?.[1];
	if (!encodedSecret) throw new Error("This is not a valid Pi Chat invite.");
	const secret = Buffer.from(encodedSecret, "base64url");
	if (secret.length !== 32) throw new Error("This is not a valid Pi Chat invite.");
	return createPrivateRoom(secret);
}

export function createPublicRoom(slug: string): RoomDescriptor {
	if (!PUBLIC_SLUG.test(slug)) {
		throw new Error("A public room slug must use lowercase letters, numbers, or hyphens.");
	}
	const material = Buffer.from(`pi-chat/public/v1:${slug}`, "utf8");
	const topic = createHash("sha256").update(material).digest();
	return {
		kind: "public",
		label: `#${slug}`,
		id: topic.toString("base64url"),
		topic,
		key: deriveRoomKey(material),
	};
}

export function createHello(
	room: RoomDescriptor,
	nicknameValue: string,
	senderPublicKey: Uint8Array,
	receiverPublicKey: Uint8Array,
	nonceBytes: Uint8Array,
): HelloMessage {
	const nickname = normalizeNickname(nicknameValue);
	if (!nickname) throw new Error("Nickname is invalid.");
	if (senderPublicKey.byteLength !== 32 || receiverPublicKey.byteLength !== 32) {
		throw new Error("Peer public keys must be 32 bytes.");
	}
	if (nonceBytes.byteLength !== 16) throw new Error("Handshake nonces must be 16 bytes.");
	const nonce = Buffer.from(nonceBytes).toString("base64url");
	return {
		v: 1,
		type: "hello",
		roomId: room.id,
		nonce,
		nickname,
		proof: helloProof(room, nickname, senderPublicKey, receiverPublicKey, nonce),
	};
}

export function verifyHello(
	value: unknown,
	room: RoomDescriptor,
	senderPublicKey: Uint8Array,
	receiverPublicKey: Uint8Array,
): HelloMessage | undefined {
	if (!isRecord(value) || value.v !== 1 || value.type !== "hello") return undefined;
	if (
		value.roomId !== room.id ||
		typeof value.nonce !== "string" ||
		typeof value.proof !== "string"
	) {
		return undefined;
	}
	const nickname = normalizeNickname(value.nickname);
	if (!nickname || !/^[A-Za-z0-9_-]{22}$/u.test(value.nonce)) return undefined;
	const expected = helloProof(room, nickname, senderPublicKey, receiverPublicKey, value.nonce);
	const actualBytes = Buffer.from(value.proof, "base64url");
	const expectedBytes = Buffer.from(expected, "base64url");
	if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
		return undefined;
	}
	return {
		v: 1,
		type: "hello",
		roomId: room.id,
		nonce: value.nonce,
		nickname,
		proof: value.proof,
	};
}

export function createChatMessage(text: string, sentAt: number, id: string): ChatMessage {
	if (!text || Buffer.byteLength(text, "utf8") > MAX_MESSAGE_BYTES) {
		throw new Error("Chat message is empty or too large.");
	}
	if (!Number.isSafeInteger(sentAt) || sentAt < 0) throw new Error("Message timestamp is invalid.");
	if (!validId(id)) throw new Error("Message id is invalid.");
	return { v: 1, type: "chat", text, sentAt, id };
}

export function parseProtocolMessage(value: unknown): ProtocolMessage | undefined {
	if (!isRecord(value) || value.v !== 1 || typeof value.type !== "string") return undefined;
	if (value.type === "chat") {
		if (
			typeof value.text !== "string" ||
			!value.text ||
			Buffer.byteLength(value.text, "utf8") > MAX_MESSAGE_BYTES ||
			!Number.isSafeInteger(value.sentAt) ||
			(value.sentAt as number) < 0 ||
			!validId(value.id)
		) {
			return undefined;
		}
		return {
			v: 1,
			type: "chat",
			text: value.text,
			sentAt: value.sentAt as number,
			id: value.id as string,
		};
	}
	if (value.type === "hello") {
		if (
			typeof value.roomId !== "string" ||
			typeof value.nonce !== "string" ||
			typeof value.proof !== "string" ||
			!normalizeNickname(value.nickname)
		) {
			return undefined;
		}
		return value as unknown as HelloMessage;
	}
	if (value.type === "nickname-update") {
		const nickname = normalizeNickname(value.nickname);
		return nickname ? { v: 1, type: "nickname-update", nickname } : undefined;
	}
	if (value.type === "peer-list") {
		if (
			!Array.isArray(value.publicKeys) ||
			value.publicKeys.length > 16 ||
			!value.publicKeys.every((key) => typeof key === "string" && /^[0-9a-f]{64}$/u.test(key))
		) {
			return undefined;
		}
		return { v: 1, type: "peer-list", publicKeys: [...new Set(value.publicKeys)] };
	}
	if (value.type === "goodbye" || value.type === "ping" || value.type === "pong") {
		return { v: 1, type: value.type };
	}
	return undefined;
}

export function encodeFrame(message: ProtocolMessage): Buffer {
	const payload = Buffer.from(JSON.stringify(message), "utf8");
	if (payload.length > MAX_FRAME_BYTES) throw new Error("Protocol frame exceeds the size limit.");
	const header = Buffer.allocUnsafe(4);
	header.writeUInt32BE(payload.length);
	return Buffer.concat([header, payload]);
}

export class FrameDecoder {
	private buffer = Buffer.alloc(0);

	push(chunk: Uint8Array): ProtocolMessage[] {
		if (chunk.byteLength === 0) return [];
		const incoming = Buffer.from(chunk);
		const messages: ProtocolMessage[] = [];
		let offset = 0;
		while (offset < incoming.length) {
			if (this.buffer.length < 4) {
				const headerBytes = Math.min(4 - this.buffer.length, incoming.length - offset);
				this.buffer = Buffer.concat([this.buffer, incoming.subarray(offset, offset + headerBytes)]);
				offset += headerBytes;
				if (this.buffer.length < 4) break;
			}
			const length = this.buffer.readUInt32BE(0);
			if (length > MAX_FRAME_BYTES) {
				this.buffer = Buffer.alloc(0);
				throw new Error("Protocol frame exceeds the size limit.");
			}
			const frameBytes = length + 4;
			if (this.buffer.length < frameBytes) {
				const payloadBytes = Math.min(frameBytes - this.buffer.length, incoming.length - offset);
				this.buffer = Buffer.concat([
					this.buffer,
					incoming.subarray(offset, offset + payloadBytes),
				]);
				offset += payloadBytes;
				if (this.buffer.length < frameBytes) break;
			}
			const payload = this.buffer.subarray(4, frameBytes);
			this.buffer = Buffer.alloc(0);
			let text: string;
			try {
				text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
			} catch {
				throw new Error("Protocol frame contains invalid UTF-8.");
			}
			let value: unknown;
			try {
				value = JSON.parse(text) as unknown;
			} catch {
				throw new Error("Protocol frame contains invalid JSON.");
			}
			const parsed = parseProtocolMessage(value);
			if (!parsed) throw new Error("Protocol frame has an invalid message shape.");
			messages.push(parsed);
		}
		return messages;
	}
}

export class PeerRateLimiter {
	private tokens: number;
	private lastRefill: number;
	private readonly burst: number;
	private readonly refillPerSecond: number;
	private readonly now: () => number;

	constructor(options: { burst: number; refillPerSecond: number; now?: () => number }) {
		if (options.burst <= 0 || options.refillPerSecond <= 0) {
			throw new Error("Rate limiter values must be positive.");
		}
		this.burst = options.burst;
		this.tokens = options.burst;
		this.refillPerSecond = options.refillPerSecond;
		this.now = options.now ?? Date.now;
		this.lastRefill = this.now();
	}

	accept(): boolean {
		const current = this.now();
		const elapsed = Math.max(0, current - this.lastRefill);
		this.lastRefill = current;
		this.tokens = Math.min(this.burst, this.tokens + (elapsed / 1000) * this.refillPerSecond);
		if (this.tokens < 1) return false;
		this.tokens -= 1;
		return true;
	}
}

function deriveRoomKey(material: Uint8Array): Buffer {
	return Buffer.from(
		hkdfSync("sha256", material, Buffer.from("pi-chat/v1"), Buffer.from("room-handshake"), 32),
	);
}

function domainHash(domain: string, material: Uint8Array): Buffer {
	return createHash("sha256")
		.update(domain)
		.update(Buffer.from([0]))
		.update(material)
		.digest();
}

function shortRoomId(topic: Uint8Array): string {
	return Buffer.from(topic).subarray(0, 5).toString("base64url");
}

function helloProof(
	room: RoomDescriptor,
	nickname: string,
	senderPublicKey: Uint8Array,
	receiverPublicKey: Uint8Array,
	nonce: string,
): string {
	const canonical = JSON.stringify([
		PROTOCOL_VERSION,
		room.id,
		nonce,
		nickname,
		Buffer.from(senderPublicKey).toString("hex"),
		Buffer.from(receiverPublicKey).toString("hex"),
	]);
	return createHmac("sha256", room.key).update(canonical).digest("base64url");
}

function validId(value: unknown): value is string {
	return (
		typeof value === "string" && value.length > 0 && value.length <= 64 && !/\p{Cc}/u.test(value)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
