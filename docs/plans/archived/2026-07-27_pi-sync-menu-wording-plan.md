# Pi Sync menu experience plan

## Goal

Redesign pi-sync's interactive menu around the jobs users are trying to complete—understand current
sync state, sync safely, switch context, adjust scope, and recover—while consistently naming the two
managed concepts **sync setups** and **storage connections**. Keep frequent actions shallow, move
explicit/risky operations behind predictable disclosure, preserve every existing capability and
version 2 setting, and make previews, cancellation, failure recovery, responsive behavior, and
keyboard operation explicit before implementation.

The user approved implementation by explicitly requesting execution of this plan. The implementation
evidence and accepted deviations are recorded below.

## Context

### Evidence inspected

- Current interaction and state logic in `extensions/pi-sync/src/manager-ui.ts`,
  `storage-connections-ui.ts`, `settings-ui.ts`, `git-ui.ts`, and `webdav-ui.ts`.
- Current user-facing behavior and version 2 schema in `extensions/pi-sync/README.md`.
- Current menu, lock, empty-content, switching, cancellation, settings, S3/R2, Git, and WebDAV tests
  under `extensions/pi-sync/test/`.
- Repository requirements in `docs/extension-conventions.md` and `docs/extension-settings.md`.
- Pi extension and TUI constraints in the installed `docs/extensions.md` and `docs/tui.md`.
- `manager-ui.ts` is currently 945 lines, so adding setup list/detail and richer selection behavior in
  that file would cross the repository's 1,000-line review boundary.

### Current experience

- The main screen shows current target, backend storage, consistency mechanism, selected-content
  counts, automatic sync, last applied snapshot id, and unchecked remote state.
- Seven main actions give equal visual weight to smart sync, explicit pull, explicit push, switching,
  status, settings, and More.
- More opens destination management, history/recovery, and Help. Destination management then exposes
  add/edit/remove target actions and a differently structured Saved connections submenu.
- Switching already shows from/to, storage, content scope, automatic sync, sessions, and configured
  post-switch behavior before confirmation.
- Setup already offers Cloudflare R2, generic S3, WebDAV, and Git; recommended/minimal content presets;
  automatic-sync choice; session privacy acknowledgement; and a final reviewed save.
- Read-only remote checks use a cancellable loader. Once publication/apply begins, cancellation is
  intentionally disabled. Settings writes are private, atomic, serialized, and unknown-field
  preserving.

### Primary user groups and goals

1. **Single-setup user** — evidenced by first-time setup and default automatic sync. They need to know
   whether sync is healthy, run safe Sync now, and adjust included content without learning the
   connection/setup data model.
2. **Multi-context user** — evidenced by named `home`/`work` targets and current-target behavior. They
   need to see which setup is current, compare another setup, switch deliberately, and understand any
   pull that follows.
3. **Privacy-sensitive user** — evidenced by opt-in session syncing and explicit warnings. They need
   session inclusion visible wherever a setup is reviewed, switched, or edited.
4. **Recovery user** — evidenced by history, rollback, diagnostics, stale-lock recovery, backups, and
   conflict handling. They need an actionable route when normal mutation is blocked.
5. **Expert/automation user** — evidenced by documented direct commands, target flags, environment
   overrides, and manual JSON editing. They need compatibility and precise errors, but these controls
   need not dominate the interactive menu.

Frequency assumptions are inferred from current defaults and workflows; pi-sync has no usage
telemetry. They require maintainer/user validation in the approval smoke.

## Capability classification

| Capability | Classification | Presentation |
| --- | --- | --- |
| Current sync setup and attention state | Primary safety/status | Always visible on the main screen |
| Sync now | Primary | First main action |
| Switch sync setup | Primary only when multiple setups exist | Main action when applicable |
| Status & changes | Supporting | Main action; read-only and cancellable |
| Automatic sync and included content | Supporting settings | Settings for the current setup |
| Explicit pull / push | Advanced and potentially consequential | More, plus contextual recovery guidance |
| Add/edit/remove sync setups | Secondary management | More → Sync setups |
| Add/edit/remove storage connections | Advanced management | More → Storage connections |
| History / rollback / diagnostics / stale lock | Advanced or destructive recovery | More → History & recovery; surfaced sooner when blocked |
| Session inclusion | Safety/status | Visible in setup summaries and reviewed before enablement |
| Force routes, `--target`, environment overrides, manual JSON | Compatibility-only expert surface | Direct commands/docs, not primary menus |
| Remove setup / connection | Destructive local configuration | Item detail with exact confirmation |

