# pi-plan-mode launch menu

## Goal

Change bare `/plan` from immediately enabling Plan mode into an explicit, state-aware launch menu
when no plan workflow is active. Let users start with the current tool selection, stage a different
tool selection before starting, or read a concise explanation, while preserving existing ready,
saved, active-implementation, inline-prompt, flag, and management-command behavior.

## Context

- Today, bare `/plan` immediately enables Plan mode only when the extension is inactive with no saved
  or active implementation plan. Other Plan states already open dedicated menus.
- The approved inactive menu shows that Plan mode is off, summarizes the tools that will be active,
  and offers **Start Plan mode**, **Choose tools, then start…**, and **How Plan mode works**.
- Tool changes made in the launch flow are draft-only until the user chooses the explicit
  **Done — start Plan mode** action. Back, Escape, Ctrl+C, owner disposal, session replacement, and
  shutdown must leave Plan state, active tools, thinking level, and persisted tool selection
  unchanged.
- `/plan start` becomes the deterministic no-prompt activation route and a completed argument. This
  intentionally reserves the exact payload `start`; `/plan start <more text>` remains an inline
  planning prompt. `/plan <prompt>`, `/plan tools`, `--plan`, and all existing management routes keep
  their current behavior.
- Bare `/plan` in print and JSON modes cannot open the approved menu, so it must fail observably
  before mutation and direct users to `/plan start` or `/plan <prompt>`. TUI and RPC use Pi TUI Kit's
  standard menu adapters.
- Touched convention areas are the public slash-command surface, TUI/RPC menu behavior, non-TUI
  fallback, session-owned interaction lifecycle, session-persisted tool selection, tests, and
  package documentation. No global settings schema or file persistence format changes are planned.

## Architecture

- Add `extensions/pi-plan-mode/src/plan-launch-menu.ts` as the declarative Pi TUI Kit surface for the
  inactive main, staged tool-selection, and help screens. It owns only interaction-local draft state
  and delegates activation, tool validation/commit, status text, and lifecycle ownership through
  callbacks. Keep the existing immediate active selector in `src/plan-tool-menu.ts` so standard menu
  presentation is separate from the extension orchestrator without merging the two commit models.
- Keep `extensions/pi-plan-mode/src/plan-mode.ts` as the domain orchestrator. It decides which Plan
  state owns bare `/plan`, captures the current menu lifecycle, provides a read-only effective tool
  snapshot, commits a validated staged selection only at activation, and performs the existing
  `enterPlanMode()` transition.
- Keep the active `/plan tools` selector's immediate session-update behavior unchanged. Share pure
  tool-row projection or effective-selection helpers where that prevents launch-menu and active-menu
  policy drift, but do not merge their different commit semantics.
- Use the existing `menuController`, `menuGeneration`, and `workflowGeneration` ownership checks.
  Every action checks its supplied abort signal/current owner before a domain mutation; Pi TUI Kit
  drains pending toggles and classifies replacement or disposal as stale.

## Non-Goals

- Do not add a prompt editor to the launch menu.
- Do not redesign the ready, saved, active Plan-mode, or active implementation menus.
- Do not add a global settings UI or change `pi-plan-mode.json`.
- Do not change Plan-mode tool safety policy, thinking-level policy, plan completion, export, save,
  or implementation behavior.

## Risks

- Ninety-two existing tests currently use bare `/plan` as a setup shortcut. They must move to the
  public `/plan start` route except where the test intentionally exercises a no-argument menu, or the
  suite could accidentally bypass the new contract.
- Computing the inactive tool summary through the current mutating selection resolver could migrate
  or filter session state merely by opening and cancelling the menu. The launch path needs a pure
  snapshot and must commit migration/filtering only when activation is accepted.
- Pi TUI Kit multi-select toggles invoke actions immediately. Those actions must update only a
  launch-local draft; the pinned **Done — start Plan mode** action is the sole commit path. The
  standard Back/Close row must never be treated as acceptance.
- Reserving exact `start` narrows the existing free-form prompt namespace. README migration text and
  autocomplete must make the new meaning explicit.

## Plan

- [x] Add focused red tests in `extensions/pi-plan-mode/test/launch-menu.test.ts` for inactive bare
      `/plan` opening (without activation) in TUI and RPC, **Start Plan mode**, staged tool selection
      plus **Done — start Plan mode**, the help/back path, and root cancellation; evidence: the first
      focused run executed 7 tests and all failed because bare `/plan` activated immediately, no RPC
      dialog opened, `start` was absent, and print/JSON did not reject.
