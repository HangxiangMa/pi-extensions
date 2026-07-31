# pi-goal Managed Run RPC Plan

## Goal

Replace the existing `pi-goal:rpc:*` and global `pi-goal:state` contract with one breaking,
run-scoped protocol that lets a sibling extension start, observe, and cancel exactly one Goal run,
and add a user setting that keeps the protocol disabled by default.

## Context

- The current public contract in `extensions/pi-goal/src/rpc.ts` has separate start and pause
  semantics: start uses a request-scoped reply, pause accepts either `goalId` or the originating
  `requestId`, and canonical state is broadcast globally from `GoalRuntime.persistGoal()`.
- PR #298 added that contract for the unmerged `tintinweb/pi-subagents` consumer PR #162. No
  extension in this repository currently consumes it.
- A breaking replacement is explicitly accepted. The implementation will not retain old channels,
  payloads, adapters, a payload-level version field, or a versioned channel namespace. Package
  release versioning communicates removal of the former public API.
- The accepted replacement is a managed-run protocol, not a general supervisor API. One
  caller-generated `runId` correlates start, state, cancellation, and terminal outcome.
- The accepted setting shape is user-scoped `rpc.enabled`, with a built-in default of `false`:

  ```json
  {
    "rpc": {
      "enabled": false
    }
  }
  ```

- Relevant guides have been reviewed: `docs/extension-conventions.md`,
  `docs/extension-settings.md`, Pi's `docs/extensions.md`, `docs/settings.md`, and SDK event-bus
  guidance. The touched MUST areas are session lifecycle cleanup, post-await generation checks,
  user-scoped settings validation/persistence/rollback, TUI and non-TUI settings behavior, public
  contract documentation, deterministic tests, runtime smoke, and package inspection.
- This plan supersedes the proposed access levels, Resume RPC, blocked review, and continuation
  lease in the current cross-extension-supervision planning branch. Those documents must not remain
  authoritative after this plan is executed.

## Architecture

### Public protocol

Expose exactly these channel patterns:

```text
pi-goal:start
pi-goal:cancel
pi-goal:event:${runId}
```

The contract intentionally omits both channel-level and payload-level version fields. Package
release versioning communicates future compatibility changes.

A caller must subscribe to its run event channel before emitting start. `runId` is a
caller-generated, session-local correlation identifier matching
`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`; UUIDs are recommended. It coordinates trusted extensions but
is not authentication or a security token.

Start payload:

```ts
{
  runId: string;
  objective: string;
  tokenBudget?: number;
}
```

Cancel payload:

```ts
{
  runId: string;
  reason?: string;
}
```

Run event union:

```ts
type GoalRunEvent =
  | {
      type: "state";
      runId: string;
      goalId: string;
      status:
        | "active"
        | "complete"
        | "blocked"
        | "paused"
        | "usage_limited"
        | "budget_limited"
        | "cleared";
      summary?: string;
      reason?: string;
    }
  | {
      type: "error";
      runId: string;
      operation: "start" | "cancel";
      error: {
        code:
          | "RPC_DISABLED"
          | "INVALID_REQUEST"
          | "NO_ACTIVE_SESSION"
          | "RUN_ID_IN_USE"
          | "RUN_NOT_FOUND"
          | "GOAL_ALREADY_EXISTS"
          | "ACTIVATION_FAILED"
          | "SUPERSEDED";
        message: string;
      };
    };
```

`message` is diagnostic; consumers branch only on `code`. A missing or unsafe `runId` cannot be
answered safely because it does not identify a valid event channel, so it is ignored. A valid
`runId` with malformed objective, budget, or reason receives `INVALID_REQUEST`. Reuse the existing
objective and positive-integer budget validation, and bound a trimmed cancellation reason to 1,000
characters.

### Run semantics

- A successful start first associates `runId` with the exact Goal instance before canonical state is
  persisted; its first successful output is a `state` event, not a separate reply envelope.
- Start rejects a pre-existing Goal and never invokes interactive replacement or adopts a manual or
  restored Goal.
- Cancel addresses only `runId`. It records cancellation while activation is pending or uses the
  normal pause transition once the matching Goal is active. Manual Goals and other run IDs are inert.
- State events are emitted only for the matching managed run and only from the canonical
  persistence/clear boundary. Repeated persistence without a status transition does not emit a
  duplicate event, and each run emits at most one terminal state.
- `complete` is the only successful terminal outcome. `blocked`, `paused`, `usage_limited`,
  `budget_limited`, and `cleared` all stop the managed run.
- A terminal managed run is never reopened. A later manual resume creates a new Goal instance that
  is outside the old run protocol.
- Session reload, replacement, and shutdown invalidate run ownership and pending work. Every
  continuation after `await` revalidates session generation, run identity, Goal identity, and current
  status before emitting or mutating state.

### Internal ownership

Replace `GoalRpcController` with a focused `GoalRunController` in
`extensions/pi-goal/src/run-protocol.ts`. It owns the one session-local run record, pending
cancellation, status deduplication, terminal closure, channel emission, and session generation.
`GoalCommandController` remains the transition owner, and `GoalRuntime` remains the only canonical
state writer.

