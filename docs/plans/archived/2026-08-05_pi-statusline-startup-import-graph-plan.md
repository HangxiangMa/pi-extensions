# pi-statusline startup import graph plan

## Goal

Reduce `pi-statusline` startup import and first-response latency without changing footer rendering,
settings, commands, refresh behavior, or lifecycle ownership. Target at least a 75% warm import
reduction, 30% forced-rebuild import reduction, and 15% first-response reduction.

## Context

- Seven warm RPC runs report import median **155 ms** (MAD **4 ms**) and first-response median
  **692.63 ms** (MAD **11.7 ms**).
- Three `JITI_REBUILD_FS_CACHE=1` runs report import median **410 ms** (MAD **2 ms**) and
  first-response median **939.9 ms** (MAD **0.74 ms**).
- Jiti loads 24 `pi-statusline` source modules eagerly. `statusline.ts` statically imports the
  929-line command implementation even though Pi TUI Kit itself is already lazy.
- A temporary split-TypeScript bundle measured about 15–16 ms warm and 207–228 ms with forced Jiti
  rebuild, confirming import fan-out as the main cost.
- Applicable guides read: `docs/extension-conventions.md` entrypoint, factory/lifecycle, command,
  package, test, pack, and smoke rules; `docs/extension-settings.md` loading, persistence, reload,
  failure, and missing-file rules.

## Architecture

- Keep `src/` as the authoritative implementation and source-level test surface.
- Extract a lightweight command contract and register `/statusline` synchronously from the core;
  dynamically import the existing command workflow only when the command is invoked.
- Bundle `src/statusline.ts` with esbuild into deterministic split ESM TypeScript artifacts under
  ignored `dist/`. Keep all packages external and retain `.ts` output so Pi routes generated chunks
  through Jiti aliases instead of loading another Pi runtime.
- Keep `src/index.ts` as the sole thin declared entrypoint forwarding to generated runtime output.
- Generate before root checks, package packing, and the canonical `just try` workflow. Publish only
  the source forwarder, generated runtime/chunks/maps, README, license, and package metadata.
- Treat generated artifacts and build wiring as outside red-first TDD. Preserve observable behavior
  through existing command/lifecycle/settings tests, a generated-entry integration test, build-graph
  validation, package inspection, and real Pi RPC smokes.

## Non-Goals

- Change command routes, menu behavior, settings schema, defaults, migration, persistence, rendering,
  refresh intervals, status ownership, or lifecycle semantics.
- Delay footer installation until after first paint to move rather than remove startup work.
- Bundle Pi, Pi TUI, Pi TUI Kit, or other runtime packages.
- Publish, bump a version, tag, or dispatch a release.

## Risks

- **Stale command continuation:** session replacement can occur while the dynamic command import is
  pending. Mitigation: revalidate session ownership after import before entering the workflow.
- **Second Pi runtime:** native JavaScript bypasses Jiti aliases. Mitigation: generated `.ts` chunks
  plus checkout and packed Jiti identity traces.
- **Artifact drift:** tests can pass against source while stale output ships. Mitigation: deterministic
  build tests, clean replacement, build-before-pack, generated-entry coverage, and source maps.
- **Lazy-boundary regression:** future imports can pull command UI or Pi TUI Kit into the eager chunk.
  Mitigation: fail build metadata validation for forbidden eager inputs/dependencies.

## Rollback / Recovery

No persistent data migration is involved. If command parity, package loading, source-map resolution,
or performance gates fail, restore `src/index.ts` to `./statusline.js`, restore direct command
registration and package files/scripts, and remove generated build tooling without touching settings.

## Plan

- [x] Extract `src/command-contract.ts` and an exported command handler from `src/commands.ts`, then
      register a cached generation-aware dynamic loader in `src/statusline.ts`; verify existing
      completion, route, menu, cancellation, replacement, and non-TUI command tests.
- [x] Add package-owned deterministic esbuild generation and tests for temporary publication,
      byte-identical output, stale-chunk removal, `.js` source specifiers, source-map resolution,
      package externalization, and rejection of eager command/Pi TUI Kit inputs.
- [x] Pin package-owned `esbuild` with npm 12.0.2 on supported Node, update the lockfile, and verify it
      remains dev-only while current runtime and peer dependency classes remain unchanged.
- [x] Switch `src/index.ts`, package files/lifecycle scripts, and build-aware `just try` wiring to the
      generated runtime; verify boundary checks, clean-`dist` local preparation, checkout loading, and
      extracted-pack loading through one global Pi runtime.
- [x] Add a generated-entry integration test covering command registration, side-effect-free missing
      settings, footer installation, and shutdown while retaining authoritative source tests.
- [x] Re-run seven warm and three forced-rebuild source/generated benchmarks; require all relative
      thresholds and improvements greater than five baseline MADs without deferring footer readiness.
- [x] Update README local usage and package layout, audit the final diff against both convention
      guides, run `npm run check`, `just pack statusline`, inspect package contents, and smoke packed
      missing/valid/malformed settings, command discovery/help, and shutdown.

## Execution Evidence

- The source-only command split reduced warm import from the original 155 ms baseline to 129 ms and
  forced-rebuild import from 410 ms to 367 ms; the generated entry reduced them further to 18 ms and
  202 ms respectively.
- Original baseline to generated first-response medians improved from 692.63 to 572.1 ms warm and
  939.9 to 760.64 ms with forced rebuild. Every reduction exceeds its target and five baseline MADs.
- Checkout and extracted-package traces load two eager generated files, one unique global Pi runtime
  path, no repository Pi runtime, and no command or Pi TUI Kit chunk before invocation.
- Build tests prove deterministic bytes, temporary replacement, stale-chunk removal, package
  externalization, lazy-command enforcement, `.js` generated specifiers, source-map resolution, and
  missing-map rejection.
- Node 22.22.2 with Corepack npm 12.0.2 updated the lockfile; esbuild 0.28.1 remains dev-only.
- A clean-`dist` noninteractive `just try statusline` smoke rebuilt before `pi -e`. The extracted
  package passed missing, valid, and malformed JSON RPC startup, command discovery, `/statusline help`,
  and shutdown smokes.
- `npm run check` passed all 2,426 repository tests. `just pack statusline` passed with the intended 10
  files and no build-only tooling.

## Completion Checklist

- [x] The sole declared source entrypoint loads deterministic generated TypeScript without a second Pi
      runtime.
- [x] Command UI and Pi TUI Kit remain lazy, and command continuations reject replaced sessions.
- [x] Warm/forced import and first-response measurements pass every threshold.
- [x] Settings, rendering, commands, refresh, cancellation, disposal, replacement, and shutdown remain
      behaviorally unchanged and tested through source and generated entrypoints.
- [x] Clean checkout try, full repository checks, package inspection, and packed Pi smokes pass.
