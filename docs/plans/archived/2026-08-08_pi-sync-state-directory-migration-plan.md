# pi-sync state directory migration plan

## Goal

Move pi-sync operational state from `<agent-dir>/.pisync/` to `<agent-dir>/pi-sync/` without losing existing state, syncing either state directory, or permitting concurrent upgraded processes to publish competing migrations.

## Context

The directory contains persistent sync state, lock metadata, backups, transaction journals, and the rebuildable Git cache. Existing installations therefore need a data-preserving directory migration rather than a string-only rename. The user’s `.pysync` spelling is treated as a typo for the repository’s actual legacy name, `.pisync`.

Applicable convention areas are extension lifecycle, file mutation/concurrency, settings/storage migration, documentation, deterministic tests, CI-equivalent verification, and package release intent. Relevant MUST verification methods are Test, Review, and `npm run check`; package metadata and entrypoint behavior are unchanged, so no Pi load smoke is planned.

## Architecture

A dedicated state-directory module owns canonical and legacy paths, fails closed on symlinked or conflicting roots, selects exactly one root, and performs an atomic same-parent rename. Startup only reports migration guidance because an idle older process cannot be detected safely. The explicit `/sync migrate-state` route requires confirmation that other Pi processes are closed (or `--yes` for an already reviewed RPC workflow). A migration guard outside both roots serializes upgraded processes; a present legacy operation lock or guard defers migration and keeps the process on the legacy root. Mixed old/new extension versions cannot share the new migration protocol, so documentation requires closing older Pi instances during migration and runtime conflict detection refuses to choose when both roots exist.

Both `pi-sync/` and `.pisync/` remain permanently excluded from snapshot collection. No remote data, settings schema, or backend storage layout changes.

## Risks

- An older pi-sync process can start after an explicitly approved migration because it does not know the new migration guard. Requiring user confirmation that other processes are closed, atomic rename, legacy lock checks, both-root fail-closed detection, and upgrade guidance reduce but cannot eliminate misuse of a mixed-version runtime after approval.
- A crash can leave the migration guard stale; `proper-lockfile` stale recovery must keep later starts recoverable.
- Existing symlinked state roots will be rejected instead of followed to prevent migration outside the agent directory.

## Rollback / Recovery

Before release, rollback is reverting the code and restoring `.pisync/` in test fixtures. After migration, users can close all Pi processes and atomically rename `pi-sync/` back to `.pisync/` when no `.pisync/` already exists. If both roots exist, pi-sync must refuse stateful work until the user preserves both directories and manually chooses/reconciles one; it must never merge or delete either automatically.

## Plan

- [x] Add focused state-directory tests incrementally for canonical selection, atomic legacy migration, busy deferral, concurrent upgraded-process serialization, both-root refusal, symlink refusal, and snapshot exclusion; before each production behavior slice, verify its new test fails for the intended reason. Evidence: the initial focused run failed both canonical-path and exclusion assertions; the migration slice then failed TypeScript compilation because `prepareStateDirectory` did not exist.
- [x] Add `packages/pi-sync/src/state-directory.ts` and shared plain-fs lock adapter ownership in matching TDD slices so one canonical resolver and guarded migration produce `pi-sync/`, preserve legacy contents, defer on legacy activity, and fail closed on ambiguous roots; verify with the focused state-directory tests. Evidence: all 8 focused state-directory tests passed.
- [x] Integrate startup migration guidance and the explicit guarded `/sync migrate-state` route, route all state and Git cache paths through the canonical resolver, and update affected tests; verify with all pi-sync tests. Evidence: the pre-security-review package run passed all 300 compiled pi-sync tests; the final package run covers the explicit route and non-mutating startup behavior.
- [x] Update `packages/pi-sync/README.md` and a patch Changeset with the canonical path, explicit/deferred migration behavior, mixed-version limitation, recovery steps, and permanent old/new exclusions; verify package prose and release intent by review. Evidence: README documents all named behaviors and `changeset status` reports `@narumitw/pi-sync` patch intent from `quiet-sync-folders`.
- [x] Run `npm run check`, then run `just pack sync` and inspect the tarball contents because published source and release intent changed. Evidence: the final `npm run check` passed all validators and 2,590 tests; `just pack sync` reported 52 expected files, including the new state-directory and shared lock modules, with no tests or plan artifacts.
- [x] Perform a read-only security review of the final diff covering path/symlink boundaries, migration races and locks, data loss, unintended snapshot inclusion, permissions/secrets, and denial-of-service recovery; fix only confirmed findings through the hardening workflow and re-run affected checks. Evidence: review confirmed that automatic startup migration could not prove an idle older Pi process was absent; a failing regression test reproduced the unwanted move, and the hardened flow now requires explicit `/sync migrate-state` approval. A sibling-route check also caught and rejected unsupported `--force`. Re-review found no confirmed security finding in the final scoped diff; the documented residual is user-approved mixed-version misuse after confirmation.

## Completion Checklist

- [x] New installations create and use `<agent-dir>/pi-sync/`, while safe existing installations retain all `.pisync/` contents after migration. Evidence: focused clean-install and nested-content migration tests pass.
- [x] Active legacy operations defer migration, upgraded processes serialize migration, and ambiguous or symlinked roots fail closed without deletion or merging. Evidence: focused lock, guard, concurrency, conflict, and symlink tests pass.
- [x] Neither current nor legacy state can enter a local or remote snapshot. Evidence: denial tests cover `pi-sync/`, `.pisync/`, and the migration guard.
- [x] Focused tests, all pi-sync tests, `npm run check`, and `just pack sync` pass with evidence. Evidence: 9 state-directory tests, 303 final pi-sync tests (302 before the final cancellation-only test), 2,590 root tests, and the 52-file pack inspection pass.
- [x] User documentation, release intent, rollback guidance, convention audit, and final security-review result are recorded. Evidence: README and patch Changeset are current; final audit covered command routes/modes, cancellation, startup/session replacement, state-path concurrency, symlinks, snapshot denial, recovery, and packaging with no accepted convention deviation.
