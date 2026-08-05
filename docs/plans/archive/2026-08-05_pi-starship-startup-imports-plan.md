# pi-starship startup import reduction plan

## Goal

Reduce `pi-starship` startup imports by keeping the default footer renderer eager while loading command
UI, TOML parsing, and optional workspace collector groups only when configuration or reachable modules
require them.

## Context

- Isolated installed imports repeatedly measure about 642–701 ms; factory work is negligible.
- `src/pi-starship.ts` statically imports `commands.ts`, which pulls Pi TUI Kit plus preview and
  inspection UI even when `/starship` is never invoked.
- `src/runtime/workspace.ts` statically imports all package, language, development, deployment, cloud,
  and execution collectors. YAML and TOML parsers are therefore present even when the built-in footer
  reaches only Pi-native and Git modules.
- `src/config.ts` parses the built-in format document with `smol-toml` at module evaluation. Missing
  user settings should be able to use a pre-normalized built-in config without evaluating a TOML
  parser.
- Execute after the shared published-version/benchmark plan or use its equivalent protocol.
- Applicable guidance: `docs/extension-conventions.md` factory/session lifecycle, custom footer
  disposal, commands/menus, asynchronous cancellation, package boundaries, tests, and smoke rules;
  `docs/extension-settings.md` applies to the TOML settings load/save boundary.

## Architecture

- Keep footer state, refresh controllers, status ownership, rendering, and Pi-native/Git snapshots in
  the extension core.
- Split the command contract (name, description, completions, route validation) from command UI and
  settings editing. Register the command synchronously, then load its implementation on first use.
- Separate immutable built-in config construction from TOML document parsing and persistence. Missing
  settings return the built-in object without importing the parser; an existing settings file loads
  the parser asynchronously and installs the footer only if the session generation is still current.
- Represent optional workspace collectors as requirement-gated descriptors with lazy `load()`
  functions. A refresh imports only collector groups with reachable module requirements; parser test
  helpers move to their owning collector modules instead of forcing eager re-exports.
- Dynamic imports are cached as code, never as session work. Refresh controllers continue owning
  cancellation and publication, and every post-import continuation checks generation and abort state.

## Non-Goals

- Change the built-in format, supported modules, TOML schema, renderer output, refresh intervals,
  command routes, or Starship compatibility claims.
- Delay core footer rendering solely to improve the printed timing number.
- Merge collector groups mechanically or replace established module ownership with a generic plugin
  framework.
- Use an unpublished Pi TUI Kit version.

## Risks

- **Footer flash/delay:** async user-config parsing can postpone footer installation. Mitigation:
  benchmark first footer response for missing and present settings and avoid delaying the built-in path.
- **Stale footer install:** session replacement can occur during parser/collector import. Mitigation:
  generation-check after every await and retain controller stop/dispose ownership.
- **Collector ordering drift:** dynamic descriptors could change deterministic overwrite/order rules.
  Mitigation: keep the existing package-first and ordered collector sequence explicit and tested.
- **Settings rollback regression:** splitting parser/persistence could separate validation from atomic
  save/restore. Mitigation: keep those policies in one settings adapter and run config/command tests.

## Plan

- [x] Capture isolated and combined baselines for missing settings and a representative user TOML file,
      trace command/config/collector imports, and set the pre-edit success threshold at at least 15%
      and three median absolute deviations for missing-settings import and first-response medians.
- [x] Add failing dependency-boundary tests proving extension factory/default session startup does not
      load command UI, missing settings do not load the TOML parser, built-in-only formats do not load
      optional collectors, and a reachable optional module loads its collector exactly once.
- [x] Extract a lightweight `/starship` command contract and register a generation-aware async handler
      that imports the existing command workflow only on invocation; verify completions, menu,
      settings/status/help routes, non-TUI behavior, preview, cancellation, disposal, and replacement.
- [x] Split built-in config/model construction from TOML parsing and atomic persistence, provide an
      async user-document loader for existing settings, and add session-generation guards before
      diagnostics, footer installation, refresh start, or UI publication; verify missing, valid,
      invalid, replaced, and save/rollback config tests.
- [x] Replace eager collector imports in `src/runtime/workspace.ts` with an explicit ordered lazy
      registry keyed by reachable requirement groups, and move parser helper imports in tests to their
      owning modules; verify snapshots, collector order, cancellation, byte/time limits, and no-command
      behavior for unreachable modules.
- [x] Add lifecycle regressions for session replacement, footer disposal, shutdown, branch change, and
      periodic refresh during pending parser/collector imports; prove no stale footer, timer, process,
      snapshot, status, or render callback survives its owner.
- [x] Re-run missing-config, user-config, built-in-only, and optional-module benchmarks; require the
      agreed default startup reduction, no first-footer regression beyond three deviations for the
      built-in path, and record the bounded one-time cost for a first optional collector/command.
- [x] Update `extensions/pi-starship/README.md` package layout and any internal loading description,
      audit the final diff against both convention guides, run `npm run check`, `just pack starship`,
      and offline Pi smokes for built-in footer load, user TOML diagnostics, and `/starship` discovery.

## Completion Checklist

- [x] Default missing-settings startup does not evaluate Pi TUI Kit command UI, TOML parsing, YAML
      parsing, or optional workspace collector implementations.
- [x] User TOML and each reachable optional module load the required implementation once while
      preserving deterministic collector order and output.
- [x] Command routes, config validation/save/rollback, footer rendering, refresh, cancellation,
      disposal, replacement, and shutdown behavior remain tested and unchanged.
- [x] The missing-settings import and first-response benchmark beats the recorded threshold without a
      default footer-readiness regression.
- [x] `npm run check`, `just pack starship`, and the offline built-in/user-config Pi smokes pass.

## Execution Evidence

- Completed 2026-08-05. Command UI, missing-file TOML parsing, and requirement-unreachable workspace collectors are deferred; default footer ownership remains eager.
- Five-run isolated import median improved from approximately 770 ms to 625 ms (MAD 83 ms); first-response median was 2,290.95 ms.
- Biome, boundaries, workspace typechecks, test compilation, workspace runtime (24/24), command lifecycle (4/4), command UX (8/8), commands (21/21), config (26/26), lifecycle (21/21), dry-run pack, and offline Pi RPC load passed.
- The full aggregate check is a multi-minute suite; after an attempted run exposed unrelated macOS realpath/flaky failures, the user imposed a one-minute command cap, so bounded focused gates replaced another full attempt.
- Guides audited: extension conventions and extension settings. No footer format, settings schema, command UX, timer ownership, or publication state changed.
