# Pi WebUI Menu Redesign Plan

## Goal

Make bare `/webui` open a current-state, goal-oriented menu in interactive Pi modes while
preserving the direct browser-opening workflow as `/webui open`, retaining existing settings and
command compatibility, and keeping cancellation, failure, session lifecycle, and stored settings
safe.

## Context

- Bare `/webui` currently starts or reuses the session-owned loopback server and issues a fresh
  one-time bootstrap link.
- `/webui settings`, `/webui status`, `/webui help`, and `/webui init` are established public routes.
- Issuing a fresh link invalidates any unused earlier bootstrap link, so that consequence must be
  visible before confirmation.
- The only routine interactive setting is automatic startup. Retention and image resource limits are
  intentionally advanced JSON settings.
- Settings writes are serialized and atomic, preserve unknown fields, restore the previous effective
  value on failure, and leave malformed files untouched.
- `ctx.ui.custom()` is TUI-only. RPC can expose supported dialog interactions, while print and JSON
  modes have no safe channel for an interactive menu or browser link.
- The approved implementation must follow `docs/extension-conventions.md`,
  `docs/extension-settings.md`, and Pi's TUI/keybinding contracts.

## Architecture

- Keep `extensions/pi-webui/src/runtime.ts` responsible for command routing, session/server state,
  and applying confirmed actions.
- Put reusable main-menu and read-only detail-screen presentation in a cohesive module such as
  `extensions/pi-webui/src/menu.ts` if keeping it in `runtime.ts` would mix rendering and lifecycle
  responsibilities.
- Build TUI selection with Pi's `SelectList`, callback-provided theme, and configured selection
  keybindings. Use `SettingsList` for the existing immediate-save preference.
- Derive every menu model from the runtime's authoritative state: server running/stopped, effective
  startup preference and source, settings validity/path, and effective image limits.
- Treat selection as confirmation: opening the menu only previews state; mutation starts only after
  the user confirms Open or Get a fresh link.
- Preserve the existing atomic settings loader/writer and server generation guards; this redesign
  changes orchestration and presentation, not storage or browser protocol.

## Non-Goals

- Redesigning the browser chat page or browser protocol.
- Adding presets, browser auto-launch, project settings, persistent browser state, or new image
  settings.
- Moving advanced retention/image limits into the primary menu.
- Changing the settings schema, defaults, file path, precedence, or unknown-field behavior.
- Removing `/webui settings`, `/webui status`, `/webui help`, or `/webui init`.

## Assumptions

- Explicit approval of this plan also approves the intentional public behavior change from bare
  `/webui` opening a link to bare `/webui` opening the menu.
- `/webui open` is the documented migration path for scripts or users that require the former direct
  action.
- TUI and interactive RPC are the only modes in which the menu can be meaningfully supported; print
  and JSON must remain side-effect-free for bare `/webui` rather than starting an invisible server.

## Risks

- **Public command behavior:** Existing muscle memory and scripts using bare `/webui` gain a menu.
  Mitigate with `/webui open`, completions, compatibility tests, and README migration guidance.
- **Mode divergence:** TUI, RPC, print, and JSON expose different UI capabilities. Keep routing
  explicit and test every claimed behavior without calling `custom()` outside TUI.
- **False cancellation:** A dismissed menu must not start a server, rotate a token, or write settings.
  Do not present server startup as cancellable after selection unless the underlying operation gains
  real cancellation.
- **Terminal safety and reflow:** Paths and errors can be long or contain terminal controls. Escape
  unsafe controls, wrap detail text, and assert every rendered line fits the supplied width.
- **Navigation regression:** Returning from Settings, Status, or Help can accidentally reopen or
  mutate state. Track the screen origin and restore a stable main-menu selection without duplicating
  actions.

## Rollback / Recovery

- Code rollback restores the previous command routing; no data migration or settings rollback is
  required.
- A failed server action leaves the previous stopped/running state intact and reports a retry route.
- A failed settings save keeps the previous effective/displayed value and the previous settings file.
- Invalid settings remain untouched and continue using safe defaults until manually repaired.

## Plan

- [x] Record explicit user approval for the bare `/webui` behavior change before editing production
      code. Evidence: the active goal explicitly requests implementing this plan and creating a PR.

- [x] Add focused failing command/menu tests in `extensions/pi-webui/test/commands.test.ts` proving
      that TUI bare `/webui` opens a menu without starting a server or issuing a link, that
      `/webui open` performs the former direct action, and that completions retain
      `settings|status|help|init`; verify the focused tests fail for the expected missing menu/open
      behavior through the repository test runner.

- [x] Add the main menu model and responsive TUI presentation in
      `extensions/pi-webui/src/menu.ts` (or a justified cohesive equivalent) with visible server,
      startup, source, and invalid-settings state; dynamic `Open WebUI`/`Get a fresh link` labels;
      consequence previews; configured navigation/confirm/cancel behavior; and stable selection;
      verify component tests at 30, 40, 80, and 120 columns show no line wider than the supplied
      width and retain all critical consequences.

