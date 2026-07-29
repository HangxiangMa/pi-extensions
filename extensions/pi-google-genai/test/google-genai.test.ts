// Cohesion justification: this provider integration matrix shares configuration and tool fixtures and
// cross-covers command routing, menu persistence, credentials, requests, and lifecycle behavior.
import assert from "node:assert/strict";
import fs from "node:fs";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
	driveCustomSelector,
} from "../../../test/support.js";
import { saveToolSelection, updateGoogleGenaiSetup } from "../src/config.js";
import googleGenai, {
	buildStatusMessage,
	commandCompletions,
	DEFAULT_API_URL,
	DEFAULT_MODEL,
	DEFAULT_TIMEOUT_MS,
	formatToolResult,
	GOOGLE_GENAI_TOOL_NAMES,
	googleGenaiConfigPath,
	loadGoogleGenaiConfig,
	MAX_TIMEOUT_MS,
	normalizeGoogleGenaiSettings,
	parseCommand,
	resolveGoogleGenaiAuth,
	validateMapsLocation,
	validateSearchTypes,
	validateTimeoutMs,
	validateUrls,
} from "../src/google-genai.js";

test("google-genai registers three tools, command, and session hooks", () => {
	const mock = createMockPi();
	googleGenai(mock.pi);

	assert.deepEqual(
		mock.tools.map((tool) => tool.name),
		["google_search", "google_maps", "google_url_context"],
	);
	assert.ok(mock.commands.has("google-genai"));
	assert.match(JSON.stringify(mock.tools[0].parameters), /"const":"web_search"/);
	assert.match(JSON.stringify(mock.tools[0].parameters), /"const":"image_search"/);
	assert.match(JSON.stringify(mock.tools[0].parameters), /timeoutMs/);
	assert.match(JSON.stringify(mock.tools[0].parameters), /"type":"integer"/);
	assert.match(JSON.stringify(mock.tools[0].parameters), new RegExp(`"maximum":${MAX_TIMEOUT_MS}`));
	assert.match(JSON.stringify(mock.tools[0].promptGuidelines), /split|narrow/i);
	assert.match(JSON.stringify(mock.tools[2].parameters), /"minItems":1/);
	assert.deepEqual([...mock.events.keys()].sort(), ["session_shutdown", "session_start"]);
});

test("command parser and completions cover google-genai subcommands", () => {
	assert.equal(parseCommand(""), "status");
	assert.equal(parseCommand("config"), "status");
	assert.equal(parseCommand("on"), "enable");
	assert.equal(parseCommand("off"), "disable");
	assert.equal(parseCommand("wat"), "unknown");
	assert.deepEqual(commandCompletions("to"), [
		{ value: "tools", label: "tools", description: "Select Google GenAI tools" },
	]);
	assert.equal(commandCompletions("tools now"), null);
});

test("config loading defaults, normalizes tools, and rejects interpolation", async () => {
	await withTempAgentDir(async (agentDir) => {
		assert.equal(googleGenaiConfigPath(), join(agentDir, "pi-google-genai.json"));
		const missingConfig = await loadGoogleGenaiConfig();
		assert.deepEqual(missingConfig, {
			config: {
				model: DEFAULT_MODEL,
				apiUrl: DEFAULT_API_URL,
				timeoutMs: DEFAULT_TIMEOUT_MS,
				tools: [...GOOGLE_GENAI_TOOL_NAMES],
			},
			path: join(agentDir, "pi-google-genai.json"),
			warnings: [],
			configLoaded: false,
		});
		const missingStatus = buildStatusMessage(missingConfig, "missing");
		assert.match(missingStatus, /configLoaded: no/);
		assert.match(missingStatus, /persisted tools: none/);

		await writeConfig({
			apiKey: "$GEMINI_API_KEY",
			model: "custom-model",
			apiUrl: "https://proxy.test/interactions",
			timeoutMs: 12,
			tools: ["google_maps", "unknown", "google_search", "google_maps"],
		});
		const loaded = await loadGoogleGenaiConfig();
		assert.deepEqual(loaded.config.tools, ["google_search", "google_maps"]);
		assert.equal(loaded.config.model, "custom-model");
		assert.equal(loaded.config.apiUrl, "https://proxy.test/interactions");
		assert.equal(loaded.config.timeoutMs, 12);
		assert.equal(loaded.configLoaded, true);
		assert.match(loaded.warnings.join("\n"), /unknown/);
		await assert.rejects(
			() => resolveGoogleGenaiAuth(loaded.config, authContext()),
			/Interpolation/,
		);
	});
});

