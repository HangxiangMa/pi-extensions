import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
	createChatMessage,
	createHello,
	createPrivateRoom,
	createPublicRoom,
	encodeFrame,
	FrameDecoder,
	MAX_FRAME_BYTES,
	MAX_MESSAGE_BYTES,
	PeerRateLimiter,
	parseInvite,
	parseProtocolMessage,
	verifyHello,
} from "../src/protocol.js";

const alice = Buffer.alloc(32, 1);
const bob = Buffer.alloc(32, 2);

test("private invites round-trip while public slugs are normalized and bounded", () => {
	const secret = Buffer.alloc(32, 9);
	const room = createPrivateRoom(secret);
	assert.equal(room.invite, `pichat:v1:${secret.toString("base64url")}`);
	assert.deepEqual(parseInvite(room.invite), room);
	assert.equal(createPublicRoom("pi-dev").label, "#pi-dev");
	assert.throws(() => createPublicRoom("Pi Dev"), /public room slug/u);
	assert.throws(() => parseInvite("pichat:v2:nope"), /valid Pi Chat invite/u);
});

test("private hello proves room possession and binds both authenticated peer keys", () => {
	const room = createPrivateRoom(Buffer.alloc(32, 5));
	const hello = createHello(room, "Mika", alice, bob, Buffer.alloc(16, 3));
	assert.equal(verifyHello(hello, room, alice, bob)?.nickname, "Mika");
	assert.equal(verifyHello(hello, room, bob, alice), undefined);
	assert.equal(verifyHello(hello, createPrivateRoom(Buffer.alloc(32, 6)), alice, bob), undefined);
});

test("length-prefixed decoder handles chunks and rejects oversized frames before buffering them", () => {
	const message = createChatMessage("hello", 10, "id-1");
	const encoded = encodeFrame(message);
	const decoder = new FrameDecoder();
	assert.deepEqual(decoder.push(encoded.subarray(0, 2)), []);
	assert.deepEqual(decoder.push(encoded.subarray(2, 7)), []);
	assert.deepEqual(decoder.push(encoded.subarray(7)), [message]);

	const oversized = Buffer.alloc(4);
	oversized.writeUInt32BE(MAX_FRAME_BYTES + 1);
	assert.throws(() => new FrameDecoder().push(oversized), /exceeds/u);
});

test("decoder accepts multiple valid frames coalesced beyond one frame's size limit", () => {
	const messages = Array.from({ length: 5 }, (_, index) =>
		createChatMessage("x".repeat(MAX_MESSAGE_BYTES), 10 + index, `coalesced-${index}`),
	);
	const coalesced = Buffer.concat(messages.map((message) => encodeFrame(message)));
	assert.ok(coalesced.length > MAX_FRAME_BYTES + 4);
	assert.deepEqual(new FrameDecoder().push(coalesced), messages);
});

test("decoder rejects invalid UTF-8 before JSON parsing", () => {
	const frame = Buffer.from([0, 0, 0, 1, 0xff]);
	assert.throws(() => new FrameDecoder().push(frame), /UTF-8/u);
});

test("chat parsing bounds text and rejects unknown or malformed payloads", () => {
	assert.deepEqual(parseProtocolMessage(createChatMessage("hello", 10, "id-1")), {
		v: 1,
		type: "chat",
		text: "hello",
		sentAt: 10,
		id: "id-1",
	});
	assert.throws(() => createChatMessage("x".repeat(MAX_MESSAGE_BYTES + 1), 1, "id"), /too large/u);
	assert.equal(parseProtocolMessage({ v: 1, type: "admin", text: "oops" }), undefined);
	assert.equal(parseProtocolMessage({ v: 2, type: "chat", text: "oops" }), undefined);
});

test("per-peer limiter permits a burst and refills without unbounded state", () => {
	let now = 0;
	const limiter = new PeerRateLimiter({ burst: 2, refillPerSecond: 1, now: () => now });
	assert.equal(limiter.accept(), true);
	assert.equal(limiter.accept(), true);
	assert.equal(limiter.accept(), false);
	now = 1000;
	assert.equal(limiter.accept(), true);
	assert.equal(limiter.accept(), false);
});

test("protocol rejects arbitrary random bytes without echoing input", () => {
	for (let index = 0; index < 50; index += 1) {
		const bytes = randomBytes(index);
		const decoder = new FrameDecoder();
		try {
			decoder.push(bytes);
		} catch (error) {
			assert.doesNotMatch(String(error), new RegExp(bytes.toString("hex"), "u"));
		}
	}
});
