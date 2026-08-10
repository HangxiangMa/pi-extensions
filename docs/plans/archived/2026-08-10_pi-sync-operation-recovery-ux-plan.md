# pi-sync operation recovery UX plan

## Goal

Make the `/sync` manager explain operation-lock failures at first sight, place the safe recovery action
at the point of failure, and return users directly to the normal manager after recovery without
weakening pi-sync's cross-process lock, cancellation, data-preservation, or compatibility guarantees.

## Context

- The proposed scope is the manager's live, stale, unreadable, guard-only, and lock-inspection states
  rather than a broad redesign of setup, conflict, or backend workflows.
- `packages/pi-sync/src/manager-state.ts` currently collapses stale and unreadable metadata into
  **Recovery required: lock metadata is stale or unreadable** and removes **Settings** and **More…**.
- `packages/pi-sync/src/manager-ui.ts` hides **Recover stale operation** one level below
  **History & recovery…**, so the visible failure does not expose its resolution.
- Successful recovery currently leaves the user in the recovery submenu and requires Back before the
  ordinary manager actions reappear.
- `showSyncManager()` separately loads `describeManagerState()` and `inspectLock()`, so one rendered
  screen can combine observations from different lock generations.
- `inspectLock()` does not include the `proper-lockfile` guard; a guard-only writer can therefore look
  free in the manager even though the next operation is rejected.
- `packages/pi-sync/src/lock.ts` already rechecks metadata and guard ownership before removal, refuses
  live owners, and requires explicit `--stale` authorization for unreadable metadata.
- Existing lock tests cover low-level stale, unreadable, live, guard, and race behavior, but no focused
  manager test covers recovery prominence, confirmation, success navigation, cancellation, narrow
  rendering, RPC adaptation, or session replacement.
- The primary evidence-backed audience is an interactive terminal user synchronizing Pi content
  across devices; multi-setup users and deterministic command/RPC callers are secondary or
  compatibility audiences.
- No usage telemetry exists, so recovery is treated as uncommon but blocking and safety-critical
  rather than assigned an asserted real-world frequency.
- Applicable convention areas are slash-command menus, TUI/RPC adaptation, terminal safety,
  cancellation/disposal/session replacement, extension-owned settings preservation, deterministic
  tests, documentation, and Changesets.
- Research-time tests could not start because `node_modules/typescript/package.json` and
  `packages/pi-tui-kit/dist/index.js` are absent; dependency installation and a green baseline are an
  execution prerequisite.
- The active goal explicitly authorized branch creation, implementation, review, hardening, and pull
  request delivery after this plan was created.

## Architecture

### One operation-availability snapshot

Add a focused operation-availability projection, outside the already 959-line `manager-ui.ts`, that
reads lock metadata and the lock guard as one manager state input.

Represent the result as an explicit union:

- `free` — no metadata and no active guard;
- `live` — valid metadata whose owner still appears live;
- `busy` — an active guard with missing, unreadable, or stale metadata, meaning another writer may be
  starting, finishing, or waiting for guard expiry;
- `recoverable-stale` — valid stale metadata with no active guard;
- `recoverable-unreadable` — unreadable metadata with no active guard;
- `inspection-error` — filesystem or guard inspection failed and must not be mislabeled as a settings
  error.

`describeManagerState()` will consume that single structured snapshot, and `showSyncManager()` will
stop performing its independent `canRecover` inspection.

Every destructive decision will still recheck the real lock and guard in `lock.ts`; the projection is
presentation state, not mutation authority.

### Contextual manager states

Keep the normal, missing-settings, empty-catalog, no-included-content, and content-review manager
states unchanged.

For `recoverable-stale` and `recoverable-unreadable`, show a concise **Sync paused** cause and recovery
instruction, state when Settings and More return, and place **Restore sync access… (recommended)**
first.

Keep the first frame within the constrained terminal row budget and move the complete local-lock-only
effect and no-data-change explanation into the mandatory confirmation.

Keep **Status & changes**, **History & recovery…**, and **Help** as secondary actions so established
read-only and compatibility paths remain reachable.

For `live`, show the command, PID, and instruction to wait, and put **Refresh operation status** first
without exposing lock removal.

