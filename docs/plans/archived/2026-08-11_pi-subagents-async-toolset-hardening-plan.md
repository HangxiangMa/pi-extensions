# Pi Subagents Async Toolset Hardening Plan

## Goal

Make detached subagent completion delivery durable and deduplicable, expose stable run and generation identities, and keep `subagent_manage` limited to lifecycle mutations while `subagent_inspect` owns queries.

## Architecture

Persist a bounded completion outbox with each retained agent record.

Each turn receives an executor-owned `runId`, monotonically increasing agent-local generation, and unique `completionId`.

The registry must persist a terminal completion before notifying the delivery broker.

Delivery is at least once: successful delivery acknowledges the exact `completionId`, while a crash before acknowledgement may redeliver the same ID without replaying the agent turn.

Session startup restores and enqueues unacknowledged completions only after trust and target validation restore the owning agent.

`subagent_manage` will accept only `interrupt` and `close`; all list and get operations remain under `subagent_inspect`.

## Non-Goals

- Do not add async `subagent_auto` or a workflow runtime.
- Do not guarantee exactly-once Pi message delivery.
- Do not replay interrupted agent turns after restart.
- Do not change completion wake policy defaults.
- Do not publish or release the package.

## Risks

- A completion delivered immediately before a crash may be redelivered; stable completion IDs must make this observable and deduplicable.
- A follow-up can finish before an earlier completion is acknowledged; the outbox must retain both records in order.
- Session replacement must not deliver completions owned by a stale runtime generation.
- Removing `subagent_manage list` is a breaking public-tool change and requires migration documentation and a Changeset.

## Plan

- [x] Add focused failing tests for durable ordered completion restoration, exact-ID acknowledgement, stable completion metadata, and manage-query rejection; the initial focused run failed in all four intended behavior areas.
- [x] Add executor-owned turn generation, run ID, completion ID, and a bounded persisted completion outbox to registry state.
- [x] Persist terminal completion records before broker enqueue and restore pending records on session start without rerunning work.
- [x] Include completion, run, and generation IDs in single and batched completion messages and reject duplicate broker enqueue by completion ID.
- [x] Remove the `list` action and `includeClosed` field from `subagent_manage`, keeping read-only discovery in `subagent_inspect`.
- [x] Update README guidance, compatibility notes, tests, and `.changeset/strong-async-completions.md` with a major bump for the published breaking behavior.
- [x] Audit cancellation, replacement, shutdown, stale generations, persistence ordering, bounded-state reduction, invalid-state rejection, and failure recovery against `docs/extension-conventions.md`.
- [x] Run focused tests, all package tests, `npm run check`, `git diff --check`, `just pack subagents`, and a clean-directory `pi -e ./packages/pi-subagents/src/index.ts --list-models` load smoke; all final checks passed.

## Completion Checklist

- [x] A terminal completion is durably stored before delivery is attempted.
- [x] Multiple unacknowledged turns for one retained agent survive restart in order.
- [x] Acknowledgement removes only the matching completion ID and is persisted.
- [x] Restored completions are delivered without rerunning agent work.
- [x] Completion envelopes expose stable `completionId`, `runId`, and generation values.
- [x] Duplicate enqueue in one broker lifetime emits one completion.
- [x] `subagent_manage` exposes only interrupt and close, and its former list route gives a clear migration error.
- [x] Documentation, Changeset, focused tests, repository gate, diff check, package dry run, and extension load smoke are complete.
