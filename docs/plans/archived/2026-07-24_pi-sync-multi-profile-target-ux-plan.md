# pi-sync multi-profile and multi-target UX plan

## Goal

Redesign pi-sync around the user goals of setting up safe sync, seeing the active context, switching between `home`/`work`-style sync targets, reviewing changes, syncing, and recovering. Add reusable R2/S3 storage profiles and named sync targets without exposing that data model as the primary workflow, while preserving existing commands, configuration, remote objects, state, environment overrides, and safety behavior. Deprecate the extension-specific `PI_SYNC_*` environment-variable family with value-free migration guidance, but preserve its current precedence and behavior until a future major version.

This document is a proposal only. Product code, tests, stored data, and user-facing documentation must not change until the user explicitly approves it.

## Context

### Evidence inspected

- Current package interface and behavior in `extensions/pi-sync/src/command.ts`, `file-selection.ts`, `config.ts`, `sync.ts`, `lock.ts`, `s3-client.ts`, snapshot/apply/state modules, and `types.ts`.
- Current user-facing behavior in `extensions/pi-sync/README.md`.
- Existing deterministic coverage in `extensions/pi-sync/test/sync.test.ts` and the shared TUI harness in `test/support.ts`.
- Repository conventions in `docs/extension-conventions.md` and `docs/extension-settings.md`.
- Pi 0.80.10 project typings/components plus current installed Pi documentation for extension modes, RPC UI, TUI components, focus, keyboard handling, widths, `SelectList`, `SettingsList`, and `BorderedLoader`.
- Prior pi-sync menu and file-selection plans, current Git history, and the repository memory notes.

### Current experience

- Bare `/sync` opens a flat 13-item menu mirroring internal subcommands: `help`, `init`, `config`, `files`, `status`, `diff`, `doctor`, `push`, `pull`, `sync`, `history`, `rollback`, and `unlock`.
- The menu does not show whether sync is configured, which remote profile is active, whether sessions are included, whether auto-sync is enabled, or what the last known state is.
- First-time setup creates a JSON template and asks the user to edit it manually.
- `/sync files` is the only rich settings screen. Every toggle saves immediately; Escape closes rather than cancels, and the hint explains that behavior.
- Push, pull, and rollback use confirmations, but long previews are notification/dialog text and do not have a bounded, responsive detail viewer.
- Rollback from the menu requires the user to type a snapshot id instead of selecting from history.
- Network work exposes a footer status but no cancellable loading surface.
- The implementation supports one effective endpoint/bucket/remote namespace/file policy at a time. The current `profile` means a remote namespace under `prefix/profiles/<profile>`, not a reusable storage connection.
- Flat configuration, `PI_SYNC_*`/AWS/R2 environment variables, remote snapshot format/layout, local state, direct subcommands, and automation flags are public compatibility surfaces. `PI_SYNC_*` remains functional in this release but becomes explicitly deprecated ahead of future major-version removal.

### Primary user groups and goals

1. **Single-destination, multi-machine user** — evidenced by the current README and conflict model. They want setup once, quiet automatic sync, a quick health check, safe manual sync, and understandable conflict recovery.
2. **Multi-context user** — directly requested in this conversation. They want reusable R2/S3 connections and named targets such as `home` and `work`, with a safe way to switch the active target.
3. **Privacy-sensitive session-sync user** — evidenced by the opt-in session behavior and repeated warnings. They need session scope and risk visible before enabling or applying it.
4. **Automation/expert user** — evidenced by documented direct routes, flags, environment overrides, and manual JSON configuration. They need deterministic target selection plus actionable migration from deprecated `PI_SYNC_*` variables without an immediate break.
5. **Recovery user** — evidenced by history, rollback, backups, conflict handling, and stale-lock recovery. They need diagnosis and recovery without memorizing internal ids or flags.

Frequency statements below are design assumptions inferred from product behavior rather than analytics. They should be validated through maintainer/user feedback after implementation.

## Capability classification

| Capability | Classification | Rationale |
| --- | --- | --- |
| Automatic sync of the active target | Primary | Runs at every normal startup today and is the product's default behavior. |
| Safe `Sync now` decision | Primary | Core user goal; chooses push/pull/up-to-date conservatively. |
| Current target and consequential state | Primary safety/status | Affects every sync decision and must be visible. |
| Switch active target | Primary for multi-context users | Requested `home`/`work` workflow; reversible but changes future sync behavior. |
| Status and concrete change preview | Supporting | Important before consequential operations; no mutation. |
| Choose synced content | Supporting/settings | Existing capability that controls scope and privacy. |
| Target settings and automatic-sync toggle | Supporting/settings | Important but changed less often than syncing. |
| Add/edit targets | Secondary | Infrequent setup/maintenance. |
| Add/edit reusable storage profiles | Advanced | Connection reuse is useful but is an implementation concept for most users. |
| Connection diagnostics (`doctor`) | Advanced/recovery | Used mainly during setup or failure. |
| Explicit push/pull and force resolution | Advanced/high-risk | Needed for conflicts and automation, not the normal primary flow. |
| History | Secondary/recovery | Useful context for rollback. |
| Rollback | Destructive/recovery | Overwrites local files and changes the active remote pointer, though a backup is created. |
| Stale unlock | Destructive/advanced recovery | Must remain gated because an incorrect unlock can permit concurrent mutations. |
| Remove target/profile | Destructive settings | Removes local configuration only; remote snapshots must remain untouched. |
| Existing direct subcommands and flags | Compatibility-only in the TUI hierarchy | Preserve for scripts and expert use, but do not mirror them into the primary menu. |
| Flat config, current `profile`, environment aliases, remote `profiles/` path, snapshot fields | Compatibility-only data/wire format | Must continue to load and address the same remote objects. |
| All `PI_SYNC_*` variables | Deprecated compatibility | Preserve effective precedence, show value-free migration guidance, and reserve removal for a future major version. |

