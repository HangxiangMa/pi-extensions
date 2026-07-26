import assert from "node:assert/strict";
import test from "node:test";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { digestImages, type ProcessedImage } from "../src/batch.js";
import type { ImageDropLimitsMenuState } from "../src/menu.js";
import { ImageDropRuntime } from "../src/runtime.js";
import type { ImageDropServerOptions } from "../src/server.js";
import { DEFAULT_SETTINGS, type ImageDropSettings } from "../src/settings.js";

const PNG = Buffer.from("processed-png");
const PROCESSED: ProcessedImage = {
	bytes: PNG,
	mimeType: "image/png",
	width: 10,
	height: 20,
	originalWidth: 10,
	originalHeight: 20,
	sourceFormat: "png",
	outputFormat: "png",
	resized: false,
	hash: "hash-one",
	notes: [],
};

function createHarness(
	options: {
		idle?: () => boolean;
		pending?: () => boolean;
		settings?: Partial<ImageDropSettings>;
		startError?: Error;
		menuActions?: Array<"open" | "status" | "settings" | "help" | "close">;
		showMainMenu?: () => Promise<"open" | "status" | "settings" | "help" | "close">;
		statusActions?: Array<"open" | "refresh" | "back" | "close">;
		settingsActions?: Array<"toggle-start" | "limits" | "back" | "close">;
		limitActions?: Array<
			| "maxImages"
			| "maxImageBytes"
			| "maxBatchBytes"
			| "maxImagePixels"
			| "maxRetainedImages"
			| "maxRetainedBytes"
			| "save"
			| "defaults"
			| "back"
			| "close"
		>;
		confirm?: () => Promise<boolean>;
		input?: () => Promise<string | undefined>;
		onStatus?: (lines: readonly string[]) => void;
		onLimits?: (state: ImageDropLimitsMenuState) => void;
		onSave?: (settings: ImageDropSettings) => Promise<void>;
		readPiSettings?: (
			cwd?: string,
			projectTrusted?: boolean,
			signal?: AbortSignal,
		) => Promise<{
			autoResize: boolean;
			blockImages: boolean;
			warnings: string[];
		}>;
	} = {},
) {
	const mock = createMockPi();
	let serverOptions: ImageDropServerOptions | undefined;
	let serverStarts = 0;
	let serverCloses = 0;
	let links = 0;
	let unusedLink = false;
	const server = {
		hasUnusedLink: () => unusedLink,
		issueLink: () => {
			unusedLink = true;
			return `http://127.0.0.1:1234/bootstrap?token=${++links}`;
		},
		broadcastState() {},
		async close() {
			serverCloses += 1;
		},
	};
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({
			kind: "missing",
			settings: { ...DEFAULT_SETTINGS, ...options.settings },
		}),
		readPiSettings:
			options.readPiSettings ??
			(async () => ({ autoResize: true, blockImages: false, warnings: [] })),
		startServer: async (received) => {
			serverStarts += 1;
			serverOptions = received;
			if (options.startError) throw options.startError;
			return server;
		},
		showMainMenu: options.showMainMenu ?? (async () => options.menuActions?.shift() ?? "close"),
		showStatus: async (_ctx, lines) => {
			options.onStatus?.(lines);
			return options.statusActions?.shift() ?? "back";
		},
		loadStatus: async (_ctx, _label, task) => {
			try {
				return { kind: "completed", value: await task(new AbortController().signal) };
			} catch (error) {
				return { kind: "error", error };
			}
		},
		showHelp: async () => "back",
		showSettingsMenu: async (_ctx, menuOptions) => {
			const action = options.settingsActions?.shift() ?? "back";
			if (action !== "toggle-start") return action;
			await menuOptions.onStartChange(!menuOptions.startOnSessionStart);
			return "back";
		},
		showLimitsMenu: async (_ctx, state) => {
			options.onLimits?.(state);
			return options.limitActions?.shift() ?? "back";
		},
		saveSettings: options.onSave ?? (async () => undefined),
		settingsFilePath: () => "/agent/pi-image-drop.json",
	});
	runtime.register();
	const context = createMockContext({
		cwd: "/workspace/image-drop",
		mode: "tui",
		hasUI: true,
		confirm: options.confirm,
		input: options.input,
		model: { id: "vision", provider: "test", input: ["text", "image"] },
		isIdle: options.idle ?? (() => true),
		hasPendingMessages: options.pending ?? (() => false),
	});
	return {
		mock,
		runtime,
		context,
		server,
		get serverOptions() {
			return serverOptions;
		},
		get serverStarts() {
			return serverStarts;
		},
		get serverCloses() {
			return serverCloses;
		},
	};
}

