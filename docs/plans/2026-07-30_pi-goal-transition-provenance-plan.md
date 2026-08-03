# pi-goal Stopped-Transition Provenance Plan

## Goal

Deliver Phase 2 of `docs/roadmaps/pi-goal-cross-extension-supervision-roadmap.md`: make the source
and cause of every stopped Goal state authoritative, machine-readable, and durable across reload so
integrations can distinguish operator intent from recoverable or system-originated stops.

## Context

- `GoalStateEventPayload` currently contains `goalId`, `status`, `summary?`, and `reason?` in
  `extensions/pi-goal/src/runtime.ts`.
- Human-readable terminal details are held outside `ActiveGoal` and deliberately cleared across
  session bindings; `goal-rpc.test.ts` verifies an old reason does not leak into a restored Goal.
- `ActiveGoal.safetyPauseCause` persists only `continuation_limit` or `no_progress` and cannot explain
  command pause, RPC pause, interruption, unavailable tools, provider limits, blocked reports,
  terminal errors, budgets, clears, or failed activation rollback.
- Stopped transitions are initiated from `commands.ts`, `runtime.ts`, and `goal.ts`. Adding metadata
  independently at each event emission would allow state and provenance to diverge.
- This plan depends on the access policy delivered by the Phase 1 plan. Provenance remains canonical
  internally even when state observation is disabled.

## Architecture

Add a JSON-safe discriminated transition-provenance type owned by Goal persistence. The final source
and cause names must be frozen by the first plan item, but the taxonomy must cover at least:

- explicit operator pause and RPC-owned pause;
- agent interruption;
- automatic-response and no-progress safety pauses;
- unavailable terminal tools;
- provider usage exhaustion and token-budget exhaustion;
- model-proposed `goal_blocked` and terminal agent-error blocking;
- explicit clear and activation rollback.

Persist provenance only when it describes the current stopped Goal instance. Active, queued, and
completed states do not retain stale stopped provenance. Clear and failed-activation events have no
remaining `ActiveGoal`, so their event builder receives an exact transition value at the clear
boundary rather than storing orphan state.

Legacy stopped entries without provenance remain loadable. A legacy safety pause may be derived from
`safetyPauseCause`; every other unclassified legacy stop receives an explicit conservative
`legacy_unknown` classification that is never eligible for automatic supervisor resume. Existing
human-readable `reason` and completion `summary` semantics remain separate from the stable machine
classification.

Introduce one transition helper or narrow runtime operation that requires provenance whenever a Goal
enters a stopped status. Do not turn the helper into a second persistence layer: the runtime remains
responsible for persistence and state-event publication, and existing command/tool owners retain
their domain validation.

The additive state-event shape should use one optional nested field, for example
`transition: { source, cause }`, so future compatible details can grow without adding unrelated
root-level fields. The exact public field and enum names are fixed and documented before production
code changes.

## Non-Goals

- Add Resume RPC or decide which new stopped states a supervisor may resume.
- Persist free-form provider errors, blocker evidence, or operator guidance as provenance.
- Rewrite historical session entries or backfill information that cannot be derived safely.
- Remove `safetyPauseCause` before all internal UI and migration consumers have a proven replacement.
- Change Goal status names, blocker validation, queue semantics, or state-event channels.

## Unknowns

- Whether a stopped Goal edited without reactivation should preserve its prior stop provenance or
  record a distinct stopped-edit cause must be resolved in the transition matrix.
- Whether unavailable tools discovered during session restore should be classified as a restore
  source or the same Goal-safety source as a live loss must be decided before enum names become
  public.
- Completion is terminal but not stopped. This phase must decide whether completion receives
  provenance now or remains represented only by `summary`; the decision must not widen the Resume
  safety scope.

## Risks

- An incomplete transition matrix can silently emit stale or missing provenance on rare rollback,
  queue, retry, or settings-driven paths.
- Spreading provenance updates across callers can leave persisted state, emitted state, and UI status
  inconsistent. Enforce the stopped-state invariant in one helper and test every caller.
