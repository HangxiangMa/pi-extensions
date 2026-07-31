# Narrow pi-tui-kit dependency ranges plan

## Goal

Prevent extensions that use `@narumitw/pi-tui-kit` from resolving an older incompatible minor by replacing the broad `<1` dependency with the tested `^0.40.0` minor range and preserving explicit compatibility ranges during shared version bumps.

## Context

`@narumitw/pi-worktree@0.39.0` resolved `@narumitw/pi-tui-kit@0.36.0` from an existing Pi package lock even though its `choice` screen requires the newer menu API. The old kit returned no component for that screen, and Pi crashed while focusing `undefined`. All current kit consumers are tested with the repository's `0.40.x` kit; for a zero-major package, `^0.40.0` accepts only `>=0.40.0 <0.41.0`.

## Non-Goals

- Changing extension commands, menus, settings, or lifecycle behavior.
- Updating the user's `~/.pi/agent/npm` installation as part of the repository change.
- Changing publication selection or package versions.

## Plan

- [x] Add focused repository-script tests that require every active or experimental kit consumer to use a bounded `^0.minor.patch` range at least `0.40.0` and require shared version bumps to preserve explicit internal compatibility ranges; red evidence: both tests failed against `<1` and the bump script rewrote `^0.40.0` to `<2`.
- [x] Update every active and experimental extension manifest that depends on `@narumitw/pi-tui-kit`, regenerate `package-lock.json` with pinned npm `12.0.2`, and change the shared bump script to leave consumer-owned internal ranges unchanged; evidence: 18 manifests and 18 lockfile entries use `^0.40.0`, with focused tests passing.
- [x] Run the repository CI-equivalent check and dry-pack every changed extension workspace, confirming each tarball retains `^0.40.0` and expected package contents. Evidence: all 18 dry-packs, Biome, boundaries, typechecks, focused tests, and dependency-tree validation pass; the full Node 24 Linux/modern-Git container gate passes all 1,873 tests. The host macOS gate exposed three platform-sensitive baseline failures outside this diff, all covered successfully by the Linux gate or focused reruns.
- [x] Audit package/release-tooling changes against `docs/extension-conventions.md`, confirm no command, settings, lifecycle, or custom-TUI behavior changed, and archive this completed plan. Audit covered package metadata, dependency ownership, publication ordering, lockfile alignment, and dry-pack contents.

## Completion Checklist

- [x] No active or experimental extension declares a broad `<1` range for `@narumitw/pi-tui-kit`.
- [x] Future shared patch/minor bumps cannot silently widen the explicit kit range.
- [x] `package-lock.json`, tests, checks, and all affected package dry-runs pass in the CI-equivalent Linux environment.
- [x] No unrelated production behavior is changed.
