import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { test } from "vitest";
import { createMockContext, createMockPi } from "../../../test/support.js";
import { AgentPersistence } from "../src/persistence.js";
import type { ManagedAgent } from "../src/registry.js";
import { registerStatefulSubagents } from "../src/stateful.js";
import { SubprocessTransport } from "../src/subprocess-transport.js";
import type { WorkspaceManager } from "../src/workspace.js";
import { record } from "./orchestration-test-helpers.js";

test("stateful spawn enforces trusted targets and carries trust into in-process children", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-stateful-cwd-"));
	const agentDir = path.join(root, "agent-home");
	const workspace = path.join(root, "workspace");
	const external = path.join(root, "external");
	const generated = path.join(root, "generated-worktree");
	mkdirSync(agentDir);
	mkdirSync(workspace);
	mkdirSync(external);
	mkdirSync(generated);
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	let delegation: "trusted-targets" | "anywhere" = "trusted-targets";
	const created: ManagedAgent[] = [];
	const createdTools: Array<string[] | undefined> = [];
	const waitForCreated = async (expected: number) => {
		const deadline = Date.now() + 5_000;
		while (created.length < expected && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		assert.equal(created.length, expected);
	};
	let workspaceCreates = 0;
	let projectConfirmations = 0;
	try {
		const mock = createMockPi();
		const controller = registerStatefulSubagents(mock.pi, {
			settings: { transport: "in-process" },
			getSettings: () => ({
				cwdPolicy: { delegation },
				agents: { scout: { tools: [] } },
			}),
			workspaceManager: {
				async create() {
					workspaceCreates++;
					return {
						mode: "worktree" as const,
						path: generated,
						rootPath: generated,
						repositoryRoot: workspace,
					};
				},
				async cleanup() {},
				async cleanupAll() {},
			} as unknown as WorkspaceManager,
			createInProcessSession: async (options) => {
				created.push(structuredClone(options.agent));
				createdTools.push(options.agentConfig.tools);
				const messages: unknown[] = [];
				return {
					sessionId: `child-${created.length}`,
					messages,
					async prompt() {
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
		const context = createMockContext({
			cwd: workspace,
			hasUI: true,
			isProjectTrusted: () => true,
			confirm: async () => {
				projectConfirmations++;
				return true;
			},
		});
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		const spawn = mock.tools.find((tool) => tool.name === "subagent_spawn") as
			| { execute: (...args: unknown[]) => Promise<unknown> }
			| undefined;
		assert.ok(spawn);
		await assert.rejects(
			() =>
				spawn.execute(
					"unsaved",
					{ agent: "scout", task: "inspect", cwd: external },
					undefined,
					undefined,
					context.ctx,
				),
			/saved-trusted.*\/trust/i,
		);
		assert.deepEqual(controller.listAgents(), []);

		new ProjectTrustStore(agentDir).set(external, true);
		await spawn.execute(
			"trusted",
			{ agent: "scout", task: "inspect", cwd: external },
			undefined,
			undefined,
			context.ctx,
		);
		await waitForCreated(1);
		assert.deepEqual(createdTools[0], []);
		assert.equal(created[0]?.target?.trust.kind, "saved-trusted");
		assert.equal(created[0]?.target?.trust.projectTrusted, true);
		assert.equal(controller.listAgents()[0]?.target?.cwd, realpathSync(external));

		const idempotentFirst = (await spawn.execute(
			"idempotent-1",
			{
				agent: "scout",
				task: "idempotent inspect",
				cwd: external,
				idempotencyKey: "inspect-external",
				resultFormat: "structured-v1",
			},
			undefined,
			undefined,
			context.ctx,
		)) as { details: { agent: { id: string; context: { bytes: number } } } };
		const idempotentSecond = (await spawn.execute(
			"idempotent-2",
			{
				agent: "scout",
				task: "idempotent inspect",
				cwd: external,
				idempotencyKey: "inspect-external",
				resultFormat: "structured-v1",
			},
			undefined,
			undefined,
			context.ctx,
		)) as { details: { agent: { id: string } } };
		assert.equal(idempotentSecond.details.agent.id, idempotentFirst.details.agent.id);
		assert.equal(idempotentFirst.details.agent.context.bytes, 0);
		await waitForCreated(2);
		await assert.rejects(
			() =>
				spawn.execute(
					"idempotent-mismatch",
					{
						agent: "scout",
						task: "different task",
						cwd: external,
						idempotencyKey: "inspect-external",
					},
					undefined,
					undefined,
					context.ctx,
				),
			/different parameters/,
		);

		new ProjectTrustStore(agentDir).set(external, false);
		delegation = "anywhere";
		await spawn.execute(
			"anywhere",
			{ agent: "scout", task: "inspect", cwd: external },
			undefined,
			undefined,
			context.ctx,
		);
		await waitForCreated(3);
		assert.equal(created[2]?.target?.trust.kind, "saved-denied");
		assert.equal(created[2]?.target?.trust.projectTrusted, false);

		await spawn.execute(
			"worktree",
			{ agent: "scout", task: "inspect", workspaceMode: "worktree" },
			undefined,
			undefined,
			context.ctx,
		);
		await waitForCreated(4);
		assert.equal(created[3]?.cwd, generated);
		assert.equal(created[3]?.workspaceMode, "worktree");
		assert.equal(created[3]?.target?.cwd, realpathSync(workspace));
		assert.equal(created[3]?.target?.boundary, "current-workspace");
		assert.equal(created[3]?.target?.trust.kind, "session-trusted");
		assert.equal(created[3]?.target?.trust.projectTrusted, true);
		assert.equal(workspaceCreates, 1);
		mkdirSync(path.join(workspace, ".pi", "agents"), { recursive: true });
		writeFileSync(
			path.join(workspace, ".pi", "agents", "project-reviewer.md"),
			"---\nname: project-reviewer\ndescription: Project reviewer\ntools: []\n---\nReview.",
		);
		const projectFirst = (await spawn.execute(
			"project-idempotent-1",
			{
				agent: "project-reviewer",
				task: "review once",
				agentScope: "project",
				idempotencyKey: "project-review",
			},
			undefined,
			undefined,
			context.ctx,
		)) as { details: { agent: { id: string } } };
		const projectSecond = (await spawn.execute(
			"project-idempotent-2",
			{
				agent: "project-reviewer",
				task: "review once",
				agentScope: "project",
				idempotencyKey: "project-review",
			},
			undefined,
			undefined,
			context.ctx,
		)) as { details: { agent: { id: string } } };
		assert.equal(projectSecond.details.agent.id, projectFirst.details.agent.id);
		assert.equal(projectConfirmations, 1, "exact retry must not confirm project agents twice");
		await assert.rejects(
			spawn.execute(
				"project-idempotent-mismatch",
				{
					agent: "project-reviewer",
					task: "different review",
					agentScope: "project",
					idempotencyKey: "project-review",
				},
				undefined,
				undefined,
				context.ctx,
			),
			/different parameters/,
		);
		assert.equal(projectConfirmations, 1, "mismatch must fail before project confirmation");
		const isolatedFirst = (await spawn.execute(
			"worktree-idempotent-1",
			{
				agent: "scout",
				task: "isolated exact retry",
				workspaceMode: "worktree",
				idempotencyKey: "isolated-retry",
			},
			undefined,
			undefined,
			context.ctx,
		)) as { details: { agent: { id: string } } };
		const isolatedSecond = (await spawn.execute(
			"worktree-idempotent-2",
			{
				agent: "scout",
				task: "isolated exact retry",
				workspaceMode: "worktree",
				idempotencyKey: "isolated-retry",
			},
			undefined,
			undefined,
			context.ctx,
		)) as { details: { agent: { id: string } } };
		assert.equal(isolatedSecond.details.agent.id, isolatedFirst.details.agent.id);
		assert.equal(workspaceCreates, 2, "exact retry must not create another worktree");
		await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("stateful restore re-resolves target trust instead of trusting persisted snapshots", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-restore-trust-"));
	const agentDir = path.join(root, "agent-home");
	const workspace = path.join(root, "workspace");
	const external = path.join(root, "external");
	mkdirSync(agentDir);
	mkdirSync(workspace);
	mkdirSync(external);
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	try {
		await new AgentPersistence("test-session").save([
			record({
				id: "sa_restored",
				rootId: "sa_restored",
				cwd: external,
				updatedAt: Date.now(),
				target: {
					cwd: external,
					boundary: "external",
					trust: { kind: "saved-trusted", projectTrusted: true, sourcePath: external },
				},
			}),
			record({
				id: "sa_worktree",
				rootId: "sa_worktree",
				cwd: external,
				updatedAt: Date.now(),
				workspaceMode: "worktree",
			}),
		]);
		new ProjectTrustStore(agentDir).set(external, false);
		const mock = createMockPi();
		const controller = registerStatefulSubagents(mock.pi);
		const context = createMockContext({ cwd: workspace, isProjectTrusted: () => true });
		await mock.events.get("session_start")?.[0]?.({}, context.ctx);
		const restoredAgents = controller.listAgents();
		assert.equal(restoredAgents.length, 1);
		const restored = restoredAgents[0];
		assert.equal(restored?.id, "sa_restored");
		assert.equal(restored?.target?.trust.kind, "saved-denied");
		assert.equal(restored?.target?.trust.projectTrusted, false);
		await mock.events.get("session_shutdown")?.[0]?.({}, context.ctx);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
		rmSync(root, { recursive: true, force: true });
	}
});

test("stateful subprocess uses the retained resolved trust decision", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-stateful-subprocess-trust-"));
	const fakePi = path.join(root, "fake-pi.mjs");
	writeFileSync(
		fakePi,
		[
			"const text=process.argv.slice(2).join(' ');",
			"const message={role:'assistant',content:[{type:'text',text}],stopReason:'stop',timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({
			name: "@earendil-works/pi-coding-agent",
			bin: { pi: path.basename(fakePi) },
		}),
	);
	const previousPackageDir = process.env.PI_PACKAGE_DIR;
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	const agentDir = path.join(root, "agent-home");
	mkdirSync(agentDir);
	writeFileSync(path.join(agentDir, "APPEND_SYSTEM.md"), "global append");
	process.env.PI_PACKAGE_DIR = root;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	try {
		const transport = new SubprocessTransport({
			getSettings: () => ({ agents: { scout: { tools: [] } } }),
		});
		for (const [projectTrusted, expected] of [
			[true, "--approve"],
			[false, "--no-approve"],
		] as const) {
			const outcome = await transport.runTurn(
				record({
					cwd: root,
					target: {
						cwd: root,
						boundary: "external",
						trust: {
							kind: projectTrusted ? "saved-trusted" : "saved-denied",
							projectTrusted,
						},
					},
				}),
				"inspect",
				new AbortController().signal,
			);
			assert.equal(outcome.exitCode, 0);
			assert.match(outcome.output, new RegExp(expected));
			assert.match(outcome.output, /--no-tools/);
			assert.match(outcome.output, /--append-system-prompt/);
			assert.match(outcome.output, /APPEND_SYSTEM\.md/);
		}
	} finally {
		if (previousPackageDir === undefined) delete process.env.PI_PACKAGE_DIR;
		else process.env.PI_PACKAGE_DIR = previousPackageDir;
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		rmSync(root, { recursive: true, force: true });
	}
});