async function emit(
	mock: ReturnType<typeof createMockPi>,
	name: string,
	event: unknown,
	ctx: unknown,
) {
	const handler = mock.events.get(name)?.[0];
	assert.ok(handler, `missing ${name} handler`);
	return handler(event, ctx);
}

test("interactive input appends one ready ordered batch and commits on matching user message", async () => {
	const { mock, runtime, context } = createHarness();
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const existing = { type: "image" as const, data: "existing", mimeType: "image/jpeg" };

	const transformed = (await emit(
		mock,
		"input",
		{
			type: "input",
			text: "compare",
			images: [existing],
			source: "interactive",
		},
		context.ctx,
	)) as {
		action: string;
		text: string;
		images: Array<{ type: string; data: string; mimeType: string }>;
	};
	assert.equal(transformed.action, "transform");
	assert.equal(transformed.text, "compare");
	assert.deepEqual(transformed.images, [
		existing,
		{ type: "image", data: PNG.toString("base64"), mimeType: "image/png" },
	]);
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "reserved");
	assert.match(String(context.widgets.get("image-drop")), /queued/);

	await emit(
		mock,
		"message_start",
		{
			type: "message_start",
			message: {
				role: "user",
				content: [{ type: "text", text: "compare" }, ...transformed.images],
			},
		},
		context.ctx,
	);
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "empty");
	assert.equal(runtime.getBatchForTesting()?.publicHistoryState().items.length, 1);
	assert.equal(context.widgets.get("image-drop"), undefined);

	const ordinary = (await emit(
		mock,
		"input",
		{ type: "input", text: "text only next", source: "interactive" },
		context.ctx,
	)) as { action: string; images?: unknown[] };
	assert.equal(ordinary.action, "continue");
	assert.equal(ordinary.images, undefined);
	assert.equal(runtime.getBatchForTesting()?.publicHistoryState().items.length, 1);
});

test("agent_settled restores a queued reservation that never became a user message", async () => {
	let idle = false;
	let pending = true;
	const { mock, runtime, context } = createHarness({
		idle: () => idle,
		pending: () => pending,
	});
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const result = (await emit(
		mock,
		"input",
		{
			type: "input",
			text: "queued prompt",
			source: "interactive",
			streamingBehavior: "steer",
		},
		context.ctx,
	)) as { action: string; images: Array<{ type: "image"; data: string; mimeType: string }> };
	assert.equal(result.action, "transform");
	assert.equal(
		digestImages(result.images),
		runtime.getBatchForTesting()?.currentReservation()?.digest,
	);

	idle = true;
	await emit(mock, "agent_settled", {}, context.ctx);
	assert.equal(context.editorText, "");
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "reserved");

	pending = false;
	await emit(mock, "agent_settled", {}, context.ctx);
	assert.equal(context.editorText, "queued prompt");
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "ready");
	assert.match(context.notifications.at(-1)?.message ?? "", /restored/i);
});

test("/image-drop is a side-effect-free menu until Open is selected", async () => {
	const cancelled = createHarness({ menuActions: ["close"] });
	await emit(cancelled.mock, "session_start", {}, cancelled.context.ctx);
	await cancelled.mock.commands.get("image-drop")?.handler("", cancelled.context.ctx);
	assert.equal(cancelled.serverStarts, 0);
	assert.equal(cancelled.context.notifications.length, 0);
	assert.equal(cancelled.context.widgets.get("image-drop"), undefined);

	const harness = createHarness({ menuActions: ["open"] });
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	await harness.mock.commands.get("image-drop")?.handler("", harness.context.ctx);
	assert.equal(harness.serverStarts, 1);
	assert.equal(harness.serverOptions?.projectName, "image-drop");
	assert.match(harness.context.notifications[0]?.message ?? "", /token=1/);
	assert.match(String(harness.context.widgets.get("image-drop")), /127\.0\.0\.1/);
	harness.runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const closingBatch = harness.runtime.getBatchForTesting();
	const sent = closingBatch?.reserveMessage("sent");
	assert.ok(sent);
	closingBatch?.commitReservation(sent.digest);
	assert.equal(closingBatch?.publicHistoryState().items.length, 1);
	await emit(harness.mock, "session_shutdown", {}, harness.context.ctx);
	assert.equal(harness.serverCloses, 1);
	assert.deepEqual(closingBatch?.publicHistoryState().items, []);
	assert.equal(harness.context.widgets.get("image-drop"), undefined);
});

