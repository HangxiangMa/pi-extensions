# pi-plan-mode compaction persistence plan

## Goal

Keep an accepted implementation plan available verbatim to the model across manual, threshold, and
overflow compaction while that plan is active, without relying on the lossy compaction summary or
leaving an obsolete plan in later unrelated work.

## Context

Issue #471 was reproduced against Pi 0.83.0 and the current `pi-plan-mode` behavior. After
`/plan implement`, the extension persists `{ enabled: false, awaitingAction: false }` and clears
`latestPlan`; once the ordinary implementation handoff ages out of Pi's recent-message window,
compaction preserves only whatever the summarizer chooses. A live default-window smoke retained the
marker `PLAN-PERSIST-TEST-42` but not the complete plan, and verbatim recall returned
`PLAN_UNAVAILABLE`.

The exact short-session report needs qualification: with Pi's default `keepRecentTokens: 20000`, the
small controlled session had nothing to compact. The failure is reproducible after the handoff ages
into the summarized span, which is the long-implementation case the issue is concerned with.

Applicable repository rules are the state, command/menu, lifecycle, status, documentation, and
runtime-verification sections of `docs/extension-conventions.md`. Extension settings are not touched;
`docs/extension-settings.md` was reviewed to avoid adding an unnecessary configuration surface.

## Architecture

Model Plan mode as four states rather than treating implementation as ordinary off mode:

```text
planning -> ready -> implementing -> cleared/superseded
```

- Keep `latestPlan` as the ready-to-implement plan owned by active Plan mode.
- Add a persisted `activeImplementation` value containing an id, the exact normalized plan, its
  completion source, and its start time. It remains valid even when `enabled` is false.
- On successful `/plan implement`, move the ready plan into `activeImplementation` before sending the
  handoff so every continuation sees a coherent state; restore the exact ready state if delivery
  fails.
- In the `context` hook, first remove stale extension-owned execution-context messages. If the exact
  implementation handoff remains in context, use it without duplication. Otherwise insert one
  canonical hidden custom message containing the exact active plan after leading summary messages
  and before retained conversation messages.
- Keep the implementation active until the user clears it with the existing `/plan exit` or
  `/plan off` route, begins a superseding Plan-mode workflow, or implements a replacement plan.
  `/plan show` must display either the ready plan or the active implementation plan.
- Surface the state as `plan implementing` and offer Show, Start a new plan, and Clear actions when
  `/plan` is opened interactively during implementation. Existing direct routes remain available for
  non-TUI use.
- Restore `activeImplementation` from the latest branch-local state entry on session start, including
  resume, reload, fork, and post-compaction sessions. Compaction summaries remain untouched.

This uses `context`, which runs before every model call, rather than relying only on
`before_agent_start`; queued follow-ups and same-run post-compaction calls are therefore covered.

## Non-Goals

- Do not replace Pi's compaction summarizer or generate a custom summary.
- Do not add `persistPlanAcrossCompaction` or another user setting; reliable active-plan context is
  correctness behavior, not an opt-in preference.
- Do not parse arbitrary Markdown into progress steps or infer completion from assistant prose,
  `agent_end`, or `agent_settled`.
- Do not add an implementation-completion tool in this change; explicit clear/supersede semantics are
  the bounded first contract.

## Assumptions

- An accepted plan remains active across multiple user turns until explicitly cleared or superseded.
- A plan may contain up to the existing 50,000-character completion limit, so duplicate context
  injection must be avoided while the original handoff is still present.
- Pi compaction appends a branch entry without deleting older branch-local custom state; the extension
  still reconstructs from the active branch rather than process-global storage.

## Risks

- A user who forgets to clear a completed plan could retain stale instructions. Mitigate this with a
  visible `plan implementing` status, active-plan menu actions, documented `/plan exit`, and automatic
  supersession when a new Plan-mode workflow starts.
- Injecting a custom message at the wrong location could disturb assistant/tool-result adjacency.
  Insert it only outside tool-call/result sequences and cover compaction-summary, ordinary-turn, and
  tool-turn message layouts in tests.
- A failed or stale implementation handoff could leave tools and state inconsistent. Treat state,
  tool restoration, thinking-level restoration, persistence, and delivery rollback as one tested
  transition.
