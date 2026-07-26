import assert from "node:assert/strict";
import test from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import { type RuntimeDependencies, WebUIRuntime } from "../src/runtime.js";
import { DEFAULT_SETTINGS, type SettingsLoadResult } from "../src/settings.js";

initTheme("dark", false);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error("condition was not met");
}

function createRuntime(
	overrides: Partial<RuntimeDependencies> = {},
	loaded: SettingsLoadResult = {
		kind: "missing",
		path: "/agent/pi-webui.json",
		settings: { ...DEFAULT_SETTINGS },
		source: "defaults",
		document: {},
	},
) {
	const mock = createMockPi();
	let links = 0;
	const runtime = new WebUIRuntime(mock.pi, {
		loadSettings: async () => loaded,
		saveSettings: async (settings, document) => ({ ...document, ...settings }),
		initializeSettings: async () => "created",
		startServer: async () => ({
			issueLink: () => `http://127.0.0.1:1234/bootstrap?token=${++links}`,
			close: async () => undefined,
		}),
		readPiSettings: async () => ({ autoResize: true, blockImages: false, warnings: [] }),
		processImages: async () => [],
		...overrides,
	});
	runtime.register();
	return { mock, runtime };
}

test("bare webui opens a cancellable TUI menu while open preserves the direct link flow", async () => {
	let starts = 0;
	let links = 0;
	const { mock, runtime } = createRuntime({
		startServer: async () => {
			starts += 1;
			return {
				issueLink: () => `http://127.0.0.1:1234/bootstrap?token=${++links}`,
				close: async () => undefined,
			};
		},
	});
	const tui = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			const selector = createCustomSelectorHarness(factory);
			assert.match(selector.render().join("\n"), /server: stopped/i);
			selector.handleInput("\u001b");
			return selector.result;
		},
	});
	await runtime.start(tui.ctx);
	const command = mock.commands.get("webui");
	assert.ok(command);

	await command.handler("", tui.ctx);
	assert.equal(starts, 0);
	assert.equal(links, 0);

	await command.handler("open", tui.ctx);
	assert.equal(starts, 1);
	assert.equal(links, 1);
	assert.match(tui.notifications.at(-1)?.message ?? "", /token=1/);
});

test("webui command completes and routes settings, status, help, and invalid arguments", async () => {
	const { mock, runtime } = createRuntime();
	const context = createMockContext({ hasUI: true, mode: "rpc" });
	await runtime.start(context.ctx);
	const command = mock.commands.get("webui");
	assert.ok(command);
	const completions = command.getArgumentCompletions?.("") as Array<{ value: string }> | undefined;
	assert.ok(completions);
	assert.deepEqual(
		completions.map((item) => item.value),
		["open", "settings", "status", "help", "init"],
	);

	await command.handler("settings", context.ctx);
	assert.match(context.notifications.at(-1)?.message ?? "", /manual.*pi-webui\.json/i);
	await command.handler("status", context.ctx);
	const status = context.notifications.at(-1)?.message ?? "";
	assert.match(status, /Startup: Manual.*defaults/is);
	assert.match(
		status,
		/Image limits \(defaults\): 8 images, 10 MiB\/image, 40 MiB\/batch, 50,000,000 pixels\/image/,
	);
	assert.match(status, /server: stopped/i);
	assert.doesNotMatch(status, /token=/i);
	await command.handler("help", context.ctx);
	const help = context.notifications.at(-1)?.message ?? "";
	assert.match(help, /\/webui \[open\|settings\|status\|help\|init\]/i);
	assert.match(help, /"startOnSessionStart": false/);
	assert.match(help, /maxImages.*maxImageBytes.*maxBatchBytes.*maxImagePixels/i);
	assert.match(help, /provider-ready dimension\/Base64 limits are fixed/i);
	assert.doesNotMatch(help, /token=/i);
	await command.handler("unknown", context.ctx);
	assert.match(context.notifications.at(-1)?.message ?? "", /usage:/i);

	await command.handler("open", context.ctx);
	await command.handler("status", context.ctx);
	const runningStatus = context.notifications.at(-1)?.message ?? "";
	assert.match(runningStatus, /server: running/i);
	assert.doesNotMatch(runningStatus, /token=/i);
});

