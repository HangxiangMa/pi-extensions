# pi-goal Supervisor Resume RPC Plan

## Goal

Deliver Phase 3 of `docs/roadmaps/pi-goal-cross-extension-supervision-roadmap.md`: add an explicit
supervisor access level and a request-scoped Resume RPC that reuses `/goal resume`, rotates the stale
Goal ID, preserves operator intent, and rolls back safely when activation cannot be delivered.

## Context

- `GoalCommandController.resumeGoal()` currently owns resumable-status and budget checks, terminal-tool
  activation, continuation/recovery cleanup, stale-ID rotation, safety reset, owned prompt delivery,
  rollback, status updates, and user notifications.
- `GoalRpcController` already provides a start request/reply handshake, correlated pause ownership,
  session bind/unbind, and stale-start protection.
- The Phase 1 plan provides `off`, `observe`, and `rpc-owned` policy levels. The Phase 2 plan provides
  durable stopped-transition provenance, including explicit operator and conservative legacy-unknown
  stops.
- Pi's shared event bus returns from `emit()` without awaiting async listeners, so request completion
  must continue to use a request-scoped reply channel rather than a returned event value.

## Architecture

Extend `crossExtension.access` with `supervisor`. It includes state observation and the existing
RPC-owned start/pause operations, then adds Resume RPC for an exact current stopped foreground Goal.
It does not grant direct state mutation or permission to resume an explicit operator pause.

Use these proposed channels, finalized by the first plan item:

```text
request: pi-goal:rpc:resume
reply:   pi-goal:rpc:resume:reply:${requestId}
```

The request carries `requestId` and the exact current stopped `goalId`. The success reply carries the
newly rotated `goalId`, resulting authoritative status, and optionally the prior ID for correlation.
Every syntactically valid request ID receives exactly one success or failure reply, including policy,
session, stale-ID, eligibility, budget, tool-availability, supersession, and delivery failures.

Refactor the existing resume path behind one structured operation result. The slash-command adapter
owns user-facing notifications; the RPC adapter owns JSON replies. Both use the same validation,
transition, prompt ownership, and rollback implementation. Do not invoke a slash command through
text input or infer success from notifications.

A supervisor request can resume only provenance classes explicitly admitted by a table-driven policy.
`operator/explicit_pause` and `legacy_unknown` are denied server-side. Resume remains status- and
budget-gated exactly as the command is today. Successful resume rotates the Goal ID before prompt
delivery, so the reply and subsequent state event must expose the new ID.

Session binding gains a monotonically changing generation or equivalent exact-context token. After
owned prompt delivery awaits, the continuation revalidates session generation, request ownership,
old/new Goal identity, and current status before reporting success or restoring prior state.

Optional `reason` is diagnostic request metadata and is not injected into the model prompt. Optional
repair guidance is deferred unless the first plan item admits a bounded schema, trust-boundary
wording, and tests without widening the objective. Deferral does not block the core Resume RPC.

## Non-Goals

- Resume explicit operator pauses or legacy stops whose origin cannot be proven safe.
- Add terminal proposal review, continuation hold, multi-supervisor arbitration, or a second writer.
- Change the current token-budget eligibility rule or silently increase a budget.
- Replace the existing `/goal resume` user workflow or its notifications.
- Guarantee durable cross-process request deduplication; the contract remains session-local.

## Unknowns

- Whether duplicate `requestId` values return a cached result or a deterministic duplicate/stale
  failure must be decided before the public schema is documented. In either case, a duplicate cannot
  reactivate Goal work twice.
- The exact resumable provenance allowlist requires the completed Phase 2 taxonomy.
- Repair guidance remains optional in issue #455. It must be explicitly admitted or deferred before
  implementation rather than appearing as an unbounded string.

## Risks

- Calling the current UI-oriented method directly from RPC can duplicate notifications or make the
  reply depend on side effects. Use a structured shared operation and thin adapters.
- A successful transition rotates the Goal ID before an async send. A stale completion can otherwise
  report success for a replaced session or roll back a newer Goal.
- Metadata alone does not protect operator intent. Enforce denied provenance inside `pi-goal`, not
  only in the supervisor consumer.
