import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import {
	createCustomSelectorHarness,
	createMockContext,
	createMockPi,
} from "../../../test/support.js";
import planMode, { completePlanArguments } from "../src/plan-mode.js";

const PLAN = "# Exported plan\n\n1. Keep the exact plan.\n2. Make it readable to the agent.";
const STATE_ENTRY_TYPE = "plan-mode-state";

function stateEntry(data: Record<string, unknown>) {
	return { type: "custom", customType: STATE_ENTRY_TYPE, data };
}

async function completePlan(
	mock: ReturnType<typeof createMockPi>,
	ctx: ReturnType<typeof createMockContext>["ctx"],
) {
	const complete = mock.tools.find((candidate) => candidate.name === "plan_mode_complete")
		?.execute as ((...args: unknown[]) => Promise<unknown>) | undefined;
	assert.ok(complete);
	await complete("complete", { plan: PLAN }, undefined, undefined, ctx);
}

async function withTempDirectory(run: (directory: string) => Promise<void>) {
	const directory = await mkdtemp(join(tmpdir(), "pi-plan-export-"));
	try {
		await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test("plan export autocomplete exposes a path-taking public route", () => {
	assert.deepEqual(
		completePlanArguments("")?.map((item) => item.value),
		["show", "finalize", "implement", "save", "export", "exit", "off", "tools"],
	);
	assert.deepEqual(
		completePlanArguments("ex")?.map((item) => item.value),
		["export", "exit"],
	);
	assert.equal(completePlanArguments("export "), null);
});

test("ready plan export ends Plan mode without triggering a model turn", async () => {
	await withTempDirectory(async (directory) => {
		const mock = createMockPi({
			activeTools: ["read", "edit"],
			thinkingLevel: "low",
		});
		planMode(mock.pi, {
			readSettings: async () => ({
				kind: "loaded" as const,
				settings: { thinkingLevel: "medium" as const },
			}),
		});
		const context = createMockContext({ cwd: directory, hasUI: true });
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await mock.commands.get("plan")?.handler("", context.ctx);
		assert.equal(mock.thinkingLevel, "medium");
		await completePlan(mock, context.ctx);
		const entriesBeforeExport = mock.entries.length;

		await mock.commands.get("plan")?.handler("export", context.ctx);

		assert.equal(await readFile(join(directory, "PLAN.md"), "utf8"), `${PLAN}\n`);
		assert.equal(context.statuses.get("plan-mode"), undefined);
		assert.equal(mock.entries.length, entriesBeforeExport + 1);
		const persistedState = mock.entries.at(-1)?.data as Record<string, unknown>;
		assert.equal(persistedState.enabled, false);
		assert.equal(persistedState.latestPlan, undefined);
		assert.equal(persistedState.awaitingAction, false);
		assert.deepEqual(mock.rawPi.getActiveTools(), ["read", "edit"]);
		assert.equal(mock.thinkingLevel, "low");
		assert.equal(mock.sentUserMessages.length, 0);
		assert.equal(mock.sentMessages.length, 0);
		assert.match(
			context.notifications.at(-1)?.message ?? "",
			/exported.*PLAN\.md.*Plan mode disabled/i,
		);
	});
});

test("ready plan export supports custom relative and absolute paths", async () => {
	await withTempDirectory(async (directory) => {
		for (const { requestedPath, expectedPath } of [
			{
				requestedPath: "docs/custom plan.md",
				expectedPath: join(directory, "docs", "custom plan.md"),
			},
			{
				requestedPath: join(directory, "absolute-plan.md"),
				expectedPath: join(directory, "absolute-plan.md"),
			},
		]) {
			const mock = createMockPi({ activeTools: ["read"] });
			planMode(mock.pi);
			const context = createMockContext({ cwd: directory, hasUI: true });
			await mock.commands.get("plan")?.handler("", context.ctx);
			await completePlan(mock, context.ctx);

			await mock.commands.get("plan")?.handler(`export ${requestedPath}`, context.ctx);

			assert.equal(await readFile(expectedPath, "utf8"), `${PLAN}\n`);
			assert.equal(context.statuses.get("plan-mode"), undefined);
			assert.equal(containsTerminalControl(context.notifications.at(-1)?.message ?? ""), false);
		}
	});
});

test("plan export refuses existing files and leaves their content and plan state unchanged", async () => {
	await withTempDirectory(async (directory) => {
		const existingPath = join(directory, "PLAN.md");
		await writeFile(existingPath, "user-owned content\n", "utf8");
		const mock = createMockPi({ activeTools: ["read"] });
		planMode(mock.pi);
		const context = createMockContext({ cwd: directory, hasUI: true });
		await mock.commands.get("plan")?.handler("", context.ctx);
		await completePlan(mock, context.ctx);
		const entriesBeforeExport = mock.entries.length;

		await mock.commands.get("plan")?.handler("export", context.ctx);

		assert.equal(await readFile(existingPath, "utf8"), "user-owned content\n");
		assert.equal(context.statuses.get("plan-mode"), "plan ready");
		assert.equal(mock.entries.length, entriesBeforeExport);
		assert.match(context.notifications.at(-1)?.message ?? "", /already exists/i);
	});
});

test("concurrent exports serialize and create the target only once", async () => {
	await withTempDirectory(async (directory) => {
		const mock = createMockPi({ activeTools: ["read"] });
		planMode(mock.pi);
		const context = createMockContext({ cwd: directory, hasUI: true });
		await mock.commands.get("plan")?.handler("", context.ctx);
		await completePlan(mock, context.ctx);

		await Promise.all([
			mock.commands.get("plan")?.handler("export shared.md", context.ctx),
			mock.commands.get("plan")?.handler("export shared.md", context.ctx),
		]);

		assert.equal(await readFile(join(directory, "shared.md"), "utf8"), `${PLAN}\n`);
		assert.equal(
			context.notifications.filter((notification) => /Plan exported to/u.test(notification.message))
				.length,
			1,
		);
		assert.equal(
			context.notifications.filter((notification) => /already exists/u.test(notification.message))
				.length,
			0,
		);
		assert.equal(context.statuses.get("plan-mode"), undefined);
	});
});

test("queued export stops when the ready plan is superseded", async () => {
	await withTempDirectory(async (directory) => {
		const exportPath = join(directory, "PLAN.md");
		let releaseMutation!: () => void;
		let markMutationHeld!: () => void;
		const mutationHeld = new Promise<void>((resolve) => {
			markMutationHeld = resolve;
		});
		const mutationRelease = new Promise<void>((resolve) => {
			releaseMutation = resolve;
		});
		const blocker = withFileMutationQueue(exportPath, async () => {
			markMutationHeld();
			await mutationRelease;
		});
		await mutationHeld;

		const mock = createMockPi({ activeTools: ["read"] });
		planMode(mock.pi);
		const context = createMockContext({ cwd: directory, hasUI: true });
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await mock.commands.get("plan")?.handler("", context.ctx);
		await completePlan(mock, context.ctx);
		const pendingExport = mock.commands.get("plan")?.handler("export", context.ctx);
		await Promise.resolve();
		await mock.events.get("before_agent_start")?.[0]?.({ systemPrompt: "base" }, context.ctx);
		releaseMutation();
		await blocker;
		await pendingExport;

		await assert.rejects(readFile(exportPath, "utf8"), /ENOENT/u);
		assert.equal(context.statuses.get("plan-mode"), "plan active");
		assert.equal(
			context.notifications.some((notification) => /Plan exported to/u.test(notification.message)),
			false,
		);
	});
});

test("plan export refuses an existing symbolic link", {
	skip: process.platform === "win32" ? "Windows symlink creation requires privileges" : false,
}, async () => {
	await withTempDirectory(async (directory) => {
		const targetPath = join(directory, "owned.md");
		const exportPath = join(directory, "PLAN.md");
		await writeFile(targetPath, "user-owned content\n", "utf8");
		await symlink(targetPath, exportPath);
		const mock = createMockPi({ activeTools: ["read"] });
		planMode(mock.pi);
		const context = createMockContext({ cwd: directory, hasUI: true });
		await mock.commands.get("plan")?.handler("", context.ctx);
		await completePlan(mock, context.ctx);

		await mock.commands.get("plan")?.handler("export", context.ctx);

		assert.equal(await readFile(targetPath, "utf8"), "user-owned content\n");
		assert.equal((await lstat(exportPath)).isSymbolicLink(), true);
		assert.match(context.notifications.at(-1)?.message ?? "", /already exists/i);
	});
});

test("plan export supports saved and active plans in print and JSON modes", async () => {
	for (const scenario of [
		{
			mode: "print",
			status: "plan saved",
			data: {
				enabled: false,
				awaitingAction: false,
				savedPlan: { plan: PLAN, source: "plan_mode_complete" },
			},
		},
		{
			mode: "json",
			status: "plan implementing",
			data: {
				enabled: false,
				awaitingAction: false,
				activeImplementation: {
					id: "implementation-1",
					plan: PLAN,
					source: "plan_mode_complete",
					startedAt: 42,
				},
			},
		},
	] as const) {
		await withTempDirectory(async (directory) => {
			const entry = stateEntry(scenario.data);
			const mock = createMockPi({ activeTools: ["read", "edit"] });
			planMode(mock.pi);
			const context = createMockContext({
				cwd: directory,
				mode: scenario.mode,
				hasUI: false,
				sessionManager: {
					getBranch: () => [entry],
					getEntries: () => [entry],
				},
			});
			await mock.events.get("session_start")?.[0]?.({}, context.ctx);

			await mock.commands.get("plan")?.handler("export exported.md", context.ctx);

			assert.equal(await readFile(join(directory, "exported.md"), "utf8"), `${PLAN}\n`);
			assert.equal(context.statuses.get("plan-mode"), scenario.status);
			assert.equal(mock.entries.length, 0);
			assert.equal(mock.sentUserMessages.length, 0);
		});
	}
});

test("plan export fails observably without a plan or on an existing path in no-UI modes", async () => {
	await withTempDirectory(async (directory) => {
		const missing = createMockPi({ activeTools: ["read"] });
		planMode(missing.pi);
		const printContext = createMockContext({ cwd: directory, mode: "print", hasUI: false });
		await assert.rejects(
			missing.commands.get("plan")?.handler("export", printContext.ctx) as Promise<unknown>,
			/no completed plan/i,
		);

		const savedEntry = stateEntry({
			enabled: false,
			awaitingAction: false,
			savedPlan: { plan: PLAN, source: "plan_mode_complete" },
		});
		await writeFile(join(directory, "PLAN.md"), "keep\n", "utf8");
		const existing = createMockPi({ activeTools: ["read"] });
		planMode(existing.pi);
		const jsonContext = createMockContext({
			cwd: directory,
			mode: "json",
			hasUI: false,
			sessionManager: {
				getBranch: () => [savedEntry],
				getEntries: () => [savedEntry],
			},
		});
		await existing.events.get("session_start")?.[0]?.({}, jsonContext.ctx);
		await assert.rejects(
			existing.commands.get("plan")?.handler("export", jsonContext.ctx) as Promise<unknown>,
			/already exists/i,
		);
		assert.equal(await readFile(join(directory, "PLAN.md"), "utf8"), "keep\n");
		assert.equal(jsonContext.statuses.get("plan-mode"), "plan saved");
	});
});

test("completion and management TUI menus accept an export path", async () => {
	for (const scenario of ["automatic-ready", "manual-ready", "saved", "active"] as const) {
		await withTempDirectory(async (directory) => {
			const expectedPath = scenario === "automatic-ready" ? "PLAN.md" : `${scenario}-export.md`;
			const mock = createMockPi({ activeTools: ["read", "edit"] });
			planMode(mock.pi);
			const custom = async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory);
				if (!harness.isFocusable) {
					chooseExportMenu(harness);
					return harness.resultPromise;
				}
				assert.match(harness.render().join("\n"), /Export plan.*PLAN\.md/is);
				harness.setFocused(true);
				if (scenario !== "automatic-ready") harness.handleInput(expectedPath);
				harness.handleInput("tui.input.submit");
				await harness.waitForPending();
				return harness.resultPromise;
			};
			const baseContext = {
				cwd: directory,
				mode: "tui",
				hasUI: true,
				custom,
			};
			const context = createMockContext(
				scenario === "saved"
					? {
							...baseContext,
							sessionManager: {
								getBranch: () => [
									stateEntry({
										enabled: false,
										awaitingAction: false,
										savedPlan: { plan: PLAN, source: "plan_mode_complete" },
									}),
								],
								getEntries: () => [],
							},
						}
					: baseContext,
			);

			await mock.events.get("session_start")?.[0]?.({}, context.ctx);
			if (scenario === "saved") {
				await mock.commands.get("plan")?.handler("", context.ctx);
				assert.equal(context.statuses.get("plan-mode"), "plan saved");
			} else {
				await mock.commands.get("plan")?.handler("", context.ctx);
				await completePlan(mock, context.ctx);
				if (scenario === "automatic-ready") {
					await mock.events.get("agent_settled")?.[0]?.({}, context.ctx);
				} else if (scenario === "manual-ready") {
					await mock.commands.get("plan")?.handler("", context.ctx);
				} else {
					await mock.commands.get("plan")?.handler("implement", context.ctx);
					await mock.commands.get("plan")?.handler("", context.ctx);
					assert.equal(context.statuses.get("plan-mode"), "plan implementing");
				}
			}

			assert.equal(await readFile(join(directory, expectedPath), "utf8"), `${PLAN}\n`);
			assert.equal(
				context.statuses.get("plan-mode"),
				scenario === "active"
					? "plan implementing"
					: scenario === "saved"
						? "plan saved"
						: undefined,
			);
			assert.equal(mock.sentUserMessages.length, scenario === "active" ? 1 : 0);
		});
	}
});

