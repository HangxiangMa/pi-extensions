# pi-btw Thinking Settings Plan

## Goal

Give `/btw` a menu-first no-argument flow and extension-owned thinking settings while preserving
`/btw <question>` as the fast path. Inside a side thread, Pi's configured
`app.thinking.cycle` shortcut must always change that thread's level immediately; by default it
must also remember the latest level in `pi-btw.json`, without changing the main session.

## Context

- The approved `/btw` menu has two rows: **Start side thread** (initially selected) and
  **Settings**. `/btw <question>` continues to start immediately.
- Settings own a pi-btw thinking level and **Remember thinking level changes**, which defaults to
  on. There is no user-facing "inherit main session" setting.
- For backward compatibility, an existing file with no `thinkingLevel` remains valid and uses the
  current session level until the user explicitly selects or remembers a pi-btw level.
- A side-thread shortcut change applies to every later question in that thread until changed again.
  Remembering off leaves `pi-btw.json` unchanged; remembering on writes the concrete level for the
  next invocation.
- A shortcut save failure keeps the new thread-local level and reports that it was not remembered.
  A Settings-screen save failure rolls back the setting row because persistence is that action's
  primary purpose.
- The current worktree already contains partial, uncommitted local-cycling UI, tests, and README
  edits. Execution must reconcile that work with this approved design rather than assume it is the
  finished implementation.
- Applicable guidance: `docs/extension-conventions.md`, `docs/extension-settings.md`, Pi extension,
  TUI, and keybinding documentation. Touched areas are command routing, standard menus, settings
  storage/UI, custom TUI keyboard input, asynchronous persistence, documentation, and tests.

## Architecture

- Move settings ownership out of the growing `src/btw.ts` into `src/settings.ts`: schema/defaults,
  canonical path, side-effect-free reads, validation, queued read-modify-write updates, unknown-field
  preservation, and same-directory temporary-file-plus-rename publication.
- Put the two-screen command menu and Pi-style settings screen in a descriptive UI module such as
  `src/menu.ts`, declared with `@narumitw/pi-tui-kit`. Keep command routing and side-thread
  orchestration in `src/btw.ts` and specialized transcript input in `src/transcript-pager.ts`.
- Use the JSON field `rememberThinkingLevelChanges` for the persisted boolean and the user-facing
  label **Remember thinking level changes**. Its code default is `true`; a missing file/read never
  materializes that default on disk.
- Treat all settings reads and writes as one in-process ordering protocol. Enqueue the complete
  mutation before asynchronous prerequisites, re-read the latest valid document inside the queue,
  preserve unknown fields, block malformed documents, and keep the queue usable after failure.
- Keep side-thread thinking state separate from Pi's main-session state. Clamp the initial value and
  cycle candidates with the selected side model's supported levels; never call
  `pi.setThinkingLevel()` from the side-thread flow.
- Apply shortcut changes locally before optional persistence. Serialize rapid remembered changes and
  drain owned writes before the command finishes. On write failure retain the local level, leave the
  prior file intact, and issue one actionable warning through a still-current context.
- Standard Settings actions save before publishing the new effective setting. Rejection leaves the
  previous displayed/effective value selected, while cancellation and disposal make no mutation.

## Non-Goals

- Add a project-scoped settings file, environment variable, or cross-process writer lock.
- Add a model selector or expose the existing `model` field in the new Settings screen.
- Change the main session's model or thinking level.
- Reset thinking after one side question or persist side-thread transcript content.
- Add a textual settings subcommand or remove the established `/btw <question>` route.

## Risks

- Rapid shortcut input could let an older write overwrite a newer level; one ordered mutation queue
  and focused failure/recovery tests must prevent this.
- A malformed or concurrently edited file could be overwritten; every mutation must start from the
  latest valid document and publish atomically while preserving unknown fields.
- Menu or save continuations could outlive their custom component/session; owner/disposal checks and
  post-`await` revalidation must prevent stale UI or state use.
- Adding menu and settings behavior directly to `src/btw.ts` would push it toward the 1,000-line
  review threshold; responsibility-based extraction is part of the implementation, not follow-up.

## Rollback / Recovery

- The new boolean is optional and older pi-btw releases ignore unknown fields, so no destructive
  migration is required. Existing `model`, `thinkingLevel`, and unknown fields remain intact.
- Atomic publication keeps the previous valid file when saving fails. A malformed file remains
  byte-for-byte unchanged and the UI tells the user to repair it manually.
- Reverting the feature restores the prior no-argument command flow; files containing
  `rememberThinkingLevelChanges` remain readable by the prior implementation because it ignores
  unknown fields.

## Plan

- [x] Add failing settings tests in `extensions/pi-btw/test/settings.test.ts` for the default-on
  `rememberThinkingLevelChanges` field, side-effect-free missing-file reads, valid/invalid documents,
  and backward-compatible omitted `thinkingLevel`; the compiled test failed because
  `../src/settings.js` did not exist.