- Request retries after a lost success reply can look stale because the ID already rotated. The public
  duplicate rule must be explicit and deterministic.

## Rollback / Recovery

- The RPC channel is additive and carries no persisted request state. Reverting to a Phase 1 build
  requires changing an explicit `supervisor` setting back to `rpc-owned` before that older validator
  can load the file; document this rollback instead of claiming forward enum compatibility.
- A failed resume restores the exact prior stopped Goal ID, status, provenance, safety counters,
  safety cause, continuation/recovery state, stale-tool block, status text, and tool-visibility
  snapshot only if that request still owns the current transition.
- Session replacement or shutdown invalidates all pending resume ownership and prevents replies from
  claiming a new session's Goal.

## Plan

- [ ] Finalize and record the Resume RPC request, success/failure reply, error codes, duplicate
      behavior, admitted provenance allowlist, and repair-guidance decision in this plan and README
      draft; verify each public field has one deterministic validation or lifecycle test before
      production implementation begins.
- [ ] Add failing settings and UI cases in `settings.test.ts` and `settings-ui.test.ts` for the
      `supervisor` access value, compatibility default, immediate downgrade, save rollback, and
      trusted-extension/operator-pause wording; verify the failures precede schema and menu changes.
- [ ] Extend `settings.ts` and the existing Cross-extension access row in `settings-ui.ts` with
      `supervisor`, preserving the current settings transaction and no-project-override boundary;
      verify settings normalization, persistence, UI, invalid-file, and non-TUI tests pass.
- [ ] Add failing command-level characterization tests for every current `/goal resume` success and
      rejection result, then refactor `GoalCommandController` to return a tagged resume result used by
      both command and future RPC adapters without changing command-visible behavior; verify the
      existing resume, budget, tool-visibility, prompt-delivery rollback, and queue tests remain green.
- [ ] Add failing `goal-rpc.test.ts` cases for malformed payloads, no session, insufficient access,
      exact stopped ID, denied operator and legacy provenance, each admitted stopped class, exhausted
      budget, unavailable tools, rotated success ID, duplicate requests, clear/replace races, session
      replacement, shutdown, and send failure; verify they fail because no resume channel exists.
- [ ] Implement the request/reply handler and session-generation ownership in `rpc.ts`, call the shared
      resume operation, and emit exactly one correlated reply without command emulation; verify the
      focused RPC suite proves stale continuations cannot report or roll back across a newer Goal or
      session.
- [ ] Add integration regressions showing successful Resume RPC resets the safety epoch, clears the
      stale-tool block, rotates blocker audit ownership, emits active state for the new Goal ID, and
      preserves denied operator state byte-for-byte; verify these invariants through canonical session
      entries rather than notifications alone.
- [ ] Update `packages/pi-goal/README.md` with supervisor opt-in, exact payloads and channels,
      provenance eligibility, operator-pause denial, duplicate/lost-reply semantics, new Goal-ID
      tracking, settings behavior, and any explicit guidance deferral; verify examples match tests.
- [ ] Audit user cancellation, prompt disposal, session replacement, shutdown, post-`await` state,
      settings downgrade, and tool-visibility rollback against both extension guides; run the
      workspace check and runtime smoke, root `npm test`, root `npm run check`, `just pack goal`, and
      `git diff --check`, recording any live supervisor path that remains unverified for Phase 4.

## Completion Checklist

- [ ] `supervisor` is explicit opt-in and lower access levels cannot invoke Resume RPC.
- [ ] Slash-command and RPC resume use one transition implementation with unchanged command behavior.
- [ ] Every valid request ID receives one documented reply, and success returns the rotated Goal ID.
- [ ] Operator, legacy-unknown, stale, replaced-session, ineligible, budget-exhausted, and failed-send
      cases cannot leave unauthorized Goal work active.
- [ ] Successful resume preserves existing safety reset, blocker-audit reset, stale-tool, tool-policy,
      usage, queue, and persistence invariants.
- [ ] Public schema, settings UI, README, deterministic tests, runtime smoke, package dry run, and root
      gates agree on the delivered Phase 3 contract.
