# pi-plan-mode startup import reduction plan

## Goal

Keep Plan mode's safety, tools, prompts, and session state eager while delaying launch/action/saved/
implementation/settings menu code and Pi TUI Kit until an interactive Plan workflow actually requests
those surfaces.

## Context

- Installed isolated imports measure about 258–422 ms and combined runs around 276–292 ms; factory
  work remains near zero.
- `src/plan-mode.ts` statically imports five menu modules and controllers that themselves import menu
  implementations, causing Pi TUI Kit and all interactive screens to load for sessions that never use
  `/plan`.
- Core tool registration, tool-call blocking, message transforms, prompt injection, saved-plan state,
  completion/question tools, compaction behavior, and `--plan`/direct command routes must remain
  immediately available.
- Execute after the shared published-version/benchmark plan or use its equivalent protocol.
- Applicable guidance: `docs/extension-conventions.md` commands, TUI/RPC and unsupported modes,
  asynchronous UI lifecycle, tool policy, state persistence, tests, and packaging;
  `docs/extension-settings.md` applies because the settings menu and queued settings boundary move.

## Architecture

- Keep `plan-mode.ts` as the sole owner of Plan state, workflow/menu generations, active tools,
  thinking level, persistence entries, and session transitions.
- Invert the current dependency from domain controllers to concrete menus: controllers expose domain
  actions/results and receive interactive callbacks rather than importing `plan-action-menus.ts` or
  `saved-plan-menu.ts`.
- Add one package-local cached interactive UI loader whose typed surface groups the existing launch,
  active implementation, plan action, saved plan, and settings screens. It owns only code loading;
  each screen retains interaction-local state and `plan-mode.ts` retains lifecycle ownership.
- Direct non-interactive routes such as `/plan start`, inline planning prompts, tool enforcement, and
  event handlers must not await the interactive UI loader. Bare/state-specific menu routes load it,
  then revalidate workflow generation, session manager, and abort state before opening UI or mutating
  Plan state.
- A rejected module load is reported through the existing mode-appropriate command path and must not
  enable Plan mode, alter tools/thinking, persist state, or poison later non-interactive routes.

## Non-Goals

- Redesign any Plan menu, change command grammar, add settings, change safety/tool policy, or alter
  completion, export, implementation, save, resume, or compaction behavior.
- Lazy-load core policy simply to improve a timing number.
- Introduce a generic cross-extension UI coordinator or depend on an unpublished Pi TUI Kit version.
- Change the `pi-plan-mode.json` schema, precedence, or persistence protocol.

## Risks

- **Controller inversion drift:** moving menu calls can change action ordering or ownership. Mitigation:
  preserve existing controller contracts and characterize every state-specific route before refactor.
- **Stale menu open:** session replacement can occur while the UI module imports. Mitigation: capture
  and revalidate menu/workflow generation and session manager after the await.
- **Direct-route regression:** a broad lazy boundary could delay `/plan start` or tool enforcement.
  Mitigation: add explicit loader-count tests for direct routes and lifecycle events.
- **Settings queue split:** lazy settings UI must still await ordered writes and rollback failures.
  Mitigation: keep settings persistence eager/owned by `settings.ts`; only load presentation lazily.

## Plan

- [ ] Capture inactive, `--plan`, `/plan start`, and bare `/plan` baselines with the shared benchmark,
      trace every path from `plan-mode.ts` to Pi TUI Kit, and set a pre-edit inactive/direct-route
      target of at least 15% and three median absolute deviations for import and first-response medians.
- [ ] Add failing dependency-boundary tests proving factory/session lifecycle, tool hooks, `--plan`,
      `/plan start`, inline prompts, and non-TUI rejection do not load interactive UI, while each bare
      state-specific menu route loads the UI once and preserves current dispatch.
- [ ] Refactor `plan-action-controller.ts`, export/retention coordination where necessary, and their
      callers so domain controllers no longer import concrete menu modules; verify ready, saved,
      active implementation, export, save, clear, stay, and implementation outcomes with existing tests.
- [ ] Add a typed cached interactive UI loader and replace static launch/action/saved/implementation/
      settings menu imports in `plan-mode.ts` with awaited delegates; keep command parsing,
      completions, prompt/tool policy, settings persistence, and state restoration eager.
- [ ] Add lifecycle tests for Escape, Ctrl+C, Back, component disposal, pending loader completion,
      session replacement, reload, and shutdown; prove stale loads open no UI and make no Plan state,
      tools, thinking, settings, export, session, or model-message mutation.
- [ ] Add load-failure tests proving mode-appropriate errors, unchanged state, retained direct-route
      availability, and successful recovery after reload/retry where supported; rerun all Plan mode
      safety, question, completion, saved-plan, export, fresh-session, issue-reproduction, and settings
      tests.
- [ ] Re-run inactive, direct-route, first-menu, and first-settings benchmarks; require the agreed
      inactive/direct-route reduction, no first-response regression beyond three deviations, and record
      the bounded one-time interactive load cost.
- [ ] Update `extensions/pi-plan-mode/README.md` package layout for the interactive loader/controller
      boundary, audit command modes, UI lifecycle, state/settings ordering, and tool safety against both
      guides, run `npm run check`, `just pack plan-mode`, and offline Pi smokes for `/plan start`, bare
      `/plan` RPC, and print/JSON rejection.

## Completion Checklist

- [ ] Sessions that do not open a Plan menu do not evaluate Pi TUI Kit or Plan menu implementations.
- [ ] Core Plan safety, tool registration, prompt/state restoration, `--plan`, `/plan start`, inline
      prompts, and unsupported-mode behavior remain eager and unchanged.
- [ ] Every ready/saved/active/implementation/settings menu retains its tested actions, cancellation,
      disposal, replacement, shutdown, and persistence semantics.
- [ ] Settings writes remain ordered, durable at existing boundaries, rollback-safe, and independent of
      UI module loading.
- [ ] Inactive/direct-route import and first-response medians beat the recorded target, with the first
      interactive load cost explicitly measured.
- [ ] `npm run check`, `just pack plan-mode`, and the offline TUI/RPC/print-mode smokes pass.