## Flow evaluation

| Flow | Expected frequency | Importance | Complexity | Risk | Reversibility |
| --- | --- | --- | --- | --- | --- |
| Startup auto-sync | Very high | High | Medium | High when pulling | Pull has backup; remote publication is pointer-based. |
| Manual smart sync | Medium | High | Low user complexity | Variable | Pull/rollback recoverable; push can require force resolution. |
| Switch target | Medium for multi-context users | High | Low | Low immediately, medium for later auto-sync | Easily switched back; must not sync on switch. |
| Review status/changes | Medium | High | Medium network work | None | Fully reversible/cancellable. |
| Change synced content | Low/medium | Medium/high | Medium | Medium because future scope changes | Settings can be restored; no sync occurs while editing. |
| Add/edit target | Low | High | Medium | Medium | Atomic settings write; old valid state retained on failure. |
| Add/edit storage profile | Low | High | High | High if credentials/destination are wrong | Atomic settings write; connection must be checked before activation. |
| Force push/pull | Rare | Critical | Medium | High | Pull has backup; force push may supersede remote state. |
| Rollback | Rare | Critical | Medium | High | A new backup is created before local mutation. |
| Unlock stale operation | Rare | Critical | Medium | High | Not inherently reversible; liveness guard remains mandatory. |

## Usability findings

1. **The primary menu reflects commands, not goals.** Thirteen equal-weight routes make users translate `config`, `doctor`, `diff`, `push`, and `pull` into a workflow.
2. **Consequential current state is hidden.** The active remote namespace, storage destination, selected scope, session inclusion, auto-sync state, and stale/unchecked status are not shown before choosing an action.
3. **Setup is implementation-led.** `init` exposes a template rather than guiding the user toward “sync my home settings to R2.” Placeholder values can progress as non-empty configuration and fail later at the network layer.
4. **Preview quality is inconsistent.** Pull shows a path diff, push emphasizes counts, rollback requires an id, and large path sets can overflow dialog/notification surfaces.
5. **Save/close/cancel semantics vary.** File toggles persist immediately while Escape merely closes; setup and rollback cancellation behave differently. The current text is technically explicit, but it does not support drafting and reviewing a consequential scope change.
6. **Navigation is shallow but not continuous.** Every action exits the menu, so related tasks require repeatedly entering `/sync`.
7. **Long operations are not interactively cancellable.** Footer status indicates activity but does not give the user a bounded loading/cancel state.
8. **Failure recovery is mostly textual.** Errors often name a command to run, but there is no context-aware route back to status, conflict resolution, history, or stale-lock recovery.
9. **The current namespace term blocks the proposed model.** Existing `profile` cannot simultaneously mean “R2/S3 connection profile” and “remote namespace”; `PI_SYNC_PROFILE` must retain its namespace meaning during the deprecation period and must never select a storage profile or active target.
10. **The current local apply is preflighted but not transactionally atomic across multiple files.** A failure after some deletes/writes can leave partial local state. A redesign that promises atomic confirmed changes must add rollback and crash recovery rather than only relabel the UI.
11. **Mode support needs explicit boundaries.** TUI supports custom components; RPC supports dialogs/notifications but `custom()` returns `undefined`; print/JSON have no extension UI output. The README currently describes a non-interactive usage notification that is not observable when `ctx.hasUI` is false.
12. **Responsive/accessibility coverage is narrow.** Existing file-selection tests render at 100 columns. Pi requires every line to fit the supplied width and input-containing wrappers to forward focus for IME; terminal UIs expose no ARIA-like screen-reader API.
13. **Source/test cohesion will degrade if features are added in place.** `src/sync.ts` is already 918 lines and `test/sync.test.ts` is 1,962 lines, so the redesign should split responsibilities instead of extending both monoliths.

## Proposed information architecture

### User-facing terminology

- **Sync target**: the named context the user chooses, such as `home` or `work`. It answers “what should sync, and where?”
- **Storage profile**: a reusable R2/S3 connection, such as `r2` or `s3`. This wording appears only in setup/management.
- **Current target**: the one target used by bare/manual commands and startup/shutdown auto-sync.
- **Remote namespace**: the advanced target field that preserves the old `profile` meaning and remote layout.

Primary surfaces should say `Current target: home` and `Storage: Cloudflare R2 · personal-pi`, not lead with `profiles`, `targets`, buckets, or JSON fields.

### Bare `/sync` menu

The title shows local, immediately available state without blocking on network access:

```text
Pi Sync

Current target: home
Storage: Cloudflare R2 · personal-pi
Auto-sync: On · Sessions: Off
Last known sync: 2 hours ago · Remote not checked

What do you want to do?
```

The configured menu is ordered by user goal:

1. `Sync now` — safely determine whether to push, pull, or do nothing.
2. `Switch target` — show `home`/`work` choices and their storage/scope summaries.
3. `Status & changes` — check the remote and review a concrete diff without mutation.
4. `Settings` — edit the current target's auto-sync and synced content.
5. `Manage targets & storage` — add/edit/remove targets and storage profiles.
6. `History & recovery` — browse snapshots, rollback, diagnose, or unlock stale work.
7. `Help` — concise workflow guidance plus compatibility commands.

The main menu has at most seven stable actions. It embeds status rather than forcing users into a separate status screen before every decision. `Settings`, status, and help remain discoverable as required by repository conventions.

The unconfigured/empty menu is smaller:

1. `Set up sync`
2. `Use existing settings` when a legacy flat config is present but needs review/migration
3. `Help`

Malformed settings are not treated as empty; they produce a repair state so the extension never overwrites them silently.

### Navigation model

- Main-menu Escape exits pi-sync with no side effects.
- Secondary menus include an explicit `Back` row; Escape also returns to the parent menu.
- Transactional editors use explicit `Save changes`, `Discard changes`, and `Continue editing` choices. Escape from the editor enters that decision only when the draft is dirty; otherwise it returns.
- Confirmation screens use action-specific verbs (`Switch to work`, `Push 4 changes`, `Apply 3 remote changes`, `Restore snapshot …`) and `Cancel`, never generic `OK`.
- Navigation depth is limited to main menu → one management/recovery submenu → one focused editor/preview.
- After success or recoverable failure, return to the relevant menu with refreshed local state; a direct textual subcommand completes without opening an unrelated menu.

## Proposed interaction flows

### 1. First-time setup

1. Select `Set up sync`.
2. Choose a supported preset: `Cloudflare R2` or `Other S3-compatible storage`. Presets provide only verified defaults; expert fields remain editable.
3. Name the first target (suggest `default`) and storage profile (suggest `r2` or `s3`).
4. Enter non-secret destination fields, choose synced content, and decide whether auto-sync is enabled. Sessions remain off by default and require an explicit privacy acknowledgement before inclusion.
5. Choose a credential source:
   - use detected `PI_SYNC_*` or standard AWS credential variables, showing source/presence only; or
   - create a private settings template and show the exact fields/path to complete manually.
6. Preview the effective target: storage type, endpoint host, bucket, remote namespace, selected groups, session risk, auto-sync behavior, and environment overrides. Never render credential values.
7. `Save setup` writes one complete valid configuration atomically. Cancellation before save writes nothing. A connection check is read-only and cancellable; failure keeps the draft and previous config.
8. Success shows `Target “home” is ready` and offers `Sync now` or `Back to Pi Sync`.

**Security decision proposed for approval:** Pi's extension `input()` and bundled `Input` have no masked-secret mode. This proposal does not collect a secret through an unmasked dialog. A custom masked credential editor is deferred unless explicitly added to the approved scope; existing environment credentials and private manual JSON remain supported.

### 2. Switch current target

1. Open a searchable target list. Every row shows the full target name, current marker in text, storage label, bucket, synced-content summary, session state, and validity.
2. Invalid targets remain visible with an actionable reason but cannot be activated.
3. Selecting another target opens a preview showing `From`, `To`, destination, scope differences, auto-sync/session state, and the statement: `Switching does not sync or modify files now.`
4. `Switch to <name>` atomically changes only `activeTarget`; `Cancel` changes nothing.
5. Do not run network sync as a side effect of switching. The success message states when auto-sync will next run and offers an explicit `Sync now` action.
6. If an environment override changes the effective destination or scope, show that source before confirmation.

Only the current target participates in automatic startup/shutdown sync. This avoids two remotes independently pulling into the same local Pi agent directory. Manual `--target <name>` operations may address a non-current target without switching it.

### 3. Sync now

1. Show a cancellable `Checking <target>…` loader. Cancellation during read-only collection/network checks changes nothing.
2. Resolve to one of these explicit outcomes:
   - **Up to date:** success feedback; no confirmation.
   - **Local changes only / empty remote:** preview destination and every add/change/delete or preserved-unmanaged count; confirm `Push N changes`.
   - **Remote changes only:** preview every local write/delete, protected current session, session warning, and backup location; confirm `Apply N remote changes`.
   - **First-sync mismatch or two-sided conflict:** do not mutate. Show both sides and offer `Keep local (force push)`, `Use remote (force pull)`, or `Cancel`; force choices receive a final exact consequence confirmation.
   - **Nothing selected:** explain that the target manages no files and link to Settings; do not imply a successful useful sync.
3. After confirmation, use an operation surface with target/action state. Do not offer cancellation once the commit boundary begins unless cancellation can guarantee no externally visible change.
4. Apply/publish transactionally. Success names the target, direction, changed file count, snapshot, backup if any, and reload requirement. Failure preserves or recovers the previous valid local/remote active state and gives a target-specific retry/recovery action.
5. Pulled resource changes offer `Reload now` or `Later`; choosing Later is not called cancellation and does not undo the completed pull.

### 4. Status & changes

- Start with a cancellable read-only check.
- Show target, storage destination, effective setting sources, last local state, remote snapshot/time/machine, selected scope, session risk, and a categorized diff (`Will add locally`, `Will update locally`, `Will remove locally`, or remote equivalents).
- Full changed paths remain accessible in a bounded scrollable/searchable detail view. Counts alone are not the only preview.
- From the result, offer context-aware next actions: `Sync now`, `Push local`, `Pull remote`, `Resolve conflict`, or `Back`. Explicit push/pull remain progressive disclosure rather than main-menu peers.

