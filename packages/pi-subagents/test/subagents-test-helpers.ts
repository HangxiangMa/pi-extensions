import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { initTheme } from "@earendil-works/pi-coding-agent";

const CORE_PACKAGE_NAME = "@earendil-works/pi-coding-agent";

export type SchemaObject = {
	properties?: Record<string, SchemaObject>;
	items?: SchemaObject;
	enum?: string[];
	const?: unknown;
	description?: string;
	maxItems?: number;
};

export type SubagentTool = {
	execute: (...args: unknown[]) => Promise<{
		content?: Array<{ type: string; text: string }>;
		details?: {
			results: Array<{
				agent?: string;
				thinkingLevel?: string;
				termination?: { reason: string; finalization: { status: string } };
				attemptCount?: number;
				hedged?: boolean;
				outcome?: { status: string; reasonCode?: string };
				target?: { cwd: string; trust: { kind: string; projectTrusted: boolean } };
			}>;
			aggregator?: {
				thinkingLevel?: string;
				termination?: { reason: string; finalization: { status: string } };
			};
			workflow?: {
				items: Array<{
					id: string;
					state: string;
					acceptanceState?: string;
					reworkCount?: number;
					verificationAccepted?: boolean;
					artifacts?: Array<{ verified?: boolean }>;
					verificationReceipt?: { decision?: string };
				}>;
			};
			metrics?: {
				workerReportedVerification?: number;
				executorAcceptedVerification?: number;
				verificationRework?: number;
				verificationTreeMismatch?: number;
			};
		};
		isError?: boolean;
	}>;
};

export function installSubagentsTestEnvironment(): () => void {
	initTheme("dark", false);
	const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
	const testAgentDir = mkdtempSync(path.join(os.tmpdir(), "pi-subagents-test-agent-"));
	process.env.PI_CODING_AGENT_DIR = testAgentDir;
	return () => {
		if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
		rmSync(testAgentDir, { recursive: true, force: true });
	};
}

export function useFakePiPackage(packageDir: string, cliPath: string): () => void {
	writeFileSync(
		path.join(packageDir, "package.json"),
		JSON.stringify({ name: CORE_PACKAGE_NAME, bin: { pi: path.relative(packageDir, cliPath) } }),
	);
	const previous = process.env.PI_PACKAGE_DIR;
	process.env.PI_PACKAGE_DIR = packageDir;
	return () => {
		if (previous === undefined) delete process.env.PI_PACKAGE_DIR;
		else process.env.PI_PACKAGE_DIR = previous;
	};
}