test("config loading reads legacy settings without mutation and keeps private permissions", async () => {
	await withTempAgentDir(async (agentDir) => {
		const legacyPath = join(agentDir, "google-genai.json");
		const canonicalPath = join(agentDir, "pi-google-genai.json");
		await mkdir(agentDir, { recursive: true });
		await writeFile(legacyPath, JSON.stringify({ apiKey: "test-key", model: "legacy" }), {
			mode: 0o600,
		});
		const legacy = await loadGoogleGenaiConfig();
		assert.equal(legacy.config.model, "legacy");
		assert.match(legacy.warnings.join("\n"), /using legacy/i);
		await assert.rejects(stat(canonicalPath));
		assert.equal((await stat(legacyPath)).mode & 0o777, 0o600);

		await writeFile(legacyPath, JSON.stringify({ model: "old" }), { mode: 0o644 });
		await chmod(legacyPath, 0o644);
		await writeFile(canonicalPath, JSON.stringify({ model: "new" }), { mode: 0o600 });
		const preferred = await loadGoogleGenaiConfig();
		assert.equal(preferred.config.model, "new");
		assert.match(preferred.warnings.join("\n"), /ignored/i);
		assert.equal((await stat(legacyPath)).mode & 0o777, 0o600);

		await writeFile(canonicalPath, "invalid", { mode: 0o600 });
		const invalidNew = await loadGoogleGenaiConfig();
		assert.equal(invalidNew.configLoaded, false);
		assert.match(invalidNew.warnings.join("\n"), /ignored/i);

		await unlink(canonicalPath);
		await writeFile(legacyPath, "invalid", { mode: 0o600 });
		const invalidLegacy = await loadGoogleGenaiConfig();
		assert.equal(invalidLegacy.configLoaded, false);
		await assert.rejects(stat(canonicalPath));

		await writeFile(legacyPath, "null", { mode: 0o600 });
		const wrongShapeLegacy = await loadGoogleGenaiConfig();
		assert.match(wrongShapeLegacy.warnings.join("\n"), /google-genai\.json must/);
		assert.doesNotMatch(wrongShapeLegacy.warnings.join("\n"), /pi-google-genai\.json must/);
		await assert.rejects(stat(canonicalPath));

		await writeFile(legacyPath, JSON.stringify({ apiKey: "fallback-key", model: "fallback" }), {
			mode: 0o600,
		});
		await symlink("missing-target", canonicalPath);
		const fallback = await loadGoogleGenaiConfig();
		assert.equal(fallback.config.model, "fallback");
		assert.match(fallback.warnings.join("\n"), /using legacy/i);
		assert.equal((await stat(legacyPath)).mode & 0o777, 0o600);
	});
});

test("config loading rechecks the canonical path after reading the legacy fallback", async () => {
	await withTempAgentDir(async (agentDir) => {
		const legacyPath = join(agentDir, "google-genai.json");
		const canonicalPath = join(agentDir, "pi-google-genai.json");
		await mkdir(agentDir, { recursive: true });
		await writeFile(legacyPath, JSON.stringify({ model: "legacy" }), { mode: 0o600 });

		const originalReadFile = fs.promises.readFile;
		let createCanonical = true;
		fs.promises.readFile = (async (...args: Parameters<typeof fs.promises.readFile>) => {
			const result = await originalReadFile(...args);
			if (createCanonical && String(args[0]) === legacyPath) {
				createCanonical = false;
				await writeFile(canonicalPath, JSON.stringify({ model: "canonical" }), { mode: 0o600 });
			}
			return result;
		}) as typeof fs.promises.readFile;
		syncBuiltinESMExports();
		try {
			const loaded = await loadGoogleGenaiConfig();
			assert.equal(loaded.config.model, "canonical");
			assert.match(loaded.warnings.join("\n"), /ignored.*created concurrently/i);
		} finally {
			fs.promises.readFile = originalReadFile;
			syncBuiltinESMExports();
		}
	});
});

test("config loading validates pi-google-genai.json timeoutMs", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({ timeoutMs: 45_000 });
		let loaded = await loadGoogleGenaiConfig();
		assert.equal(loaded.config.timeoutMs, 45_000);
		assert.deepEqual(loaded.warnings, []);

		await writeConfig({ timeoutMs: "not-a-number" });
		loaded = await loadGoogleGenaiConfig();
		assert.equal(loaded.config.timeoutMs, DEFAULT_TIMEOUT_MS);
		assert.match(loaded.warnings.join("\n"), /google-genai\.json timeoutMs/);
		assert.match(loaded.warnings.join("\n"), /integer from 1/);

		await writeConfig({ timeoutMs: MAX_TIMEOUT_MS + 1 });
		loaded = await loadGoogleGenaiConfig();
		assert.equal(loaded.config.timeoutMs, DEFAULT_TIMEOUT_MS);
		assert.match(loaded.warnings.join("\n"), new RegExp(String(MAX_TIMEOUT_MS)));
	});
});