### 5. Settings and synced content

- Header: `Settings for target “home”` with storage summary.
- Simple rows such as auto-sync save immediately and are labeled `Changes save immediately`; Escape is labeled `Close`, not Cancel. Each write is serialized, atomic, preserves unknown fields/private permissions, and rolls the row back on failure.
- `Synced content` opens a transactional draft based on the current selector:
  - built-in files/groups are always recognizable;
  - sessions remain visibly risky and read-only when `PI_SYNC_SESSIONS` overrides the target during the deprecation period;
  - extra safe files remain searchable;
  - edits do not write or start sync;
  - exiting a dirty draft shows exact included/excluded changes and `Save changes`, `Discard changes`, `Continue editing`;
  - save is one atomic config write, and discard/cancel has no side effects.
- Changing content does not immediately perform network sync. Success says it applies to the next manual or automatic sync.

### 6. Manage targets & storage

The submenu is goal-labeled:

- `Add sync target`
- `Edit current target`
- `Manage storage profiles`
- `Remove sync target` (advanced/destructive)
- `Back`

Target setup asks where and what to sync, then previews one atomic save. Storage profile management is one level deeper and exposes endpoint, region, credential source/presence, and targets using the profile.

Safety rules:

- A profile referenced by a target cannot be removed.
- The current target cannot be removed until another target is selected, unless it is the only target and removal returns pi-sync to a clearly unconfigured state.
- Removing a target/profile never deletes remote objects; confirmation says so.
- Duplicate target remote identities (same effective profile, bucket, prefix, and namespace) are rejected by default to prevent two local state records controlling the same pointer.
- Overlapping local file selections across different targets are allowed but visibly warned because the requested work/home workflow may intentionally share files.

### 7. History & recovery

- `Browse history` lists recent snapshots with readable time, machine, current marker, and session presence; snapshot ids remain visible as secondary text and searchable.
- Selecting a snapshot opens a concrete rollback preview, not a free-form id prompt.
- Rollback confirmation names target, snapshot, local writes/deletes, remote pointer change, session effect, and backup behavior.
- `Check setup` replaces the primary-menu `doctor` label but routes to the same diagnostic capability.
- `Recover stale operation` appears only when the lock is stale/unreadable; it retains process-liveness checks and exact confirmation. A live lock shows who/what is running and disables removal.
- Direct `/sync history`, `/sync rollback <id>`, `/sync doctor`, and `/sync unlock --stale` remain compatibility routes.

## Proposed configuration and compatibility architecture

### Canonical v2 shape

The exact schema should be finalized in tests before implementation, but the approved semantic boundary is:

```json
{
  "version": 2,
  "activeTarget": "home",
  "profiles": {
    "r2": {
      "kind": "r2",
      "endpoint": "https://<account-id>.r2.cloudflarestorage.com",
      "region": "auto",
      "accessKeyId": "...",
      "secretAccessKey": "..."
    },
    "s3": {
      "kind": "s3-compatible",
      "endpoint": "https://s3.example.com",
      "region": "ap-northeast-1",
      "accessKeyId": "...",
      "secretAccessKey": "..."
    }
  },
  "targets": {
    "home": {
      "profile": "r2",
      "bucket": "personal-pi",
      "prefix": "pi-sync",
      "namespace": "home",
      "autoSync": true,
      "syncFiles": ["settings.json", "skills", "prompts", "themes"],
      "syncSessions": false,
      "extraFiles": []
    },
    "work": {
      "profile": "s3",
      "bucket": "company-pi",
      "prefix": "developers/narumi",
      "namespace": "work",
      "autoSync": true,
      "syncFiles": ["AGENTS.md", "prompts"],
      "syncSessions": false,
      "extraFiles": []
    }
  }
}
```

`profiles` describe reusable connection/authentication. `targets` own bucket, remote namespace, sync policy, and automatic behavior. New target namespaces default to the target id at creation but remain stable if the display/id is later renamed.

### Legacy behavior