Remove public event emission from `GoalRuntime.persistGoal()` and `clearPersistedGoal()`. Give the
runtime one narrow in-process persisted-state sink; the run controller attaches to that sink and
publishes only when the persisted Goal matches its owned `goalId`. This keeps run correlation out of
persistence and avoids a second state machine or another event-bus hop.

### Settings and live changes

- Extend `GoalSettings` with `rpc.enabled`, defaulting to `false`. Missing and invalid settings use
  that disabled default, so RPC admission fails closed.
- Preserve unknown top-level fields and unknown siblings inside `rpc` during save. Keep missing-file
  reads side-effect free and retain the existing atomic save and rollback protocol.
- Add a fifth direct Settings row named **Managed run RPC**, with `Off` and `On` values and wording
  that it allows trusted installed extensions to start and cancel Goal runs but is not an extension
  sandbox. Five rows remain within the repository's one-level settings convention.
- Register event listeners at factory load so valid callers receive `RPC_DISABLED` or
  `NO_ACTIVE_SESSION` rather than hanging, but bind the controller only after current settings and
  restored Goal state are loaded for the session.
- Enabling applies to new starts immediately after a durable settings save; it never adopts an
  existing Goal. Disabling rejects new starts immediately but lets an already accepted run drain:
  its exact cancel request and state events remain available until terminal. This avoids silently
  mutating or stranding an in-flight Goal. A reload or replacement clears that in-memory ownership.

## Non-Goals

- Preserve `pi-goal:rpc:start`, `pi-goal:rpc:pause`, request-scoped replies, or global
  `pi-goal:state` broadcasts.
- Add channel-level or payload-level version fields, compatibility adapters, migration aliases, or
  two simultaneously supported protocol implementations.
- Add Resume RPC, foreground-Goal supervision, blocked-proposal review, continuation hold, generic
  method dispatch, extension registration, caller allowlists, or authentication.
- Split RPC into a second extension or add an extension-to-extension package dependency.
- Change manual `/goal` behavior, Goal persistence schema, queue semantics, stop statuses, token
  accounting, or terminal tool contracts.
- Publish packages or perform a release/version bump as part of implementation; release preparation
  must nevertheless identify this as a breaking public-contract change.

## Risks

- A state event can occur before the start emitter returns because Pi's event bus invokes listeners
  synchronously. Requiring subscription before start and using caller-generated `runId` removes the
  reply-order race; tests must exercise it.
- A cancel event can arrive while kickoff delivery is pending. Run ownership must be installed before
  persistence, and post-await code must not send success or roll back a newer Goal/session.
- Moving publication out of `GoalRuntime` can miss rare clear, activation rollback, restored-state,
  queue, budget, or provider-stop paths. A transition matrix must prove which paths publish for an
  owned run and which remain silent for manual/restored Goals.
- Disabling during a run creates a bounded draining state. Tests and UI documentation must prove no
  new run is admitted while the exact existing run can still cancel and reach one terminal event.
- Event listeners are trusted but can throw. Listener failure must remain isolated from persistence,
  command transitions, later events, and session shutdown.
- `runtime.ts` and `goal.ts` already exceed 1,000 lines. The change should remove public protocol
  policy from `runtime.ts` and keep new run coordination in `run-protocol.ts`; do not add a
  pass-through abstraction or mechanically split unrelated Goal behavior.

## Rollback / Recovery

- Before release, rollback is a source revert: no Goal persistence migration is introduced.
- After release, users needing the old channels must install the prior package release; the new
  implementation deliberately provides no runtime compatibility mode.
- Older versions will treat the new top-level `rpc` object as unknown and preserve it through their
  existing unknown-field save behavior. The new version treats a missing field as disabled.
- A settings save/application failure restores the previous file and effective admission policy.
  Disabling, reload, replacement, or shutdown never deletes Goal progress solely because of the RPC
  policy.

## Plan

- [x] Add failing cases to `extensions/pi-goal/test/settings.test.ts` for the omitted and missing
      `rpc.enabled: false` default, valid booleans, invalid container/value shapes, invalid-file
      fail-closed behavior, and preservation of unknown top-level and nested `rpc` fields; the initial
      test compile failed because `GoalSettings.rpc` did not exist.
- [x] Extend `extensions/pi-goal/src/settings.ts` with the normalized `rpc.enabled` schema and
      unknown-field-preserving atomic publication; the focused compiled settings suite passes 5/5,
      including missing-file, malformed-file, first-save, and failed-rename regressions.
- [x] Add failing cases to `extensions/pi-goal/test/settings-ui.test.ts` for the fifth **Managed run
      RPC** row, default Off label, immediate enable/disable, save rollback, invalid-file read-only
      summary, trusted-extension wording, and non-TUI fallback; update
      `extensions/pi-goal/src/settings-ui.ts` through the existing serialized settings transaction.
      The initial focused suite failed 4 expected cases, and the updated suite passes 22/22.
