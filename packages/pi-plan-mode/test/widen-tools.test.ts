import assert from "node:assert/strict";
import { test } from "vitest";
import planMode from "../src/plan-mode.js";
import { classifyWidenRequest, normalizeWidenToolsParams, PLAN_MODE_WIDEN_TOOL_NAME } from "../src/widen-tools.js";
import { builtinTool, createMockContext, createMockPi, extensionTool } from "./support.js";

type ToolCallResult = { block?: boolean; reason?: string } | undefined;
type WidenResult = { content: Array<{ text: string }>; details: { outcome: string; added?: string[] } };

async function startPlan(options: {
  configured?: string[];
  activeTools: string[];
  allTools: unknown[];
  confirm?: (...args: unknown[]) => Promise<boolean>;
  hasUI?: boolean;
}) {
  const mock = createMockPi({ activeTools: options.activeTools, allTools: options.allTools as never[] });
  planMode(mock.pi, {
    readSettings: async () => ({
      kind: "loaded" as const,
      settings: {
        thinkingLevel: "inherit" as const,
        ...(options.configured === undefined ? {} : { defaultPlanTools: options.configured }),
      },
    }),
  });
  const context = createMockContext({
    hasUI: options.hasUI ?? true,
    ...(options.confirm ? { confirm: options.confirm } : {}),
  });
  await mock.events.get("session_start")?.[0]?.({ reason: "startup" }, context.ctx);
  await mock.commands.get("plan")?.handler("start", context.ctx);
  return { context, mock };
}

function widenTool(fixture: Awaited<ReturnType<typeof startPlan>>) {
  const tool = fixture.mock.tools.find((t) => t.name === PLAN_MODE_WIDEN_TOOL_NAME) as
    | { execute: (...args: unknown[]) => Promise<WidenResult> }
    | undefined;
  assert.ok(tool, `${PLAN_MODE_WIDEN_TOOL_NAME} must be registered`);
  return tool;
}

async function callTool(fixture: Awaited<ReturnType<typeof startPlan>>, toolName: string, input: unknown = {}) {
  return fixture.mock.events.get("tool_call")?.[0]?.({ toolName, input }, fixture.context.ctx) as ToolCallResult;
}

const ALL_TOOLS = [
  builtinTool("read"),
  builtinTool("grep"),
  builtinTool("bash"),
  builtinTool("edit"),
  builtinTool("write"),
  extensionTool("subagent_routed"),
];

test("normalize rejects empty, oversized, and malformed requests and dedupes names", () => {
  assert.equal(normalizeWidenToolsParams({ tools: [], reason: "x" }).ok, false);
  assert.equal(normalizeWidenToolsParams({ tools: ["grep"] }).ok, false);
  assert.equal(
    normalizeWidenToolsParams({ tools: ["a", "b", "c", "d", "e", "f", "g", "h", "i"], reason: "x" }).ok,
    false,
  );
  assert.equal(normalizeWidenToolsParams({ tools: [""], reason: "x" }).ok, false);
  const ok = normalizeWidenToolsParams({ tools: [" grep ", "grep", "bash"], reason: "  inspect  " });
  assert.deepEqual(ok, { ok: true, tools: ["grep", "bash"], reason: "inspect" });
});

test("classify blocks mutating, helper, and unregistered names even when active", () => {
  const active = new Set(["read", "grep", "edit", "write", "update_plan", "plan_mode_complete", "subagent_routed"]);
  const result = classifyWidenRequest(
    ["grep", "edit", "write", "update_plan", "plan_mode_complete", "ghost", "subagent_routed"],
    [...ALL_TOOLS, extensionTool("update_plan"), builtinTool("plan_mode_complete")],
    active,
    new Set(["read"]),
  );
  assert.deepEqual(result.admit, ["grep", "subagent_routed"]);
  assert.deepEqual(
    result.rejected.map((item) => item.name),
    ["edit", "write", "update_plan", "plan_mode_complete", "ghost"],
  );
});

test("classify refuses tools that are registered but not active in Pi", () => {
  const result = classifyWidenRequest(["grep"], ALL_TOOLS, new Set(["read"]), new Set());
  assert.deepEqual(result.admit, []);
  assert.equal(result.rejected[0]?.name, "grep");
  assert.match(result.rejected[0]?.why ?? "", /not active in Pi/);
});

test("confirmed request admits an active read-only tool so the next bash call is allowed", async () => {
  let asked = 0;
  const fixture = await startPlan({
    configured: ["read"],
    activeTools: ["read", "grep", "bash", "edit"],
    allTools: ALL_TOOLS,
    confirm: async () => {
      asked += 1;
      return true;
    },
  });
  // Before widening, bash is outside the frozen allowlist.
  assert.match(
    (await callTool(fixture, "bash", { command: "git status --short" }))?.reason ?? "",
    /not selected by the Plan policy/,
  );
  const result = await widenTool(fixture).execute(
    "call-1",
    { tools: ["bash", "grep"], reason: "inspect graft" },
    undefined,
    undefined,
    fixture.context.ctx,
  );
  assert.equal(asked, 1, "the user must be asked exactly once");
  assert.equal(result.details.outcome, "widened");
  assert.deepEqual(result.details.added, ["bash", "grep"]);
  assert.equal(await callTool(fixture, "bash", { command: "git status --short" }), undefined);
  assert.equal(await callTool(fixture, "grep", {}), undefined);
});

