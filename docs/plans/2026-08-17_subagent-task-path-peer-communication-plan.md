# Subagent canonical task path and peer communication plan

## Goal

Add a human-readable canonical task path beside every opaque `agentId`, give every retained agent in one Pi session a shared authenticated peer-to-peer communication layer, and route nested child completions to the direct parent before considering an ancestor or the root session.

## Context

- `AgentRegistry` currently owns hierarchy, mailboxes, persistence callbacks, and completion outboxes atomically in `packages/pi-subagents/src/registry.ts`.
- Every settled turn currently enters the root session's `CompletionDeliveryBroker`, even though nested child output is also copied into the direct parent's mailbox.
- Top-level retained agents currently have separate `rootId` values, so the mailbox rejects communication between them as different trees.
- Child transports disable or restrict extension tools, so retained child models cannot use the root session's `subagent_mailbox` tool directly.
- Pi's public SDK supports `customTools` and inline extension factories for in-process sessions.
- Pi CLI treats explicitly supplied `-e` extensions as enabled even with `--no-extensions`, which permits a package-owned bridge without loading unrelated extensions.
- Existing persisted records and public tool calls use `agentId`, so task paths must be additive and backward compatible.

## Architecture

### Identity

- Keep `agentId` as the durable internal primary key and add a session-scoped `taskName` segment plus canonical `taskPath` alias.
- Reserve `/root` for the owning Pi session and form child paths as `/root/<task_name>` or `<parent taskPath>/<task_name>`.
- Accept lowercase ASCII letters, digits, and underscores in task-name segments, reject `root`, `.`, `..`, slashes, empty segments, collisions, trailing slashes, and over-limit values.
- Let `subagent_spawn.taskName` remain optional for compatibility, but instruct models to provide it and derive a stable fallback from the new `agentId` when omitted or when restoring an older record.
- Resolve an existing opaque `agentId`, an absolute canonical path, or a sender-relative path to one retained record through one registry-owned resolver.
- Reserve task paths only while an agent is retained and not closed, while preserving opaque IDs for historical inspection.

### Communication

- Keep mailbox and completion state inside `AgentRegistry` so persistence ordering remains atomic.
- Add a session-owned communication broker that binds every sender to its authenticated `agentId` and `taskPath`, resolves targets, persists bounded envelopes, and asks the selected transport to inject accepted messages.
- Treat `/root` as a virtual endpoint backed by the root Pi session rather than a synthetic `ManagedAgent` record.
- Permit communication between all retained agents owned by the same registry instead of using structural `rootId` as a communication boundary.
- Expose child-only `subagent_peer_send` and `subagent_peer_list` tools with no caller-supplied sender identity.
- Push messages into active child sessions without starting a new turn, and retain messages for the target's next turn when no live transport session can accept them.
- Reuse message IDs and deduplication keys for at-least-once replay safety.

### Transport bridge

- Use an inline package-owned extension or direct SDK custom tools for the in-process transport.
- Load one explicit package-owned bridge extension for RPC and subprocess children while preserving each transport's existing user-extension policy.
- Connect process children to a root-owned loopback JSONL broker with a random generation-scoped token that binds one agent identity and is never persisted, displayed, or accepted from tool arguments.
- Bound frames, message text, connection counts, and handshake time, reject malformed or unauthenticated frames, and close all sockets, listeners, subscriptions, and pending requests during interruption, release, replacement, and shutdown.
- Have the child bridge acknowledge exact message or completion IDs only after a child `context` hook observes them.

### Completion routing

- Persist the intended completion recipient with each completion outbox item.
- Route a top-level child completion to `/root` through the existing root completion broker.
- Route a nested completion to its direct retained parent as a typed completion envelope without duplicating it into the root transcript.
- If the direct parent is closed or unavailable, walk to the nearest live retained ancestor and use `/root` only when no retained ancestor can own delivery.
- Keep the child's completion outbox pending until the selected recipient's context observes the exact `completionId`.
- Leave an idle retained parent asleep and deliver on its next turn, matching queue-only peer messaging rather than silently starting work.

## Non-Goals

- Do not replace or remove opaque `agentId` values.
- Do not add transcript switching or first-class Pi core child threads.
- Do not make peer messages start idle turns.
- Do not automatically merge worktrees or resolve overlapping shared-workspace edits.
- Do not expose the communication credential, broker socket, or sender override to models.
- Do not add a new user setting in this change.

## Assumptions

