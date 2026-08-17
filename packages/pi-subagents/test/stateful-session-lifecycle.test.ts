import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { registerStatefulSubagents } from "../src/stateful.js";
import type { WorkspaceManager } from "../src/workspace.js";

test("stateful worktree spawn revalidates session ownership and cleans stale work", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-stale-worktree-"));
	const agentDir = path.join(root, "agent-home");
	const workspace = path.join(root, "workspace");
	const generated = path.join(root, "generated");
	mkdirSync(agentDir);
	mkdirSync(workspace);
	mkdirSync(generated);
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	let beginCreate: (() => void) | undefined;
	const createStarted = new Promise<void>((resolve) => {
		beginCreate = resolve;
	});
	let finishCreate:
		| ((value: {
				mode: "worktree";
				path: string;
				rootPath: string;
				repositoryRoot: string;
		  }) => void)
		| undefined;
	const created = new Promise<{
		mode: "worktree";
		path: string;
		rootPath: string;
		repositoryRoot: string;
	}>((resolve) => {
		finishCreate = resolve;
	});
	let cleaned = 0;
	let childCreates = 0;
	const workspaceManager = {
		async create() {
			beginCreate?.();
			return created;
		},
		async cleanup() {
			cleaned++;
		},
		async cleanupAll() {},
	} as unknown as WorkspaceManager;
	try {
		const mock = createMockPi();
		const controller = registerStatefulSubagents(mock.pi, {
			settings: { transport: "in-process" },
			workspaceManager,
			createInProcessSession: async () => {
				childCreates++;
				throw new Error("stale spawn must not create a child");
			},
		});
		const first = createMockContext({ cwd: workspace, isProjectTrusted: () => true });
		await mock.events.get("session_start")?.[0]?.({}, first.ctx);
		const spawn = mock.tools.find((tool) => tool.name === "subagent_spawn") as
			| { execute: (...args: unknown[]) => Promise<unknown> }
			| undefined;
		assert.ok(spawn);
		const pending = spawn.execute(
			"worktree",
			{ agent: "explorer", task: "inspect", workspaceMode: "worktree" },
			undefined,
			undefined,
			first.ctx,
		);
		await createStarted;
		const replacement = createMockContext({ cwd: workspace, isProjectTrusted: () => true });
		await mock.events.get("session_start")?.[0]?.({}, replacement.ctx);
		finishCreate?.({
			mode: "worktree",
			path: generated,
			rootPath: generated,
			repositoryRoot: workspace,
		});
		await assert.rejects(pending, (error) => error instanceof Error && error.name === "AbortError");
		assert.equal(cleaned, 1);
		assert.equal(childCreates, 0);
		assert.deepEqual(controller.listAgents(), []);
		await mock.events.get("session_shutdown")?.[0]?.({}, replacement.ctx);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("stale idempotent spawn cleanup cannot delete a replacement session attempt", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-idempotent-replacement-"));
	const agentDir = path.join(root, "agent-home");
	const workspace = path.join(root, "workspace");
	mkdirSync(agentDir);
	mkdirSync(workspace);
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	let createCalls = 0;
	const createResolvers: Array<
		(value: { mode: "worktree"; path: string; rootPath: string; repositoryRoot: string }) => void
	> = [];
	const workspaceManager = {
		create: async () => {
			createCalls++;
			if (createCalls > 2) throw new Error("duplicate worktree creation");
			return await new Promise<{
				mode: "worktree";
				path: string;
				rootPath: string;
				repositoryRoot: string;
			}>((resolve) => createResolvers.push(resolve));
		},
		async cleanup() {},
		async cleanupAll() {},
	} as unknown as WorkspaceManager;
	try {
		const mock = createMockPi();
		registerStatefulSubagents(mock.pi, {
			settings: { transport: "in-process" },
			workspaceManager,
			createInProcessSession: async () => {
				const messages: unknown[] = [];
				return {
					sessionId: "idempotent-replacement",
					messages,
					prompt: async () => {
						messages.push({
							role: "assistant",
							content: [{ type: "text", text: "done" }],
							stopReason: "stop",
						});
					},
					subscribe: () => () => undefined,
					abort: async () => undefined,
					dispose: () => undefined,
					getActiveToolNames: () => ["read", "grep", "find", "ls", "bash"],
				};
			},
		});
		const firstContext = createMockContext({ cwd: workspace, isProjectTrusted: () => true });
		await mock.events.get("session_start")?.[0]?.({}, firstContext.ctx);
		const spawn = mock.tools.find((tool) => tool.name === "subagent_spawn") as {
			execute: (...args: unknown[]) => Promise<unknown>;
		};
		const spawnParams = {
			agent: "explorer",
			task: "same request",
			workspaceMode: "worktree" as const,
			idempotencyKey: "replacement-key",
		};
		const first = spawn.execute("first", spawnParams, undefined, undefined, firstContext.ctx);
		while (createCalls < 1) await new Promise<void>((resolve) => setImmediate(resolve));

		const replacementContext = createMockContext({ cwd: workspace, isProjectTrusted: () => true });
		await mock.events.get("session_start")?.[0]?.({}, replacementContext.ctx);
		const second = spawn.execute(
			"second",
			spawnParams,
			undefined,
			undefined,
			replacementContext.ctx,
		) as Promise<{ content: Array<{ text: string }>; details: { agent: { id: string } } }>;
		while (createCalls < 2) await new Promise<void>((resolve) => setImmediate(resolve));

		createResolvers[0]?.({
			mode: "worktree",
			path: path.join(root, "first-worktree"),
			rootPath: path.join(root, "first-worktree"),
			repositoryRoot: workspace,
		});
		await assert.rejects(first, (error) => error instanceof Error && error.name === "AbortError");

		const third = spawn.execute(
			"third",
			spawnParams,
			undefined,
			undefined,
			replacementContext.ctx,
		) as Promise<{ content: Array<{ text: string }>; details: { agent: { id: string } } }>;
		await new Promise<void>((resolve) => setImmediate(resolve));
		assert.equal(createCalls, 2, "the retry must join the replacement session's pending spawn");
		createResolvers[1]?.({
			mode: "worktree",
			path: path.join(root, "second-worktree"),
			rootPath: path.join(root, "second-worktree"),
			repositoryRoot: workspace,
		});
		const [secondResult, thirdResult] = await Promise.all([second, third]);
		assert.equal(thirdResult.details.agent.id, secondResult.details.agent.id);
		assert.match(
			secondResult.content[0]?.text ?? "",
			/current response must not depend.*next-turn delivery.*not wake an idle root/i,
		);
		assert.doesNotMatch(secondResult.content[0]?.text ?? "", /end the response/i);
		await mock.events.get("session_shutdown")?.[0]?.({}, replacementContext.ctx);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("stateful clear and session replacement serialize active-child cleanup before the new runtime", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-runtime-replacement-"));
	const agentDir = path.join(root, "agent-home");
	const workspace = path.join(root, "workspace");
	mkdirSync(agentDir);
	mkdirSync(workspace);
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	let childStarted: (() => void) | undefined;
	const started = new Promise<void>((resolve) => {
		childStarted = resolve;
	});
	let finishPrompt: (() => void) | undefined;
	let aborts = 0;
	let disposals = 0;
	try {
		const mock = createMockPi();
		const controller = registerStatefulSubagents(mock.pi, {
			settings: { transport: "in-process" },
			createInProcessSession: async () => {
				const messages: unknown[] = [];
				return {
					sessionId: "active-child",
					messages,
					prompt: async () => {
						childStarted?.();
						await new Promise<void>((resolve) => {
							finishPrompt = resolve;
						});
					},
					subscribe: () => () => undefined,
					abort: async () => {
						aborts++;
						finishPrompt?.();
					},
					dispose: () => {
						disposals++;
					},
					getActiveToolNames: () => ["read", "grep", "find", "ls", "bash"],
				};
			},
		});
		const first = createMockContext({ cwd: workspace, isProjectTrusted: () => true });
		await mock.events.get("session_start")?.[0]?.({}, first.ctx);
		const spawn = mock.tools.find((tool) => tool.name === "subagent_spawn") as
			| { execute: (...args: unknown[]) => Promise<unknown> }
			| undefined;
		assert.ok(spawn);
		await spawn.execute(
			"active",
			{ agent: "explorer", task: "wait" },
			undefined,
			undefined,
			first.ctx,
		);
		await started;
		const replacement = createMockContext({
			cwd: workspace,
			isProjectTrusted: () => true,
			sessionManager: {
				getSessionId: () => "replacement-session",
				getSessionName: () => undefined,
				getBranch: () => [],
				getEntries: () => [],
			},
		});
		const clearing = controller.clearAgents();
		const replacing = mock.events.get("session_start")?.[0]?.({}, replacement.ctx);
		await Promise.all([clearing, replacing]);
		assert.ok(aborts >= 1);
		assert.equal(disposals, 1);
		assert.deepEqual(controller.listAgents(), []);
		await mock.events.get("session_shutdown")?.[0]?.({}, replacement.ctx);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});
