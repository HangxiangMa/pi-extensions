# pi-plan-mode plan export

## Goal

Add a safe `/plan export [path]` route and interactive export flow that write the currently ready,
saved, or active implementation plan to a user-selected Markdown path without overwriting an
existing target. A successful ready-plan export completes and exits Plan mode; saved and active
implementation exports retain their state.

## Context

- Default export path: `PLAN.md` relative to `ctx.cwd`; a supplied relative or absolute path is the
  command's text payload.
- Ready, saved, and active-plan menus navigate from **Export plan…** to Pi TUI Kit's standard
  single-line input screen. An empty submission uses `PLAN.md`; a non-empty submission is the path.
- A rejected export keeps the input draft available for correction. Escape returns to the owning
  menu without writing, while session replacement or shutdown aborts the owned interaction.
- Existing targets must fail closed in every mode. Successful file creation is the observable result
  in print/JSON; TUI/RPC additionally receive notifications. After a ready plan is written, Plan mode
  restores its tools and thinking level and clears the ready state without triggering a model turn.
  Saved and active implementation exports remain copy-only.
- Touched convention areas: public slash-command routes, async menu actions, file mutation, non-TUI
  behavior, dependency metadata, tests, and package documentation. Pi TUI Kit input screens require
  `@narumitw/pi-tui-kit` 0.41.0 or newer, so the package compatibility floor moves to `^0.41.0`.
  Applicable MUST checks are command-route tests, lifecycle review, `withFileMutationQueue()` use,
  `npm run check`, and a package dry run.

## Plan

- [x] Establish red-first command/file behavior tests for default and custom paths, no-overwrite,
      state retention, supported plan states/modes, and autocomplete; evidence: the new focused test
      file initially failed all 7 cases because `export` was not implemented.
- [x] Add `src/plan-export.ts` and `/plan export [path]` with queued exclusive creation and unchanged
      Plan state; evidence: 7 focused export tests and all 105 pi-plan-mode tests passed before the
      filename-input follow-up.
- [x] Add focused TUI/RPC tests for **Export plan…**, custom and empty path submission, rejected-draft
      retention, Back cancellation, and ready/saved/active menu availability; evidence: the initial
      input-flow run failed because menus still exported directly to `PLAN.md`.
- [x] Replace fixed default-export menu actions in the ready, saved, and active menu modules with
      Pi TUI Kit input screens; submit through the existing writer, close on success, and retain the
      draft on rejection; evidence: 15 focused export tests and all 113 pi-plan-mode tests passed.
- [x] Correct the ready-plan success transition so export exits Plan mode only after the file is
      written, restores tools and thinking, clears persisted ready state, and starts no model turn;
      evidence: the regression test failed first on the stale `plan ready` status, then passed with
      direct, TUI, RPC, saved-plan, active-plan, failure, and cancellation coverage.
- [x] Raise the package's Pi TUI Kit floor from `^0.40.0` to `^0.41.0`, the first release with input
      screens, and regenerate the lockfile with npm 12.0.2; evidence: the nested workspace dependency
      resolves to 0.41.0 and package typechecking accepts the input-screen contract.
- [x] Finalize `packages/pi-plan-mode/README.md` with command syntax, input-menu behavior, path
      resolution, no-overwrite semantics, and non-TUI behavior; evidence: package Biome and typecheck
      passed through `npm run check --workspace @narumitw/pi-plan-mode`.
- [x] Audit cancellation, menu disposal, session replacement, shutdown, command-mode behavior, and
      file-write serialization against `docs/extension-conventions.md`; evidence: queued actions are
      cancelled and drained in focused tests, `npm run check` passed 2,222 tests, and
      `just pack plan-mode` included the declared entrypoint, `src/plan-export.ts`, README, and license
      in a 22-file dry-run tarball.

## Completion Checklist

- [x] `/plan export` writes the selected plan to `PLAN.md`, and `/plan export <path>` writes to the
      requested path without triggering a model turn; a ready export exits Plan mode, while saved and
      active implementation exports retain their state.
- [x] Ready, saved, and active-plan menus expose **Export plan…**, including the automatic completion
      menu; the input accepts a custom path and treats an empty submission as `PLAN.md`.
- [x] Existing-target rejection retains the interactive path draft; Back, disposal, replacement, and
      shutdown do not write or change Plan state.
- [x] Existing files, directories, and symlinks are never overwritten; failures leave plan state and
      existing content unchanged.
- [x] TUI, RPC, print, and JSON behavior is tested and documented.
- [x] Repository checks and the pi-plan-mode package dry run pass with no accepted deviations.
