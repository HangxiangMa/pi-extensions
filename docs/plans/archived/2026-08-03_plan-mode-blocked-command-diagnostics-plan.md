# Plan Mode blocked-command diagnostics

## Goal

Add a focused follow-up on a new branch stacked on the Plan Mode Git-inspection PR (#536) so a
rejected compound Bash request identifies the first command segment that failed the reviewed
inspection policy, without generating a safe alternative, adding probabilistic model judgment, or
changing which commands are allowed. Open a separate PR against the parent feature branch so its diff
contains only the diagnostic follow-up.

## Context

- The current `tool_call` hook reports the complete Bash input as `Command: ...`, so a chain such as
  `git status && git reset --hard && git diff --cached` does not identify `git reset --hard` as the
  failing segment.
- `isSafeCommand()` already splits supported command lists and pipelines into quote-aware segments
  and requires every segment to pass the deterministic validator. The diagnostic should reuse that
  exact split and validation path rather than add a second parser or reason taxonomy.
- When shell splitting itself fails because the input is empty, malformed, multiline, redirected,
  contains a subshell, or uses another unsupported construct, no reliable subcommand boundary is
  available. In that case, report the trimmed complete input, or `(empty command)` for blank input.
- `extensions/pi-plan-mode/src/plan-mode.ts` is exactly 1,000 lines. Keep it at or below that limit by
  replacing the current boolean import/check and message in place; put the diagnostic helper in
  `tool-policy.ts`.
- Touched convention areas are limited-Bash command enforcement, user-visible tool failure text,
  package documentation, and deterministic tests. No settings, lifecycle, dependency, metadata, or
  package-loading behavior changes.

## Architecture

- Add `findBlockedCommandSegment(command, safeSubcommands): string | undefined` to
  `extensions/pi-plan-mode/src/tool-policy.ts` as the authoritative assessment entrypoint:
  - return `undefined` when all parsed segments are accepted;
  - return the first rejected parsed segment in source order;
  - return the trimmed complete input when parsing fails;
  - return `(empty command)` for empty or whitespace-only input.
- Keep `isSafeCommand()` as the existing boolean contract and implement it by checking whether
  `findBlockedCommandSegment()` returned `undefined`, ensuring policy and diagnostics cannot drift.
- In the active Plan Mode Bash hook, call the new helper once and block when it returns a string. Keep
  the existing policy summary, replace `Command:` with `Blocked command:`, and include only that
  segment. Do not ask the model to classify the input or suggest another command.
- Re-export behavior remains unchanged: `isSafeCommand()` stays available through `plan-mode.ts`;
  the diagnostic helper is module-internal to the hook/tests and does not become a documented public
  extension API.

## Non-Goals

- Explaining which option, flag, shell token, or policy rule caused the rejection.
- Reporting every rejected segment rather than the first one.
- Rewriting commands, recommending safe equivalents, or automatically retrying execution.
- Expanding supported shell syntax or changing any Git/GH/shell allow-or-block decision from PR #536.
- Adding settings, commands, menus, telemetry, dependencies, or package metadata.

## Risks

- Refactoring the boolean path could accidentally widen or narrow command acceptance. Mitigate with
  control tests proving accepted commands still return `undefined`, all existing policy tests remain
  unchanged, and the boolean wrapper agrees with the diagnostic helper.
- Unsupported shell syntax cannot always be reduced to one segment without weakening or replacing
  the parser. Preserve fail-closed behavior and report the complete input for those cases rather than
  guessing a boundary.
- A compound command may contain multiple rejected segments. Reporting the first is deterministic,
  matches evaluation order, and avoids implying that later segments were otherwise approved.

## Rollback / Recovery

This change has no persisted state or migration. Roll back by restoring the boolean hook check and
prior `Command:` message, removing the helper and its focused tests; command policy remains unchanged.

## Plan

- [x] Add red-first tests in `extensions/pi-plan-mode/test/tool-policy.test.ts` for the diagnostic
      helper: accepted chains return `undefined`, a single rejected command returns itself, a compound
      chain returns its first rejected segment, unsupported syntax returns the trimmed complete input,
      blank input returns `(empty command)`, and `isSafeCommand()` remains behaviorally consistent.
      Evidence: the focused suite ran all 9 cases and failed only the new diagnostic case because the
      helper export was still undefined.
- [x] Implement `findBlockedCommandSegment()` in `extensions/pi-plan-mode/src/tool-policy.ts` by
      reusing `splitShellSegments()` and `isSafeSegment()`, then delegate `isSafeCommand()` to it.
      Evidence: the cleanly compiled focused policy suite passed all 9 cases, including every existing
      allow/block assertion and the new helper/wrapper consistency controls.
- [x] Add a red-first active-hook test in
      `extensions/pi-plan-mode/test/safe-subcommands.test.ts` using a compound command whose middle
      segment is rejected; assert the reason contains exactly `Blocked command: <first rejected
      segment>` and does not present a safe alternative or misidentify accepted neighboring segments.
      Evidence: the focused hook suite ran all 3 cases and failed only this new assertion because the
      old message displayed the complete three-segment chain as `Command:`.
- [x] Replace the Plan Mode Bash hook's boolean check with one call to the diagnostic helper and emit
      the first blocked segment in `extensions/pi-plan-mode/src/plan-mode.ts`. Evidence: the compiled
      policy and hook suites passed all 12 cases, including compound and malformed-input presentation,
      and `plan-mode.ts` remains exactly 1,000 lines.
- [x] Update `extensions/pi-plan-mode/README.md` to state that a limited-Bash rejection identifies the
      first blocked command segment, while malformed or unsupported shell syntax reports the complete
      input; do not document reason codes or replacement-command guidance. Evidence: the package
      Biome/typecheck gate passed all 31 checked files.
- [x] Review the PR diff against `docs/extension-conventions.md`: confirm the same deterministic
      validator owns policy and diagnostics, every segment still fails closed, raw `safeSubcommands`
      permissions were not introduced, no asynchronous/lifecycle surface changed, and no source file
      exceeds 1,000 lines. Evidence: the call-graph scan shows the hook and boolean wrapper share one
      helper, all explicit Git/helper guards remain present, settings/manifest/lock paths are unchanged,
      `tool-policy.ts` is 563 lines, `plan-mode.ts` is 1,000 lines, and the diff passes whitespace checks.
- [x] Run `npm run check`; if the repository-known linked-worktree-only `pi-sync` Git-alias test is the
      sole failure, apply the exact patch to a normal local clone and require the complete gate there.
      Evidence: the worktree run passed all relevant gates and reproduced only that known environment
      failure; the exact patch then passed the complete normal-clone gate with all 2,223 tests passing.
- [x] Create a focused Conventional Commit, push the new
      `fix/plan-mode-blocked-command-diagnostics` branch, open a stacked PR against
      `fix/plan-mode-git-inspection-policy`, and require all checks GitHub schedules for that base to
      pass. Evidence: commit `81c9082` is pushed, PR #537 is open with a CLEAN merge state, and its CI
      check passed; CodeQL was not scheduled for the non-main stacked base.

## Completion Checklist

- [x] A rejected single command is shown as `Blocked command: <command>`; covered by helper and hook
      presentation tests.
- [x] A parsed compound command reports only its first rejected segment; the exact hook assertion
      proves accepted neighboring segments are not mislabeled.
- [x] Empty, malformed, and unsupported-shell inputs remain blocked and use the documented complete
      input fallback without a suggested replacement; helper and heredoc hook cases pass.
- [x] All pre-existing command-policy decisions remain unchanged, including the standard Git
      inspection behavior added by PR #536 and explicit helper/output/mutation guards; focused and
      complete suites pass.
- [x] `plan-mode.ts` remains at exactly 1,000 lines; settings, metadata, dependencies, and lifecycle
      behavior are unchanged.
- [x] PR #537's scheduled CI check passes alongside the completed focused tests, package checks,
      semantic audit, and complete repository gate; CodeQL was not applicable to its stacked base.
