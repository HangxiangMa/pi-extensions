# pi-subagents delegation workflows plan

## Goal

Let users choose an async-only delegation workflow that omits the blocking `subagent` tool, while redesigning `/subagents` around delegation goals, preserving the current default, existing blocking-only configuration, compatibility commands, stored settings, and expert controls.

## Context

- The extension currently always registers blocking `subagent`; `stateful.enabled: false` can remove only the four detached lifecycle tools.
- `/subagents` leads with implementation-oriented lifecycle, transport, and completion fields instead of the consequential choice of whether delegation can block the root agent.
- Pi can register and activate tools dynamically but exposes no extension tool-unregistration API. A persistent workflow change that removes a registered tool therefore needs an extension reload to make the registered surface match the selected workflow.
- The existing settings writer already rejects malformed settings, patches known fields atomically, and preserves unknown JSON fields.
- TUI interactions use `SelectList` and `SettingsList`; RPC can receive notifications, while JSON and print modes must remain silent.

## Architecture

- Add optional `blocking.enabled` to `SubagentSettings`, defaulting to `true`; retain `stateful.enabled`, defaulting to `true`.
- Derive the user-facing workflow without adding a competing stored enum:
  - `all`: blocking enabled, detached enabled.
  - `async-only`: blocking disabled, detached enabled.
  - `blocking-only`: blocking enabled, detached disabled.
  - `disabled`: both disabled, recognized for expert/manual configuration but not offered as a primary preset.
- Register blocking tool definitions through a dedicated helper only when blocking is enabled. Register lifecycle tools through the existing stateful boundary only when detached mode is enabled. Keep commands available even when both execution surfaces are disabled so recovery remains possible.
- Extend settings inspection and atomic patching to expose configured workflow, source, path, and errors while preserving unknown top-level, `blocking`, and `stateful` fields.
- Make `/subagents` current-state-first: show the configured/current delegation workflow, human-readable completion behavior, agent counts, and goal-oriented actions. Move transport/path/source details to Status or Advanced presentation.
- Use a preview/confirmation screen for workflow changes. Save only after explicit confirmation, then reload as the terminal command action. Cancel performs no mutation. A failed write leaves runtime and stored settings unchanged; malformed settings remain non-overwritable.
- Retain `/subagents settings|status|help`, `/subagents:config`, `/subagents:agents`, existing JSON settings, migration behavior, and non-TUI behavior.

## Non-Goals

- Do not add an `unregisterTool` workaround, mutate the user's unrelated active-tool selection, or claim that a tool has been removed before reload completes.
- Do not add an interactive editor for transport, capacity, retention, mailbox, workspace, or agent model/thinking settings.
- Do not change blocking execution, detached scheduling, completion delivery, persistence, mailbox, worktree, or child-session semantics.
- Do not offer the all-disabled expert configuration as a primary preset.
- Do not remove direct or compatibility command routes.

## Risks

- Reload runs the remainder of the command in a stale extension frame; the handler must `await ctx.reload(); return` and perform no later runtime access.
- A settings write can succeed before reload fails. The UI must distinguish saved configuration from active runtime and provide an actionable reload instruction rather than falsely claiming the registered surface changed.
- Deriving presets from two booleans can mishandle explicit `false`; tests must cover all four combinations and absent defaults.
- Narrow terminals and long settings paths can hide consequential state; custom views must hard-bound every line and retain mode/effect text.
- Reorganizing menu order can break selector-driving tests and muscle memory; direct routes and labels remain available, while focused tests assert the revised order and Escape/back behavior.

## Rollback / Recovery

- Removing `blocking.enabled` restores the historical default because absence means blocking enabled; no stored-data migration is required.
- Existing releases ignore the unknown `blocking` object and continue registering blocking mode, so downgrade is safe.
- If reload fails after a successful save, the current runtime remains usable until the user runs `/reload`; `/subagents status` reports configured workflow separately from current registered tools.
- If the redesign regresses, the old menu can be restored without reverting the settings schema or tool registration guard.