test("an unused staging link is previewed before rotation and cancellation preserves it", async () => {
	const harness = createHarness({
		menuActions: ["open", "open", "close"],
		confirm: async () => false,
	});
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	await harness.mock.commands.get("image-drop")?.handler("", harness.context.ctx);
	assert.match(harness.context.notifications.at(-1)?.message ?? "", /token=1/);
	await harness.mock.commands.get("image-drop")?.handler("", harness.context.ctx);
	assert.equal(harness.serverStarts, 1);
	assert.equal(harness.context.notifications.length, 1);
	assert.match(String(harness.context.widgets.get("image-drop")), /token=1/);
});

test("unsupported modes and arguments reject observably before starting the service", async () => {
	const harness = createHarness({ menuActions: ["open"] });
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	const command = harness.mock.commands.get("image-drop");
	assert.ok(command);
	const rpcContext = createMockContext({ mode: "rpc", hasUI: true });
	await command.handler("", rpcContext.ctx);
	await command.handler("open", harness.context.ctx);
	for (const mode of ["print", "json"] as const) {
		const noUiContext = createMockContext({ mode, hasUI: false });
		await assert.rejects(async () => {
			await command.handler("", noUiContext.ctx);
		}, /TUI mode only/i);
		await assert.rejects(async () => {
			await command.handler("open", noUiContext.ctx);
		}, /Usage: \/image-drop/);
	}
	assert.equal(harness.serverStarts, 0);
	assert.match(rpcContext.notifications.at(-1)?.message ?? "", /TUI mode only/i);
	assert.match(harness.context.notifications.at(-1)?.message ?? "", /Usage: \/image-drop/);
});

test("session replacement stops stale main-menu and Status continuations", async () => {
	let resolveMain!: (action: "open") => void;
	let markMainShown!: () => void;
	const mainShown = new Promise<void>((resolve) => {
		markMainShown = resolve;
	});
	const staleMain = createHarness({
		showMainMenu: () =>
			new Promise((resolve) => {
				resolveMain = resolve;
				markMainShown();
			}),
	});
	await emit(staleMain.mock, "session_start", {}, staleMain.context.ctx);
	const oldMain = staleMain.mock.commands.get("image-drop")?.handler("", staleMain.context.ctx);
	await mainShown;
	const replacement = createMockContext({
		cwd: "/workspace/replacement",
		mode: "tui",
		hasUI: true,
	});
	await emit(staleMain.mock, "session_start", {}, replacement.ctx);
	resolveMain("open");
	await oldMain;
	assert.equal(staleMain.serverStarts, 0);
	assert.equal(staleMain.context.notifications.length, 0);

	let resolveSettings!: (value: {
		autoResize: boolean;
		blockImages: boolean;
		warnings: string[];
	}) => void;
	let markSettingsRead!: () => void;
	const settingsRead = new Promise<void>((resolve) => {
		markSettingsRead = resolve;
	});
	let statusViews = 0;
	const staleStatus = createHarness({
		menuActions: ["status"],
		readPiSettings: () =>
			new Promise((resolve) => {
				resolveSettings = resolve;
				markSettingsRead();
			}),
		onStatus: () => {
			statusViews += 1;
		},
	});
	await emit(staleStatus.mock, "session_start", {}, staleStatus.context.ctx);
	const oldStatus = staleStatus.mock.commands
		.get("image-drop")
		?.handler("", staleStatus.context.ctx);
	await settingsRead;
	await emit(staleStatus.mock, "session_start", {}, replacement.ctx);
	resolveSettings({ autoResize: true, blockImages: false, warnings: [] });
	await oldStatus;
	assert.equal(statusViews, 0);
	assert.equal(staleStatus.serverStarts, 0);
});

test("Status exposes readiness, model, history, and Pi policy without starting the service", async () => {
	let statusLines: readonly string[] = [];
	let statusSignal: AbortSignal | undefined;
	const harness = createHarness({
		menuActions: ["status", "close"],
		statusActions: ["back"],
		onStatus: (lines) => {
			statusLines = lines;
		},
		readPiSettings: async (_cwd, _trusted, signal) => {
			statusSignal = signal;
			return { autoResize: true, blockImages: false, warnings: [] };
		},
	});
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	harness.runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	await harness.mock.commands.get("image-drop")?.handler("", harness.context.ctx);
	assert.equal(harness.serverStarts, 0);
	assert.ok(statusSignal instanceof AbortSignal);
	assert.match(statusLines.join("\n"), /1\/1 ready/);
	assert.match(statusLines.join("\n"), /Supports images/);
	assert.match(statusLines.join("\n"), /Pi image sending: Enabled/);
	assert.match(statusLines.join("\n"), /Sent history/);
});