- State-shape changes could revive invalid or oversized plans from old sessions. Reuse the existing
  plan normalization and fail closed while preserving unrelated tool-selection state.

## Plan

- [x] Add a focused Issue #471 regression test under `extensions/pi-plan-mode/test/` that starts from
  a completed plan, invokes implementation, feeds the `context` hook a post-compaction message set,
  and proves the exact plan is currently absent; `npm test` failed as expected with `2 !== 3` because
  no canonical plan block was injected (an unrelated pi-image-drop timing test also failed).
- [x] Extend `extensions/pi-plan-mode/src/state.ts` with validated branch-persisted
  `activeImplementation` restoration that works while `enabled` is false and ignores malformed,
  empty, or oversized values without changing legacy ready-plan behavior; focused restore, mixed,
  resume, clear/fork-shaped, legacy, and invalid-state tests pass in `issue-471-repro.test.ts`.
- [x] Refactor the implementation transition in `extensions/pi-plan-mode/src/plan-mode.ts` so
  `/plan implement` atomically moves the ready plan to active implementation state before delivery,
  restores normal tools/thinking, and rolls back to the exact ready state on synchronous delivery
  failure; success, busy follow-up, stale-context rollback, and repeated-command tests pass.
- [x] Add canonical active-plan message construction and stale-message filtering to
  `extensions/pi-plan-mode/src/message-transform.ts`, then update the `context` handler to avoid a
  duplicate while the exact handoff exists and to inject one exact hidden block after compaction
  removes it; byte-exact preservation, summary-only context, repeated calls, tool adjacency, and
  stale-block cleanup pass focused tests.
- [x] Update `/plan show`, `/plan exit`, `/plan off`, no-argument interactive menu behavior, new-plan
  entry, status text, widget cleanup, and replacement-plan handling in `plan-mode.ts` so active plans
  are discoverable and have deterministic clear/supersede semantics; TUI, RPC, direct, headless,
  cancellation, clear, and replacement tests pass without removing existing routes.
- [x] Audit session lifecycle handling in `plan-mode.ts` so resume, reload, fork, session replacement,
  shutdown, manual compaction, and same-run auto-compaction cannot retain stale contexts or lose the
  active plan; branch reconstruction, repeated-start/shutdown, summary-only, busy-follow-up, and
  repeated context-boundary tests pass.
- [x] Update `extensions/pi-plan-mode/README.md` to document `plan implementing`, persistence across
  compaction/resume, `/plan show` and `/plan exit` behavior during implementation, explicit lifetime,
  supersession, and token-cost implications; documented commands and statuses match focused tests and
  source.
- [x] Run `npm test`, `npm run typecheck`, and `npm run check`, fixing only failures caused by this
  change; all passed, with the final `npm run check` reporting 1,867 passing tests and no failures.
- [x] Run an isolated headless Pi SDK smoke with `pi-plan-mode`, Pi's default 20k recent-token window,
  a 99,000-character aged handoff, real compaction, and `openai-codex/gpt-5.6-sol`; the next request
  contained one byte-exact canonical block, recalled the plan verbatim, and contained zero canonical
  blocks after `/plan exit`.
- [x] Review the final diff against the state, command/menu, asynchronous lifecycle, status, docs, and
  verification MUST rules in `docs/extension-conventions.md`; the persisted branch state, existing
  direct routes, owner-cancelled menu, stable status/widget cleanup, English README, focused tests,
  full gate, runtime smoke, and package dry run satisfy the touched rules with no accepted deviation.

## Completion Checklist

- [x] The exact approved plan reaches every implementation model call before and after all Pi
  compaction reasons without depending on summary wording.
- [x] Ready, implementing, clear, supersede, delivery-failure, resume, reload, fork, replacement, and
  shutdown transitions have deterministic tests.
- [x] Existing `/plan`, `/plan <prompt>`, `show`, `finalize`, `implement`, `exit`, `off`, and `tools`
  routes remain compatible and documented.
- [x] No extension setting, custom summarizer, brittle prose-completion inference, or duplicate plan
  block was introduced.
- [x] `npm run check` and the isolated post-compaction runtime smoke pass with a clean intended diff.