- A flat v1 file loads as one synthetic current target without rewriting the file or changing its effective destination.
- The old flat `profile` maps to the target's `namespace`; it is not reinterpreted as a storage-profile name.
- Every `PI_SYNC_*` variable retains its current effective precedence in this release. When any is present, status/setup/settings surfaces show one value-free deprecation warning and per-field migration guidance; warnings never render or copy values, while existing effective non-secret status fields retain their compatibility behavior. Removal is reserved for a future major version and documented in migration/release notes.
- Migration guidance maps `PI_SYNC_ENDPOINT`, `PI_SYNC_REGION`, `PI_SYNC_ACCESS_KEY_ID`, `PI_SYNC_SECRET_ACCESS_KEY`, and `PI_SYNC_SESSION_TOKEN` to storage-profile fields; `PI_SYNC_BUCKET`, `PI_SYNC_PROFILE` (namespace), `PI_SYNC_PREFIX`, `PI_SYNC_AUTO_SYNC`, and `PI_SYNC_SESSIONS` map to target fields. Flat-v1 users receive the equivalent flat-field names.
- `PI_SYNC_PROFILE` continues to override only flat `profile` or v2 target `namespace`; it never selects `activeTarget` or a storage profile.
- Existing fallback aliases remain below `PI_SYNC_*` precedence: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, and `AWS_REGION` override the selected storage profile; `R2_ENDPOINT` and `R2_BUCKET` override the applicable profile/target. UI shows source/presence without secrets.
- No new extension-specific environment variables are introduced.
- Nested v2 data takes precedence when both v2 and flat recognized fields are present; legacy fields are identified as ignored compatibility data rather than silently merged ambiguously.
- Legacy-to-v2 migration occurs only when the user confirms a feature that requires v2 (for example adding a second target). The preview names the conversion. The original JSON bytes receive a private local backup, known fields are copied without semantic change, unknown top-level fields are preserved, and the canonical file is installed atomically.
- Malformed/invalid/symlinked configuration is never overwritten or auto-migrated.
- Existing remote layout `prefix/profiles/<namespace>`, snapshot `profile` fields, pointer/history formats, and snapshot ids remain unchanged. The physical `profiles/` path is compatibility-only and is not relabeled in place.
- Existing local sync state is adopted by the migrated synthetic/default target so first use does not manufacture a false first-sync conflict. New targets get independent state identities that include target id and effective remote identity; old state remains recoverable during migration.
- Existing direct routes remain accepted and documented. Add `--target <name>` to deterministic read/mutation routes and a concise `/sync use <name>` compatibility/automation route for changing `activeTarget`; provide completions and reject unknown/trailing flags instead of silently ignoring them.
- Existing `--yes`, `-y`, `--force`, and `--stale` semantics remain. `--yes` skips confirmation only on explicit direct commands; it does not make bare interactive menu selections destructive without preview.

## State behavior

### Loading

- Main menu uses validated local state immediately; it must not block on remote status.
- Remote checks use `BorderedLoader` in TUI with Escape cancellation and an `AbortSignal` threaded through S3 requests and local collection where practical.
- RPC uses dialog/notification fallbacks because `custom()` is unsupported. It must not call TUI-only components.

### Empty

- Missing config shows `Not set up` and only setup/help actions.
- A valid profile with no targets shows `No sync targets` and prioritizes `Add sync target`.
- A target selecting no content shows `Nothing selected` rather than `Up to date` as the sole message.
- Empty remote is clearly distinguished from unavailable remote.

### Success

- Feedback uses a verb and object: `Switched to “work”`, `Saved settings for “home”`, `Pushed 4 files from “home”`, `Applied snapshot … to “home”`.
- The relevant menu state refreshes immediately after local settings/state changes.
- Footer status uses the stable `sync` key only for active work (`checking home`, `pushing work`) and is always cleared.

### Error

- Keep the previous valid in-memory and on-disk settings when validation, connection check, persistence, migration, or runtime application fails.
- Errors name the target/profile and a next action without exposing access keys, secret keys, session tokens, synced secret content, or terminal control characters.
- Network failure keeps local navigation available and labels remote status `Unavailable` or `Not checked`, not `Empty`.
- Transaction failure reports whether automatic recovery completed and where the backup/journal is located.

### Disabled

- Invalid targets appear but cannot be activated or synced; their row states the missing profile/field.
- Auto-sync off remains visible in the menu and settings.
- Environment-overridden fields are read-only and show `environment` as source.
- Sync actions are disabled while a live local lock is held; recovery is available only for stale/unreadable locks under existing safeguards.
- A profile cannot be removed while referenced.

### Partial

- If some targets are valid and others invalid, valid targets continue to work; invalid targets remain visible for repair. No target is silently discarded.
- A malformed top-level settings file blocks all writes and preserves the file unchanged.
- If the active target is invalid, auto-sync is paused and the menu prioritizes repair/switch actions.
- If auxiliary history update fails after remote pointer publication, report the sync as published with history needing repair rather than falsely claiming no remote change; a later diagnostic can reconcile it.
- A pulled current session file remains protected as today and the preview/success message says it was skipped.

## Atomicity and recovery requirements

- Settings, active-target changes, and migrations use private (`0600` POSIX) temporary-file plus rename publication, preserve unknown fields, and retain the previous valid runtime state on failure.
- Local multi-file pull/rollback must become transactional: preflight all operations, stage writes, journal original identities/paths, commit, roll back every completed mutation on any error, and recover an interrupted journal before the next sync. Tests inject failures at each mutation boundary. Filesystem-wide true atomic rename is impossible; the product promise is no accepted partial final state after in-process rollback or next-start recovery.
- Remote push/rollback keeps immutable snapshot upload as staging and `latest.json` as the active publication boundary. Failure before pointer publication preserves the prior active snapshot; orphan staged objects are safe and may be diagnosed/cleaned later. History is auxiliary and recoverable.
- Cancellation is offered only before the mutation/publication boundary unless the operation can abort without a visible commit. Once commitment begins, the UI says `Applying`/`Publishing` rather than presenting a misleading Cancel action.
- Existing best-effort remote re-read race guard remains documented; this design does not claim true cross-machine compare-and-swap on R2/S3.

## Responsive and accessibility behavior