test("a failed Status refresh preserves and labels the previous valid policy", async () => {
	let reads = 0;
	const snapshots: string[] = [];
	const harness = createHarness({
		menuActions: ["status", "close"],
		statusActions: ["refresh", "back"],
		readPiSettings: async () => {
			reads += 1;
			if (reads > 1) throw new Error("settings unavailable");
			return { autoResize: false, blockImages: false, warnings: [] };
		},
		onStatus: (lines) => snapshots.push(lines.join("\n")),
	});
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	await harness.mock.commands.get("image-drop")?.handler("", harness.context.ctx);
	assert.equal(snapshots.length, 2);
	assert.match(snapshots[1] ?? "", /Auto-resize: Off/);
	assert.match(snapshots[1] ?? "", /showing the previous valid state/);
});

test("Settings preview and save future limits without changing current-session limits", async () => {
	let saved: ImageDropSettings | undefined;
	const menuStates: ImageDropLimitsMenuState[] = [];
	const harness = createHarness({
		menuActions: ["settings", "close"],
		settingsActions: ["limits", "back"],
		limitActions: ["maxImages", "save"],
		input: async () => "12",
		confirm: async () => true,
		onSave: async (settings) => {
			saved = settings;
		},
		onLimits: (state) => menuStates.push(state),
	});
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	await harness.mock.commands.get("image-drop")?.handler("", harness.context.ctx);
	assert.equal(saved?.maxImages, 12);
	assert.deepEqual(menuStates[0]?.values.maxImages, { current: "8", defaultValue: "8" });
	assert.deepEqual(menuStates[1]?.values.maxImages, {
		pending: "12",
		current: "8",
		defaultValue: "8",
	});
	assert.equal(harness.runtime.getBatchForTesting()?.publicHistoryState().maxImages, 128);
	assert.match(harness.context.notifications.at(-1)?.message ?? "", /future Pi sessions/i);
});

test("cancelled and failed settings changes preserve the previous valid state", async () => {
	let saves = 0;
	const cancelled = createHarness({
		menuActions: ["settings", "close"],
		settingsActions: ["limits", "back"],
		limitActions: ["maxImages", "save", "back"],
		input: async () => "12",
		confirm: async () => false,
		onSave: async () => {
			saves += 1;
		},
	});
	await emit(cancelled.mock, "session_start", {}, cancelled.context.ctx);
	await cancelled.mock.commands.get("image-drop")?.handler("", cancelled.context.ctx);
	assert.equal(saves, 0);

	const failed = createHarness({
		menuActions: ["settings", "close"],
		settingsActions: ["toggle-start", "back"],
		onSave: async () => {
			throw new Error("disk full");
		},
	});
	await emit(failed.mock, "session_start", {}, failed.context.ctx);
	await failed.mock.commands.get("image-drop")?.handler("", failed.context.ctx);
	assert.equal(failed.runtime.getBatchForTesting()?.publicHistoryState().maxImages, 128);
	assert.match(
		failed.context.notifications.at(-1)?.message ?? "",
		/previous settings remain active.*disk full/i,
	);
});

test("startOnSessionStart starts once, presents a link, and reuses the server", async () => {
	const harness = createHarness({
		settings: { startOnSessionStart: true },
		menuActions: ["open"],
	});
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	assert.equal(harness.serverStarts, 1);
	assert.match(harness.context.notifications[0]?.message ?? "", /token=1/);
	assert.match(String(harness.context.widgets.get("image-drop")), /token=1/);

	await harness.mock.commands.get("image-drop")?.handler("", harness.context.ctx);
	assert.equal(harness.serverStarts, 1);
	assert.match(harness.context.notifications[1]?.message ?? "", /token=2/);
	assert.match(String(harness.context.widgets.get("image-drop")), /token=2/);
	await emit(harness.mock, "session_shutdown", {}, harness.context.ctx);
	assert.equal(harness.serverCloses, 1);
});

test("startOnSessionStart replaces and closes the session-owned server", async () => {
	const harness = createHarness({ settings: { startOnSessionStart: true } });
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	assert.equal(harness.serverStarts, 2);
	assert.equal(harness.serverCloses, 1);
	assert.match(harness.context.notifications[1]?.message ?? "", /token=2/);
	await emit(harness.mock, "session_shutdown", {}, harness.context.ctx);
	assert.equal(harness.serverCloses, 2);
});

