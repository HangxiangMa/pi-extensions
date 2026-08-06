## Goal

Deprecate `@narumitw/pi-google-genai` in favor of the `grounding-with-google-genai` agent skill, preserve its source under `deprecated/`, remove it from active repository workflows, and mark every published npm version deprecated.

## Context

The replacement skill provides the same Google Search, Maps, and URL Context grounding categories as bounded one-shot calls. The npm package currently has published versions through `0.49.3` and no deprecation metadata.

## Non-Goals

- Delete historical source or published npm versions.
- Change the replacement skill.
- Migrate or expose users' stored API keys automatically.
- Publish a new package version; this package move and direct registry metadata change do not use Changesets.

## Plan

- [x] Move `packages/pi-google-genai/` to `deprecated/pi-google-genai/`, update archived package metadata and migration documentation, and verify implementation files remain unchanged with Git rename/diff evidence; byte comparisons against `HEAD` passed for all source, test, license, and TypeScript-config files.
- [x] Remove the extension from the root Pi manifest, package script, active package catalog, and workspace lock data; `npm pkg get name --workspaces` and targeted searches confirm it is no longer an active workspace or manifest entry.
- [x] Run boundary checks, the CI-equivalent `npm run check`, a dry-run pack of the archived reference, and final diff integrity checks; all 2,387 tests passed, the boundary validator passed, and the pack contains the expected nine published files.
- [ ] Deprecate all published `@narumitw/pi-google-genai` versions on npm with the replacement message, then verify registry metadata through `npm view`. Blocked: the registry write returned `E404` for insufficient package permission after `npm whoami` returned `E401`; `npm view @narumitw/pi-google-genai@0.49.3 deprecated` remains empty.

## Risks

- Existing users may lose grounding tools if they uninstall before configuring `GEMINI_API_KEY` for the replacement skill.
- A stale root manifest or lockfile link could continue loading or releasing an unsupported extension.
- npm registry mutation may require renewed authentication; if partially applied, verify every published version before retrying.

## Rollback / Recovery

- Repository rollback: move the tree back to `packages/`, restore root references, and regenerate the lockfile.
- Registry rollback: run `npm deprecate '@narumitw/pi-google-genai@*' ''` with an authenticated maintainer account, then verify every version has empty deprecation metadata.

## Completion Checklist

- [x] Source exists only under `deprecated/pi-google-genai/`, with an explicit warning and migration guidance to `grounding-with-google-genai`.
- [x] Active manifests, workspace discovery, documentation, tests, and publishing workflows exclude the package.
- [x] Repository checks and archived-reference pack inspection pass with no unintended diff.
- [ ] npm reports the deprecation message for every published version.