function containsTerminalControl(value: string) {
	return Array.from(value).some((character) => {
		const codePoint = character.codePointAt(0);
		return (
			codePoint !== undefined && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
		);
	});
}

function chooseExportMenu(harness: ReturnType<typeof createCustomSelectorHarness>) {
	for (let index = 0; index < 10; index += 1) {
		if (selectedMenuLabel(harness.render()).startsWith("Export plan")) break;
		harness.handleInput("tui.select.down");
	}
	assert.match(selectedMenuLabel(harness.render()), /^Export plan/u);
	harness.handleInput("tui.select.confirm");
}

function selectedMenuLabel(lines: readonly string[]) {
	const line = lines.find((candidate) => candidate.startsWith("→ ") || candidate.startsWith("› "));
	return line
		? (line
				.slice(2)
				.split(/\s{2,}/u)[0]
				?.trim() ?? "")
		: "";
}

test("RPC export menu accepts a custom path", async () => {
	await withTempDirectory(async (directory) => {
		const mock = createMockPi({ activeTools: ["read"] });
		planMode(mock.pi);
		let inputCalls = 0;
		const context = createMockContext({
			cwd: directory,
			mode: "rpc",
			hasUI: true,
			select: async (_title: string, options: string[]) => {
				assert.ok(options.includes("Export plan…"));
				return "Export plan…";
			},
			input: async (title: string, placeholder?: string) => {
				inputCalls += 1;
				assert.match(title, /Export plan/i);
				assert.equal(placeholder, "PLAN.md");
				return "rpc-export.md";
			},
		});
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await mock.commands.get("plan")?.handler("", context.ctx);
		await completePlan(mock, context.ctx);

		await mock.commands.get("plan")?.handler("", context.ctx);

		assert.equal(inputCalls, 1);
		assert.equal(await readFile(join(directory, "rpc-export.md"), "utf8"), `${PLAN}\n`);
		assert.equal(context.statuses.get("plan-mode"), undefined);
	});
});

