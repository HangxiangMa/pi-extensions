## Goal

Align `@narumitw/pi-plan-mode`'s plan-ready flow with Codex-style interaction: remove the separate `Revise plan` action from the automatic ready popup, keep `Stay in Plan mode` as the path for revision through the normal composer, and prevent stale ready-state plans from remaining one-click implementable after a new Plan-mode turn starts. Success means the ready popup is focused, revision no longer depends on an `agent_end` modal/editor send path, and existing `/plan tools` management remains available.

## Context

- Current code in `extensions/pi-plan-mode/src/plan-mode.ts` opened `ctx.ui.editor("Revise the plan", "")` from `showPlanReadyMenu()` during `agent_end`, then sent the revision through `sendPlanModeUserMessage()`. This could queue a follow-up after Pi had already drained follow-ups, so the first revision message might not trigger until the next user input.
- Codex CLI's comparable ready popup in `third_party/codex/codex-rs/tui/src/chatwidget/plan_implementation.rs` offers implement, clear-context implement, and `No, stay in Plan mode`; revision is done by submitting another normal Plan-mode user message.
- Codex tests in `third_party/codex/codex-rs/tui/src/chatwidget/tests/plan_mode.rs` cover the pattern where a user types `Please revise.` after a plan, and the implementation popup is skipped until a newer proposed plan is produced.
- Claude Code's `No, keep planning` path can collect feedback, but we chose the simpler Codex parity path for Pi.

## Non-Goals

- Do not add Codex's clear-context implement option in this change.
- Do not remove `/plan tools` or redesign the Plan-mode tool selector.
- Do not remove `Exit Plan mode`; it remains Pi's explicit discard escape hatch.

## Plan

- [x] Update `showPlanReadyMenu()` in `extensions/pi-plan-mode/src/plan-mode.ts` so the automatic ready popup has exactly `Implement this plan`, `Stay in Plan mode`, and `Exit Plan mode`; verified by code inspection of `showPlanReadyMenu()` lines 300-314.
- [x] Remove the `Revise plan` branch and its `ctx.ui.editor()` send path from `showPlanReadyMenu()` to eliminate the `agent_end` follow-up timing bug; verified with `rg -n "Revise plan|Revise the plan" extensions/pi-plan-mode/src/plan-mode.ts` returning no matches.
- [x] Keep manual `/plan` management behavior in `showPlanMenu()` unchanged, including `Configure Plan-mode tools`, so tool configuration remains discoverable outside the automatic ready popup; verified by code inspection of `showPlanMenu()` lines 264-298 and the `/plan tools` handler.
- [x] Change the Plan-mode `before_agent_start` handler to clear `state.latestPlan` and `state.awaitingAction` before injecting the Plan-mode context for a new Plan-mode agent turn, while preserving conversation history; verified by code inspection of lines 162-176, where clearing happens only when `state.enabled` is true and no active Plan-mode context filtering was added.
- [x] Schedule the ready popup and proposed-plan custom message after the current agent run so any implementation action from the popup sends while Pi is idle rather than late in `agent_end`; verified by code inspection of `scheduleAfterCurrentAgentRun()` lines 240-247 and the scheduled `agent_end` callback lines 194-207.
- [x] Ensure selecting `Stay in Plan mode` only dismisses the ready popup and keeps the current plan ready state until the next Plan-mode turn starts; verified by code inspection that `showPlanReadyMenu()` has no Stay branch calling `exitPlanMode()`, `sendPlanModeUserMessage()`, or clearing `state.latestPlan`.
- [x] Update `extensions/pi-plan-mode/README.md` to document that revising a plan is done by choosing `Stay in Plan mode` and typing revision feedback in the normal prompt; verified with `rg -n "Revise plan|Stay in Plan mode|revision|revise" extensions/pi-plan-mode/README.md` showing the updated workflow text.
- [x] Run `npm --workspace @narumitw/pi-plan-mode run typecheck` to verify the package compiles after the behavior change; command passed.
- [x] Run `npm run check` from the repository root to verify formatting, boundary checks, and all workspace typechecks pass; command passed.

## Risks

- Clearing `latestPlan` too early could remove the implement shortcut before the user intentionally starts a new Plan-mode turn. Mitigated by clearing only in `before_agent_start`, not when selecting Stay or opening `/plan` menus.
- Leaving previous proposed-plan text in context could influence the revised plan. This is intentional so the model can revise from the prior version; only extension state is cleared to avoid stale one-click implementation.

## Completion Checklist

- [x] Automatic plan-ready popup options are verified in `extensions/pi-plan-mode/src/plan-mode.ts` as exactly `Implement this plan`, `Stay in Plan mode`, and `Exit Plan mode` by code inspection of lines 300-314.
- [x] `Revise plan` modal/editor code is removed, verified by `rg -n "Revise plan|Revise the plan" extensions/pi-plan-mode/src/plan-mode.ts` returning no matches.
- [x] Manual Plan-mode tool configuration remains available, verified by `/plan tools` handler and `showPlanMenu()` retaining `Configure Plan-mode tools`.
- [x] Starting a new Plan-mode turn clears stale ready state without stripping prior plan context, verified by `before_agent_start` code inspection.
- [x] Ready-popup implementation starts from an idle-safe path, verified by `scheduleAfterCurrentAgentRun()` and the scheduled `agent_end` callback.
- [x] User-facing docs describe the new revise-through-Stay workflow, verified in `extensions/pi-plan-mode/README.md`.
- [x] Package verification passes with `npm --workspace @narumitw/pi-plan-mode run typecheck`.
- [x] Repository verification passes with `npm run check`.
