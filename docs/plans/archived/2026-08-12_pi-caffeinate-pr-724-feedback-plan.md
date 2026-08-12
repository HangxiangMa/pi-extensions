# Pi Caffeinate PR #724 Feedback Plan

## Goal

Resolve every feedback item on PR #724 without using a replaced session context and verify the full affected lifecycle.

## Context

The current branch is the exact head branch of PR #724, `fix/pi-caffeinate-dbus-hardening`.
The working tree was clean before this plan was created.
The PR has one submitted review, one unresolved inline thread, no conversation comments, and a passing CI check at commit `ea01e8f9eee883a18034903aeb808b34d4cf441d`.
The PR diff, both commits, package metadata, generated lockfiles, lifecycle source, deterministic tests, and Docker smoke fixtures were inspected against merge base `c98af43a6c71c5839b2e0671db71ed1cc1fc0c51`.

## Review Ledger

| ID | Feedback | Outcome | Evidence |
| --- | --- | --- | --- |
| F1 | Rebind the active D-Bus failure handler after `session_start` replaces the session so it cannot use the prior `ExtensionContext`. | Already addressed by the current code. | `currentSessionContext()` resolves the replacement context at callback time, shutdown clears it, and both D-Bus and same-pattern child-process regression tests prove the prior context receives no warning or status update. |
| F2 | The automated review summary says suggestions follow. | Outdated or superseded. | It contains no independent concern and points to F1, the review's only inline comment. |

## Plan

- [x] Identify PR #724 from the current branch with `gh pr view`, verify local and remote head identity, and inspect the clean working tree.
- [x] Read repository and package instructions, `docs/extension-conventions.md`, the PR description, commits, full diff, checks, review, inline comment, and review thread metadata.
- [x] Refactor active inhibitor failure reporting to mutate inhibitor state but send UI updates only through the current session context; `currentSessionContext()` now serves both retained failure callbacks.
- [x] Add regression tests that replace the session before active D-Bus and child-process failures, then prove only the replacement context receives warning and status updates.
- [x] Run focused pi-caffeinate tests and typechecking, then run the repository CI-equivalent check and applicable package/runtime smokes.
  Evidence: 36 focused tests, package typechecking, 322 repository test files with 3,111 tests, the five-scenario Docker smoke, Changesets status, the nine-file package dry-run, and the Pi entrypoint load pass.
- [x] Re-read all feedback, audit the final diff and lifecycle conventions, and update every ledger row with a final evidence-backed outcome.
  Evidence: the only substantive thread is F1, the sibling callback scan covered D-Bus and child-process failures, and an independent review found no remaining issue.
- [x] Prepare an evidence-backed thread response for delivery after the signed fix commit is pushed.
- [x] Archive this completed plan with the implementation and verification evidence.

## Completion Checklist

- [x] No active inhibitor callback can notify or set status through a replaced session context.
- [x] Active D-Bus and child-process failures still update shared inhibitor state and current-session UI.
- [x] Focused and repository-required checks pass without concealed failures.
- [x] Every feedback item has a final ledger outcome with evidence.
- [x] The final lifecycle diff has no unresolved local review finding.
