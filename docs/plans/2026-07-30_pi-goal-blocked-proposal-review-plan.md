# pi-goal Blocked-Proposal Review Plan

## Goal

Conditionally deliver Phase 5 of
`docs/roadmaps/pi-goal-cross-extension-supervision-roadmap.md`: allow one admitted, explicitly
enabled supervisor to review a fully validated `goal_blocked` proposal before it becomes durable,
without weakening the blocker audit or making terminal progress depend indefinitely on a listener.

## Context

- This plan is not admitted for execution until Phase 4 records **Admit** for blocked-proposal review
  and identifies the validating consumer and protocol constraints.
- `goal_blocked` currently validates run ownership, pending skip, exact Goal ID, active status, bounded
  reason/evidence, and `repeated_turns >= 3`, then immediately cancels continuation/recovery work,
  blocks stale tools, persists `blocked`, and returns a terminating result.
- Pi's `EventBus.emit()` is synchronous only for listener invocation; listener callbacks are wrapped
  asynchronously, their promises are not awaited by `emit()`, failures are isolated, and the API has
  no listener-count method. No-listener behavior therefore requires an explicit immediate claim
  handshake rather than an unconditional review timeout.
- Phase 1–3 settings, provenance, and supervisor access must already be complete.

## Architecture

The Phase 4 admission record must finalize channel names and bounds. The expected protocol has three
steps:

1. `pi-goal` emits a JSON proposal with a unique `proposalId`, exact `goalId`, validated reason,
   evidence, recurrence count, and a request-scoped claim channel.
2. A listener that is already registered claims synchronously before the proposal emission returns.
   The first valid claim owns the proposal; no claim means the current `blocked` transition proceeds
   immediately with no timer or visible delay.
3. A claimed reviewer sends one bounded decision on a proposal-scoped reply channel before timeout:
   allow the original block, or defer it once with bounded guidance under the admitted policy.

The event bus is not an authorization system. User settings grant `pi-goal` permission to offer a
proposal only when access is `supervisor` and `blockedProposalReview` is enabled. The coordinator
owns proposal IDs, first-claim arbitration, timeout, cancellation, session generation, policy
revocation, and waiter cleanup. `goal.ts` remains the owner of blocker validation and final tool
result; `GoalRuntime` remains the only state writer.

A review occurs only after every existing `goal_blocked` validation succeeds. Invalid blocker calls
never emit proposals. Timeout, malformed decision, listener failure, policy downgrade, replacement,
shutdown, or exceeded deferral allowance resolves to the original durable `blocked` transition.

A defer decision must have one explicit run-boundary behavior chosen in Phase 4: either return a
non-terminating tool result with guidance or terminate the current run and schedule one owned
continuation. It must not permit an immediate same-run proposal loop. The exact maximum deferrals,
timeout, and guidance length come from the admission decision rather than being invented here.

## Non-Goals

- Review ordinary clarification, terminal provider errors, retry exhaustion, usage limits, budgets,
  or invalid `goal_blocked` calls.
- Lower the three-turn recurrence requirement or stale Goal-ID guard.
- Let multiple supervisors vote, race policy decisions, or retain a proposal after its session ends.
- Persist pending review ownership across reload.
- Add continuation hold/release as part of blocker review.
- Allow a reviewer to mark a Goal complete or mutate its objective, budget, queue, or settings.

## Unknowns

The Phase 4 admission record must resolve these before implementation:

- exact request, claim, and reply channels plus payload versioning;
- timeout, guidance length, and maximum deferral count;
- first-claim identity and duplicate-claim response semantics;
- defer tool-result termination and next-run behavior;
- whether deferral count persists with the Goal safety epoch and how resume/edit resets it.

## Risks

- Awaiting every proposal would add latency when no supervisor is installed. Require an immediate
  synchronous claim and prove no-listener equivalence.
- A reviewer can create unbounded token use by repeatedly vetoing a valid blocker. Enforce the admitted
  deferral bound in canonical Goal state or an equally durable safety epoch.
- State can change while a claimed review is pending. Revalidate session, Goal ID, status, run
  ownership, pending skip, policy, and cancellation after the wait.
- Returning a non-terminating tool result can let the model call `goal_blocked` again in the same run.
  The admitted run-boundary design must prevent that loop.
