# Plan Mode Fresh Implementation Session Plan

## Goal

Let users choose at every completed or saved plan whether to implement in the current Pi session or
start a fresh linked session that transfers only the approved plan. Preserve the existing
`/plan implement` behavior, all three implementation-retention policies, cancellation safety, and
stored user data.

## Context

- Automatic completion currently opens a five-action ready menu from `agent_settled`; manual ready
  and saved-plan menus expose the same single current-session implementation path with nearby
  management actions.
- `ctx.newSession()` is available only on command contexts. A successful replacement tears down the
  old extension instance, starts the new instance, runs `setup`, and then invokes `withSession`; old
  session-bound Pi/context objects are stale after replacement.
- `@narumitw/pi-tui-kit` supports action descriptions in TUI, but RPC action dialogs expose labels
  and screen lines rather than row descriptions. Consequential labels and screen-level copy must
  therefore remain self-explanatory without color or TUI-only detail.
- A fresh session still loads its normal project resources, including `AGENTS.md`, skills, and other
  extension context. “Plan only” means no planning conversation messages, tool results, or
  compaction/branch summaries are transferred from the source session.

## Architecture

- Keep one flat action group. Automatic ready menus contain six actions; manual ready menus add Show
  for seven; saved-plan menus expose the same two implementation choices with their existing
  management actions.
- Preserve **Implement here** as the current-session path and as the behavior of `/plan implement`.
  Add **Start fresh and implement** only as an interactive TUI/RPC choice; do not add a setting or a
  new public subcommand.
- Cache the latest real `/plan` command context for the active session and use it when automatic
  readiness presents the menu, without synthesizing extension input or creating an LLM turn. Clear
  it on replacement/shutdown; if no command context exists (for example a workflow started only by
  `--plan`), fresh selection fails closed and asks the user to reopen `/plan`.
- Implement fresh handoff through `ctx.newSession({ parentSession, setup, withSession })`. Capture
  only plain serialized plan data, source, implementation id, timestamp, and effective retention
  policy before replacement. Never capture or use old session-bound Pi/context objects afterward.
- In destination `setup`, append the existing Plan Mode state shape with one active implementation.
  Because Pi runs destination `session_start` before `setup`, let a newly created extension instance
  refresh once from its branch immediately before the first agent start. This makes the setup state
  visible before the kickoff reaches `context` while leaving ordinary startup/resume restoration
  unchanged.
- Keep the source planning session untouched. It remains resumable with its ready or saved plan; the
  destination session records the source session file as its parent when one exists. The destination
  applies `keep`, `clear-on-start`, or `clear-after-first-run` through the existing coordinator.
- Treat session replacement as the commit boundary. Before replacement, validation or cancellation
  leaves the source session unchanged. After replacement, preserve a durable active plan in the
  destination before sending the kickoff; if kickoff fails, report the recoverable partial state
  rather than attempting to use stale source objects or silently switching back.

## Non-Goals

- Do not add an implementation-session setting, preset, project scope, environment variable, or
  settings-file migration.
- Do not copy planning conversation history, summaries, per-session Plan-tool overrides, or Plan-mode
  thinking state into the fresh implementation session.
- Do not change `/plan implement` into a selector or add fresh implementation to print/JSON modes.
- Do not delete or mutate the source planning session after a successful fresh handoff.
- Do not change package versions, dependency ranges, npm visibility, tags, or release workflows.

## Risks

- `ExtensionAPI.sendUserMessage()` deliberately skips command handling, so synthesizing `/plan`
  would create an LLM turn. Automatic presentation must instead reuse a real same-session command
  context when available and fail closed for fresh replacement when none exists.
- Destination `setup` occurs after the new instance's `session_start`; without the one-time pre-turn
  refresh, retention state would be persisted but absent from in-memory behavior on the first request.
- Session replacement cannot be rolled back atomically after old-runtime teardown. Persisting the
  destination active plan before kickoff and keeping the source session untouched provide bounded
  recovery for setup or send failures.
- Other extensions may cancel `session_before_switch`; this is an expected cancellation, not an
  implementation error, and must leave the source plan ready/saved.
