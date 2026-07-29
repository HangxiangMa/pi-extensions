# pi-goal Supervisor Contract Validation Plan

## Goal

Execute Phase 4 of `docs/roadmaps/pi-goal-cross-extension-supervision-roadmap.md`: validate the
Phase 1–3 public contract against at least one inspectable supervisor consumer and record an explicit
admission or deferral decision for blocked-proposal review and continuation hold.

## Context

- The repository currently contains `pi-goal` provider-side tests but no sibling extension that
  consumes its start, pause, state, or proposed resume channels.
- Issue #455 states that an external local prototype exists, but no inspectable branch, package, or
  fixture was supplied with the issue.
- Phases 5 and 6 deliberately add authority at the most sensitive terminal-decision and continuation
  boundaries. They are not justified by provider-side tests alone.
- This phase is an evidence and contract-validation gate. A defensible deferral is a successful
  outcome when no real consumer or recurring workflow can be demonstrated.

## Architecture

The admitted consumer must be an actual sibling extension or an inspectable prototype with the same
session-local `pi.events` constraints as production. A provider-only unit-test emitter is useful for
regression coverage but does not satisfy the roadmap's real-consumer gate by itself.

Validate the full public flow:

```text
consumer registration
  -> state observation
  -> optional RPC start and correlated pause
  -> stopped-state classification
  -> exact Resume RPC request
  -> rotated Goal-ID adoption
  -> reload/shutdown cleanup
```

The consumer must not import `pi-goal` runtime code, mutate its session entries, emulate TUI input, or
open a second Pi session. It may share JSON-shaped TypeScript test fixtures locally, but the shipped
extensions remain dependency-free.

For each proposed Phase 2 hook, collect concrete workflow evidence, required timing, cancellation,
ownership, timeout, and failure behavior. Record one of three decisions in the roadmap:

- **Admit:** the workflow recurs, lower-level APIs cannot solve it safely, and a bounded protocol is
  demonstrated.
- **Revise:** the need is real but the proposed hook or boundary must change before planning.
- **Defer:** evidence is absent, one-off, or safely handled by Phase 3.

No Phase 5 or 6 implementation begins until its own decision is **Admit**.

## Non-Goals

- Implement blocked-proposal review or continuation hold as part of validation.
- Treat a synthetic provider-side test as proof of product demand.
- Add an extension-to-extension runtime dependency or a shared mutable Goal store.
- Publish, merge, or release the consumer or `pi-goal` automatically.
- Require both proposed capabilities to receive the same admission decision.

## Unknowns

- Which inspectable consumer will satisfy the gate is currently unknown. The issue author's prototype
  is preferred if it can be supplied; otherwise a repository-owned consumer must have an independent
  product reason to exist.
- No baseline frequency exists for false blocked proposals or planned continuation holds. The phase
  must report the evidence gap rather than invent a target.
- Pi's event bus is fire-and-forget and has no listener-count API. A consumer must demonstrate any
  proposed registration or claim handshake before a Phase 2 design is admitted.

## Risks

- Building a new supervisor solely to satisfy the gate can manufacture demand. Require a concrete
  user workflow and keep test fixtures distinct from product evidence.
- A happy-path demo can hide lost replies, stale Goal IDs, session replacement, and listener cleanup.
  Exercise the failure matrix before admitting more authority.
- The external prototype may depend on behavior not present in the public contract. Record the gap
  and revise the roadmap rather than adding private coupling.
- Validation can drift into implementation. Stop after evidence and admission decisions are
  documented.

## Rollback / Recovery

- Validation should not change persisted Goal formats or production transitions. Consumer fixtures
  and documentation can be reverted without data migration.
- A live smoke must use a disposable session and settings directory. Shutdown must leave no retained
  listener, timer, session file, or active Goal outside the fixture's declared cleanup.
- If the consumer cannot be inspected or made deterministic, record both Phase 2 capabilities as
  deferred and complete this plan without speculative implementation.

## Plan

- [ ] Obtain or identify one inspectable supervisor consumer, record its repository path or immutable
      review reference plus concrete user workflow in this plan, and verify it uses the public
      session-local event contract without importing `pi-goal` internals; if none exists, record the
      evidence gap and move both Phase 2 decisions to **Defer**.
- [ ] Create a consumer/provider compatibility matrix covering request and reply channels, state
      provenance, rotated Goal-ID tracking, registration lifetime, settings access, cancellation,
      reload, shutdown, duplicate/lost request behavior, and every consumer assumption; verify each
      row cites source and a deterministic test or an explicitly unverified live path.
- [ ] Add or run cross-extension contract tests that load both factories against the same real
      `createEventBus()` semantics and exercise observe, start, correlated pause, stop classification,
      Resume RPC, duplicate/lost reply handling, settings downgrade, reload, session replacement, and
      shutdown; verify no second writer, command emulation, or stale session context appears.
- [ ] Run a disposable Pi runtime smoke with the admitted consumer and `pi-goal`, capturing the exact
      setup, settings, state transitions, rotated IDs, cancellation, and cleanup result; verify the
      process exits without a retained Goal-owned task or listener and record any path that cannot be
      automated.
- [ ] Evaluate blocked-proposal review against observed cases, documenting recurrence, why Phase 3
      cannot solve them, required claim timing, maximum wait/deferral behavior, multi-listener rule,
      and failure fallback; record **Admit**, **Revise**, or **Defer** with evidence in the roadmap's
      Decisions and Changes section.
- [ ] Evaluate continuation hold against observed planned-compaction or lifecycle cases, documenting
      why existing settled/pending-message ordering is insufficient, required lease duration source,
      single-holder rule, stale-ticket behavior, and failure fallback; record an independent
      **Admit**, **Revise**, or **Defer** decision with evidence in the roadmap.
- [ ] Reconcile the conditional Phase 5 and Phase 6 plan artifacts with the admission decisions:
      update admitted plans with verified consumer constraints, or mark their gate and remaining work
      deferred without pretending implementation is authorized; verify roadmap, plans, and consumer
      evidence do not contradict one another.
- [ ] Run affected consumer and `pi-goal` focused tests, root `npm test`, root `npm run check`, relevant
      package dry runs, and `git diff --check`; verify the final diff contains only validation fixtures,
      documentation, and explicit decision records unless a separately approved consumer change was
      required.

## Completion Checklist

- [ ] One inspectable real consumer is validated, or the absence of one is recorded as the reason both
      Phase 2 capabilities remain deferred.
- [ ] The Phase 1–3 contract is exercised across success, stale, duplicate/lost, reload, replacement,
      settings downgrade, and shutdown paths using real event-bus semantics.
- [ ] Blocked review and continuation hold each have an independent evidence-backed Admit, Revise, or
      Defer decision.
- [ ] No Phase 5 or 6 production protocol was implemented during this validation phase.
- [ ] Roadmap decisions, conditional plans, tests, smoke evidence, and known gaps are mutually
      consistent.
- [ ] All applicable focused checks, root gates, dry runs, and cleanup verification pass.
