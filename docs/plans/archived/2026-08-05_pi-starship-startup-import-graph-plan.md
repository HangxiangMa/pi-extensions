# pi-starship startup import graph plan

## Goal

Reduce `pi-starship` startup module-import latency without delaying footer readiness or changing its
commands, settings, rendering, refresh, or lifecycle behavior. Against the recorded local baseline,
target at least a 60% warm-cache import reduction and a 20% forced-rebuild import reduction.

## Context

- The current seven-run RPC benchmark reports a warm-cache import median of **334 ms**
  (MAD **2 ms**) and first-response median of **852.41 ms** (MAD **6.54 ms**):
  `node scripts/benchmark-extension-startup.mjs --entry extensions/pi-starship/src/index.ts --runs 7`.
- With `JITI_REBUILD_FS_CACHE=1`, three measured runs report an import median of **740 ms**
  (MAD **8 ms**) and first-response median of **1239.41 ms** (MAD **1.87 ms**).
- `JITI_DEBUG=1` shows 51 `pi-starship` source modules on the eager path. The factory itself takes
  0–1 ms; the remaining cost is the Jiti import graph rooted through `config.ts`,
  `modules/catalog.ts`, and `modules/render.ts`.
- The previous startup pass already deferred command UI, TOML parser evaluation, YAML collectors, and
  optional workspace collectors. Those boundaries should remain lazy.
- A temporary esbuild proof reduced the warm eager import to about 18–22 ms by emitting a small
  split TypeScript graph. A native JavaScript bundle resolved repository Pi packages outside Jiti's
  aliases and can evaluate a second Pi runtime, so that shape is not safe.
- Applicable guidance read before planning: `docs/extension-conventions.md` package entrypoint,
  factory/lifecycle, TUI, package, test, pack, and smoke rules; `docs/extension-settings.md` missing-file,
  validation, atomic persistence, reload, and failure-preservation rules.

## Architecture

- Keep the descriptive files under `extensions/pi-starship/src/` as the authoritative implementation
  and test surface.
- Add a package-owned build step that bundles `src/pi-starship.ts` into deterministic, split ESM
  artifacts under ignored `extensions/pi-starship/dist/`. Emit JavaScript syntax with `.ts`
  extensions so Pi loads the artifact and its chunks through Jiti, preserving Pi's package aliases
  and avoiding a second agent runtime.
- Keep Pi, Pi TUI, Pi TUI Kit, `smol-toml`, and `yaml` external to the bundle. Preserve the existing
  dynamic import boundaries so command UI and optional collectors remain in non-eager chunks.
- Keep `src/index.ts` as the required thin default-export forwarder and keep
  `package.json#pi.extensions` exactly `["./src/index.ts"]`; the forwarder targets the generated
  runtime artifact.
- Publish only the source forwarder, generated runtime/chunks/source maps, README, license, and
  notices. Generate artifacts before pack and build them before the canonical local `just try`
  workflow.
- Treat the generated files and package/build wiring as outside the TDD production boundary. Preserve
  behavior with existing source-level tests plus declared-entrypoint integration tests, package
  inspection, and real Pi smokes; use the benchmark as the performance acceptance check rather than a
  timing assertion in `npm test`.

## Tech Stack

- Use a pinned package-owned `esbuild` dev dependency with `bundle`, `splitting`, `format: "esm"`,
  `platform: "node"`, and `target: "es2022"`.
- Use the existing `scripts/benchmark-extension-startup.mjs` RPC protocol for warm and forced-Jiti-
  rebuild measurements.
- Use npm **12.0.2** from root `packageManager` under a supported Node runtime such as Node 22.22.2
  for manifest/lockfile changes.

## Non-Goals

- Change supported modules, built-in TOML, rendering output, refresh timing, commands, settings schema,
  persistence, or lifecycle policy.
- Move initialization behind first paint merely to improve the printed timing number.
- Bundle Pi, Pi TUI, Pi TUI Kit, TOML, or YAML dependencies into the artifact.
- Mechanically merge the source module definitions or weaken their current ownership boundaries.
- Publish, bump a version, create a tag, or dispatch a release workflow.

## Unknowns

- The exact split TypeScript artifact must load from both a checkout and an extracted/installed npm
  package on the supported Pi runtime while retaining Jiti aliases.
- Source-map stack traces from the generated `.ts` chunks must remain actionable enough for runtime
  failures.
- `npm pack` lifecycle generation and the generic `just try` workflow must not leave stale chunks or
  require a manually prepared checkout.

## Risks

- **Second Pi runtime:** native generated JavaScript can bypass Jiti aliases. Mitigation: use generated
  `.ts` chunks and prove package-scope identity/loading before changing the entrypoint.
- **Source/artifact drift:** tests may pass against authoritative source while a stale artifact ships.
  Mitigation: make build output deterministic, clean stale chunks, build before checks/pack, and run a
  declared-entrypoint parity smoke.
- **Lazy-boundary regression:** bundling could pull command UI or optional parsers/collectors into the
  eager chunk. Mitigation: inspect esbuild metadata and Jiti debug traces and fail a package-owned
  build check when forbidden eager dependencies appear.
- **First-run regression:** one large uncached transform may trade warm speed for a slower first run.
  Mitigation: retain the forced-rebuild benchmark gate in addition to warm measurements.
- **Diagnostics degradation:** generated stack locations can obscure source ownership. Mitigation:
  ship source maps and verify one controlled startup failure maps to an authoritative source path.

## Rollback / Recovery

No persistent data or public command/settings migration is involved. If package-scope loading,
source maps, lifecycle parity, or either benchmark gate fails, restore `src/index.ts` to forward
`./pi-starship.js`, restore the current `files`/scripts/recipes, remove the package build dependency and
artifacts, and retain the existing source implementation unchanged.