test("config loading repairs permissions and ignores invalid payloads", async () => {
	await withTempAgentDir(async (agentDir) => {
		const path = join(agentDir, "pi-google-genai.json");
		await mkdir(agentDir, { recursive: true });
		await writeFile(path, '{"apiKey":"secret"', { mode: 0o644 });
		await chmod(path, 0o644);

		let loaded = await loadGoogleGenaiConfig();

		assert.match(loaded.warnings.join("\n"), /Failed to parse/);
		assert.doesNotMatch(loaded.warnings.join("\n"), /secret/);
		assert.equal(loaded.configLoaded, false);
		assert.equal((await stat(path)).mode & 0o777, 0o600);

		await writeConfig(null);
		loaded = await loadGoogleGenaiConfig();
		assert.equal(loaded.configLoaded, false);
		assert.match(loaded.warnings.join("\n"), /must contain a JSON object/);
	});
});

test("auth uses config apiKey before Pi google auth", async () => {
	assert.equal(
		await resolveGoogleGenaiAuth({ apiKey: "config-key" }, authContext("pi-key")),
		"config-key",
	);
	assert.equal(await resolveGoogleGenaiAuth({}, authContext("pi-key")), "pi-key");
	await assert.rejects(
		() => resolveGoogleGenaiAuth({}, authContext(undefined)),
		/Missing Google GenAI API key/,
	);
});

test("validators enforce search types, timeout bounds, map coordinate pairs, and URL schemes", () => {
	assert.deepEqual(validateSearchTypes(undefined), undefined);
	assert.deepEqual(validateSearchTypes(["web_search", "image_search"]), [
		"web_search",
		"image_search",
	]);
	assert.throws(() => validateSearchTypes(["enterprise_web_search"]), /searchTypes/);
	assert.equal(validateTimeoutMs(undefined), undefined);
	assert.equal(validateTimeoutMs(MAX_TIMEOUT_MS), MAX_TIMEOUT_MS);
	assert.throws(() => validateTimeoutMs(0), /integer from 1/);
	assert.throws(() => validateTimeoutMs(1.5), /integer from 1/);
	assert.throws(() => validateTimeoutMs(MAX_TIMEOUT_MS + 1), /integer from 1/);
	assert.deepEqual(validateMapsLocation({}), {});
	assert.deepEqual(validateMapsLocation({ latitude: 34.05, longitude: -118.24 }), {
		latitude: 34.05,
		longitude: -118.24,
	});
	assert.throws(() => validateMapsLocation({ latitude: 34 }), /latitude and longitude/);
	assert.throws(() => validateMapsLocation({ latitude: 91, longitude: 1 }), /latitude/);
	assert.throws(() => validateMapsLocation({ latitude: 1, longitude: 181 }), /longitude/);
	assert.deepEqual(validateUrls(["https://example.com", "http://example.com"]), [
		"https://example.com",
		"http://example.com",
	]);
	assert.throws(() => validateUrls(["file:///etc/passwd"]), /http/);
});

test("tools send expected interaction requests and format sources", async () => {
	await withTempAgentDir(async () => {
		const mock = createMockPi({ activeTools: ["read"] });
		googleGenai(mock.pi);
		const { ctx } = createMockContext({
			modelRegistry: { getApiKeyForProvider: async () => "test-key" },
		});
		const fetchCalls: Array<{ url: string; init: RequestInit & { body?: string } }> = [];
		await withMockFetch(fetchCalls, async () => {
			const result = await executeTool(
				mock.tools[0],
				"call-1",
				{
					query: "Who won Euro 2024?",
					searchTypes: ["image_search"],
				},
				ctx,
			);

			assert.equal(fetchCalls[0].url, DEFAULT_API_URL);
			assert.equal(new Headers(fetchCalls[0].init.headers).get("x-goog-api-key"), "test-key");
			assert.deepEqual(JSON.parse(fetchCalls[0].init.body ?? "{}"), {
				model: DEFAULT_MODEL,
				input: "Who won Euro 2024?",
				tools: [{ type: "google_search", search_types: ["image_search"] }],
			});
			assert.match(result.content[0].text, /Spain won/);
			assert.match(result.content[0].text, /Sources:/);
			assert.equal(result.details.sources[0].url, "https://example.test/euro");
		});
	});
});

test("tools surface successful non-JSON responses instead of dropping the body", async () => {
	await withTempAgentDir(async () => {
		const mock = createMockPi();
		googleGenai(mock.pi);
		const { ctx } = createMockContext({
			modelRegistry: { getApiKeyForProvider: async () => "test-key" },
		});
		const previous = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response("plain text response", {
				status: 200,
				headers: { "content-type": "text/plain" },
			})) as typeof fetch;
		try {
			const result = await executeTool(mock.tools[0], "call-text", { query: "text" }, ctx);
			assert.equal(result.content[0].text, "plain text response");
			assert.equal(result.details.outputText, "plain text response");
		} finally {
			globalThis.fetch = previous;
		}
	});
});

