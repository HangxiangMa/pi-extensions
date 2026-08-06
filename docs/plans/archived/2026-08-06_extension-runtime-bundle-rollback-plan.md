# Extension runtime bundle rollback plan

## Goal

Return `pi-starship` and `pi-statusline` to the repository's source-shipping extension model while
preserving their source-level lazy import boundaries, commands, settings, rendering, refresh, and
lifecycle behavior. Git, npm, and local package loading must use the same authoritative TypeScript
entry path without requiring generated `dist/` artifacts.

## Context

- The user accepted the startup regression in exchange for a simpler distribution and maintenance
  model.
- A clean Pi-managed Git checkout currently fails because each `src/index.ts` forwards to ignored
  `dist/` output that `npm install` does not generate.
- The generated runtimes have measured value: the archived plans record `pi-starship` warm import
  improving from 324 ms to 27 ms and `pi-statusline` from 129 ms to 18 ms. This plan removes only the
  generated bundle layer; it retains the earlier source-level command, parser, UI, and optional
  collector deferrals.
- This is a semantic rollback, not a raw `git revert`: the original statusline performance commit also
  introduced useful source-level lazy boundaries, and later commit `8a5ebf5` changed generic Just
  path handling that remains valid without bundles.
- Applicable guidance read before planning: `docs/extension-conventions.md` entrypoint, package,
  lifecycle, command, test, pack, and smoke rules; `docs/plans/README.md`; and the archived starship
  and statusline startup import graph plans.

## Architecture

- Keep `packages/pi-starship/src/pi-starship.ts` and
  `packages/pi-statusline/src/statusline.ts` as the authoritative runtime implementations.
- Keep both canonical `src/index.ts` files as thin default-export forwarders, but constrain their
  targets to implementation modules inside the same `src/` directory.
- Preserve `command-contract.ts`, generation-aware lazy command loading, and all source module
  boundaries introduced before or alongside bundling.
- Publish complete `src/` trees for both extensions. Remove package-owned generated runtime build,
  chunk, source-map, and eager-graph validation infrastructure.
- Extend the repository boundary validator so future active extension entrypoints cannot forward
  outside their package's `src/` directory. This validator owns a stable packaging rule; product
  behavior remains extension-owned.

## Non-Goals

- Change footer output, commands, settings schemas or files, refresh timing, status keys, cancellation,
  session replacement, shutdown, or optional module behavior.
- Revert source-level lazy imports or module decomposition.
- Change `pi-tui-kit`, generic Just path hardening, versioning, publishing workflows, package versions,
  tags, releases, or the user's global Pi settings.
- Recover the generated bundle's startup benchmark numbers through another build or runtime layer.

## Risks

- **Accepted startup regression:** source loading will be slower than the generated entrypoints.
  Mitigation: retain source-level lazy boundaries and record post-rollback measurements without making
  performance a completion gate.
- **Accidental broad revert:** raw commit reverts could remove source-level statusline command
  deferral or generic Just hardening. Mitigation: edit only bundle-owned files and inspect the final
  diff against both archived plans.
- **Package omission:** changing `files` can omit runtime modules from npm tarballs. Mitigation: inspect
  both dry-run package manifests and load extracted packages through Pi.
- **Masked Git regression:** root checks previously built `dist/` before tests. Mitigation: delete
  ignored bundle output and smoke the repository package without running a build first.

## Rollback / Recovery

No persistent data or public command/settings migration is involved. If source entry loading or an
existing behavior contract fails, restore the bundle-owned manifest, scripts, entrypoint, and tests
from the pre-rollback revision without reverting source-level lazy boundaries. Do not publish, tag, or
change user settings as part of recovery.

## Plan

- [x] Reproduce the distribution failure by removing ignored `pi-starship` and `pi-statusline`
      `dist/` directories and loading the repository package with Pi; retain the missing-module output
      as the pre-change failure evidence, without treating this packaging smoke as a TDD red cycle.
      Evidence: `node scripts/benchmark-extension-startup.mjs --entry . --runs 1` exited 1 and reported
      missing `../dist/pi-starship.js` and `../dist/statusline.js` from both canonical entrypoints.
- [x] Update both `src/index.ts` files to forward to `./pi-starship.js` and `./statusline.js`, then
      rename/adapt each `generated-entry.test.ts` into a source-entry integration test that preserves
      command registration, side-effect-free missing settings, footer installation, and shutdown;
      verify both focused tests load with both `dist/` directories absent. Evidence: the two compiled
      source-entry tests passed 2/2 after both ignored `dist/` directories were removed.
- [x] Remove both `scripts/build-runtime.mjs` and `scripts/build-runtime.test.mjs` implementations,
      remove bundle-only `build`/`prepack` scripts and package-owned `esbuild` declarations, and restore
      each manifest's `files` list to publish `src`; regenerate `package-lock.json` with the root-pinned
      npm 12.0.2 using `npm install --package-lock-only --ignore-scripts`, then verify no starship or
      statusline manifest/lock entry retains bundle tooling. Evidence: Node 22.22.2 with Corepack npm
      12.0.2 regenerated the lockfile; both workspace entries no longer declare `esbuild`, and searches
      find no retained bundle script or manifest wiring.