test("a menu selection cannot dispatch into a replacement session", async () => {
	const selection = deferred<string | undefined>();
	let options: string[] = [];
	let starts = 0;
	const { mock, runtime } = createRuntime({
		startServer: async () => {
			starts += 1;
			return {
				issueLink: () => "http://127.0.0.1:1234/bootstrap?token=stale",
				close: async () => undefined,
			};
		},
	});
	const original = createMockContext({
		hasUI: true,
		mode: "rpc",
		select: async (_title: string, items: string[]) => {
			options = items;
			return selection.promise;
		},
	});
	await runtime.start(original.ctx);
	const opening = mock.commands.get("webui")?.handler("", original.ctx);
	await waitFor(() => options.length > 0);

	const replacement = createMockContext({ hasUI: true, mode: "rpc" });
	await runtime.start(replacement.ctx);
	selection.resolve(options[0]);
	await opening;

	assert.equal(starts, 0);
	assert.equal(original.notifications.length, 0);
	assert.equal(replacement.notifications.length, 0);
});

test("menu waits for settings persistence before rebuilding current state", async () => {
	const saved = deferred<void>();
	let customCalls = 0;
	let saveStarted = false;
	const { mock, runtime } = createRuntime({
		saveSettings: async (settings, document) => {
			saveStarted = true;
			await saved.promise;
			return { ...document, ...settings };
		},
	});
	const context = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			customCalls += 1;
			const selector = createCustomSelectorHarness(factory);
			if (customCalls === 1) {
				selector.handleInput("\u001b[B");
				selector.handleInput("\r");
			} else if (customCalls === 2) {
				selector.handleInput("\r");
				selector.handleInput("\u001b");
			} else {
				assert.match(selector.render().join("\n"), /Startup: Every session/);
				selector.handleInput("\u001b");
			}
			return selector.result;
		},
	});
	await runtime.start(context.ctx);
	const showing = mock.commands.get("webui")?.handler("", context.ctx);
	await waitFor(() => saveStarted);
	assert.equal(customCalls, 2);
	saved.resolve(undefined);
	await showing;
	assert.equal(customCalls, 3);
});

test("menu secondary screens return with stable selection and no server side effects", async () => {
	let starts = 0;
	let customCalls = 0;
	const { mock, runtime } = createRuntime({
		startServer: async () => {
			starts += 1;
			return {
				issueLink: () => "http://127.0.0.1:1234/bootstrap?token=unused",
				close: async () => undefined,
			};
		},
	});
	const context = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			customCalls += 1;
			const selector = createCustomSelectorHarness(factory);
			if (customCalls === 1) {
				selector.handleInput("\u001b[B");
				selector.handleInput("\u001b[B");
				selector.handleInput("\r");
			} else if (customCalls === 2) {
				assert.match(selector.render().join("\n"), /Image limits/);
				selector.handleInput("tui.select.cancel");
			} else {
				assert.match(selector.render().join("\n"), /Effect: Review effective startup/);
				selector.handleInput("\u001b");
			}
			return selector.result;
		},
	});
	await runtime.start(context.ctx);
	await mock.commands.get("webui")?.handler("", context.ctx);
	assert.equal(customCalls, 3);
	assert.equal(starts, 0);
});

test("bare webui is side-effect free without UI and RPC cancellation stays observable", async () => {
	let starts = 0;
	const { mock, runtime } = createRuntime({
		startServer: async () => {
			starts += 1;
			return {
				issueLink: () => "http://127.0.0.1:1234/bootstrap?token=unused",
				close: async () => undefined,
			};
		},
	});
	for (const mode of ["print", "json"] as const) {
		const context = createMockContext({ hasUI: false, mode });
		await runtime.start(context.ctx);
		await mock.commands.get("webui")?.handler("", context.ctx);
		await mock.commands.get("webui")?.handler("open", context.ctx);
	}
	const rpc = createMockContext({
		hasUI: true,
		mode: "rpc",
		select: async () => undefined,
	});
	await runtime.start(rpc.ctx);
	await mock.commands.get("webui")?.handler("", rpc.ctx);
	assert.equal(starts, 0);
});

