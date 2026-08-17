# Pi Subagents Main-Agent-Led Delegation Guidance Plan

## Goal

Align `pi-subagents` documentation and prompt guidance with the current rule that the main agent decides task decomposition and retains overall delivery ownership.

Keep immediate critical-path work, integration, final verification, and the final answer in the main agent.

Keep built-in roles minimal: `explorer` for read-only repository exploration and `worker` for bounded write-capable implementation slices when delegation creates real concurrency.

## Context

The extension no longer owns a planner subagent, reviewer subagent, worker aliases, or the `subagent_auto` workflow planner.

Review guidance should point to the main agent, review skills, deterministic checks, or custom user/project agents instead of a built-in reviewer.

Planning guidance should point to the main agent or explicit caller-authored `subagent.workflow` payloads instead of a built-in planner.

`explorer` has no `bash` by default so it remains a true read-only built-in and preserves the automatic in-process route.

A single async worker may directly implement a bounded slice only when the main agent immediately continues named non-overlapping work and the result has a supported delivery and integration path.

If no such main-agent work exists, moving one implementation task to a worker adds coordination without parallel progress.

Two or more workers may justify delegation for disjoint implementation slices while the main agent coordinates and owns integration.

Current detached guidance says to do useful local work after spawning, but its fallback to announcing the spawn and ending the response can still permit the idle-main-agent behavior this plan must remove.

This plan owns the delegation rubric and its prompt, README, and example wording.

The async-first tool-surface plan consumes the completed rubric and separately owns registration modes, settings defaults, compatibility, and migration decisions.

**Audit baseline:**

- Blocking guidance is defined in `src/subagents.ts` and covered by `test/subagents-registration.test.ts` plus mode checks in `test/subagents-settings-ui.test.ts`.
- Detached guidance is defined in `src/stateful-guidance.ts`, the spawn result in `src/stateful.ts`, and shared-write recovery in `src/stateful-safety.ts`, with coverage in `test/stateful-tool-registration.test.ts`, `test/subagents-settings-ui.test.ts`, `test/in-process-transport.test.ts`, and `test/stateful-utilities-and-settings.test.ts`.
- Consultation guidance is defined in `src/consult-registration.ts` and covered by `test/consult.test.ts`.
- Built-in role wording is defined in `src/agents/built-ins.ts`, projected through the session catalog, and covered by `test/agents.test.ts` plus `test/subagents-agent-catalog.test.ts`.
- User guidance is concentrated in `packages/pi-subagents/README.md`; settings labels describe tool availability rather than decomposition policy and require no behavior change.
- Dated research under `docs/research/` discusses historical planner and reviewer architectures without claiming active built-ins and now carries an explicit current-surface notice where those role names appear.

## Non-Goals

- Do not reintroduce built-in `planner`, `reviewer`, `general`, or `general-purpose` roles.
- Do not add extension-owned objective-to-DAG planning.
- Do not make project agents available without existing trust and confirmation behavior.
- Do not add a runtime planner, automatic topology selector, or unverifiable worker-count heuristic.
- Do not remove the explicit single-worker escape hatch without concurrent main-agent work when the user requests a specialist model, tool profile, or isolation boundary.
- Do not change runtime behavior unless a task in this plan explicitly calls for prompt or README behavior changes.

## Plan

- [x] Audit `packages/pi-subagents/README.md`, tool descriptions, prompt snippets, prompt guidelines, settings UI labels, and implementation notes for stale built-ins, extension-owned planning, unbounded worker implementation advice, or permission for the main agent to stop immediately after one async spawn; the audit baseline above records each defining source and test.
- [x] Rewrite the main delegation rubric around direct main-agent work, bounded `explorer` evidence, one async `worker` beside named non-overlapping main-agent work, two or more workers with disjoint implementation ownership, and explicit custom-agent exceptions.
- [x] Update detached prompt metadata so one worker requires useful immediate main-agent work and a supported delivery and integration path; instruct the main agent not to merely announce the spawn, wait, poll, duplicate the child task, or end while that local work remains.
- [x] Remove guidance that treats announcing one spawn and ending the response as the fallback when the main agent has no local work; direct the main agent to perform single-lane implementation itself, except for an explicit specialist model, tool profile, or isolation requirement.
- [x] Keep final-answer-dependent async guidance tied to opt-in `auto-resume`, and keep default `next-turn` delegation limited to work the current response does not require.
- [x] Update review examples to prefer the main agent plus review skill for ordinary PR review, and custom verifier agents only when an explicit workflow or panel needs an independent child role.
- [x] Update planning examples to prefer main-agent-authored plans and explicit `subagent.workflow` graphs when a graph is genuinely needed.
- [x] Document that `explorer` omits `bash` intentionally, while users can create a custom read-mostly shell-capable agent if they accept write-capable transport classification.
- [x] Ensure `subagent_inspect` output and README catalog examples show only `explorer` and `worker` as built-ins.
- [x] Add focused tests proving mode-specific prompt metadata states the one-worker main-agent continuation rule, omits unavailable tools, and preserves the explicit specialist escape hatch; 83 focused tests and all 399 `pi-subagents` tests pass.
- [x] Run focused documentation and registration tests, `npm run check`, and `git diff --check`; `just pack subagents` includes the expected README, source, manifest, and license, and `.changeset/align-subagent-delegation-guidance.md` records the published patch behavior. The first root gate hit one unrelated `pi-worktree` selection-test failure; that test passed alone and the complete gate then passed on rerun.

## Completion Checklist

- [x] No active documentation suggests that `planner`, `reviewer`, `general`, `general-purpose`, or `subagent_auto` are available built-ins.
- [x] Historical research documents are clearly marked when they mention removed roles or removed automation surfaces.
- [x] Current user guidance explains when to use `explorer`, one async `worker`, multiple workers, a custom agent, or no subagent.
- [x] One ordinary implementation task stays in the main agent when spawning would leave it without useful non-overlapping work.
- [x] A one-worker async example shows the main agent's concurrent responsibility and supported result-delivery path.
- [x] Worker implementation guidance requires bounded ownership, while multi-worker guidance additionally requires disjoint write scopes and main-agent integration.
- [x] Review and planning examples do not imply extension-owned planning or a built-in review role.
- [x] Prompt metadata, README examples, and inspect/catalog behavior agree.
- [x] Required checks pass: focused tests, all package tests, `npm run check`, `git diff --check`, and `just pack subagents`.