## Flow evaluation

| Flow | Expected frequency | Importance | Complexity | Risk | Reversibility |
| --- | --- | --- | --- | --- | --- |
| Open `/sync` and understand state | High | High | Low | None | N/A |
| Sync now | Medium/high | High | Medium | Direction-dependent | Pull backed up; remote publication guarded |
| Switch setup | Medium for multi-context users | High | Medium | May lead to reviewed pull | Switchable back; pull separately reviewed |
| Status & changes | Medium | High | Medium | None | Fully cancellable before completion |
| Change settings/content | Low/medium | High | Medium | Changes future sync scope | Atomic save; draft can be discarded |
| Explicit pull/push | Low | Critical when needed | Medium | High | Pull backed up; push can supersede remote state |
| Add/edit setup | Low | High | High | Can redirect future sync | Atomic config save; remote data untouched |
| Edit shared connection | Rare | Critical | High | Can redirect several setups | Atomic config save; must preview dependents |
| Remove setup/connection | Rare | Medium | Low | Local configuration loss | Remote data retained; local recovery manual |
| History/recovery | Rare | Critical | High | Rollback/unlock can be destructive | Existing backups/liveness guards |

## Usability findings in the current plan

1. **It optimizes for symmetric CRUD before user goals.** Symmetric setup/connection management is
   useful, but it should stay secondary; the main experience should remain about syncing safely.
2. **It adds an unnecessary `Manage sync` level.** Main → More → Manage sync → resource list → detail
   is deeper than needed. More can link directly to Sync setups and Storage connections.
3. **It leaves explicit Pull and Push in the primary menu.** They compete with Sync now despite being
   less common and more consequential. Capability should remain under More and direct commands.
4. **It does not define what belongs in the main status summary.** The current `Consistency` line is
   implementation language, snapshot ids are noisy, and the connection name is not shown even though
   it matters when choosing a setup.
5. **It specifies labels but not complete goal flows.** First setup, add setup using an existing/new
   connection, switching with post-switch pull, shared-connection edits, and blocked recovery need
   explicit steps and consequences.
6. **It misses connection-edit blast radius.** Changing a reusable endpoint, URL, remote, or
   credentials can affect several setups; the review must list those setup names before saving.
7. **It overpromises menu semantics that Pi's basic selector does not provide.** `ctx.ui.select()`
   returns the same result for Escape and Ctrl+C and has no disabled rows or rich descriptions. The
   design must either accept those semantics or use a tested richer component with RPC fallback.
8. **Responsive and accessibility requirements are too generic.** Long Unicode names, hosts, paths,
   multiple dependents, privacy warnings, 32-column terminals, focus restoration, non-color cues, and
   exact full-value access need concrete criteria.
9. **State behavior is incomplete.** Loading, empty, invalid active setup, partially invalid setup
   collections, live/recoverable locks, no selected content, save failure, and stale reads need defined
   actions and feedback.
10. **Compatibility boundaries are ambiguous.** Interactive wording may change while version 2 JSON,
    direct `--target`, and technical storage errors retain compatibility terms; the document must say
    exactly where old terms remain and why.

## Architecture

### Revised information architecture

The main menu contains at most five goal-oriented actions:

```text
Pi Sync

Current sync setup: home
Storage: Cloudflare R2 · r2 · personal-pi
Included: 9 groups · Sessions off
Automatic sync: On
Last applied: Never synced
Remote status: Not checked

What do you want to do?

Sync now (recommended)
Switch sync setup
Status & changes
Settings
More…
```

Rules:

- Omit `Switch sync setup` when fewer than two valid setups exist.
- Replace the technical `Consistency` line with status/recovery detail shown by Status & changes or
  Help; keep a short warning on the main screen only when consistency is degraded or unavailable.
- Use `Storage` to show backend type, storage connection name, and a concise destination discriminator
  such as bucket, branch, or path. Full endpoint/path remains available in setup detail.
- Keep `Remote status: Not checked`; opening the menu must not perform network I/O.
- Use text (`current`, `invalid`, `sessions included`, `automatic sync off`) rather than color alone.

More provides one shallow disclosure level:

