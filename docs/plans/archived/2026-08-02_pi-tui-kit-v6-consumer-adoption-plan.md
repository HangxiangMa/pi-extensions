# Pi TUI Kit v6 consumer adoption plan

## Goal

Adopt the published `pi-tui-kit` API-v6 capabilities in two bounded consumers: replace pi-starship's custom Modules browser with the declarative `browse` screen, then move pi-sync's remaining custom interaction lifecycle ownership to `runCustomInteraction()` without changing domain, persistence, or cancellation policy.

## Architecture

- pi-starship continues to own immutable module inspection data and state meanings; `pi-tui-kit` owns generic search, list/detail navigation, sanitization, bounds, IME focus, and Back/Close behavior.
- pi-sync continues to own secret masking, commit-aware cancellation, route outcomes, settings, and notifications; `pi-tui-kit` owns custom interaction cancellation, stale-owner classification, exactly-once disposal, and pending-work draining.
- Each consumer independently raises its `@narumitw/pi-tui-kit` compatibility floor to the published API version it now requires.

## Non-Goals

- Do not migrate pi-starship's transactional settings preview or Explain footer.
- Do not change pi-sync settings formats, precedence, persistence, backend behavior, or setup workflow.
- Do not migrate pi-btw, pi-image-drop, or pi-statusline in this change.

## Plan

- [x] Add a focused pi-starship regression test for Modules browse search over non-rendered module metadata; the pre-migration test failed because `remote_name` produced “No matching modules”.
- [x] Replace pi-starship's custom Modules interaction with a declarative `browse` screen, remove superseded browser code, raise only pi-starship's helper floor, and pass 32 focused command, inspection, and lifecycle tests.
- [x] Add focused pi-sync regression tests proving a pre-open stale secret prompt never creates its masked component and a session-owned cancellable route receives cancellation and drains before return; the pre-migration tests exposed both stale component creation and a non-aborted route signal.
- [x] Migrate pi-sync secret input and cancellable operation UI to `runCustomInteraction()`, preserve domain results and commit-aware cancellation, raise only pi-sync's helper floor, and pass focused secret/menu/lifecycle/settings tests.
- [x] Run formatting, boundary checks, workspace typechecks, all 2,126 tests, dependency resolution checks, and `git diff --check` through `npm run check`, pinned-npm `npm ls`, and the explicit diff check.
- [x] Run `just pack-starship` and `just pack-sync`, inspect the 61-file and 45-file tarball manifests, and audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`.

## Completion Checklist

- [x] Pi-starship Modules uses `kind: "browse"` and retains searchable, adaptive, terminal-safe, injected-keybinding, Back/Close, missing-file, session-replacement, and shutdown behavior.
- [x] Pi-sync custom interactions use `runCustomInteraction()` and separately handle user cancellation, external disposal, session replacement, shutdown, commit start, pending operation settlement, and secret clearing.
- [x] No settings schema, file, persistence, or non-TUI behavior changed.
- [x] Both consumers resolve published `pi-tui-kit@0.45.0`, and package dry runs contain only intended files.
- [x] The repository CI-equivalent gate passes, and this completed plan is archived.
