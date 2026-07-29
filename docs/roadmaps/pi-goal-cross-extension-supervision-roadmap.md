# pi-goal Cross-Extension Supervision Roadmap

## Vision

`@narumitw/pi-goal` should let users choose how trusted sibling extensions may observe or
supervise Goal work while keeping Goal transitions, persistence, stale-turn protection, and
lifecycle safety under one authoritative `pi-goal` state machine.

## Objectives

- Give users an explicit, backward-compatible boundary for disabling cross-extension integration,
  observing state, or controlling only RPC-owned goals.
- Make the source and cause of every stopped Goal transition machine-readable and durable across
  session reloads.
- Support supervised recovery of eligible stopped foreground Goals without allowing stale requests
  or automatic reversal of an explicit operator pause.
- Admit terminal review and continuation control only after a real supervisor integration validates
  their need and protocol assumptions.
- Preserve current standalone behavior, completion and blocker audits, and lifecycle safety when no
  supervisor participates.

## Current State

This roadmap is for `pi-goal` maintainers, contributors, and sibling-extension authors. It sequences
cross-extension supervision work without committing to delivery dates, release versions, or owners.
No implementation phase in this document is an approved commitment yet.

The current package provides a session-local JSON event contract over `pi.events`:

- `pi-goal:rpc:start` starts a new Goal only when no Goal already exists;
- `pi-goal:rpc:pause` pauses only the Goal owned by the correlated RPC start request; and
- `pi-goal:state` broadcasts canonical `goalId` and `status`, with a terminal `summary` or `reason`
  when available.

The existing `/goal resume` path already validates resumable state and token budget, rotates the
stale-turn guard, resets the safety epoch, delivers an owned prompt, and restores the prior stopped
state if delivery fails. There is no cross-extension resume request.

State events do not carry structured transition provenance. A human-readable terminal reason is
held in runtime state and intentionally does not leak into a different restored session. Internal
Goal persistence carries a limited `safetyPauseCause`, but it cannot distinguish the full set of
operator, RPC, interruption, safety, provider, agent, and rollback transitions required by a
supervisor.

The user settings file currently controls tool visibility, the experimental ordered-goal queue, and
continuation limits. It has no cross-extension access policy. Settings already use defaults for an
absent file, reject malformed content, preserve unknown fields, publish explicit saves atomically,
and apply menu changes with rollback on failure.

No repository extension currently consumes the `pi-goal` RPC channels. Issue #455 reports an
external local prototype and deterministic tests, but that implementation is not available in this
repository for validation. Terminal proposal review and continuation hold/release therefore remain
proposed capabilities rather than demonstrated repository requirements.

## Guiding Principles

- **Preserve the compatibility default:** an omitted new setting retains the current state, start,
  and RPC-owned pause contract.
- **Increase authority explicitly:** observing state, controlling RPC-owned Goals, and supervising a
  foreground Goal are distinct permission levels.
- **Keep operator intent authoritative:** an explicit operator pause remains resumable only through
  a user-owned path unless a later decision introduces an equally explicit user authorization.
- **Keep one Goal writer:** sibling extensions request, review, claim, or release; only `pi-goal`
  validates and commits state transitions.
- **Fail back to current behavior:** an absent, invalid, failed, timed-out, or replaced supervisor
  must not strand or silently advance a Goal.
- **Revalidate after every boundary:** continuations that cross an await, event response, lease, or
  session change must recheck session generation, Goal identity, status, policy, and ownership.
- **Earn lifecycle complexity with evidence:** Phase 2 intervention proceeds only after a real
  consumer demonstrates the workflow and its failure semantics.
- **Treat settings as cooperation policy, not a sandbox:** installed Pi extensions are fully
  privileged; these settings govern only whether `pi-goal` honors its own integration contract.

## Roadmap Themes

### User-controlled interoperability

Expose a small access model that communicates how far sibling extensions may reach and keeps risky
capabilities behind explicit, user-owned choices.

### Authoritative transition provenance

Represent why a Goal stopped as canonical state rather than requiring integrations to parse optional
human-readable error text.

### Safe supervised recovery

Complete the current start/pause/observe contract with a guarded recovery path that reuses the same
transition as `/goal resume`.

