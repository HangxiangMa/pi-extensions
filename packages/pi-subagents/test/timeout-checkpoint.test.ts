import { describe, expect, it } from "vitest";
import {
	formatTimeoutCheckpoint,
	TimeoutProgressJournal,
	type TurnTerminationReport,
} from "../src/timeout-checkpoint.js";

describe("timeout progress checkpoints", () => {
	it("preserves bounded completed tool evidence and side-effect hints", () => {
		const journal = new TimeoutProgressJournal();
		journal.recordAssistantText("Found the configuration entry.");
		journal.recordToolCall("read-1", "read", { path: "src/config.ts" });
		journal.recordToolResult("read-1", "read", {
			content: [{ type: "text", text: "export const timeout = 30;" }],
			isError: false,
		});
		journal.recordToolCall("edit-1", "edit", { path: "src/config.ts" });
		journal.recordToolResult("edit-1", "edit", {
			content: [{ type: "text", text: "Updated src/config.ts" }],
			isError: false,
		});

		const checkpoint = journal.checkpoint("Update timeout handling", "partial answer");

		expect(checkpoint).toMatchObject({
			version: "pi-subagents:checkpoint:v1",
			task: "Update timeout handling",
			partialOutput: "partial answer",
			assistantNotes: ["Found the configuration entry."],
			changedFiles: ["src/config.ts"],
			sideEffectsMayHaveOccurred: true,
		});
		expect(checkpoint.completedTools).toEqual([
			{
				toolName: "read",
				output: "export const timeout = 30;",
				isError: false,
			},
			{
				toolName: "edit",
				output: "Updated src/config.ts",
				isError: false,
			},
		]);
		expect(formatTimeoutCheckpoint(checkpoint)).toContain("Completed tool evidence");
		expect(formatTimeoutCheckpoint(checkpoint)).toContain("Changed files: src/config.ts");
	});

	it("redacts private text and bounds the serialized checkpoint", () => {
		const journal = new TimeoutProgressJournal({ maxBytes: 2_048 });
		journal.recordAssistantText(`<private>secret</private>${"界".repeat(4_000)}`);
		for (let index = 0; index < 30; index++) {
			journal.recordToolResult(String(index), "read", {
				content: [{ type: "text", text: `result-${index}-${"x".repeat(1_000)}` }],
				isError: false,
			});
		}

		const checkpoint = journal.checkpoint("inspect", "<private>token</private>");
		const serialized = JSON.stringify(checkpoint);

		expect(serialized).not.toContain("secret");
		expect(serialized).not.toContain("token");
		expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(2_048);
		expect(checkpoint.truncated).toBe(true);
	});

	it("formats a deterministic fallback when model finalization fails", () => {
		const journal = new TimeoutProgressJournal();
		journal.recordToolResult("read-1", "read", {
			content: [{ type: "text", text: "verified output" }],
			isError: false,
		});
		const checkpoint = journal.checkpoint("review", "");
		const report: TurnTerminationReport = {
			version: "pi-subagents:termination:v1",
			reason: "work_timeout",
			limit: 1_000,
			checkpoint,
			finalization: {
				attempted: true,
				status: "failed",
				durationMs: 20,
				error: "provider unavailable",
			},
		};

		expect(formatTimeoutCheckpoint(report.checkpoint)).toContain("verified output");
	});
});