- Use Pi's `ctx.ui.select()` for the small main/submenus, searchable `SelectList` for targets/history, `SettingsList` for settings, and `BorderedLoader` for cancellable checks. Do not create an overlay dependency for a core workflow.
- Every custom render line must fit the supplied width. Deterministic render tests cover at least 32, 60, and 100 columns plus long Unicode target/profile/path names. Critical target, destination, risk, and action text wraps on its own line rather than being ambiguously truncated.
- Long change/history lists use bounded vertical windows with visible position/count and search or paging; no critical warning exists only below an unbounded viewport.
- Preserve stable reading order: title/current state → warning/preview → choices → keyboard help. Avoid layout shifts during async work by using a dedicated loader and then replacing it with a complete result.
- Use injected Pi keybindings and textual key hints. Arrow/Page keys navigate, Enter activates, Space toggles settings where conventional, Escape cancels/returns, and focus is restored to the invoking Pi editor when the flow closes.
- Any custom component containing `Input`/`Editor` implements `Focusable` and forwards `focused` for IME support. Target/profile names accept Unicode while storage ids/paths receive explicit validation.
- State is never conveyed only by color or a checkmark: use text such as `(current)`, `Warning: sessions included`, `Invalid: missing profile`, and `Cancelled`/`Saved`/`Applied`.
- Sanitize untrusted config, remote, machine, path, and error text before terminal rendering.
- Pi's terminal extension API exposes no semantic tree or ARIA announcement API. Automated accessibility tests therefore verify plain-text meaning, logical order, key operation, focus forwarding, non-color cues, and width; a real terminal/screen-reader smoke is recorded as manual/conditional rather than falsely claimed as deterministic coverage.
- Themes come from the callback, and status/warning/success colors use Pi theme roles so contrast follows the active Pi theme. No custom hard-coded colors or motion are introduced.

## Acceptance criteria

### Primary flows

- [x] Bare `/sync` in TUI shows configuration-aware current-target state and no more than seven goal-oriented actions in the proposed order; cancelling it performs no filesystem/network mutation.
- [x] Empty, legacy, malformed, invalid-active-target, live-lock, remote-unavailable, and valid configured menus each expose the appropriate next action without hiding the current state.
- [x] A user can create R2/S3-compatible profiles, create `home` and `work` targets that reuse them, preview the effective result, and save once atomically without any secret appearing in rendered text, notifications, errors, logs, or snapshots.
- [x] Switching target previews from/to state, performs no sync, writes `activeTarget` atomically only after confirmation, and leaves the prior target active on cancel/failure.
- [x] Only the current target auto-syncs; a manual operation can address another valid target explicitly without switching.
- [x] Smart sync produces deterministic up-to-date, local-only, remote-only, first-sync mismatch, conflict, empty-remote, and nothing-selected outcomes with concrete previews and proportionate confirmation.

### Preview, confirmation, cancellation, and recovery

- [x] Every push/pull/force/rollback preview identifies target, destination, changed paths, writes/deletes, session effect, protected live session, preserved unmanaged files, backup behavior, and active snapshot effect as applicable.
- [x] Read-only checks can be cancelled with no state change; settings/content drafts can be discarded with byte-for-byte unchanged config; confirmed commits do not expose a misleading cancellable phase.
- [x] Settings/migrations survive write/rename/concurrency failures with previous bytes, effective state, unknown fields, and private permissions preserved.
- [x] Pull/rollback failure injection at each mutation boundary yields either the complete new state or the complete previous state after rollback/recovery, never an accepted partial state.
- [x] Remote publication failure before `latest.json` commit leaves the prior active pointer; post-publication history failure is detected and recoverable.
- [x] Rollback is selectable from history in TUI while direct snapshot-id rollback remains compatible.

### Navigation, responsive behavior, and accessibility

- [x] Main Escape exits; submenu Back/Escape returns; dirty editor Escape offers Save/Discard/Continue; success/failure returns to the relevant menu; navigation depth does not exceed the proposed limit.
- [x] All custom screens render with no line wider than 32, 60, or 100 columns under long Unicode names, hosts, paths, warnings, and large lists; full critical values remain available without ambiguous truncation.
- [x] Keyboard-only tests cover arrows, paging/search, Enter, Space, Escape, and configured keybinding injection; focus returns correctly and any input wrapper forwards `focused` for IME.
- [x] Rendered plain text carries current/invalid/warning/success meaning without relying on color/symbol/position, and untrusted terminal controls are escaped.
- [x] A conditional manual screen-reader/IME/theme smoke is documented; unsupported Pi semantic-announcement capabilities are not claimed.

### Compatibility and modes

- [x] Flat config, omitted `syncFiles`, old `profile`, all current environment aliases/precedence, old local state, remote `profiles/<profile>` layout, snapshot/pointer/history formats, and unknown JSON fields retain their current meaning.
- [x] When any `PI_SYNC_*` variable is set, its override still works and status/setup/settings expose one redacted deprecation warning with per-variable migration guidance; no warning or error reveals a value, and `PI_SYNC_PROFILE` affects only namespace.
- [x] Legacy migration is explicit, previewed, backed up, private, atomic, concurrency-safe, and adopts the existing state without a false first-sync conflict.
- [x] Every current documented subcommand and flag remains tested; new `--target`/`use` routes have completions, exact validation, safety checks, and documentation.
- [x] TUI and RPC use only supported UI methods; RPC receives protocol-safe dialog/notification fallbacks. Print/JSON support is documented honestly and never writes ad hoc protocol-corrupting output.
- [x] Session privacy warnings, secret scan, symlink/path protections, unmanaged-file preservation, live-session protection, local lock/liveness behavior, remote race guard, and backups remain intact.

### Quality and documentation

