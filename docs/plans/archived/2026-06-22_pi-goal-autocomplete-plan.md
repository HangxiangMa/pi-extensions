## Goal

Fix issue #109 by adding tab autocomplete suggestions for `/goal` arguments, so users can discover static management subcommands (`pause`, `resume`, `clear`, `edit`, `status`) and the `--tokens` option from the Pi editor. Success means the `pi-goal` command registers argument completions, tests cover the suggestion behavior, and the workspace check passes.

## Context

`pi-goal` currently registers `/goal` with a description and handler only. Pi command registration supports `getArgumentCompletions(argumentPrefix)`, returning `AutocompleteItem[] | null`, which is enough for this issue without adding dependencies or a custom editor autocomplete provider.

## Non-Goals

- Do not autocomplete free-form goal objective text.
- Do not add dynamic state-aware filtering such as hiding `resume` unless a goal is paused.
- Do not add a new autocomplete provider; the command-level API is sufficient.

## Assumptions

- The issue is about `/goal` subcommand and option discovery, not shell-level completion outside Pi's TUI editor.
- Static completions are acceptable for the first fix because every suggested item is already accepted by `parseCommand` or `parseObjective`.

## Plan

- [x] Add a small exported completion helper in `extensions/pi-goal/src/goal.ts` that returns matching `AutocompleteItem` objects for `/goal` argument prefixes; verified by `completeGoalArguments` unit tests for empty, partial, already-complete, edit-option, and objective-like prefixes.
- [x] Wire the helper into `pi.registerCommand("goal", { getArgumentCompletions })` so Pi's built-in command autocomplete can show `/goal` suggestions; verified by `goal registers command...` asserting the registered command has a completion function.
- [x] Cover expected suggestions in `extensions/pi-goal/test/goal.test.ts`: empty args include `pause`, `resume`, `clear`, `edit`, `status`, and `--tokens`; partial args such as `pa` return `pause`; non-matching or objective-like prefixes return `null`; verified by focused goal tests.
- [x] Run the smallest relevant verification command for the package after code changes; verified with `node_modules/.bin/tsc -p tsconfig.test.json && node ./node_modules/.cache/pi-extensions-test/extensions/pi-goal/test/goal.test.js`.
- [x] Run the repository gate if the focused test passes; verified with `npm run check`.

## Risks

- [x] Mitigated: `getArgumentCompletions` receives the full argument prefix, not just the current token; tests cover prefixes that include spaces such as `edit `.
- [x] Mitigated: Returning noisy suggestions after users start typing an objective could be annoying; `completeGoalArguments` returns `null` for objective-like prefixes such as `ship objective` and `edit objective`.

## Completion Checklist

- [x] `/goal` registers `getArgumentCompletions`, verified by `extensions/pi-goal/test/goal.test.ts`.
- [x] Static suggestions cover accepted subcommands and `--tokens`, verified by focused goal tests.
- [x] No new dependency or custom autocomplete provider is added, verified by the diff.
- [x] The fix passes `npm run check` from the repository root.
