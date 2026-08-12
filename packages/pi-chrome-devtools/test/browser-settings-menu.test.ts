import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { showChromeDevtoolsBrowserSettings } from "../src/browser-settings-menu.js";
import chromeDevtools from "../src/chrome-devtools.js";
import { state } from "../src/runtime.js";
import { settingsFilePath } from "../src/settings.js";

class OwnedBrowserChild extends EventEmitter {
	killCalls = 0;

	kill() {
		this.killCalls += 1;
		queueMicrotask(() => this.emit("exit", 0, null));
		return true;
	}
}

const ENVIRONMENT_NAMES = [
	"PI_CHROME_DEVTOOLS_HOST",
	"PI_CHROME_DEVTOOLS_PORT",
	"PI_CHROME_DEVTOOLS_AUTO_LAUNCH",
	"PI_CHROME_DEVTOOLS_BROWSER",
] as const;

async function withBrowserSettingsMenu(
	run: (fixture: {
		directory: string;
		ctx: ReturnType<typeof createMockContext>["ctx"];
		notifications: ReturnType<typeof createMockContext>["notifications"];
		tui: ReturnType<typeof createTuiHarness>;
		generation: number;
	}) => Promise<void>,
) {
	const directory = mkdtempSync(path.join(os.tmpdir(), "pi-cdp-browser-menu-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const previousEnvironment = Object.fromEntries(
		ENVIRONMENT_NAMES.map((name) => [name, process.env[name]]),
	) as Record<(typeof ENVIRONMENT_NAMES)[number], string | undefined>;
	process.env.PI_CODING_AGENT_DIR = directory;
	for (const name of ENVIRONMENT_NAMES) delete process.env[name];
	state.sessionController.abort();
	state.sessionController = new AbortController();
	const generation = ++state.sessionGeneration;
	const tui = createTuiHarness({ width: 80, rows: 24 });
	const mock = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });
	try {
		await run({ directory, ctx: mock.ctx, notifications: mock.notifications, tui, generation });
	} finally {
		tui.dispose();
		state.sessionController.abort();
		state.sessionController = new AbortController();
		state.sessionGeneration += 1;
		state.managedBrowser = undefined;
		state.launchPromise = undefined;
		state.lastLaunchAttempt = undefined;
		state.settingsNotice = undefined;
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		for (const name of ENVIRONMENT_NAMES) {
			const previous = previousEnvironment[name];
			if (previous === undefined) delete process.env[name];
			else process.env[name] = previous;
		}
		rmSync(directory, { recursive: true, force: true });
	}
}

function readSettings() {
	return JSON.parse(readFileSync(settingsFilePath(), "utf8")) as Record<string, unknown>;
}

test("browser settings save endpoint and auto-launch immediately while preserving unknown fields", async () => {
	await withBrowserSettingsMenu(async ({ ctx, notifications, tui, generation }) => {
		writeFileSync(
			settingsFilePath(),
			'{"future":{"kept":true},"browser":{"futureBrowserField":"kept"}}\n',
		);
		const running = showChromeDevtoolsBrowserSettings(ctx, generation);
		await tui.waitForOpen();
		const initial = tui.render().join("\n");
		assert.match(initial, /Browser settings/);
		assert.match(initial, /DevTools endpoint\s+http:\/\/127\.0\.0\.1:9222/);
		assert.match(initial, /Auto-launch\s+On/);
		assert.match(initial, /Browser executable\s+Automatic/);
		assert.match(initial, /Unpacked extensions\s+0 configured/);
		assert.ok(tui.resize({ width: 28 }).every((line) => visibleWidth(line) <= 28));
		tui.resize({ width: 80 });

		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /DevTools endpoint/);
		tui.setFocused(true);
		tui.type("http://localhost:9333");
		tui.press("tui.input.submit");
		await tui.waitForPending();
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /DevTools endpoint\s+http:\/\/localhost:9333/);
		assert.equal(state.host, "localhost");
		assert.equal(state.port, 9333);
		assert.equal(state.endpointSource, "user");

		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await tui.waitForOpen();
		assert.equal(state.autoLaunchEnabled, false);
		assert.equal(state.autoLaunchSource, "user");
		assert.deepEqual(readSettings(), {
			future: { kept: true },
			browser: {
				futureBrowserField: "kept",
				endpoint: "http://localhost:9333",
				autoLaunch: false,
			},
		});
		assert.ok(notifications.some(({ message }) => /endpoint saved/i.test(message)));
		assert.ok(notifications.some(({ message }) => /auto-launch: Off/i.test(message)));
		tui.press("ctrl+c");
		assert.deepEqual(await running, { closeParent: true });
	});
});

