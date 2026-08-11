# Pi Fleet Unix Socket Hardening Plan

## Goal

Harden Pi Fleet's experimental Unix-socket transport so discovery and shutdown have truthful deadlines, endpoints have unambiguous process-instance identities, stale requests cannot retrigger agent work, filesystem discovery remains bounded, and callers receive structured recovery information.

## Context

The current transport uses one authenticated JSONL request per pathname Unix-socket connection.
This remains a good fit for low-volume local session communication, but sequential discovery, inactivity-only server timeouts, session-only routing, expiring deduplication without message expiry, and unstructured discovery failures create avoidable reliability risks.
Pi Fleet is experimental and unpublished, so this plan may introduce protocol version 2 without a version-1 compatibility layer.

## Architecture

- Keep one request and one response per Unix-socket connection rather than introducing a daemon or persistent multiplexed channels.
- Keep the private `0700` group directory as the portable filesystem access boundary and retain `0600` manifests and sockets as defense in depth.
- Address a process instance by both logical `sessionId` and random `endpointId`, and bind manifest filenames, socket filenames, request targets, response senders, and peer descriptions to that endpoint identity.
- Publish strict HMAC-authenticated manifests containing only discovery metadata, then authenticate live descriptions over the socket.
- Enforce an absolute connection deadline, a bounded discovery deadline, bounded concurrent probes, bounded delivery work, and both global and claimed-sender rate limits.
- Give messages a signed finite lifetime no longer than the deduplication window, and use structured acknowledgement and discovery error codes.
- Treat filesystem watches as an optional future wake hint rather than a correctness dependency.

## Non-Goals

- No TCP, WebSocket, LAN, remote-host, Windows, Linux abstract-socket, central broker, offline mailbox, or persistent connection support.
- No exactly-once delivery guarantee after the documented bounded lifetime.
- No per-peer cryptographic identity beyond possession of the shared bearer invite.
- No new user or project settings.
- No changes to the `session_spawn`, `session_bus`, or `/fleet` user-facing schemas unless required to expose an actionable structured transport result.

## Risks

- Protocol version 2 intentionally rejects version-1 frames and manifests, which is acceptable only while the package remains experimental and unpublished.
- Aggressive orphan cleanup could remove an endpoint between listen and manifest publication, so cleanup must require a conservative age grace period and strict filename, owner, type, and identity checks.
- Parallel discovery can create bursts, so concurrency, total work, and issue collection must remain bounded.
- A timed-out asynchronous delivery callback may ignore cancellation, so the extension-owned callback must revalidate session generation and the transport must stop awaiting it after a bounded deadline.

## Rollback / Recovery

- Reverting the hardening commit restores protocol version 1 because Pi Fleet has no persisted membership or migration.
- Existing group directories contain only ephemeral manifests and sockets, and strict version checks safely ignore incompatible stale records.
- Startup garbage collection removes old orphan temporary files and sockets after the grace period without requiring a persistent migration.

## Plan

- [x] Add failing protocol tests for endpoint-bound version-2 frames, authenticated strict manifests, unknown-field rejection, message expiry boundaries, and structured acknowledgements; implement the shared validators and MAC domains in `packages/pi-fleet/src/protocol.ts`.
- [x] Add failing runtime tests for bounded manifest reads, filename-to-socket binding, old orphan temporary/socket cleanup, and fresh-entry preservation; implement the filesystem primitives in `packages/pi-fleet/src/runtime-directory.ts`, and retain empty group directories because cross-process removal cannot be made race-free without a lock owner.
- [x] Add failing transport tests proving discovery probes concurrently under one overall deadline, returns bounded diagnostics, ignores invalid manifests without consuming the valid-peer quota, and rejects duplicate live session identities; implement bounded streaming discovery and endpoint-instance routing in `packages/pi-fleet/src/transport.ts`.
- [x] Add failing lifecycle tests for absolute slow-client deadlines, bounded in-flight asynchronous deliveries, cancellation propagation, global and per-sender rate limits, structured busy/rate responses, and bounded shutdown; implement connection and delivery backpressure at the socket boundary.
- [x] Update controller, process fixtures, fakes, renderers, and tool tests for endpoint descriptions, message expiry, structured acknowledgements, and the child-readiness remaining deadline without changing the documented user-facing tool schemas.
- [x] Update `packages/pi-fleet/README.md`, the existing Changeset, and the original completed implementation plan with protocol-version, deadline, identity, cleanup, acknowledgement, and residual trust-boundary details.
- [x] Run formatting, focused Pi Fleet tests, package typecheck, boundary checks, pack inspection, local Pi entrypoint load, the opt-in real Ghostty smoke when practical, and the repository CI-equivalent gate; record every pass, failure, deviation, and unverified path.
- [x] Perform a final adversarial diff audit for cancellation, stale sessions after every await, bounded collections and reads, timeout-owned resources, endpoint conflicts, secret redaction, strict wire schemas, cleanup races, mixed versions, and package contents.

