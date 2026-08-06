# pi-goal automatic-work limit UX plan

## Goal

Restore `pi-goal`'s default `automaticTurns` limit to 25 and make that safety boundary visible
before, during, and after automatic work. When the limit pauses a goal, explain why, preserve all
work, and give users an explicit, cancellable path to review and continue.

## Context

The prior built-in default was `automaticTurns: null` (`Unlimited`), and the manager/status line did
not consistently expose why a goal paused. Interactive TUI users need a safe default and clear
recovery; long-running and expert users still need custom or Unlimited operation; CLI/RPC and
existing configuration users need stable commands, schemas, and stored values.

Feature priority for this change:

- **Primary:** start, monitor automatic-work progress, understand a safety pause, and continue.
- **Secondary:** inspect details and change the automatic-work limit.
- **Advanced:** custom limits and explicit Unlimited operation.
- **Destructive:** existing replace, clear, skip, and drop actions; behavior is unchanged.
- **Compatibility-only:** direct command aliases, RPC transitions, persisted schema, and managed-run
  status enums; behavior and wire shapes remain compatible.

## Architecture

- `settings.ts` owns the built-in default and strict normalization. Omitted `automaticTurns` uses 25;
  explicit finite values and `null` remain authoritative; malformed values keep the file invalid.
- `runtime.ts` and existing accounting/safety state remain the source of truth for response count and
  pause cause. Enforcement occurs before another normal response can start.
- `menu.ts` presents count/limit and a safety-recovery screen. Back is side-effect free; Continue
  uses the existing generation-guarded resume/reset protocol.
- `settings-ui.ts` keeps all five settings in one flat group. It offers default 25, a custom finite
  limit, and explicitly confirmed Unlimited operation.
- Direct `/goal resume`, queue, token-budget, and RPC workflows retain their existing contracts while
  notifications, summaries, and status text expose the automatic-work state.

## Non-Goals

- Add a dollar-cost cap or claim that 25 responses corresponds to a fixed provider charge.
- Change token-budget accounting, no-progress policy, queue semantics, tool policy, or managed-RPC
  status values.
- Add basic/advanced navigation or migrate an explicitly stored `null` to 25.
- Publish, change npm visibility, tag a release, or dispatch a release workflow.

## Assumptions and accepted clarifications

- Explicit persisted `null` remains Unlimited because historical generated and intentional values
  cannot be distinguished safely.
- Malformed explicit limits remain invalid instead of silently normalizing to 25, preserving the
  repository's invalid-file protection.
- The TUI renders from a synchronized runtime snapshot, so there is no separate asynchronous loading
  screen. Loading-state acceptance is satisfied by immediate snapshot rendering and stale/disposed
  continuation guards.
- Continue is the applying action after a concrete recovery preview and does not add a redundant
  generic yes/no prompt.

## Rollback / Recovery

The persisted schema remains `number | null`; rollback requires no data conversion. Save or runtime
apply failure retains the previous valid file and in-memory settings, keeps the goal recoverable, and
reports an actionable error.

## Plan

- [x] Add red tests for the omitted default and explicit finite/`null` compatibility, then update
  `packages/pi-goal/src/settings.ts` to restore 25. Evidence: focused tests initially failed with
  `null !== 25` and now pass 5/5; malformed values remain invalid and unknown-field save coverage
  passes.
- [x] Add interaction tests and update `packages/pi-goal/src/settings-ui.ts` for the flat
  **Automatic-work limit** control, default/custom/Unlimited choices, explicit Unlimited warning,
  lower-live-limit preview, atomic rollback, direct recovery entry, cancellation, goal replacement,
  and menu disposal. Evidence: settings UI tests pass 30/30.
- [x] Add manager tests and update `packages/pi-goal/src/menu.ts` for empty, active, Unlimited,
  hard-cap-paused, queue/partial, budget, and ordinary stopped states. Evidence: hard-cap recovery
  previews preserved objective/usage/time/queue, Back has no side effects, Continue is bound to the
  previewed goal, and Change limit returns to the still-paused recovery state; menu tests pass 20/20.