test("startOnSessionStart failure warns without failing session startup", async () => {
	const harness = createHarness({
		settings: { startOnSessionStart: true },
		startError: new Error("listener unavailable"),
	});
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	assert.equal(harness.serverStarts, 1);
	assert.match(
		harness.context.notifications[0]?.message ?? "",
		/could not start.*listener unavailable/i,
	);
	assert.equal(harness.runtime.getBatchForTesting()?.publicState().phase, "empty");
});

test("browser processing re-reads Pi settings and guards model and blockImages", async () => {
	let settings = { autoResize: false, blockImages: false, warnings: [] as string[] };
	const mock = createMockPi();
	let serverOptions: ImageDropServerOptions | undefined;
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({ kind: "missing", settings: { ...DEFAULT_SETTINGS } }),
		readPiSettings: async () => settings,
		startServer: async (options) => {
			serverOptions = options;
			return {
				issueLink: () => "http://127.0.0.1/link",
				broadcastState() {},
				close: async () => {},
			};
		},
		showMainMenu: async () => "open",
	});
	runtime.register();
	const context = createMockContext({
		mode: "tui",
		model: { id: "vision", provider: "test", input: ["text", "image"] },
	});
	await emit(mock, "session_start", {}, context.ctx);
	await mock.commands.get("image-drop")?.handler("", context.ctx);
	assert.equal(await serverOptions?.getAutoResize(), false);
	settings = { autoResize: true, blockImages: true, warnings: [] };
	await assert.rejects(serverOptions?.getAutoResize() ?? Promise.resolve(), /disabled/i);
	settings = { autoResize: true, blockImages: false, warnings: [] };
	(context.ctx as unknown as { model: unknown }).model = {
		id: "text",
		provider: "test",
		input: ["text"],
	};
	await assert.rejects(serverOptions?.getAutoResize() ?? Promise.resolve(), /does not support/i);
});

test("submission reprocesses retained sources after autoResize changes", async () => {
	const mock = createMockPi();
	const seen: boolean[] = [];
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({ kind: "missing", settings: { ...DEFAULT_SETTINGS } }),
		readPiSettings: async () => ({ autoResize: false, blockImages: false, warnings: [] }),
		createProcessor: () => ({
			process: async (_source, options) => {
				seen.push(options.autoResize);
				return { ...PROCESSED, bytes: Buffer.from("reprocessed"), hash: "reprocessed" };
			},
		}),
	});
	runtime.register();
	const context = createMockContext({
		model: { id: "vision", provider: "test", input: ["text", "image"] },
	});
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const result = (await emit(
		mock,
		"input",
		{ type: "input", text: "use current setting", source: "interactive" },
		context.ctx,
	)) as { action: string; images: Array<{ data: string }> };
	assert.equal(result.action, "transform");
	assert.deepEqual(seen, [false]);
	assert.equal(result.images[0]?.data, Buffer.from("reprocessed").toString("base64"));
});

test("a sent history image can be restaged and reprocessed for the current autoResize setting", async () => {
	const mock = createMockPi();
	const seen: Array<{ source: string; autoResize: boolean }> = [];
	let autoResize = true;
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({ kind: "missing", settings: { ...DEFAULT_SETTINGS } }),
		readPiSettings: async () => ({ autoResize, blockImages: false, warnings: [] }),
		createProcessor: () => ({
			process: async (source, options) => {
				seen.push({ source: Buffer.from(source).toString(), autoResize: options.autoResize });
				return { ...PROCESSED, bytes: Buffer.from("restaged-output"), hash: "restaged-output" };
			},
		}),
	});
	runtime.register();
	const context = createMockContext({
		model: { id: "vision", provider: "test", input: ["text", "image"] },
	});
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("raw-source"), PROCESSED);
	const first = (await emit(
		mock,
		"input",
		{ type: "input", text: "first send", source: "interactive" },
		context.ctx,
	)) as { images: Array<{ type: string; data: string; mimeType: string }> };
	await emit(
		mock,
		"message_start",
		{ message: { role: "user", content: [{ type: "text", text: "first send" }, ...first.images] } },
		context.ctx,
	);
	const batch = runtime.getBatchForTesting();
	autoResize = false;
	const historyId = batch?.publicHistoryState().items[0]?.id;
	assert.ok(historyId);
	batch?.restageHistory([{ historyId, id: "restaged" }]);

	const second = (await emit(
		mock,
		"input",
		{ type: "input", text: "send again", source: "interactive" },
		context.ctx,
	)) as { action: string; images: Array<{ data: string }> };
	assert.equal(second.action, "transform");
	assert.deepEqual(seen, [{ source: PNG.toString(), autoResize: false }]);
	assert.equal(second.images[0]?.data, Buffer.from("restaged-output").toString("base64"));
});

