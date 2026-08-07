import assert from "node:assert/strict";
import { type ChildProcess, fork } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import createTestnet from "hyperdht/testnet.js";
import { ChatSession } from "../src/chat-session.js";
import { createIdentity } from "../src/identity.js";
import { HyperswarmTransport } from "../src/network.js";
import { createPrivateRoom, createPublicRoom } from "../src/protocol.js";

test("three local DHT peers discover, authenticate, exchange, and fully stop", {
	timeout: 20_000,
}, async () => {
	const testnet = await createTestnet(3);
	const room = createPrivateRoom(Buffer.alloc(32, 42));
	const sessions = Array.from({ length: 3 }, (_, index) => {
		const identity = createIdentity(Buffer.alloc(32, index + 1));
		const transport = new HyperswarmTransport({
			room,
			identity,
			dht: testnet.createNode({ firewalled: false }),
			maxPeers: 8,
		});
		return {
			transport,
			session: new ChatSession({
				room,
				identity,
				nickname: `Dev${index + 1}`,
				transport,
			}),
		};
	});
	try {
		await Promise.all(sessions.map(({ session }) => session.start()));
		await waitFor(
			() => sessions.every(({ session }) => session.snapshot().peers.length === 2),
			() =>
				sessions
					.map(({ session, transport }) => {
						const snapshot = session.snapshot();
						return `${snapshot.state}:${snapshot.peers.length}:${transport.connectionCount}:${snapshot.lastError ?? "ok"}`;
					})
					.join(","),
		);
		const sender = sessions[0];
		assert.ok(sender);
		assert.equal(sender.session.send("hello mesh").deliveredTo, 2);
		await waitFor(() =>
			sessions
				.slice(1)
				.every(({ session }) =>
					session.snapshot().transcript.some((entry) => entry.text === "hello mesh"),
				),
		);
	} finally {
		await Promise.allSettled(sessions.map(({ session }) => session.leave()));
		await testnet.destroy();
	}
	assert.equal(
		sessions.every(({ transport }) => transport.connectionCount === 0),
		true,
	);
});

test("early discovery retries recover after initial DHT lookups miss peers", {
	timeout: 20_000,
}, async () => {
	const testnet = await createTestnet(3);
	const room = createPublicRoom("retry-room");
	const sessions = Array.from({ length: 2 }, (_, index) => {
		const identity = createIdentity(Buffer.alloc(32, index + 11));
		const dht = suppressPeerResults(testnet.createNode({ firewalled: false }), 3);
		const transport = new HyperswarmTransport({ room, identity, dht, maxPeers: 8 });
		return new ChatSession({
			room,
			identity,
			nickname: `Retry${index + 1}`,
			transport,
		});
	});
	try {
		await Promise.all(sessions.map((session) => session.start()));
		await waitFor(
			() => sessions.every((session) => session.snapshot().peers.length === 1),
			() => sessions.map((session) => session.snapshot().peers.length).join(","),
			8_000,
		);
	} finally {
		await Promise.allSettled(sessions.map((session) => session.leave()));
		await testnet.destroy();
	}
});

test("a completed startup releases its caller signal without leaving the room", {
	timeout: 15_000,
}, async () => {
	const testnet = await createTestnet(3);
	const room = createPublicRoom("released-startup-signal");
	const controller = new AbortController();
	const sessions = Array.from({ length: 2 }, (_, index) => {
		const identity = createIdentity(Buffer.alloc(32, index + 21));
		const transport = new HyperswarmTransport({
			room,
			identity,
			dht: testnet.createNode({ firewalled: false }),
			maxPeers: 8,
		});
		return new ChatSession({
			room,
			identity,
			nickname: `Owner${index + 1}`,
			transport,
		});
	});
	try {
		await sessions[0]?.start(controller.signal);
		controller.abort(new DOMException("Menu closed", "AbortError"));
		await sessions[1]?.start();
		await waitFor(
			() => sessions.every((session) => session.snapshot().peers.length === 1),
			() => sessions.map((session) => session.snapshot().peers.length).join(","),
			5_000,
		);
	} finally {
		await Promise.allSettled(sessions.map((session) => session.leave()));
		await testnet.destroy();
	}
});

