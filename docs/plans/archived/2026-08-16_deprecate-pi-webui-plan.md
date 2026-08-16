## Goal

Deprecate `@narumitw/pi-webui` without a replacement, preserve its source under `deprecated/`, remove it from active repository workflows, and prepare npm deprecation evidence.

## Context

`pi-webui` is an experimental extension currently published through `0.49.3`.

Deprecation retires the current-session browser companion without deleting historical source.

## Non-Goals

- Delete historical source or published npm versions.
- Introduce or recommend a replacement.
- Publish a new package version.

## Plan

- [x] Move `packages/pi-webui/` to `deprecated/pi-webui/`, update archived package metadata and documentation, and verify implementation files remain unchanged against `HEAD`; byte comparisons passed for all source, test, license, config, and build-script files, and the obsolete package-scoped `AGENTS.md` was intentionally removed.
- [x] Remove `pi-webui` from the active package catalog, package scripts, and workspace lock data; `npm pkg get name --workspaces --json` no longer reports it, and targeted searches find no active `packages/pi-webui`, `pack:webui`, or install-table references.
- [x] Run boundary checks, the CI-equivalent `npm run check`, a dry-run pack of the archived reference, and final diff integrity checks; boundary validation passed, `npm pack ./deprecated/pi-webui --dry-run --json` produced the expected 30-file package without tests or AGENTS.md, and `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=commit.gpgsign GIT_CONFIG_VALUE_0=false npm run check` passed.
- [x] Deprecate all published `@narumitw/pi-webui` versions on npm with a no-maintenance message, then verify registry metadata; user completed npm OTP authentication, and direct registry inspection confirms all 23 versions carry `Deprecated: this package is no longer maintained.`.

## Risks

- Existing users lose the browser companion after uninstalling because there is no replacement.
- A stale workspace or lockfile link could keep testing or publishing an unsupported extension.
- npm registry mutation may require renewed maintainer authentication; verify metadata after any failed attempt.

## Rollback / Recovery

- Repository rollback: move the tree back to `packages/`, restore root references, and regenerate the lockfile.
- Registry rollback: run `npm deprecate '@narumitw/pi-webui@*' ''` with an authenticated maintainer account, then verify every version has empty deprecation metadata.

## Completion Checklist

- [x] Source exists only under `deprecated/pi-webui/`, with an explicit no-replacement warning.
- [x] Active workspace discovery, documentation, tests, and publishing workflows exclude the package.
- [x] Repository checks and archived-reference pack inspection pass with no unintended diff.
- [x] npm reports the deprecation message for every published version.
