# Pi Sync v3 settings schema plan

## Goal

First make pi-sync's current user-facing wording and management flows consistently use **storage
connections** and **sync setups**, without changing the version 2 settings schema or sync behavior in
that milestone. After explicit wording approval, replace the profile/target settings model with a
version 3 schema using the same concepts. Keep the schema small under YAGNI, support S3-compatible
storage (including the Cloudflare R2 preset), Git, and WebDAV, and make every invalid reference or
backend-field combination fail closed without exposing secrets or damaging the settings file.

## Context

- The current settings file uses `version: 2`, `profiles`, `targets`, `activeTarget`, backend-specific
  target location fields, and separate `syncFiles`, `syncSessions`, and `extraFiles` fields.
- Current menus mix `destination`, `saved connection`, `storage profile`, and `sync target` wording.
- The approved vocabulary is **storage connection** for reusable access configuration and **sync
  setup** for a named, switchable combination of remote storage, included content, and automatic-sync
  behavior.
- Delivery is intentionally staged: milestone 1 changes wording, menu hierarchy, command descriptions,
  and user-facing errors while preserving version 2 storage and behavior; milestone 2 starts only
  after explicit review of that wording in a Pi runtime smoke.
- The version 3 milestone is an explicitly approved breaking redesign. Migration cost is out of scope:
  version 1 and 2 settings must not be rewritten or partially interpreted as version 3.
- Applicable guides read before planning: `docs/extension-conventions.md`,
  `docs/extension-settings.md`, Pi `docs/extensions.md`, and Pi `docs/tui.md`. Touched areas are
  settings loading/validation/persistence, settings and manager UI, command wording/completions,
  backend configuration, remote identity, documentation, tests, and package/runtime verification.

## Architecture

### Canonical version 3 shape

```json
{
  "version": 3,
  "activeSyncSetup": "home",
  "onSwitch": "ask-before-pull",
  "storageConnections": {
    "r2": {
      "type": "s3",
      "endpoint": "https://example.r2.cloudflarestorage.com",
      "region": "auto",
      "credentials": {
        "accessKeyId": "...",
        "secretAccessKey": "..."
      }
    },
    "github": {
      "type": "git",
      "remote": "git@github.com:user/pi-sync.git"
    },
    "nextcloud": {
      "type": "webdav",
      "url": "https://cloud.example.com/remote.php/dav/files/user",
      "credentials": {
        "username": "user",
        "password": "..."
      }
    }
  },
  "syncSetups": {
    "home": {
      "storage": {
        "connection": "r2",
        "bucket": "personal-pi",
        "path": "pi-sync/home"
      },
      "sync": {
        "include": ["settings.json", "AGENTS.md", "skills", "prompts", "themes"],
        "automatic": true
      }
    },
    "git-backup": {
      "storage": {
        "connection": "github",
        "branch": "pi-sync/home",
        "path": "pi-sync/home"
      },
      "sync": {
        "include": ["settings.json", "AGENTS.md"],
        "automatic": false
      }
    },
    "webdav-backup": {
      "storage": {
        "connection": "nextcloud",
        "path": "pi-sync/home"
      },
      "sync": {
        "include": ["settings.json", "sessions"],
        "automatic": false
      }
    }
  }
}
```

### Ownership and validation

- `storageConnections` is the only reusable resource catalog. Each own-property key names one
  discriminated connection: `s3`, `git`, or `webdav`. Cloudflare R2 is an S3 setup preset, not a
  fourth persisted type.
- S3 connections own `endpoint`, `region`, and credentials; Git connections own `remote` and rely on
  the user's Git credential/SSH configuration; WebDAV connections own `url` and credentials.
- `syncSetups` owns each setup's backend-relative storage coordinates and sync policy. There is no
  independent storage-location object, id, catalog, command, or menu.
- A setup's referenced connection type selects its accepted `storage` shape: S3 requires `bucket` and
  `path` and rejects `branch`; Git requires `branch` and `path` and rejects `bucket`; WebDAV requires
  `path` and rejects `bucket` and `branch`.