### Bounded lifecycle intervention

Allow external review or preparation only through single-owner, expiring decisions that preserve
Goal liveness and reject stale work.

## Phases and Milestones

### Phase 1: Establish a user-controlled integration boundary

**Plan:** [Cross-extension access](../plans/2026-07-30_pi-goal-cross-extension-access-plan.md)

**Milestones:**

- User settings expose `off`, `observe`, and `rpc-owned` access levels with `rpc-owned` as the
  compatibility default.
- `off` accepts no new `pi-goal` RPC work and emits no subsequent state events; `observe` emits state
  without accepting control requests; `rpc-owned` preserves the current start and correlated pause
  behavior.
- The Goal settings experience shows the effective access level, explains that only trusted
  installed extensions should participate, and applies changes with the existing persistence and
  rollback guarantees.
- Downgrading access leaves the current Goal intact and has documented semantics for requests already
  accepted at the policy boundary.
- Deterministic settings, lifecycle, and RPC coverage proves each access level and the unchanged
  default behavior.

**Outcome:** Users can restrict the existing integration contract before any foreground-supervision
capability is introduced.

### Phase 2: Make stopped-transition provenance authoritative

**Plan:** [Stopped-transition provenance](../plans/2026-07-30_pi-goal-transition-provenance-plan.md)

**Milestones:**

- A documented transition source-and-cause taxonomy distinguishes explicit operator and RPC pauses,
  interruption, Goal safety, unavailable terminal tools, provider usage limits, token budgets,
  agent-proposed blocking, terminal agent errors, clear, and activation rollback.
- Provenance is stored with the matching canonical stopped Goal and survives reload without attaching
  old details to a rotated, replaced, queued, or cleared Goal.
- State events expose the provenance through an additive JSON shape whenever observation is allowed;
  integrations never need to infer policy from `reason` text.
- Every documented stopped-transition path has deterministic event and restore coverage.
- Provenance remains internal when cross-extension access is off and is not exposed as an independent
  setting that could create an unsafe control-without-context combination.

**Outcome:** Integrations can reliably distinguish intentional operator stops from recoverable or
system-originated stops, establishing the safety prerequisite for Resume RPC.

### Phase 3: Enable safe supervised recovery

**Plan:** [Supervisor Resume RPC](../plans/2026-07-30_pi-goal-supervisor-resume-rpc-plan.md)

**Milestones:**

- A new `supervisor` access level adds request-scoped Resume RPC to the lower access-level
  capabilities.
- Slash-command and RPC callers share one authoritative resume operation rather than duplicating
  transition, budget, tool-visibility, safety-reset, prompt-ownership, or rollback policy.
- A resume request validates the exact current stopped Goal and active session; success returns the
  newly rotated Goal ID rather than leaving the caller with the stale request ID.
- Explicit operator pauses, ineligible statuses, exhausted budgets, replaced sessions, replaced or
  cleared Goals, and stale requests cannot reactivate Goal work.
- Failed owned-prompt delivery restores the original stopped state only when that request still owns
  the current Goal.
- Optional repair guidance is either admitted with a documented length limit and prompt trust
  boundary or explicitly deferred without weakening the core recovery contract.

**Outcome:** The first part of issue #455 is complete: an opted-in supervisor can recover an eligible
foreground Goal without bypassing existing Goal invariants.

### Phase 4: Validate the supervision contract with a real consumer

**Plan:** [Supervisor contract validation](../plans/2026-07-30_pi-goal-supervision-validation-plan.md)

**Milestones:**

- At least one supervisor integration exercises observe, start, owned pause, stopped-state
  classification, and resume through the documented public contract.
- The integration demonstrates deterministic behavior for duplicate or lost requests, reload,
  shutdown, session replacement, and stale Goal IDs without a second writer or Pi session.
- Evidence identifies whether blocked-proposal review and continuation hold solve recurring workflows
  that cannot be handled safely through Phase 3.
- Before further expansion, maintainers record an admission or deferral decision for each proposed
  Phase 2 capability, including multi-listener ownership and timeout semantics.

**Outcome:** Further lifecycle authority is based on observed integration needs and validated failure
modes rather than the uninspected prototype alone.