test("tools keep empty successful responses distinct from timeout errors", async () => {
	await withTempAgentDir(async () => {
		const mock = createMockPi();
		googleGenai(mock.pi);
		const { ctx } = createMockContext({
			modelRegistry: { getApiKeyForProvider: async () => "test-key" },
		});
		const previous = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ output_text: "" }))) as typeof fetch;
		try {
			const result = await executeTool(mock.tools[0], "call-empty", { query: "empty" }, ctx);
			assert.equal(result.content[0].text, "No response received.");
			assert.doesNotMatch(result.content[0].text, /timed out|no results found|not found/i);
		} finally {
			globalThis.fetch = previous;
		}
	});
});

test("tools reject insecure apiUrl before sending the API key", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({ apiUrl: "http://example.test/interactions" });
		const mock = createMockPi();
		googleGenai(mock.pi);
		const { ctx } = createMockContext({
			modelRegistry: { getApiKeyForProvider: async () => "test-key" },
		});
		const previous = globalThis.fetch;
		let fetchCalls = 0;
		globalThis.fetch = (async () => {
			fetchCalls += 1;
			return new Response("{}");
		}) as typeof fetch;
		try {
			await assert.rejects(
				() => executeTool(mock.tools[0], "call-insecure", { query: "bad" }, ctx),
				/must use https:\/\//,
			);
			await writeConfig({ apiUrl: "not a url" });
			await assert.rejects(
				() => executeTool(mock.tools[0], "call-invalid-url", { query: "bad" }, ctx),
				/must be a valid URL/,
			);
			assert.equal(fetchCalls, 0);
		} finally {
			globalThis.fetch = previous;
		}
	});
});

test("tools allow local http apiUrl for proxies", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({ apiUrl: "http://[::1]:1234/interactions" });
		const mock = createMockPi();
		googleGenai(mock.pi);
		const { ctx } = createMockContext({
			modelRegistry: { getApiKeyForProvider: async () => "test-key" },
		});
		const fetchCalls: Array<{ url: string; init: RequestInit & { body?: string } }> = [];
		await withMockFetch(fetchCalls, async () => {
			await executeTool(mock.tools[0], "call-local", { query: "ok" }, ctx);
			assert.equal(fetchCalls[0].url, "http://[::1]:1234/interactions");
		});
	});
});

test("tool requests report HTTP errors and time out", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({ timeoutMs: 1 });
		const mock = createMockPi();
		googleGenai(mock.pi);
		const { ctx } = createMockContext({
			modelRegistry: { getApiKeyForProvider: async () => "test-key" },
		});
		const previous = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: { message: "bad request" } }), {
				status: 400,
			})) as typeof fetch;
		try {
			await assert.rejects(
				() => executeTool(mock.tools[0], "call-http", { query: "bad" }, ctx),
				/bad request/,
			);

			globalThis.fetch = (async (_url: string, init: RequestInit) => {
				await new Promise((_resolve, reject) => {
					init.signal?.addEventListener("abort", () => reject(new Error("aborted by timeout")), {
						once: true,
					});
				});
				throw new Error("unreachable");
			}) as typeof fetch;

			await assert.rejects(
				() => executeTool(mock.tools[0], "call-timeout", { query: "slow" }, ctx),
				(error) => {
					assert.ok(error instanceof Error);
					assert.match(error.message, /timed out after 1ms/);
					assert.match(error.message, /timeout, not a no-results response/i);
					assert.match(error.message, /narrow/i);
					assert.match(error.message, /split/i);
					assert.match(error.message, /google-genai\.json timeoutMs/);
					assert.doesNotMatch(error.message, /not found|no results found/i);
					return true;
				},
			);

			await writeConfig({ timeoutMs: 50_000 });
			await assert.rejects(
				() =>
					executeTool(mock.tools[0], "call-per-call-timeout", { query: "slow", timeoutMs: 1 }, ctx),
				/timed out after 1ms/,
			);
			await assert.rejects(
				() =>
					executeTool(mock.tools[0], "call-invalid-timeout", { query: "slow", timeoutMs: 0 }, ctx),
				/integer from 1/,
			);

			let mapsTimeout: unknown;
			try {
				await executeTool(
					mock.tools[1],
					"call-timeout-maps",
					{
						query: "nearby",
						timeoutMs: 1,
					},
					ctx,
				);
			} catch (error) {
				mapsTimeout = error;
			}
			assert.ok(mapsTimeout instanceof Error);
			assert.match(mapsTimeout.message, /timed out after 1ms/);
			assert.doesNotMatch(mapsTimeout.message, /google_search/);
		} finally {
			globalThis.fetch = previous;
		}
	});
});

