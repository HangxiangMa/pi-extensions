# pi-sync Git backend implementation plan

## Goal

Implement the approved Git storage design for `@narumitw/pi-sync`: add a lease-protected Git `SyncBackend`, exhaustive version 2 config/state dispatch, destination-oriented setup and management, diagnostics, documentation, and deterministic tests without regressing S3/R2/WebDAV behavior.

## Architecture

- Store one immutable gzip snapshot bundle and one JSON manifest in each publication commit on a pi-sync-owned ref. Map `snapshotRef` and remote `revision` to the publication commit SHA while retaining `snapshotId` as content identity.
- Use a private bare repository cache under the agent directory's `.pisync/git/` tree. Never inspect or mutate the user's working tree or index.
- Build commits with Git plumbing and a private temporary index, then publish with an exact `--force-with-lease=<ref>:<expected>` (including an explicit missing-ref lease). A remote ref update is the commit boundary.
- Execute Git directly with argument arrays, closed stdin, bounded output, fixed timeouts, disabled hooks/pagers/editors/prompts, and process-tree cancellation. Accept only HTTPS and SSH remotes in production; permit local paths only through a test-only constructor option.
- Keep orchestration backend-neutral. Add exhaustive Git cases to config normalization, destination identity/state paths, factory selection, setup/management, display, and tests while preserving exact S3/WebDAV state-path formulas.

## Non-Goals

- Syncing arbitrary user repositories, using the current working tree, rewriting shared history, copying backend-native history during migration, storing Git credentials, or supporting `file`, `git`, `ext`, or arbitrary remote-helper transports in production.

## Risks

- A push process can lose its response after the ref updates; reconcile the remote SHA against the candidate and otherwise report an unknown outcome.
- User Git/SSH credential helpers and SSH configuration are trusted external authentication mechanisms, not sandboxed extension code. Automatic execution must still suppress interactive prompts and repository hooks.
- Adding a third backend can silently enter existing binary fallback branches; exhaustive tests must cover config, state, factory, and UI dispatch.
- Cache identity changes can strand state; retain existing S3/WebDAV formulas exactly and give Git a new backend-scoped formula.

## Rollback / Recovery

- Git cache corruption is recovered by removing only the private bare cache and rebuilding it from the remote; canonical pi-sync settings, local sync state, backups, and remote refs remain untouched.
- A failed pre-push operation leaves the remote unchanged. A failed post-push operation is reconciled by ref SHA or reported outcome-unknown; users run `/sync status` or `/sync doctor` before retrying.
- Removing a Git target/profile deletes local configuration only and never deletes the remote repository or owned ref.

## Plan

- [x] Add and approve `docs/adr/pi-sync-git-backend.md` with representation, schema, identity, publication, authentication/process, cache, history, cancellation, and session-retention decisions; verified every updated #272 decision is resolved in the accepted ADR.
- [x] Add failing config/factory/state tests for valid Git profiles/targets, incompatible fields, URL/ref/path validation, secret-free destination identity, and duplicate destinations; `npm test -- --test-name-pattern='Git config'` failed first because Git was absent from the config union/normalization.
- [x] Implement exhaustive Git types, normalization, validation, remote identity, state paths, and backend factory selection while retaining explicit S3/WebDAV formulas; focused config/state tests passed within the 1,636-test compiled run.
- [x] Add failing Git process/backend contract tests for bootstrap, reads, repeated-content history, exact leases, unrelated refs, prompt/hook suppression, timeout/cancellation, corrupt/symlink cache handling, outcome reconciliation, and redaction; the initial focused run timed out because the new runner had not closed child stdin.
- [x] Implement the bounded non-interactive Git runner and bare-cache `GitSyncBackend`; shared contract, complete Git route integration, lease/missing-ref concurrency, fetched-ref race handling, shared-cache serialization, fresh-cache historical reads, repeated-content history, corruption recovery, hook suppression, runner cancellation/output bounds, committed-response reconciliation, and outcome-unknown tests pass.
- [x] Add Git to destination setup, saved connections, target editing, manager/status/help/doctor, config rendering, and completion paths without exposing credentials or adding commands; focused setup/cancellation/config-route tests pass, target switch/display dispatch is explicit, and all source files remain at or below 1,000 lines after cohesive Git/WebDAV config extraction.
- [x] Update README/package metadata with Git setup, authentication trust, owned-ref rules, consistency/history/cache/session risks, backend comparison, and manual migration/recovery guidance; package metadata and documented commands match runtime behavior.
- [x] Audit asynchronous lifecycle and settings behavior against `docs/extension-conventions.md` and `docs/extension-settings.md`: runner/UI cancellation, process-tree cleanup, post-commit reconciliation, session replacement/shutdown signal ownership, stale post-await UI continuations, serialized atomic settings writes, malformed-file protection, unknown-field-preserving edits, private credentials, and rendered/error redaction are covered by focused plus existing generic tests. Accepted external limit: no live GitHub/GitLab/Forgejo account; standard Git behavior is represented by local bare repositories.
- [x] Run `npm run check` (Biome, boundaries, all workspace typechecks, 1,667 tests), `just pack-sync` (41 expected package files), inspect the dry-run manifest, run `npm audit --omit=dev` (zero production vulnerabilities), and run an isolated offline RPC Pi load smoke returning successful `get_state` and sync lifecycle status.

## Completion Checklist

- [x] Git passes the shared backend contract and capability-specific deterministic suite.
- [x] Two independent Git clients cannot silently overwrite each other, and post-push ambiguity is reconciled or reported outcome-unknown rather than clean cancellation.
- [x] Existing routes and manager flows work for Git while S3/R2/WebDAV settings, state paths, remote behavior, and tests remain compatible.
- [x] Hooks, editors, pagers, terminal prompts/askpass, credential-bearing URLs, unsafe transports, inherited Git control variables, and secret-bearing output are rejected or suppressed.
- [x] Documentation covers all three backends, manual migration, recovery, and session-history retention.
- [x] Full repository gate, package dry run, manifest inspection, production audit, and Pi load smoke pass.
- [x] The completed plan is archived under `docs/plans/archived/`.
