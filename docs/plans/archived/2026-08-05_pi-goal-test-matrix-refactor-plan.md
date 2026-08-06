# pi-goal Test Matrix Refactor Plan

## Goal

Replace the 4,800-line `packages/pi-goal/test/goal.test.ts` integration monolith with a small shared
fixture and behavior-owned test files so failures, ownership, and change impact are easier to locate,
without reducing coverage or changing production code.

## Context

- This is plan 4 and the final planned step of the KISS refactor sequence. It starts only after the
  transition-ownership, tool-policy, and composition-root plans are complete and archived so tests
  move against stable production boundaries.
- `goal.test.ts` currently mixes registration/settings, tool policy, factory isolation, command
  parsing, accounting, persistence/reload, prompts, terminal tools, resume/edit rollback, safety,
  continuation races, budgets, provider errors, and compaction in one file.
- The suite uses shared temporary settings files plus two registration helpers. Keeping those fixtures
  local originally avoided mock drift, but the resulting file now obscures which behavior owns a
  failure and exceeds the repository's normal source-size boundary by a large margin.
- Existing `goal-queue.test.ts`, `goal-run-protocol.test.ts`, `command.test.ts`, `persistence.test.ts`,
  and other focused suites already own their domains. This plan must avoid moving duplicate cases
  into them without first identifying distinct integration coverage.

## Architecture

Create one test-only Goal factory fixture module that owns temporary settings creation/cleanup,
canonical registration, and any genuinely shared helpers. It must not become a second mock Pi or hide
lifecycle ordering behind scenario-specific convenience methods. Continue using the repository's
`test/support.ts` Pi/context mocks as the integration boundary.

Split the monolith by behavior and production owner, using a small number of files rather than one
file per hook. The final groups should cover at least:

- factory registration, settings load, tool policy, and multi-factory isolation;
- accounting, persistence/reload, status, prompts, and terminal tools;
- command-driven pause/resume/edit/clear plus safety epoch and rollback behavior;
- continuation, queued non-goal input, budget wrap-up, provider retry/error, and compaction lifecycle.

Finalize exact names from current test inventory after the preceding source plans establish adapter
boundaries. Keep cross-lifecycle scenarios together with the behavior whose invariant they prove.
Tests that duplicate a focused pure-module suite should either retain and document their integration
value or be removed only after a before/after coverage inventory proves equivalence.

## Non-Goals

- Change production source, package behavior, public exports, test framework, or root test runner.
- Rewrite assertions for style, rename every test, or introduce a custom scenario DSL.
- Increase parallelism without proving temporary settings, timers, event listeners, and factories are
  isolated.
- Mechanically split by line number or create many shallow test files.
- Merge queue, managed-run, menu, settings, persistence, or pure helper suites into the new files.

## Risks

- Moving tests can silently lose top-level cleanup hooks, settings fixtures, timer disposal, or import
  ordering.
- Shared mutable fixture paths can make newly separate files race under Node's test concurrency.
- A broad helper DSL can make tests shorter while hiding the lifecycle boundaries they are meant to
  verify.
- Test count alone cannot prove equivalent coverage when parameterized subtests or assertions change.

## Rollback / Recovery

This plan changes tests only. Move one behavior group at a time, run the source and destination files
together, and delete the original block only after the moved tests pass. If fixture isolation cannot
be proven, keep that group in the original file and leave the relevant task open rather than adding
cross-file global state.

## Plan

- [x] Inventory every top-level test and subtest in `goal.test.ts`, assigning each to one behavior
      owner and recording its current test name, required fixture, timer/listener cleanup, and overlap
      with focused suites; verify every test has exactly one destination or an evidence-backed
      duplicate-removal decision before moving code.
- [x] Establish the post-plan-3 baseline by recording total discovered pi-goal tests and passing
      `npm test`, `npm run check --workspace @narumitw/pi-goal`, and
      `npm run test:runtime --workspace @narumitw/pi-goal`; retain the baseline output for final
      comparison.
