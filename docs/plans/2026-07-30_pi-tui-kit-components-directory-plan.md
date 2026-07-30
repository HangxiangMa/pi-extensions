# Pi TUI Kit Components Directory Plan

## Goal

Move the existing internal Pi TUI component subsystem into
`packages/pi-tui-kit/src/components/` so component contracts, rendering, and implementations have one
clear home and one internal entrypoint, without changing the package's public API, screen behavior,
consumer behavior, or declarative API version.

## Context

- The current component cluster consists of `screen-components.ts`,
  `screen-component-contracts.ts`, `screen-component-rendering.ts`, and
  `multi-select-component.ts`. Together they contain about 970 of the 1,994 authored lines under
  `packages/pi-tui-kit/src/`.
- Choice, settings, multi-select search, and the latest input hardening repeatedly changed this
  cluster, while `model.ts`, `navigator.ts`, public `types.ts`, and most of `runtime.ts` have separate
  responsibilities.
- `runtime.ts` and the package's component tests are the only live callers of the internal component
  entrypoint. Repository consumers import only `@narumitw/pi-tui-kit` through its root export.
- `packages/pi-tui-kit/package.json` publishes only the `.` export, so the generated component module
  paths are not supported package subpaths.
- `tsconfig.build.json` already includes `src/**/*.ts`, and `scripts/build.mjs` removes `dist/` before
  compilation. A nested source directory therefore needs no build-script or manifest expansion.
- `docs/extension-conventions.md` applies to the reusable-library package boundary, TUI contract,
  generated package contents, and verification. `docs/extension-settings.md` is not applicable because
  this refactor does not change extension-owned settings state, persistence, precedence, or schema.

## Architecture

Use `components/index.ts` as the sole internal component facade:

```text
packages/pi-tui-kit/src/
├── components/
│   ├── index.ts          # screen dispatcher plus existing action/detail/choice/settings adapters
│   ├── contracts.ts      # component host, event, change, and option contracts
│   ├── rendering.ts      # frame, hints, safe text, and shared search-input handling
│   └── multi-select.ts   # multi-select state, rendering, search, and pending queue
├── index.ts              # unchanged npm public API
├── model.ts
├── navigator.ts
├── runtime.ts
└── types.ts
```

Map the existing files directly:

- `src/screen-components.ts` → `src/components/index.ts`;
- `src/screen-component-contracts.ts` → `src/components/contracts.ts`;
- `src/screen-component-rendering.ts` → `src/components/rendering.ts`;
- `src/multi-select-component.ts` → `src/components/multi-select.ts`.

The dependency direction becomes:

```text
runtime.ts → components/index.ts → private component modules → ../types.ts
```

`components/index.ts` continues to expose only the internal symbols already needed by `runtime.ts`
and component tests. Do not add package exports, a top-level compatibility shim, or a second component
facade. Generated files move from top-level `dist/screen-component-*` and
`dist/multi-select-component.*` paths to `dist/components/`; `dist/index.*` and its public declarations
remain compatible.

## Non-Goals

- Change screen rendering, keybindings, width handling, search, pending queues, rollback, cancellation,
  disposal, TUI/RPC adaptation, or lifecycle behavior.
- Add, remove, or rename any public root export or public declarative type.
- Change `PI_EXTENSION_MENU_API_VERSION`, package versions, dependencies, or package metadata.
- Split every screen into one file. In particular, keep the small action/detail/choice adapters and the
  existing settings adapter in `components/index.ts` during this bounded move.
- Rewrite archived plans that accurately describe the file layout at the time they were executed.
- Add an internal barrel or abstraction beyond the one existing component facade.

## Risks

- Incorrect NodeNext `.js` specifiers or `../types.js` paths could pass a source-only inspection but
  fail the built ESM graph.
- A stale generated top-level component file could hide a broken import unless the clean build and
  tarball contents are inspected.
- Mechanical edits inside component implementations could accidentally mix behavior changes into the
  relocation and make review harder.
- Current roadmap text names a top-level component file and will become stale unless updated, while
  archived plans should remain historical.

## Rollback / Recovery

This is a source-layout-only refactor with no persisted data or public API migration. If verification
fails, reverse the four moves and import-path updates as one change. Because the build removes `dist/`
before emitting, rebuilding after rollback restores the original generated layout without manual file
cleanup.

## Plan

### Baseline and boundary proof

- [x] Run `npm run check --workspace @narumitw/pi-tui-kit`, remove
      `node_modules/.cache/pi-extensions-test/`, run `npx tsc -p tsconfig.test.json`, and execute the
      compiled kit model, component, and runtime tests; baseline evidence: the workspace check passed
      and all 67 focused tests passed.
- [x] Inspect `packages/pi-tui-kit/package.json`, `src/index.ts`, and repository imports with `rg` to
      confirm only the root package export is public and no live consumer imports the four internal
      module paths; evidence: the manifest exports only `.`, the root index names only public modules,
      and the deep-import scan found no live consumer.

