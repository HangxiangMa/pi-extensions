# Vitest migration plan

## Goal

Run every active root and workspace test through Vitest without changing extension behavior or losing affected-test selection.

## Context

The repository previously compiled 227 TypeScript test files and executed their JavaScript with `node --test`.
Most files used `node:test`, while a smaller set relied on Node-specific per-test cleanup, nested tests, fake timers, and mocks.
The initial baseline could not start because this worktree's dependencies were not installed.

## Non-Goals

- Rewriting working `node:assert/strict` assertions to Vitest `expect` syntax.
- Changing extension runtime behavior or package publishing metadata.
- Adding coverage thresholds.

## Plan

- [x] Install the locked repository dependencies and add Vitest as a root development dependency; `npm ls vitest typescript --depth=0` resolves Vitest 4.1.10 and TypeScript 7.0.2.
- [x] Add root Vitest configuration and adapt `scripts/run-tests.mjs` so full and affected selections execute TypeScript tests through Vitest with the repository's canonical temporary-directory environment; focused root/package tests passed and synthetic selection produced package, root-only, skip, and full outcomes.
- [x] Replace every active `node:test` import with Vitest APIs and migrate Node-only test-context cleanup, diagnostics, nested tests, mocks, and timers; the compatibility-heavy focused suite passed and active-path search found no `node:test` references.
- [x] Retain test TypeScript compilation for subprocess fixtures and update repository documentation and durable tooling references for Vitest; `tsc -p tsconfig.test.json`, the active-path literal audit, and Vitest's 227-file listing passed.
- [x] Run formatting and the CI-equivalent `npm run check`, then audit the touched-area extension conventions for deterministic tests and unchanged package/runtime behavior; all checks passed and the diff contains no extension `src/` changes.
- [x] Remove the temporary root Kit alias and raise `pi-chrome-devtools` to the published `pi-tui-kit` 0.51 compatibility floor; focused menu tests, registry verification, Changesets status, and `just pack chrome-devtools` passed.

## Completion Checklist

- [x] All 227 active `*.test.ts` files are discovered and executed by Vitest.
- [x] A repository search finds no active `node:test` imports or `node --test` runner invocation.
- [x] Affected-test selection still supports full, package-scoped, root-only, and skip outcomes.
- [x] `npm run check` passes with 227 files and 2,581 tests.
- [x] `pi-chrome-devtools` records its Kit compatibility-floor change in a patch Changeset and passes its pack smoke; no runtime source behavior changed, so a Pi runtime smoke is not required.
