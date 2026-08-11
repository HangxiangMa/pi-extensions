# Pi-sync shared state access plan

## Goal

Prevent overlapping pi-sync work in one process from failing with `Lock file is already being held`, while preserving exclusive legacy-state migration.

## Plan

- [x] Add deterministic regression tests in `packages/pi-sync/test/state-directory.test.ts`; the pre-fix overlapping-user test timed out and the focused post-fix suite passed 12 tests.
- [x] Update `packages/pi-sync/src/state-directory.ts` to bypass the legacy migration lock for canonical state and share one process-owned guard across concurrent legacy state users.
- [x] Add `.changeset/fuzzy-locks-share.md` with a patch bump for the published behavior fix.
- [x] Audit lock compromise, acquisition failure, release, concurrent migration, and lifecycle paths; `npm run check` passed all validators and 2,989 tests.

## Completion Checklist

- [x] The overlapping-user regression timed out before the fix and passes afterward without lock contention.
- [x] All 12 state-directory migration and access tests pass.
- [x] The repository CI-equivalent `npm run check` passes.
- [x] The completed plan is archived at `docs/plans/archived/2026-08-11_pi-sync-shared-state-access-plan.md`.