- A user can later resume the source session and hand off the same plan again. This duplication is an
  intentional recovery property and must be documented rather than hidden.

## Rollback / Recovery

- Before replacement: retain the source ready/saved state and show an actionable model, auth,
  cancellation, or session-creation error.
- After replacement but before successful kickoff: keep the destination active plan recoverable on
  resume and tell the user to send a message to continue, clear it with `/plan exit`, or resume the
  parent planning session.
- If the feature must be reverted, remove the fresh action and cached command-context presentation;
  existing source sessions, destination active-plan entries, settings, and `/plan implement` remain
  readable because the plan state shape and retention values are unchanged.

## Plan

- [x] Extend the Plan Mode test harness with test-owned session-replacement doubles that model
      `session_before_switch`, destination `session_start` before `setup`, fresh replacement context,
      parent linkage, cancellation, and staged failures; verify the helper through the first focused
      fresh-session test rather than testing the mock as production behavior.
- [x] Add failing menu tests for automatic ready, manual ready, and saved-plan states in TUI and RPC,
      requiring **Implement here**, **Start fresh and implement**, self-contained screen copy,
      retention preview, flat action counts of at most seven, destructive exit wording, Escape/Ctrl+C
      cancellation, focus restoration, terminal-control sanitization, and bounded 24/40/80-column
      rendering; record the expected red failures against the current single Implement action.
- [x] Update `src/plan-action-menus.ts` and `src/saved-plan-menu.ts` to expose the two goal-oriented
      implementation actions with TUI descriptions and RPC-safe labels/lines, while retaining Show,
      Export, Save, Stay, Settings, Clear, and Exit capabilities; verify the focused menu tests turn
      green without adding an implementation submenu.
- [x] Add failing command/lifecycle tests proving automatic completion opens exactly one
      current-generation ready menu without an LLM turn and ignores cancellation, user/session
      replacement, duplicate settlement, queued follow-up, and superseded-plan races.
- [x] Refactor ready presentation in `src/plan-mode.ts` to retain the latest real same-session `/plan`
      command context for automatic menu actions, clear it at lifecycle boundaries, and never route
      synthetic `/plan` text through `ExtensionAPI.sendUserMessage()`; preserve direct `/plan` and
      `/plan implement` behavior and verify focused launch, plan-mode, saved-plan, and menu tests.
- [x] Add failing fresh-handoff tests for ready and saved plans that require preflight before source
      mutation, `waitForIdle` plus post-await generation validation, parent linkage, a destination
      branch containing no source conversation entries, an exact-plan kickoff, normal full tools,
      captured retention, and an unchanged resumable source plan; record red evidence against the
      absence of fresh replacement behavior.
- [x] Extract a responsibility-focused fresh implementation controller and destination bootstrap
      helper, integrate them with `ctx.newSession()` and one-time pre-first-agent branch refresh, and
      keep source state, replacement state, status publication, and kickoff ownership explicit;
      verify the fresh-handoff tests for persisted and in-memory sessions.
- [x] Add failing lifecycle/recovery tests for model/auth failure, menu disposal while waiting,
      `session_before_switch` cancellation, replacement during prerequisite awaits, setup failure,
      kickoff failure, shutdown, destination resume before kickoff, stale old-context rejection, and
      concurrent/superseding implementation ids; implement bounded recovery until every scenario
      preserves either the source ready/saved plan or a destination active plan with actionable
      feedback.
- [x] Extend retention tests so `keep`, `clear-on-start`, and `clear-after-first-run` operate unchanged
      in the fresh destination across first context, tool/model continuations, `agent_settled`, resume,
      compaction reinjection, and older-settlement races; verify no source planning artifact enters the
      destination model context.
- [x] Preserve compatibility tests showing `/plan implement` still implements here, existing stored
      ready/saved/active states restore unchanged, Settings and unknown fields are untouched,
      print/JSON reject implementation before state changes, and TUI/RPC current-session flows retain
      their previous rollback semantics.
