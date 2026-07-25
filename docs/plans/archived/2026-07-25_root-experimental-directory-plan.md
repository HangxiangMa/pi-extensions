# Root experimental directory migration plan

## Goal

Move standalone experimental extension packages from `extensions/experimental/<package>` to `experimental/<package>`, including `pi-file-quote`, while preserving workspace checks, latest-Pi coverage, manual-only publishing, and production release exclusion.

## Plan

- [x] Updated repository-script and publish-selection tests for root `experimental/*`; focused tests first failed because shared-version discovery included the experiment and manual publishing still referenced the old path.
- [x] Moved `pi-file-quote` to `experimental/pi-file-quote` and updated workspace, TypeScript, test discovery, boundary validation, Pi-version matrix, generic Just recipes, package metadata, symlink, and lockfile paths.
- [x] Updated `AGENTS.md`, `docs/extension-conventions.md`, root/package READMEs, and live path guidance; retained explicitly historical archived-plan references.
- [x] Found no stale live-path references, formatted intended files, passed the isolated repository gate with 1,392 tests, inspected the six-file package dry run, and loaded the moved extension with isolated Pi.

## Completion Checklist

- [x] No active package or live guidance uses `extensions/experimental/`.
- [x] Root workspaces and TypeScript/test/boundary discovery include `experimental/*`.
- [x] Shared version bumps and automated publishing continue to exclude root experimental packages.
- [x] Generic `just pack`, `try`, `install`, and `publish` resolve root experimental packages; publishing retains its warning.
- [x] `experimental/pi-file-quote` passes root checks, package dry run, and Pi loading.
