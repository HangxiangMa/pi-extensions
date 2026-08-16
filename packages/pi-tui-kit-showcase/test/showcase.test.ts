import { resolveMenuScreen } from "@narumitw/pi-tui-kit";
import { describe, expect, test } from "vitest";
import extension from "../src/index.js";
import { createInitialShowcaseState, createShowcaseMenu } from "../src/menu.js";
import { createPiTuiKitShowcaseExtension } from "../src/showcase.js";

describe("Pi TUI Kit showcase", () => {
	test("exposes every standard Kit screen from the main menu", () => {
		const state = createInitialShowcaseState();
		const menu = createShowcaseMenu({ requestStandalone: () => {} });

		const screenKinds = [
			"main",
			"actions",
			"detail",
			"browse",
			"choice",
			"settings",
			"input",
			"review",
			"multiSelect",
		].map((screen) => resolveMenuScreen(menu, screen, state).kind);

		expect(screenKinds).toEqual([
			"actions",
			"actions",
			"detail",
			"browse",
			"choice",
			"settings",
			"input",
			"review",
			"multiSelect",
		]);

		const main = resolveMenuScreen(menu, "main", state);
		expect(main.kind).toBe("actions");
		if (main.kind !== "actions") return;
		expect(main.items.map((item) => item.label)).toEqual(
			expect.arrayContaining(["Task loader", "Confirmation", "Live choice"]),
		);
	});

	test("registers one TUI-only showcase command and rejects arguments", async () => {
		const commands = new Map<string, ShowcaseCommand>();
		extension({
			registerCommand(name: string, command: ShowcaseCommand) {
				commands.set(name, command);
			},
			on() {},
		} as never);

		expect([...commands.keys()]).toEqual(["tui-kit-showcase"]);
		await expect(commands.get("tui-kit-showcase")?.handler("extra", {})).rejects.toThrow(
			"Usage: /tui-kit-showcase",
		);
	});

	test("reports RPC unsupported mode without loading the TUI runtime", async () => {
		const notifications: string[] = [];
		const commands = new Map<string, ShowcaseCommand>();
		createPiTuiKitShowcaseExtension({
			loadRuntime: async () => {
				throw new Error("runtime should not load");
			},
		})({
			registerCommand(name: string, command: ShowcaseCommand) {
				commands.set(name, command);
			},
			on() {},
		} as never);

		await commands.get("tui-kit-showcase")?.handler("", {
			mode: "rpc",
			hasUI: true,
			ui: { notify: (message: string) => notifications.push(message) },
		});

		expect(notifications).toEqual([
			"Pi TUI Kit Showcase is an interactive visual demo. Run /tui-kit-showcase in TUI mode.",
		]);
	});

	test("aborts command-owned showcase work on session shutdown", async () => {
		let captured:
			| {
					signal: AbortSignal;
					isCurrent(): boolean;
			  }
			| undefined;
		const commands = new Map<string, ShowcaseCommand>();
		const events = new Map<string, () => void>();
		createPiTuiKitShowcaseExtension({
			loadRuntime: async () => ({
				showTuiKitShowcase: async (_ctx, options) => {
					captured = options;
				},
			}),
		})({
			registerCommand(name: string, command: ShowcaseCommand) {
				commands.set(name, command);
			},
			on(name: string, handler: () => void) {
				events.set(name, handler);
			},
		} as never);

		await commands.get("tui-kit-showcase")?.handler("", { mode: "tui", hasUI: true, ui: {} });

		expect(captured?.signal.aborted).toBe(false);
		expect(captured?.isCurrent()).toBe(true);
		events.get("session_shutdown")?.();
		expect(captured?.signal.aborted).toBe(true);
		expect(captured?.isCurrent()).toBe(false);
	});
});

interface ShowcaseCommand {
	handler(args: string, ctx: unknown): Promise<void>;
}