```text
More options
├─ Pull from remote…
├─ Push to remote…
├─ Sync setups…
├─ Storage connections…
├─ History & recovery…
├─ Help
└─ Back
```

The ellipsis indicates that Pull and Push always lead to a check/preview rather than immediate
mutation. There is no intermediate `Manage sync` screen.

### Sync setup list and detail

In TUI mode, use a bounded `SelectList`-based screen when richer descriptions/search are needed; use
`ctx.ui.select()` as the RPC fallback. Rows show a short name and textual current/invalid marker, with
connection/storage and privacy summaries as descriptions. Never concatenate every detail into one
unbounded selector string.

```text
Sync setups
├─ Add sync setup
├─ home (current) — R2 · r2 · Sessions off
├─ work — S3 · company · Sessions off
├─ archive (invalid) — Missing connection “old-s3”
└─ Back
```

Selecting a valid setup opens one detail screen:

```text
Sync setup “work”

Status: Not current
Storage connection: company
Storage location: S3 · company-pi/developers/work
Included content: 3 groups · 0 extra files
Sessions: Off
Automatic sync: On

Make current…
Edit sync setup…
Remove sync setup…
Back
```

- The current setup shows `Status: Current` and omits Make current.
- Invalid setups remain visible and open repair-oriented detail; Make current and sync are unavailable
  with a textual reason.
- Edit and remove always carry the selected setup explicitly. They never fall back to `activeTarget`.
- Removing the current setup is unavailable while another setup exists, with `Switch first` guidance.
- Remove confirmation states that local configuration is removed and remote data/history remain.

### Storage connection list and detail

```text
Storage connections
├─ Add storage connection
├─ r2 — Cloudflare R2 · Used by 2 setups
├─ github — Git · Used by 1 setup
└─ Back
```

```text
Storage connection “r2”

Type: Cloudflare R2
Endpoint: example.r2.cloudflarestorage.com
Credentials: Settings file
Used by: home, archive

Edit storage connection…
Remove storage connection (unavailable while in use)
Back
```

- Credentials display presence/source only, never values.
- If removal is unavailable, show the reason in text rather than silently hiding the capability.
- Editing endpoint, URL, remote, region, username, or credential source previews every affected setup
  and the old/new non-secret values before one atomic save.
- Adding a connection alone performs no remote probe or sync. A later Check setup remains explicit.

### Primary interaction flows

#### First setup

1. `Set up sync` asks where Pi settings will be stored: R2, S3-compatible, WebDAV, or Git.
2. Suggest `home`/`work`/custom setup purpose and a connection name; do not require users to understand
   the version 2 profile/target split.
3. Collect connection details and masked credentials, then propose backend-specific storage defaults.
4. Offer Recommended Pi settings and Minimal settings presets; expert content customization stays
   available after setup.
5. Keep sessions off by default and require the existing privacy acknowledgement before enabling.
6. Ask whether automatic sync is enabled.
7. Preview setup name, connection, exact storage location, included-content summary, sessions,
   automatic sync, credential presence/source, and external prerequisites.
8. `Save sync setup` publishes one complete valid configuration atomically. Cancel writes nothing.
9. Success says the setup is ready and returns to the refreshed main menu; it does not automatically
   publish remote content.

#### Add another sync setup

1. Start from Sync setups → Add sync setup.
2. Name/purpose the setup.
3. Choose an existing storage connection or Add storage connection without abandoning the draft.
4. Offer safe backend-specific location defaults based on the selected connection, with Customize as
   progressive disclosure.
5. Choose content preset, sessions, and automatic sync.
6. Preview overlap warnings, exact remote location, and the fact that only the current setup runs
   automatically.
7. Save atomically; cancellation at any step retains byte-for-byte settings.

#### Make current / switch

1. Show From, To, connection, exact storage location, content summary, sessions, and automatic sync.
2. State the configured post-switch behavior in plain language.
3. Confirm `Switch to <name>`; cancel changes nothing.
4. Atomically change the current setup.
5. If policy asks, separately ask whether to check/review a pull. If policy starts a pull review,
   retain the exact preview and apply confirmation. Declining/failing the pull leaves the new setup
   current and clearly states that local files were not changed.

#### Explicit pull / push

1. Open from More or a documented direct route.
2. Show a cancellable read-only loader while collecting local/remote state.
3. Show exact target setup, storage location, changed paths/counts, session impact, backup/publication
   effect, and any conflict.
