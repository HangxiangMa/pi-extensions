# pi-sync startup import reduction plan

## Goal

Reduce `pi-sync` module-import and idle-session startup time by keeping configuration, transaction
recovery, and lifecycle policy eager while loading manager UI, sync operations, and only the selected
storage backend when they are actually required.

## Context

- Installed measurements put `pi-sync` around 570–686 ms per isolated import and about 686 ms in a
  combined run; its factory is effectively free.
- `src/sync.ts` statically imports the manager and all operation routes. `src/backend-factory.ts`
  statically imports Git, WebDAV, and S3 implementations, so WebDAV XML parsing and every backend graph
  load regardless of the configured storage kind.
- Startup must still recover pending snapshot transactions, populate safe command completions, report
  malformed configuration, and run automatic sync when enabled. Moving all imports behind
  `session_start` would improve the printed import number without necessarily improving readiness and
  is not acceptable.
- Execute after the benchmark foundation in
  `docs/plans/2026-08-05_pi-tui-kit-published-startup-convergence-plan.md`, or capture an equivalent
  baseline with its documented protocol.
- Applicable guidance: `docs/extension-conventions.md` lifecycle, commands, TUI/RPC, cancellation,
  packaging, and verification rules, plus `docs/extension-settings.md` loading, malformed-file,
  migration, ordering, and missing-file semantics.

## Architecture

- Keep one `sync.ts` extension owner for the session abort controllers, status key, command contract,
  recovery ordering, and automatic-sync decisions.
- Introduce narrow lazy seams for three real variation points: manager UI, operation routes, and
  backend construction. Cache successful module loads, avoid caching extension-owned transient work,
  and keep failures observable through the existing command/lifecycle channels.
- Change backend creation to an asynchronous factory that imports exactly one of Git, WebDAV, or S3
  after validated config selects the backend. `sync-operations.ts` remains the owner of publication,
  apply, locking, retry, and force-safety policy.
- Evaluate `automatic` and session-inclusion policy before loading operation modules. Transaction
  recovery remains eager enough to protect interrupted applies; missing settings remain side-effect
  free.
- After every lazy-load await, revalidate the owning session signal/context before opening UI,
  acquiring a lock, creating a snapshot, or publishing state.

## Non-Goals

- Change sync settings, storage formats, backend protocols, automatic-sync defaults, command routes,
  conflict UX, or publication safety.
- Skip startup transaction recovery or suppress invalid-settings warnings to improve a benchmark.
- Coordinate with another extension or require Pi TUI Kit APIs newer than the selected published
  dependency.
- Parallelize backend operations or alter their cancellation/commit boundaries.

## Risks

- **Timing displacement:** automatic sync could simply pay the same import cost later. Mitigation:
  benchmark both extension import and first RPC response, and separately smoke automatic sync.
- **Stale continuations:** dynamic imports cannot be aborted. Mitigation: use existing session signals
  and revalidate ownership immediately after each await.
- **Backend contract drift:** making factory creation asynchronous touches every operation caller.
  Mitigation: preserve the `SyncBackend` interface and run all backend contract/orchestration tests.
- **Settings regression:** a lightweight startup decision could bypass validation or migration.
  Mitigation: retain canonical config loaders and test missing, malformed, migrated, and queued-write
  states rather than adding a second parser.

## Plan

- [ ] Capture isolated and combined `pi-sync` baseline JSON with the shared benchmark, and trace the
      eager graph from `src/sync.ts` through manager, operations, backend, Pi TUI Kit, XML, and lock
      modules; record the eager modules and set a pre-edit success threshold of at least 15% and three
      median absolute deviations for both import and idle first-response medians.
- [ ] Add failing loader-boundary tests under `extensions/pi-sync/test/` proving factory registration,
      missing-config session start, and automatic-disabled session start do not load manager,
      operations, or backend modules, while pending recovery still runs and the first required route
      loads its module exactly once.
- [ ] Refactor manager, setup wizard, file selection, and other TUI-only routes behind an injected
      cached UI loader in `src/sync.ts`; verify bare `/sync`, setup, Back/Close, RPC, print/JSON
      rejection, cancellation, disposal, and session replacement through existing manager/lifecycle
      tests.
- [ ] Convert `src/backend-factory.ts` into an asynchronous selected-backend loader that imports only
      Git, WebDAV, or S3 after config validation; update `src/sync-operations.ts` callers and verify all
      backend contract, orchestration, publication, WebDAV, Git, and S3 test suites.
- [ ] Delay importing operation routes until a parsed command needs an operation or validated startup
      policy enables automatic sync/session push; preserve help, config inspection, completion,
      transaction recovery, locking order, and error wording, then verify with command and lifecycle
      tests.
- [ ] Add failure and lifecycle tests for a lazy load racing cancellation, session replacement, and
      shutdown; prove stale continuations perform no UI update, lock acquisition, snapshot creation,
      backend request, or publication, and prove one failed load/operation does not poison unrelated
      later commands.
- [ ] Extend settings/config regressions for side-effect-free missing files, malformed-file warnings,
      migration notices, pending-write ordering, completion refresh, automatic-disabled startup, and
      automatic session push so the optimization cannot introduce a second settings protocol.
- [ ] Re-run the benchmark for missing config, automatic disabled, and a deterministic local backend
      fixture; require the agreed import/idle-response reduction and no meaningful regression in
      automatic startup readiness or first backend command beyond three baseline deviations.
- [ ] Update the `extensions/pi-sync/README.md` package layout for new loader modules, audit all touched
      async paths against both convention guides, run `npm run check`, `just pack sync`, and an offline
      RPC Pi load covering command discovery plus one deterministic local sync route.

## Completion Checklist

- [ ] Idle `pi-sync` startup does not evaluate manager UI, operation implementations, or any storage
      backend, while transaction recovery and configuration diagnostics retain their behavior.
- [ ] An operation loads exactly its selected backend; Git does not load WebDAV/XML or S3, and
      equivalent isolation holds for the other backend kinds.
- [ ] Command, automatic sync, automatic session push, recovery, conflict, cancellation, replacement,
      shutdown, and publication contracts remain deterministic and tested.
- [ ] Missing, malformed, migrated, and concurrently written settings retain the documented semantics.
- [ ] Import and first-response medians beat the recorded threshold without shifting equivalent cost
      into idle session startup.
- [ ] `npm run check`, `just pack sync`, and the offline Pi/RPC smoke pass with no unverified required
      path.