test("maps and url-context tools validate inputs and request shapes", async () => {
	await withTempAgentDir(async () => {
		const mock = createMockPi();
		googleGenai(mock.pi);
		const { ctx } = createMockContext({
			modelRegistry: { getApiKeyForProvider: async () => "test-key" },
		});
		const fetchCalls: Array<{ url: string; init: RequestInit & { body?: string } }> = [];
		await withMockFetch(fetchCalls, async () => {
			const maps = await executeTool(
				mock.tools[1],
				"call-2",
				{ query: "Italian nearby", latitude: 34.050481, longitude: -118.248526 },
				ctx,
			);
			assert.deepEqual(JSON.parse(fetchCalls[0].init.body ?? "{}").tools, [
				{ type: "google_maps", latitude: 34.050481, longitude: -118.248526 },
			]);
			assert.equal(maps.details.sources[1].type, "place");

			await assert.rejects(
				() => executeTool(mock.tools[1], "call-3", { query: "bad", latitude: 1 }, ctx),
				/latitude and longitude/,
			);

			await executeTool(
				mock.tools[2],
				"call-4",
				{ prompt: "Summarize", urls: ["https://example.test/doc"] },
				ctx,
			);
			assert.deepEqual(JSON.parse(fetchCalls[1].init.body ?? "{}"), {
				model: DEFAULT_MODEL,
				input: "Summarize\n\nURLs:\nhttps://example.test/doc",
				tools: [{ type: "url_context" }],
			});
			await assert.rejects(
				() =>
					executeTool(
						mock.tools[2],
						"call-5",
						{ prompt: "Summarize", urls: ["ftp://example.test/doc"] },
						ctx,
					),
				/http/,
			);
		});
	});
});

test("formatToolResult limits sources, truncates content, and writes raw response only when truncated", async () => {
	await withTempAgentDir(async () => {
		const raw = {
			output_text: `${"x".repeat(60_000)}`,
			steps: [
				{
					type: "model_output",
					content: Array.from({ length: 12 }, (_, index) => ({
						type: "text",
						text: "x",
						annotations: [
							{
								type: "url_citation",
								title: `Source ${index}`,
								url: `https://example.test/${index}`,
							},
						],
					})),
				},
			],
		};

		const result = await formatToolResult(raw, "gemini-test");
		const text = result.content[0].text;
		assert.match(text, /Output truncated/);
		assert.ok(countLines(text) <= DEFAULT_MAX_LINES);
		assert.ok(Buffer.byteLength(text, "utf8") <= DEFAULT_MAX_BYTES);
		assert.equal((text.match(/^\d+\./gm) ?? []).length, 10);
		assert.equal(result.details.sources.length, 12);
		assert.equal("rawInteraction" in result.details, false);
		assert.ok(result.details.fullResponsePath);
		assert.equal((await stat(result.details.fullResponsePath)).mode & 0o777, 0o600);
		assert.match(await readFile(result.details.fullResponsePath, "utf8"), /output_text/);
		const second = await formatToolResult(raw, "gemini-test");
		assert.ok(second.details.fullResponsePath);
		assert.notEqual(second.details.fullResponsePath, result.details.fullResponsePath);
		assert.equal(
			dirname(second.details.fullResponsePath),
			dirname(result.details.fullResponsePath),
		);
	});
});

test("session_shutdown removes truncated raw response temp directory", async () => {
	await withTempAgentDir(async () => {
		const result = await formatToolResult({ output_text: "x".repeat(60_000) }, "gemini-test");
		const fullResponsePath = result.details.fullResponsePath;
		assert.ok(fullResponsePath);
		const directory = dirname(fullResponsePath);
		assert.equal((await stat(directory)).mode & 0o777, 0o700);

		const mock = createMockPi();
		googleGenai(mock.pi);
		const { ctx } = createMockContext();
		await mock.events.get("session_shutdown")?.[0]?.({}, ctx);

		await assert.rejects(() => stat(directory), { code: "ENOENT" });
	});
});