test("three separate Node processes converge through a local DHT bootstrap", {
	timeout: 45_000,
}, async () => {
	const testnet = await createTestnet(3);
	const secret = Buffer.alloc(32, 77);
	const bootstrapArg = Buffer.from(JSON.stringify(testnet.bootstrap)).toString("base64url");
	const fixturePath = fileURLToPath(new URL("./network-peer-fixture.js", import.meta.url));
	const children = Array.from({ length: 3 }, (_, index) =>
		fork(fixturePath, [bootstrapArg, String(index + 1), secret.toString("base64url")], {
			execArgv: [],
			stdio: ["ignore", "ignore", "pipe", "ipc"],
		}),
	);
	const messages = new Map<ChildProcess, Array<Record<string, unknown>>>();
	const errors = new Map<ChildProcess, string>();
	for (const child of children) {
		messages.set(child, []);
		child.on("message", (message: unknown) => {
			if (message && typeof message === "object") {
				messages.get(child)?.push(message as Record<string, unknown>);
			}
		});
		child.stderr?.on("data", (chunk) => {
			errors.set(child, `${errors.get(child) ?? ""}${String(chunk)}`);
		});
	}
	try {
		await waitFor(
			() =>
				children.every((child) =>
					messages
						.get(child)
						?.some((message) => message.kind === "snapshot" && message.peers === 2),
				),
			() => childDetails(children, messages, errors),
			27_000,
		);
		children[0]?.send({ command: "send", text: "cross-process hello" });
		await waitFor(
			() =>
				children
					.slice(1)
					.every((child) =>
						messages
							.get(child)
							?.some(
								(message) =>
									Array.isArray(message.texts) && message.texts.includes("cross-process hello"),
							),
					),
			() => childDetails(children, messages, errors),
			10_000,
		);
	} finally {
		for (const child of children) {
			if (child.connected) child.send({ command: "stop" });
		}
		await Promise.all(children.map((child) => waitForExit(child)));
		await testnet.destroy();
	}
});

interface AnnounceResult {
	peers: unknown[];
	[key: string]: unknown;
}

interface AnnounceQuery extends AsyncIterable<AnnounceResult> {
	readonly closestNodes: unknown;
	destroy(): void;
}

interface DhtWithAnnounce {
	announce(...args: unknown[]): AnnounceQuery;
}

function suppressPeerResults(value: unknown, callsToSuppress: number): unknown {
	const dht = value as DhtWithAnnounce;
	const announce = dht.announce.bind(dht);
	let calls = 0;
	dht.announce = (...args: unknown[]): AnnounceQuery => {
		const query = announce(...args);
		calls += 1;
		if (calls > callsToSuppress) return query;
		return {
			get closestNodes() {
				return query.closestNodes;
			},
			destroy: () => query.destroy(),
			async *[Symbol.asyncIterator]() {
				for await (const result of query) yield { ...result, peers: [] };
			},
		};
	};
	return dht;
}

async function waitFor(
	predicate: () => boolean,
	detail: () => string = () => "",
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) {
			throw new Error(`Timed out waiting for local DHT mesh (${detail()})`);
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

function childDetails(
	children: readonly ChildProcess[],
	messages: ReadonlyMap<ChildProcess, Array<Record<string, unknown>>>,
	errors: ReadonlyMap<ChildProcess, string>,
): string {
	return children
		.map((child) => {
			const latest = messages.get(child)?.at(-1);
			return `${child.exitCode ?? "running"}:${JSON.stringify(latest)}:${errors.get(child) ?? ""}`;
		})
		.join(" | ");
}

async function waitForExit(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) return;
	let timeout: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			new Promise<void>((resolve) => child.once("exit", () => resolve())),
			new Promise<void>((resolve) => {
				timeout = setTimeout(() => {
					child.kill("SIGKILL");
					resolve();
				}, 5_000);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