- [x] Extract only canonical settings-fixture and Goal-registration setup into a test-owned support
      module with per-test or collision-free lifecycle cleanup; verify two concurrently eligible test
      files can use it without sharing mutable runtime, settings bytes, timers, or listeners.
- [x] Move factory registration, settings load, tool-policy, failed visibility activation, and
      multi-factory isolation cases into one behavior-owned test file; run it together with the
      shrinking original file and verify all original test names and assertions remain represented.
- [x] Move accounting, persistence/reload, status formatting, prompt trust boundary, `goal_complete`,
      and `goal_blocked` integration cases into one behavior-owned test file; verify session entries,
      tool results, terminal publication, and compatibility exports remain asserted at the same
      integration level.
- [x] Move pause/resume/edit/clear, stale-ID rotation, safety epoch, no-progress, hard-cap, and failed
      prompt-delivery rollback cases into one behavior-owned test file; verify command and lifecycle
      boundaries remain explicit rather than hidden by fixture helpers.
- [x] Move continuation settlement, transformed queued input, budget wrap-up, tool loss, provider
      retry/error classification, compaction, and stale recovery cases into one lifecycle-owned test
      file; verify timers, pending markers, aborts, event listeners, and contexts are disposed after
      every test.
- [x] Remove the empty original `goal.test.ts` or retain only a small integration-smoke group whose
      cross-domain purpose cannot belong elsewhere, documenting that purpose adjacent to the tests;
      verify no file remains over 1,000 lines without a current responsibility-based justification.
- [x] Compare before/after test names, subtest counts, assertions for critical state/session/tool
      outcomes, and focused-suite overlap; verify there are no accidental deletions, duplicate test
      registrations, `.only`/`.skip` markers, order dependencies, or new global mutable fixtures.
- [x] Run each new file independently through the repository's compiled-test path, then run
      `npm test` repeatedly enough to expose ordering or fixture races, followed by root
      `npm run check`, `npm run test:runtime --workspace @narumitw/pi-goal`, and
      `git diff --check`; record exact counts and passing evidence in this plan.

## Execution Evidence

- Replaced the 4,818-line `goal.test.ts` with eight behavior-owned files: tool policy, factory
  isolation, contracts, command transitions, safety, continuation, budget lifecycle, and error
  lifecycle. The largest new file is 854 lines.
- Added `test/support/goal-fixture.ts` for collision-free temporary settings, canonical registration,
  and shared state/tool assertions. It builds on the repository mock Pi/context and does not hide
  event ordering behind a scenario DSL.
- Before/after inventory found exactly 127 top-level tests in the old matrix and exactly the same 127
  names in the eight destinations (`diff` empty). Existing focused queue, managed-run, menu, settings,
  persistence, and pure helper suites remain separate.
- Independent split-file execution passed. A clean compiled-test output directory then ran all 293
  pi-goal tests without stale removed files, duplicates, skips, or failures. Root `npm test` and
  `npm run check` each passed 2,406 tests.
- Temporary settings are created per Node test-file process and removed by the support fixture's
  `after` hook; timer, listener, context, and factory cleanup assertions remain with their behavior.
- `goal-queue.test.ts` remains over 1,000 lines because it is a coherent ordered-queue integration
  matrix sharing one queue-aware harness; an adjacent responsibility justification now documents the
  accepted exception. No other pi-goal test file exceeds 1,000 lines.
- Final checks also include pi-goal check, runtime smoke, package dry run, and `git diff --check`; no
  production behavior changed as part of the test-only split.

## Completion Checklist

- [x] Every original integration scenario has one traceable destination or an evidence-backed
      duplicate-removal record.
- [x] Test files follow coherent behavior ownership, and the shared fixture exposes setup rather than
      hiding lifecycle policy.
- [x] Temporary settings, timers, event listeners, contexts, and extension factories are isolated and
      cleaned up across independent and full-suite execution.
- [x] No production source or public behavior changed, and focused domain suites were not blurred into
      the integration matrix.
- [x] Independent new-file runs, repeated full tests, package check, runtime smoke, root check, and
      `git diff --check` pass with before/after coverage evidence recorded.
