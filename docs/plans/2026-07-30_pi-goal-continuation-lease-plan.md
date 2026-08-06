# pi-goal Continuation Lease Plan

## Goal

Conditionally deliver Phase 6 of
`docs/roadmaps/pi-goal-cross-extension-supervision-roadmap.md`: let one admitted, explicitly enabled
supervisor hold one automatic Goal continuation for bounded lifecycle preparation and release it back
through the normal settled dispatcher without compromising single-flight delivery or Goal liveness.

## Context

- This plan is not admitted for execution until Phase 4 records **Admit** for continuation control
  and identifies the validating consumer and workflow.
- `GoalRuntime` currently models one `continuationIntent` and one `continuationDelivery`.
  `agent_end` records intent; `agent_settled` calls `dispatchContinuationIfSettled()` after recovery
  and queue actions drain.
- Dispatch already verifies active Goal identity, terminal-tool availability, automatic/no-progress
  limits, idle state, and pending messages. New work, stop/clear/replace, compaction, and stale prompt
  markers cancel or supersede continuation ownership.
- Internal continuation markers already contain Goal ID, iteration, and a random UUID. A public hold
  must retain equally exact ticket identity rather than releasing by Goal ID alone.
- Pi's event bus does not await listeners or expose listener count. No-listener behavior requires an
  immediate claim handshake; a claimed hold needs an extension-owned lease timer and later release
  event.

## Architecture

The Phase 4 admission record must finalize channels, lease bounds, claimant semantics, and the
validated consumer flow. The expected lifecycle is:

```text
continuation intent
  -> settled dispatcher offers unique ticket
  -> optional synchronous first claim
  -> no claim: normal delivery
  -> claim: held ticket with bounded lease
  -> release or expiry
  -> normal settled dispatcher revalidates and delivers or remains pending
```

Add a focused continuation-lease coordinator owned by `GoalRuntime` or a narrow runtime collaborator.
It owns ticket/claim identity, at-most-one holder, expiry, release correlation, policy generation, and
cleanup. It does not send prompts directly. Release and expiry restore an eligible ticket to
`dispatchContinuationIfSettled()`, which remains the single delivery authority.

A public ticket contains an opaque `continuationId`, exact `goalId`, and only the bounded metadata the
consumer needs. Do not expose the prompt or allow the holder to alter it. The first synchronous valid
claim wins; no claim returns immediately to current dispatch with no timer. A release must match the
same continuation and claimant identity if the admitted protocol includes one.

The lease is session-owned and never persisted across reload. Pause, clear, replace, edit, resume,
newer user/extension work, queue supersession, safety/budget stop, tool loss, settings revocation,
session replacement, and shutdown invalidate it. Expiry does not send directly from a stale timer;
it reacquires the current session generation and runs the normal idle/pending checks.

When the user disables continuation hold or downgrades access, the setting transaction invalidates
the hold and schedules ordinary redispatch at the next safe settled/idle boundary. It does not abort
unrelated work or immediately inject a prompt from the settings callback.

## Non-Goals

- Hold user prompts, steering messages, queue transitions, retries, overflow compaction retries, or
  budget wrap-up messages.
- Let a holder edit, replace, inspect, or directly deliver the continuation prompt.
- Persist leases across reload or recover a supervisor process after session shutdown.
- Allow multiple holders, votes, lease transfer, or unbounded renewal in the first contract.
- Trigger compaction inside `pi-goal`; the supervisor owns its admitted preparation workflow.
- Add blocked-proposal review as part of continuation control.

## Unknowns

The Phase 4 admission record must resolve these before implementation:

- exact offer, claim, release, and optional rejection channels plus payload versioning;
- lease-duration source and whether one bounded renewal is needed;
- claimant identity and duplicate claim/release reply semantics;
- how release requests receive observable acknowledgement;
- how an expiry or release wakes the dispatcher when no new Pi lifecycle event will occur;
- whether manual compaction completion requires any additional scheduling beyond the existing
  `session_compact` idle fallback.

## Risks

- A missing release can strand Goal work. Every claim requires an expiring lease and idempotent
  cleanup.
- Releasing by Goal ID can collide with a later continuation for the same Goal. Require the unique
  ticket ID and invalidate it on every superseding transition.
- A timer that captures an old `ExtensionContext` can crash or deliver into a replacement session.
  Capture plain identity data and reacquire/revalidate the bound session generation.
- Direct send on release can bypass tools, limits, queue, pending-message, and idle checks. Route every
  release through the existing dispatcher.
