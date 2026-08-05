# Pi TUI Kit runtime-import performance plan

## Goal

Reduce `@narumitw/pi-tui-kit` cold import and first-interaction latency by removing its production
runtime dependency on the heavyweight `@earendil-works/pi-coding-agent` root barrel, while preserving
all public APIs, menu behavior, syntax-colored review output, task cancellation, disposal, and
cross-mode lifecycle results.

## Context

- Fresh-process measurements on 2026-08-05 put the Kit root import around 1.1–1.5 seconds, closely
  matching the 1.1–2.3 second `pi-coding-agent` root import; `pi-tui` alone measured about 50–120 ms.
- A disposable built-output experiment replacing the three coding-agent runtime imports reduced the
  Kit import median to about 64 ms. This is directional evidence, not completion evidence.
- The production graph reaches coding-agent values through:
  - `packages/pi-tui-kit/src/task.ts` for `BorderedLoader`;
  - `packages/pi-tui-kit/src/components/index.ts` for `DynamicBorder`; and
  - `packages/pi-tui-kit/src/components/review.ts` for `getLanguageFromPath()` and `highlightCode()`.
- `packages/pi-tui-kit/src/index.ts` re-exports `runTask()` and `runMenu()`, so ESM evaluates those
  branches when the package root is imported. Extension-level lazy loading avoids startup cost but
  currently relocates the same pause to the first command.

## Architecture

- Keep `@earendil-works/pi-coding-agent` as a peer/dev dependency for public TypeScript context types,
  but require every production JavaScript dependency on it to be erased as type-only.
- Keep `@earendil-works/pi-tui` as the only Pi runtime package used by Kit internals.
- Own the small presentation composites needed by Kit:
  - an internal width-aware border component built on the public `Component` contract; and
  - an internal task-loader composite built from public `pi-tui` primitives, the callback-injected
    theme/keybindings, and the existing `runTask()` ownership controller.
- Own review syntax formatting at the review adapter boundary. Use a direct, declared lightweight
  highlighter dependency and the callback-injected theme; do not deep-import Pi `dist/*`, load the
  coding-agent root dynamically, or add a consumer-supplied highlighting hook.
- Preserve the package root and `/testing` exports. This is an internal performance refactor, not a
  menu API-version change.

## Non-Goals

- Remove extension-level lazy imports added by PR #562.
- Add new public subpaths, menu screens, loader options, or highlighting configuration.
- Change review language coverage, ANSI sanitization, exact text wrapping, cancellation keys, or
  TUI/RPC behavior.
- Publish the package, bump consumer compatibility floors, or modify extension packages; release and
  consumer adoption require separate approval and sequencing.
- Optimize unrelated `pi-goal`, `pi-starship`, or Pi core startup work.

## Assumptions

- Existing code-review syntax coloring is observable behavior and must be characterized before the
  coding-agent helper is replaced.
- A direct all-language highlighter is acceptable only if same-host measurements meet the import and
  first-interaction targets; otherwise a core-plus-registered-languages adapter must preserve the
  currently mapped language set.
- Dependency changes will use the root-declared `npm@12.0.2` under a supported Node runtime; the
  currently active npm 11 installation is not authoritative for lockfile work.

## Risks

- **Behavior drift in highlighting:** a new adapter could change language aliases, token colors, or
  invalid-language fallback. Mitigate with red-first characterization covering mapped paths,
  explicit languages, unknown languages, multiline code, and themed token output.
- **Loader lifecycle drift:** replacing `BorderedLoader` could lose cancellation, animation disposal,
  or injected keybindings. Mitigate with existing `runTask()` lifecycle tests plus focused first-frame,
  cancel, external-disposal, owner-abort, non-cancellable, and timer-drain assertions.
- **Timing moved rather than removed:** a fast root import could hide a slow first review/task render.
  Mitigate by benchmarking cold import, first menu frame, and first task frame in fresh serial
  processes.
- **Flaky performance gates:** absolute timing differs by host and cache state. Keep deterministic
  dependency-graph assertions in tests and use same-host serial medians plus relative improvement as
  PR evidence rather than a wall-clock CI assertion.
- **Dependency/package growth:** an all-language highlighter may increase install size. Record packed
  size and import latency before selecting it; prefer the smallest implementation that preserves the
  current language contract and meets the latency target.

## Rollback / Recovery

The change is independently revertible because it does not alter public types, data, settings, or
consumer manifests. If behavior or import targets fail, revert the internal border, task-loader, and
highlighter changes together and retain PR #562's lazy-loading mitigation. Do not publish until the
package dry run and clean-install smoke pass.

## Plan

- [x] Add `scripts/benchmark-tui-kit-runtime.mjs` and capture a fresh-process baseline covering the
  built package root import, first actions-menu frame, first code-review frame, and first `runTask()`
  frame. Evidence: Node 22.23.1, five serial runs after warm-up: import 1321.34 ms median/39.23 ms
  MAD; actions first frame 1421.05/68.34 ms; review 1286.95/43.73 ms; task 1285.97/54.19 ms. Every
  scenario resolved coding-agent runtime URLs. The dry-run tarball was 37,576 bytes packed and
  178,374 bytes unpacked across 41 files.