- All retained agents created by one `AgentRegistry` belong to one communication namespace.
- Root tools may continue using existing field names such as `agentId`, but those fields will also accept canonical task paths and their descriptions will say so.
- The direct parent's eventual final answer is the normal path by which nested results move upward.
- Root inspection remains able to observe every retained run even when nested completion content is not injected into the root transcript.
- The persistence file stays on its current version and gains validated additive fields so older records remain readable and downgrade behavior is not needlessly broken.

## Unknowns

- Verify with a deterministic child harness that the installed Pi version loads an explicit package-owned `-e` bridge while `--no-extensions` is active in both JSON and RPC modes.
- Verify whether each transport can accept a pushed custom message at every running boundary without triggering a turn, and queue locally when it cannot.
- Verify that child `context` hooks expose injected custom-message details reliably enough for exact-ID acknowledgement after retries and compaction.

## Risks

- A stale process could impersonate an agent if a token survives release, so credentials must be generation-scoped and revoked before transport reuse.
- A broker shutdown race could lose an acknowledgement or strand a socket, so registry persistence, transport disposal, and broker closure need one explicit lifecycle order.
- Parent-first delivery can leave a nested result unread when the parent is never resumed, so inspection and documentation must make pending recipient state visible.
- Task-path collisions during concurrent spawn or restore could make routing ambiguous, so path reservation and restore projection must be atomic and deterministic.
- Message injection before durable persistence could lose work, while acknowledgement before context visibility could lose replay, so both orderings require regression tests.
- Loading a child bridge must not broaden the child's effective file, shell, network, or extension tool authority.

## Rollback / Recovery

- Keep `agentId` accepted everywhere so callers can ignore task paths or roll back model guidance without rewriting retained records.
- Keep new persistence fields additive under the existing state version and derive missing paths on load.
- On broker startup or handshake failure, fail the affected turn observably rather than silently falling back to unauthenticated communication or duplicate execution.
- On parent delivery failure, retain the completion outbox and retry the same `completionId` through the documented ancestor route.
- If a live bridge smoke exposes an unsupported Pi runtime, retain canonical paths and parent routing behind deterministic queued delivery while leaving process-child peer tools disabled with an actionable error.

## Plan