- Event-listener failures are logged by Pi and cannot be awaited directly. The proposal coordinator
  must own timeout and fallback rather than relying on listener exceptions.

## Rollback / Recovery

- The setting and event channels are additive and default off. Reverting the phase restores immediate
  blocking; optional retained deferral counters must be ignored safely by older versions.
- Disabling review, downgrading access, replacing the session, or shutting down resolves every owned
  proposal to the original block and releases its timer and waiter exactly once.
- A failed settings save restores the prior effective permission. Runtime policy changes occur only
  after durable save through the existing settings transaction.

## Plan

- [ ] Verify Phase 4 recorded **Admit** for blocked-proposal review and copy the consumer reference,
      exact channel schema, timeout, guidance, deferral, claimant, and run-boundary decisions into this
      plan; if the gate did not pass, mark every remaining item not applicable with the roadmap
      decision as evidence and do not change production code.
- [ ] Add a real-`createEventBus()` characterization suite proving synchronous listener invocation,
      asynchronous handler non-awaiting, isolated listener failure, first-claim ordering, unsubscribe,
      and no listener-count API; verify the selected claim handshake works without delaying an
      unclaimed proposal.
- [ ] Add failing settings and UI cases for `blockedProposalReview`, its default-off value,
      `supervisor` dependency, trusted-extension warning, immediate policy downgrade, save rollback,
      invalid file, and unknown-field preservation; verify the cases fail before changing the schema.
- [ ] Extend `settings.ts` and `settings-ui.ts` with the admitted permission while preserving one-level
      settings discoverability and existing transaction semantics; verify lower access cannot leave
      the permission effective and no active Goal changes merely because the setting toggles.
- [ ] Add failing protocol tests for absent listener, first/duplicate claims, allow, defer, timeout,
      invalid payload, listener throw, policy revocation, cancellation, replacement, shutdown, stale
      Goal, pending skip, and maximum deferrals; verify unclaimed and failure cases expect the exact
      current `blocked` state and terminating result.
- [ ] Implement a focused session-owned blocked-review coordinator with unique proposal IDs,
      first-claim ownership, bounded wait, abortable timer, generation checks, and idempotent cleanup;
      verify its unit tests pass without adding proposal state to `goal.ts` or a second Goal writer.
- [ ] Insert the coordinator after all current `goal_blocked` validation and before terminal mutation,
      then implement the admitted allow/defer run-boundary behavior with full post-wait revalidation;
      verify invalid blocker calls emit no proposal and no stale decision can mutate a replaced Goal.
- [ ] Add integration regressions for blocker-audit preservation, deferral epoch/reset semantics,
      stale-tool blocking, usage accounting, queue skip, parallel tool batches, settings downgrade,
      reload, and no-listener behavioral equivalence; verify no path creates an unbounded same-run or
      cross-run blocker loop.
- [ ] Update `extensions/pi-goal/README.md` with opt-in settings, JSON channels, bounds, first-claim
      rule, no-listener behavior, timeout/failure fallback, and security limitations; verify examples
      match the admitted consumer and deterministic tests.
- [ ] Audit cancellation, proposal disposal, replacement, shutdown, every post-`await` state use,
      settings mutation ordering, and public contract compatibility; run focused tests, the pi-goal
      workspace check and runtime smoke, root `npm test`, root `npm run check`, `just pack-goal`, the
      admitted consumer smoke/dry run, and `git diff --check` before handoff.

## Completion Checklist

- [ ] Phase 4 evidence explicitly admits this capability and supplies every required bound and
      ownership decision, or the plan is completed as an evidence-backed deferral without code.
- [ ] Only fully valid `goal_blocked` calls can produce a proposal, and the existing audit remains
      unchanged.
- [ ] No listener, timeout, failure, invalid response, revocation, replacement, or shutdown preserves
      the current durable blocked outcome without a leaked waiter or timer.
- [ ] Deferral is bounded and cannot create an immediate or indefinite blocker-proposal loop.
- [ ] One supervisor owns one proposal, and stale or duplicate claims and decisions are inert.
- [ ] Settings, README, consumer contract, deterministic lifecycle tests, runtime smokes, package dry
      runs, and repository gates agree on the final admitted behavior.