- `storage.path` is the complete user-facing path beneath the backend-specific container. The
  normalization boundary splits or maps it into the backend contract's base path and namespace as
  needed; the setup name is a local id and must not silently change the remote location when renamed.
- `sync.include` is one ordered, duplicate-free list of supported Pi roots and safe agent-relative
  paths. The reserved `sessions` entry triggers the existing privacy acknowledgement and live-session
  safeguards. Empty `include` is valid and disables useful transfer without being reported as up to
  date.
- `sync.automatic` is explicit for every setup. `onSwitch` accepts `ask-before-pull`,
  `pull-after-switch`, or `switch-only`.
- `activeSyncSetup` must reference an own-property setup whenever setups are non-empty and must be
  absent when setups are empty. A referenced storage connection cannot be removed. Two setups cannot
  resolve to the same normalized remote identity.
- Parsed maps must be own-property dictionaries; reserved prototype names, controls, empty names,
  invalid paths, mixed backend fields, missing references, malformed credentials, and secret-bearing
  Git URLs fail closed.

### Loading and persistence

- Parse and validate the complete version 3 document before replacing the last-known effective
  settings. A malformed or invalid file pauses automatic sync and remains byte-for-byte untouched.
- Version 1, version 2, and unversioned non-empty documents receive an actionable unsupported-version
  error; pi-sync does not migrate, reinterpret, or overwrite them.
- UI mutations use the existing cross-process settings lock and atomic private-file publication,
  preserve unknown fields at every retained object boundary, serialize reads and writes, and restore
  prior displayed/effective state after failure.
- Credentials remain in the canonical private `pi-sync.json` file, use POSIX `0600`, and are redacted
  from menus, reviews, notifications, errors, logs, command output, snapshots, and tests.

### UI and commands

- The manager consistently uses `Current sync setup`, `Switch sync setup`, `Sync setups`, and
  `Storage connections`; it removes `target`, `profile`, `destination`, and `saved connection` when
  referring to these two managed resources.
- `Sync setups` and `Storage connections` use symmetric list/detail flows: add, select, edit, remove,
  and Back. A setup detail additionally offers `Make current` when applicable.
- Existing direct command routes remain available, but target-addressing syntax becomes setup
  addressing (`--setup <name>` and `/sync use <name>` unless the implementation review finds a
  clearer non-breaking command name). Known setup names receive completions and unknown/trailing
  arguments remain rejected.
- TUI-only screens remain guarded by `ctx.mode === "tui"`; RPC uses supported dialogs/notifications,
  and print/JSON paths never rely on no-op UI output.

## Non-Goals

- Migrating version 1 or version 2 settings, local state, or remote data.
- Creating an independently reusable or manageable storage-location resource.
- Adding another backend, project-scoped settings, a generic credential provider, encryption, or new
  environment-variable mirrors.
- Automatically syncing multiple setups into the same local agent directory.
- Deleting remote data when a local setup or connection is removed.

## Assumptions

- The breaking version 3 reset and lack of migration are approved product decisions.
- S3, Git, and WebDAV are the complete backend set for this work.
- Storage connections must remain reusable by multiple sync setups; exact remote locations must not.
- Existing safety behavior—locking, atomic settings writes, duplicate-remote rejection, secret
  scanning, pull backups, transactional apply, live-session protection, and reviewed publication—
  remains required even though old settings compatibility does not.

## Risks

- A connection reference makes backend-shape validation cross-object; centralizing resolution before
  any backend construction is required to prevent mixed fields from reaching runtime code.
- Collapsing built-in groups, sessions, and extra paths into `sync.include` can introduce ambiguous
  names unless canonical reserved roots and relative-path rules are specified and tested first.
- Reinterpreting `storage.path` inconsistently across S3, Git, and WebDAV can redirect publication;
  backend-specific normalization and identity fixtures must prove the exact resulting location.