### Component subsystem relocation

- [x] Create `packages/pi-tui-kit/src/components/` and move the four existing component files to the
      architecture mapping above with Git-aware renames; evidence: the directory contains exactly the
      four mapped modules and no old top-level component source or compatibility shim remains.
- [x] Update imports inside `components/index.ts`, `components/multi-select.ts`,
      `components/rendering.ts`, and `components/contracts.ts` so sibling modules use `./*.js` and
      public menu types use `../types.js`; evidence: the import scan shows the intended one-way paths
      and `npm run typecheck --workspace @narumitw/pi-tui-kit` passed.
- [x] Update `packages/pi-tui-kit/src/runtime.ts` and
      `packages/pi-tui-kit/test/screen-components.test.ts` to import only
      `components/index.js`; evidence: both callers use the facade and `rg` finds no former filenames
      in live source, tests, README, or roadmap text.

### Build, behavior, and documentation verification

- [x] Run a clean `npm run build --workspace @narumitw/pi-tui-kit` and import
      `packages/pi-tui-kit/dist/index.js` with Node; evidence: the ESM graph loaded with every expected
      root export and API version 2, all four JS/declaration pairs exist under `dist/components/`, and
      no former top-level generated component module remains.
- [x] Recompile tests from a fresh `node_modules/.cache/pi-extensions-test/` and run the compiled kit
      model, component, and runtime suites; evidence: all 67 tests passed, matching the baseline, and
      the only test change is the internal import path.
- [x] Update the `packages/pi-tui-kit/README.md` package-layout section and current architecture text in
      `docs/roadmaps/pi-tui-kit-roadmap.md` to name `src/components/` and `multi-select.ts`; evidence:
      both current documents name the new layout, their referenced source paths exist, and archived
      plans remain unchanged.
- [x] Review `git diff --find-renames` for the four moves and inspect `src/index.ts`, `types.ts`,
      `model.ts`, `navigator.ts`, and the non-import portions of `runtime.ts`; evidence: Git reports
      96–98% similarity for all four renames, the four core modules are byte-unchanged, and runtime's
      only change is its component-facade import path.
- [x] Run `npm run check --workspace @narumitw/pi-tui-kit` and `git diff --check`; evidence: Biome,
      typechecking, the clean library build, and staged, unstaged, and untracked whitespace checks all
      passed after Biome organized the relocated imports.
- [x] Run `just pack-tui-kit` and inspect the dry-run tarball listing; evidence: the 21-file package
      contains all four `dist/components/*` JS/declaration pairs, no former generated component paths,
      and the expected root entrypoint, README, package metadata, and license.
- [ ] Run root `npm run check`; verify the CI-equivalent build, Biome, boundaries, workspace
      typechecks, and tests pass, leaving any unavailable or failing evidence open rather than
      inferring success from focused checks.
- [x] Audit the final diff against the package-layout, TUI, documentation, and verification MUST rules
      in `docs/extension-conventions.md`; evidence: library boundaries, generated JS/declarations,
      TUI contracts, source thresholds, current docs, and pack contents comply; no settings guide rule,
      Pi runtime smoke, API-version change, migration, or accepted semantic deviation is applicable.
- [ ] After every plan item and completion check has evidence, move this plan to
      `docs/plans/archived/2026-07-30_pi-tui-kit-components-directory-plan.md`; verify the active path is
      gone, the archive exists, and no existing archived file was overwritten.

## Verification Evidence

- Pre-move and post-move focused baselines each passed the same 67 model, component, and runtime
  tests.
- The clean built ESM graph loaded all expected root exports at API version 2, and the package dry run
  contained only the new generated component paths.
- A local root `npm run check` attempt reached the complete touched kit suites successfully but timed
  out after 600 seconds while unrelated timing-sensitive LSP, Subagents, and Statusline tests were
  contending under the parallel runner. The root item remains open pending hosted CI evidence.

## Completion Checklist

- [ ] All four component subsystem files live under `packages/pi-tui-kit/src/components/`, and no
      obsolete top-level source or generated component module remains.
- [ ] `runtime.ts` and component tests use the single internal component facade; private component
      modules preserve a one-way dependency on shared types and do not leak through package exports.
- [ ] Public root exports, declarations, declarative API version, TUI/RPC behavior, lifecycle behavior,
      and consumer contracts are unchanged.
- [ ] README and current roadmap architecture text describe the new layout while archived plans remain
      historical.
- [ ] Focused tests, workspace checks, the clean-build module smoke, root `npm run check`, diff checks,
      and the package dry run pass with inspectable evidence.
- [ ] The completed plan is archived at
      `docs/plans/archived/2026-07-30_pi-tui-kit-components-directory-plan.md`.