- [x] Implement `extensions/pi-btw/src/settings.ts` as the single settings owner, including canonical
  `getAgentDir()` path resolution, runtime validation, a recoverable in-process mutation queue,
  latest-document read-modify-write updates, unknown-field preservation, and atomic rename; all 7
  focused settings tests pass, including malformed-file and publication-failure cases.
- [x] Add failing command/menu tests in `extensions/pi-btw/test/btw.test.ts` and
  `extensions/pi-btw/test/menu.test.ts` proving `/btw` opens a two-row menu with **Start side
  thread** initially selected, Settings reachable, cancellation read-only, `/btw <question>` still
  direct, and unsupported non-TUI modes rejected before custom UI; the menu module import and
  dependency-aware command signature supplied the intended red states.
- [x] Implement the menu-first route in a new `extensions/pi-btw/src/menu.ts` using
  `@narumitw/pi-tui-kit`, preserving the main-editor draft and deferring model credential resolution
  until **Start side thread** is chosen; focused command/menu tests pass.
- [x] Add Settings-screen tests for a Pi-style thinking-level row and **Remember thinking level
  changes** row, immediate ordered saves, default-on display, rollback after save rejection,
  malformed-file protection, bounded rendering, cancellation, disposal, and unknown-field
  preservation; all focused menu tests pass.
- [x] Implement the Settings screen in `extensions/pi-btw/src/menu.ts` against the settings owner,
  presenting fixed pi-btw levels supported by the effective side model and applying each accepted
  change immediately; tests prove the existing manual `model` and unknown fields remain untouched.
- [x] Extend the side-thread behavior tests in `extensions/pi-btw/test/side-thread.test.ts` to prove
  the injected `app.thinking.cycle` binding (default or customized) changes all later questions,
  remembering off never writes, remembering on writes the concrete level in input order, no main
  thinking API is called, and a save failure keeps the local level while warning once; new controller
  fields supplied the intended red state and focused tests pass.
- [x] Integrate an owned thinking controller across `src/btw.ts` and `src/transcript-pager.ts` that
  clamps to side-model capabilities, updates the header/footer immediately, queues optional saves,
  drains writes on close/disposal, and catches stale-context notification failures; focused tests
  cover rapid changes, real settings persistence, remembering off, and failed-save recovery.
- [x] Update `extensions/pi-btw/README.md` to document the menu, Settings rows, JSON field/default,
  direct-question compatibility, shortcut customization, thread-local lifetime, writeback success
  and failure behavior, canonical path, atomic in-process persistence scope, and the fact that the
  main session is never changed; examples and accepted values match production code.
- [x] Audit the final pi-btw diff against the touched-area checklists in
  `docs/extension-conventions.md` and `docs/extension-settings.md`: focused tests cover TUI width and
  invalidation, cancellation, idle/action disposal, side-component disposal, ordered saves,
  malformed-file protection, and atomic failure. All production files remain below 1,000 lines.
  Accepted product distinction: shortcut persistence is secondary and retains the approved local
  change on save failure, while Settings actions reject and roll back.
- [x] Run focused compiled pi-btw tests, `npm run typecheck --workspace @narumitw/pi-btw`, and LSP
  diagnostics on changed TypeScript files; 110 focused tests and workspace typecheck pass, with zero
  Biome LSP diagnostics across all pi-btw source and test files.
- [x] Run the CI-equivalent `npm run check` on the exact final patch in a temporary normal clone with
  repository-pinned npm 12.0.2 after rebasing onto current `origin/main`, avoiding the documented
  linked-worktree `GIT_DIR` false failure; all 1,985 tests and every format, boundary, and workspace
  typecheck gate pass.
- [x] Run `npm pack --workspace @narumitw/pi-btw --dry-run --json` and a non-interactive local Pi
  entrypoint load smoke; the 10-entry package contains only the manifest, README, license, and seven
  declared source files, and `pi --no-extensions -e ./extensions/pi-btw --list-models ...` exits 0
  without factory-time thinking/settings access.

## Completion Checklist

- [x] `/btw` opens the approved menu with **Start side thread** selected, while `/btw <question>`
  remains a one-step compatibility route.
- [x] Settings persist a pi-btw-specific level and default-on remembering without deleting or
  replacing unrelated `pi-btw.json` content.
- [x] The configured Pi thinking shortcut always changes the current side thread immediately and
  never changes the main session.
- [x] Remembering off is thread-local; remembering on survives the next invocation; shortcut save
  failure keeps the local level and Settings save failure rolls back.
- [x] Missing, malformed, invalid, concurrent, rapid-save, cancellation, disposal, replacement, and
  atomic-publication paths have deterministic evidence.
- [x] README behavior, settings schema/defaults, and package contents match the verified code.
- [x] Focused checks, LSP diagnostics, full `npm run check`, package dry run, and entrypoint smoke all
  pass with no unaccepted deviations.
- [x] Archive this completed plan under `docs/plans/archived/` only after every item above is checked
  with current evidence.
