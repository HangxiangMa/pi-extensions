import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { registerStarshipCommand } from "../src/commands.js";
import { BUILT_IN_EXAMPLE, loadStarshipConfig } from "../src/config.js";

test("/starship distinguishes built-in defaults, saved built-in, custom, and fallback states", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-command-state-"));
	try {
		const cases = [
			{
				name: "missing",
				path: join(root, "missing.toml"),
				expected: /Built-in defaults · Healthy/u,
			},
			{
				name: "saved built-in",
				path: join(root, "built-in.toml"),
				raw: BUILT_IN_EXAMPLE,
				expected: /Saved built-in configuration · Healthy/u,
			},
			{
				name: "custom",
				path: join(root, "custom.toml"),
				raw: "format = 'custom'\n",
				expected: /Custom configuration · Healthy/u,
			},
			{
				name: "invalid",
				path: join(root, "invalid.toml"),
				raw: "format = [\n",
				expected: /Built-in fallback · 1 error/u,
			},
		] as const;

		for (const item of cases) {
			if ("raw" in item) writeFileSync(item.path, item.raw);
			const mock = createMockPi();
			registerStarshipCommand(mock.pi, {
				getLoaded: () => loadStarshipConfig(item.path),
				apply() {},
				settingsPath: item.path,
			});
			const tui = createTuiHarness({ width: 40, rows: 24 });
			const context = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });
			const running = mock.commands.get("starship")?.handler("", context.ctx);
			await tui.waitForOpen();
			const frame = tui.render().join("\n");
			assert.match(frame, item.expected, item.name);
			assert.match(frame, /Configuration/u, item.name);
			assert.match(frame, /Restore built-in…/u, item.name);
			assert.doesNotMatch(frame, /Advanced/u, item.name);
			tui.press("ctrl+c");
			await running;
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Configuration combines state, source, path, health, and diagnostics", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-command-configuration-"));
	const path = join(root, "pi-starship.toml");
	writeFileSync(path, "future = true\n");
	try {
		const mock = createMockPi();
		registerStarshipCommand(mock.pi, {
			getLoaded: () => loadStarshipConfig(path),
			apply() {},
			settingsPath: path,
		});
		const tui = createTuiHarness({ width: 80, rows: 24 });
		const context = createMockContext({ mode: "tui", hasUI: true, custom: tui.custom });
		const running = mock.commands.get("starship")?.handler("", context.ctx);
		await tui.waitForOpen();
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		const frame = tui.render().join("\n");
		assert.match(frame, /Configuration/u);
		assert.match(frame, /State: Custom configuration/u);
		assert.match(frame, /Source: User file/u);
		assert.match(frame, /Path:[\s\S]*pi-starship\.toml/u);
		assert.match(frame, /Health: 1 warning/u);
		assert.match(frame, /future/u);
		tui.press("ctrl+c");
		await running;
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("healthy missing settings disable restore without creating a document", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-command-missing-restore-"));
	const path = join(root, "pi-starship.toml");
	try {
		const mock = createMockPi();
		let confirmations = 0;
		registerStarshipCommand(mock.pi, {
			getLoaded: () => loadStarshipConfig(path),
			apply() {},
			settingsPath: path,
		});
		const tui = createTuiHarness({ width: 80, rows: 24 });
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: tui.custom,
			confirm: async () => {
				confirmations += 1;
				return true;
			},
		});
		const running = mock.commands.get("starship")?.handler("", context.ctx);
		await tui.waitForOpen();
		for (let index = 0; index < 3; index += 1) tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /Already using defaults · no file to replace/u);
		assert.equal(confirmations, 0);
		assert.equal(existsSync(path), false);
		tui.press("ctrl+c");
		await running;
		assert.equal(existsSync(path), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("preview remains operable across terminal sizes and dynamic resize", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-command-preview-size-"));
	const path = join(root, "pi-starship.toml");
	try {
		const mock = createMockPi();
		const loaded = loadStarshipConfig(path);
		registerStarshipCommand(mock.pi, {
			getLoaded: () => loaded,
			apply() {},
			settingsPath: path,
			renderPreview: () =>
				Array.from({ length: 40 }, (_, index) => `Preview line ${index + 1}: long content`),
		});
		const tui = createTuiHarness({ width: 80, rows: 24 });
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: tui.custom,
			editor: async () => "format = 'draft'\n",
		});
		const running = mock.commands.get("starship")?.handler("settings", context.ctx);
		await tui.waitForOpen();

		for (const dimensions of [
			{ width: 80, rows: 24 },
			{ width: 20, rows: 8 },
			{ width: 28, rows: 12 },
		]) {
			const frame = tui.resize(dimensions);
			assert.ok(frame.length <= Math.max(1, dimensions.rows - 3));
			assert.ok(frame.every((line) => visibleWidth(line) <= dimensions.width));
			assert.match(frame.join("\n"), /Apply changes…/u);
		}

		tui.press("tui.select.down");
		assert.match(tui.render().join("\n"), /Continue editing/u);
		tui.press("tui.select.down");
		assert.match(tui.render().join("\n"), /Discard draft/u);
		tui.press("ctrl+c");
		await running;
		assert.equal(existsSync(path), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("preview uses injected keybindings and exposes their hints", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-command-preview-keys-"));
	const path = join(root, "pi-starship.toml");
	try {
		const mapping: Record<string, string> = {
			"tui.select.up": "k",
			"tui.select.down": "j",
			"tui.select.pageUp": "u",
			"tui.select.pageDown": "d",
			"tui.select.confirm": "y",
			"tui.select.cancel": "q",
		};
		const keybindings: Pick<KeybindingsManager, "matches" | "getKeys"> = {
			matches: (data, binding) => data === mapping[binding],
			getKeys: (binding) => (mapping[binding] ? [mapping[binding] as never] : []),
		};
		const mock = createMockPi();
		const loaded = loadStarshipConfig(path);
		registerStarshipCommand(mock.pi, {
			getLoaded: () => loaded,
			apply() {},
			settingsPath: path,
			renderPreview: () => ["Preview"],
		});
		const tui = createTuiHarness({ width: 40, rows: 12, keybindings });
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: tui.custom,
			editor: async () => "format = 'draft'\n",
		});
		let settled = false;
		const running = Promise.resolve(
			mock.commands.get("starship")?.handler("settings", context.ctx),
		);
		void running.then(() => {
			settled = true;
		});
		await tui.waitForOpen();
		const frame = tui.render().join("\n");
		assert.match(frame, /k\/j navigate/u);
		assert.match(frame, /y select/u);
		assert.match(frame, /q discard/u);
		tui.send("j");
		assert.match(tui.render().join("\n"), /Continue editing/u);
		tui.send("q");
		await flushAsyncWork();
		try {
			assert.equal(settled, true);
		} finally {
			if (!settled) tui.dispose();
			await running;
		}
		assert.equal(existsSync(path), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Escape returns a preview draft to editing and restores the main selection", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-command-preview-edit-"));
	const path = join(root, "pi-starship.toml");
	try {
		const mock = createMockPi();
		const loaded = loadStarshipConfig(path);
		let editorCalls = 0;
		const drafts: string[] = [];
		registerStarshipCommand(mock.pi, {
			getLoaded: () => loaded,
			apply() {},
			settingsPath: path,
			renderPreview: () => ["Preview"],
		});
		const tui = createTuiHarness({ width: 40, rows: 12 });
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: tui.custom,
			editor: async (_title: string, draft: string) => {
				drafts.push(draft);
				editorCalls += 1;
				return editorCalls === 1 ? "format = 'draft'\n" : undefined;
			},
		});
		const running = mock.commands.get("starship")?.handler("", context.ctx);
		await tui.waitForOpen();
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		assert.equal(editorCalls, 2);
		assert.equal(drafts[1], "format = 'draft'\n");
		assert.match(tui.render().join("\n"), /→ Customize footer/u);
		tui.press("ctrl+c");
		await running;
		assert.equal(existsSync(path), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Ctrl+C in preview closes the whole /starship workflow", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-command-preview-close-"));
	const path = join(root, "pi-starship.toml");
	try {
		const mock = createMockPi();
		const loaded = loadStarshipConfig(path);
		registerStarshipCommand(mock.pi, {
			getLoaded: () => loaded,
			apply() {},
			settingsPath: path,
			renderPreview: () => ["Preview"],
		});
		const tui = createTuiHarness({ width: 40, rows: 12 });
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: tui.custom,
			editor: async () => "format = 'draft'\n",
		});
		let settled = false;
		const running = Promise.resolve(mock.commands.get("starship")?.handler("", context.ctx));
		void running.then(() => {
			settled = true;
		});
		await tui.waitForOpen();
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		tui.press("ctrl+c");
		await flushAsyncWork();
		try {
			assert.equal(settled, true);
			assert.equal(tui.isOpen, false);
		} finally {
			if (!settled) tui.dispose();
			await running;
		}
		assert.equal(existsSync(path), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("external preview disposal cancels without saving", async () => {
	const root = mkdtempSync(join(tmpdir(), "pi-starship-command-preview-dispose-"));
	const path = join(root, "pi-starship.toml");
	try {
		const mock = createMockPi();
		const loaded = loadStarshipConfig(path);
		registerStarshipCommand(mock.pi, {
			getLoaded: () => loaded,
			apply() {},
			settingsPath: path,
			renderPreview: () => ["Preview"],
		});
		const tui = createTuiHarness({ width: 40, rows: 12 });
		const context = createMockContext({
			mode: "tui",
			hasUI: true,
			custom: tui.custom,
			editor: async () => "format = 'draft'\n",
		});
		const running = mock.commands.get("starship")?.handler("settings", context.ctx);
		await tui.waitForOpen();
		tui.dispose();
		await running;
		assert.equal(existsSync(path), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

async function flushAsyncWork() {
	await new Promise<void>((resolve) => setImmediate(resolve));
}