- Removing version 1/2 support can strand existing local settings. The unsupported-version error and
  release documentation must be explicit, and no automatic write may occur after that error.
- Broad terminology changes can leave stale strings in errors, tests, README examples, completion
  descriptions, and state paths; review must audit the complete pi-sync package, not only menus.

## Rollback / Recovery

- Before release, rollback is a code revert because no version 3 settings should be published by an
  unapproved build.
- After release, rollback requires restoring the prior package and the user's separately retained
  version 1/2 settings; version 3 files must not be silently downgraded.
- Settings write failures retain the previous bytes and effective runtime state. Invalid or
  unsupported documents remain untouched for manual recovery.
- Remote publication and local apply retain their existing immutable staging, concurrency checks,
  backups, journals, and recovery boundaries; the settings redesign must not weaken them.

## Plan

### Milestone 1 — wording and symmetric management

- [ ] Inventory every user-visible pi-sync occurrence of `target`, `profile`, `destination`, saved
      connection, and connection across `extensions/pi-sync/src/`, tests, and `README.md`; record the
      intended replacement or justified technical-only retention in this plan so the wording pass is
      complete rather than limited to the main menu.
- [ ] Add focused failing menu and wording tests for `Manage sync`, symmetric `Sync setups` and
      `Storage connections` list/detail flows, current markers, Make current, add/edit/remove, Back and
      Escape, notifications, errors, command descriptions, and completion labels while keeping version
      2 fixture bytes unchanged; verify the intended red state with a focused compiled Node test run.
- [ ] Refactor `extensions/pi-sync/src/manager-ui.ts`, `storage-connections-ui.ts`, backend setup UIs,
      and settings UI so the current version 2 data is presented only as sync setups and storage
      connections, with symmetric add/select/edit/remove navigation and no behavior or persistence
      change; verify main, empty, invalid, partial, cancellation, disposal, session replacement,
      shutdown, narrow-width, and RPC fallback tests.
- [ ] Update command descriptions, completion labels, status/help text, validation errors, and
      notifications to use sync setup and storage connection consistently; introduce `--setup` as the
      documented spelling while retaining `--target` as a tested compatibility alias until the
      version 3 milestone, and verify TUI/RPC/print/JSON argument and mode tests.
- [ ] Update the workflow portions of `extensions/pi-sync/README.md` to use the approved vocabulary
      while labeling `profiles` and `targets` only as temporary version 2 JSON field names; verify links,
      documented commands, and JSON examples without changing the stored schema examples yet.
- [ ] Run the focused pi-sync tests and `npm run check`, then exercise `/sync` with an isolated
      temporary agent directory and record the main, sync-setup, and storage-connection menu wording;
      obtain explicit user approval of this milestone before starting version 3 work.

### Milestone 2 — version 3 schema

- [ ] Add focused version 3 schema fixtures and failing tests in `extensions/pi-sync/test/` for all
      three connection/setup shapes, empty settings, every required field, mixed backend fields,
      missing references, prototype names, duplicate remote identities, normalized paths, complete
      `sync.include` semantics, and redaction; verify the intended red state with a focused compiled
      Node test run.
- [ ] Replace the persisted settings and normalized domain types in `extensions/pi-sync/src/types.ts`
      with exhaustive version 3 storage-connection and sync-setup unions; verify TypeScript rejects
      impossible backend combinations with `npm run typecheck`.
- [ ] Refactor `extensions/pi-sync/src/config.ts` and backend-specific config modules to parse only
      `version: 3`, resolve a setup through its referenced connection, normalize `storage.path`, map
      `sync.include`, and reject unsupported/invalid documents before updating effective state;
      verify with the focused schema and backend-config tests.
- [ ] Update remote identity and state-path derivation to use normalized version 3 connection and
      setup coordinates without treating the setup name as an implicit remote path; verify distinct,
      equivalent, renamed, and duplicated S3/Git/WebDAV fixtures in backend identity/state tests.