test("invalid settings expose read-only repair guidance instead of a failing toggle", async () => {
	let saves = 0;
	let customCalls = 0;
	const { mock, runtime } = createRuntime(
		{
			saveSettings: async () => {
				saves += 1;
				return {};
			},
		},
		{
			kind: "invalid",
			path: "/agent/broken-pi-webui.json",
			settings: { ...DEFAULT_SETTINGS },
			source: "defaults",
			warning: "invalid settings preserved",
		},
	);
	const context = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			customCalls += 1;
			const selector = createCustomSelectorHarness(factory);
			if (customCalls === 1) {
				assert.match(selector.render().join("\n"), /Repair settings file/);
				selector.handleInput("\u001b[B");
				selector.handleInput("\r");
			} else if (customCalls === 2) {
				assert.match(selector.render().join("\n"), /preserved without changes/);
				selector.handleInput("tui.select.cancel");
			} else {
				selector.handleInput("\u001b");
			}
			return selector.result;
		},
	});
	await runtime.start(context.ctx);
	await mock.commands.get("webui")?.handler("", context.ctx);
	assert.equal(customCalls, 3);
	assert.equal(saves, 0);
});

test("open exposes distinct applying state before publishing success", async () => {
	const starting = deferred<{
		issueLink(): string;
		close(): Promise<void>;
	}>();
	const { mock, runtime } = createRuntime({ startServer: async () => starting.promise });
	const context = createMockContext({ hasUI: true, mode: "rpc" });
	await runtime.start(context.ctx);
	const opening = mock.commands.get("webui")?.handler("open", context.ctx);
	assert.equal(context.statuses.get("webui:activity"), "Starting WebUI…");
	starting.resolve({
		issueLink: () => "http://127.0.0.1:1234/bootstrap?token=ready",
		close: async () => undefined,
	});
	await opening;
	assert.equal(context.statuses.get("webui:activity"), undefined);
	assert.match(context.notifications.at(-1)?.message ?? "", /token=ready/);

	const refreshing = mock.commands.get("webui")?.handler("open", context.ctx);
	assert.equal(context.statuses.get("webui:activity"), "Creating fresh WebUI link…");
	await refreshing;
	assert.equal(context.statuses.get("webui:activity"), undefined);
});

test("open failures preserve valid server state and clear actionable activity feedback", async () => {
	let issues = 0;
	const { mock, runtime } = createRuntime({
		startServer: async () => ({
			issueLink: () => {
				issues += 1;
				if (issues === 2) throw new Error("token source unavailable");
				return "http://127.0.0.1:1234/bootstrap?token=first";
			},
			close: async () => undefined,
		}),
	});
	const context = createMockContext({ hasUI: true, mode: "rpc" });
	await runtime.start(context.ctx);
	const command = mock.commands.get("webui");
	await command?.handler("open", context.ctx);
	await command?.handler("open", context.ctx);
	assert.match(
		context.notifications.at(-1)?.message ?? "",
		/token source unavailable.*Retry with \/webui open/i,
	);
	assert.equal(context.statuses.get("webui:activity"), undefined);
	await command?.handler("status", context.ctx);
	assert.match(context.notifications.at(-1)?.message ?? "", /Server: Running/);

	const failed = createRuntime({
		startServer: async () => {
			throw new Error("listener unavailable");
		},
	});
	const failedContext = createMockContext({ hasUI: true, mode: "rpc" });
	await failed.runtime.start(failedContext.ctx);
	await failed.mock.commands.get("webui")?.handler("open", failedContext.ctx);
	assert.equal(failedContext.statuses.get("webui:activity"), undefined);
	await failed.mock.commands.get("webui")?.handler("status", failedContext.ctx);
	assert.match(failedContext.notifications.at(-1)?.message ?? "", /Server: Stopped/);
});