## Execution Notes

- Focused result: all 17 Pi Fleet test files and 65 tests pass after rebuilding the compiled process fixtures.
- Deterministic integration result: separate-process discovery and delivery, real-child launch-envelope propagation, deadline-bounded blackhole discovery, endpoint collision preservation, local-session identity conflict detection, slow-client eviction, cancelled asynchronous delivery, orphan cleanup, strict protocol validation, and global and per-sender rate limits pass.
- Package result: package check, all-workspace typecheck, boundary validation, Changesets status, and `just pack fleet` pass; the dry-run tarball contains 18 declared metadata, README, license, and source files including `transport-io.ts`.
- Runtime result: an isolated local Pi entrypoint load passes, and Ghostty 1.3.1 launches a distinct child with the package cwd, accepts notify and kickoff, returns one non-triggering reply, closes only the created terminal, and leaves no endpoint file or child process.
- Repository result: a standalone full test run with an isolated `PI_CODING_AGENT_DIR` passes all 318 files and 3,054 tests.
- CI-equivalent exception: `npm run check` passes Biome, boundaries, and every workspace typecheck, but its concurrent test child retains five timing-sensitive failures in untouched `packages/pi-subagents`; the implicated 18 tests pass together with a canonical temp directory, and the standalone full suite passes, so the red concurrent gate is recorded rather than concealed.
- Local-environment exception: running tests without an isolated `PI_CODING_AGENT_DIR` also loads the maintainer's Pi Subagents user settings and invalidates unrelated default-setting expectations, so clean-environment evidence is authoritative for this package change.
- Settings audit: no user or project setting, settings path, persistence behavior, environment override, or migration is added; launch-envelope behavior remains ephemeral and unchanged.
- Lifecycle audit: server connections have absolute deadlines, delivery callbacks receive cancellation and are no longer awaited after connection or session abort, pending collections remain capped, endpoint cleanup is ownership-gated after successful bind, and empty group directories are deliberately retained to avoid a cross-process remove-versus-start race.
- Trust-boundary audit: strict frame and manifest schemas, separate MAC domains, endpoint-bound targets, signed finite message lifetimes, bounded diagnostics, and structured errors add no invite, group secret, raw frame, or MAC to model-visible output.

## Completion Checklist

- [x] Discovery finishes within its configured overall deadline even when every candidate accepts a socket but never responds, while healthy peers can complete concurrently.
- [x] No slow pre-authentication connection or asynchronous delivery callback can hold a connection slot, pending-task slot, or shutdown indefinitely.
- [x] Frames, manifests, descriptions, requests, and responses bind both session and endpoint identities and reject unknown wire fields.
- [x] Expired messages cannot trigger recipient work after deduplication state expires, and valid retries still deduplicate after a lost acknowledgement.
- [x] Invalid directory entries, duplicate sessions, orphan files, and oversized manifests produce bounded deterministic behavior and actionable non-secret diagnostics.
- [x] Existing Pi Fleet tools, menu, launch flow, reload handoff, cancellation, and real Ghostty child communication remain compatible at the user-facing level.
- [x] Applicable convention and settings audits, focused checks, repository checks, package inspection, runtime smokes, and residual risks have recorded evidence.
