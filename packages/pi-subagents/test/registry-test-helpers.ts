import type { ManagedAgent } from "../src/registry.js";

export function record(overrides: Partial<ManagedAgent> = {}): ManagedAgent {
	return {
		id: "sa_test",
		taskName: "agent_test",
		taskPath: "/root/agent_test",
		agent: "explorer",
		rootId: "sa_test",
		depth: 0,
		children: [],
		state: "completed",
		createdAt: 1,
		updatedAt: Date.now(),
		cwd: process.cwd(),
		history: [],
		mailbox: [],
		...overrides,
	};
}