test("declining leaves the allowlist unchanged and never widens", async () => {
  const fixture = await startPlan({
    configured: ["read"],
    activeTools: ["read", "grep"],
    allTools: ALL_TOOLS,
    confirm: async () => false,
  });
  const result = await widenTool(fixture).execute(
    "call-2",
    { tools: ["grep"], reason: "search" },
    undefined,
    undefined,
    fixture.context.ctx,
  );
  assert.equal(result.details.outcome, "declined");
  assert.match((await callTool(fixture, "grep", {}))?.reason ?? "", /not selected by the Plan policy/);
});

test("no UI cannot widen the allowlist", async () => {
  const fixture = await startPlan({
    configured: ["read"],
    activeTools: ["read", "grep"],
    allTools: ALL_TOOLS,
    hasUI: false,
  });
  const result = await widenTool(fixture).execute(
    "call-3",
    { tools: ["grep"], reason: "search" },
    undefined,
    undefined,
    fixture.context.ctx,
  );
  assert.equal(result.details.outcome, "no_ui");
  assert.match((await callTool(fixture, "grep", {}))?.reason ?? "", /not selected by the Plan policy/);
});

test("edit and write are never admitted, even after a confirmed request", async () => {
  const fixture = await startPlan({
    configured: ["read"],
    activeTools: ["read", "edit", "write"],
    allTools: ALL_TOOLS,
    confirm: async () => true,
  });
  const result = await widenTool(fixture).execute(
    "call-4",
    { tools: ["edit", "write"], reason: "change files" },
    undefined,
    undefined,
    fixture.context.ctx,
  );
  assert.equal(result.details.outcome, "rejected");
  assert.equal((await callTool(fixture, "edit", { path: "a.txt" }))?.reason, "Plan mode blocks mutating tool 'edit'.");
  assert.equal((await callTool(fixture, "write", { path: "a.txt" }))?.block, true);
});

test("the widen tool itself is not blocked by the allowlist it changes", async () => {
  const fixture = await startPlan({
    configured: ["read"],
    activeTools: ["read", PLAN_MODE_WIDEN_TOOL_NAME],
    allTools: [builtinTool("read"), extensionTool(PLAN_MODE_WIDEN_TOOL_NAME)],
    confirm: async () => false,
  });
  assert.equal(await callTool(fixture, PLAN_MODE_WIDEN_TOOL_NAME, { tools: ["x"], reason: "r" }), undefined);
});

test("outside Plan mode the widen tool refuses without asking", async () => {
  let asked = 0;
  const mock = createMockPi({ activeTools: ["read", "grep"], allTools: ALL_TOOLS as never[] });
  planMode(mock.pi, {
    readSettings: async () => ({ kind: "loaded" as const, settings: { thinkingLevel: "inherit" as const } }),
  });
  const context = createMockContext({
    confirm: async () => {
      asked += 1;
      return true;
    },
  });
  await mock.events.get("session_start")?.[0]?.({ reason: "startup" }, context.ctx);
  const tool = mock.tools.find((t) => t.name === PLAN_MODE_WIDEN_TOOL_NAME) as
    | { execute: (...args: unknown[]) => Promise<WidenResult> }
    | undefined;
  assert.ok(tool);
  const result = await tool.execute("call-5", { tools: ["grep"], reason: "search" }, undefined, undefined, context.ctx);
  assert.equal(result.details.outcome, "inactive");
  assert.equal(asked, 0, "must not prompt when Plan mode is inactive");
});

test("a widened allowlist survives a context revalidation and is persisted", async () => {
  const fixture = await startPlan({
    configured: ["read"],
    activeTools: ["read", "grep", "bash"],
    allTools: ALL_TOOLS,
    confirm: async () => true,
  });
  await widenTool(fixture).execute(
    "call-6",
    { tools: ["grep"], reason: "search" },
    undefined,
    undefined,
    fixture.context.ctx,
  );
  // The context hook revalidates the frozen policy; the widened name must still be allowed.
  await fixture.mock.events.get("context")?.[0]?.({ messages: [] }, fixture.context.ctx);
  assert.equal(await callTool(fixture, "grep", {}), undefined);
  const persisted = fixture.mock.entries.filter((entry) => entry.customType === "plan-mode-state").at(-1);
  const policy = (persisted?.data as { workflowToolPolicy?: { allowedNames?: string[] } } | undefined)
    ?.workflowToolPolicy;
  assert.ok(policy?.allowedNames?.includes("grep"), "the widened name must be persisted in the frozen policy");
});

test("after a confirmed widen, the live tool_call guard admits the tool without restarting Plan", async () => {
  const fixture = await startPlan({
    configured: ["read"],
    activeTools: ["read", "bash"],
    allTools: ALL_TOOLS,
    confirm: async () => true,
  });
  assert.match((await callTool(fixture, "bash", { command: "ls" }))?.reason ?? "", /not selected by the Plan policy/);
  await widenTool(fixture).execute(
    "call-7",
    { tools: ["bash"], reason: "inspect" },
    undefined,
    undefined,
    fixture.context.ctx,
  );
  assert.equal(
    await callTool(fixture, "bash", { command: "ls" }),
    undefined,
    "bash must be admitted without restarting Plan",
  );
  assert.equal(
    (await callTool(fixture, "bash", { command: "rm -rf build" }))?.block,
    true,
    "widening bash must not disable its built-in read-only command policy",
  );
});