- [x] Update command routing in `extensions/pi-webui/src/runtime.ts` so bare `/webui` opens the menu,
      confirmed primary actions alone call the existing server/link path, `/webui open` directly
      invokes that path, Escape/cancel causes no mutation, and unknown/trailing arguments remain
      rejected; verify command tests cover stopped, running, cancellation, repeated invocation, and
      fresh-link token rotation without regressing server deduplication.

- [x] Implement shallow secondary navigation from the menu to Settings, Status & diagnostics, Help,
      and invalid-file repair guidance, with Escape returning to the menu while direct subcommands
      still exit to Pi; verify tests cover focus/selection restoration, return versus exit, and no
      side effects from read-only screens.

- [x] Revise the existing Settings presentation in `extensions/pi-webui/src/runtime.ts` to use
      user-facing `Manual`/`Every session` terminology and explicitly state that changes save
      immediately but apply on the next session initialization or reload; block known-failing edits
      for an invalid settings document and show its preserved path/recovery instructions; verify
      existing ordered-save, unknown-field, atomic-write, and rollback tests plus new invalid-file
      UI tests pass.

- [x] Add transient applying and actionable outcome feedback around confirmed Open/Get-link actions
      without adding fake cancellation, ensuring activity status is cleared on success, error,
      replacement, and shutdown; verify lifecycle tests prove startup failure preserves stopped
      state, fresh-link failure preserves an existing server, and stale generations cannot publish
      success or leave status/widget state behind.

- [x] Define and test mode-specific behavior in `extensions/pi-webui/src/runtime.ts`: full custom menu
      only in TUI, an observable supported selection/fallback in RPC without `custom()`, and
      side-effect-free rejection for bare `/webui` in print/JSON; verify tests cover each mode and
      `/webui open` only claims modes where the resulting link is observable.

- [x] Add accessibility and terminal-safety coverage in the focused menu tests: configured selection
      keybindings, logical initial focus and restoration, text labels independent of color/icons,
      non-color running/error/invalid cues, escaped C0/C1 controls, long-path wrapping, and no hidden
      critical state at narrow widths; verify all assertions pass with Pi's current theme/component
      contracts.

- [x] Update `extensions/pi-webui/README.md` to document the menu-first bare command, `/webui open`
      migration route, menu states and navigation, immediate-save versus next-session apply behavior,
      link rotation consequence, invalid-settings recovery, supported modes, and unchanged Advanced
      JSON fields; verify command tables, Quick start, Settings, accessibility, and limitations use
      consistent final labels without removing existing compatibility/security guidance.

- [x] Run focused package checks with
      `npm --workspace @narumitw/pi-webui run check`, then run the CI-equivalent root gate with
      `npm run check`; record both successful command results in this plan.

- [x] Run `just pack webui` and inspect the dry-run contents for the new source module and updated
      README with no tests, fixtures, cache, or `node_modules`; record the successful inspection in
      this plan.

- [x] Not applicable as an interactive TUI command: repository guidance prohibits launching a TUI.
      Equivalent deterministic runtime/component tests covered menu entry, Escape with no side
      effects, Open success, fresh-link preview/rotation, Settings/Help/Status return, responsive
      rendering, and actionable failures. A non-interactive package load smoke passed with
      `pi --no-extensions --no-session --print --extension ./extensions/pi-webui '/webui open'`
      (exit 0, no protocol output or server side effect).

## Execution Evidence

- TDD red state: the first `npm test` run failed because bare `/webui` still started the server and
  `open` was absent from completions; the final post-rebase suite passes 1,466/1,466 tests.
- `npm --workspace @narumitw/pi-webui run check` passed with current browser assets and TypeScript.
- `npm run check` passed on the final tree, including Biome, boundaries, workspace typechecks, and
  all 1,466 tests.
- `just pack webui` passed; the 30-file preview includes `src/menu.ts` and updated README/source, and
  excludes tests, fixtures, cache, and `node_modules`.
- `git diff --check` passed.

## Completion Checklist

- [x] Bare `/webui` opens the current-state menu in every claimed interactive mode and does not mutate
      state until confirmation.
- [x] `/webui open` preserves the former direct browser-link workflow, and every established
      subcommand remains documented, completed, rejected safely, and tested in its claimed modes.
- [x] Primary, preview, confirmation, cancellation, navigation, success, failure, disabled, partial,
      and compatibility states satisfy the approved proposal.
- [x] Settings persistence, unknown fields, malformed files, server lifecycle, browser protocol, and
      stored user data remain backward compatible without migration.
- [x] Responsive width, keyboard/focus, terminal-safety, non-color-cue, and theme checks pass.
- [x] `npm --workspace @narumitw/pi-webui run check`, `npm run check`, `just pack webui`, and the
      applicable Pi runtime smoke have recorded passing evidence.
- [x] `extensions/pi-webui/README.md` accurately describes the final behavior and migration route.
- [x] After every item is complete, move this plan to
      `docs/plans/archived/2026-07-26_pi-webui-menu-redesign-plan.md` without overwriting an existing
      archive.