test("failed setting-change reprocessing restores text and blocks the batch", async () => {
	const mock = createMockPi();
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({ kind: "missing", settings: { ...DEFAULT_SETTINGS } }),
		readPiSettings: async () => ({ autoResize: false, blockImages: false, warnings: [] }),
		createProcessor: () => ({
			process: async () => Promise.reject(new Error("no-resize output is too large")),
		}),
	});
	runtime.register();
	const context = createMockContext({
		model: { id: "vision", provider: "test", input: ["text", "image"] },
	});
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const result = (await emit(
		mock,
		"input",
		{ type: "input", text: "keep this", source: "interactive" },
		context.ctx,
	)) as { action: string };
	assert.equal(result.action, "handled");
	assert.equal(context.editorText, "keep this");
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "blocked");
	assert.match(runtime.getBatchForTesting()?.publicState().items[0]?.error ?? "", /too large/i);
});

test("a new input at an idle recovery boundary preserves both drafts for resubmission", async () => {
	let idle = false;
	const { mock, runtime, context } = createHarness({ idle: () => idle });
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	await emit(
		mock,
		"input",
		{ type: "input", text: "failed preflight", source: "interactive" },
		context.ctx,
	);
	idle = true;
	const result = (await emit(
		mock,
		"input",
		{ type: "input", text: "new draft", source: "interactive" },
		context.ctx,
	)) as { action: string };
	assert.equal(result.action, "handled");
	assert.equal(context.editorText, "failed preflight\n\nnew draft");
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "ready");
});

test("agent_settled recovery does not overwrite a newer editor draft", async () => {
	let idle = false;
	let pending = true;
	const { mock, runtime, context } = createHarness({ idle: () => idle, pending: () => pending });
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	await emit(
		mock,
		"input",
		{ type: "input", text: "queued prompt", source: "interactive", streamingBehavior: "steer" },
		context.ctx,
	);
	(context.ctx as unknown as { ui: { setEditorText(value: string): void } }).ui.setEditorText(
		"newer draft",
	);
	idle = true;
	pending = false;
	await emit(mock, "agent_settled", {}, context.ctx);
	assert.equal(context.editorText, "newer draft\n\nqueued prompt");
});

test("the next command recovers an idle preflight reservation that never started", async () => {
	let idle = false;
	const { mock, runtime, context } = createHarness({ idle: () => idle });
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const result = (await emit(
		mock,
		"input",
		{ type: "input", text: "preflight failed", source: "interactive" },
		context.ctx,
	)) as { action: string };
	assert.equal(result.action, "transform");

	idle = true;
	await mock.commands.get("image-drop")?.handler("", context.ctx);
	assert.equal(context.editorText, "preflight failed");
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "ready");
	assert.match(context.notifications[0]?.message ?? "", /restored/i);
});

test("follow-up input commits only after the matching ordered image message starts", async () => {
	const { mock, runtime, context } = createHarness();
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const transformed = (await emit(
		mock,
		"input",
		{
			type: "input",
			text: "later",
			source: "interactive",
			streamingBehavior: "followUp",
		},
		context.ctx,
	)) as { action: string; images: Array<{ type: string; data: string; mimeType: string }> };
	assert.equal(transformed.action, "transform");
	await emit(
		mock,
		"message_start",
		{ message: { role: "user", content: [{ type: "text", text: "unrelated" }] } },
		context.ctx,
	);
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "reserved");
	const laterImage = { type: "image", data: "later", mimeType: "image/jpeg" };
	await emit(
		mock,
		"message_start",
		{ message: { role: "user", content: [...transformed.images, laterImage] } },
		context.ctx,
	);
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "empty");
});

test("empty image-only interactive input does not consume the browser batch", async () => {
	const { mock, runtime, context } = createHarness();
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const result = (await emit(
		mock,
		"input",
		{
			type: "input",
			text: "  ",
			images: [{ type: "image", data: "x", mimeType: "image/png" }],
			source: "interactive",
		},
		context.ctx,
	)) as { action: string };
	assert.equal(result.action, "continue");
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "ready");
});

