import assert from "node:assert/strict";
import { test } from "vitest";
import planMode from "../src/plan-mode.js";
import { builtinTool, createMockContext, createMockPi, extensionTool } from "./support.js";

type ToolCallResult = { block?: boolean; reason?: string } | undefined;
type PlanToolsAdapter = {
  rows(): Array<{ name: string; label: string; allowed: boolean }>;
  apply(change: { add: string[]; remove: string[] }, ctx: unknown): void;
};

const ALL_TOOLS = [
  builtinTool("read"),
  builtinTool("grep"),
  builtinTool("bash"),
  builtinTool("edit"),
  builtinTool("write"),
  builtinTool("update_plan"),
  extensionTool("subagent_routed"),
  extensionTool("inactive_tool"),
];

// Starts Plan mode, then captures the planTools adapter that /plan's running menu receives.
async function startWithAdapter(options: { configured?: string[]; activeTools: string[] }) {
  const captured: { adapter?: PlanToolsAdapter } = {};
  const mock = createMockPi({ activeTools: options.activeTools, allTools: ALL_TOOLS as never[] });
  planMode(mock.pi, {
    readSettings: async () => ({
      kind: "loaded" as const,
      settings: {
        thinkingLevel: "inherit" as const,
        ...(options.configured === undefined ? {} : { defaultPlanTools: options.configured }),
      },
    }),
    loadInteractiveUi: async () =>
      ({
        showPlanModeMenu: async (_ctx: unknown, menu: { planTools?: PlanToolsAdapter }) => {
          captured.adapter = menu.planTools;
        },
        showPlanLaunchMenu: async () => {},
      }) as never,
  });
  const context = createMockContext({ hasUI: true });
  await mock.events.get("session_start")?.[0]?.({ reason: "startup" }, context.ctx);
  await mock.commands.get("plan")?.handler("start", context.ctx);
  await mock.commands.get("plan")?.handler("", context.ctx);
  assert.ok(captured.adapter, "the /plan menu must receive a planTools adapter");
  return { mock, context, adapter: captured.adapter };
}

async function callTool(fixture: Awaited<ReturnType<typeof startWithAdapter>>, toolName: string, input: unknown = {}) {
  return fixture.mock.events.get("tool_call")?.[0]?.(
    { toolName, input },
    fixture.context.ctx,
  ) as Promise<ToolCallResult>;
}

test("rows list only active tools, never helpers, blocked built-ins, or inactive extensions", async () => {
  const fixture = await startWithAdapter({
    configured: ["read"],
    activeTools: ["read", "grep", "bash", "edit", "subagent_routed"],
  });
  const names = fixture.adapter?.rows().map((row) => row.name) ?? [];
  assert.ok(names.includes("grep") && names.includes("bash") && names.includes("subagent_routed"));
  assert.ok(!names.includes("edit"), "edit is blocked by the built-in policy");
  assert.ok(!names.includes("update_plan"), "update_plan is never a Plan tool");
  assert.ok(!names.includes("plan_mode_question") && !names.includes("plan_mode_complete"), "helpers are excluded");
  assert.ok(!names.includes("inactive_tool"), "inactive tools are not listed");
});

test("rows mark currently allowed tools so the draft starts from the live policy", async () => {
  const fixture = await startWithAdapter({ configured: ["read"], activeTools: ["read", "grep", "bash"] });
  const byName = Object.fromEntries((fixture.adapter?.rows() ?? []).map((row) => [row.name, row.allowed]));
  assert.equal(byName.read, true);
  assert.equal(byName.grep, false);
  assert.equal(byName.bash, false);
});

test("apply(add) widens the live policy so a previously blocked tool is admitted", async () => {
  const fixture = await startWithAdapter({ configured: ["read"], activeTools: ["read", "grep", "bash"] });
  assert.match((await callTool(fixture, "grep", {}))?.reason ?? "", /not selected by the Plan policy/);
  fixture.adapter?.apply({ add: ["grep"], remove: [] }, fixture.context.ctx);
  assert.equal(await callTool(fixture, "grep", {}), undefined);
});

test("apply(remove) blocks a tool and clears the stale frozen-policy reason", async () => {
  // The /plan start freezes grep as an explicit selection; removing it must also clear
  // desiredNames, otherwise the guard would report the wrong "frozen policy" reason.
  const fixture = await startWithAdapter({ configured: ["read", "grep"], activeTools: ["read", "grep"] });
  assert.equal(await callTool(fixture, "grep", {}), undefined);
  fixture.adapter?.apply({ add: [], remove: ["grep"] }, fixture.context.ctx);
  const reason = (await callTool(fixture, "grep", {}))?.reason ?? "";
  assert.match(reason, /not selected by the Plan policy/);
  assert.doesNotMatch(reason, /froze its tool policy/, "removal must clear desiredNames");
});

test("removal never re-enables a blocked built-in and never touches helpers", async () => {
  const fixture = await startWithAdapter({ configured: ["read"], activeTools: ["read", "edit"] });
  fixture.adapter?.apply({ add: ["edit"], remove: [] }, fixture.context.ctx);
  assert.equal((await callTool(fixture, "edit", { path: "a.txt" }))?.block, true, "edit stays blocked");
});

test("apply is a no-op after Plan mode ends", async () => {
  const fixture = await startWithAdapter({ configured: ["read"], activeTools: ["read", "grep"] });
  await fixture.mock.commands.get("plan")?.handler("exit", fixture.context.ctx);
  fixture.adapter?.apply({ add: ["grep"], remove: [] }, fixture.context.ctx);
  assert.equal(fixture.adapter?.rows().length ?? 0, 0, "no rows once Plan mode is inactive");
});