- The continuation subsystem has a long history of race-condition fixes. Adding state across
  `runtime.ts`, `goal.ts`, settings snapshots, and queue paths without one coordinator can regress
  ownership locality.

## Rollback / Recovery

- The setting and protocol are additive and default off. Reverting the phase returns to immediate
  settled dispatch; no persisted lease requires migration.
- Policy downgrade, pause, clear, replacement, reload, or shutdown cancels the timer, unregisters
  request ownership, and leaves at most the valid continuation intent available to normal dispatch.
- A failed settings save restores both the prior permission and exact held/intent/delivery snapshot
  through the settings transaction; a rollback must not duplicate or lose the ticket.
- If the admitted runtime cannot prove safe wake-up after lease expiry, defer the capability rather
  than ship a hold that can require manual user input to recover.

## Plan

- [ ] Verify Phase 4 recorded **Admit** for continuation control and copy the consumer reference,
      exact channels, lease, claimant, acknowledgement, renewal, wake-up, and compaction decisions
      into this plan; if the gate did not pass, mark every remaining item not applicable with the
      roadmap decision as evidence and do not change production code.
- [ ] Add a real-`createEventBus()` characterization suite for immediate offer/claim ordering,
      first-claim arbitration, async listener isolation, unsubscribe, duplicate events, and no-listener
      behavior; verify the selected handshake can claim synchronously without delaying an unclaimed
      continuation.
- [ ] Add failing settings and UI cases for `continuationHold`, default off, `supervisor` dependency,
      warning text, live revocation, save rollback, invalid file, and unknown-field preservation;
      verify lower access cannot leave lease permission effective.
- [ ] Add failing coordinator tests for unique tickets, one holder, duplicate/stale claims, valid and
      invalid release, expiry, optional renewal, policy generation, replacement, shutdown, and exact
      cleanup; verify fake timers or an injected clock make every lease path deterministic.
- [ ] Implement the focused lease coordinator and include held state in runtime settings snapshots,
      cancellation, replacement, and shutdown cleanup; verify deleting the coordinator would disperse
      real ticket, timer, and generation policy rather than leave a pass-through abstraction.
- [ ] Add failing dispatcher integration cases for no listener, claim, release, expiry, pending user
      or extension messages, new work, pause, clear, replace, edit, resume, queue action, safety/budget
      stop, tool loss, compaction, settings revocation, and repeated `agent_settled`; verify current
      behavior is the expected baseline in every unclaimed case.
- [ ] Integrate ticket offering at the existing settled single-flight boundary and route release or
      expiry back through `dispatchContinuationIfSettled()` with current session/context
      revalidation; verify no protocol handler or timer calls `sendUserMessage()` directly and one
      ticket can produce at most one delivery.
- [ ] Add the admitted consumer's planned lifecycle or compaction workflow tests and a disposable
      two-extension runtime smoke; verify held work prevents only its exact continuation, newer user
      work still wins, and release/expiry leaves no timer, listener, status, or stale ticket.
- [ ] Update `packages/pi-goal/README.md` with opt-in settings, JSON protocol, unique ticket and
      first-holder rules, lease/expiry behavior, invalidation matrix, acknowledgements, no-listener
      behavior, and security limitations; verify examples match consumer and provider tests.
- [ ] Review `runtime.ts` and `goal.ts` responsibility and line growth, splitting only where the
      coordinator establishes a clear ownership boundary; audit cancellation, disposal, session
      replacement, shutdown, settings rollback, and every timer/event continuation against both
      extension guides.
- [ ] Run focused deterministic tests, the pi-goal workspace check and runtime smoke, root `npm test`,
      root `npm run check`, `just pack goal`, the admitted consumer check/dry run and runtime smoke,
      plus `git diff --check`; record lease cleanup and no-listener equivalence evidence before
      handoff.

## Completion Checklist

- [ ] Phase 4 evidence explicitly admits this capability and supplies every lease and ownership
      decision, or the plan is completed as an evidence-backed deferral without code.
- [ ] No listener preserves current settled dispatch without delay or behavioral change.
- [ ] One unique ticket has at most one holder and at most one eventual delivery; stale Goal-only
      releases cannot affect newer work.
- [ ] Release, expiry, revocation, replacement, shutdown, and every superseding Goal transition leave
      no retained timer, listener, waiter, status, or stale ticket.
- [ ] Every released or expired ticket re-enters the normal dispatcher and rechecks current Goal,
      tools, limits, queue, idle, and pending-message state.
- [ ] Settings, README, admitted consumer, deterministic lifecycle tests, runtime smokes, package dry
      runs, source-boundary review, and repository gates agree on the final behavior.
