# Pi Subagents Main-Agent-Led Delegation Guidance Plan

## Goal

Align `pi-subagents` documentation and prompt guidance with the current rule that the main agent decides task decomposition.

Keep built-in roles minimal: `explorer` for read-only repository exploration and `worker` for implementation or command execution.

## Context

The extension no longer owns a planner subagent, reviewer subagent, worker aliases, or the `subagent_auto` workflow planner.

Review guidance should point to the main agent, review skills, deterministic checks, or custom user/project agents instead of a built-in reviewer.

Planning guidance should point to the main agent or explicit caller-authored `subagent.workflow` payloads instead of a built-in planner.

`explorer` has no `bash` by default so it remains a true read-only built-in and preserves the automatic in-process route.

## Non-Goals

- Do not reintroduce built-in `planner`, `reviewer`, `general`, or `general-purpose` roles.
- Do not add extension-owned objective-to-DAG planning.
- Do not make project agents available without existing trust and confirmation behavior.
- Do not change runtime behavior unless a task in this plan explicitly calls for prompt or README behavior changes.

## Plan

- [ ] Audit `packages/pi-subagents/README.md`, tool descriptions, prompt snippets, prompt guidelines, settings UI labels, and implementation notes for stale references to removed built-ins or extension-owned planning.
- [ ] Rewrite the main delegation rubric around three choices: do it in the main agent, ask `explorer` to gather bounded evidence, or ask `worker` or a custom agent to execute a self-contained task.
- [ ] Update review examples to prefer the main agent plus review skill for ordinary PR review, and custom verifier agents only when an explicit workflow or panel needs an independent child role.
- [ ] Update planning examples to prefer main-agent-authored plans and explicit `subagent.workflow` graphs when a graph is genuinely needed.
- [ ] Document that `explorer` omits `bash` intentionally, while users can create a custom read-mostly shell-capable agent if they accept write-capable transport classification.
- [ ] Ensure `subagent_inspect` output and README catalog examples show only `explorer` and `worker` as built-ins.
- [ ] Add focused tests only when prompt metadata or rendered output changes.
- [ ] Run focused documentation/rendering tests, `npm run check`, and `git diff --check` if any package docs or prompt metadata changes.

## Completion Checklist

- [ ] No active documentation suggests that `planner`, `reviewer`, `general`, `general-purpose`, or `subagent_auto` are available built-ins.
- [ ] Historical research documents are clearly marked when they mention removed roles or removed automation surfaces.
- [ ] Current user guidance explains when to use `explorer`, `worker`, a custom agent, or no subagent.
- [ ] Review and planning examples do not imply extension-owned planning or a built-in review role.
- [ ] Prompt metadata, README examples, and inspect/catalog behavior agree.
- [ ] Required checks pass or are explicitly recorded as not run for documentation-only work.