test("rejected TUI export retains the path draft for correction", async () => {
	await withTempDirectory(async (directory) => {
		await writeFile(join(directory, "PLAN.md"), "keep\n", "utf8");
		const mock = createMockPi({ activeTools: ["read"] });
		planMode(mock.pi);
		const context = createMockContext({
			cwd: directory,
			mode: "tui",
			hasUI: true,
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory);
				if (!harness.isFocusable) {
					chooseExportMenu(harness);
					return harness.resultPromise;
				}
				harness.setFocused(true);
				harness.handleInput("PLAN.md");
				harness.handleInput("tui.input.submit");
				await harness.waitForPending();

				assert.equal(harness.result, undefined);
				assert.equal(harness.isFocusable, true);
				assert.match(harness.render().join("\n"), /PLAN\.md/u);
				assert.match(context.notifications.at(-1)?.message ?? "", /already exists/i);

				harness.handleInput("\u0015");
				harness.handleInput("corrected.md");
				harness.handleInput("tui.input.submit");
				await harness.waitForPending();
				return harness.resultPromise;
			},
		});
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await mock.commands.get("plan")?.handler("", context.ctx);
		await completePlan(mock, context.ctx);

		await mock.commands.get("plan")?.handler("", context.ctx);

		assert.equal(await readFile(join(directory, "PLAN.md"), "utf8"), "keep\n");
		assert.equal(await readFile(join(directory, "corrected.md"), "utf8"), `${PLAN}\n`);
		assert.equal(context.statuses.get("plan-mode"), undefined);
	});
});