- [x] Source responsibilities are split so no newly expanded source exceeds 1,000 lines; the 1,962-line test suite is decomposed by configuration/UI, sync flows, snapshot/apply, S3, and lock behavior.
- [x] Deterministic tests cover primary flows, previews, confirmations, cancellations, navigation, loading/abort, all state classes, failure recovery, responsive rendering, accessibility proxies, RPC fallback, and compatibility.
- [x] `extensions/pi-sync/README.md` documents the goal-oriented menu, profiles/targets/current target, setup, switching, presets, settings semantics, direct compatibility routes, `PI_SYNC_*` deprecation/current precedence/future-major removal, AWS/R2 fallback precedence, migration, mode support, privacy, atomic recovery limits, and remote race limitation.
- [x] `npm run check`, `just pack-sync`, and an isolated Pi runtime smoke pass after implementation.

## Implementation evidence

Completed on `feat/pi-sync-multi-profile-target-ux`:

- Focused pi-sync coverage passes across configuration/UI, publication, snapshot/apply, S3, and lock suites, including cancellation, 32/60/100-column rendering, malformed/live-lock repair states, current/non-current target behavior, exact migration backups, every planned local mutation boundary, interrupted-journal recovery, pre-pointer publication failure, and post-pointer history failure.
- `npm run check` passes with 1,270 tests and all formatting, boundary, and workspace typecheck gates.
- `just pack-sync` passes; the 20-file dry-run tarball contains every new source module and the updated README.
- An isolated `PI_CODING_AGENT_DIR=<temporary> pi --mode rpc --no-session -e ./extensions/pi-sync` smoke exits 0 with protocol-safe JSON and no stderr.
- Expanded source and test responsibilities are decomposed; no changed source or test file exceeds 1,000 lines.
- Pi has no terminal semantic/ARIA API and no controlled screen-reader/IME environment was available for deterministic automation. The README records the conditional manual smoke, while automated proxy tests cover logical text, non-color cues, Unicode, keyboard cancellation, theme components, terminal sanitization, and responsive widths.

## Main design decisions and trade-offs

1. **Target is primary; storage profile is advanced.** This supports the requested model without making users manage connection objects before they can sync.
2. **Switching never syncs.** It adds one explicit `Sync now` step but guarantees target selection cannot unexpectedly overwrite local files.
3. **Only one target auto-syncs.** This prevents multiple remotes racing over the same local Pi directory. Simultaneous multi-target mirroring is deliberately out of scope.
4. **The old `profile` becomes user-facing `namespace`, but its wire/storage representation remains unchanged.** This avoids a remote migration while resolving terminology.
5. **Simple settings may save immediately only when the UI says `Close`; complex content editing is transactional.** This follows Pi's settings convention while making cancellation unambiguous.
6. **Force operations remain available but move behind conflict/status context.** Capability is preserved without making high-risk choices primary.
7. **No unmasked secret entry.** This makes setup without environment credentials less seamless, but avoids exposing credentials through a platform dialog that has no password mode. A masked custom component can be a separately approved addition.
8. **“Atomic” local multi-file apply means journaled transaction plus rollback/recovery.** A filesystem cannot atomically replace an arbitrary file set in one primitive; the design states the actual guarantee instead of overpromising.
9. **Main menu status is last-known until checked.** This avoids network latency/failure blocking navigation and labels freshness honestly.
10. **Existing commands remain compatibility routes.** The primary UI improves without breaking automation or forcing a command-surface migration.

## Non-Goals

- Sync multiple targets automatically or concurrently into the same local Pi directory.
- Switch the local Pi agent directory or create separate local work/home sandboxes.
- Delete remote snapshots/buckets when a local target or profile is removed.
- Encrypt snapshots or credentials beyond existing private-file/storage transport behavior.
- Replace S3/R2 with a new backend or claim atomic cross-machine compare-and-swap.
- Rename the existing remote `profiles/` folder or snapshot `profile` field.
- Add project-scoped pi-sync settings.
- Add speculative new environment variables.
- Remove any `PI_SYNC_*` variable in this release; deprecation warning and migration documentation come first.
- Implement a custom masked secret editor unless separately approved.

## Assumptions and unknowns

- **Assumption:** `home`/`work` targets share the same local Pi agent directory and select different remote destinations/policies; target switching itself is not intended to switch local roots.
- **Assumption:** one current target is the desired default for bare commands and auto-sync.
- **Assumption:** preserving existing flat config, remote objects, and direct commands is more important than immediately cleaning up old terminology in stored data.
- **Unknown:** there is no usage telemetry validating action frequency; menu priority is based on current defaults, documented workflows, and the user's multi-target request.
- **Unknown:** actual screen-reader behavior varies by terminal and Pi exposes no semantic announcement API; manual validation environment availability must be recorded during implementation.
- **Approval decision:** accept environment/manual private-file credential completion for this redesign, or explicitly expand scope to a custom masked secret input.

## Risks

- Migration precedence can silently redirect sync if old flat fields, new profiles/targets, and environment aliases are conflated; parsing and previews must keep these concepts separate. Deprecated `PI_SYNC_*` variables must retain exact precedence while warning, and `PI_SYNC_PROFILE` must never be reinterpreted.
- Independent target state can collide if two targets resolve to the same remote identity; validation should reject duplicates.
- Work/home targets may intentionally overlap local files; warnings must inform without blocking the core use case.
- Transactional local apply and crash recovery materially increase implementation scope and require failure-injection tests before UI promises are changed.
- Direct-route argument tightening can reveal scripts that relied on ignored junk flags; retain all documented input and describe rejection as a safety correction.
- RPC cannot render custom viewers/loaders, and print/JSON cannot observe `ctx.ui.notify()`; mode-specific behavior must be designed and tested rather than assumed.
- The repository uses Pi 0.80.10 typings while central docs track newer Pi releases; implementation must stay within installed/tested APIs or explicitly update dependencies as separate approved work.