- Strict validation of a new optional field could reject legacy or forward-compatible entries. Keep
  absence valid, reject malformed recognized provenance conservatively, and preserve unknown fields.
- Reusing human-facing `reason` values as enum names would make wording changes break integrations.
  Keep stable codes and display text separate.

## Rollback / Recovery

- The persisted field is optional. An older version should ignore and preserve it through object
  spreading; reverting this phase must not make existing Goal entries unreadable.
- If provenance validation fails on one entry, preserve the last known safe Goal behavior and surface
  the existing invalid-state handling rather than inventing a resumable classification.
- A failed settings or runtime operation that restores a Goal snapshot must restore its matching
  provenance atomically with status, Goal ID, safety counters, and continuation ownership.

## Plan

- [ ] Build a stopped-transition matrix in this plan and corresponding table-driven fixtures in
      `extensions/pi-goal/test/goal-rpc.test.ts`, naming every current source path, resulting status,
      source/cause code, persistence expectation, edit/rotation behavior, and legacy fallback; resolve
      the three listed unknowns and verify repository search finds no unclassified stopped transition.
- [ ] Add failing persistence cases to `extensions/pi-goal/test/persistence.test.ts` for valid
      provenance, malformed recognized values, legacy absence, `safetyPauseCause` derivation,
      `legacy_unknown`, queues, and unknown-field compatibility; verify the failures precede changes
      to `persistence.ts`.
- [ ] Extend `extensions/pi-goal/src/persistence.ts` with the finalized JSON-safe provenance type,
      validation, normalization, and legacy derivation while preserving current session shapes; verify
      persistence and existing queue/session restore tests pass.
- [ ] Add a provenance-aware stopped-transition helper in `extensions/pi-goal/src/runtime.ts` and
      migrate command pause, RPC pause, safety pause, unavailable tools, budget limit, blocker tool,
      interruption, retry exhaustion, clear, and activation rollback callers in `commands.ts`,
      `runtime.ts`, and `goal.ts`; verify a typecheck or exhaustive test fails if a new stopped call
      omits provenance.
- [ ] Extend `buildGoalStateEvent()` and clear-event publication with the additive nested transition
      field, gated only by the Phase 1 observation policy; verify table-driven event tests prove active
      state has no stale transition and rotated, replaced, queued, completed, and cleared Goals cannot
      inherit unrelated provenance.
- [ ] Add reload, fork/branch, session replacement, stopped edit, resume, and failed-delivery rollback
      regressions to `goal-rpc.test.ts`, `goal.test.ts`, and `goal-queue.test.ts` as applicable; verify
      canonical provenance follows the active branch and exact Goal instance while free-form terminal
      details retain their existing non-leak behavior.
- [ ] Update `extensions/pi-goal/README.md` with the public event shape, complete source/cause table,
      legacy `legacy_unknown` semantics, and the rule that consumers never parse `reason`; verify the
      documentation examples match exported TypeScript types and deterministic tests.
- [ ] Audit every stopped-state writer, post-`await` rollback, session reload, queue transition, and
      settings snapshot against the roadmap and extension conventions; run the pi-goal workspace
      check and runtime smoke, root `npm test`, root `npm run check`, `just pack-goal`, and
      `git diff --check`, recording the transition-matrix evidence in the completed plan.

## Completion Checklist

- [ ] Every documented current stopped transition has one stable source/cause classification and a
      deterministic test.
- [ ] Provenance survives reload and branch reconstruction only with its matching Goal instance.
- [ ] Legacy stopped Goals remain loadable and default conservatively when provenance is unavailable.
- [ ] Active, queued, completed, rotated, replaced, and cleared state cannot expose stale stopped
      provenance.
- [ ] Existing summary/reason behavior, statuses, blocker audit, queue behavior, and access policy
      remain compatible.
- [ ] README, persisted schema, event payload types, focused tests, runtime smoke, package contents,
      and repository gates agree on the delivered contract.