4. Use action-specific confirmation (`Apply 3 remote changes`, `Publish 4 local changes`).
5. Once apply/publication begins, remove misleading cancellation and label the committed phase.
6. Success identifies setup, direction, count, and snapshot/backup where useful; failure says whether
   local/remote state changed and gives the next safe action.

#### Edit/remove

- Editing a setup previews storage changes and warns that saving changes future sync location only;
  it never moves or deletes old remote data.
- Editing a shared connection lists every affected setup before saving.
- Removal confirmations identify exactly the local object removed and explicitly state that remote
  data/history remain.
- Every confirmed settings mutation is one locked atomic write; cancellation and failed validation
  leave previous bytes/effective state unchanged.

### Navigation and cancellation

- Main Escape or Ctrl+C exits pi-sync without side effects.
- On Pi's basic selector, Escape and Ctrl+C are indistinguishable; in submenus both return one level.
  Back is always visible. Do not claim a distinct close behavior without a custom tested selector.
- Maximum routine depth is main → More → resource list → item detail/editor. Add/edit wizards may add a
  focused review step but always provide Cancel.
- SettingsList changes that save immediately remain labeled as immediate. The synced-content editor
  retains Save, Discard, and Continue editing for its transactional draft.
- After success or recoverable failure, return to the owning list/detail with refreshed state rather
  than exiting the entire manager, except when a completed pull requires session reload/replacement.

### State behavior

| State | Visible message/state | Available actions |
| --- | --- | --- |
| Loading/checking | Dedicated cancellable loader; no stale action list underneath | Cancel before commit |
| No settings | `Not set up` | Set up sync, Help |
| Connections but no setups | `No sync setups configured` | Add sync setup, Storage connections, Help |
| Valid configured | Current setup, storage, scope, sessions, automatic sync, last applied, unchecked remote | Primary five-action menu |
| No included content | Explicit warning; do not call it up to date | Settings, Switch when applicable, Status, More |
| Invalid current setup | Automatic sync paused; exact secret-free reason | Switch to valid setup, Sync setups, Help |
| Some invalid non-current setups | Current valid setup continues; invalid rows remain visible | Normal actions plus repair through Sync setups |
| Live lock | Operation and pid visible; mutation actions unavailable | Status, History & recovery, Help |
| Stale/unreadable lock | Recovery required | Status, Recover stale operation, Help |
| Remote unavailable | Local navigation remains usable; never label remote empty | Retry check, Back, Help |
| Save success | Concrete verb/object feedback and refreshed state | Return to owning screen |
| Save failure | Previous value/bytes retained; actionable error names object and retry path | Retry/Edit, Back |
| Cancel | No success wording and no mutation | Return to previous screen |

## Responsive and accessibility behavior

- Cover widths 32, 60, and 100 columns with long Unicode setup/connection names, hosts, paths,
  warnings, and dependent lists. No rendered line may exceed the supplied width.
- Keep selector rows short; full critical values appear in detail/review screens with ANSI-safe
  wrapping, never ambiguous ellipsis as the only access to a value.
- Use Pi's callback theme and text labels; current, invalid, unavailable, warning, saved, cancelled,
  and applied states must not depend on color or symbols alone.
- Use injected keybindings. TUI list tests cover arrows, Enter, Escape, Ctrl+C/basic cancel semantics,
  paging/search when enabled, and focus restoration to Pi after closing.
- Any custom component with Input/Editor must implement `Focusable` and forward focus. Dispose must
  cancel every owned asynchronous task as well as user cancellation.
- Pi exposes no ARIA/semantic terminal tree. Accessibility acceptance therefore covers logical reading
  order, plain-text meaning, keyboard-only operation, focus/IME behavior, non-color cues, contrast via
  theme roles, and a recorded conditional terminal/screen-reader smoke without claiming unsupported
  semantics.
- Async transitions use a dedicated loader followed by a complete result; avoid inserting/removing
  lines repeatedly in a way that causes harmful layout shifts.

## Compatibility and boundaries

- Preserve version 2 `profiles`, `targets`, `activeTarget`, unknown fields, private permissions,
  migration behavior, environment precedence, direct routes, `--target`, remote layout, snapshots,
  state, and backend contracts.
- Interactive UI, menu-owned errors, and workflow documentation use sync setup/storage connection.
  The settings reference explicitly calls `profiles` and `targets` version 2 JSON compatibility names;
  code identifiers and wire fields may retain technical terms in this phase.