## Plan

- [x] Add failing settings and registration tests in `extensions/pi-subagents/test/subagents.test.ts` for absent/default, all, async-only, blocking-only, disabled, malformed, and unknown-field cases; the first focused run failed in exactly two cases because `blocking.enabled` was not normalized and async-only still registered blocking `subagent`.
- [x] Extend `extensions/pi-subagents/src/agents.ts` and `extensions/pi-subagents/src/settings.ts` with `blocking.enabled`, workflow derivation/inspection, and an atomic workflow updater that preserves unknown fields; focused tests pass for normalization, default/user source detection, malformed-file rejection, unknown-field preservation, and all workflow combinations.
- [x] Extract conditional blocking-tool registration in `extensions/pi-subagents/src/subagents.ts`, keep error propagation scoped to registered blocking mode, and retain commands when one or both execution surfaces are disabled; exact registered names pass for all, async-only, blocking-only, and disabled workflows, and async-only prompt guidance does not name the unavailable blocking tool.
- [x] Add TUI contract tests for the goal-oriented manager, workflow preset selection, concrete current-to-new preview, confirmation, cancellation, save failure, reload invocation/failure, disabled/configured-versus-current state, Escape/back navigation, and bounded 40/60/100-column rendering; the initial workflow test failed against the old manager before implementation.
- [x] Refactor `extensions/pi-subagents/src/config-ui.ts` so the manager prioritizes Change delegation, Current agents, Completion behavior, Advanced settings, and Help; human-readable labels, shallow advanced disclosure, explicit preview/save/cancel semantics, terminal successful reload, and actionable save/reload failures are covered by TUI tests while direct and compatibility routes still pass.
- [x] Update status/help and non-TUI presentation to distinguish current registered tools from configured workflow, preserve RPC notifications and JSON/print silence, and explain `/reload` recovery after a saved-but-not-applied reload failure; focused manager, route, partial-state, and non-TUI tests pass.
- [x] Update `extensions/pi-subagents/README.md`, `docs/implementation-notes/pi-subagents-capability-matrix.md`, and `docs/implementation-notes/pi-subagents-stateful-runtime.md` with workflow presets, async-only JSON, preview/reload semantics, compatibility, disabled behavior, and advanced-setting paths; targeted searches found no stale always-registered/fixed-five-tool claims.
- [x] Format only intended files, then run `git diff --check`, focused compiled tests, `npm run typecheck --workspace @narumitw/pi-subagents`, `npm run check`, and `just pack-subagents`; all 1,497 repository tests pass, Biome/boundaries/typechecks pass, and the dry-run tarball contains the expected 24 files.

## Completion Checklist

- [x] `blocking.enabled: false` with detached mode enabled registers only the four asynchronous lifecycle tools.
- [x] Existing settings with no `blocking` field retain the five-tool default, and existing `stateful.enabled: false` remains blocking-only.
- [x] `/subagents` makes the current delegation workflow and its effect visible before the user chooses an action.
- [x] Workflow changes show a concrete preview, require explicit `Save and reload`, and cancellation has no side effects.
- [x] Successful writes are atomic and preserve unknown fields; malformed settings and write failures preserve the previous valid state with actionable feedback.
- [x] Empty, disabled, configured-versus-current partial, success, error, RPC, JSON, and print states are safe and tested.
- [x] Keyboard navigation, focus order, Escape/back behavior, non-color wording, and 40/60/100-column bounds are verified within Pi TUI capabilities.
- [x] Existing direct commands, compatibility aliases, persisted state, legacy filename migration, and expert manual settings remain compatible.
- [x] User documentation and implementation notes describe the final workflow and reload behavior.
- [x] Focused tests, repository checks, package typecheck, and package dry run pass with recorded evidence.