test("Back from the export input returns without writing or changing ready state", async () => {
	await withTempDirectory(async (directory) => {
		const mock = createMockPi({ activeTools: ["read"] });
		planMode(mock.pi);
		let returnedFromInput = false;
		const context = createMockContext({
			cwd: directory,
			mode: "tui",
			hasUI: true,
			custom: async (factory: unknown) => {
				const harness = createCustomSelectorHarness(factory);
				if (harness.isFocusable) {
					returnedFromInput = true;
					harness.handleInput("tui.select.cancel");
					return harness.resultPromise;
				}
				if (!returnedFromInput) chooseExportMenu(harness);
				else harness.handleInput("tui.select.cancel");
				return harness.resultPromise;
			},
		});
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		await mock.commands.get("plan")?.handler("", context.ctx);
		await completePlan(mock, context.ctx);
		const entriesBeforeMenu = mock.entries.length;

		await mock.commands.get("plan")?.handler("", context.ctx);

		await assert.rejects(readFile(join(directory, "PLAN.md"), "utf8"), /ENOENT/u);
		assert.equal(context.statuses.get("plan-mode"), "plan ready");
		assert.equal(mock.entries.length, entriesBeforeMenu);
	});
});

test("pending export is cancelled by disposal, session replacement, and shutdown", async () => {
	for (const ending of ["dispose", "replacement", "shutdown"] as const) {
		await withTempDirectory(async (directory) => {
			const exportPath = join(directory, "PLAN.md");
			let releaseMutation!: () => void;
			let markMutationHeld!: () => void;
			const mutationHeld = new Promise<void>((resolve) => {
				markMutationHeld = resolve;
			});
			const mutationRelease = new Promise<void>((resolve) => {
				releaseMutation = resolve;
			});
			const blocker = withFileMutationQueue(exportPath, async () => {
				markMutationHeld();
				await mutationRelease;
			});
			await mutationHeld;

			let harness: ReturnType<typeof createCustomSelectorHarness> | undefined;
			let markSubmitted!: () => void;
			let releaseDisposed!: () => void;
			const submitted = new Promise<void>((resolve) => {
				markSubmitted = resolve;
			});
			const externallyDisposed = new Promise<void>((resolve) => {
				releaseDisposed = resolve;
			});
			const mock = createMockPi({ activeTools: ["read"] });
			planMode(mock.pi);
			const context = createMockContext({
				cwd: directory,
				mode: "tui",
				hasUI: true,
				custom: async (factory: unknown) => {
					const currentHarness = createCustomSelectorHarness(factory);
					if (!currentHarness.isFocusable) {
						chooseExportMenu(currentHarness);
						return currentHarness.resultPromise;
					}
					harness = currentHarness;
					currentHarness.handleInput("tui.input.submit");
					markSubmitted();
					return ending === "dispose"
						? Promise.race([currentHarness.resultPromise, externallyDisposed])
						: currentHarness.resultPromise;
				},
			});
			await mock.events.get("session_start")?.[0]?.({}, context.ctx);
			await mock.commands.get("plan")?.handler("", context.ctx);
			await completePlan(mock, context.ctx);
			const pendingMenu = mock.commands.get("plan")?.handler("", context.ctx);
			await submitted;
			assert.ok(harness);

			try {
				if (ending === "dispose") {
					harness.dispose();
					releaseDisposed();
				} else if (ending === "replacement") {
					await mock.events.get("session_start")?.[0]?.({ reason: "resume" }, context.ctx);
				} else await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);
			} finally {
				releaseMutation();
			}
			await blocker;
			await pendingMenu;

			await assert.rejects(readFile(exportPath, "utf8"), /ENOENT/u);
			assert.equal(mock.sentUserMessages.length, 0);
		});
	}
});

test("plan export refuses an existing directory", async () => {
	await withTempDirectory(async (directory) => {
		await mkdir(join(directory, "PLAN.md"));
		const mock = createMockPi({ activeTools: ["read"] });
		planMode(mock.pi);
		const context = createMockContext({ cwd: directory, hasUI: true });
		await mock.commands.get("plan")?.handler("", context.ctx);
		await completePlan(mock, context.ctx);
		await mock.commands.get("plan")?.handler("export", context.ctx);
		assert.match(context.notifications.at(-1)?.message ?? "", /already exists/i);
	});
});