For `busy`, explain that another process may be starting or finishing and offer only refresh plus safe
secondary actions.

For `inspection-error`, name the operation-lock inspection problem and retry path without claiming
that `pi-sync.json` is invalid.

Do not restore **Settings** or **More…** while mutation remains blocked; instead explain that they
return after access is restored.

### Reviewed recovery

Use Pi TUI Kit's standard confirmation interaction before lock removal.

For a valid stale lock, invoke the conservative `unlock` route so the domain layer removes only a lock
that still proves stale.

For unreadable metadata, invoke `unlock --stale` only after copy explicitly tells the user to close
other Pi sessions because ownership cannot be verified.

Pass a combined session/action signal through confirmation, route execution, post-action inspection,
and every continuation.

Allow cancellation before the guarded removal boundary, but once the checked filesystem removal has
started, finish guard release and suppress stale-context UI rather than pretending the mutation was
rolled back.

After the route settles, inspect operation availability again instead of trusting the pre-confirmation
state.

If the state is `free`, notify that no settings, local files, sync state, or remote data changed and
transition directly to the refreshed main screen.

If the state is still blocked or changed to live/busy, remain in the contextual state and show the
specific refusal or retry guidance.

### Compatibility and storage boundary

Preserve every documented slash command, including `/sync unlock --stale`, and do not change argument
completion or direct-route semantics.

Preserve RPC as Pi TUI Kit's signal-aware selector/confirmation adaptation and keep print/JSON from
entering TUI-only components.

Do not change `pi-sync.json`, snapshots, sync state, backend wire formats, credentials, permissions,
settings precedence, filename migration, or unknown-field preservation.

Create a new patch Changeset for `@narumitw/pi-sync`; do not alter the existing
`.changeset/calm-sync-attention.md`, which owns a separate published behavior change.

## Non-Goals

- Do not redesign the normal manager, Settings, setup, storage-connection, conflict-resolution, or
  included-content flows.
- Do not automatically remove a stale or unreadable lock when the manager opens.
- Do not let a live or guard-owned operation expose a forced recovery action.
- Do not recover, roll back, or mutate local synchronized files as part of restoring manager access.
- Do not add a setting, preference, public command, flag, schema field, timer, or automatic polling
  loop.
- Do not contact remote storage merely to render or refresh operation availability.
- Do not remove **History & recovery…** or the existing doctor/history routes.

## Assumptions

- A single confirmation is proportionate because lock removal is locally small but can create unsafe
  concurrency if ownership is misclassified.
- Explicit refresh is preferable to an automatic timer because operation transitions are uncommon,
  local reads are cheap, and timers add lifecycle and layout instability.
- The established Pi TUI Kit action, confirmation, disabled-reason, Back, Close, and RPC contracts are
  sufficient; no new Kit API or compatibility-floor increase is expected.
- The existing lock guard's 30-second stale policy remains unchanged.

## Unknowns

- Resolved: `npm install` restored the locked dependency baseline without manifest or lockfile changes.
- Resolved: Pi TUI Kit harness tests exercise 32, 60, and 100 columns at 12, 16, and 24 rows.
- Resolved: current temporary-state helpers can create a real guard-only snapshot and a confirmed
  guard-acquisition race without a production-only test seam.

## Risks

- **Unsafe unlock:** An unreadable lock may belong to an initializing legacy writer; mitigate with
  guard-aware classification, explicit confirmation, and the existing guarded recheck.
- **Stale presentation:** Lock ownership can change while the confirmation is open; mitigate by
  rechecking through the production unlock path and inspecting again before navigation.
- **Lifecycle leak:** Recovery could continue after session replacement or component disposal;
  mitigate with combined signals, post-await ownership checks, and pending-work draining tests.
- **False settings diagnosis:** Lock filesystem failures currently fall into a broad manager error;
  mitigate by separating operation inspection errors from settings validation errors.
- **Navigation regression:** Dynamic recovery actions could break Back/Close or cursor restoration;
  mitigate with Pi TUI Kit harness and RPC scripts at the complete manager boundary.
- **Source-size regression:** `manager-ui.ts` is close to 1,000 lines; mitigate by putting lock-state
  projection and recovery copy/coordination in focused modules and auditing final authored sizes.