## Rollback / Recovery

- Keep legacy flat config loading for at least the migration release; do not require a one-way startup migration.
- Back up exact legacy config bytes before an explicitly confirmed v2 conversion and leave remote data untouched.
- Preserve legacy local state while adopting it into the first migrated target so a code rollback can still use it.
- Keep the remote object layout and snapshot formats unchanged so reverting the extension does not require remote rollback.
- Use journaled local apply recovery before any new sync after an interrupted pull/rollback.
- If the redesign must be reverted, nested v2 config cannot be understood by old versions; therefore README/release notes must state the minimum pi-sync version and retain the backed-up flat config for manual downgrade recovery.

## Plan

- [x] After explicit approval, finalize the v2 config/state schema and precedence in focused red tests covering flat compatibility, namespace semantics, profile/target validation, retained `PI_SYNC_*`/AWS/R2 precedence, value-free deprecation warnings, duplicate remote identities, unknown fields, private atomic writes, and explicit migration; evidence: focused configuration tests fail before implementation and pass after it.
- [x] Decompose `extensions/pi-sync/src/sync.ts` and `extensions/pi-sync/test/sync.test.ts` along command UI, settings/migration, operation orchestration, snapshot/apply, S3, and lock responsibilities without changing behavior; evidence: existing tests and workspace typecheck pass before adding the approved UX.
- [x] Implement normalized storage profiles, named targets, current-target resolution, independent state identity, legacy synthetic-target loading, and explicit backed-up migration; evidence: schema/compatibility tests plus old remote-key fixtures pass.
- [x] Implement the configuration-aware main menu, empty/invalid/partial states, shallow Back/Escape navigation, target selector, switch preview, and atomic current-target save with no sync side effect; evidence: primary-flow, cancellation, failure, and navigation tests pass in TUI and RPC fallbacks.
- [x] Implement setup and target/storage management around Cloudflare R2 and generic S3-compatible presets, effective-source display, safe credential completion, validation, previews, reference guards, and local-only removal; evidence: setup/edit/remove tests prove secret redaction, cancel/no-write, invalid-state recovery, and unknown-field preservation.
- [x] Convert current-target settings to the approved immediate-vs-transactional semantics and make synced-content changes draft, preview, save/discard, and rollback on failure; evidence: settings tests cover rapid edits, environment-read-only rows including deprecated overrides, exact discard, one atomic save, and runtime state retention.
- [x] Implement cancellable read-only status checks, bounded responsive concrete change previews, smart-sync outcomes, progressive explicit push/pull/force actions, and target-aware activity/success/error feedback; evidence: outcome matrix, abort, preview, confirmation, secret/control sanitization, and RPC tests pass.
- [x] Implement transactional journaled local pull/rollback with in-process rollback and next-start recovery, and make remote pointer publication/history failure states explicit; evidence: failure injection at each commit boundary and interrupted-journal recovery tests prove no accepted partial final state.
- [x] Replace free-form TUI rollback with searchable history selection and add context-aware diagnostics/stale-lock recovery while preserving direct routes; evidence: history selection, preview, cancel, rollback, live/stale/unreadable lock, and compatibility tests pass.
- [x] Add exact argument validation, target completions, `--target`, and `/sync use` while retaining every documented route/flag and mode safety; evidence: command catalog/completion tests and TUI/RPC/print/JSON behavior tests pass without ad hoc protocol output.
- [x] Add responsive and accessibility-focused rendering tests at 32/60/100 columns, long Unicode/extreme content, keyboard/search/page flows, focus forwarding/IME markers, non-color textual cues, theme invalidation, and terminal-control escaping; evidence: deterministic render/input tests plus recorded conditional manual TUI/IME/screen-reader smoke.
- [x] Update `extensions/pi-sync/README.md` and release-facing migration guidance for the approved behavior, then verify package contents and runtime loading; evidence: README review, `npm run check`, `just pack-sync`, and an isolated `pi -e ./extensions/pi-sync` smoke pass.

## Completion Checklist

- [x] The approved user goals, menu hierarchy, terminology, state model, previews, and navigation are implemented without exposing profile/target internals as the primary flow.
- [x] `home`/`work` targets and reusable R2/S3 profiles work, current target is always visible, switching has no sync side effect, and only the current target auto-syncs.
- [x] Confirmed settings and sync mutations are atomic at their documented publication boundary; cancellation has no side effects; failures retain or recover the previous valid state.
- [x] All existing stored data, remote objects, environment behavior, unknown fields, safety policies, direct workflows, and recovery paths remain compatible; every `PI_SYNC_*` variable remains effective with tested value-free deprecation guidance.
- [x] Loading, empty, success, error, disabled, and partial states are exercised in supported modes.
- [x] Responsive, keyboard, focus/IME, non-color, terminal-safety, and realistic screen-reader proxy criteria pass.
- [x] Tests, documentation, CI-equivalent checks, package dry run, and Pi runtime smoke pass with no known required work remaining.
