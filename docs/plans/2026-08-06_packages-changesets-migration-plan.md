# Packages and Changesets migration plan

## Goal

Consolidate every active production and experimental extension under a flat `packages/<package>/`
workspace root, preserve stable-versus-experimental behavior explicitly, and replace lockstep releases
with independent package versions managed by Changesets. Deliver the migration on a focused branch
with stepwise commits, full verification, a pushed remote branch, and a pull request.

## Context

- The repository currently has 19 production extensions, 6 experimental extensions, and one reusable
  library, all carrying the shared manifest version `0.49.5`.
- npm currently has `0.49.5` for only five packages, `0.49.4` for `pi-starship`, and `0.49.3` for the
  other packages. Enabling `changeset publish` without reconciliation could publish unchanged phantom
  `0.49.5` versions.
- The user selected a flat package layout plus Changesets and approved reconciling each package
  manifest to its already-published npm version before release automation is enabled.
- Direct installation of the repository as a Git Pi package currently relies on conventional
  `extensions/` discovery, so the root Pi manifest must explicitly preserve production-extension
  loading after the move.

## Architecture

- `packages/<package>/package.json#pi.extensions` identifies extension packages; packages without it
  are reusable libraries.
- `package.json#piExtension.lifecycle` records `stable` or `experimental` for every active extension.
  The boundary validator owns completeness and accepted-value checks.
- The private root `package.json#pi.extensions` explicitly lists every stable extension entrypoint and
  omits experimental extensions, preserving direct Git-install behavior without path-based lifecycle
  inference.
- Changesets has no `fixed` or `linked` groups, so every package versions independently. Package
  versions start from the versions already published on npm; the private root uses a non-release
  `0.0.0` version.
- `.github/workflows/publish.yml` remains the npm trusted-publishing workflow identity. On pushes to
  `main`, `changesets/action@v1` either updates a version PR or publishes the merged independent
  versions with package-specific tags and GitHub releases.
- Existing extension-to-extension dependency prohibition remains. `pi-tui-kit` is published before a
  consumer raises its compatibility floor, following the repository's existing release safety rule.

## Non-Goals

- Publish packages, alter npm visibility, or dispatch a release workflow during this migration.
- Change extension runtime behavior, settings, commands, tools, or UI.
- Move deprecated reference packages.
- Introduce fixed or linked package version groups.

## Applicable conventions and verification

Touched areas are package layout, lifecycle classification, package metadata, local loading, tests,
documentation, and release automation. Applicable MUST rules from `docs/extension-conventions.md` are:

- active package placement and lifecycle classification: update the guide and validator;
- canonical extension entrypoints and independent package boundaries: run
  `npm run check:boundaries` and a Pi load smoke;
- independently installable metadata and published file lists: run package dry runs;
- deterministic tests and the CI-equivalent gate: update repository tests and run `npm run check`.

No extension-owned settings or asynchronous runtime lifecycle flow changes, so
`docs/extension-settings.md` and async cancellation/disposal audits are not applicable.

## Plan

- [x] Commit this executable plan on `feat/consolidate-packages-changesets`; verify the branch and
      clean index with `git status --short --branch` and inspect the commit. Evidence: commit
      `840795a` contains only this plan, and the post-commit status was clean.
- [x] Move all 25 active extension directories to flat `packages/<package>/` paths; update workspace,
      TypeScript, Biome, Just, CI, package repository metadata, maintained documentation, plans, ADRs,
      and source/test path references; add explicit lifecycle metadata and a root stable-extension Pi
      manifest; reconcile package versions to npm and regenerate the lockfile with npm 12.0.2; verify
      path/lifecycle discovery, direct Git-install resource selection, focused repository tests,
      boundary checks, and a diff audit; commit the coherent layout migration. Evidence: all 26 local
      workspace versions match npm latest; no tracked legacy package root or old package path remains;
      the boundary validator reports 1 library, 25 extensions, and 6 experiments; Biome passes; all
      2,431 tests pass; workspace typechecking passes; `git diff --check` passes.
- [ ] Add pinned Changesets tooling and independent configuration; replace shared-version/tag release
      scripts and workflows with Changesets version-PR and trusted-publish automation; update release
      recipes, repository guidance, and deterministic fixture tests for independent bumps, dependency
      ordering, baseline safety, package-specific tags, and experimental classification; verify the
      focused release/repository tests and Changesets status/version smokes; commit the release-system
      migration.
- [ ] Audit the complete diff against `docs/extension-conventions.md`, verify no active references to
      removed workspace roots or shared release tooling remain, run `npm run check`, dry-run pack every
      workspace, and run representative stable and experimental Pi package load smokes; record all
      evidence in this plan.
- [ ] Archive the fully checked plan under `docs/plans/archived/`, commit the final evidence, push the
      branch to `origin`, and create a pull request against `main` whose summary names the migration,
      independent release model, checks, smokes, and absence of npm publication.

## Risks

- **Accidental publication:** local versions are reconciled to npm before the Changesets workflow is
  enabled, and this branch does not publish or dispatch workflows.
- **Lost Git-package behavior:** the root manifest explicitly lists stable extension entrypoints and
  validator/tests prove experimental entries remain excluded.
- **Broken links or tooling:** all tracked path references are audited after the move and root checks,
  package dry runs, and Pi loads exercise the new paths.
- **Trusted publishing regression:** retain `.github/workflows/publish.yml`, its OIDC permission, pinned
  npm setup, provenance, and pre-publish repository check.
- **Shared-library release coupling:** keep independent ranges and the existing rule that a new
  `pi-tui-kit` API is published before consumer dependency floors are raised.

## Rollback / Recovery

Before merge, revert the migration commits or close the pull request. After merge but before a
Changesets release, revert the workflow/configuration and directory migration in reverse order. If a
release action fails, no version should be reused: fix the workflow, verify npm for each intended
`name@version`, and rerun Changesets publication so already-published versions are skipped. Never
publish, change visibility, or dispatch workflows as part of rollback without explicit approval.

## Completion Checklist

- [ ] All active production and experimental extensions and the reusable library are discovered below
      `packages/*`; `extensions/` and tracked `experimental/` sources no longer exist.
- [ ] Every extension keeps its thin `src/index.ts`, canonical `pi.extensions`, lifecycle metadata,
      independent manifest version, README warning where experimental, license, tests, and pack files.
- [ ] Root Git-package installation loads all and only stable extensions from `packages/`.
- [ ] Changesets independently versions, changelogs, tags, and publishes selected packages without a
      shared root release version or `v*.*.*` workflow.
- [ ] Every local package baseline version is confirmed as already published on npm; no package is
      published by this work.
- [ ] `npm run check`, all-workspace pack dry run, representative stable/experimental Pi loads, final
      semantic audit, clean worktree, pushed branch, and pull request all have recorded evidence.
