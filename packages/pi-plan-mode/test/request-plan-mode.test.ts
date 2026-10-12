import assert from "node:assert/strict";
import { test } from "vitest";
import planMode from "../src/plan-mode.js";
import { builtinTool, createMockContext, createMockPi } from "./support.js";

// Plan mode is observable through its tool_call guard: while it is active, edit is blocked.
type ToolCallResult = { block?: boolean; reason?: string } | undefined;

function setup(
  options: { hasUI?: boolean; confirm?: (...args: unknown[]) => Promise<boolean>; isIdle?: () => boolean } = {},
) {
  const mock = createMockPi({
    activeTools: ["read", "edit", "request_plan_mode"],
    allTools: [builtinTool("read"), builtinTool("edit")],
  });
  planMode(mock.pi, {
    readSettings: async () => ({ kind: "loaded" as const, settings: { thinkingLevel: "inherit" as const } }),
  });
  const context = createMockContext({
    hasUI: options.hasUI ?? true,
    confirm: options.confirm,
    ...(options.isIdle ? { isIdle: options.isIdle } : {}),
  });
  return { mock, context };
}

async function startSession(fixture: ReturnType<typeof setup>) {
  await fixture.mock.events.get("session_start")?.[0]?.({ reason: "startup" }, fixture.context.ctx);
}

function requestTool(fixture: ReturnType<typeof setup>) {
  const tool = fixture.mock.tools.find((t: { name: string }) => t.name === "request_plan_mode") as
    | { execute: (...args: unknown[]) => Promise<{ details: { outcome: string } }> }
    | undefined;
  assert.ok(tool, "request_plan_mode must be registered");
  return tool;
}

async function editBlocked(fixture: ReturnType<typeof setup>): Promise<boolean> {
  const result = (await fixture.mock.events.get("tool_call")?.[0]?.(
    { toolName: "edit", input: { path: "a.txt" } },
    fixture.context.ctx,
  )) as ToolCallResult;
  return result?.block === true;
}

test("request_plan_mode is registered as a model-callable tool", async () => {
  const fixture = setup();
  await startSession(fixture);
  const tool = requestTool(fixture);
  assert.equal(typeof tool.execute, "function");
});

test("declining the confirmation leaves Plan mode off and reports declined", async () => {
  let asked = 0;
  const fixture = setup({
    confirm: async () => {
      asked += 1;
      return false;
    },
  });
  await startSession(fixture);
  const result = await requestTool(fixture).execute("call-1", {}, undefined, undefined, fixture.context.ctx);

  assert.equal(asked, 1, "the user must be asked exactly once");
  assert.equal(result.details.outcome, "declined");
  await fixture.mock.events.get("agent_settled")?.[0]?.({ aborted: false }, fixture.context.ctx);
  assert.equal(await editBlocked(fixture), false, "a declined request must not enable Plan mode");
});

test("approval does not enter Plan mode during the call, only after the run settles", async () => {
  const fixture = setup({ confirm: async () => true });
  await startSession(fixture);
  const result = await requestTool(fixture).execute("call-2", {}, undefined, undefined, fixture.context.ctx);

  assert.equal(result.details.outcome, "approved");
  // Still inside the tool call: plan mode must not be active yet.
  assert.equal(await editBlocked(fixture), false, "entry must be deferred, not synchronous");

  // The deferred handoff runs on the next macrotask; the settled hook then sees an idle agent.
  await new Promise((resolve) => setTimeout(resolve, 10));
  await fixture.mock.events.get("agent_settled")?.[0]?.({ aborted: false }, fixture.context.ctx);
  assert.equal(await editBlocked(fixture), true, "Plan mode must be active after the run settles");
});

test("approval while the run is still active waits for agent_settled without a busy warning", async () => {
  let idle = false;
  const fixture = setup({ confirm: async () => true, isIdle: () => idle });
  await startSession(fixture);
  const result = await requestTool(fixture).execute("call-5", {}, undefined, undefined, fixture.context.ctx);
  assert.equal(result.details.outcome, "approved");

  // The tool call is still inside an active run. Nothing may try to enter Plan mode yet.
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await editBlocked(fixture), false, "entry must wait for the run to settle");
  assert.equal(
    fixture.context.notifications.some((n) => /Cannot start Plan mode/.test(n.message)),
    false,
    "no busy-run warning may be shown while the run is active",
  );

  idle = true;
  await fixture.mock.events.get("agent_settled")?.[0]?.({ aborted: false }, fixture.context.ctx);
  assert.equal(await editBlocked(fixture), true, "Plan mode must be active once the run settles");
});

test("without a UI the request is refused and nothing is asked or changed", async () => {
  let asked = 0;
  const fixture = setup({
    hasUI: false,
    confirm: async () => {
      asked += 1;
      return true;
    },
  });
  await startSession(fixture);
  const result = await requestTool(fixture).execute("call-3", {}, undefined, undefined, fixture.context.ctx);

  assert.equal(result.details.outcome, "no_ui");
  assert.equal(asked, 0, "no confirmation may be attempted without a UI");
  assert.equal(await editBlocked(fixture), false);
});

test("requesting while Plan mode is already active reports already_active without asking", async () => {
  let asked = 0;
  const fixture = setup({
    confirm: async () => {
      asked += 1;
      return true;
    },
  });
  await startSession(fixture);
  await fixture.mock.commands.get("plan")?.handler("start", fixture.context.ctx);
  assert.equal(await editBlocked(fixture), true, "precondition: /plan enabled Plan mode");

  const result = await requestTool(fixture).execute("call-4", {}, undefined, undefined, fixture.context.ctx);
  assert.equal(result.details.outcome, "already_active");
  assert.equal(asked, 0, "an active Plan mode must not re-prompt the user");
});
