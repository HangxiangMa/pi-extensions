## Goal

Deprecate `@narumitw/pi-jupyter` without a replacement, preserve its source under `deprecated/`, remove it from active repository workflows, and mark every published npm version deprecated.

## Context

`pi-jupyter` is currently an experimental extension published through version `0.49.3`. Deprecation retires its static terminal notebook preview without deleting historical source or published versions.

## Non-Goals

- Delete historical source or published npm versions.
- Introduce or recommend a replacement.
- Publish a new package version; this package move and direct registry metadata change do not use Changesets.

## Plan

- [x] Move `packages/pi-jupyter/` to `deprecated/pi-jupyter/`, update archived package metadata and documentation, and verify implementation files remain unchanged against `HEAD`; byte comparisons passed for all source, test, license, and TypeScript-config files.
- [x] Remove the extension from the active package catalog, package scripts, and workspace lock data; targeted searches and `npm pkg get name --workspaces` confirm it is no longer active.
- [x] Run boundary checks, the CI-equivalent `npm run check`, a dry-run pack of the archived reference, and final diff integrity checks; all 2,363 tests passed, the boundary validator passed, and the pack contains the expected ten published files.
- [x] Deprecate all published `@narumitw/pi-jupyter` versions on npm with `Deprecated: this package is no longer maintained.`, then verify registry metadata; direct registry inspection confirms all 15 versions carry the exact message.

## Risks

- Existing users lose the preview workflow after uninstalling because there is no replacement.
- A stale workspace or lockfile link could keep testing or publishing an unsupported extension.
- npm registry mutation may require renewed maintainer authentication; verify metadata after any failed attempt.

## Rollback / Recovery

- Repository rollback: move the tree back to `packages/`, restore root references, and regenerate the lockfile.
- Registry rollback: run `npm deprecate '@narumitw/pi-jupyter@*' ''` with an authenticated maintainer account, then verify every version has empty deprecation metadata.

## Completion Checklist

- [x] Source exists only under `deprecated/pi-jupyter/`, with an explicit no-replacement warning.
- [x] Active workspace discovery, documentation, tests, and publishing workflows exclude the package.
- [x] Repository checks and archived-reference pack inspection pass with no unintended diff.
- [x] npm reports the deprecation message for every published version.