- [x] Update `packages/pi-plan-mode/README.md` with the two per-plan choices, exact meaning of
      “fresh,” source-session preservation, parent linkage, interaction with all retention policies,
      cancellation/partial-failure recovery, `/plan implement` compatibility, and supported modes;
      verify labels and commands against the tests and final implementation.
- [x] Audit the final diff against `docs/extension-conventions.md`, Pi extension/TUI/RPC replacement
      contracts, async cancellation/disposal/session-replacement/shutdown rules, command-mode
      observability, source files over 1,000 lines, and package boundaries; document any accepted
      deviation or unverified path in this plan before completion.

## Completion Checklist

- [x] Preserve red-to-green evidence for each observable behavior slice by compiling the test tree and
      running the focused `pi-plan-mode` menu, plan-mode, saved-plan, retention, and fresh-session test
      files from the compiled output.
- [x] Run `npm test` and confirm every active workspace test passes.
- [x] Run `npm run check` and confirm Biome, boundary validation, workspace typechecks, and tests pass.
- [x] Run `just pack plan-mode` and inspect the dry-run tarball for the updated README and every new or
      changed runtime source file, with no unintended package metadata changes.
- [x] Run an isolated non-interactive RPC smoke with temporary agent/session directories that completes
      a plan, selects both implementation routes, proves the fresh destination omits planning messages,
      verifies parent linkage and retention cleanup, and exercises cancellation; if the runtime cannot
      expose one assertion, leave this item open and record the exact unverified path.
- [x] Confirm `git diff --check`, a clean intended diff, no package version/dependency/release changes,
      and all plan tasks/checks have evidence; then move this file to
      `docs/plans/archived/2026-08-04_plan-mode-fresh-implementation-session-plan.md` without
      overwriting an existing archive.

## Evidence

- Red-to-green: focused tests initially failed on the missing two-choice labels/actions and absent
  session replacement; lifecycle review additionally exposed the destination `session_start` before
  `setup` ordering and the need to propagate the TUI busy-action signal. The compiled focused Plan
  Mode suite passed after implementation, including 11 fresh-session tests and 170 package tests.
- Menu and compatibility: TUI/RPC tests cover automatic, manual, and saved menus, width/control
  safety, cancellation, direct `/plan implement`, saved plans, and unchanged ready/export behavior.
- Replacement and recovery: tests cover ready/saved source retention, idle/auth/current-generation
  preflight, persisted and in-memory parent behavior, all three retention values, destination refresh,
  switch cancellation, setup/kickoff partial failures, bounded sanitized feedback, and source
  shutdown. Pi TUI Kit's repository tests cover busy-view user/owner/external disposal and draining.
- Runtime contract: installed Pi source confirmed `newSession` ordering as
  `session_start -> setup -> withSession` and confirmed `ExtensionAPI.sendUserMessage()` bypasses
  command handling. Automatic menus therefore reuse a real same-session `/plan` command context;
  the documented `--plan`-only case fails closed and asks the user to reopen `/plan`.
- Verification: final `npm test` passed 2,320 tests; final `npm run check` passed Biome, package
  boundaries, all workspace typechecks, and 2,320 tests. `git diff --check` passed.
- Packaging: `just pack plan-mode` produced a 29-file dry run containing the updated README and all
  runtime sources, including `fresh-implementation.ts` and `plan-action-controller.ts`; package
  version remained `0.47.1`, with no manifest, dependency, lockfile, or release changes.
- Runtime smoke: an isolated real `pi --mode rpc` subprocess with temporary agent/session directories
  and a deterministic local provider completed plans through both **Implement here** and **Start
  fresh and implement**. JSONL assertions proved fresh parent linkage, omission of the source planning
  marker, exact-plan transfer, source readiness, `clear-after-first-run` cleanup, and
  `session_before_switch` cancellation.
- Semantic audit: read `docs/extension-conventions.md`, `docs/extension-settings.md`, Pi `rpc.md`,
  `custom-provider.md`, and related provider examples. Audited command modes, source/menu/task
  cancellation, disposal, session replacement, shutdown, state ordering, observability, package
  boundaries, settings non-mutation, and file sizes. `src/plan-mode.ts` is 985 lines; no accepted
  convention deviation or unverified required path remains.
