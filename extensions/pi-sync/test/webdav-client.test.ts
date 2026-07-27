import assert from "node:assert/strict";
import test from "node:test";
import { WebDavClient } from "../src/webdav-client.js";
import { MockWebDavServer, webDavConfig } from "./mock-webdav-server.js";

test("WebDAV client rejects unsafe authenticated base URLs", () => {
	const insecure = webDavConfig("http://example.com/dav/");
	assert.throws(() => new WebDavClient(insecure), /HTTPS is required/);
	const embedded = webDavConfig("https://user:password@example.com/dav/");
	assert.throws(() => new WebDavClient(embedded), /embedded credentials/);
});

test("WebDAV client authenticates, encodes paths, creates collections, and lists them", async () => {
	const server = await new MockWebDavServer().start();
	try {
		const client = new WebDavClient(webDavConfig(server.url));
		await client.ensureCollection("folder with space/child");
		await client.putBuffer(
			"folder with space/child/value.json",
			Buffer.from("ok"),
			"application/json",
			{
				ifAbsent: true,
			},
		);
		assert.equal(
			(await client.getBuffer("folder with space/child/value.json")).value?.toString(),
			"ok",
		);
		assert.ok(
			(await client.listCollection("folder with space/child")).some((entry) =>
				entry.href.endsWith("value.json"),
			),
		);
		assert.ok(
			server.requests.every((request) => request.headers.authorization?.startsWith("Basic ")),
		);
	} finally {
		await server.close();
	}
});

test("WebDAV client reports authentication and malformed listing errors without secrets", async () => {
	const server = await new MockWebDavServer({ malformedXml: true }).start();
	try {
		const config = webDavConfig(server.url);
		const client = new WebDavClient(config);
		await assert.rejects(client.listCollection("missing"), /collection is missing/);
		await client.ensureCollection("list");
		await assert.rejects(client.listCollection("list"), /malformed/);
		config.profile.password = "wrong-private-password";
		await assert.rejects(
			new WebDavClient(config).getBuffer("item"),
			(error: unknown) =>
				error instanceof Error &&
				/authentication|required|HTTP 401/i.test(error.message) &&
				!error.message.includes("wrong-private-password"),
		);
	} finally {
		await server.close();
	}
});

test("WebDAV client refuses ambiguous redirects for mutating requests", async () => {
	const options: { redirectTo?: string } = {};
	const server = await new MockWebDavServer(options).start();
	options.redirectTo = `${server.url}canonical`;
	try {
		await assert.rejects(
			new WebDavClient(webDavConfig(server.url)).putBuffer(
				"item",
				Buffer.from("secret"),
				"application/octet-stream",
			),
			/ambiguous HTTP 302 redirect for PUT/,
		);
		assert.equal(server.requests.length, 1);
	} finally {
		await server.close();
	}
});

test("WebDAV client rejects cross-origin authenticated redirects", async () => {
	const server = await new MockWebDavServer({ redirectTo: "http://127.0.0.1:1/stolen" }).start();
	try {
		await assert.rejects(
			new WebDavClient(webDavConfig(server.url)).getBuffer("item"),
			/cross-origin authenticated redirect/,
		);
	} finally {
		await server.close();
	}
});

test("WebDAV client bounds JSON responses", async () => {
	const server = await new MockWebDavServer().start();
	try {
		server.resources.set("/dav/large.json", Buffer.alloc(1024 * 1024 + 1, 65));
		await assert.rejects(
			new WebDavClient(webDavConfig(server.url)).getJson("large.json"),
			/too large/,
		);
	} finally {
		await server.close();
	}
});

test("WebDAV client honors caller cancellation and request timeout", async () => {
	const server = await new MockWebDavServer({ delayMs: 100 }).start();
	try {
		const controller = new AbortController();
		controller.abort(new DOMException("cancelled", "AbortError"));
		await assert.rejects(
			new WebDavClient(webDavConfig(server.url), controller.signal).getBuffer("item"),
			(error: unknown) => error instanceof Error && error.name === "AbortError",
		);
		await assert.rejects(
			new WebDavClient(webDavConfig(server.url), undefined, 10).getBuffer("item"),
			/request failed/,
		);
	} finally {
		await server.close();
	}
});