- [x] Add command-contract red tests for exact `/plan start`, `start` autocomplete, unchanged inline
      prompt and `--plan` activation, rejection of inactive bare `/plan` in print/JSON before any
      state or tool mutation, and unchanged dispatch to ready/saved/implementation menus; evidence:
      the focused red run failed on both the missing direct route and unsupported-mode contract.
- [x] Implement `src/plan-launch-menu.ts` with Pi TUI Kit `actions`, `multiSelect`, and `detail`
      screens, width-safe/status copy, a launch-local selected-name draft, disabled policy rows,
      explicit **Done — start Plan mode** commit, and Back/Close transitions; evidence: 10 focused
      launch-menu TUI/RPC tests pass, including a 42-column render and staged RPC tool selection.
- [x] Update `src/plan-mode.ts`, `src/command.ts`, and shared tool-selection behavior to route only
      the inactive/empty bare command into the launch menu, expose a pure effective-tool snapshot,
      validate and persist staged names atomically with `enterPlanMode()`, add exact `/plan start`,
      and throw the actionable print/JSON fallback before mutation; evidence: focused direct-command,
      inline-prompt, autocomplete, default-tool, and unsupported-mode assertions pass.
- [x] Add focused cancellation and lifecycle coverage for draft toggles followed by Back, Escape,
      Ctrl+C, external component disposal, session replacement, and shutdown, asserting no launch
      selection is persisted and no tool activation, stale notification, or model turn occurs;
      evidence: all 10 focused tests settle and pass across those owner endings.
- [x] Replace bare `/plan` setup calls throughout `extensions/pi-plan-mode/test/*.test.ts` with
      `/plan start` where direct activation is the test precondition, retain bare calls only for
      state-menu assertions, and run all pi-plan-mode tests to prove existing planning, safety,
      completion, export, save, implementation, resume, and compaction behavior remains compatible;
      evidence: all 126 compiled pi-plan-mode tests pass.
- [x] Update `extensions/pi-plan-mode/README.md` with the new inactive menu, `/plan start`, the exact
      `start` reservation, staged tool commit/cancellation semantics, unchanged state-specific menus,
      and print/JSON migration guidance; package formatting/typecheck evidence is collected in the
      final verification task, with no new Pi TUI Kit API or dependency-floor change required.
- [x] Audit the final diff against `docs/extension-conventions.md` for command routes, all claimed
      modes, menu lifecycle, cancellation/disposal/replacement/shutdown, and session-state
      persistence; evidence: `npm run check` passed 2,275 tests, the final focused package run passed
      all 126 pi-plan-mode tests, print-mode Pi smokes loaded `/plan start` and surfaced the bare-menu
      recovery error, and `just pack plan-mode` included the declared entrypoint, both menu modules,
      README, and license in a 24-file dry-run tarball.

## Completion Checklist

- [x] In inactive empty TUI and RPC sessions, bare `/plan` opens the approved menu and does not enable
      Plan mode until an explicit start action is accepted.
- [x] **Start Plan mode** activates the existing default/current Plan tools and thinking policy
      without starting a model turn; `/plan start` provides the same deterministic direct behavior.
- [x] **Choose tools, then start…** stages only valid selectable tools, commits them only through
      **Done — start Plan mode**, and shows blocked tools as unavailable with textual reasons.
- [x] Help and every cancellation, Back, disposal, replacement, and shutdown path leave Plan state,
      active tools, thinking level, persisted selection, and queued model messages unchanged.
- [x] Ready, saved, active Plan-mode, and active implementation bare-command menus remain unchanged;
      `/plan <prompt>`, `/plan tools`, `--plan`, and all existing management routes retain their
      documented behavior.
- [x] Bare `/plan` in print and JSON fails observably before mutation with `/plan start` and
      `/plan <prompt>` recovery guidance, and every accepted direct route remains tested in its
      claimed modes.
- [x] TUI/RPC keyboard operation, focus, narrow-width rendering, and terminal-text safety are covered
      through Pi TUI Kit's supported testing boundary.
- [x] `npm run check` and `just pack plan-mode` pass, documentation matches behavior, and the final
      semantic audit records no unapproved deviations or unverified required paths.