test("commands init, status, and tool selection merge config and preserve unrelated tools", async () => {
	await withTempAgentDir(async (agentDir) => {
		await writeConfig({ apiKey: "old-key", model: "old-model", tools: ["google_search"] });
		const mock = createMockPi({ activeTools: ["read", "google_search"] });
		googleGenai(mock.pi);
		const command = mock.commands.get("google-genai");
		assert.ok(command);
		const inputs = ["", "new-model"];
		const selections = ["google_maps", "Done"];
		const context = createMockContext({
			hasUI: true,
			mode: "tui",
			input: async () => {
				const value = inputs.shift();
				if (value === "new-model") {
					await writeConfig({
						apiKey: "old-key",
						model: "external-model",
						timeoutMs: 12_345,
						tools: ["google_maps"],
						future: { kept: true },
					});
				}
				return value;
			},
			select: async () => selections.shift(),
			modelRegistry: { getApiKeyForProvider: async () => "pi-key" },
		});

		await command.handler("init", context.ctx);
		const config = JSON.parse(await readFile(join(agentDir, "pi-google-genai.json"), "utf8"));
		assert.equal(config.apiKey, "old-key");
		assert.equal(config.model, "new-model");
		assert.deepEqual(config.tools, ["google_maps"]);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "google_maps"]);
		assert.equal(config.timeoutMs, 12_345);
		assert.deepEqual(config.future, { kept: true });
		assert.equal((await stat(join(agentDir, "pi-google-genai.json"))).mode & 0o777, 0o600);

		await command.handler("tools", context.ctx);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read"]);
		assert.deepEqual(
			JSON.parse(await readFile(join(agentDir, "pi-google-genai.json"), "utf8")).tools,
			[],
		);

		await command.handler("enable", context.ctx);
		assert.deepEqual(mock.rawPi.getActiveTools(), [
			"read",
			"google_search",
			"google_maps",
			"google_url_context",
		]);
		await command.handler("disable", context.ctx);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read"]);
		await command.handler("status", context.ctx);
		assert.match(context.notifications.at(-1)?.message ?? "", /auth: config apiKey/);
		assert.match(buildStatusMessage(await loadGoogleGenaiConfig(), "config apiKey"), /apiUrl:/);
	});
});

test("Google GenAI tool selection keeps the cursor on the toggled row", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({
			apiKey: "literal-secret",
			tools: [...GOOGLE_GENAI_TOOL_NAMES],
			future: { kept: true },
		});
		const mock = createMockPi({ activeTools: ["read", ...GOOGLE_GENAI_TOOL_NAMES] });
		googleGenai(mock.pi);
		let customCalled = false;
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				customCalled = true;
				const { renders, result } = driveCustomSelector(factory, [
					"tui.select.down",
					"tui.select.confirm",
					"tui.select.cancel",
				]);
				assert.ok(renders[1]?.some((line) => line.includes("› [ ] google_maps")));
				return result;
			},
		});
		await mock.commands.get("google-genai")?.handler("tools", ctx);

		assert.equal(customCalled, true);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "google_search", "google_url_context"]);
		assert.deepEqual((await loadGoogleGenaiConfig()).config.tools, [
			"google_search",
			"google_url_context",
		]);
		const persisted = JSON.parse(await readFile(googleGenaiConfigPath(), "utf8")) as {
			apiKey?: string;
			future?: unknown;
		};
		assert.equal(persisted.apiKey, "literal-secret");
		assert.deepEqual(persisted.future, { kept: true });
	});
});

test("Google GenAI tool selection uses dialogs instead of custom TUI in RPC mode", async () => {
	await withTempAgentDir(async () => {
		const mock = createMockPi({ activeTools: ["read"] });
		googleGenai(mock.pi);
		let customCalls = 0;
		const context = createMockContext({
			hasUI: true,
			mode: "rpc",
			select: async () => "Done",
			custom: async () => {
				customCalls += 1;
			},
		});

		await mock.commands.get("google-genai")?.handler("tools", context.ctx);

		assert.equal(customCalls, 0);
	});
});

test("Google GenAI patch saves reread and serialize the latest private document", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({
			apiKey: "literal-secret",
			tools: [...GOOGLE_GENAI_TOOL_NAMES],
			future: { version: 1 },
		});
		const first = saveToolSelection(["google_search"]);
		const second = saveToolSelection(["google_maps"]);
		await Promise.all([first, second]);
		const persisted = JSON.parse(await readFile(googleGenaiConfigPath(), "utf8")) as {
			apiKey: string;
			tools: string[];
			future: unknown;
		};
		assert.equal(persisted.apiKey, "literal-secret");
		assert.deepEqual(persisted.tools, ["google_maps"]);
		assert.deepEqual(persisted.future, { version: 1 });
		assert.equal((await stat(googleGenaiConfigPath())).mode & 0o777, 0o600);
	});
});

test("Google GenAI legacy-seeded saves preserve canonical settings created before publication", async () => {
	await withTempAgentDir(async (agentDir) => {
		const legacyPath = join(agentDir, "google-genai.json");
		const canonicalPath = googleGenaiConfigPath();
		const legacy = JSON.stringify({ apiKey: "legacy-key", model: "legacy", legacy: true });
		const concurrent = JSON.stringify({ apiKey: "new-key", model: "newer", newer: true });
		await writeFile(legacyPath, legacy, { mode: 0o600 });

		const originalWriteFile = fs.promises.writeFile;
		let createCanonical = true;
		fs.promises.writeFile = (async (...args: Parameters<typeof fs.promises.writeFile>) => {
			const result = await originalWriteFile(...args);
			if (createCanonical && String(args[0]).startsWith(`${canonicalPath}.`)) {
				createCanonical = false;
				await originalWriteFile(canonicalPath, concurrent, { mode: 0o600 });
			}
			return result;
		}) as typeof fs.promises.writeFile;
		syncBuiltinESMExports();
		try {
			await assert.rejects(
				updateGoogleGenaiSetup({ model: "requested" }),
				/created concurrently.*retry/i,
			);
		} finally {
			fs.promises.writeFile = originalWriteFile;
			syncBuiltinESMExports();
		}

		assert.equal(await readFile(canonicalPath, "utf8"), concurrent);
		assert.equal(await readFile(legacyPath, "utf8"), legacy);
	});
});

