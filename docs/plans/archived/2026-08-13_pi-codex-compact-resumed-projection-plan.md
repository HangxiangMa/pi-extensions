# Pi Codex Compact resumed projection plan

## Goal

Keep repeated Codex Remote V2 compaction working after session resume when Pi rebuilds the newest checkpoint's retained range with older compaction summaries interleaved among its fingerprinted messages.

## Context

Issue #726 reports that `projectCheckpointContext()` requires the newest checkpoint's kept-message fingerprints to appear contiguously after its fallback summary.

A credential-free reproduction with Pi 0.84.1's real `buildSessionContext()` confirms that resumed repeated compaction can place an older `compactionSummary` inside that retained range, so projection fails even though every stored kept-message fingerprint is valid.

## Risks

The projection must not skip arbitrary messages or remove a summary created after the active checkpoint.

Existing version-1 checkpoints whose stored fingerprints include a compaction summary must remain projectable.

## Plan

- [x] Add a focused regression to `packages/pi-codex-compact/test/checkpoint.test.ts` that uses Pi's context builder to reproduce the resumed repeated-compaction ordering; `npx vitest run packages/pi-codex-compact/test/checkpoint.test.ts` failed at `assert.ok(projected)` with 7 passing tests and 1 failing regression.
- [x] Update `packages/pi-codex-compact/src/checkpoint.ts` to match exact kept-message fingerprints in order while skipping only finite-timestamped older structural compaction summaries inside the checkpoint-covered range.
- [x] Add boundary coverage proving trailing older summaries are removed, changed or unexpected messages still fail closed, newer summaries are rejected within or preserved after the covered range, and stored summary fingerprints remain compatible; all 11 focused tests pass.
- [x] Add patch Changeset `.changeset/tidy-codex-checkpoints.md` for `@narumitw/pi-codex-compact`; `npm run changeset:status` resolves the next release as 0.50.1.
- [x] Run verification: 11 focused checkpoint tests passed, the package check passed, `npm run check` passed with 361 files and 3,671 tests, and the credential-free repeated-compaction smoke projected `["user", "user"]` while preserving the later message.
- [x] Audit the final diff against issue #726, `docs/extension-conventions.md`, and the touched-area checklist; exact non-summary fingerprint validation and message order remain fail-closed, no settings or asynchronous lifecycle flow changed, no metadata/load smoke is required, and issue #726 now has the repository's `bug` label.

## Completion Checklist

- [x] Resumed repeated-compaction context projects the newest opaque checkpoint without weakening exact fingerprint and ordering checks.
- [x] Existing checkpoint persistence remains version-compatible, and unrelated context after the checkpoint-covered range is preserved.
- [x] Focused tests, package validation, the repository CI-equivalent gate, and the deterministic smoke pass with recorded evidence.
- [x] The final diff contains only the focused fix, regression coverage, Changeset, and archived completed plan.
