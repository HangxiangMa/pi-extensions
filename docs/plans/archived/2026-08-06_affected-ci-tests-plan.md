# Affected CI tests

## Goal

Run only tests for changed workspaces and their in-repository dependents in CI, while preserving full local tests and repository-wide static checks.

## Context

CI currently runs `npm run check`, and `scripts/run-tests.mjs` executes all 205 package tests on every pull request and `main` push. The safe selective boundary is the test phase: builds, Biome, extension-boundary validation, and workspace typechecking remain repository-wide.

## Plan

- [x] Add affected-workspace selection to `scripts/run-tests.mjs`: synthetic change-list smokes verified extension, root-only, documentation-only, reusable-library reverse-dependent, removed-package, and shared-tooling selection.
- [x] Update `.github/workflows/ci.yml` to fetch Git history and provide the pull-request base or push `before` SHA; the workflow parsed with `yaml`, and unusable base input was verified to trigger the selector's full-suite fallback path.
- [x] Run focused selective/full test smokes and `npm run check`; an isolated worktree ran 37 Firecrawl and root tests for a one-package change, and the CI-equivalent gate passed all 2,410 tests.

## Completion Checklist

- [x] Local `npm test` still runs the full suite: 2,410 tests passed both directly and through `npm run check`.
- [x] A single extension change selects that extension plus root tests: isolated Firecrawl smoke passed 37 selected tests.
- [x] A reusable library change selects the library and all 22 reverse dependents (23 workspaces total).
- [x] Documentation-only changes run no tests, while removed packages and shared test tooling select the full suite.
- [x] CI-equivalent verification passes; no package/runtime metadata changed, so pack smoke and Changeset are not applicable.