- [ ] Replace profile/target mutation helpers in `extensions/pi-sync/src/settings-management.ts` with
      symmetric storage-connection and sync-setup CRUD that preserves unknown fields, rejects removal
      of referenced connections/current setups, and atomically publishes one valid document; verify
      add/edit/remove, concurrent mutation, invalid-file, write-failure, permissions, and
      last-known-state tests.
- [ ] Refactor sync policy and file-selection boundaries to consume `sync.include`, recognize the
      reserved `sessions` entry, validate safe relative paths, preserve privacy confirmation and
      live-session exclusion, and treat an empty list as no selected content; verify focused policy,
      snapshot, cancellation, symlink/path, and session tests.
- [ ] Update S3/R2, Git, and WebDAV setup/edit flows to write the exact version 3 connection and setup
      shapes with complete reviewed storage paths and masked credentials while preserving the approved
      milestone 1 navigation and wording; verify each backend's first setup, connection reuse, edit,
      cancellation, invalid credentials/path, narrow rendering, and secret-redaction tests.
- [ ] Update `extensions/pi-sync/src/command.ts` and route handling to make `--setup` canonical for
      version 3, remove the temporary version 2 `--target` alias under the approved breaking reset,
      retain every other approved direct workflow, complete known values, and reject unsupported modes
      and trailing input observably; verify the full command catalog, completion chaining,
      TUI/RPC/print/JSON behavior, and safety confirmation tests.
- [ ] Remove version 1/2 migration and compatibility code only after version 3 loading, UI, and command
      tests pass; verify unsupported old/unversioned files remain byte-for-byte unchanged and produce
      actionable, secret-free errors rather than migration prompts or writes.
- [ ] Update `extensions/pi-sync/README.md` with the version 3 schema, S3/R2/Git/WebDAV examples,
      storage connection/sync setup terminology, defaults, path meaning, settings permissions,
      unsupported old-version behavior, direct commands, and recovery guidance; verify every JSON
      example parses and every documented route has deterministic coverage.
- [ ] Audit the complete pi-sync diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md`, including async cancellation/disposal/session/shutdown, settings
      concurrency and failure recovery, unknown-field preservation, secret handling, mode behavior,
      and established-route policy; record any approved deviation in this plan before completion.
- [ ] Run `npm run check`, then `just pack-sync` and inspect the tarball, then load the extension in an
      isolated temporary agent directory with `pi -e ./extensions/pi-sync`; record passing commands,
      package contents, and any unverified external backend smoke.

## Completion Checklist

- [ ] Milestone 1 passes focused tests and `npm run check`, preserves version 2 settings bytes and sync
      behavior, and has explicit user approval of the runtime menu wording before milestone 2 begins.
- [ ] `pi-sync.json` accepts exactly the documented version 3 shapes for S3-compatible/R2, Git, and
      WebDAV storage connections and sync setups.
- [ ] Loading, empty, valid, malformed, unsupported-version, missing-reference, mixed-backend,
      duplicate-remote, no-content, secret-bearing, and partial states are deterministic and tested.
- [ ] Storage connection and sync setup CRUD are symmetric, atomic, concurrency-safe, private,
      unknown-field preserving, and cancellation-safe.
- [ ] UI, commands, completions, errors, tests, and README consistently use storage connection and sync
      setup terminology with no managed-resource `profile`, `target`, `destination`, or saved
      connection wording left.
- [ ] S3/R2, Git, and WebDAV resolve the exact reviewed remote location and retain publication,
      conflict, backup, recovery, and session-privacy safeguards.
- [ ] Version 1/2 and unversioned non-empty settings are never migrated or overwritten and receive
      documented recovery guidance.
- [ ] `npm run check`, `just pack-sync`, and the isolated Pi runtime smoke pass, with any unavailable
      live backend validation explicitly recorded.
- [ ] The final semantic audit names the guides read, touched areas checked, accepted deviations, and
      any genuinely unverified path before the completed plan is archived.
