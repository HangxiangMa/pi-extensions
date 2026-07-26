import assert from "node:assert/strict";
import test from "node:test";
import { S3Client } from "../src/s3-client.js";
import { requiredConfig } from "./helpers.js";

test("S3 JSON reads reject oversized response bodies", async () => {
	await withFetch(
		async () => new Response(JSON.stringify({ value: "x".repeat(2 * 1024 * 1024) })),
		async () => {
			await assert.rejects(new S3Client(s3Config()).getJson("latest.json"), /exceeds.*limit/i);
		},
	);
});

test("S3 errors redact configured credentials and bound response text", async () => {
	const base = s3Config();
	const config = {
		...base,
		profile: { ...base.profile, endpoint: `${base.profile.endpoint}?token=query-secret` },
	};
	const responseBody = `${config.profile.accessKeyId} ${config.profile.secretAccessKey} ${config.profile.sessionToken} query-secret ${"x".repeat(128 * 1024)}`;
	await withFetch(
		async () => new Response(responseBody, { status: 403 }),
		async () => {
			await assert.rejects(new S3Client(config).getJson("latest.json"), (error: unknown) => {
				assert.ok(error instanceof Error);
				assert.doesNotMatch(error.message, /access-key|secret-key|session-token|query-secret/);
				assert.ok(error.message.length < 70 * 1024);
				return true;
			});
		},
	);
});

test("S3 operations forward an already-aborted signal to transport", async () => {
	let calls = 0;
	const controller = new AbortController();
	controller.abort(new DOMException("cancelled", "AbortError"));
	await withFetch(
		async (_input, init) => {
			calls += 1;
			assert.equal(init?.signal?.aborted, true);
			throw init?.signal?.reason;
		},
		async () => {
			await assert.rejects(
				new S3Client(s3Config(), controller.signal).getJson("latest.json"),
				(error: unknown) => error instanceof Error && error.name === "AbortError",
			);
			assert.equal(calls, 1);
		},
	);
});

function s3Config() {
	const flat = requiredConfig();
	return {
		type: "s3" as const,
		profile: {
			kind: "s3-compatible" as const,
			endpoint: flat.endpoint,
			region: "auto",
			accessKeyId: flat.accessKeyId,
			secretAccessKey: flat.secretAccessKey,
			sessionToken: "session-token",
		},
		destination: { bucket: flat.bucket, prefix: "pi-sync", namespace: "default" },
	};
}

async function withFetch<T>(fetch: typeof globalThis.fetch, fn: () => Promise<T>) {
	const original = globalThis.fetch;
	globalThis.fetch = fetch;
	try {
		return await fn();
	} finally {
		globalThis.fetch = original;
	}
}