- Do not remove Pull, Push, management, recovery, Help, or direct automation capability; only change
  interactive hierarchy and labels.
- No settings save or remote operation occurs merely from opening, listing, backing out, or cancelling
  a menu.

## Design decisions and trade-offs

1. **Five primary actions instead of seven.** This makes Sync now dominant and moves explicit Pull/Push
   behind More without removing them. Unknown telemetry is the validation risk.
2. **No Manage sync intermediary.** Direct More links preserve shallow navigation while keeping
   management secondary.
3. **Goal flow before symmetric CRUD.** Setup/connection lists are symmetric where useful, but first
   setup and Add setup remain destination-oriented wizards so users need not construct internal
   objects in dependency order.
4. **Connection impact is visible.** Shared connection edits receive stronger preview because one save
   can affect several setups.
5. **Rich TUI lists, RPC fallback.** SelectList descriptions improve recognition and overflow behavior;
   RPC retains supported plain selectors because `custom()` is unavailable there.
6. **Compatibility terms remain in the JSON reference.** Total textual elimination would make version
   2 documentation inaccurate; the boundary is user concept versus stored compatibility field.
7. **No independent storage-location manager.** Location remains descriptive setup data under YAGNI.

## Non-Goals

- Changing `pi-sync.json`, its version, profile/target storage fields, migrations, remote identities,
  backend layout, snapshot/state formats, or environment precedence.
- Renaming direct command flags or internal TypeScript identifiers solely for wording consistency.
- Adding a storage-location resource, a new backend, project-scoped settings, telemetry, or remote
  probes on menu open.
- Redesigning the concrete diff viewer, rollback engine, file-selection component, or backend safety
  protocols beyond the menu handoffs described here.

## Risks

- Moving Pull/Push can reduce discoverability for users who rely on the menu; More labels, Help, direct
  route compatibility, and runtime approval must validate the trade-off.
- Editing a non-current setup can accidentally fall back to implicit `activeTarget`; selected identity
  must be explicit and revalidated after every await.
- A richer TUI selector introduces cancellation/disposal/focus responsibility and needs an RPC
  fallback; reusing Pi components does not remove lifecycle review.
- Connection edits can redirect multiple setups after a stale read; review and write must participate
  in one settings concurrency protocol and revalidate dependents before publication.
- `manager-ui.ts` is already 945 lines; adding flows there would violate the repository source-size
  boundary and worsen ownership.

## Approved terminology mapping

| Previous interactive wording | Approved interactive wording | Compatibility boundary |
| --- | --- | --- |
| Current target / Switch target | Current sync setup / Switch sync setup | `activeTarget`, `/sync use`, and `--target` remain unchanged |
| Destination / sync destination | Sync setup when naming the managed configuration; storage location when naming backend coordinates | Backend `destination` properties and version 2 `targets` remain unchanged |
| Saved connection / storage profile | Storage connection | Version 2 `profiles` and internal typed profile symbols remain unchanged |
| Synced content / manages files | Included content / includes files | Version 2 `syncFiles`, `syncSessions`, and `extraFiles` remain unchanged |
| Auto-sync / target switch behavior | Automatic sync / After switching setup | Version 2 `autoSync` and `targetSwitchAction` remain unchanged |
| Manage destinations | Direct Sync setups / Storage connections links | Removed from interactive navigation |

## Plan

- [x] Present this revised information architecture, primary-action reduction, direct More links,
      setup/connection detail content, and state behavior for explicit user approval; approval was the
      user's explicit request to implement this plan.
- [x] Inventory every interactive label and path in `manager-ui.ts`, `storage-connections-ui.ts`,
      `settings-ui.ts`, `git-ui.ts`, `webdav-ui.ts`, tests, and the README; the approved mapping above
      documents why version 2 field names and direct `--target` syntax remain.
- [x] Add focused failing tests for the five-action main menu, conditional Switch visibility, direct
      More disclosure, empty/invalid/partial/lock/no-content states, and Pull/Push discoverability;
      the compiled harness first failed on the old seven-action menu and then passed the updated
      focused and full suites.
- [x] Extract setup management into `extensions/pi-sync/src/sync-setups-ui.ts` and connection
      management into `storage-connections-ui.ts`; both reuse Pi's bounded selector rather than adding
      a custom shared list, and `manager-ui.ts` remains below 1,000 lines (974 after implementation).