- [x] Add red-first Kit behavior tests for callback-injected task cancellation and review syntax
  theming, and use the fresh-process resolver benchmark as the outside-TDD production-graph red gate.
  Evidence: the focused task test failed because the injected key did not abort; the focused review
  test failed because syntax colors came from coding-agent's global theme. Existing and added tests
  cover borders, first frame, cancellation, non-cancellable mode, disposal/draining, inferred and
  explicit languages, unknown fallback, and syntax tokens. Distribution output remains outside the
  TDD test boundary and is verified by build inspection.
- [x] Under Node 22.23.1, use root-pinned `npm@12.0.2` for the dependency/lock change and evaluate
  `highlight.js` all-language import versus core-plus-current-language registration. Evidence: five
  all-language imports measured 97–208 ms; mapped core registration measured 40–47 ms but dropped
  arbitrary explicit-language coverage. The all-language adapter was selected to preserve the public
  review contract and the final benchmark exceeded the 70% target.
- [x] Add internal border and task-loader modules under `packages/pi-tui-kit/src/components/`, update
  `components/index.ts` and `task.ts` to use only public `pi-tui` runtime primitives and injected
  theme/keybindings. Evidence: focused task/component tests pass, including user cancellation,
  non-cancellable input, owner abort, external disposal, first-frame borders/hint, and task draining;
  the loader stops its animation idempotently on every completion/disposal path.
- [x] Add the direct `highlight.js` adapter and declared dependency, update `components/review.ts` to
  use it without Pi private paths, and preserve mapped plus arbitrary explicit languages. Evidence:
  focused review tests pass for inferred TypeScript tokens, explicit Brainfuck/entity decoding,
  unknown fallback, sanitization, wrapping, diff/text rendering, adaptive/fixed TUI, and RPC pages.
- [x] Build and inspect the package distribution. Evidence: `rg` finds zero coding-agent or Pi
  private `dist/*` imports in built JavaScript; declarations retain type-only coding-agent imports;
  root exports remain the same seven names, `/testing` remains the same two names, and menu API stays
  version 6.
- [x] Update `packages/pi-tui-kit/README.md` and the Technical Health section of
  `docs/roadmaps/pi-tui-kit-roadmap.md` with the runtime dependency boundary and benchmark method,
  without documenting transient package versions or promising publication.
- [x] Re-run the fresh-process benchmark against the final built output. Evidence: same-host Node
  22.23.1 medians improved from 1321.34 to 177.09 ms for import (86.6%), 1421.05 to 243.20 ms for
  actions (82.9%), 1286.95 to 349.87 ms for review (72.8%), and 1285.97 to 361.73 ms for task
  (71.9%). No measured interaction exceeded 425 ms and all resolver traces excluded coding-agent.
- [x] Run the package, focused, repository, and package-distribution gates. Evidence:
  `npm run check --workspace @narumitw/pi-tui-kit` passed; compiled Kit tests passed 135/135; focused
  Kit-consumer loader tests passed 38/38; Biome, boundaries, and all typechecks passed within
  `npm run check`. The final full run passed 2421/2424 tests: the existing Jupyter FIFO timing
  assertion passed on focused rerun, while the existing BTW path-wrap and GitHub PR periodic-refresh
  timing failures reproduced; all three failing packages have zero diff. `just pack-tui-kit` passed (47 files, 40.9 kB packed,
  188.8 kB unpacked), and a clean Node 22/npm 12 tarball install resolved both entrypoints and one
  deduplicated `highlight.js@10.7.3`; the final dry run remained 47 files, 40.9 kB packed, and
  188.9 kB unpacked.
- [x] Audit the final diff against `docs/tui.md`, `docs/extension-conventions.md`, the Pi TUI Kit
  roadmap, lifecycle paths, and dependency/version policy. Evidence: callback keybindings drive user
  cancellation; every loader completion/disposal path idempotently stops animation; owner abort and
  stale continuations remain covered; built JavaScript uses only public Pi TUI runtime APIs; npm 12
  generated the lock change; and the real Pi RPC load smoke exposed Kit API 6 in 367 ms. No accepted
  convention deviation, unverified required path, release, or publication remains.

## Completion Checklist

- [x] Built production JavaScript has zero runtime imports of
  `@earendil-works/pi-coding-agent` and zero Pi private `dist/*` imports.
- [x] Public root and `/testing` exports, TypeScript contracts, and
  `PI_EXTENSION_MENU_API_VERSION` are unchanged.
- [x] Review code highlighting preserves current mapped-language, theme, fallback, sanitization,
  wrapping, and pagination behavior.
- [x] `runTask()` preserves completion, user cancellation, external disposal, owner abort/staleness,
  errors, non-cancellable mode, and complete loader/timer cleanup.
- [x] Same-host fresh-process evidence shows at least 70% median improvement for cold import and first
  interaction, rather than merely shifting the coding-agent pause.
- [x] Package check, focused tests, full `npm run check`, and `just pack-tui-kit` passed as described
  above; the three unrelated full-suite failures have focused reproduction evidence.
- [x] No extension, consumer compatibility floor, package version, publication, tag, visibility, or
  release workflow was changed.
- [x] Archived at
  `docs/plans/archived/2026-08-05_pi-tui-kit-runtime-import-performance-plan.md` after confirming no
  existing archive file would be overwritten.