- [x] Update `packages/pi-goal/src/commands.ts`, `goal.ts`, and `runtime.ts` so start, resume,
  restored-session, summary, pause notification, and statusline surfaces use consistent automatic
  work terminology and finite/Unlimited state. Evidence: direct resume reports the pending reset to
  0/25 and preserved usage; default and Unlimited starts are covered; restored 25/25 work pauses
  before provider delivery.
- [x] Preserve enforcement across tool loops, retry boundaries, compaction, aborted turns, and
  session restoration. Evidence: the existing lifecycle matrix plus updated hard-cap tests and
  `goal-runtime-smoke.mjs` pass; all 286 pi-goal tests pass.
- [x] Verify responsive and accessibility behavior at 40, 80, and 120 columns. Evidence: public TUI
  harness tests prove every rendered line stays within width, critical cause/effect/action text stays
  visible, keyboard Enter/Escape navigation returns focus to the prior route, and states/actions are
  text-labeled rather than color-only.
- [x] Update `packages/pi-goal/README.md` with default 25, explicit-null compatibility, manager and
  recovery behavior, statusline examples, restoration behavior, and the distinction between a
  response cap, token budget, estimated Pi cost, and a provider billing cap.
- [x] Audit the diff against `docs/extension-conventions.md` and `docs/extension-settings.md` for
  command/menu/status/settings/lifecycle rules, unknown-field preservation, atomic publication,
  stale-session guards, cancellation, disposal, session replacement, and shutdown. Evidence: scoped
  tests cover rollback and stale/disposed continuations; no convention deviation remains.
- [x] Run package verification. Evidence: `npm run check --workspace @narumitw/pi-goal`,
  `npm run test:runtime --workspace @narumitw/pi-goal`, and `just pack goal` pass; the dry-run tarball
  contains README, LICENSE, package manifest, all `src` files, and `src/index.ts`, with no test or
  temporary files.
- [x] Run repository verification. Evidence: all 286 pi-goal tests pass in the active worktree; full
  `npm run check` passes in `/tmp/pi-goal-automatic-work-limit-check`, a normal local clone with the
  exact extension patch. The linked worktree itself exposes Git's internal `GIT_DIR` to one unrelated
  pi-sync alias test, so the normal-clone run provides the CI-equivalent repository evidence.
- [x] Commit the bounded change, push `feat/pi-goal-automatic-work-limit-ux`, and open GitHub pull
  request [#552](https://github.com/narumiruna/pi-extensions/pull/552). Evidence: PR is OPEN,
  non-draft, MERGEABLE, and targets `main` from the requested branch; CI is queued.

## Completion Checklist

- [x] Fresh and omitted configuration uses 25; explicit numbers and `null` retain meaning; unknown
  configuration fields survive writes; malformed files remain protected and read-only.
- [x] Empty, active, stopped, and detailed status surfaces expose the finite boundary/progress or
  explicit Unlimited state wherever it affects a decision.
- [x] At 25/25 no further normal model response starts, including after tools, retry/compaction
  recovery, and restoration.
- [x] A hard-cap pause names the cause, confirms progress/usage/time/queue preservation, and previews
  that Continue grants one more configured epoch.
- [x] Back/Escape, cancelled confirmations, failed saves, replaced goals, and disposed sessions have
  no unintended settings or goal mutations.
- [x] Guided Continue and direct `/goal resume` preserve compatibility, reset only the safety epoch
  at prompt start, and provide concrete feedback.
- [x] Custom finite and confirmed Unlimited choices remain in one flat five-control settings group;
  lowering a reached active limit previews and, only after confirmation, applies the immediate pause.
- [x] Primary flows are keyboard-operable and readable at 40, 80, and 120 columns without hidden
  critical text, ambiguous truncation, color-only meaning, or overflow.
- [x] README behavior and cost terminology match the implementation.
- [x] Focused/package/runtime/pack checks and the normal-clone full repository gate pass.
- [x] Pull request #552 is open from `feat/pi-goal-automatic-work-limit-ux` to `main`, includes the
  verification evidence, and will contain this archived completed plan after the final push.