- [x] Implement the main/More hierarchy and concise state summary in `manager-ui.ts` without remote I/O
      on open; compiled manager tests cover current/error/lock/no-content state, Back/cancellation, and
      Pi selector behavior shared by TUI and RPC.
- [x] Implement Sync setup list/detail/add/edit/remove/Make current flows with explicit selected setup
      identity, invalid/current/unavailable text states, reviewed switching, and no implicit fallback;
      focused tests cover non-current edits, invalid visibility, current removal guards, concurrent
      switch-policy changes, cancellation, and existing lifecycle/post-switch suites.
- [x] Implement Storage connection list/detail/add/edit/remove flows with credential source/presence,
      dependent setup summaries, unavailable removal explanation, and shared-edit impact preview;
      focused stale-dependent tests and the existing backend, atomic-save, unknown-field, redaction,
      and reference-guard suites pass.
- [x] Update setup/edit/review/settings wording and goal flows to use sync setup, storage connection,
      storage location, `After switching setup`, and action-specific Save/Apply/Remove labels while
      preserving existing presets and privacy confirmation; first/add/edit/discard/confirmation tests
      pass across S3/R2, Git, and WebDAV.
- [x] Verify responsive/accessibility behavior: the existing extension-owned custom content screen
      passes deterministic 32/60/100-column tests; the new menus intentionally use Pi-owned selectors,
      so width, keyboard, focus/IME, theme, search/paging, and disposal remain platform behavior rather
      than duplicated custom code. New tests verify textual state and terminal-control escaping for
      stored setup/connection names; the README documents the honest terminal accessibility smoke.
- [x] Update the interactive workflow and terminology sections of `extensions/pi-sync/README.md`, keep
      version 2 field names explicit in the settings reference, and verify documented labels/routes
      against menu constants and deterministic tests.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`:
      owned tasks keep existing abort/disposal ownership, continuations recheck signals, selected
      identities and shared dependents are revalidated, writes retain serialized atomic publication,
      malformed/symlink protection and unknown fields remain intact, secrets stay redacted, and basic
      selectors provide the supported TUI/RPC fallback. Accepted deviation: no custom shared list was
      added because Pi's selector already owns the required bounded interaction behavior.
- [x] Run focused pi-sync tests and `npm run check`, then smoke the published extension entrypoint in
      isolated RPC mode. Deterministic harnesses capture main, More, setup/connection detail, lock, and
      failure states; `npm run check` passed 1,699 tests and the isolated smoke exited 0 with
      protocol-safe JSON and no stderr. Representative width rendering is covered by the custom-screen
      test and Pi owns rendering for the new basic selectors.

## Acceptance criteria

- [x] Main shows current setup, connection/storage, included-content/session state, automatic sync,
      last applied state, and honest remote freshness without network I/O or implementation jargon.
- [x] Main has at most five actions; Sync now is first, Switch appears only when useful, and explicit
      Pull/Push remain discoverable under More and through existing direct commands.
- [x] No Manage sync intermediary exists; routine management depth does not exceed main → More → list
      → detail/editor, and every screen has Back/Cancel or defined Escape behavior.
- [x] Setup and connection lists/details expose current, invalid, unavailable, privacy, and dependency
      state in text, with full critical values available without ambiguous truncation.
- [x] Switching, setup edits, shared-connection edits, Pull, Push, and removals preview concrete effects
      and use action-specific confirmation before one atomic mutation/publication.
- [x] Cancellation before commit has no side effects; commit phases do not present misleading cancel;
      failures retain previous valid settings/state and give an actionable next step.
- [x] Loading, empty, success, error, disabled, and partial states behave as specified in TUI and have
      safe supported RPC/non-TUI fallbacks.
- [x] Keyboard-only navigation, focus restoration/IME forwarding, non-color meaning, theme contrast,
      terminal sanitization, and 32/60/100-column rendering are covered by Pi-owned selectors plus
      deterministic extension tests; unsupported screen-reader semantics are documented honestly.
- [x] Version 2 settings bytes/schema, unknown fields, direct commands/flags, migration/environment
      behavior, remote data/layout, snapshots/state, privacy, and safety protocols remain compatible.
- [x] Focused tests and `npm run check` pass, and the isolated Pi runtime smoke is accepted for this
      implementation request; the separate version 3 schema plan remains unimplemented.
