## Goal

Deprecate `@narumitw/pi-image-drop` without a replacement, preserve its source under `deprecated/`, remove it from active repository workflows, and mark published npm versions deprecated.

## Context

`pi-image-drop` is a stable extension currently published through `0.49.4`.

Deprecation retires the standalone browser image-staging workflow without deleting historical source.

## Non-Goals

- Delete historical source or published npm versions.
- Introduce or recommend a replacement.
- Publish a new package version.

## Plan

- [x] Move `packages/pi-image-drop/` to `deprecated/pi-image-drop/`, update archived package metadata and documentation, and verify implementation files remain unchanged against `HEAD`; byte comparisons passed for all source, tests, changelog, license, config, and build-script files, with only README and package metadata intentionally changed.
- [x] Remove `pi-image-drop` from the active package catalog, root Pi manifest, package scripts, dev loading, and workspace lock data; `npm pkg get name --workspaces --json` no longer reports it, and targeted searches find no active `packages/pi-image-drop`, `pack:image-drop`, or install-table references.
- [x] Run boundary checks, the CI-equivalent `npm run check`, a dry-run pack of the archived reference, and final diff integrity checks; boundary validation passed, `npm pack ./deprecated/pi-image-drop --dry-run --json` produced the expected 25-file package without tests or fixtures, and `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false npm run check` passed.
- [x] Deprecate all published `@narumitw/pi-image-drop` versions on npm with a no-maintenance message, then verify registry metadata; user completed npm OTP authentication, and direct registry inspection confirms all 20 versions carry `Deprecated: this package is no longer maintained.`.

## Risks

- Existing users lose the standalone browser image-staging workflow after uninstalling because there is no replacement.
- A stale root Pi manifest, workspace, or lockfile link could keep loading, testing, or publishing an unsupported stable extension.
- npm registry mutation may require renewed maintainer authentication; verify metadata after any failed attempt.

## Rollback / Recovery

- Repository rollback: move the tree back to `packages/`, restore root references, and regenerate the lockfile.
- Registry rollback: run `npm deprecate '@narumitw/pi-image-drop@*' ''` with an authenticated maintainer account, then verify every version has empty deprecation metadata.

## Completion Checklist

- [x] Source exists only under `deprecated/pi-image-drop/`, with an explicit no-replacement warning.
- [x] Active workspace discovery, documentation, root Pi loading, tests, and publishing workflows exclude the package.
- [x] Repository checks and archived-reference pack inspection pass with no unintended diff.
- [x] npm reports the deprecation message for every published version.
