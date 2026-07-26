# pi-sync backend contract implementation plan

## Goal

Implement issue #270 by introducing a high-level backend-neutral `SyncBackend`, migrating current S3/R2 persistence behind it without behavior or storage migration, adding contract/orchestration verification, and opening a focused pull request.

## Architecture

- Keep snapshot policy, secret scanning, confirmation, local backup/apply, target switching, and UI in orchestration.
- Add explicit backend identity, snapshot reference, opaque revision, remote head, capability, diagnostic, conflict, and outcome-unknown domain types.
- Implement S3/R2 through one backend selected by a factory from a normalized discriminated profile/destination pair; preserve current object keys, pointer/history JSON, R2 token fallback, target state paths, and flat/v2 settings.
- Express rollback through the same publish-new-head operation as push.
- Separate storage orchestration from Pi lifecycle/command registration so `src/sync.ts` falls below the 1,000-line review threshold.

## Plan

- [x] Add failing backend contract tests covering missing/existing heads, immutable snapshot retrieval, expected-revision publication, typed conflict/outcome-unknown errors, history, diagnostics, capabilities, cancellation, and partial failure; `tsc -p tsconfig.test.json` failed on the intentionally missing `sync-backend` module.
- [x] Implement backend domain types, a configurable in-memory test backend, and shared contract-test support; the focused compiled contract test passes (4 tests).
- [x] Add failing S3 backend/factory tests for identity, wire compatibility, revisions, stale publication, publication verification, history warning, outcome-unknown classification, and diagnostics; `tsc -p tsconfig.test.json` failed on the intentionally missing factory/backend discriminator.
- [x] Move S3 persistence, object layout, snapshot codec/checksum, history, bounded/redacted transport, and diagnostics behind `S3SyncBackend` and the backend factory; focused S3/config/publication tests pass without changing object paths or settings.
- [x] Refactor command orchestration to consume only `SyncBackend`, persist optional `lastRemoteRevision`, re-read after force confirmation, publish rollback as a new head, and classify unknown publication outcomes; focused fake-backend orchestration tests and all 144 pre-existing pi-sync tests pass.
- [x] Decompose `src/sync.ts` below 1,000 lines along command/lifecycle and sync-operation responsibilities; it is 369 lines and package typechecking passes.
- [x] Update pi-sync README/package layout only for the internal backend contract, weak S3 consistency, opaque revision compatibility, and outcome-unknown guidance; it still states that S3/R2 is the only production backend.
- [x] Run `npm run check` (1,571 tests), `just pack-sync` (28 expected package files), inspect the tarball manifest, and run an offline RPC Pi load smoke that emitted the `sync` lifecycle status.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, and every issue #270 requirement. Audited package boundaries, command compatibility, status/diagnostics, settings validation and persistence compatibility, target-state identity, cancellation/disposal/replacement/shutdown, bounded reads/decompression, redaction, publication races, rollback partial failure, and tests; no accepted deviations or unverified paths.
- [x] Commit the focused change, push the branch, open PR #430 linked to #270 with checks/smokes in the body, and verify its 31-file remote diff and started CI status.

## Risks

- S3/R2 lacks atomic compare-and-swap, so its capability must remain explicitly weak while still rejecting every visible mismatch.
- A timeout after pointer PUT can leave publication outcome unknown; errors must not falsely report no remote change.
- Existing tests depend on exact HTTP request order and object paths; migration must preserve them.
- Legacy state has no usable revision and may contain `lastRemoteEtag`; it must remain readable without reinterpretation.

## Completion Checklist

- [x] Backend contract and S3 migration satisfy all issue acceptance criteria.
- [x] Existing S3/R2 configuration, remote layout, state paths, manager, and direct routes remain compatible.
- [x] Full repository gate, package dry run, and Pi load smoke pass.
- [x] New pull request #430 is open from the focused branch and references #270.
