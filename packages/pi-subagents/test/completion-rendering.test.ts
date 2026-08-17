import assert from "node:assert/strict";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { afterAll, test } from "vitest";
import { createMockPi } from "../../../test/support.js";
import subagents from "../src/subagents.js";
import { installSubagentsTestEnvironment } from "./subagents-test-helpers.js";

initTheme("dark", false);

const restoreTestEnvironment = installSubagentsTestEnvironment();
afterAll(restoreTestEnvironment);

const identityTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
};

type CompletionRenderer = (
	message: { customType: string; content: string; details?: unknown },
	options: { expanded: boolean; outputPad: number },
	theme: typeof identityTheme,
) => { render(width: number): string[] };

function registeredRenderer(): CompletionRenderer {
	const mock = createMockPi();
	subagents(mock.pi);
	const renderer = mock.messageRenderers.get("pi-subagent-completion");
	assert.ok(renderer, "pi-subagent-completion must register a TUI renderer");
	return renderer as CompletionRenderer;
}

function render(
	renderer: CompletionRenderer,
	message: Parameters<CompletionRenderer>[0],
	expanded: boolean,
	width = 40,
): string[] {
	return renderer(message, { expanded, outputPad: 1 }, identityTheme).render(width);
}

test("completion messages collapse to a useful summary and expand to the full safe payload", () => {
	const renderer = registeredRenderer();
	const message = {
		customType: "pi-subagent-completion",
		content: [
			"Message Type: SUBAGENT_COMPLETION",
			"Protocol: pi-subagents:v1",
			"Completion ID: completion:sa_worker:1",
			"Agent: worker",
			"Task: Fix the parser",
			"State: completed",
			"Payload:",
			"first\u001b[31m payload line",
			"second payload line",
		].join("\n"),
		details: {
			protocol: "pi-subagents:v1",
			completionId: "completion:sa_worker:1",
			runId: "run:sa_worker:1",
			generation: 1,
			agentId: "sa_worker",
			agent: "worker",
			state: "completed",
		},
	};

	const collapsedLines = render(renderer, message, false, 36);
	const collapsedRaw = collapsedLines.join("\n");
	const collapsed = stripTerminalSequences(collapsedRaw);
	assert.match(collapsed, /Completed.*worker/is);
	assert.match(collapsed, /Task: Fix the parser/i);
	assert.match(collapsed, /Payload: first\?\[31m payload line/i);
	assert.doesNotMatch(collapsed, /Completion ID|second payload line/i);
	assert.match(collapsed, /expand/i);
	assert.equal(collapsedRaw.includes("\u001b[31m"), false);
	assert.ok(collapsedLines.every((line) => visibleWidth(line) <= 36));

	const expandedLines = render(renderer, message, true, 80);
	const expandedRaw = expandedLines.join("\n");
	const expanded = stripTerminalSequences(expandedRaw);
	assert.match(expanded, /Completion ID: completion:sa_worker:1/);
	assert.match(expanded, /second payload line/);
	assert.equal(expandedRaw.includes("\u001b[31m"), false);
	assert.ok(expandedLines.every((line) => visibleWidth(line) <= 80));
});

test("completion batches collapse to bounded agent rows and expand to the full message", () => {
	const renderer = registeredRenderer();
	const completions = Array.from({ length: 7 }, (_, index) => ({
		protocol: "pi-subagents:v1",
		completionId: `completion:sa_${index}:1`,
		runId: `run:sa_${index}:1`,
		generation: 1,
		agentId: `sa_${index}`,
		agent: `worker-${index}`,
		task: `task-${index}`,
		state: index === 1 ? "failed" : "completed",
	}));
	const message = {
		customType: "pi-subagent-completion",
		content: "Message Type: SUBAGENT_COMPLETION_BATCH\nFULL_BATCH_BODY_SHOULD_HIDE",
		details: { completionCount: completions.length, completions },
	};

	const collapsedLines = render(renderer, message, false, 42);
	const collapsed = collapsedLines.join("\n");
	assert.match(collapsed, /7 subagent completions/i);
	assert.match(collapsed, /worker-0.*Completed.*task-0/is);
	assert.match(collapsed, /worker-1.*Failed.*task-1/is);
	assert.match(collapsed, /2 more/i);
	assert.doesNotMatch(collapsed, /worker-5|FULL_BATCH_BODY_SHOULD_HIDE/i);
	assert.ok(collapsedLines.every((line) => visibleWidth(line) <= 42));

	const expanded = render(renderer, message, true, 42).join("\n");
	assert.match(expanded, /FULL_BATCH_BODY_SHOULD_HIDE/);
});
