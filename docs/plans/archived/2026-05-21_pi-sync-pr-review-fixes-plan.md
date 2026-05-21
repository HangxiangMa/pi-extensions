## Goal

Fix the pi-sync PR review blockers so startup auto-sync is safe by default, remote latest updates do not silently overwrite concurrent pushes, and snapshot apply cannot leave Pi settings partially written after invalid snapshot content.

## Context

PR #59 adds `@narumitw/pi-sync` with R2/S3 snapshot sync. Review found three blockers: first-run auto-sync can silently pull over local settings, latest pointer updates can race without a real compare-and-swap, and `applySnapshot()` writes files before prevalidating the full snapshot.

## Plan

- [x] Change startup auto-sync first-run behavior in `extensions/pi-sync/src/sync.ts` so a machine with no `lastAppliedSnapshot` never silently pulls over existing local files; verified by `syncBoth()` rejecting auto first-run local+remote content with a warning requiring manual `/pisync pull` or `/pisync push`.
- [x] Restore safe remote latest concurrency in `S3Client` and `uploadSnapshot()` using R2-compatible conditional update semantics or an explicit documented fallback that cannot claim fail-safe CAS; verified by R2 `/pisync push --yes` succeeding without `412 PreconditionFailed` and README documenting the best-effort re-read fallback rather than atomic CAS.
- [x] Add full snapshot preflight before `applySnapshot()` writes files: duplicate path detection, safe path validation, base64/checksum validation, and deletion list calculation; verified by `preflightSnapshotApply()` building all writes/deletes before `applySnapshot()` writes or removes files.
- [x] Update `extensions/pi-sync/README.md` to describe the safer auto-sync first-run behavior and the actual concurrency guarantees; verified by README text describing first-run skip and best-effort remote re-read guard.
- [x] Run `npm run check` and `npm --workspace @narumitw/pi-sync pack --dry-run`; verified both commands pass.
- [x] Commit and push the review fixes to `feat/pi-sync-r2`; verified after commit/push step.

## Risks

- R2 conditional write behavior may differ between missing and existing objects; if missing-object CAS remains unsupported, remote-empty first push may need to accept a narrow race or use a separate lock object.
- Auto-sync UX can become too conservative if first-run detection treats legitimate new-machine pulls as conflicts; README should explain the manual first pull requirement when local settings already exist.

## Rollback / Recovery

- If the concurrency fix breaks R2 writes, revert the latest commit and keep manual `/pisync push` working with the previous re-read guard while documenting the limitation.
- If apply preflight rejects valid snapshots, users can still recover local state from `~/.pi/agent/.pisync/backups/` created before pull/rollback.

## Completion Checklist

- [x] First-run auto-sync cannot silently overwrite existing local Pi settings, verified by code path review in `syncBoth()`/auto-sync logic.
- [x] Remote latest updates reject already-visible concurrent changes without the previous R2 `412` failure for normal pushes, verified by an R2 push test and explicit documented best-effort fallback evidence.
- [x] Snapshot apply validates the whole snapshot before changing files, verified by `applySnapshot()` preflight code structure.
- [x] Documentation matches behavior, verified by `extensions/pi-sync/README.md` review.
- [x] Quality gates pass, verified by `npm run check` and `npm --workspace @narumitw/pi-sync pack --dry-run`.
- [x] PR #59 contains the review-fix commit, verified by git push output.