### Phase 5: Admit bounded blocked-proposal review

**Plan:** [Blocked-proposal review](../plans/2026-07-30_pi-goal-blocked-proposal-review-plan.md)

**Milestones:**

- This phase proceeds only after Phase 4 admits the capability and the user explicitly enables
  blocked-proposal review under `supervisor` access.
- A supervisor can review only after the existing `goal_blocked` Goal-ID, ownership, evidence, and
  three-turn recurrence audit succeeds and before `blocked` becomes durable.
- No listener preserves the current transition without visible delay; timeout, invalid output,
  listener failure, policy revocation, or session loss falls back to the original `blocked`
  transition.
- Review ownership, guidance size, response time, and the number of allowed deferrals are bounded so
  a supervisor cannot veto terminal state indefinitely.
- A returned decision revalidates the session, Goal instance, active status, pending queue action,
  tool-call ownership, and cancellation state before it can affect the Goal.

**Outcome:** An opted-in supervisor can correct a validated but recoverable blocker assessment
without weakening the blocker audit or creating unbounded autonomous work.

### Phase 6: Admit leased continuation control

**Plan:** [Continuation lease](../plans/2026-07-30_pi-goal-continuation-lease-plan.md)

**Milestones:**

- This phase proceeds only after Phase 4 admits the capability and the user explicitly enables
  continuation hold under `supervisor` access.
- Each claim targets one unique continuation ticket, not only a Goal ID, and at most one holder can
  own that ticket.
- Every hold has a bounded lease; missing release, listener failure, policy revocation, reload, or
  shutdown returns control to the normal dispatcher rather than stranding the Goal.
- Release re-enters the existing settled dispatcher and rechecks Goal identity, status, idle state,
  pending messages, tools, budget, queue actions, and safety limits instead of sending directly.
- Pause, clear, replace, edit, resume, newer user or extension work, and session replacement
  invalidate stale tickets so an old release cannot start a newer continuation.

**Outcome:** An opted-in supervisor can perform planned compaction or lifecycle preparation between
Goal turns while preserving single-flight delivery and Goal liveness.

## Technical Health

- Keep protocol parsing, request/reply correlation, and access checks in a focused cross-extension
  boundary while the Goal runtime remains the owner of state and lifecycle invariants.
- Introduce one structured transition-provenance owner instead of adding source/cause fields at each
  caller independently.
- Return structured results from the shared resume operation so command and RPC adapters do not infer
  outcomes from UI notifications.
- Review `runtime.ts` and `goal.ts`, both already above the repository's 1,000-line threshold, before
  adding Phase 2 coordination. Extract a focused coordinator only when it owns real claim, lease,
  timeout, and generation policy rather than acting as a pass-through wrapper.
- Preserve side-effect-free missing-file reads, invalid-file protection, unknown-field preservation,
  atomic publication, ordered application, rollback, and reload semantics for every settings phase.
- Keep session-owned claims, timers, and waiters cancellable from user cancellation, session
  replacement, settings revocation, and shutdown independently.
- Keep the public contract JSON-shaped and dependency-free; do not introduce extension-to-extension
  package dependencies.
- Require focused deterministic tests, the root `npm run check` gate, and a representative Pi runtime
  smoke for every delivered phase.

## Risks and Dependencies

- **False security boundary:** users may interpret access settings as extension sandboxing.
  Documentation and UI must state that installed extensions remain fully privileged and that the
  setting controls only `pi-goal` cooperation.
- **Compatibility regression:** changing the omitted-setting default could break current external
  consumers. Preserve `rpc-owned` as the default unless an explicitly approved breaking migration
  provides contrary evidence.
- **Incomplete provenance:** event-only metadata would disappear after reload and could allow an
  operator pause to be misclassified. Persist provenance with the stopped Goal and test restoration.
- **Unverified consumer demand:** no repository consumer currently proves the supervision workflow.
  Phase 4 is a dependency for either lifecycle-intervention phase.
- **Multiple supervisors:** a broadcast bus can produce conflicting reviewers or holders. Phase 4
  must choose a deterministic single-owner arbitration rule before Phase 5 or 6 proceeds.