## Plan

- [x] Prototype the exact production artifact in `extensions/pi-starship` without switching the
      declared entrypoint: externalize all runtime packages, preserve dynamic chunks, and verify with
      Jiti debug traces that checkout and extracted-pack loads evaluate one Pi runtime and exclude
      command UI, `yaml`, and optional collector chunks from the eager path; record the artifact file
      count and source-map result as acceptance evidence.
- [x] Add `extensions/pi-starship/scripts/build-runtime.mjs` and package scripts that generate the
      split `.ts` artifact through a temporary output directory, replace `dist/` only after success,
      remove stale chunks, emit generated/source-map markers, and expose esbuild metadata for eager-
      boundary validation; verify two consecutive builds produce byte-identical file names and bytes.
- [x] Add pinned `esbuild` package tooling and update `package-lock.json` using npm 12.0.2 on supported
      Node; verify `npm --version`, a package build from a clean `dist/`, and that `esbuild` remains a
      dev-only dependency while all existing runtime libraries retain their current dependency class.
- [x] Update `extensions/pi-starship/src/index.ts`, `package.json#files`, package lifecycle scripts, and
      the generic `just try` preparation path so the canonical source entry forwards the built
      artifact and checkout, root-build, pack, and installed-package routes all prepare/load it;
      verify `npm run check:boundaries`, `just try starship` startup, and an extracted tarball load.
- [x] Add a declared-entrypoint integration test under `extensions/pi-starship/test/` that exercises
      command registration, missing-settings side-effect freedom, built-in footer installation, and
      shutdown cleanup through `src/index.ts`; run it against a freshly built artifact and retain the
      existing source-level lifecycle/config suites as the detailed behavioral contract.
- [x] Add package-owned build validation that rejects eager inclusion of Pi TUI Kit command UI,
      `yaml`, optional collector implementations, bundled external packages, missing source maps, or
      stale output chunks; verify each rejection once with a controlled temporary build input and
      keep static manifest/build wiring checks outside red-first TDD.
- [x] Run focused `pi-starship` tests for config, commands, rendering, workspace collection, Git,
      lifecycle cancellation/disposal/session replacement, and generated-entry parity; audit after
      every `await` added by the build/bootstrap path and confirm no runtime await or new session-owned
      task was introduced.
- [x] Re-run seven warm measured runs and three `JITI_REBUILD_FS_CACHE=1` measured runs for both the
      authoritative source factory and declared generated entrypoint; require the generated path to
      improve warm import median by at least 60%, warm first response by at least 20%, forced-rebuild
      import median by at least 20%, and forced-rebuild first response by at least 15%, with each
      improvement larger than five baseline MADs.
- [x] Update `extensions/pi-starship/README.md` package layout and local-checkout instructions to name
      the generated runtime and canonical build-aware try command without changing user-facing
      settings or command claims; verify all standard README sections and badges remain present.
- [x] Audit the final diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md`, then run `npm run check`, `just pack starship`, inspect the tarball
      for only the intended entry/artifacts/docs/notices, and smoke built-in startup, valid user TOML,
      malformed TOML diagnostics, `/starship` discovery, and shutdown with the packed artifact.

## Execution Evidence

- A checkout and extracted tarball each loaded four eager generated TypeScript files through Jiti,
  imported the global Pi runtime once, imported no repository-local Pi runtime, and loaded no command,
  Pi TUI Kit, YAML, or optional collector chunk at startup. The package contains 11 runtime chunks and
  11 source maps; the source-map test resolves the generated command-registration line to
  `src/pi-starship.ts`.
- `build-runtime.test.mjs` proves deterministic bytes, stale-chunk removal, source-map presence, and
  rejection of eager optional implementations/dependencies and bundled package inputs.
- Lockfile work used Node 22.22.2 with Corepack npm 12.0.2; `esbuild` 0.28.1 is package-owned and
  dev-only.
- A clean-`dist` `just try starship` smoke used a noninteractive fake `pi` and rebuilt before invoking
  `pi -e ./extensions/pi-starship`; an actual packed extension loaded through Pi RPC.
- `npm test` and the final `npm run check` each passed all 2,425 repository tests. The generated-entry
  test verifies registration, side-effect-free missing settings, footer installation, and shutdown.
- Re-measured source versus generated medians were: warm import 324 -> 27 ms, warm first response
  837.72 -> 564.34 ms, forced-rebuild import 740 -> 293 ms, and forced-rebuild first response
  1245.95 -> 830.34 ms. All improvements exceed the planned percentages and five baseline MADs.
- `just pack starship` passed with 27 intended files. Packed RPC smokes covered built-in missing
  settings, valid TOML, malformed TOML diagnostics, `/starship` discovery, `/starship help`, and
  session shutdown. Jiti displays generated stack locations; the shipped source map deterministically
  resolves them to authoritative source paths, which is the accepted diagnostic path.

## Completion Checklist

- [x] `src/index.ts` remains the sole declared Pi entrypoint and loads a deterministic generated
      runtime without evaluating a second Pi runtime.
- [x] Warm and forced-rebuild import/first-response results pass all four recorded relative thresholds
      without moving work behind first paint.
- [x] Command UI, TOML evaluation for missing settings, YAML, and unreachable optional collectors stay
      outside the eager path.
- [x] Commands, settings, rendering, refresh ordering, cancellation, disposal, replacement, shutdown,
      and missing/invalid-file behavior remain unchanged and verified through source and generated
      entrypoints.
- [x] A clean checkout can use `just try starship`, and the packed package contains every required
      generated chunk/source map and no build-only tooling.
- [x] `npm run check`, `just pack starship`, and packed-artifact Pi smokes pass; any accepted deviation
      or unverified platform path is explicitly recorded before archive.