test("a successful browser setting closes only the extension-owned managed browser", async () => {
	await withBrowserSettingsMenu(async ({ directory, ctx, tui, generation }) => {
		const child = new OwnedBrowserChild();
		const profile = path.join(directory, "managed-profile");
		mkdirSync(profile);
		state.managedBrowser = {
			process: child as unknown as ChildProcess,
			userDataDir: profile,
			exited: false,
			ready: true,
			ownerGeneration: generation,
		};
		const running = showChromeDevtoolsBrowserSettings(ctx, generation);
		await tui.waitForOpen();
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await tui.waitForOpen();

		assert.equal(child.killCalls, 1);
		assert.equal(state.managedBrowser, undefined);
		assert.equal(existsSync(profile), false);
		tui.press("ctrl+c");
		await running;
	});
});

test("browser settings edit and reset the executable through the same user JSON", async () => {
	await withBrowserSettingsMenu(async ({ directory, ctx, tui, generation }) => {
		const executable = path.join(directory, "chrome-for-testing");
		writeFileSync(executable, "browser");
		const running = showChromeDevtoolsBrowserSettings(ctx, generation);
		await tui.waitForOpen();
		tui.press("tui.select.down");
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await tui.waitForOpen();
		tui.setFocused(true);
		tui.type(executable);
		tui.press("tui.input.submit");
		await tui.waitForPending();
		await tui.waitForOpen();
		assert.equal((readSettings().browser as Record<string, unknown>).executablePath, executable);
		assert.equal(state.browserExecutable, executable);

		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await tui.waitForOpen();
		tui.setFocused(true);
		tui.type("automatic");
		tui.press("tui.input.submit");
		await tui.waitForPending();
		await tui.waitForOpen();
		assert.deepEqual(readSettings().browser, {});
		assert.equal(state.browserExecutable, undefined);
		tui.press("ctrl+c");
		await running;
	});
});

test("browser settings cancellation and invalid files remain read-only", async () => {
	await withBrowserSettingsMenu(async ({ ctx, tui, generation }) => {
		const cancelled = showChromeDevtoolsBrowserSettings(ctx, generation);
		await tui.waitForOpen();
		tui.press("tui.select.cancel");
		assert.deepEqual(await cancelled, { closeParent: false });
		assert.equal(existsSync(settingsFilePath()), false);

		writeFileSync(settingsFilePath(), "{ invalid\n");
		const invalid = showChromeDevtoolsBrowserSettings(ctx, generation);
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /Read only/);
		assert.match(tui.render().join("\n"), /invalid JSON/);
		tui.press("tui.select.cancel");
		await invalid;
		assert.equal(readFileSync(settingsFilePath(), "utf8"), "{ invalid\n");
	});
});

test("a failed browser settings save restores the accepted value and retains the input draft", async () => {
	await withBrowserSettingsMenu(async ({ ctx, notifications, tui, generation }) => {
		const running = showChromeDevtoolsBrowserSettings(ctx, generation);
		await tui.waitForOpen();
		tui.press("tui.select.confirm");
		await tui.waitForPending();
		await tui.waitForOpen();
		mkdirSync(settingsFilePath());
		tui.setFocused(true);
		tui.type("http://localhost:9333");
		tui.press("tui.input.submit");
		await tui.waitForPending();
		assert.match(tui.render().join("\n"), /http:\/\/localhost:9333/);
		assert.equal(state.host, "127.0.0.1");
		assert.match(
			notifications.at(-1)?.message ?? "",
			/save failed.*previous settings remain active/i,
		);
		tui.press("ctrl+c");
		await running;
	});
});

test("the direct settings command dispatches the same RPC workflow", async () => {
	await withBrowserSettingsMenu(async () => {
		const mockPi = createMockPi();
		chromeDevtools(mockPi.pi);
		let selectCalls = 0;
		const mock = createMockContext({
			mode: "rpc",
			hasUI: true,
			select: async () => {
				selectCalls += 1;
				return undefined;
			},
		});

		await mockPi.commands.get("chrome-devtools")?.handler("settings", mock.ctx);

		assert.equal(selectCalls, 1);
	});
});

test("RPC browser settings use standard selectors and input without custom TUI", async () => {
	await withBrowserSettingsMenu(async ({ generation }) => {
		let settingsDialogs = 0;
		let customCalls = 0;
		const mock = createMockContext({
			mode: "rpc",
			hasUI: true,
			select: async (_title: string, options: string[]) => {
				settingsDialogs += 1;
				if (settingsDialogs === 1) {
					return options.find((option) => option.includes("DevTools endpoint"));
				}
				return undefined;
			},
			input: async () => "http://localhost:9444",
			custom: async () => {
				customCalls += 1;
			},
		});

		await showChromeDevtoolsBrowserSettings(mock.ctx, generation);

		assert.equal(customCalls, 0);
		assert.equal(
			(readSettings().browser as Record<string, unknown>).endpoint,
			"http://localhost:9444",
		);
		assert.equal(state.port, 9444);
	});
});
