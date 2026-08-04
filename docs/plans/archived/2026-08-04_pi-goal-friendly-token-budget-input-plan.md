# Pi Goal friendly token-budget input plan

## Goal

Make the TUI path for starting a Goal with a token budget understandable without requiring users to
remember compact-number syntax, while preserving exact custom input, safe cancellation, the existing
increase-and-resume safeguards, and all direct-command and persisted-state compatibility.

## Context

The current **Start with token budget…** path collects the objective first, then opens a generic
`Token budget` input with only `100k` as a placeholder. The UI does not explain accepted formats,
cumulative-token semantics, one-call overshoot, the independent automatic-work response limit, or
that this is not a dollar-cost cap. Invalid input reopens the generic prompt without retaining the
entered draft, and cancelling the budget prompt closes the manager.

`parseTokenBudget()` currently accepts positive safe values written as full numbers or
case-insensitive decimal `k`/`m` forms, including `300000`, `300k`, `2.5k`, and `1.5m`. The direct
`/goal --tokens` route, goal persistence format, budget accounting, one-call overshoot behavior, and
automatic-work limit are existing public contracts.

The proposed start flow is:

1. Choose `25k`, `100k` (suggested), `300k`, or **Set a custom budget…**.
2. Show the cumulative-token, overshoot, cost, and current automatic-work-limit context.
3. For custom input, keep invalid drafts available for correction and show concrete examples.
4. Open the objective editor with the selected budget visible; submitting starts the Goal, while
   cancellation returns without creating or replacing a Goal.

The secondary **Increase budget and resume…** path should reuse the clearer custom-input language,
show current budget and usage, preserve its exact confirmation, and continue rejecting stale goal
state after asynchronous dialogs.

## Architecture

- Keep workflow ownership in `extensions/pi-goal/src/menu.ts`; use declarative
  `@narumitw/pi-tui-kit` action/input screens rather than adding a bespoke component. The published
  input-screen API begins at `@narumitw/pi-tui-kit` 0.46.0, so pi-goal must raise its reviewed
  compatibility floor from 0.40.0 to 0.46.0 and update the root lockfile.
- Hold selected start-budget values and custom-input drafts only in the current manager invocation.
  Do not persist or apply a budget until `GoalCommandController.startGoal()` accepts the objective.
- Return rejected custom-input actions to the same input screen so the kit preserves the TUI draft;
  return Escape to the budget chooser and Ctrl+C to close the manager.
- Read the effective `continuationLimits.automaticTurns` when rendering budget context so finite and
  Unlimited automatic work are distinguished without coupling the two limits.
- Keep `parseTokenBudget()` as the canonical parser and retain its accepted syntax and numeric
  normalization. Do not add a second parser for presets or TUI input.
- Keep `GoalCommandController` responsible for replacement confirmation, activation rollback,
  persistence, and prompt delivery. Extend success feedback only with the selected token-budget
  state; do not duplicate activation logic in the menu.
- Revalidate manager generation, active-goal identity, current usage, component disposal, session
  replacement, and shutdown after each asynchronous editor/input/confirmation boundary before
  starting, replacing, increasing, or resuming a Goal.

## Non-Goals

- Do not add a dollar-cost cap, provider-balance query, or cost estimate.
- Do not change token accounting, budget exhaustion, overshoot, response-cap, or no-progress logic.
- Do not change the unbudgeted **Start a goal…** path or add a redundant **No budget** row.
- Do not change `/goal --tokens`, parser syntax, stored Goal/settings schemas, or unknown-field
  preservation.
- Do not introduce a custom TUI component when the kit's action and input screens satisfy the flow.

## Assumptions

- `100k` remains a suggestion rather than a default because an ordinary Goal has no token budget.
- The initial preset proposal is `25k`, `100k`, and `300k`; no usage telemetry currently validates
  task-size labels or conversion impact.
- Supported responsive verification remains the package's established 40-, 80-, and 120-column TUI
  harness widths. Pi terminal UI has no Web ARIA surface, so accessibility evidence is textual
  hierarchy, non-color-only meaning, keyboard operation, focus/IME forwarding, and bounded output.

## Unknowns

- None. The implementation goal explicitly approved the plan's `25k` / `100k` / `300k` presets,
  budget-before-objective order, and objective-submit-as-Apply behavior.

## Risks

- Presets can imply unsupported cost or task-duration guarantees; use neutral ceiling language and
  state that token usage is cumulative, may overshoot by one model call, and is not a dollar cap.
- Moving budget selection before objective entry changes TUI ordering; keep direct routes unchanged
  and test Back/Escape behavior so the change does not strand or silently discard applied state.
- Menu-owned drafts can become stale while dialogs are open; reuse the existing generation and
  active-goal guards and test replacement/disposal races.
- Long helper text can overflow narrow terminals; rely on kit wrapping and verify every rendered line
  by terminal-cell width at 40, 80, and 120 columns.

## Plan

- [x] Obtain explicit approval for the `25k` / `100k` / `300k` presets, budget-before-objective flow,
      and objective-submit-as-Apply behavior; the active implementation goal approved the plan and
      the resolved decision is recorded under Unknowns.
