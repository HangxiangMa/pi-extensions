# pi-goal core settings convention

## Goal

Align pi-goal startup with Pi core's settings behavior: a missing settings file uses built-in defaults without creating files, while the first explicit user save creates the extension file. Document the applicable Pi core semantics and the repository's stronger atomic-write requirement.

## Architecture

- `extensions/pi-goal/src/settings.ts` remains the package-owned parser and atomic writer.
- `extensions/pi-goal/src/goal.ts` performs a side-effect-free settings read on every `session_start`; only malformed or unreadable existing files become load issues.
- Pi core's public settings semantics are the behavioral reference. Extension-owned files remain separate from Pi's `settings.json` and continue using temporary-file-plus-rename publication required by this repository.

## Assumptions

- “Pi core convention” means missing files represent defaults and reads do not materialize configuration; it does not mean copying Pi core's private `proper-lockfile`/direct-write implementation.
- Automatic creation added in `2cc1bce` may be removed as an intentional behavior change; existing valid and invalid files remain untouched.

## Plan

- [x] Update pi-goal settings and lifecycle tests to require side-effect-free missing-file loads and explicit-save creation; focused red test failed because startup created the missing parent (`true !== false`), while explicit-save creation passed.
- [x] Remove pi-goal's startup creation and hard-link publication paths while preserving validation, unknown-field preservation, atomic saves, and invalid-file protection; 173 focused settings, lifecycle, and settings-UI tests passed.
- [x] Update `docs/extension-settings.md` with the relevant Pi core load, in-memory, persistence-order, durability, and error-reporting semantics plus the repository-specific atomic-write distinction; update `docs/extension-conventions.md` and `extensions/pi-goal/README.md` to match the new startup/save behavior.
- [x] Audit settings loading, invalid-file protection, unknown-field preservation, atomic saves, ordered UI persistence, and repeated `session_start` behavior against both guides; pi-goal typecheck and runtime smoke passed, and `npm run check` passed all 1,653 tests.
- [x] Record the reusable Termux hard-link compatibility gotcha in `MEMORY.md`, archive this completed plan under `docs/plans/archived/`, and verify only the intended settings, documentation, tests, memory, and plan paths changed.

## Completion Checklist

- [x] A missing `pi-goal.json` remains absent across startup, reload, and session replacement while defaults are effective and no warning is emitted.
- [x] The first successful Goal Settings save creates a valid complete file atomically; existing malformed settings remain protected.
- [x] Repository guidance names the applicable Pi core semantics without prescribing core-private storage mechanics to extensions.
- [x] pi-goal README, tests, and implementation agree on load, save, reload, and failure behavior.
- [x] Focused tests, pi-goal runtime/type checks, and `npm run check` pass.
