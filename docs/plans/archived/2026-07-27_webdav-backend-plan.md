# WebDAV Backend Plan

## Goal

Add a vendor-neutral WebDAV backend to `@narumitw/pi-sync` that fits version 2 storage profiles and named targets, preserves the existing immutable snapshot/pointer model and backend-neutral sync orchestration, uses verified atomic HTTP preconditions for publication, and integrates with every existing `/sync` menu and direct route without regressing S3/R2 behavior.

## Context

- GitHub issue [#271](https://github.com/narumiruna/pi-extensions/issues/271) depends on the completed backend-contract work in [#270](https://github.com/narumiruna/pi-extensions/issues/270).
- `extensions/pi-sync/src/sync-backend.ts`, `s3-backend.ts`, and `backend-factory.ts` now isolate storage from orchestration. `status`, `diff`, `push`, `pull`, `sync`, `history`, `rollback`, and `doctor` already operate through `SyncBackend`.
- Version 2 settings currently accept only `r2` and `s3-compatible` profiles and S3-shaped targets. Legacy flat settings and deprecated `PI_SYNC_*`/AWS/R2 variables must remain S3-only compatibility paths.
- The current remote wire layout is `<root>/profiles/<namespace>/{latest.json,history.json,snapshots/*.json.gz}`. Reusing it keeps snapshot validation, history behavior, rollback-as-new-publication, and unmanaged-file preservation backend-neutral.
- `manager-ui.ts` is already 996 lines, so WebDAV setup/management work must be extracted along a clear responsibility boundary rather than extending that file beyond the repository threshold.
- Applicable guides read before planning: `docs/extension-conventions.md` and `docs/extension-settings.md`.

## Architecture

- Add a discriminated `webdav` profile with `url`, `username`, and `password`, paired only with a WebDAV target destination containing `path` and `namespace`. Reject S3-only fields on WebDAV objects and WebDAV-only fields on S3 objects instead of silently ignoring them.
- Resolve settings into `ResolvedS3Backend | ResolvedWebDavBackend`; select the implementation in `backend-factory.ts`. Legacy flat settings and compatibility environment overrides continue resolving only to S3.
- Map a WebDAV target to `<url>/<path>/profiles/<namespace>/`. Store `latest.json`, `history.json`, and immutable gzip bundles under the same relative layout used by S3.
- Implement a bounded WebDAV transport over `fetch` for `GET`, `PUT`, `MKCOL`, `PROPFIND`, and probe cleanup with `DELETE`. Encode path segments, parse namespace-tolerant multistatus XML with a small runtime XML dependency, combine caller cancellation with request timeouts, cap all response/error bodies, and manually follow only a bounded number of same-origin redirects. Never forward authentication across origins.
- Use HTTP Basic authentication only over HTTPS, except loopback HTTP used by deterministic tests. Reject embedded URL credentials and redact usernames, passwords, authorization data, and URL query/fragment data from identities, destinations, diagnostics, and errors.
- Stage snapshot bundles immutably with `If-None-Match: *`; if the resource already exists, read it back and require identical encoded content. Publish `latest.json` with `If-None-Match: *` for a missing head or `If-Match: <strong-etag>` for an observed head. Carry the raw strong ETag inside a versioned, backend-scoped opaque revision so a fresh backend instance can enforce the condition without confusing snapshot IDs, references, and revisions.
- Treat successful WebDAV publication as `atomic-conditional` only after a private probe proves the server rejects stale `If-Match` and existing-resource `If-None-Match` writes. Cache the result only for the backend instance and revalidate before publication. If conditions or strong ETags are unavailable, keep reads available but fail publication before the active-head commit with an actionable error; do not silently fall back to weak automatic writes. `doctor` reports this read-only degradation explicitly.
- Keep the existing commit boundary: user cancellation can stop collection preparation, probing, and immutable staging; immediately before the conditional `latest.json` PUT call `onCommit`, then use an internal bounded signal to verify the committed head or return a conflict/outcome-unknown error accurately.
- Preserve backend-neutral orchestration. Only configuration, backend construction, storage descriptions, diagnostics, and setup/management UI branch by backend kind.

## Non-Goals

- Supporting WebDAV `LOCK`/`UNLOCK`, digest authentication, client certificates, OAuth, or vendor SDKs.
- Adding WebDAV-specific environment variables or placing credentials in project settings.
- Changing the snapshot schema, local apply transaction, policy/secret scanning, session opt-in, force semantics, or existing S3/R2 remote layout.
- Migrating legacy flat settings to WebDAV automatically or deleting remote WebDAV content when a local target/profile is removed.

## Assumptions

- A standards-compliant server that supports strong ETags and honors `If-Match`/`If-None-Match` can provide the required atomic active-pointer publication.
- Basic authentication covers the generic, Nextcloud, ownCloud, and Synology setup targeted by this issue; unsupported authentication schemes fail with actionable diagnostics.
- `fast-xml-parser` (or an equivalently bounded, entity-safe parser selected during implementation) is acceptable as the package's only new runtime dependency for `207 Multi-Status` responses.

## Risks

- WebDAV implementations vary in redirect, collection, ETag, and precondition behavior. A configurable local HTTP mock must model supported, ignored, and rejected conditional requests rather than testing only a happy path.
- A transport error after the conditional pointer PUT can leave publication outcome unknown. Post-commit reads must use an independent timeout and must not report clean cancellation.
- Probe files can remain after crashes or cleanup failures. Use unpredictable names inside a dedicated probe collection, never overwrite existing resources, attempt cleanup in `finally`, and report exact redacted cleanup guidance.
- Backend-aware state identity changes can strand existing S3 state. Preserve the exact current S3 state-path input tuple and add regression fixtures before adding the WebDAV tuple.
- Setup UI changes can regress non-TUI commands or settings write safety. Keep network probes out of settings writes, preserve unknown fields/private permissions, and test TUI and non-TUI routes separately.

## Plan

- [x] Extend `extensions/pi-sync/src/types.ts`, `config.ts`, and `settings-management.ts` with discriminated S3/WebDAV profile-target pairs, strict incompatible-field validation, WebDAV URL/path/namespace normalization, S3-only legacy/environment compatibility, and a WebDAV-specific state identity while preserving existing S3 state paths; verify with expanded `backend-config.test.ts`, `multi-profile.test.ts`, `config-filename.test.ts`, and `sync-state-revision.test.ts` cases covering valid/malformed profiles, secret preservation, unknown fields, duplicate destinations, and byte-for-byte S3 path regressions.
- [x] Add `fast-xml-parser` as a runtime dependency and implement `extensions/pi-sync/src/webdav-client.ts` with bounded `GET`/`PUT`/`MKCOL`/`PROPFIND`/`DELETE`, recursive collection preparation, safe URL construction, Basic-auth/TLS policy, combined timeout/cancellation signals, same-origin-only redirect handling, namespace-tolerant XML parsing, and centralized redaction; verify with a new `webdav-client.test.ts` using a local mock server for authentication, redirects, malformed/oversized responses, timeout, cancellation, status mapping, path encoding, and secret-free errors.
- [x] Add a reusable configurable local WebDAV server fixture under `extensions/pi-sync/test/` that records requests and can emulate strong/weak/missing ETags, honored/ignored preconditions, permissions, redirects, delayed/interrupted bodies, malformed multistatus XML, and cleanup failures; verify the fixture itself with focused assertions that each mode produces the intended HTTP exchange and always closes its listener during teardown.
- [x] Implement `extensions/pi-sync/src/webdav-backend.ts` against `SyncBackend`, retaining the shared pointer/history/snapshot codec, immutable bundle staging, backend-scoped opaque ETag revisions, atomic conditional publication, post-commit verification, bounded history updates, and typed conflict/outcome-unknown errors; register it in `backend-factory.ts` and verify it with the shared `backend-contract-suite.ts` plus new `webdav-backend-contract.test.ts` and `webdav-backend.test.ts` cases for fresh/existing publication, stale writers, snapshot identity/checksum validation, rollback-as-new-publication, history repair warnings, cancellation on both sides of commit, and fresh-instance revision reuse.
- [x] Implement WebDAV capability and `doctor` probes in `webdav-backend.ts` using isolated conditional writes and reliable `finally` cleanup, with structured results for URL/TLS/auth, collection access, read/write, strong ETags, stale `If-Match`, existing-resource `If-None-Match`, and cleanup; verify supported servers report `atomic-conditional`, unsupported/ignored conditions reject publication before `latest.json` changes, and authentication/permission/missing-collection/precondition/cleanup failures remain actionable and redacted in `webdav-backend.test.ts` and `backend-orchestration.test.ts`.
- [x] Audit `sync-operations.ts` and `sync.ts` for the dynamic WebDAV probe and commit lifecycle while keeping operation decisions backend-neutral; ensure automatic sync fails closed before any active-head write on unsupported servers, `--force` re-reads and retains `If-Match`, and session replacement/shutdown cancels pre-commit requests but not post-commit verification; verify with `backend-orchestration.test.ts`, `backend-lifecycle.test.ts`, and route coverage for `status`, `diff`, `push`, `pull`, `sync`, `history`, `rollback`, and `doctor` against a WebDAV target.
- [x] Extract backend-specific setup and storage-profile management from `manager-ui.ts` into a cohesive module, then add WebDAV choices and fields to first-time setup, profile add/edit/remove, target add/edit/switch, Settings, Status, and Help without ever requesting an unmasked password; verify `manager-ui.ts` remains below 1,000 lines and `sync.test.ts`/`multi-profile.test.ts` cover WebDAV menu state, safe manual credential guidance, persistence rollback, target completion/switching, cancellation, narrow rendering, and print/JSON/RPC rejection or direct-route behavior.
- [x] Update `extensions/pi-sync/README.md` and `package.json` to advertise R2/S3/WebDAV accurately, document the version 2 schema, generic and Nextcloud/Synology URL examples, local-only credential handling, TLS/auth and redirect rules, conditional-publication/read-only degradation, doctor probes/cleanup, unchanged wire model, session sensitivity, and package layout; verify documented commands and manifest metadata match implementation and `npm run pack:sync` includes only the declared source, README, and license plus the required runtime dependency metadata.
- [x] Run the semantic lifecycle/settings audit required by `docs/extension-conventions.md` and `docs/extension-settings.md` across cancellation, disposal, session replacement, shutdown, settings ordering/failure recovery, malformed-file protection, unknown-field preservation, atomic private writes, and secret redaction; verify every applicable MUST has a named test/review/smoke result and record any accepted deviation directly in this plan before completion.

## Completion Checklist

- [x] The WebDAV backend passes the shared contract suite and local capability matrix, including stale conditional writes failing as typed conflicts without overwriting the current head.
- [x] All existing manager/direct routes and automatic lifecycle paths work with a WebDAV target, while unsupported conditional servers remain read-only and visibly diagnosed.
- [x] S3/R2 settings, environment compatibility, state paths, backend behavior, and regression tests remain unchanged.
- [x] Authentication, permissions, missing collections, redirects, timeouts, malformed/oversized bodies, interrupted publication, and probe cleanup failures have deterministic redacted test coverage.
- [x] `npm run check` passes from the repository root.
- [x] `npm run pack:sync` passes and the dry-run contents/dependency metadata are inspected.
- [x] The final handoff names the guides read, touched areas audited, checks/smokes run, and any accepted deviation or unverified external-vendor path.

## Execution Evidence

- Settings/backend integration: `webdav-config.test.ts` covers discriminated resolution, S3-only environment compatibility, mixed-field rejection, HTTPS policy, and backend-scoped state; the existing S3/R2 suites retained their state-path and behavior coverage.
- Transport and capability safety: `webdav-client.test.ts` and `webdav-backend.test.ts` cover authentication, encoded paths, collection listing, redirects, body bounds, timeouts, cancellation, malformed XML, strong/weak/missing ETags, ignored preconditions, outcome-unknown publication, cleanup, and redaction.
- Contract and routes: `webdav-backend-contract.test.ts` passes the shared backend contract; `webdav-routes.test.ts` exercises doctor, status, diff, push, pull, sync, history, and rollback against the local WebDAV server.
- UI/settings: `webdav-ui.test.ts` covers first-time setup plus profile/target add and edit, hidden credentials, and unknown-field preservation. `manager-ui.ts` is 995 lines after extracting shared and WebDAV-specific responsibilities.
- Lifecycle/settings audit: WebDAV requests use caller cancellation before the active-head boundary, an independent bounded post-commit signal afterward, bounded cleanup, and existing session replacement/shutdown orchestration. Settings continue through the existing serialized, locked, atomic `0600`, unknown-field-preserving protocol; WebDAV adds no environment-variable or project-secret path.
- Verification: `npm run check` passed initially with 1,603 tests, Biome, boundary checks, and all workspace typechecks; the final post-review gate is recorded below. `npm run pack:sync -- --json` passed with 32 expected package entries and included the new source modules plus runtime dependency metadata. `npm audit --omit=dev --json` reported zero production vulnerabilities.
- Accepted external verification limit: no live Nextcloud, ownCloud, or Synology account was used. The issue explicitly requires account-free tests; interoperability is represented by the configurable local HTTP/WebDAV protocol fixture and generic wire behavior, with vendor-specific setup documented for user validation.
- Independent review follow-up: fixed every reported class—S3-only environment compatibility, bounded/control-free metadata, alias destination detection, ambiguous redirect rejection, per-publication capability revalidation, pre-save UI normalization, exact password-byte preservation, WebDAV-aware `/sync config`, and WebDAV lifecycle/commit-boundary coverage.
- Final verification after review fixes: `npm run check` passed with 1,613 tests; `npm run pack:sync -- --json` was rerun and inspected.