- [x] Replace `extensions/pi-goal/test/goal-rpc.test.ts` with a failing
      `extensions/pi-goal/test/goal-run-protocol.test.ts` contract suite covering default-disabled
      start, enabled start, valid and invalid run IDs, objective and budget validation, pre-existing
      manual Goals, duplicate run IDs, run-scoped active and terminal events, stable error codes,
      terminal summary/reason, and absence of every removed channel; the initial focused run failed
      18 expected cases because only the former request/reply/global-state contract existed.
- [x] Add failing lifecycle cases to the run-protocol suite for cancellation during activation,
      cancellation after active state, unknown/stale/manual runs, activation rollback, supersession,
      repeated terminal persistence, listener failure, settings disable while draining, session
      reload/replacement, and shutdown; each case specifies one expected terminal event or one
      structured error and no stale continuation output in the same red-focused run.
- [x] Implement `GoalRunController` in `extensions/pi-goal/src/run-protocol.ts`, including payload
      parsing, safe run-channel construction, one session-owned run record, pending cancellation,
      stable errors, status deduplication, terminal closure, and generation-checked cleanup; the
      focused contract and lifecycle suite passes 22/22 without duplicating Goal transitions.
- [x] Replace `GoalRuntime`'s public `pi-goal:state` emission with one internal persisted-state sink,
      route matching snapshots and clears through `GoalRunController`, and remove
      `GOAL_STATE_EVENT_CHANNEL`, the old global payload exports, and
      `extensions/pi-goal/src/rpc.ts`; focused tests prove manual/restored Goals remain silent while
      owned active, complete, blocked, paused, usage, budget, clear, and rollback transitions publish.
- [x] Update `extensions/pi-goal/src/goal.ts` to bind the run controller only after settings and
      restored state initialization, unbind it before shutdown cleanup, and revalidate owned work
      after every await; focused cancellation and pending-shutdown regressions prove stale starts do
      not deliver kickoff work, overwrite status, notify, or emit into a replacement session.
- [x] Extend `extensions/pi-goal/test/goal-runtime-smoke.mjs` with a real shared-event-bus consumer
      that enables `rpc.enabled`, subscribes before start, completes one managed run, and observes one
      terminal `complete` event; add a disabled-default smoke rejection. The pi-goal runtime smoke
      passes and exits without retained listeners, timers, or Goal work.
- [x] Rewrite the cross-extension section of `extensions/pi-goal/README.md` with the default-off
      setting, exact three-channel protocol, payload/event schemas, error codes, subscribe-before-start
      rule, draining disable semantics, trust limitation, lifecycle scope, and breaking removal of the
      former RPC/state channels; focused tests and the shared-event-bus runtime smoke cover every
      documented behavior branch.
- [x] Not applicable: this implementation branch was created from `main`, where the superseded
      cross-extension supervision roadmap and six conditional plans are absent. Repository search
      finds no active access-level, Resume RPC, blocked-review, or continuation-lease contract.
- [x] Audit the final diff against the lifecycle, async UI, settings concurrency, invalid-file,
      unknown-field, atomic-save, rollback, session replacement, and shutdown MUST rules in
      `docs/extension-conventions.md` and `docs/extension-settings.md`; no deviation was accepted, and
      the synchronous event-listener reentrancy finding is recorded in `MEMORY.md`.
- [x] Run `npm run check --workspace @narumitw/pi-goal`,
      `npm run test:runtime --workspace @narumitw/pi-goal`, root `npm test`, root `npm run check`,
      `just pack-goal`, and `git diff --check`; all pass, root tests report 1,875/1,875, and the dry-run
      package contains `src/run-protocol.ts` while omitting `src/rpc.ts`.

## Completion Checklist

- [x] Missing, omitted, malformed, and explicitly disabled settings reject new starts with RPC
      disabled by default; explicit enable survives save/reload and rollback preserves the previous
      effective policy.
- [x] The only registered and advertised managed-run channels are `pi-goal:start`,
      `pi-goal:cancel`, and `pi-goal:event:${runId}`; former channel strings remain only in a negative
      regression and the breaking migration note, with no handler, alias, reply envelope,
      channel-level or payload-level version field, or compatibility adapter.
- [x] One safe `runId` correlates start, state, cancellation, and terminal outcome before and after
      activation without optional identifier ambiguity.
- [x] Manual, restored, stale, replaced-session, and mismatched Goals cannot be adopted, cancelled, or
      exposed as managed runs.
- [x] Every accepted run emits canonical transitions with at most one terminal state; listener
      failure, activation rollback, cancellation, disable-drain, reload, replacement, and shutdown
      leave no stale run ownership or continuation.
- [x] Settings UI, JSON persistence, README, exported behavior, deterministic tests, runtime smoke,
      package contents, and repository checks agree on the breaking default-off contract.
- [x] Superseded supervision/access planning is absent from this `main`-based branch, and the README
      plus release handoff identify the public API break without publishing or bumping versions.