test("session replacement closes the old server and clears every staged and retained byte", async () => {
	const harness = createHarness({ menuActions: ["open"] });
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	await harness.mock.commands.get("image-drop")?.handler("", harness.context.ctx);
	harness.runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const oldBatch = harness.runtime.getBatchForTesting();
	const reservation = oldBatch?.reserveMessage("sent");
	assert.ok(reservation);
	oldBatch?.commitReservation(reservation.digest);
	assert.equal(oldBatch?.publicHistoryState().items.length, 1);
	await emit(harness.mock, "session_start", {}, harness.context.ctx);
	assert.equal(harness.serverCloses, 1);
	assert.deepEqual(oldBatch?.publicHistoryState().items, []);
	assert.equal(harness.runtime.getBatchForTesting()?.publicState().phase, "empty");
	assert.deepEqual(harness.runtime.getBatchForTesting()?.publicHistoryState().items, []);
	assert.equal(harness.context.widgets.get("image-drop"), undefined);
});

test("a stale input settings read cannot consume the replacement session batch", async () => {
	const mock = createMockPi();
	let resolvePiSettings!: (value: {
		autoResize: boolean;
		blockImages: boolean;
		warnings: string[];
	}) => void;
	let markSettingsRead!: () => void;
	const settingsRead = new Promise<void>((resolve) => {
		markSettingsRead = resolve;
	});
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({ kind: "missing", settings: { ...DEFAULT_SETTINGS } }),
		readPiSettings: () => {
			markSettingsRead();
			return new Promise((resolve) => {
				resolvePiSettings = resolve;
			});
		},
	});
	runtime.register();
	const oldContext = createMockContext({
		cwd: "/workspace/old",
		model: { id: "vision", provider: "test", input: ["text", "image"] },
	});
	const newContext = createMockContext({
		cwd: "/workspace/new",
		model: { id: "vision", provider: "test", input: ["text", "image"] },
	});
	await emit(mock, "session_start", {}, oldContext.ctx);
	runtime.addReadyImageForTesting("old", "old.png", Buffer.from("old"), PROCESSED);
	const staleInput = emit(
		mock,
		"input",
		{ type: "input", text: "old prompt", source: "interactive" },
		oldContext.ctx,
	);
	await settingsRead;
	await emit(mock, "session_start", {}, newContext.ctx);
	runtime.addReadyImageForTesting("new", "new.png", Buffer.from("new"), {
		...PROCESSED,
		hash: "hash-new",
	});
	const replacementBatch = runtime.getBatchForTesting();
	resolvePiSettings({ autoResize: true, blockImages: false, warnings: [] });
	const result = (await staleInput) as { action: string };
	assert.equal(result.action, "handled");
	assert.equal(runtime.getBatchForTesting(), replacementBatch);
	assert.equal(replacementBatch?.publicState().phase, "ready");
	assert.equal(oldContext.editorText, "");
	assert.equal(newContext.editorText, "");
});

test("a stale session start cannot close the newer batch after slow server shutdown", async () => {
	const mock = createMockPi();
	let markClosing!: () => void;
	let releaseClose!: () => void;
	const closing = new Promise<void>((resolve) => {
		markClosing = resolve;
	});
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({ kind: "missing", settings: { ...DEFAULT_SETTINGS } }),
		startServer: async () => ({
			issueLink: () => "http://127.0.0.1/link",
			broadcastState() {},
			close: () => {
				markClosing();
				return new Promise<void>((resolve) => {
					releaseClose = resolve;
				});
			},
		}),
		showMainMenu: async () => "open",
	});
	runtime.register();
	const initialContext = createMockContext({ cwd: "/workspace/initial", mode: "tui" });
	const staleContext = createMockContext({ cwd: "/workspace/stale" });
	const currentContext = createMockContext({ cwd: "/workspace/current" });
	await runtime.start(initialContext.ctx);
	await mock.commands.get("image-drop")?.handler("", initialContext.ctx);

	const staleStart = runtime.start(staleContext.ctx);
	await closing;
	await runtime.start(currentContext.ctx);
	const currentBatch = runtime.getBatchForTesting();
	runtime.addReadyImageForTesting("current", "current.png", Buffer.from("current"), PROCESSED);
	releaseClose();
	await staleStart;

	assert.equal(runtime.getBatchForTesting(), currentBatch);
	assert.equal(currentBatch?.publicState().phase, "ready");
});

