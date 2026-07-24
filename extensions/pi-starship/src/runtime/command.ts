import { spawn } from "node:child_process";
import type { WorkspaceExec } from "./types.js";

const FORCE_KILL_DELAY_MS = 250;

export const execWorkspaceCommand: WorkspaceExec = async (command, args, options) =>
	new Promise((resolve) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(command, args, {
				cwd: options.cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});
		} catch {
			resolve({ stdout: "", stderr: "", code: 1, killed: false });
			return;
		}

		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let outputBytes = 0;
		let killed = false;
		let settled = false;
		let forceKillTimer: NodeJS.Timeout | undefined;

		const finish = (code: number) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutTimer);
			if (forceKillTimer) clearTimeout(forceKillTimer);
			resolve({
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
				code,
				killed,
			});
		};

		const terminate = () => {
			if (killed || settled) return;
			killed = true;
			child.kill("SIGTERM");
			forceKillTimer = setTimeout(() => {
				child.kill("SIGKILL");
				child.stdout?.destroy();
				child.stderr?.destroy();
				finish(1);
			}, FORCE_KILL_DELAY_MS);
		};

		const collect = (target: Buffer[]) => (data: Buffer | string) => {
			const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
			const remaining = Math.max(0, options.maxOutputBytes - outputBytes);
			if (remaining > 0) target.push(chunk.subarray(0, remaining));
			outputBytes += chunk.byteLength;
			if (outputBytes > options.maxOutputBytes) terminate();
		};

		child.stdout?.on("data", collect(stdout));
		child.stderr?.on("data", collect(stderr));
		child.once("error", () => finish(1));
		child.once("close", (code) => finish(code ?? 1));
		const timeoutTimer = setTimeout(terminate, options.timeout);
	});
