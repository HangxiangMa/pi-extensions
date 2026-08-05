# Lazy extension menu imports plan

## Goal

Remove the remaining eager `@narumitw/pi-tui-kit` runtime imports from active source-loaded
extensions so no command-only menu pays the duplicate repository Pi/TUI runtime cost during startup,
then publish the change as a separate pull request.

## Context

- Reversing `pi-btw` and `pi-caffeinate` load order moved the roughly 1.6–1.9 second cost to whichever
  extension loaded first, proving that the combined timing assigns shared eager runtime work to the
  first importer.
- `pi-accounts`, `pi-image-drop`, `pi-plan-mode`, `pi-starship`, and `pi-sync` already demonstrate the
  intended lazy boundary.
- This change touches command menus and settings UI loading, not settings schemas, persistence,
  precedence, or public command routes. Applicable guides are `docs/extension-conventions.md` and
  `docs/extension-settings.md`.
- The user's existing `justfile` modification is unrelated and must remain unstaged.

## Architecture

- Keep each extension independent. Use extension-owned dynamic imports at the narrowest command/UI
  boundary rather than a cross-extension coordinator or an unpublished Pi TUI Kit API.
- Where a dedicated menu module already exists, lazy-load that module from its owning command path.
  Otherwise import Pi TUI Kit inside the menu operation immediately before its first use.
- Dynamic imports are not cancellable. Capture each flow's existing generation, owner signal, or
  controller before importing and revalidate it immediately after every new import await. Never open
  UI or publish status through a replaced session.
- Preserve non-TUI rejection/status paths before loading Pi TUI Kit and preserve all existing command,
  menu, settings, cancellation, disposal, replacement, and shutdown behavior.

## Non-Goals

- Change menu UX, command grammar, settings behavior, dependency ranges, package versions, or release
  state.
- Optimize unrelated startup work remaining in `pi-goal`, `pi-starship`, or other package domains.
- Modify the user's `justfile` work.

## Risks

- **Stale continuation:** a session can be replaced while a dynamic import is pending. Mitigation:
  revalidate the existing owner immediately after import and cover representative replacement races.
- **Cost shifting:** fixing only the first extension leaves another eager importer to absorb the shared
  cost. Mitigation: audit every production `src/` runtime import and require no eagerly reachable Pi
  TUI Kit import from any active entrypoint.
- **First-menu regression:** lazy loading moves one-time work to the first menu invocation. Mitigation:
  retain cached ESM imports and run existing focused command/menu tests in TUI and RPC paths.
- **Broad verification:** aggregate tests contain known environment-sensitive failures. Mitigation:
  run all touched-package focused tests and the full repository gate, recording unrelated failures
  without weakening tests.

## Plan

- [x] Record the eager-import package inventory and representative isolated/order-reversal benchmark
      evidence; verified 12 production and 5 experimental eager importers, with order reversal moving
      1.6–1.9 seconds between `pi-btw` and `pi-caffeinate`.
- [x] Convert production extensions (`pi-btw`, `pi-caffeinate`, `pi-chrome-devtools`, `pi-firecrawl`,
      `pi-goal`, `pi-google-genai`, `pi-langfuse`, `pi-stamp`, `pi-statusline`, `pi-subagents`,
      `pi-usage`, and `pi-worktree`) to extension-owned lazy menu imports with post-await ownership
      checks; all 12 package typechecks passed and their changed command/menu/lifecycle assertions
      passed in the focused run.
- [x] Convert experimental extensions (`pi-analytics`, `pi-codex-compact`, `pi-jupyter`, `pi-recall`,
      and `pi-webui`) to the same lazy boundary while retaining their warning and lifecycle behavior;
      all 5 package typechecks and changed command/menu/lifecycle assertions passed.
- [x] Audit the final runtime import graph to prove no active entrypoint eagerly reaches Pi TUI Kit,
      then rerun isolated and combined startup benchmarks; the `pi-btw` + `pi-caffeinate` median fell
      from about 1,808 ms to 78 ms, the user's 14-entry set measured a 1,461 ms median versus the
      observed 3,182 ms, and all 22 Kit consumers loaded without a duplicate-runtime spike.
- [x] Run Biome, boundary checks, touched-package tests, package dry-run packs, representative local Pi
      loading, and `npm run check`; Biome, boundaries, 17 packs, all typechecks, and 600 focused tests
      passed. Three focused and 14 aggregate tests reproduced pre-existing terminal-width, macOS
      `/var` realpath, FIFO timing, and unrelated lifecycle failures; no changed assertion failed.
- [ ] Complete and archive this plan, stage only intended files, create focused Conventional Commit(s),
      push the branch, and open a non-draft pull request against `main` with verification and benchmark
      evidence.

## Completion Checklist

- [x] No active production or experimental entrypoint eagerly evaluates `@narumitw/pi-tui-kit`.
- [x] Every new dynamic-import continuation revalidates its owning signal, generation, or session
      before using mutable state or UI.
- [x] Existing changed TUI, RPC, non-UI, cancellation, disposal, replacement, shutdown, settings, and
      command contracts remain covered and passing; unrelated pre-existing failures are recorded.
- [x] Combined source-loaded startup no longer transfers the duplicate Pi/TUI runtime cost to another
      extension and improves by more than benchmark variance.
- [x] Package checks, focused tests, pack smokes, local Pi smoke, and the repository gate have recorded
      evidence; the 14 unrelated aggregate failures are explicitly reported above.
- [ ] The pull request contains no `justfile` changes and performs no publication or release mutation.
