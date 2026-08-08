import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createTuiHarness } from "@narumitw/pi-tui-kit/testing";
import { test } from "vitest";
import { createMockContext } from "../../../test/support.js";
import {
	loadConfig,
	localConfigPath,
	syncConfigReviewIdentity,
	updateLocalConfig,
} from "../src/config.js";
import { showSyncManager } from "../src/manager-ui.js";
import type { SyncDecision } from "../src/sync-decision.js";
import { showSyncResolution } from "../src/sync-resolution-ui.js";
import { v3S3Settings, withTempHome } from "./helpers.js";

initTheme("dark", false);

test("resolution reviews exact differences and invokes local-wins push through the captured setup", async () => {
	await withConfiguredDecision(async (decision) => {
		const tui = createTuiHarness({ width: 60, rows: 18 });
		const { ctx } = createMockContext({ hasUI: true, mode: "tui", custom: tui.custom });
		const routes: Array<{ route: string; target?: string; signal?: AbortSignal }> = [];
		let releaseRoute: () => void = () => undefined;
		const routeGate = new Promise<void>((resolve) => {
			releaseRoute = resolve;
		});
		const running = showSyncResolution(ctx, decision, async (route, signal, _onCommit, target) => {
			routes.push({ route, target, signal });
			await routeGate;
			return { kind: "completed" };
		});

		await tui.waitForOpen();
		for (const width of [32, 60, 100]) {
			const frame = tui.render(width);
			assert.ok(frame.every((line) => visibleWidth(line) <= width));
			assert.match(frame.join("\n"), /Resolve sync conflict/u);
			assert.equal(frame.join("\n").includes("\u001b]8"), false);
		}
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		const reviewFrame = tui.render().join("\n");
		assert.match(reviewFrame, /Different: settings\.json/u);
		assert.equal(reviewFrame.includes("\u001b]8"), false);
		tui.press("tui.select.cancel");
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /Review differences \(recommended\)/u);
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await waitFor(() => routes.length === 1);
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /Preparing local-wins push preview/u);
		assert.deepEqual(
			routes.map(({ route, target }) => ({ route, target })),
			[{ route: "push --force", target: "home" }],
		);
		releaseRoute();
		const result = await running;
		assert.deepEqual(result, { kind: "resolved", direction: "push" });
	});
});

test("cancelling a remote-wins preparation drains work and returns to resolution", async () => {
	await withConfiguredDecision(async (decision) => {
		const tui = createTuiHarness({ width: 60, rows: 18 });
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: tui.custom,
		});
		let routeSignal: AbortSignal | undefined;
		let releaseRoute: () => void = () => undefined;
		const routeGate = new Promise<void>((resolve) => {
			releaseRoute = resolve;
		});
		const running = showSyncResolution(ctx, decision, async (_route, signal) => {
			routeSignal = signal;
			await routeGate;
			return { kind: "completed", outcome: "applied" };
		});

		await tui.waitForOpen();
		tui.press("tui.select.down");
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		tui.press("tui.select.cancel");
		await waitFor(() => routeSignal?.aborted === true);
		releaseRoute();
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /Resolve sync conflict/u);
		assert.match(notifications.at(-1)?.message ?? "", /cancelled/u);
		tui.press("ctrl+c");
		assert.deepEqual(await running, { kind: "closed" });
	});
});

test("RPC resolution supports review and remote-empty recovery without custom TUI", async () => {
	await withConfiguredDecision(async (baseDecision) => {
		const decision: SyncDecision = {
			...baseDecision,
			kind: "remote-empty",
			directions: ["push"],
			review: "Remote is empty.\nAdd: settings.json",
		};
		let resolutionVisits = 0;
		const routes: string[] = [];
		const { ctx } = createMockContext({
			hasUI: true,
			mode: "rpc",
			custom: async () => assert.fail("RPC must not open custom TUI"),
			select: async (title: string, options: string[]) => {
				if (title.startsWith("Remote is empty")) {
					resolutionVisits += 1;
					return resolutionVisits === 1
						? "Review differences (recommended)"
						: "Push local content…";
				}
				assert.match(title, /Add: settings\.json/u);
				assert.deepEqual(options, ["Back"]);
				return "Back";
			},
		});
		const result = await showSyncResolution(ctx, decision, async (route, signal) => {
			assert.equal(signal?.aborted, false);
			routes.push(route);
			return { kind: "completed" };
		});
		assert.deepEqual(routes, ["push --force"]);
		assert.deepEqual(result, { kind: "resolved", direction: "push" });
	});
});

test("cancelling the exact push confirmation returns to conflict resolution", async () => {
	await withConfiguredDecision(async (decision) => {
		const tui = createTuiHarness({ width: 60, rows: 18 });
		const { ctx } = createMockContext({ hasUI: true, mode: "tui", custom: tui.custom });
		let releaseRoute: () => void = () => undefined;
		const routeGate = new Promise<void>((resolve) => {
			releaseRoute = resolve;
		});
		const running = showSyncResolution(ctx, decision, async () => {
			await routeGate;
			return { kind: "completed", outcome: "cancelled" };
		});

		await tui.waitForOpen();
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		const loaderOpenCount = tui.openCount;
		releaseRoute();
		await waitFor(() => tui.isOpen && tui.openCount > loaderOpenCount);
		assert.match(tui.render().join("\n"), /Resolve sync conflict/u);
		tui.press("ctrl+c");
		assert.deepEqual(await running, { kind: "closed" });
	});
});