- **Changeset overlap:** Another pending patch already targets pi-sync; mitigate by creating a separate
  narrowly worded Changeset and leaving the existing file unchanged.

## Rollback / Recovery

The change requires no stored-data migration, so code rollback restores the former nested recovery
menu without rewriting settings, state, snapshots, locks, or remote data.

If the new contextual flow causes a runtime regression, revert its manager projection and UI wiring
while retaining the existing guarded `/sync unlock --stale` route.

Never roll back by automatically clearing an operation lock or choosing a sync direction.

## Plan

- [x] Run `npm install` from the repository root, verify `git diff -- package.json package-lock.json`
      has no unintended dependency change, rebuild `@narumitw/pi-tui-kit`, and run the current
      pi-sync manager/lock suites to establish a green baseline before behavior edits.
- [x] Add red-first tests in a focused `packages/pi-sync/test/manager-recovery.test.ts` for `free`,
      `live`, `busy`, `recoverable-stale`, `recoverable-unreadable`, and `inspection-error`
      projections; verify the new assertions fail because the manager currently collapses or misses
      those states.
- [x] Implement one guard-aware operation-availability projection under `packages/pi-sync/src/`, wire
      `manager-state.ts` to consume it, and remove the independent `canRecover` inspection from
      `manager-ui.ts`; verify the projection tests pass and lock rechecks remain in `lock.ts`.
- [x] Add red-first TUI manager tests requiring **Sync is paused**, concrete unavailable/recovery
      guidance, and first-row **Restore sync access… (recommended)** for both recoverable states;
      implement the contextual action projection without changing ordinary manager actions.
- [x] Add red-first tests for live and guard-owned operations requiring command/PID or starting/
      finishing copy, first-row **Refresh operation status**, and no recovery action; implement local
      refresh so a changed state returns to the matching contextual or ordinary manager screen.
- [x] Add red-first confirmation tests proving stale recovery uses conservative `unlock`, unreadable
      recovery uses explicit `unlock --stale`, confirmation copy names the local-lock-only effect,
      and Cancel/Escape preserve the lock and all settings bytes; implement the standard Pi TUI Kit
      confirmation flow.
- [x] Add red-first race and result tests proving recovery rechecks a lock that disappears, becomes
      live, changes identity, remains unreadable, or retains an active guard; implement post-action
      inspection, direct success transition to the normal main screen, and actionable stay/retry
      feedback without duplicate notifications.
- [x] Extend `lock.ts` and manager lifecycle tests only as needed to pass the session/action signal
      through pre-removal waits, guard acquisition, confirmation, route execution, and state refresh;
      verify user cancellation, external disposal, session replacement, reload, and shutdown leave no
      stale-context notification or unintended mutation.
- [x] Add Pi TUI Kit harness coverage at 32, 60, and 100 columns and constrained heights for stale,
      unreadable, live, busy, success, failure, and cancellation frames; verify every rendered line is
      bounded, critical meaning is textual, terminal controls are stripped, and navigation remains
      keyboard-complete.
- [x] Add strict RPC harness coverage for recovery confirmation, cancellation, refusal, success, and
      refreshed navigation; verify print/JSON remain non-interactive and direct
      `/sync unlock --stale` compatibility tests still pass.
- [x] Extend deterministic no-side-effect assertions to prove recovery changes only the eligible
      operation-lock path and does not alter `pi-sync.json`, synchronized local files, sync state,
      backups, credentials, unknown settings fields, or remote backend doubles.
- [x] Update `packages/pi-sync/README.md` to document the visible paused/live states, first-action
      recovery, confirmation safety rule, automatic return to normal actions, direct-command fallback,
      mode behavior, and terminal accessibility limits.
- [x] Add a new patch Changeset for `@narumitw/pi-sync`, run `just changeset-status`, and verify its
      release note describes only the operation-recovery UX and no schema or migration claim.
