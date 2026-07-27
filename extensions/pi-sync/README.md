# ☁️ pi-sync — Git/WebDAV/R2/S3 Pi Settings Sync

[![npm](https://img.shields.io/npm/v/@narumitw/pi-sync)](https://www.npmjs.com/package/@narumitw/pi-sync) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@narumitw/pi-sync` syncs selected Pi content through Git, WebDAV, Cloudflare R2, or other S3-compatible storage. A reusable **storage connection** holds access configuration. A named **sync setup** selects one connection, one exact remote storage path, included content, and automatic-sync behavior.

## ✨ Features

- A goal-oriented `/sync` manager with symmetric **Sync setups** and **Storage connections** list/detail flows.
- S3-compatible storage, a Cloudflare R2 setup preset, Git, and WebDAV.
- Immutable snapshots, secret scanning, local locks, conflict checks, pull backups, transactional apply, and recovery journals.
- Exact reviewed storage paths that do not change when a local sync setup is renamed.
- One ordered `sync.include` list for Pi roots, safe agent-relative paths, and the privacy-sensitive `sessions` root.
- Atomic private settings writes that preserve unknown fields and reject stale concurrent edits.
- Fail-closed validation for missing references, mixed backend fields, duplicate remote locations, unsafe paths, malformed credentials, and credential-bearing Git URLs.

## 📦 Install

```bash
pi install npm:@narumitw/pi-sync
```

Try without installing permanently:

```bash
pi -e npm:@narumitw/pi-sync
```

Try a local checkout:

```bash
pi -e ./extensions/pi-sync
```

## 🚀 Quick start

Run:

```text
/sync
```

Choose **Set up sync**, then review the storage connection, exact storage path, included content, automatic-sync choice, and masked credentials before saving. Buckets and remote repositories must already exist. Git uses the user's existing non-interactive SSH or credential-helper configuration and never stores Git credentials.

The manager shows local state without contacting remote storage:

```text
Current sync setup: home
Storage: Cloudflare R2 · r2 · personal-pi
Included: 5 built-in groups · 0 extra files · Sessions off
Automatic sync: On
Remote status: Not checked
```

Primary actions include **Sync now**, **Switch sync setup**, **Status & changes**, **Settings**, and **More…**. Secondary screens provide **Back**; Escape closes the flow. Destructive and externally visible operations show exact previews and confirmations.

## ⚙️ Settings

The canonical private user file is:

```text
~/.pi/agent/pi-sync.json
```

Pi's configured agent directory replaces `~/.pi/agent` when applicable. On POSIX, pi-sync creates and replaces this file with mode `0600`. Credentials stay in this canonical private file and are never shown in menus, reviews, status, notifications, errors, logs, or completion metadata.

An existing private `pi-sync.local.json` containing a valid version 3 document is copied byte-for-byte to `pi-sync.json`; the old file remains as a recovery copy. If both paths exist, `pi-sync.json` wins and the other path remains untouched.

### Complete version 3 example

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
        "accessKeyId": "<access-key-id>",
        "secretAccessKey": "<secret-access-key>"
      }
    },
    "github": {
      "type": "git",
      "remote": "git@github.com:owner/private-pi-sync.git"
    },
    "nextcloud": {
      "type": "webdav",
      "url": "https://cloud.example.com/remote.php/dav/files/user",
      "credentials": {
        "username": "user",
        "password": "<app-password>"
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

Cloudflare R2 is persisted as `"type": "s3"`; R2 is a setup preset, not another schema type. Temporary S3 credentials may additionally include `credentials.sessionToken`.

### Required backend shapes

- **S3/R2 connection:** `type`, `endpoint`, `region`, and `credentials.accessKeyId` / `credentials.secretAccessKey`.
- **S3/R2 setup storage:** `connection`, `bucket`, and complete relative `path`; `branch` is rejected.
- **Git connection:** `type` and a credential-free SSH or HTTPS `remote`.
- **Git setup storage:** `connection`, `branch`, and complete repository `path`; `bucket` is rejected.
- **WebDAV connection:** `type`, HTTPS `url`, and `credentials.username` / `credentials.password`.
- **WebDAV setup storage:** `connection` and complete relative `path`; `bucket` and `branch` are rejected.

Every setup requires `sync.include` and explicit `sync.automatic`. `activeSyncSetup` must reference an own-property setup when any setups exist and must be absent when the setup catalog is empty. A referenced connection cannot be removed. The current setup must be switched before removal. Two setups cannot resolve to the same normalized backend location.

`onSwitch` accepts:

- `ask-before-pull` — switch, then ask in TUI whether to start a reviewed pull;
- `pull-after-switch` — require observable UI and start the normal reviewed pull;
- `switch-only` — switch without reading or applying remote content.

### Included content

`sync.include` is ordered and duplicate-free. Supported Pi roots are:

```text
settings.json, keybindings.json, models.json, AGENTS.md, APPEND_SYSTEM.md,
skills, prompts, themes, extensions, sessions
```

Safe agent-relative custom files or directories may also be included. Absolute paths, `..`, backslashes, controls, denied secret/settings paths, duplicate case variants, and ambiguous nested paths under reserved roots are rejected.

An empty array is valid. It means no useful transfer is selected: **Sync now** reports the condition and does not claim that the setup is up to date. Unselected content remains unmanaged locally and is preserved when republishing existing remote snapshots.

Adding `sessions` requires a privacy acknowledgement in interactive flows. Session JSONL can contain prompts, tool output, file paths, images, and secrets. Automatic apply protects the currently open session file; restart Pi or resume a pulled session to use newly synchronized conversations.

### Unsupported old settings and recovery

Version 1, version 2, and non-empty unversioned documents are intentionally unsupported by this breaking schema reset. pi-sync does **not** migrate, partially interpret, downgrade, or overwrite them. Automatic sync pauses and reports an actionable version 3 error without displaying secrets.

Recovery:

1. retain the old file byte-for-byte;
2. move it aside manually;
3. create a new version 3 document or run the setup manager;
4. run `/sync doctor`, inspect the exact storage path, and review the first pull or push;
5. restore the retained file and a compatible older package only if rolling back.

Malformed, invalid, unsupported, symlinked, or concurrently changed documents remain untouched. Failed UI saves keep the previous file and displayed/effective state.

## 💬 Commands

The menu is preferred, while deterministic routes remain available:

```text
/sync help
/sync use <setup>
/sync init
/sync config [--setup <name>]
/sync files [--setup <name>]
/sync status [--setup <name>]
/sync diff [--setup <name>]
/sync doctor [--setup <name>]
/sync push [--setup <name>]
/sync pull [--setup <name>]
/sync sync [--setup <name>]
/sync history [--setup <name>]
/sync rollback <snapshot-id> [--setup <name>]
/sync unlock --stale
```

- `--setup <name>` addresses a setup without switching it.
- `--yes` / `-y` skips a direct route's confirmation.
- `--force` accepts a reviewed content conflict but never disables backend concurrency protection.
- `--stale` requests guarded stale-lock recovery.

The former version 2 setup-addressing flag is rejected. Unknown flags, unknown commands, trailing values, and missing setup/snapshot values are rejected. Completion includes known setup names and preserves preceding command tokens.

TUI mode provides custom components. RPC uses Pi's supported dialog/notification protocol. Print and JSON modes never enter TUI-only screens; unsupported interactive routes reject or remain protocol-safe rather than relying on no-op output.

## 🔄 Backend and recovery model

| Backend | Publication guarantee | Authentication | Remote path |
| --- | --- | --- | --- |
| Git | Exact expected-ref lease | Existing SSH/configured credential helper | `<branch>:<storage.path>` |
| WebDAV | Verified strong conditional requests | Private settings username/app password | `<url>/<storage.path>` |
| R2/S3 | Read-check-write-verify | Private settings credentials | `<bucket>/<storage.path>` |

Git requires Git 2.30 or newer and a SHA-1-format remote repository. HTTPS userinfo, URL passwords, local paths, `file`, `git`, `ext`, and remote-helper transports are rejected. When editing a Git setup, changing its storage path also requires a new owned branch so the existing branch remains readable at its reviewed path. The private bare cache under `.pisync/git/` is rebuildable.

WebDAV requires HTTPS except loopback tests. URL credentials, query strings, fragments, unsafe redirects, weak/missing ETags, and ignored conditional headers fail closed. `/sync doctor` verifies collection and conditional-write behavior with an isolated probe.

S3/R2 stages immutable bundles, rechecks the visible head before publication, and verifies afterward. Unlike Git/WebDAV, generic S3 does not provide an atomic compare-and-swap for `latest.json`; status review remains important for simultaneous writers.

Before pull or rollback, pi-sync writes a backup under `.pisync/backups/`. Apply preflights paths and checksums, journals all mutations, restores the prior state after failures, and recovers interrupted journals on startup. Removing a local setup or connection never deletes remote data.

## 🛡️ Safety notes

- Canonical, legacy, temporary, and recovery settings paths are denied from snapshots.
- Push scans managed local content for common secret patterns.
- Remote snapshot references, checksums, paths, manifests, response sizes, and publication revisions are validated.
- Symlink parents, path escapes, duplicate paths, and unsafe file/directory replacement fail before local mutation.
- Live locks block mutation; stale recovery rechecks process and guard ownership.
- Cancellation aborts preparation and dialogs. Publication/apply commit boundaries finish with bounded signals and report ambiguous outcomes explicitly.
- Terminal-bound names, paths, metadata, and errors are control-character sanitized.

## ♿ Conditional terminal accessibility smoke

Pi exposes terminal components rather than a semantic/ARIA tree. Release validation checks textual state, keyboard operation, Escape/Back, control escaping, and narrow rendering. Critical meaning appears in text such as `(current)`, `Warning`, `Invalid`, `Saved`, `Cancelled`, and `Applied`; color is supplementary.

## 🗂️ Package layout

```text
extensions/pi-sync/
├── src/
│   ├── index.ts
│   ├── sync.ts
│   ├── config.ts
│   ├── config-file.ts
│   ├── settings-management.ts
│   ├── manager-ui.ts
│   ├── storage-connections-ui.ts
│   ├── sync-setups-ui.ts
│   ├── file-selection.ts
│   ├── sync-operations.ts
│   ├── sync-backend.ts
│   ├── s3-backend.ts
│   ├── webdav-backend.ts
│   ├── git-backend.ts
│   ├── snapshot.ts
│   └── *.ts
├── test/
├── README.md
├── LICENSE
└── package.json
```

## 🔎 Keywords

Pi extension, Pi coding agent, settings sync, Git, WebDAV, Nextcloud, Cloudflare R2, S3-compatible storage, storage connections, sync setups, snapshot sync, dotfiles sync.

## 📄 License

MIT