- [x] Add failing path-contract tests in `packages/pi-subagents/test/task-path.test.ts` for validation, parent joining, relative and absolute resolution, concurrent collision rejection, ID compatibility, closed-path reuse, and deterministic legacy fallback; verify the intended red state with `npm test -- packages/pi-subagents/test/task-path.test.ts`.
- [x] Add `packages/pi-subagents/src/task-path.ts` and thread `taskName` and `taskPath` through `ManagedAgent`, spawn, restore, copy, inspection, and hierarchy output; verify the new path tests pass.
- [x] Update `subagent_spawn`, `subagent_send`, `subagent_manage`, `subagent_mailbox`, and `subagent_inspect` target handling so existing `agentId` inputs also resolve canonical paths, spawn accepts optional `taskName`, idempotency hashes include it, and results show both identities; verify with focused stateful registration, inspection, rendering, and idempotency tests.
- [x] Add persistence regression tests for additive task-path fields, legacy records without paths, collision recovery, redaction, unknown-field preservation, and stable restore ordering; verify with `npm test -- packages/pi-subagents/test/registry-persistence.test.ts packages/pi-subagents/test/registry-projection-and-restoration.test.ts`.
- [x] Add failing broker tests in `packages/pi-subagents/test/peer-communication.test.ts` for bound sender identity, all-retained-agent routing, `/root`, relative and absolute targets, deduplication, bounds, persist-before-dispatch, replay, acknowledgement, and rejection after close; verify the intended red state.
- [x] Add a small broker and protocol module under `packages/pi-subagents/src/` while keeping message mutations in `AgentRegistry`, replace the `rootId` cross-tree mailbox restriction with registry ownership, and make the broker pass its focused tests.
- [x] Add failing in-process integration tests for child peer-tool exposure, non-spoofable sender identity, active-target push, idle-target queueing, exact context acknowledgement, cancellation, session disposal, and no authority widening; verify the intended red state in `packages/pi-subagents/test/in-process-transport.test.ts`.
- [x] Extend `create-stateful-transport.ts` and `in-process-transport.ts` with a package-owned child bridge using Pi SDK custom tools or an inline extension, then make the in-process peer tests pass.
- [x] Add failing strict-JSONL bridge tests for authentication, malformed and oversized frames, generation revocation, disconnect replay, handshake timeout, subprocess exit, RPC release, and shutdown cleanup using only test-owned local processes and loopback endpoints.
- [x] Add a package-owned child bridge entrypoint and process transport adapter, pass it explicitly to subprocess and RPC Pi children without enabling unrelated extensions, and make the bridge tests plus existing `runner-launch.test.ts` and `rpc-transport.test.ts` pass.
- [x] Add failing completion-routing tests for top-level-to-root delivery, nested-to-direct-parent delivery, no root duplication, exact-ID parent acknowledgement, idle-parent retention, closed-parent ancestor fallback, restored pending delivery, and simultaneous sibling completions.
- [x] Replace unconditional root completion enqueueing with a recipient-aware router, add recipient metadata to persisted completion records and rendered details, preserve the root broker for `/root`, and make registry and completion-delivery tests pass.
- [x] Audit interrupt, close, subtree close, TTL eviction, worktree cleanup, session replacement, shutdown, retry, compaction, and every bridge-related `await` so no stale generation, session, socket, token, pending request, or completion can publish afterward; add regression coverage beside the owning lifecycle tests.
- [x] Update `packages/pi-subagents/README.md` and package prompt guidance to document path grammar, ID compatibility, peer tools, relative targeting, queue-only delivery, parent-first completion flow, pending-parent inspection, trust boundaries, and rollback behavior.
- [x] Add a minor Changeset for `@narumitw/pi-subagents` because canonical paths, peer communication, and parent-first completion routing add published behavior.
- [x] Run focused tests with `npm test -- packages/pi-subagents/test/task-path.test.ts packages/pi-subagents/test/peer-communication.test.ts packages/pi-subagents/test/registry-hierarchy-and-mailbox.test.ts packages/pi-subagents/test/registry-completion-delivery.test.ts packages/pi-subagents/test/completion-delivery.test.ts packages/pi-subagents/test/registry-persistence.test.ts packages/pi-subagents/test/in-process-transport.test.ts packages/pi-subagents/test/rpc-transport.test.ts packages/pi-subagents/test/runner-launch.test.ts packages/pi-subagents/test/stateful-session-lifecycle.test.ts packages/pi-subagents/test/stateful-tool-registration.test.ts packages/pi-subagents/test/inspect.test.ts packages/pi-subagents/test/tool-rendering.test.ts`.
- [x] Run the CI-equivalent gate with `npm run check`, then run `just pack subagents` and inspect the dry-run contents for the internal bridge entrypoint, README, license, and source files. Evidence: 348 test files and 3,457 tests passed; the pack contained 127 files including every bridge module.
- [x] Run one bounded local Pi smoke for top-level and nested messaging across the configured transports when credentials are available; otherwise record the first external authentication or entitlement failure and rely on deterministic transport harnesses without retrying. Evidence: explicit `-e` bridge loading under `--no-extensions` passed an RPC `get_state` handshake; provider messaging was blocked because Google credentials are not configured, so deterministic transport harnesses are authoritative.
- [x] Re-read `docs/extension-conventions.md`, audit the final diff against its touched-area checklist, and report lifecycle disposal, stale-session checks, atomic persistence ordering, invalid-file protection, unknown-field preservation, output bounds, tool authority, tests, pack evidence, deviations, and unverified paths. Evidence: broker-first shutdown, generation guards, persist-before-dispatch, exact-ID acknowledgement, bounded framing, package authority, restore compatibility, and pack contents were reviewed; live provider messaging remains unverified because credentials are unavailable.

## Completion Checklist

- [x] Every retained agent has a unique canonical `taskPath` and still has a working opaque `agentId`.
- [x] Existing persisted records restore without manual migration or quarantine solely because task paths are absent.
- [x] Root and child tool surfaces resolve IDs and canonical paths without ambiguous routing.
- [x] Any retained agent can send a bounded authenticated queue-only message to any other retained agent in the same session.
- [x] Child peer tools cannot spoof a sender or expand the agent's existing execution authority.
- [x] Nested completions reach the direct parent first, top-level completions reach `/root`, and nested completions are not duplicated into the root transcript.
- [x] Completion and peer-message replay remain at-least-once and exact-ID acknowledgements occur only after recipient context visibility.
- [x] Interruption, close, expiry, replacement, and shutdown leave no owned process, timer, socket, subscription, token, worktree, or pending delivery active.
- [x] Focused tests, `npm run check`, the package dry run, and the bounded runtime smoke or documented external blocker have evidence.
- [x] README guidance and a minor Changeset describe the published behavior and compatibility boundary.