- [x] Extend `scripts/check-extension-boundaries.mjs` to reject an active extension whose default
      forwarding entrypoint resolves outside its own `src/` directory, and extend the temporary
      fixture in `test/repository-scripts.test.ts` to cover an allowed in-source forwarder and rejected
      `../dist` forwarder; verify the focused repository script test and `npm run check:boundaries`.
      Evidence: all 14 repository-script tests passed and the boundary check accepted 1 library plus
      25 active extensions while the fixture rejected the out-of-source target.
- [x] Update both package READMEs to describe source entrypoints and source-owned package layouts,
      removing generated runtime, build-aware checkout, chunk, and source-map claims while preserving
      all user-visible capabilities and standard README sections; verify searches find no current
      bundle claim in either package. Evidence: package-layout and checkout sections now describe
      direct source loading, and a focused search finds no current bundle/build-artifact claim.
- [x] Run focused starship and statusline tests covering canonical entry loading, command discovery,
      settings missing/valid/malformed behavior, rendering, refresh ordering, cancellation, disposal,
      session replacement, and shutdown; verify all focused tests pass without generating either
      `dist/` directory. Evidence: all 305 compiled starship/statusline tests passed in 2.1 seconds,
      and both `dist/` directories remained absent.
- [x] Run `npm run check`, then remove both ignored `dist/` directories again and run a local root Git
      package smoke plus `just try starship` and `just try statusline` noninteractive load smokes;
      verify no build step or missing-module warning is required. Evidence: the npm 12.0.2 repository
      gate passed 2,428 tests plus Biome, boundaries, and workspace typechecks; the root RPC package
      smoke returned commands successfully, and both generic Just recipes loaded their source packages
      through a noninteractive Pi RPC wrapper without creating `dist/`.
- [x] Run `just pack starship` and `just pack statusline`, inspect both dry-run file lists for complete
      `src/` trees and absence of `dist/`, build scripts, and build-only tooling, then extract real
      tarballs to temporary directories and verify their declared entrypoints load through Pi.
      Evidence: dry runs and npm 12.0.2 packs contained 64 starship and 29 statusline source/docs files
      with no `dist/`; both extracted tarballs returned successful Pi RPC command responses.
- [x] Re-run the repository startup benchmark for each source entry with representative warm and
      forced-Jiti-rebuild runs; record the post-rollback medians as an accepted tradeoff and confirm
      command UI and optional starship collectors remain lazy through the existing deterministic
      behavior tests rather than imposing a timing gate. Evidence: starship measured 315 ms import /
      862.60 ms first response warm and 751 ms / 1,291.89 ms forced; statusline measured 118 ms /
      653.92 ms warm and 373 ms / 908.76 ms forced. The focused 305-test suite retained command and
      optional-work lifecycle behavior; the user explicitly accepted this performance tradeoff.
- [x] Audit the final diff against `docs/extension-conventions.md` touched-area rules and the two
      archived startup plans, confirming only generated bundle ownership was removed. Evidence: the
      diff removes 671 bundle-owned lines, retains statusline/starship command-contract loaders and
      all lifecycle/settings source, preserves generic Just hardening, and passes entrypoint, package,
      dependency, README, test, pack, and Pi smoke requirements with no accepted product deviation.

## Completion Checklist

- [x] Both canonical `src/index.ts` files load authoritative source implementations with no `dist/`
      directories present. Evidence: focused, root-package, Just, and extracted-pack smokes passed.
- [x] Source-level command, parser, UI, and optional collector lazy boundaries remain in production
      source and their existing behavior tests pass. Evidence: the loaders remain and 305 focused
      tests passed.
- [x] Both packages publish complete source trees and contain no generated runtime build scripts,
      lifecycle hooks, bundle-only dependencies, chunks, or source maps. Evidence: manifest/lock
      searches and 64-file/29-file package inspections passed.
- [x] The boundary validator rejects future active extension entrypoints that forward outside `src/`.
      Evidence: the controlled `../dist` fixture failed and all active packages passed.
- [x] Git checkout, local package, and extracted npm package smokes all load the same source entry path.
      Evidence: all three routes returned successful Pi RPC command responses without `dist/`.
- [x] Focused tests, `npm run check`, both package dry runs, and the final semantic audit pass with no
      skipped required path or unaccepted deviation. Evidence: 305 focused and 2,428 repository tests
      passed alongside Biome, boundaries, typechecks, packs, and semantic review.
- [x] Post-rollback startup measurements are recorded as an explicitly accepted performance tradeoff,
      with no performance target blocking completion. Evidence: warm/forced medians are recorded in
      the completed benchmark task.
