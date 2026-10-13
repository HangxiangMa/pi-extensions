import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { classifyPlanModeTool } from "./tool-policy.js";

// Model-callable request to widen the live Plan-mode tool allowlist mid-run. The allowlist is
// frozen at /plan start from defaultPlanTools, so without this the model can only ask the user
// to exit and restart. Every request is confirmed by the user and limited to tools that are
// already active in Pi and not blocked by the built-in policy.
export const PLAN_MODE_WIDEN_TOOL_NAME = "request_plan_tools";
export const MAX_WIDEN_TOOLS_PER_REQUEST = 8;
// Names that must never be admitted, even when a same-named extension tool is registered.
const NEVER_WIDENABLE = new Set([
  "edit",
  "write",
  "update_plan",
  "plan_mode_question",
  "plan_mode_complete",
  PLAN_MODE_WIDEN_TOOL_NAME,
]);
const MAX_TOOL_NAME_LENGTH = 120;
const MAX_REASON_LENGTH = 500;

export const PLAN_MODE_WIDEN_PARAMS = {
  type: "object",
  additionalProperties: false,
  required: ["tools", "reason"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: MAX_WIDEN_TOOLS_PER_REQUEST,
      description:
        "Exact names of tools to add to the Plan-mode allowlist for the rest of this Plan run. Each must already be active in Pi. Read-only inspection tools only; edit, write, and update_plan are never allowed.",
      items: { type: "string", minLength: 1, maxLength: MAX_TOOL_NAME_LENGTH },
    },
    reason: {
      type: "string",
      minLength: 1,
      maxLength: MAX_REASON_LENGTH,
      description: "One sentence on why these tools are needed. Shown to the user in the confirmation.",
    },
  },
} as const;

export type WidenToolsParseResult = { ok: true; tools: string[]; reason: string } | { ok: false; error: string };

export function normalizeWidenToolsParams(params: unknown): WidenToolsParseResult {
  const record = (params ?? {}) as { tools?: unknown; reason?: unknown };
  if (!Array.isArray(record.tools) || record.tools.length === 0) {
    return { ok: false, error: "tools must be a non-empty array of tool names" };
  }
  if (record.tools.length > MAX_WIDEN_TOOLS_PER_REQUEST) {
    return { ok: false, error: `tools may contain at most ${MAX_WIDEN_TOOLS_PER_REQUEST} names` };
  }
  const tools: string[] = [];
  for (const entry of record.tools) {
    if (typeof entry !== "string" || entry.trim().length === 0 || entry.length > MAX_TOOL_NAME_LENGTH) {
      return { ok: false, error: "each tool name must be a non-empty string of at most 120 characters" };
    }
    const name = entry.trim();
    if (!tools.includes(name)) tools.push(name);
  }
  if (typeof record.reason !== "string" || record.reason.trim().length === 0) {
    return { ok: false, error: "reason must be a non-empty string" };
  }
  return { ok: true, tools, reason: record.reason.trim().slice(0, MAX_REASON_LENGTH) };
}

export type WidenToolsRejection = { name: string; why: string };

// Splits requested names into admissible ones and rejections with a reason. Admissible means:
// registered in Pi, currently active in Pi, and not blocked by the built-in Plan policy.
export function classifyWidenRequest(
  requested: readonly string[],
  allTools: readonly ToolInfo[],
  activeToolNames: ReadonlySet<string>,
  alreadyAllowed: ReadonlySet<string>,
): { admit: string[]; rejected: WidenToolsRejection[] } {
  const admit: string[] = [];
  const rejected: WidenToolsRejection[] = [];
  for (const name of requested) {
    if (NEVER_WIDENABLE.has(name)) {
      rejected.push({ name, why: "never allowed in Plan mode" });
      continue;
    }
    const tool = allTools.find((candidate) => candidate.name === name);
    if (!tool) {
      rejected.push({ name, why: "not registered in Pi" });
      continue;
    }
    if (!activeToolNames.has(name)) {
      rejected.push({ name, why: "not active in Pi; activate it with /plan tools or Pi's tool settings first" });
      continue;
    }
    if (classifyPlanModeTool(tool) === "blocked") {
      rejected.push({ name, why: "blocked by the built-in Plan policy" });
      continue;
    }
    if (alreadyAllowed.has(name)) continue;
    admit.push(name);
  }
  return { admit, rejected };
}

export function widenToolsResult(
  outcome: "widened" | "nothing_new" | "declined" | "rejected" | "no_ui" | "inactive",
  message: string,
  details: Record<string, unknown> = {},
) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: { version: 1, source: PLAN_MODE_WIDEN_TOOL_NAME, outcome, ...details },
  };
}