test("Google GenAI setup preserves forward-compatible tool names", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({
			apiKey: "literal-secret",
			model: "old-model",
			tools: ["google_maps", "future_google_tool", 42],
		});

		await updateGoogleGenaiSetup({ model: "new-model" });
		const persisted = JSON.parse(await readFile(googleGenaiConfigPath(), "utf8")) as {
			model: string;
			tools: unknown[];
		};
		assert.equal(persisted.model, "new-model");
		assert.deepEqual(persisted.tools, ["google_maps", "future_google_tool", 42]);
	});
});

test("Google GenAI rejects invalid settings updates and restores active tools", async () => {
	await withTempAgentDir(async () => {
		const configPath = googleGenaiConfigPath();
		const invalid = '{"tools":"invalid","apiKey":"literal-secret"}\n';
		await writeFile(configPath, invalid, { mode: 0o600 });
		const mock = createMockPi({ activeTools: ["read", ...GOOGLE_GENAI_TOOL_NAMES] });
		googleGenai(mock.pi);
		const context = createMockContext();

		await mock.commands.get("google-genai")?.handler("disable", context.ctx);

		assert.equal(await readFile(configPath, "utf8"), invalid);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", ...GOOGLE_GENAI_TOOL_NAMES]);
		assert.match(context.notifications.at(-1)?.message ?? "", /save failed/i);
		assert.doesNotMatch(context.notifications.at(-1)?.message ?? "", /literal-secret/);
	});
});

test("Google GenAI rolls back a failed tool save after shutdown invalidates its session", async () => {
	await withTempAgentDir(async () => {
		await mkdir(googleGenaiConfigPath());
		const mock = createMockPi({ activeTools: ["read", ...GOOGLE_GENAI_TOOL_NAMES] });
		googleGenai(mock.pi);
		const { ctx, notifications } = createMockContext();

		const command = mock.commands.get("google-genai")?.handler("disable", ctx);
		await Promise.resolve();
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read"]);
		const shutdown = mock.events.get("session_shutdown")?.[0]?.({}, ctx);

		await Promise.all([command, shutdown]);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", ...GOOGLE_GENAI_TOOL_NAMES]);
		assert.deepEqual(notifications, []);
	});
});

test("Google GenAI tool persistence recovers after a transient save failure", async () => {
	await withTempAgentDir(async () => {
		const configPath = googleGenaiConfigPath();
		await mkdir(configPath);
		const mock = createMockPi({ activeTools: ["read", ...GOOGLE_GENAI_TOOL_NAMES] });
		googleGenai(mock.pi);
		let notificationLog: Array<{ message: string }> = [];
		const context = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory);
				harness.handleInput("tui.select.down");
				harness.handleInput("tui.select.confirm");
				await waitFor(() =>
					notificationLog.some((item) =>
						/Google GenAI tool selection save failed/.test(item.message),
					),
				);
				assert.deepEqual(mock.rawPi.getActiveTools(), ["read", ...GOOGLE_GENAI_TOOL_NAMES]);

				await rm(configPath, { recursive: true, force: true });
				harness.handleInput("tui.select.down");
				harness.handleInput("tui.select.confirm");
				await waitFor(async () => {
					try {
						return (
							(await loadGoogleGenaiConfig()).config.tools.join(",") === "google_search,google_maps"
						);
					} catch {
						return false;
					}
				});
				assert.ok(harness.render().some((line) => line.includes("› [ ] google_url_context")));
				harness.handleInput("tui.select.cancel");
				return harness.result;
			},
		});
		notificationLog = context.notifications;
		await mock.commands.get("google-genai")?.handler("tools", context.ctx);

		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "google_search", "google_maps"]);
		assert.deepEqual((await loadGoogleGenaiConfig()).config.tools, [
			"google_search",
			"google_maps",
		]);
	});
});

test("status reports unsupported config apiKey interpolation as invalid", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({ apiKey: "$GEMINI_API_KEY" });
		const mock = createMockPi();
		googleGenai(mock.pi);
		const command = mock.commands.get("google-genai");
		assert.ok(command);
		const notifications: Array<{ message: string; level?: string }> = [];
		await command.handler("status", {
			hasUI: true,
			ui: {
				notify(message: string, level?: string) {
					notifications.push({ message, level });
				},
				setStatus() {},
			},
			modelRegistry: { getProviderAuthStatus: () => ({ configured: true, source: "env" }) },
		});

		const message = notifications.at(-1)?.message ?? "";
		assert.match(message, /auth: invalid config apiKey/);
		assert.doesNotMatch(message, /auth: config apiKey/);
	});
});