- [x] Add red-first interaction tests in `extensions/pi-goal/test/menu.test.ts` for the start-budget
      chooser, exact preset labels/context, custom-input examples, accepted compact/full formats,
      invalid-draft retention, Back/Escape/Ctrl+C, objective cancellation, and successful start;
      the initial focused run failed on the missing chooser/custom guidance, and the updated focused
      menu suite passes 28/28 tests.
- [x] Refactor the start-budget route in `extensions/pi-goal/src/menu.ts` into shallow declarative
      chooser and custom-input screens with menu-owned draft state; preset and custom integration
      tests prove exact normalized budgets apply only after objective submission and cancellation
      leaves Goal state unchanged.
- [x] Extend `extensions/pi-goal/test/menu.test.ts` with finite/Unlimited automatic-work context,
      manager/session disposal, replacement during an awaited dialog, and 40/80/120-column
      keyboard/focus rendering cases; the focused TUI harness passes without overflow, lost draft, or
      stale mutation.
- [x] Update the increase-and-resume input path in `extensions/pi-goal/src/menu.ts` to show current
      budget, current usage, accepted-format examples, and the exact required lower bound while
      retaining its existing preview confirmation; focused tests pass for confirmation,
      cancellation, invalid/lower values, exact non-round usage, replacement, changed usage,
      immediate resume, and the maximum-safe-integer disabled state.
- [x] Update start feedback in `extensions/pi-goal/src/commands.ts` only as needed to report the exact
      selected cumulative token budget alongside the finite or Unlimited automatic-work state;
      focused command tests pass for budgeted and no-budget starts, while existing rollback coverage
      remains in the package suite.
- [x] Preserve parser and direct-route compatibility in `extensions/pi-goal/src/command.ts` and its
      tests, adding representative assertions for `300000`, `300k`, `2.5k`, and `1.5m`; focused tests
      pass for those forms plus malformed, zero, negative, non-finite, and unsafe values.
- [x] Raise `extensions/pi-goal/package.json`'s `@narumitw/pi-tui-kit` floor to published version
      `^0.46.0` and update `package-lock.json`; pinned npm 12.0.2 under Node 22 changed only the intended
      nested dependency, package checks pass, and `just pack goal` contains the declared source,
      README, manifest, and notices.
- [x] Update `extensions/pi-goal/README.md` with presets, custom syntax examples, cumulative-token and
      one-call-overshoot semantics, independent automatic-work limits, cancellation/navigation, and
      the cost-cap distinction; reviewed labels and direct routes match production.
- [x] Audit the completed diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md` for TUI bounds, keyboard/focus/IME behavior, asynchronous
      lifecycle guards, cancellation, runtime rollback, compatibility, and documentation; the menu
      uses published kit 0.46 input screens, revalidates menu/queue/goal/usage/status ownership after
      awaits, retains existing command rollback, and has no accepted convention deviation.
- [x] Run `npm run check --workspace @narumitw/pi-goal`, all compiled pi-goal tests,
      `npm run test:runtime --workspace @narumitw/pi-goal`, and root `npm run check`; package checks,
      295 pi-goal tests, and the runtime smoke passed. The linked-worktree root run reproduced the
      known pi-sync Git-environment fixture failure (2,407/2,408), while exact commit
      `a9f090149d0ea88a035a96fb3fb374fc61a7f6e9` passed all 2,408 tests in a clean normal clone under
      Node 22 and pinned npm 12.0.2.
- [x] Commit the bounded implementation on `feat/pi-goal-friendly-token-budget-input`, push the new
      branch, and open a PR against `main`; PR #553 is open and mergeable at exact pushed commit
      `a9f090149d0ea88a035a96fb3fb374fc61a7f6e9`, has zero review threads, and CI plus all CodeQL checks
      pass.

## Completion Checklist

- [x] The start-budget chooser exposes exactly three approved presets, one custom route, and Back,
      with no redundant no-budget option; focused menu assertions prove the exact action list.
- [x] Custom input explains accepted syntax, preserves invalid drafts, and normalizes through the
      existing parser without changing its public contract; parser and TUI draft tests pass.
- [x] The UI distinguishes cumulative token budget, possible one-call overshoot, automatic response
      cap, and dollar cost in every decision-relevant screen; finite and Unlimited tests pass.
- [x] Preset/custom selection remains provisional until objective submission; cancellation,
      disposal, replacement, and shutdown have no unintended side effects in lifecycle tests.
- [x] Increase-and-resume preserves current state, exact preview/confirmation, stale-state rejection,
      failure rollback, and immediate success feedback; focused and existing delivery tests pass.
- [x] TUI output is bounded and readable at 40, 80, and 120 columns; arrows, Enter, Escape, Ctrl+C,
      focus restoration, and IME forwarding remain operable without color-only meaning in the TUI
      harness and published kit component contract.
- [x] Direct `/goal --tokens`, unbudgeted starts, parser syntax, persisted data, settings unknown
      fields, and existing token-accounting semantics remain backward compatible; all 295 compiled
      pi-goal tests pass.
- [x] README behavior, focused tests, package/runtime checks, root CI-equivalent verification, pushed
      PR state, and GitHub checks all match the final implementation and PR #553.
- [x] After every item above has evidence, archive this plan under `docs/plans/archived/` without
      overwriting an existing file; archived as
      `docs/plans/archived/2026-08-04_pi-goal-friendly-token-budget-input-plan.md`.
