import assert from "node:assert/strict";
import test from "node:test";
import { ChatSession, type ChatTransport, type TransportPeer } from "../src/chat-session.js";
import { createIdentity } from "../src/identity.js";
import { createPrivateRoom, type ProtocolMessage } from "../src/protocol.js";

class FakePeer implements TransportPeer {
	readonly sent: ProtocolMessage[] = [];
	closed = false;
	constructor(readonly publicKey: Buffer) {}
	send(message: ProtocolMessage): void {
		if (!this.closed) this.sent.push(message);
	}
	close(): void {
		this.closed = true;
	}
}

class FakeTransport implements ChatTransport {
	private listener:
		| {
				onPeer(peer: TransportPeer): void;
				onMessage(peer: TransportPeer, message: ProtocolMessage): void;
				onDisconnect(peer: TransportPeer): void;
				onError(error: Error): void;
		  }
		| undefined;
	started = false;
	stopped = false;
	start(listener: NonNullable<FakeTransport["listener"]>): Promise<void> {
		this.listener = listener;
		this.started = true;
		return Promise.resolve();
	}
	stop(): Promise<void> {
		this.stopped = true;
		return Promise.resolve();
	}
	connect(peer: FakePeer): void {
		this.listener?.onPeer(peer);
	}
	receive(peer: FakePeer, message: ProtocolMessage): void {
		this.listener?.onMessage(peer, message);
	}
	disconnect(peer: FakePeer): void {
		this.listener?.onDisconnect(peer);
	}
}

function fixture() {
	const room = createPrivateRoom(Buffer.alloc(32, 9));
	const identity = createIdentity(Buffer.alloc(32, 1));
	const remote = createIdentity(Buffer.alloc(32, 2));
	const transport = new FakeTransport();
	const session = new ChatSession({ room, identity, nickname: "Mika", transport, now: () => 100 });
	return { room, identity, remote, transport, session };
}

test("authenticates a direct peer before exposing presence or chat", async () => {
	const { room, identity, remote, transport, session } = fixture();
	await session.start();
	const peer = new FakePeer(remote.publicKey);
	transport.connect(peer);
	assert.equal(peer.sent[0]?.type, "hello");
	assert.equal(session.snapshot().peers.length, 0);
	transport.receive(
		peer,
		peerHello(room, "Other", remote.publicKey, identity.publicKey, Buffer.alloc(16, 4)),
	);
	assert.equal(session.snapshot().peers[0]?.label.startsWith("Other~"), true);
});

test("broadcasts only to authenticated unmuted peers and reports zero-peer delivery honestly", async () => {
	const { room, identity, remote, transport, session } = fixture();
	await session.start();
	assert.equal(session.send("alone").deliveredTo, 0);
	assert.equal(session.snapshot().transcript.at(-1)?.delivery, "not-delivered");
	const peer = new FakePeer(remote.publicKey);
	transport.connect(peer);
	transport.receive(peer, peerHello(room, "Other", remote.publicKey, identity.publicKey));
	const result = session.send("hello");
	assert.equal(result.deliveredTo, 1);
	assert.equal(peer.sent.at(-1)?.type, "chat");
	session.mute(remote.publicKey);
	assert.equal(session.send("muted").deliveredTo, 0);
});

test("publishes composer focus so persistent UI reports the real input target", async () => {
	const { session } = fixture();
	await session.start();
	assert.equal((session.snapshot() as { composerOpen?: boolean }).composerOpen, false);
	session.setViewOpen(true);
	assert.equal((session.snapshot() as { composerOpen?: boolean }).composerOpen, true);
	session.setViewOpen(false);
	assert.equal((session.snapshot() as { composerOpen?: boolean }).composerOpen, false);
});

test("tracks unread remote messages, deduplicates ids, and bounds transcript", async () => {
	const { room, identity, remote, transport, session } = fixture();
	await session.start();
	const peer = new FakePeer(remote.publicKey);
	transport.connect(peer);
	transport.receive(peer, peerHello(room, "Other", remote.publicKey, identity.publicKey));
	session.setViewOpen(false);
	const message = { v: 1, type: "chat", text: "hi", sentAt: 1, id: "same" } as const;
	transport.receive(peer, message);
	transport.receive(peer, message);
	assert.equal(session.snapshot().unread, 1);
	assert.equal(session.snapshot().transcript.filter((entry) => entry.text === "hi").length, 1);
	for (let index = 0; index < 300; index += 1) session.send(`local ${index}`);
	assert.equal(session.snapshot().transcript.length, 256);
	session.setViewOpen(true);
	assert.equal(session.snapshot().unread, 0);
});

test("nickname updates retain peer identity and hostile protocol abuse closes the peer", async () => {
	const { room, identity, remote, transport, session } = fixture();
	await session.start();
	const peer = new FakePeer(remote.publicKey);
	transport.connect(peer);
	transport.receive(peer, peerHello(room, "Other", remote.publicKey, identity.publicKey));
	transport.receive(peer, { v: 1, type: "nickname-update", nickname: "Renamed" });
	assert.match(session.snapshot().peers[0]?.label ?? "", /^Renamed~/u);
	for (let index = 0; index < 7; index += 1) {
		transport.receive(peer, { v: 1, type: "chat", text: "flood", sentAt: 1, id: `f${index}` });
	}
	assert.equal(peer.closed, true);
});

test("leave is idempotent and ignores late transport continuations", async () => {
	const { remote, transport, session } = fixture();
	await session.start();
	const peer = new FakePeer(remote.publicKey);
	transport.connect(peer);
	await Promise.all([session.leave(), session.leave()]);
	transport.connect(new FakePeer(Buffer.alloc(32, 8)));
	assert.equal(transport.stopped, true);
	assert.equal(session.snapshot().state, "disconnected");
	assert.equal(session.snapshot().peers.length, 0);
});

function peerHello(
	room: ReturnType<typeof createPrivateRoom>,
	nickname: string,
	sender: Buffer,
	receiver: Buffer,
	nonce = Buffer.alloc(16, 3),
) {
	return importHello(room, nickname, sender, receiver, nonce);
}

import { createHello as importHello } from "../src/protocol.js";