test("settings never opens custom TUI in RPC, JSON, or print modes", async () => {
	const { mock, runtime } = createRuntime();
	let customCalls = 0;
	for (const mode of ["rpc", "json", "print"]) {
		const context = createMockContext({
			hasUI: mode === "rpc",
			mode,
			custom: async () => {
				customCalls += 1;
			},
		});
		await runtime.start(context.ctx);
		await mock.commands.get("webui")?.handler("settings", context.ctx);
	}
	assert.equal(customCalls, 0);
});

test("init creates defaults without TUI in non-TUI modes and opens settings in TUI", async () => {
	let initialized = 0;
	let customCalls = 0;
	const { mock, runtime } = createRuntime({
		initializeSettings: async () => {
			initialized += 1;
			return initialized === 1 ? "created" : "exists";
		},
	});
	const rpc = createMockContext({
		hasUI: true,
		mode: "rpc",
		custom: async () => {
			customCalls += 1;
		},
	});
	await runtime.start(rpc.ctx);
	await mock.commands.get("webui")?.handler("init", rpc.ctx);
	assert.equal(initialized, 1);
	assert.equal(customCalls, 0);
	assert.match(rpc.notifications.at(-1)?.message ?? "", /created.*pi-webui\.json/i);

	const tui = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			customCalls += 1;
			const selector = createCustomSelectorHarness(factory);
			selector.handleInput("\u001b");
			return selector.result;
		},
	});
	await mock.commands.get("webui")?.handler("init", tui.ctx);
	assert.equal(initialized, 2);
	assert.equal(customCalls, 1);
	assert.match(tui.notifications[0]?.message ?? "", /already exists/i);
});

test("settings changes save in action order and update effective status", async () => {
	const first = deferred<void>();
	const requested: boolean[] = [];
	const { mock, runtime } = createRuntime({
		saveSettings: async (settings, document) => {
			requested.push(settings.startOnSessionStart);
			if (requested.length === 1) await first.promise;
			return { ...document, ...settings };
		},
	});
	const context = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			const selector = createCustomSelectorHarness(factory);
			assert.doesNotMatch(
				selector.render().join("\n"),
				/maxImages|maxImageBytes|maxBatchBytes|maxImagePixels/,
			);
			selector.handleInput("\r");
			selector.handleInput("\r");
			await waitFor(() => requested.length === 1);
			assert.deepEqual(requested, [true]);
			first.resolve(undefined);
			await waitFor(() => requested.length === 2);
			selector.handleInput("\u001b");
			return selector.result;
		},
	});
	await runtime.start(context.ctx);
	await mock.commands.get("webui")?.handler("settings", context.ctx);
	assert.deepEqual(
		requested,
		[true, false],
		context.notifications.map((item) => item.message).join("\n"),
	);
	await mock.commands.get("webui")?.handler("status", context.ctx);
	assert.match(context.notifications.at(-1)?.message ?? "", /Startup: Manual.*settings file/is);
});

test("failed settings save rolls back the displayed and effective value", async () => {
	const { mock, runtime } = createRuntime({
		saveSettings: async () => {
			throw new Error("disk full");
		},
	});
	const context = createMockContext({
		hasUI: true,
		mode: "tui",
		custom: async (factory: unknown) => {
			const selector = createCustomSelectorHarness(factory);
			selector.handleInput("\r");
			await waitFor(() => context.notifications.some((item) => /disk full/i.test(item.message)));
			assert.ok(selector.render().some((line) => /Manual/.test(line)));
			selector.handleInput("\u001b");
			return selector.result;
		},
	});
	await runtime.start(context.ctx);
	await mock.commands.get("webui")?.handler("settings", context.ctx);
	await mock.commands.get("webui")?.handler("status", context.ctx);
	assert.match(context.notifications.at(-1)?.message ?? "", /Startup: Manual.*defaults/is);
});
