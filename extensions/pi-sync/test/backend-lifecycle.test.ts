import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { localConfigPath } from "../src/config.js";
import sync from "../src/sync.js";
import { requiredConfig, withTempHome } from "./helpers.js";

test("session replacement aborts an in-flight backend operation owned by the old session", async () => {
	await withPendingStatusOperation("session_start");
});

test("session shutdown aborts an in-flight backend operation", async () => {
	await withPendingStatusOperation("session_shutdown");
});

test("session replacement cancels a still-preparing shutdown publication", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(path.join(agentDir, "sessions", "--project--"), { recursive: true });
		writeFileSync(path.join(agentDir, "settings.json"), "{}\n");
		writeFileSync(path.join(agentDir, "sessions", "--project--", "session.jsonl"), "{}\n");
		const enabled = {
			...requiredConfig(),
			autoSync: true,
			syncFiles: ["settings.json"],
			syncSessions: true,
		};
		writeFileSync(localConfigPath(), JSON.stringify(enabled));
		let markStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		let aborted = false;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = ((_input, init) => {
			markStarted?.();
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener(
					"abort",
					() => {
						aborted = true;
						reject(new DOMException("Aborted", "AbortError"));
					},
					{ once: true },
				);
			});
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx: shutdownCtx } = createMockContext({ hasUI: true });
			const shutdown = mock.events.get("session_shutdown")?.[0]?.({ reason: "exit" }, shutdownCtx);
			await started;
			writeFileSync(localConfigPath(), JSON.stringify({ ...enabled, autoSync: false }));
			const { ctx: replacementCtx } = createMockContext({ hasUI: true });
			await mock.events.get("session_start")?.[0]?.({}, replacementCtx);
			await shutdown;

			assert.equal(aborted, true);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

test("session shutdown owns an opt-in session publication with a bounded signal", async () => {
	await withTempHome(async (agentDir) => {
		mkdirSync(path.join(agentDir, "sessions", "--project--"), { recursive: true });
		writeFileSync(path.join(agentDir, "settings.json"), "{}\n");
		writeFileSync(path.join(agentDir, "sessions", "--project--", "session.jsonl"), "{}\n");
		writeFileSync(
			localConfigPath(),
			JSON.stringify({
				...requiredConfig(),
				autoSync: true,
				syncFiles: ["settings.json"],
				syncSessions: true,
			}),
		);
		let activePointer: Record<string, unknown> | undefined;
		let snapshotSignal: AbortSignal | null | undefined;
		let latestPuts = 0;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (input, init) => {
			const url = new URL(String(input));
			const method = init?.method ?? "GET";
			if (url.pathname.includes("/snapshots/") && method === "PUT") {
				snapshotSignal = init?.signal;
				return new Response(null, { status: 200 });
			}
			if (url.pathname.endsWith("/latest.json")) {
				if (method === "PUT") {
					latestPuts += 1;
					activePointer = parseJsonBody(init?.body);
					return new Response(null, { status: 200 });
				}
				return activePointer ? Response.json(activePointer) : new Response(null, { status: 404 });
			}
			if (url.pathname.endsWith("/history.json")) {
				return method === "PUT"
					? new Response(null, { status: 200 })
					: new Response(null, { status: 404 });
			}
			throw new Error(`Unexpected request: ${method} ${url.pathname}`);
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx } = createMockContext({ hasUI: true });
			await mock.events.get("session_shutdown")?.[0]?.({ reason: "exit" }, ctx);

			assert.equal(latestPuts, 1);
			assert.ok(snapshotSignal);
			assert.equal(snapshotSignal.aborted, false);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

async function withPendingStatusOperation(event: "session_start" | "session_shutdown") {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			localConfigPath(),
			JSON.stringify({ ...requiredConfig(), autoSync: false, syncFiles: ["settings.json"] }),
		);
		let markStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		let aborted = false;
		const originalFetch = globalThis.fetch;
		globalThis.fetch = ((_input, init) => {
			markStarted?.();
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener(
					"abort",
					() => {
						aborted = true;
						reject(new DOMException("Aborted", "AbortError"));
					},
					{ once: true },
				);
			});
		}) as typeof globalThis.fetch;
		try {
			const mock = createMockPi();
			sync(mock.pi);
			const { ctx } = createMockContext({ hasUI: true });
			const operation = mock.commands.get("sync")?.handler("status", ctx);
			await started;

			const { ctx: lifecycleCtx } = createMockContext({ hasUI: true });
			if (event === "session_start") {
				await mock.events.get(event)?.[0]?.({}, lifecycleCtx);
			} else {
				await mock.events.get(event)?.[0]?.({ reason: "reload" }, lifecycleCtx);
			}
			await operation;

			assert.equal(aborted, true);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
}

function parseJsonBody(body: BodyInit | null | undefined) {
	if (!body) throw new Error("Expected request body");
	if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
	if (body instanceof Uint8Array) {
		return JSON.parse(Buffer.from(body).toString("utf8")) as Record<string, unknown>;
	}
	throw new Error("Unexpected request body");
}
