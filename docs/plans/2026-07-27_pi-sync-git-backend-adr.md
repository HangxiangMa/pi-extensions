# ADR: pi-sync Git backend

## Status

Accepted for implementation on 2026-07-27.

## Context

pi-sync already separates immutable snapshot creation and safe local apply from remote persistence through `SyncBackend`. S3/R2 publishes a managed pointer with weak read-check-write-verify consistency; WebDAV publishes the pointer conditionally. Git must fit the same contract while retaining native commit history and exact ref-update leases, without touching a user's working tree.

## Decision

### Repository representation

Each publication is one commit on one pi-sync-owned branch. Its tree contains exactly two regular files below the target directory and namespace:

```text
<directory>/profiles/<namespace>/
├── manifest.json
└── snapshot.json.gz
```

The gzip file uses the existing snapshot codec. `manifest.json` records format version, snapshot id, encoded bundle SHA-256, creation time, machine, and session inclusion. A readable Pi file tree was rejected because it would duplicate snapshot validation, policy, unmanaged-file, and session handling and would create a second wire representation.

Contract mapping:

- `snapshotId` is the snapshot content identity embedded in the validated bundle.
- `snapshotRef` is the publication commit SHA, so repeated publication of identical content remains independently addressable.
- `revision` is a backend-scoped opaque encoding of the same owned-ref tip SHA. Only the Git backend decodes or compares it.
- `listHistory` walks first-parent commits on the owned ref and returns each valid publication in oldest-first order. `readSnapshot` accepts only a full commit SHA returned by this backend and validates both manifest and bundle.

Rollback reads a historical commit, applies current local policy through existing orchestration, regenerates snapshot identity, and creates a new child commit. It never resets or rewrites history.

### Version 2 settings

A reusable storage profile owns the remote and authentication trust boundary:

```json
{
  "kind": "git",
  "remote": "git@github.com:owner/private-pi-sync.git"
}
```

A target owns destination addressing:

```json
{
  "profile": "github",
  "branch": "pi-sync/home",
  "directory": "pi-sync",
  "namespace": "home"
}
```

`branch` is stored without `refs/heads/`; full refs, ref traversal, control characters, option-like values, and ambiguous names are rejected. `directory` and `namespace` are normalized relative POSIX paths/segments with no empty, dot, dot-dot, `.git`, or control-character components.

Git has no flat-settings or environment-variable compatibility mode. Existing deprecated `PI_SYNC_*`, AWS, and R2 variables remain S3-only.

The backend identity hashes canonical secret-free remote identity plus branch, directory, and namespace. One effective remote repository/branch pair is reserved for exactly one pi-sync target because each publication owns the branch tree; settings reject a second target on the same branch even when its directory or namespace differs. Remote URLs with userinfo passwords/tokens are rejected. SSH usernames are addressing data, not credentials. Duplicate effective Git destinations are rejected. Git gets a new target-state hash tuple; existing S3 and WebDAV tuples remain byte-for-byte unchanged.

### Cache and filesystem ownership

Each backend identity owns a private bare repository under:

```text
<agent-dir>/.pisync/git/<identity-hash>/repository.git
```

The backend never discovers, opens, or modifies the process cwd's repository, working tree, index, hooks, or config. Cache initialization is idempotent; a partial or malformed bare repository is removed and rebuilt on the next operation. Every Git command supplies `--git-dir` and, for commit construction, a private temporary `GIT_INDEX_FILE`. Cache paths are derived only from the backend identity and remain within `.pisync/git` after resolution.

A missing cache is initialized. A non-bare, symlinked, malformed, or unusable cache is recreated without modifying settings, local sync state, backups, or remote data. The existing pi-sync operation lock serializes publications; an abort-aware in-process queue per cache serializes bare-repository initialization and uniquely named temporary-ref fetches across concurrent read-only backend instances. Temporary refs are deleted after each fetch, and automatic Git maintenance is disabled so fetched history remains readable without accumulating cross-process ref conflicts.

### Bootstrap and ownership

The remote repository must already exist, but the owned branch may be absent. Missing-branch publication uses an exact missing-ref lease. An existing non-empty repository is accepted because pi-sync owns only its configured branch. An existing owned branch is accepted only when its tip contains a valid manifest/bundle at the configured path; malformed or unrelated history fails closed with recovery guidance. Other refs are never fetched into or modified by publication except as required by remote negotiation.

### Publication and consistency

Before preparing a commit, the backend fetches the owned ref and compares it with the explicit expected revision. The fetched remote-tracking ref—not the earlier discovery response—is authoritative if the branch advances between discovery and fetch. The candidate commit uses the expected tip as its first parent, or no parent for a missing ref. Publication executes an exact lease-protected push:

```text
git push --porcelain --force-with-lease=<ref>:<expected-sha> origin <candidate>:<ref>
```

A missing expectation uses an empty expected value. Plain `--force`, wildcard refspecs, deletion refspecs, and lease-free pushes are forbidden. The backend advertises `lease-protected`.

The remote ref update is the commit boundary. `onCommit` runs immediately before push. User cancellation remains authoritative before that point. Push and reconciliation use an independent bounded completion signal. On push failure or lost response, the backend queries the remote ref:

- candidate SHA is current: publication committed and returns success;
- another SHA is current: typed conflict, with candidate possibly having been active;
- remote state cannot be established: `SyncBackendPublicationOutcomeUnknownError`.

### Authentication and process trust

Production accepts:

- `https://host/path.git` without URL userinfo, query, or fragment;
- `ssh://[user@]host/path.git`;
- scp-like `[user@]host:path.git` with conservative host/path validation.

`file`, local paths, `git`, `ext`, and arbitrary helper schemes are rejected. Local filesystem remotes are enabled only by an explicit test-only constructor option.

Git 2.30 or newer is required. The initial implementation supports the SHA-1 object format used by GitHub, GitLab, Forgejo, and typical self-hosted repositories; a 64-hex SHA-256 ref is rejected with an explicit diagnostic rather than being misinterpreted. SHA-256 interoperability can be added only after Git supports reliable cross-format fetch/push for this cache model.

Git is invoked directly with argument arrays. It removes inherited `GIT_*` control variables before setting its owned environment, then sets or overrides:

- `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=Never`;
- `GIT_PAGER=cat`, `PAGER=cat`, `GIT_EDITOR=true`, `EDITOR=true`, `VISUAL=true`;
- empty `GIT_ASKPASS` and `SSH_ASKPASS` values plus `SSH_ASKPASS_REQUIRE=never`, so no GUI or terminal askpass helper can run;
- `GIT_SSH_COMMAND=ssh -oBatchMode=yes` unless an approved test override is injected;
- `LC_ALL=C` and `GIT_CONFIG_NOSYSTEM=1`;
- command config `core.hooksPath` to a nonexistent private path and protocol policy that permits only the validated transport.

stdin is closed, stdout/stderr are bounded, each command has a timeout, and cancellation terminates the owned process tree. User global Git config and SSH config/agent remain trusted authentication inputs where Git/SSH still consult them; credential helpers, SSH `ProxyCommand`, and agent operations are external trusted code, not sandboxed. The extension never stores credentials and documents this boundary.

All errors pass through redaction for remote/userinfo and control characters. Backend `identity`, `destination`, and diagnostics are secret-free by construction.

### Diagnostics

Doctor checks Git availability and the minimum supported version, SHA-1 cache/ref compatibility, cache health, validated transport, non-interactive remote/ref access, owned-ref validity, and `lease-protected` capability. It does not create commits or mutate remote refs. Authentication failures remain actionable but redacted.

### Sessions, growth, and recovery

Session sync remains opt-in. Git history permanently retains prior session content until repository history is deliberately rewritten outside pi-sync; rollback does not erase it. Documentation warns that deleting a local target/cache or pushing a later snapshot does not remove old secrets.

One compressed bundle per publication grows repository history. Users may archive or replace the dedicated repository/ref under their own retention policy; pi-sync does not run automatic history rewriting or garbage collection on remotes. Local cache recovery removes/recreates only the private bare cache and fetches the owned ref again.

## Alternatives rejected

- **Readable file tree:** duplicates policy and validation semantics and increases secret/history surface.
- **One mutable bundle outside commits:** loses native publication history and exact historical addressing.
- **Normal push without exact lease:** cannot protect reviewed force resolution or missing-ref creation races.
- **User working tree:** risks hooks, dirty index/worktree changes, discovery of unrelated repository config, and destructive cleanup.
- **Credentials in settings or remote URL:** conflicts with existing private-output and redaction guarantees.

## Prototype and verification command

The implementation serves as the executable prototype. Focused verification is:

```bash
npm test -- --test-name-pattern='git contract|Git backend|Git config|Git runner|Git setup|Git is available|Git target'
```

Full acceptance additionally requires `npm run check` and `just pack-sync`.

## Accepted risks

- User-approved Git credential helpers and SSH configuration can execute external code; pi-sync documents and does not sandbox these existing authentication mechanisms.
- A remote service can accept a ref update and become unreachable before reconciliation; this is reported as outcome unknown rather than guessed.
- No live GitHub/GitLab/Forgejo account is required by deterministic tests; local bare repositories verify Git protocol/ref semantics, while vendor interoperability depends on standard Git SSH/HTTPS behavior.