- **Review-induced nontermination:** repeated vetoes can increase token use indefinitely. Bound review
  time and deferral count, and preserve the original terminal fallback.
- **Lease-induced deadlock:** a lost release can stop automatic work indefinitely. Require expiry and
  route fallback through the normal settled dispatcher.
- **Stale release collision:** Goal ID alone cannot distinguish successive continuations. Require a
  unique continuation ticket and invalidate it on every superseding transition.
- **Platform event limitations:** Pi's shared event bus may not supply request ownership, cancellation,
  listener discovery, or asynchronous arbitration directly. Validate the proposed handshake against
  the installed public API before admitting either Phase 2 protocol.

## Success Metrics

| Objective | Baseline | Target and horizon | Measurement source |
| --- | --- | --- | --- |
| Preserve current integration behavior | Start, RPC-owned pause, and state events are documented and tested without an access setting. | The default path remains behaviorally equivalent when Phase 1 ships. | Existing and extended `goal-rpc` tests plus a Pi runtime smoke. |
| Give users an effective access boundary | No current setting gates the integration contract. | Every documented access level accepts and rejects exactly its declared operations by the end of Phase 1. | Settings, UI, RPC, session-start, reload, and shutdown tests. |
| Make stopped state machine-readable | State events have no structured transition provenance. | Every documented stopped path emits and restores the matching source/cause by the end of Phase 2. | Transition matrix tests over command, tool, safety, provider, budget, clear, and rollback paths. |
| Recover eligible foreground Goals safely | Resume exists only as a user command. | All accepted resumes rotate the guard and all stale, operator-paused, replaced-session, and failed-delivery cases leave unauthorized work inactive by the end of Phase 3. | Focused Resume RPC tests and end-to-end supervisor smoke. |
| Justify lifecycle intervention | No repository consumer demonstrates terminal review or continuation hold. | At least one real consumer validates the need and failure contract before either Phase 5 or Phase 6 is admitted. | Phase 4 integration evidence and recorded admission decision. |
| Preserve liveness under Phase 2 | No external reviewer or holder can currently delay Goal work. | No admitted listener failure, timeout, revocation, replacement, or shutdown path leaves a permanent review or hold. | Deterministic fault, timeout, stale-ticket, and lifecycle tests plus runtime smoke. |

## Non-Goals

- Building an extension security sandbox, authentication system, or protection from malicious
  installed code.
- Letting project-controlled settings grant foreground-supervision authority.
- Adding a second Goal writer, persistence implementation, Pi session, or TUI-input emulation path.
- Allowing a supervisor to automatically reverse an explicit operator pause.
- Weakening `goal_blocked` recurrence, evidence, or stale-ID validation.
- Delivering settings, Resume RPC, terminal review, and continuation leases in one change.
- Redesigning the Goal queue, token accounting, tool visibility, or the general `/goal` manager as
  part of this roadmap.
- Committing to Phase 5 or 6 before the Phase 4 evidence gate passes.
- Assigning delivery dates, releases, owners, or capacity without separate planning evidence.

## Decisions and Changes

No prior roadmap or approved decision record for cross-extension supervision was supplied. The
following entries record the proposed direction of this initial draft, not implementation
commitments.

| Record | Status | Decision or change | Rationale and impact |
| --- | --- | --- | --- |
| Initial draft | Proposed | Split issue #455 and integration settings into six outcome phases. | Establishes reversible checkpoints instead of one lifecycle-heavy rollout. |
| Initial draft | Proposed | Preserve current behavior through a default `rpc-owned` access level. | Avoids silently breaking the documented start, pause, and state contract. |
| Initial draft | Proposed | Deliver durable transition provenance before Resume RPC. | Prevents a supervisor from inferring operator intent from incomplete status or reason text. |
| Initial draft | Proposed | Keep explicit operator pause outside automatic supervisor recovery. | Preserves direct user agency at the highest-priority stop boundary. |
| Initial draft | Proposed | Require a real consumer and admission decision before either Phase 2 hook. | Prevents speculative async ownership and liveness complexity from entering the core Goal state machine. |
| Initial draft | Proposed | Separate blocked review from continuation leases. | Their terminal-decision and delivery-liveness risks require independent contracts and verification. |