test("session_start preserves active tools when config is missing or invalid", async () => {
	await withTempAgentDir(async () => {
		let mock = createMockPi({ activeTools: ["read"] });
		googleGenai(mock.pi);
		let context = createMockContext();
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read"]);

		await writeConfig(null);
		mock = createMockPi({ activeTools: ["read"] });
		googleGenai(mock.pi);
		context = createMockContext();
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read"]);
		assert.match(context.notifications[0].message, /must contain a JSON object/);
	});
});

test("session_start restores persisted tool selection and ignores unknown names", async () => {
	await withTempAgentDir(async () => {
		await writeConfig({ tools: ["google_maps", "bad"] });
		const mock = createMockPi({ activeTools: ["read", ...GOOGLE_GENAI_TOOL_NAMES] });
		googleGenai(mock.pi);
		const { ctx, notifications } = createMockContext();
		await mock.events.get("session_start")?.[0]?.({}, ctx);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "google_maps"]);
		assert.match(notifications[0].message, /unknown/);
	});
});

test("normalize settings defaults missing tools to all enabled and allows empty selection", () => {
	assert.deepEqual(normalizeGoogleGenaiSettings({}), {
		model: DEFAULT_MODEL,
		apiUrl: DEFAULT_API_URL,
		timeoutMs: DEFAULT_TIMEOUT_MS,
		tools: [...GOOGLE_GENAI_TOOL_NAMES],
	});
	assert.deepEqual(normalizeGoogleGenaiSettings({ tools: [] }).tools, []);
});

interface TestToolDetails extends Record<string, unknown> {
	sources: Array<{ type?: string; url?: string }>;
	fullResponsePath?: string;
}

type ToolExecute = (
	toolCallId: string,
	params: Record<string, unknown>,
	signal: AbortSignal | undefined,
	onUpdate: undefined,
	ctx: unknown,
) => Promise<{ content: Array<{ type: "text"; text: string }>; details: TestToolDetails }>;

async function executeTool(
	tool: { [key: string]: unknown },
	toolCallId: string,
	params: Record<string, unknown>,
	ctx: unknown,
) {
	return (tool.execute as ToolExecute)(toolCallId, params, undefined, undefined, ctx);
}

async function withTempAgentDir(fn: (agentDir: string) => Promise<void>) {
	const previous = process.env.PI_CODING_AGENT_DIR;
	const agentDir = await mkdtemp(join(tmpdir(), "pi-google-genai-test-"));
	process.env.PI_CODING_AGENT_DIR = agentDir;
	try {
		await fn(agentDir);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		await rm(agentDir, { recursive: true, force: true });
	}
}

async function waitFor(predicate: () => boolean | Promise<boolean>) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	throw new Error("Timed out waiting for condition");
}

function countLines(content: string) {
	if (!content) return 0;
	const lines = content.split("\n");
	if (content.endsWith("\n")) lines.pop();
	return lines.length;
}

async function writeConfig(value: unknown) {
	const agentDir = process.env.PI_CODING_AGENT_DIR;
	assert.ok(agentDir);
	await import("node:fs/promises").then(async (fs) => {
		await fs.mkdir(agentDir, { recursive: true });
		await fs.writeFile(join(agentDir, "pi-google-genai.json"), JSON.stringify(value, null, "\t"));
	});
}

function authContext(apiKey?: string) {
	return {
		modelRegistry: {
			getApiKeyForProvider: async () => apiKey,
		},
	} as never;
}

async function withMockFetch(
	calls: Array<{ url: string; init: RequestInit & { body?: string } }>,
	fn: () => Promise<void>,
) {
	const previous = globalThis.fetch;
	globalThis.fetch = (async (url: string, init: RequestInit & { body?: string }) => {
		calls.push({ url, init });
		return new Response(
			JSON.stringify({
				output_text: "Spain won UEFA Euro 2024.",
				steps: [
					{
						type: "model_output",
						content: [
							{
								type: "text",
								text: "Spain won UEFA Euro 2024.",
								annotations: [
									{
										type: "url_citation",
										title: "Euro 2024 final",
										url: "https://example.test/euro",
									},
								],
							},
						],
					},
					{
						type: "google_maps_result",
						result: [{ places: [{ name: "Place", url: "https://maps.example/place" }] }],
					},
					{
						type: "url_context_result",
						result: [{ url: "https://example.test/doc", status: "success" }],
					},
				],
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	}) as typeof fetch;
	try {
		await fn();
	} finally {
		globalThis.fetch = previous;
	}
}
