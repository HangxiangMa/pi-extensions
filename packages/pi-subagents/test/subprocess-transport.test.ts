import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import type { PeerTransportRuntime } from "../src/peer-transport.js";
import { SubprocessTransport } from "../src/subprocess-transport.js";
import { record } from "./registry-test-helpers.js";
import { useFakePiPackage } from "./subagents-test-helpers.js";

test("SubprocessTransport adds the explicit peer bridge and revokes credentials after exit", async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), "pi-subagent-process-peer-"));
	const packageDir = path.join(root, "pi-package");
	const capturePath = path.join(root, "capture.json");
	const cliPath = path.join(packageDir, "cli.mjs");
	mkdirSync(packageDir, { recursive: true });
	writeFileSync(
		cliPath,
		[
			'import { writeFileSync } from "node:fs";',
			`writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({args:process.argv.slice(2),token:process.env.PI_SUBAGENT_PEER_TOKEN}));`,
			"const message={role:'assistant',content:[{type:'text',text:'done'}],stopReason:'stop',timestamp:Date.now()};",
			"process.stdout.write(JSON.stringify({type:'message_end',message})+'\\n');",
		].join(""),
	);
	const restorePackage = useFakePiPackage(packageDir, cliPath);
	const revoked: string[] = [];
	const peerRuntime: PeerTransportRuntime = {
		async send() {
			throw new Error("unused");
		},
		list: () => [],
		async acknowledge() {},
		async issueCredentials() {
			return { host: "127.0.0.1", port: 12345, token: "ephemeral-token", generation: 1 };
		},
		revoke(agentId) {
			revoked.push(agentId);
		},
	};
	try {
		const transport = new SubprocessTransport({ peerRuntime });
		const agent = record({
			id: "sa_process",
			taskName: "process",
			taskPath: "/root/process",
			agent: "worker",
			state: "running",
			cwd: root,
			turnGeneration: 1,
			currentTurnGeneration: 1,
			target: {
				cwd: root,
				boundary: "current-workspace",
				trust: { kind: "session-trusted", projectTrusted: true },
			},
		});
		const result = await transport.runTurn(agent, "work", new AbortController().signal);
		assert.equal(result.exitCode, 0);
		const capture = JSON.parse(readFileSync(capturePath, "utf8")) as {
			args: string[];
			token?: string;
		};
		assert.equal(capture.token, "ephemeral-token");
		assert.equal(capture.args.includes("--no-extensions"), false);
		assert.ok(capture.args.includes("-e"));
		assert.match(capture.args[capture.args.indexOf("-e") + 1] ?? "", /child-peer-bridge\.ts$/u);
		assert.deepEqual(revoked, [agent.id]);
	} finally {
		restorePackage();
		rmSync(root, { recursive: true, force: true });
	}
});
