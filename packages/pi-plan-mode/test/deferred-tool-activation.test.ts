import assert from "node:assert/strict";
import { test } from "vitest";
import planMode from "../src/plan-mode.js";
import { builtinTool, createMockContext, createMockPi, extensionTool } from "./support.js";

const CUSTOM_TOOL = "research_tool";

// A model whose compat metadata declares native support for Pi's additive
// deferred-tool-loading protocol, mirroring the `supportsToolReferences` override read by
// pi-firecrawl's and pi-chrome-devtools' `lazy-tools.ts`.
const DEFERRED_CAPABLE_MODEL = {
	api: "anthropic-messages",
	provider: "anthropic",
	id: "claude-sonnet-4-5",
	compat: { supportsToolReferences: true },
};

type ToolCallResult = { block?: boolean; reason?: string } | undefined;

async function startPlan(options: {
	configured?: string[];
	activeTools: string[];
	allTools: ReturnType<typeof builtinTool>[];
	model?: unknown;
}) {
	const mock = createMockPi({ activeTools: options.activeTools, allTools: options.allTools });
	planMode(mock.pi, {
		readSettings: async () => ({
			kind: "loaded" as const,
			settings: {
				thinkingLevel: "inherit" as const,
				...(options.configured === undefined ? {} : { defaultPlanTools: options.configured }),
			},
		}),
	});
	const context = createMockContext({ model: options.model });
	await mock.events.get("session_start")?.[0]?.({ reason: "startup" }, context.ctx);
	await mock.commands.get("plan")?.handler("start", context.ctx);
	return { context, mock };
}

async function callTool(
	fixture: Awaited<ReturnType<typeof startPlan>>,
	toolName: string,
	input: unknown = {},
) {
	return fixture.mock.events.get("tool_call")?.[0]?.(
		{ toolName, input },
		fixture.context.ctx,
	) as ToolCallResult;
}

test("a configured but inactive tool is plannable and lazily activated for a deferred-capable model", async () => {
	const fixture = await startPlan({
		configured: [CUSTOM_TOOL],
		activeTools: ["read"],
		allTools: [builtinTool("read"), extensionTool(CUSTOM_TOOL)],
		model: DEFERRED_CAPABLE_MODEL,
	});

	// Plannable: admitted to the Plan policy even though it never became active.
	assert.equal(await callTool(fixture, CUSTOM_TOOL), undefined);

	// Activated additively; the previously active "read" tool and the required Plan helper
	// tools stay active.
	assert.deepEqual(
		new Set(fixture.mock.rawPi.getActiveTools()),
		new Set(["read", CUSTOM_TOOL, "plan_mode_question", "plan_mode_complete"]),
	);
});

test("the same configured-but-inactive tool stays hard-blocked without deferred-tool-loading support", async () => {
	const fixture = await startPlan({
		configured: [CUSTOM_TOOL],
		activeTools: ["read"],
		allTools: [builtinTool("read"), extensionTool(CUSTOM_TOOL)],
	});

	assert.deepEqual(await callTool(fixture, CUSTOM_TOOL), {
		block: true,
		reason: `Plan mode blocks tool '${CUSTOM_TOOL}' because it is registered but inactive. Activate it before starting the next Plan workflow.`,
	});
	assert.deepEqual(
		new Set(fixture.mock.rawPi.getActiveTools()),
		new Set(["read", "plan_mode_question", "plan_mode_complete"]),
	);
});

test("lazy activation never removes an unrelated active tool", async () => {
	const fixture = await startPlan({
		configured: [CUSTOM_TOOL],
		activeTools: ["read", "bash"],
		allTools: [builtinTool("read"), builtinTool("bash"), extensionTool(CUSTOM_TOOL)],
		model: DEFERRED_CAPABLE_MODEL,
	});

	assert.equal(await callTool(fixture, CUSTOM_TOOL), undefined);

	assert.deepEqual(
		new Set(fixture.mock.rawPi.getActiveTools()),
		new Set(["read", "bash", CUSTOM_TOOL, "plan_mode_question", "plan_mode_complete"]),
	);
});