test("a repeated conflict refreshes resolution labels instead of closing", async () => {
	await withConfiguredDecision(async (decision) => {
		const tui = createTuiHarness({ width: 60, rows: 18 });
		const { ctx } = createMockContext({ hasUI: true, mode: "tui", custom: tui.custom });
		const refreshed: SyncDecision = {
			...decision,
			kind: "first-sync-settings-diverged",
			directMessage: "Choose an initial source.",
		};
		let releaseRoute: () => void = () => undefined;
		const routeGate = new Promise<void>((resolve) => {
			releaseRoute = resolve;
		});
		const running = showSyncResolution(ctx, decision, async () => {
			await routeGate;
			return { kind: "decision-required", decision: refreshed };
		});

		await tui.waitForOpen();
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		const loaderOpenCount = tui.openCount;
		releaseRoute();
		await waitFor(() => tui.isOpen && tui.openCount > loaderOpenCount);
		assert.match(tui.render().join("\n"), /Use local as initial source/u);
		tui.press("ctrl+c");
		assert.deepEqual(await running, { kind: "closed" });
	});
});

test("resolution rejects a sync setup changed after review", async () => {
	await withConfiguredDecision(async (decision) => {
		const tui = createTuiHarness({ width: 60, rows: 18 });
		const { ctx, notifications } = createMockContext({
			hasUI: true,
			mode: "tui",
			custom: tui.custom,
		});
		let routeCalls = 0;
		const running = showSyncResolution(ctx, decision, async () => {
			routeCalls += 1;
			return { kind: "completed" };
		});

		await tui.waitForOpen();
		await updateLocalConfig((current) => ({
			...current,
			syncSetups: {
				...current.syncSetups,
				home: {
					...current.syncSetups.home,
					sync: { ...current.syncSetups.home.sync, include: [] },
				},
			},
		}));
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		assert.equal(routeCalls, 0);
		assert.match(
			notifications.at(-1)?.message ?? "",
			/changed while conflict resolution was open/u,
		);
		assert.match(tui.render().join("\n"), /Resolve sync conflict/u);
		tui.press("ctrl+c");
		assert.deepEqual(await running, { kind: "closed" });
	});
});

test("session replacement aborts and drains a resolution operation", async () => {
	await withConfiguredDecision(async (decision) => {
		const owner = new AbortController();
		const tui = createTuiHarness({ width: 60, rows: 18 });
		const { ctx } = createMockContext({ hasUI: true, mode: "tui", custom: tui.custom });
		let routeSignal: AbortSignal | undefined;
		let releaseRoute: () => void = () => undefined;
		const routeGate = new Promise<void>((resolve) => {
			releaseRoute = resolve;
		});
		const running = showSyncResolution(
			ctx,
			decision,
			async (_route, signal) => {
				routeSignal = signal;
				await routeGate;
				return { kind: "completed" };
			},
			owner.signal,
		);

		await tui.waitForOpen();
		tui.press("tui.select.down");
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		owner.abort(new DOMException("Session replaced", "AbortError"));
		await waitFor(() => routeSignal?.aborted === true);
		releaseRoute();
		assert.deepEqual(await running, { kind: "stale" });
	});
});

test("the main manager opens conflict recovery instead of ending at an error", async () => {
	await withConfiguredDecision(async (decision) => {
		const tui = createTuiHarness({ width: 60, rows: 18 });
		const { ctx } = createMockContext({ hasUI: true, mode: "tui", custom: tui.custom });
		let releaseRoute: () => void = () => undefined;
		const routeGate = new Promise<void>((resolve) => {
			releaseRoute = resolve;
		});
		const running = showSyncManager(ctx, async (route) => {
			assert.equal(route, "sync");
			await routeGate;
			return { kind: "decision-required", decision };
		});

		await tui.waitForOpen();
		tui.press("tui.select.confirm");
		await tui.waitForOpen();
		const loaderOpenCount = tui.openCount;
		releaseRoute();
		await waitFor(() => tui.isOpen && tui.openCount > loaderOpenCount);
		assert.match(tui.render().join("\n"), /Resolve sync conflict/u);
		tui.press("tui.select.cancel");
		await tui.waitForOpen();
		assert.match(tui.render().join("\n"), /Manage sync/u);
		tui.press("ctrl+c");
		await running;
	});
});

async function withConfiguredDecision(run: (decision: SyncDecision) => Promise<void>) {
	await withTempHome(async (agentDir) => {
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(localConfigPath(), JSON.stringify(v3S3Settings()), { mode: 0o600 });
		const config = await loadConfig();
		await run({
			kind: "both-changed",
			setupName: "home",
			configIdentity: syncConfigReviewIdentity(config),
			causes: { localChanged: true, remoteChanged: true, policyChanged: false },
			currentInclude: ["settings.json"],
			review: "Sync setup: home\n\nObserved differences:\nDifferent: settings.json\u001b]8;;bad",
			directions: ["push", "pull"],
			directMessage: "Both local and remote changed.",
		});
	});
}

async function waitFor(condition: () => boolean) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (condition()) return;
		await new Promise<void>((resolve) => setTimeout(resolve, 1));
	}
	assert.fail("Timed out waiting for condition");
}