test("a stale shutdown cannot clear a newer batch after slow server shutdown", async () => {
	const mock = createMockPi();
	let markClosing!: () => void;
	let releaseClose!: () => void;
	const closing = new Promise<void>((resolve) => {
		markClosing = resolve;
	});
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({ kind: "missing", settings: { ...DEFAULT_SETTINGS } }),
		startServer: async () => ({
			issueLink: () => "http://127.0.0.1/link",
			broadcastState() {},
			close: () => {
				markClosing();
				return new Promise<void>((resolve) => {
					releaseClose = resolve;
				});
			},
		}),
		showMainMenu: async () => "open",
	});
	runtime.register();
	const oldContext = createMockContext({ cwd: "/workspace/old", mode: "tui" });
	const currentContext = createMockContext({ cwd: "/workspace/current" });
	await runtime.start(oldContext.ctx);
	await mock.commands.get("image-drop")?.handler("", oldContext.ctx);

	const staleShutdown = runtime.shutdown(oldContext.ctx);
	await closing;
	await runtime.start(currentContext.ctx);
	const currentBatch = runtime.getBatchForTesting();
	runtime.addReadyImageForTesting("current", "current.png", Buffer.from("current"), PROCESSED);
	releaseClose();
	await staleShutdown;

	assert.equal(runtime.getBatchForTesting(), currentBatch);
	assert.equal(currentBatch?.publicState().phase, "ready");
});

test("an overlapping stale session start cannot replace the newer session", async () => {
	const mock = createMockPi();
	let resolveFirst!: (value: { kind: "missing"; settings: typeof DEFAULT_SETTINGS }) => void;
	let calls = 0;
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: () => {
			calls += 1;
			if (calls === 1) {
				return new Promise((resolve) => {
					resolveFirst = resolve;
				});
			}
			return Promise.resolve({ kind: "missing", settings: { ...DEFAULT_SETTINGS } });
		},
	});
	const oldContext = createMockContext({ cwd: "/workspace/old" });
	const newContext = createMockContext({ cwd: "/workspace/new" });
	const staleStart = runtime.start(oldContext.ctx);
	await new Promise((resolve) => setImmediate(resolve));
	await runtime.start(newContext.ctx);
	const currentBatch = runtime.getBatchForTesting();
	resolveFirst({ kind: "missing", settings: { ...DEFAULT_SETTINGS } });
	await staleStart;
	assert.equal(runtime.getBatchForTesting(), currentBatch);
});

test("non-ready batches block submission and restore editor text", async () => {
	const { mock, runtime, context } = createHarness();
	await emit(mock, "session_start", {}, context.ctx);
	runtime.getBatchForTesting()?.reserveItems([{ id: "pending", name: "pending.png", size: 4 }]);
	const result = (await emit(
		mock,
		"input",
		{ type: "input", text: "do not lose me", source: "interactive" },
		context.ctx,
	)) as { action: string };
	assert.equal(result.action, "handled");
	assert.equal(context.editorText, "do not lose me");
	assert.match(context.notifications.at(-1)?.message ?? "", /wait/i);
});

test("text-only models preserve the draft and text", async () => {
	const { mock, runtime, context } = createHarness();
	(context.ctx as unknown as { model: unknown }).model = {
		id: "text",
		provider: "test",
		input: ["text"],
	};
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const result = (await emit(
		mock,
		"input",
		{ type: "input", text: "blocked", source: "interactive" },
		context.ctx,
	)) as { action: string };
	assert.equal(result.action, "handled");
	assert.equal(context.editorText, "blocked");
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "ready");
	assert.match(context.notifications.at(-1)?.message ?? "", /does not support/i);
});

test("blockImages preserves the draft and text", async () => {
	const mock = createMockPi();
	const runtime = new ImageDropRuntime(mock.pi, {
		loadSettings: async () => ({ kind: "missing", settings: { ...DEFAULT_SETTINGS } }),
		readPiSettings: async () => ({ autoResize: true, blockImages: true, warnings: [] }),
	});
	runtime.register();
	const context = createMockContext({
		model: { id: "vision", provider: "test", input: ["text", "image"] },
	});
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	const result = (await emit(
		mock,
		"input",
		{ type: "input", text: "blocked", source: "interactive" },
		context.ctx,
	)) as { action: string };
	assert.equal(result.action, "handled");
	assert.equal(context.editorText, "blocked");
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "ready");
	assert.match(context.notifications.at(-1)?.message ?? "", /disabled/i);
});

test("non-interactive inputs never consume a browser batch", async () => {
	const { mock, runtime, context } = createHarness();
	await emit(mock, "session_start", {}, context.ctx);
	runtime.addReadyImageForTesting("one", "one.png", Buffer.from("source"), PROCESSED);
	for (const source of ["rpc", "extension"] as const) {
		const result = (await emit(
			mock,
			"input",
			{ type: "input", text: "external", source },
			context.ctx,
		)) as { action: string };
		assert.equal(result.action, "continue");
	}
	assert.equal(runtime.getBatchForTesting()?.publicState().phase, "ready");
});