- [x] Audit the complete diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md`, including command compatibility, mode guards, settings ordering,
      invalid-file protection, unknown-field preservation, cancellation/disposal/replacement/
      shutdown, post-`await` freshness, terminal safety, accessibility, source ownership, and every
      touched-area MUST verification method.
- [x] Run focused Vitest suites, all pi-sync tests, `npm test`, `npm run check`, `git diff --check`,
      `just pack sync`, and a temporary-agent Pi RPC load smoke without credentials or remote access;
      inspect the tarball and leave every failed or unavailable check open with exact evidence.
- [x] Compare the final implementation against every completion item, inspect the selected diff for
      unrelated changes, record exact verification and unverified live-backend paths in this plan,
      and move the fully completed file to `docs/plans/archived/` only when every item is satisfied.

## Evidence

- Branch: `feat/pi-sync-operation-recovery-ux` created from `origin/main`.
- Dependency baseline: `npm install` added only ignored dependencies; `package.json` and
  `package-lock.json` remained unchanged.
- TDD baseline: the first four manager-recovery tests failed on the missing first-action recovery,
  unreadable-owner guidance, live refresh action, and guard-only state before production changes.
- Focused behavior: `manager-recovery.test.ts` passes 18 tests covering free/live/stale/unreadable/
  guarded/inspection-error projection, main and History recovery, confirmation, cancellation,
  success navigation, guard and ownership races, pre/post-commit aborts, terminal controls, RPC, and
  32/60/100-column by 12/16/24-row rendering.
- Review and hardening: independent review identified an abort gap, a real-guard race test gap, and
  unverified recovery-submenu navigation; all three were fixed and covered by focused regressions.
- Data safety: deterministic tests compare settings and lock bytes, exercise the real guarded unlock,
  and prove cancellation or refusal leaves the lock intact while successful recovery removes only the
  eligible local lock.
- Documentation and release: `packages/pi-sync/README.md` documents the flow, and
  `.changeset/bright-sync-recovery.md` records a patch without schema or migration claims.
- Package verification: `just pack sync` reports a 60-file dry-run tarball containing
  `manager-recovery.ts` and `operation-availability.ts`, with no tests or credentials.
- Changeset verification: `just changeset-status` reports the new pi-sync patch alongside the existing
  independent pi-sync attention patch.
- Repository gate: final `npm run check` passed build, Biome, boundaries, every workspace typecheck,
  and 2,816 tests in 258 files.
- Runtime smoke: a temporary-agent, no-session Pi RPC process loaded the local package and returned a
  successful `get_commands` response containing `sync`, without credentials or remote access.
- Source-size audit: `manager-ui.ts` remains below the repository boundary at 997 lines; the new
  focused modules are 64 lines each, and no changed authored source exceeds 1,000 lines.
- Live Git, WebDAV, S3, and R2 providers were not contacted because lock recovery is local-only and the
  unchanged backend paths retain deterministic contract and publication coverage.

## Completion Checklist

- [x] A recoverable stale or unreadable lock makes the safe recovery action visible first without a
      History submenu detour.
- [x] The first frame explains why sync, Settings, and More are unavailable and when they return.
- [x] Stale, unreadable, live, guard-owned, free, and inspection-error states have distinct,
      actionable, non-color-only presentation.
- [x] Live and guard-owned operations never expose forced lock removal.
- [x] Recovery is confirmed, guard-aware, identity-rechecked, cancellation-safe, and limited to the
      local operation lock.
- [x] Successful recovery returns directly to the refreshed normal manager and restores Settings and
      More without another `/sync` invocation or Back step.
- [x] Failure, refusal, cancellation, disposal, replacement, reload, shutdown, and ownership races
      preserve the previous valid settings, files, state, and remote data with specific feedback.
- [x] TUI rendering is sanitized and bounded at 32, 60, and 100 columns plus constrained heights, with
      injected keyboard navigation and textual accessibility cues intact.
- [x] RPC, print/JSON handling, direct commands, completions, settings schema, snapshot/state/backend
      formats, credentials, permissions, unknown fields, and existing recovery/history routes remain
      compatible.
- [x] Focused tests, all pi-sync tests, the repository CI-equivalent gate, diff check, package dry run,
      Changeset status, and deterministic Pi/RPC smoke pass with evidence recorded.
- [x] The final diff contains only approved scope, all convention audits are documented, no authored
      source exceeds the 1,000-line boundary without resolution, and the completed plan is archived.
