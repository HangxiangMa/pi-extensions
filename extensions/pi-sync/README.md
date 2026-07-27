# ☁️ pi-sync — Git/WebDAV/R2/S3 Pi Settings Sync

[![npm](https://img.shields.io/npm/v/@narumitw/pi-sync)](https://www.npmjs.com/package/@narumitw/pi-sync) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@narumitw/pi-sync` syncs selected Pi configuration through Git, WebDAV, Cloudflare R2, or other S3-compatible storage. Named sync targets such as `home` and `work` can reuse saved connections such as `github`, `webdav`, `r2`, and `s3`.

The extension uses immutable snapshots, local locking, secret scanning, pre-apply backups, and recoverable local apply transactions. S3/WebDAV publish compressed bundles through a managed `latest.json` pointer; Git stores one strict manifest plus reusable raw Git blobs per commit on a pi-sync-owned branch. Remote persistence is isolated behind a backend-neutral contract, and normalized runtime config pairs each discriminated storage profile with its matching destination. Git, WebDAV, and S3/R2 are production backends in this release. Conversation/session syncing remains opt-in because session JSONL can contain prompts, tool output, paths, screenshots, and secrets.

## ✨ Features

- Opens a goal-oriented `/sync` manager showing the current target, storage, auto-sync, session scope, and relevant next actions.
- Supports multiple named **sync targets** and reusable Git/WebDAV/R2/S3 **storage profiles**.
- Publishes Git snapshots as one commit with an exact expected-ref lease, preserving native first-parent history without unconditional force pushes.
- Uses verified `ETag`, `If-Match`, and `If-None-Match` preconditions for atomic WebDAV publication and fails closed when a server ignores them.
- Asks to review a pull after switching targets by default, with settings to start that review automatically or switch only.
- Previews concrete local or remote file changes before push, pull, force resolution, or rollback.
- Uses transactional synced-content drafts with explicit Save, Discard, and Continue editing choices.
- Keeps direct `help`, `use`, `init`, `config`, `files`, `status`, `diff`, `doctor`, `push`, `pull`, `sync`, `history`, `rollback`, and `unlock` routes for compatibility and automation.
- Syncs allowlisted Pi configuration from the Pi agent directory:
  - `settings.json`, `keybindings.json`, `models.json`, `AGENTS.md`, and `APPEND_SYSTEM.md`
  - recursive `skills/`, `prompts/`, `themes/`, and `extensions/` groups
  - safe top-level files selected through `extraFiles`
  - optionally denylist-filtered `sessions/**/*.jsonl`
- Preserves files outside the addressed target's selection locally and in remote uploads.
- Creates backups before pull/rollback and journals multi-file applies so failures roll back; interrupted transactions recover before the next sync.
- Refuses common secret patterns, unsafe paths, symlink escapes, live-lock removal, and unreviewed conflict overwrites.

## 📦 Install

```bash
pi install npm:@narumitw/pi-sync
```

Try without installing permanently:

```bash
pi -e npm:@narumitw/pi-sync
```

Try this package from a local checkout:

```bash
pi -e ./extensions/pi-sync
```

## 🚀 Quick start

Run the manager:

```text
/sync
```

When pi-sync is not configured, choose **Set up sync**. The TUI guides you through:

1. Git, WebDAV, Cloudflare R2, or another S3-compatible service
2. `Personal / Home`, `Work`, or a custom target purpose
3. an endpoint and, for S3, the existing bucket name
4. a recommended remote location or advanced customization
5. existing Git/SSH authentication, masked WebDAV credentials, S3 environment credentials, or a private settings-file template
6. a synced-content preset
7. an exact setup preview and **Save setup** confirmation

For a first Cloudflare R2 target, the recommended location requires no raw path questions:

```json
{
  "profile": "r2",
  "bucket": "pi-sync",
  "prefix": "pi-sync",
  "namespace": "home"
}
```

The R2 bucket must already exist; pi-sync never creates buckets. Generic S3 setup asks for one existing, potentially globally unique bucket and derives storage profile `s3`, prefix `pi-sync`, and namespace `home` or `work`. **Customize remote location** retains direct control over profile name, bucket, prefix, and namespace.

The setup wizard can store WebDAV passwords and S3-compatible static credentials entirely through the TUI. Its package-owned masked input renders only bullets, and secret values are never shown in reviews, menus, status, notifications, warnings, or errors. S3 environment credentials and a manual private-settings template remain available; WebDAV has no environment-variable credential mirrors.

### Git setup

Git profiles contain only a remote URL; credentials remain in your existing Git credential helper, SSH agent, or SSH configuration. Targets select a pi-sync-owned branch, repository directory, and namespace:

```json
{
  "profiles": {
    "github": {
      "kind": "git",
      "remote": "git@github.com:owner/private-pi-sync.git"
    }
  },
  "targets": {
    "home": {
      "profile": "github",
      "branch": "pi-sync/home",
      "directory": "pi-sync",
      "namespace": "home"
    }
  }
}
```

The remote repository must already exist; the owned branch may be absent and is created on first push with an exact missing-ref lease. Setup asks whether automatic sync should be enabled and shows that choice before saving. Each effective repository/branch pair belongs to exactly one pi-sync target; equivalent scp-like and `ssh://` spellings are treated as the same remote, and another namespace or target must use a distinct branch. Existing non-empty repositories are safe because pi-sync reads and updates only the configured branch. If that branch already exists, its complete tip tree must contain only the valid pi-sync manifest and its exact declared regular files; pi-sync rejects rather than deletes any other branch content.

Supported production remotes are HTTPS without embedded credentials, `ssh://` URLs, and conservative scp-like SSH remotes such as `git@github.com:owner/repo.git`. Local paths and `file`, `git`, `ext`, and arbitrary remote-helper transports are rejected. Automatic commands disable repository hooks, editors, pagers, terminal prompts, and askpass interaction. User-configured credential helpers, SSH agents/configuration, and SSH `ProxyCommand` remain trusted external authentication mechanisms; pi-sync does not sandbox or store them.

Git 2.30 or newer and a SHA-1-format remote repository are currently required; SHA-256-format refs fail explicitly rather than being misread. Run `/sync doctor` to check the Git executable/version, non-interactive remote access, owned branch, private bare cache, and lease-protected publication capability. Cache corruption can be recovered by removing only the matching private cache under `${PI_CODING_AGENT_DIR:-~/.pi/agent}/.pisync/git/`; settings, local sync state, backups, and remote history remain untouched and the cache is rebuilt on the next operation.

### WebDAV setup

Generic WebDAV profiles use the authenticated collection URL, a username, and a password. Targets add a relative `path` and `namespace`:

```json
{
  "profiles": {
    "webdav": {
      "kind": "webdav",
      "url": "https://cloud.example.com/remote.php/dav/files/user",
      "username": "user",
      "password": "<app-password>"
    }
  },
  "targets": {
    "home": {
      "profile": "webdav",
      "path": "pi-sync",
      "namespace": "home"
    }
  }
}
```

- **Nextcloud/ownCloud:** use the user DAV collection, commonly `https://HOST/remote.php/dav/files/USERNAME`, and prefer an app password.
- **Synology:** use the HTTPS WebDAV Server endpoint and user collection exposed by your DSM configuration. Confirm its exact path and certificate in a browser or WebDAV client first.
- **Generic servers:** Basic authentication is supported over HTTPS. Plain HTTP is rejected except on loopback for local tests. URL-embedded credentials, query strings, fragments, and cross-origin authenticated redirects are rejected.

Run `/sync doctor` after setup. It creates an unpredictable temporary probe, verifies collection listing/read/write/cleanup plus strong ETags and stale conditional writes, and removes the probe. A server without working strong `If-Match` and `If-None-Match` remains readable but publication is rejected before `latest.json` changes; pi-sync never silently degrades WebDAV automatic sync to an unsafe overwrite.

A configured manager shows:

```text
Current target: home
Storage: Cloudflare R2 · personal-pi
Synced content: 9 built-in groups · 0 extra files · Sessions: Off
Auto-sync: On
Last applied snapshot: snapshot-id (or Never synced)
Remote changes: Not checked
```

Its primary actions are:

- **Sync now (recommended)** — conservatively decide whether to push, pull, or do nothing
- **Pull from remote** — check the remote snapshot, preview exact local writes/deletes, then confirm
- **Push to remote** — scan and preview exact remote publication changes, then confirm
- **Switch target** — preview the target change, then follow the configured pull behavior
- **Status & changes** — perform a cancellable read-only remote check
- **Settings** — control post-switch pulling, automatic sync, and synced content
- **More…** — open one shallow level containing destination management, history/recovery, Help, and Back

The menu does not query remote storage merely to open. It shows the last locally applied snapshot and marks remote changes as unchecked until an operation runs. When no synced content is selected, transfer actions are hidden and Settings becomes the first action. During an active or recoverable lock, mutation actions remain unavailable.

Push and pull keep their existing concrete previews and confirmation prompts. Pull creates a local backup before applying; push scans locally managed content for likely secrets before publication. Escape cancels a pre-commit check without changing local or remote files. Once publication or apply begins, cancellation is disabled. Conflicts never force automatically; inspect **Status & changes** and use an explicit direct route only after reviewing the conflict.

Escape exits the main menu. **More…** and secondary menus provide Back; dirty synced-content drafts provide Save, Discard, and Continue editing. Cancellation before publication has no side effects.

## ⚙️ Settings

The private user settings file is:

```text
${PI_CODING_AGENT_DIR:-~/.pi/agent}/pi-sync.json
```

On first read, an existing `pi-sync.local.json` is migrated byte-for-byte to `pi-sync.json`
with private POSIX `0600` permissions. The private legacy file is retained as a recovery copy and may
be deleted after verifying the new file. If both files exist, `pi-sync.json` takes precedence and the
legacy file remains untouched. Malformed, invalid, symlinked, changed, or otherwise unsafe legacy
files are never overwritten automatically.

A version 2 example:

```json
{
  "version": 2,
  "activeTarget": "home",
  "targetSwitchAction": "ask",
  "profiles": {
    "github": {
      "kind": "git",
      "remote": "git@github.com:owner/private-pi-sync.git"
    },
    "r2": {
      "kind": "r2",
      "endpoint": "https://<account-id>.r2.cloudflarestorage.com",
      "region": "auto",
      "accessKeyId": "<access-key-id>",
      "secretAccessKey": "<secret-access-key>"
    },
    "s3": {
      "kind": "s3-compatible",
      "endpoint": "https://s3.example.com",
      "region": "ap-northeast-1",
      "accessKeyId": "<access-key-id>",
      "secretAccessKey": "<secret-access-key>"
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
    "git-backup": {
      "profile": "github",
      "branch": "pi-sync/backup",
      "directory": "pi-sync",
      "namespace": "backup",
      "autoSync": false,
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

### Terminology

The TUI presents each profile/target pair as a **destination**. **Add destination** is the primary flow; reusable **saved connections** are available as an advanced action. The version 2 JSON names remain unchanged for compatibility.

- A Git **storage profile** owns `kind: "git"` and a credential-free `remote`; a WebDAV profile owns `kind: "webdav"`, `url`, `username`, and `password`; an S3/R2 profile owns `kind`, `endpoint`, `region`, `accessKeyId`, `secretAccessKey`, and optional `sessionToken`.
- A Git **sync target** owns `branch`, `directory`, and `namespace`; a WebDAV target owns `path` and `namespace`; an S3/R2 target owns `bucket`, `prefix`, and `namespace`. Every target also owns `autoSync` and its synced-content policy.
- `activeTarget` is used by bare commands and automatic sync.
- `targetSwitchAction` controls what happens after a target switch: `ask` (default), `pull`, or `switch-only`.
- `namespace` is the old flat `profile` concept. The remote layout and snapshot wire field remain named `profiles`/`profile` for compatibility.

When adding another target with the same storage profile, pi-sync recommends reusing the current target's bucket and prefix while deriving a separate namespace from the new target name. For example, `home` and `work` may both use profile `r2`, bucket `pi-sync`, and prefix `pi-sync`, producing `pi-sync/profiles/home/` and `pi-sync/profiles/work/`.

Two targets may intentionally overlap local files, but only one is automatic. pi-sync rejects duplicate effective target remote identities—including deprecated bucket/prefix/namespace environment overrides—to prevent independent local states from controlling the same remote pointer. Removing a target/profile removes local configuration only; it never deletes buckets or snapshots. A referenced profile cannot be removed, and users must switch away before removing one of several current targets.

### Target switching

The default `targetSwitchAction: "ask"` changes `activeTarget` atomically, then asks in TUI mode whether to review a pull for that target. Choosing not to review leaves local files unchanged. Accepting starts the normal pull flow, which fetches the remote snapshot and shows the exact writes and deletions before apply. In print, JSON, or RPC mode, `ask` switches without pulling and directs interactive users to `/sync pull` where notifications are available.

Set `targetSwitchAction` to `"pull"` to start that reviewed pull automatically after a confirmed target switch. The exact pull summary and apply confirmation remain enabled, conflict detection still stops unsafe merges, a local backup is created before apply, and pi-sync never adds `--force`; Pi may separately ask whether to reload changed resources after a successful pull. Because that confirmation requires observable UI, `/sync use` rejects `"pull"` in print and JSON modes before changing `activeTarget`; use TUI or RPC mode instead. Set it to `"switch-only"` to retain the previous no-pull behavior. Selecting an already-current target is a no-op. If a pull fails or its concrete review is declined, the new target remains active and pi-sync reports that synced files were not changed before `/sync pull` is retried.

### Synced content

The **Settings → Choose synced content** screen edits a draft. Arrow keys navigate, Enter or Space toggles, and Escape opens the Save/Discard/Continue decision. A single Save atomically updates the target while preserving unknown fields and POSIX `0600` permissions. Saving settings never starts network sync.

Omitting `syncFiles` preserves the legacy default of every built-in item. An empty array is valid and means the target manages nothing; **Sync now** reports that state instead of publishing an empty sync. Unknown built-in names fail validation.

Unselected items are unmanaged: pi-sync does not compare, pull, overwrite, or delete their local content, and pushes preserve their existing remote content.

### Environment precedence and deprecation

The existing `PI_SYNC_*` family still works in this release with its existing highest precedence, but it is deprecated and will be removed in a future major version. pi-sync shows variable names—not values—and migration guidance when any are active.

Move these fields into a storage profile:

- `PI_SYNC_ENDPOINT`
- `PI_SYNC_REGION`
- `PI_SYNC_ACCESS_KEY_ID`
- `PI_SYNC_SECRET_ACCESS_KEY`
- `PI_SYNC_SESSION_TOKEN`

Move these fields into a sync target:

- `PI_SYNC_BUCKET`
- `PI_SYNC_PROFILE` → `namespace`
- `PI_SYNC_PREFIX`
- `PI_SYNC_AUTO_SYNC`
- `PI_SYNC_SESSIONS`

`PI_SYNC_PROFILE` continues to mean only the remote namespace during the deprecation period; it never selects a storage profile or current target.

Standard compatibility aliases remain below `PI_SYNC_*` precedence:

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION`
- `R2_ENDPOINT`, `R2_BUCKET`

Environment-overridden fields are read-only in interactive settings. Cloudflare R2 static keys commonly reject `X-Amz-Security-Token`; pi-sync retains its one-time retry without the configured token for that R2 response.

### Legacy flat settings

Existing flat settings continue to work unchanged as a synthetic `default` target/profile, including settings migrated from the legacy `pi-sync.local.json` filename. The old flat `profile` remains the remote namespace.

Adding a second target offers an explicit migration preview. On confirmation pi-sync:

1. takes an exact private backup of the original JSON bytes;
2. preserves unknown top-level fields;
3. maps existing connection and policy fields without changing the remote destination;
4. adopts the existing local sync state for the migrated target;
5. publishes the version 2 file atomically.

Malformed, invalid, symlinked, or concurrently changed settings are never overwritten automatically. Version 2 settings require the multi-target pi-sync release or newer. For a manual downgrade, restore the exact `.legacy-<timestamp>.bak` flat-config backup; no remote migration or rollback is needed.

## 💬 Commands

The menu is the preferred interactive workflow. Existing deterministic routes remain available:

```text
/sync help
/sync use <target>
/sync init
/sync config [--target <name>]
/sync files [--target <name>]
/sync status [--target <name>]
/sync diff [--target <name>]
/sync doctor [--target <name>]
/sync push [--target <name>]
/sync pull [--target <name>]
/sync sync [--target <name>]
/sync history [--target <name>]
/sync rollback <snapshot-id> [--target <name>]
/sync unlock --stale
```

Flags:

- `--target <name>` addresses a target without switching it.
- `--yes` / `-y` skips an explicit direct command's confirmation.
- `--force` resolves a reviewed conflict for push/pull/sync.
- `--stale` requests guarded stale-lock recovery.

Unknown flags, unexpected values, and missing target/snapshot values are rejected. Argument completion includes configured target names after session start.

TUI mode provides the full manager and custom settings components. RPC uses Pi's dialog/notification protocol and does not call TUI-only components. Print/JSON modes cannot display extension UI; use explicit direct routes for compatible automation and do not expect notification-only status output.

## 🧭 Backend comparison and migration

| Backend | Publication guarantee | Authentication | History and rollback | Local dependency/cache | Session suitability |
| --- | --- | --- | --- | --- | --- |
| Git | Exact expected-ref lease (`lease-protected`) | Existing SSH agent/config or non-interactive HTTPS credential helper | Native first-parent commits; rollback creates a new commit | Git executable and rebuildable private bare cache | Use cautiously: old session content remains in permanent commit history |
| WebDAV | Verified strong `If-Match`/`If-None-Match` (`atomic-conditional`) | Private settings-file username/app password over HTTPS | Managed snapshot history; rollback publishes a new pointer | No extra executable; conditional-capability probe | Suitable only on a trusted server; server retention still applies |
| R2/S3 | Read-check-write-verify; an unobserved simultaneous race remains possible | Private settings or existing compatibility environment variables | Managed snapshot history; rollback publishes a new pointer | No extra executable | Suitable only on trusted storage with an explicit retention policy |

`--force` has the same meaning on every backend: accept reviewed content divergence, re-read the destination, and retain the backend's concurrency protection. It never authorizes an unconditional Git force push or pointer overwrite.

To migrate between backends manually:

1. Disable automatic sync for the source target.
2. Run source diagnostics, inspect status, pull the intended current state, and retain the local backup.
3. Add a separate destination/saved connection for the new backend and run `/sync doctor --target <destination>`.
4. Switch deliberately, review the exact destination push, and publish only after confirming that an empty destination or its existing content is expected.
5. Verify destination status and history before removing any local source configuration.

Do not run source and destination automatic sync simultaneously over overlapping local files. Cancelling before destination publication leaves it unchanged; after publication begins, an ambiguous transport result requires `/sync status` before retrying. Migration publishes only the current selected snapshot—it does not copy S3/WebDAV managed history or Git native commit history. Removing a local target/profile never deletes remote data.

## 🔄 Sync and recovery model

For the current target, startup auto-sync uses conservative decisions:

- local changed or remote empty → preview/confirm manually, or push in the existing quiet automatic path
- identical first sync → initialize local state
- safe remote-only change → pull with backup
- first-sync mismatch or both changed → stop and require review
- no selected content → report/skip

Switching targets first changes `activeTarget`, then follows `targetSwitchAction`: ask before reviewing a pull in TUI by default, start a reviewed pull automatically when configured, or stop after switching. Pulls remain pinned to the selected target and retain exact summaries, locking, backups, and conflict safeguards. The next startup uses the new target's `autoSync` regardless of the switch action.

S3/WebDAV remote layout remains compatible:

```text
<prefix>/
└── profiles/
    └── <namespace>/
        ├── latest.json
        ├── history.json
        └── snapshots/
            └── <snapshot-id>.json.gz
```

Git uses one commit per publication on the owned branch:

```text
<directory>/
└── profiles/
    └── <namespace>/
        ├── manifest.json
        └── files/
            ├── settings.json
            ├── keybindings.json
            └── sessions/…
```

The manifest declares each logical path, byte size, and SHA-256. File contents are ordinary `100644` Git blobs, so unchanged or duplicate content is reused and changed content remains eligible for Git pack deltas. gzip is not used for Git and would not provide encryption: anyone who can read the private repository can inspect all retained synchronized content. [GitHub warns above 50 MiB and blocks regular-Git files above 100 MiB](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github); pi-sync rejects a decoded Git payload above 100 MiB before creating a commit. Prefer S3/WebDAV for large or high-churn binary/session archives. The earlier PR-only gzip Git format was never released and is intentionally not read; if a disposable test branch contains it, recreate only that pi-sync-owned test branch and its private cache.

Snapshot upload is staging; `latest.json` is the S3/WebDAV active publication boundary, while the Git owned-ref update is its publication boundary. pi-sync records the backend's opaque remote revision separately from the applied snapshot identity, while continuing to read legacy state that has no revision or contains the old `lastRemoteEtag` field. Rollback verifies the selected snapshot against the active head or retained history, mints a new snapshot identity, and publishes a new history entry instead of rewriting the old one. If remote rollback publication fails after local apply, the error identifies that partial outcome and its local backup. A failed history update after publication is reported as “snapshot active, history needs repair” instead of falsely claiming no remote change. A transport failure at the active-head boundary is reported as an unknown publication outcome and directs the user to check status rather than claiming that nothing changed.

Before pull/rollback, pi-sync writes a backup under `.pisync/backups/`. It then preflights all paths, stages a private transaction journal, applies changes, and restores every affected path if a later mutation fails. An interrupted journal is recovered before the next session/snapshot apply. Filesystem-wide replacement cannot be one OS primitive, so the guarantee is a complete previous or complete new accepted state after rollback/recovery—not an unrecoverable partial accepted state.

WebDAV is conservatively reported as `conditional-required` until an isolated probe passes, then as `atomic-conditional`: each publication verifies the server's precondition behavior, stages the immutable bundle with `If-None-Match: *`, and changes `latest.json` with `If-Match` or `If-None-Match: *`. Unsupported servers remain read-only and are reported by doctor.

Git is reported as `lease-protected`. Each publication creates a child commit in a private bare cache and pushes it with an exact expected branch SHA (or an exact missing-ref expectation). A timeout or transport failure after push starts is reconciled against the candidate commit; if the result cannot be proven, pi-sync reports an unknown publication outcome instead of claiming cancellation.

R2/S3 is explicitly reported as `read-check-write-verify`, not atomic compare-and-swap. pi-sync re-reads `latest.json` immediately before publication and verifies afterward, but simultaneous writers can still race. `--force` accepts a reviewed content conflict, re-reads the head, and never disables the backend revision check; it is not an unconditional overwrite. Review status before important forced updates.

## 🔒 Session syncing

`syncSessions` defaults to `false`. Enabling it includes configured Pi session JSONL files and makes the privacy warning visible in settings, status, previews, and confirmations.

Only JSONL session files are included. Denylisted names and paths such as `.env*`, `.pisync`, `node_modules`, `token`, and `secret` are ignored. The currently open session file is protected during pull; restart Pi or resume a pulled session to use newly synced conversations.

Sessions can contain prompts, model output, tool results, file paths, images, and secrets. Use only storage you trust. Git is especially persistent: disabling session sync, deleting a cache/target, or publishing a later snapshot does not remove session content from old commits; removal requires an explicit repository history-retention or rewrite procedure outside pi-sync.

## 🛡️ Safety notes

- Credentials stay local; canonical, legacy, temporary, and migration-recovery settings files are always excluded from snapshots. Git remote URLs with embedded HTTPS credentials are rejected, and rendered Git destinations contain only host, owned branch, directory, and namespace.
- Push refuses common secret patterns in locally managed files.
- Pull/rollback reject unsafe paths, duplicate paths, checksum mismatches, symlink parents, and file/directory replacement hazards before mutation. Git additionally rejects missing/extra/non-regular tree entries, file/directory path collisions, payloads above 100 MiB, and aggregate content above 512 MiB. Remote JSON and WebDAV XML responses are limited to 1 MiB, error bodies to 64 KiB, compressed S3/WebDAV snapshot downloads to 256 MiB, and decompressed bundles to 512 MiB.
- Unmanaged local/remote files remain preserved.
- A live local lock disables destructive work. Stale/unreadable lock recovery retains process-liveness and guard checks.
- Force operations remain explicit direct/conflict-recovery actions and retain exact confirmations.
- Terminal-bound config, remote metadata, machine names, paths, and errors are control-character sanitized.

## ♿ Conditional terminal accessibility smoke

Pi exposes terminal components rather than a semantic/ARIA tree, so automated tests verify textual state, keyboard paths, control-character escaping, and 32/60/100-column fitting rather than claiming semantic announcements. When validating a release in a supported environment:

1. open `/sync` using only the keyboard and verify arrows, Enter, Space, search typing, paging where available, Back, and Escape;
2. enter a Unicode target/profile name with an IME and confirm focus returns to Pi after closing;
3. check the main, warning, preview, saved, cancelled, and invalid states with the terminal screen reader in use;
4. repeat under a light and dark Pi theme and at 32, 60, and 100 columns.

Critical meaning is always present in text such as `(current)`, `Warning`, `Invalid`, `Saved`, `Cancelled`, or `Applied`; color is supplementary.

## 🗂️ Package layout

```text
extensions/pi-sync/
├── src/
│   ├── index.ts                 # Thin Pi entrypoint
│   ├── sync.ts                  # Command registration and session lifecycle
│   ├── sync-operations.ts       # Backend-neutral sync orchestration
│   ├── sync-backend.ts          # Backend contract, revisions, capabilities, and errors
│   ├── backend-factory.ts       # Backend selection from normalized settings
│   ├── s3-backend.ts            # S3/R2 persistence, publication, history, and diagnostics
│   ├── s3-client.ts             # Bounded, signed S3 transport
│   ├── webdav-backend.ts        # Conditional WebDAV publication and diagnostics
│   ├── webdav-client.ts         # Bounded authenticated WebDAV transport
│   ├── webdav-ui.ts             # WebDAV setup and profile/target management
│   ├── git-backend.ts           # Lease-protected Git commits, history, cache, and diagnostics
│   ├── git-storage.ts           # Strict Git manifest, tree, blob, and size validation
│   ├── git-runner.ts            # Bounded non-interactive Git subprocess lifecycle
│   ├── git-ui.ts                # Git setup and profile/target management
│   ├── snapshot-codec.ts        # S3/WebDAV immutable snapshot bundle codec
│   ├── manager-ui.ts            # Goal-oriented menus and setup/management flows
│   ├── file-selection.ts        # Transactional synced-content editor
│   ├── config-file.ts           # Private settings I/O and legacy filename migration
│   ├── settings-management.ts   # Profiles, targets, migration, and atomic saves
│   ├── settings-ui.ts           # SettingsList interaction and serialized saves
│   ├── target-switch.ts         # Post-switch prompt, policy, and target handoff
│   ├── snapshot-transaction.ts  # Local apply journal, rollback, and recovery
│   └── *.ts                     # Config, policy, snapshot, S3, lock, and format modules
├── test/
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```

## 🔎 Keywords

Pi extension, Pi coding agent, settings sync, Git, GitHub, GitLab, Forgejo, WebDAV, Nextcloud, ownCloud, Synology, Cloudflare R2, S3-compatible storage, multi-profile sync, sync targets, snapshot sync, dotfiles sync.

## 📄 License

MIT
