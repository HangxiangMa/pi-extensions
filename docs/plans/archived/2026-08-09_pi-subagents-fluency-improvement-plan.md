# Pi Subagents Fluency Improvement Plan

## Goal

Make `pi-subagents` feel faster, easier to control, and easier to diagnose without weakening its trust, cancellation, persistence, or process-cleanup guarantees.

Add an opt-in persistent RPC transport, deterministic automatic transport selection, previewable execution profiles, bounded performance diagnostics, spawn idempotency, context-size guidance, and an opt-in structured completion contract.

Keep existing subprocess, in-process, tool, state, completion-delivery, and settings behavior compatible unless the user explicitly selects a new option.

## Context

- Stateful execution currently supports a fresh `subprocess` turn or one retained `in-process` `AgentSession` per `agentId`.
- Fresh subprocess turns preserve process isolation but repeatedly pay Pi startup and logical-history reconstruction costs.
- In-process turns preserve native child history and reduce startup cost but share the parent process and reject extension or custom tools.
- Pi exposes a persistent JSONL RPC mode with correlated commands, streamed events, `abort`, state and usage inspection, and `agent_settled` as the true idle boundary.
- Pi exports RPC types and `RpcClient` from its root package, but the stock client does not satisfy this package's exact CLI resolution, bounded stderr, readiness, process-group termination, and no-ad-hoc-output requirements.
- `stateful.transport` currently accepts only `subprocess` and `in-process`, defaults to `subprocess`, and is captured when the session runtime starts.
- Completion delivery already supports `next-turn` and `auto-resume`, but transport choice and completion delivery are configured separately and are not presented as a responsiveness workflow.
- Agent settings already accept `model`, `thinkingLevel`, and `timeoutMs`, while the interactive agent editor currently exposes only tool permissions.
- The model-facing spawn guidance already asks the root to select the lowest sufficient thinking level, but built-in agents intentionally have no fixed thinking defaults.
- Mailbox send already supports a deduplication key, while `subagent_spawn` can still duplicate work if an accepted request is retried.
- Context selection supports `none`, `all`, `summary`, recent user turns, and exact source IDs, but callers cannot inspect the expected byte and turn footprint before spawning.
- `subagent_inspect` safely exposes status and diagnostics without launching work, but it does not report queue, startup, readiness, first-activity, settled, or delivery timing.

## Architecture

### RPC contract

- Name the extension-owned RPC adapter contract `pi-subagents:v1`.
- Keep Pi's built-in RPC command and event JSON unchanged, and place the `pi-subagents:v1` identifier only in extension-owned normalized progress, inspection, completion metadata, diagnostics, and tests.
- Treat additive optional fields as compatible within v1, and require a new protocol identifier for a breaking envelope or lifecycle change.
- Use public Pi root-exported RPC types where they are semantically sufficient, but keep child spawning, framing, correlation, stderr capture, readiness, abort, and termination in a package-owned adapter.
- Reuse the package's bounded strict-LF `JsonLineDecoder` instead of Node `readline`.
- Resolve the exact loaded Pi CLI through `resolvePiInvocation()` rather than PATH or a fixed `node dist/cli.js` assumption.
- Start one lazy `pi --mode rpc --no-session` child per active retained agent and retain it across follow-up turns.
- Complete a readiness handshake with a correlated `get_state` response before accepting a task into the RPC child and before starting the task timeout.
- Subscribe to events before sending `prompt`, treat a successful prompt response as acceptance only, and wait for `agent_settled` rather than `agent_end` before finalizing the turn.
- Never replay a prompt after its acceptance is uncertain or confirmed, because a replay could duplicate writes.
- Launch the first RPC version with extensions disabled and an explicit built-in tool allow-list so recursive `pi-subagents` loading cannot occur.
- Reject unsupported custom or extension tools before child creation with an actionable transport recommendation.
- Preserve cwd, project trust, recursion-depth environment, model, thinking, role prompt, context, timeout, output bounds, redaction, and private-text behavior across transports.
- Capture authoritative effective model and thinking state after readiness, and derive per-turn usage only from validated non-negative RPC event or session-stat deltas without inventing missing values.
- Keep RPC session persistence disabled because `AgentPersistence` remains the owner of bounded, sanitized retained records.
- Restore an inert retained record by starting a fresh RPC child only when the next explicit turn begins, seeding its sanitized logical context and history once.

### Lifecycle and progress

- Extend `SubagentTransport` with optional normalized progress and capability inspection rather than exposing raw Pi RPC events to tools or persistence.
- Keep progress ephemeral and bounded so high-frequency stream events do not trigger settings writes or retained-state publication.
- Record only non-secret timing and state metadata such as queue wait, transport start, readiness, prompt acceptance, first activity, settled, completion delivery, effective model and thinking, bounded usage, and context-window estimates.
- Key every RPC child, temporary prompt, decoder, listener, timer, and process group by the retained `agentId` and owning session generation.
- Revalidate abort and session generation after every asynchronous discovery, prompt-file, spawn, readiness, command, settlement, and cleanup boundary.
- Make `release()` and `shutdown()` idempotent, abort active work, close stdin, signal the POSIX process group until streams close, escalate after grace, remove temporary files, and aggregate cleanup failures.
- Fail extension UI requests closed in v1 instead of allowing a detached headless child to wait indefinitely for an unavailable dialog.

### Transport selection

- Add explicit `rpc` and `auto` values without changing the default `subprocess` value in the first release.
- Implement `auto` as a preflight-only composite that selects one transport before child creation and retains that selection for the agent's current runtime lifetime.
- Do not fall back to another transport after child creation or prompt acceptance.
- Define and document one deterministic capability matrix before implementing `auto`, including tool kind, requested model, loaded public SDK support, CLI availability, process-isolation requirement, and trust/resource parity.
- Keep persisted agent records transport-neutral, and re-run automatic preflight after a restored inert record receives an explicit follow-up.
- Expose configured and effective transport separately in status and per-run inspection.

### Settings and experience

- Preserve `subprocess`, `next-turn`, inherited model, absent per-agent thinking override, and `context: none` as compatibility defaults.
- Present transport, completion delivery, per-agent execution defaults, and context guidance as previewable advanced choices rather than silently changing behavior.
- Add `Fast`, `Balanced`, and `Deep` as named, atomic setting patches with an exact preview and confirmation, not as a hidden precedence layer.
- Keep built-in profiles provider-neutral, never select `max`, never widen parent context from `none` without explicit confirmation, and let explicit tool-call arguments remain authoritative.
- Finalize the exact profile patch matrix from baseline evidence and user-visible trade-offs before implementation, with the current low/medium/high task guidance as the starting proposal.
- Expose per-agent model, thinking, timeout, and reset-to-inherited controls in the existing agent settings flow while preserving unavailable configured values and unknown JSON fields.
- Apply immediately only settings whose current runtime already supports safe live application, and label transport or retained-runtime changes as requiring `/reload`.
- Never reload automatically while retained agents exist.
- Keep the main manager's primary workflow and Current agents actions prominent, and place transport, profiles, timings, and expert overrides under shallow progressive disclosure.

### Reliability and result efficiency

- Add an optional `idempotencyKey` to `subagent_spawn` with session-owned semantics matching the existing mailbox key bound.
- Hash the canonical spawn request and return the existing retained `agentId` for the same key and same request while rejecting key reuse with different inputs.
- Perform idempotency lookup before project-agent confirmation, worktree creation, child allocation, or any other side effect.
- Release the spawn key when the retained record is closed and preserve it across session reload while the record remains retained.
- Add a side-effect-free context preview projection that reports selected turns, source count, UTF-8 bytes, and truncation without returning context text.
- Keep `context: all` explicit and warn through descriptions or previews when `summary` or a bounded recent-turn selection would avoid unnecessary context transfer.
- Prototype an opt-in structured completion result with versioned fields for summary, evidence, changes, verification, and risks.
- Preserve bounded raw final text as a fallback when a model does not produce a valid structured result, and do not make structured output the default until provider and agent compatibility is proven.

## Non-Goals

- Do not replace the current blocking `subagent` or `subagent_consult` subprocess path with RPC in the first implementation phase.
- Do not expose raw chain-of-thought, raw RPC events, prompt contents, credentials, headers, environment values, full stderr, or full tool arguments through progress or diagnostics.
- Do not claim that RPC or process isolation is a filesystem, network, credential, or workspace sandbox.
- Do not allow automatic transport fallback after startup or accepted work.
- Do not add task-string heuristics, a classifier model call, or fixed provider-specific model aliases.
- Do not make live steering of an already running retained turn part of `pi-subagents:v1`; existing `subagent_send` and mailbox semantics remain unchanged.
- Do not change completion batching, auto-resume wake suppression, detached capacity defaults, trust policy, worktree policy, or blocking parallel semantics except where additive diagnostics are required.
- Do not publish, tag, or dispatch a release without separate explicit approval.

## Assumptions

- `pi-subagents:v1` identifies the extension-owned adapter and metadata contract layered over Pi's existing RPC protocol rather than replacing Pi's command vocabulary.
- One retained agent owns at most one persistent RPC child at a time.
- RPC v1 supports only the built-in Pi tools that can be selected safely without loading child extensions.
- The existing transport-neutral persisted logical history remains the recovery source after parent restart or RPC child loss.
- A profile is an explicit settings patch that users can inspect, cancel, and later customize.
- Performance acceptance should be based on reproducible measurements rather than an invented absolute latency promise.

## Unknowns

- The exact `auto` routing matrix needs a pre-implementation decision after capability probes establish RPC and in-process parity for tools, resources, trust, models, and thinking levels.
- The exact Fast, Balanced, and Deep patch values need product approval after their latency, cost, and quality consequences are visible.
- The structured completion prototype may show that prompt-only JSON is too unreliable for a public schema, in which case the feature remains experimental or is omitted.
- A real-provider benchmark may be unavailable because of credentials, quota, or entitlement, so deterministic process and protocol benchmarks must remain sufficient for correctness and relative transport overhead.

## Risks

- A persistent RPC child can leak processes, listeners, streams, or temporary files if cancellation and shutdown ownership are incomplete.
- A successful prompt response can be mistaken for completion and cause premature delivery unless every path waits for `agent_settled`.
- Automatic fallback or replay can duplicate write side effects.
- Loading extensions in an RPC child can recursively load `pi-subagents` and widen the approved tool surface.
- Sixteen retained agents can imply sixteen resident child processes, so lazy startup, active limits, idle expiry, and deterministic release are required.
- Timing diagnostics can become a covert content or path channel if labels or raw event data are retained.
- Profile saves can erase manual or future settings unless writes use the existing latest-document lock, unknown-field preservation, validation, and atomic rename protocol.
- A spawn idempotency key can return the wrong agent unless the canonical request hash includes every behavior-affecting field and rejects mismatches.
- Context preview can create false precision because byte size is not provider token count, so it must label bytes and turns rather than promise token cost.
- Adding `rpc` or `auto` to settings makes those files invalid to older releases until the value is changed back to `subprocess` or `in-process`.

## Rollback / Recovery

- Keep `stateful.transport: "subprocess"` as the documented rollback path and unchanged default.
- Keep persisted retained records transport-neutral so switching away from RPC does not require state migration.
- Mark a crashed RPC turn failed or interrupted with bounded partial evidence, dispose the child, and require an explicit later follow-up instead of replaying the accepted task.
- If `auto` preflight cannot prove a safe route, fail before launch with the exact unsupported capability and a suggested explicit transport.
- Preserve the previous effective settings and file when profile or execution-default persistence fails.
- Before downgrading to a release that does not recognize `rpc` or `auto`, require changing the transport setting to `subprocess` and reloading Pi.
- Keep every behavior slice in a focused changeset so a release can revert RPC, automatic routing, profiles, or result contracts independently.

## Plan

### Phase 0: Baseline and contracts

- [x] Add a reproducible transport benchmark under `scripts/` that measures fresh subprocess startup, RPC readiness, first turn, retained follow-up, in-process creation, and retained follow-up; record medians and dispersion without provider secrets, and verify the script against a deterministic fake Pi plus an optional real Pi smoke.
- [x] Write the `pi-subagents:v1` normalized envelope and lifecycle contract in an implementation note, including readiness, request correlation, accepted-versus-settled semantics, progress bounds, extension UI failure, crash behavior, and compatibility rules; verify it against installed Pi RPC docs and root-exported types.
- [x] Probe RPC parity for exact CLI resolution, cwd, trust flags, model and `:<thinking>` resolution, built-in tools, role prompts, context seeding, retries, compaction, abort, and final output; record unsupported capabilities before selecting the v1 boundary.
- [x] Decide and document the deterministic `auto` routing matrix and the exact previewable profile patch matrix; obtain user approval for any default or precedence change before implementation.

### Phase 1: Persistent RPC transport

- [x] Add failing protocol-driver tests using a test-owned `PI_PACKAGE_DIR` and fake `package.json#bin.pi` for strict LF framing, split UTF-8, `U+2028` and `U+2029`, oversized and malformed lines, correlated responses, bounded stderr, process exit, and readiness; verify the tests fail before `rpc-transport.ts` exists.
- [x] Implement a package-owned RPC driver using `resolvePiInvocation()`, `JsonLineDecoder`, public Pi root RPC types, bounded command correlation, and a `get_state` readiness handshake; verify no deep Pi import, PATH fallback, fixed Node CLI, stdout logging, or unbounded stderr remains.
- [x] Add failing lifecycle tests for abort before spawn, abort during readiness, timeout after readiness, `agent_end` followed by retry or compaction, authoritative `agent_settled`, crash before and after prompt acceptance, stdin failure, extension UI request, and no automatic replay.
- [x] Implement `RpcTransport` with one lazy child per retained `agentId`, native multi-turn history, authoritative effective model and thinking state, validated per-turn usage deltas, bounded final and partial output, `pi-subagents:v1` progress, and exact task timeout semantics; verify a two-turn child receives the second task without duplicated logical history.
- [x] Reuse agent discovery and safe resource assembly so RPC launch preserves model, thinking, tools, cwd, trust, recursion depth, role prompt, parent context, mailbox input, private-text redaction, and output limits; verify unsupported tools fail before child creation.
- [x] Implement idempotent release and shutdown with unsubscribe, abort, stdin close, process-group TERM/KILL escalation, descendant-stream closure, temporary-file cleanup, partial-start cleanup, and aggregated errors; verify close, subtree close, expiry, clear, session replacement, reload, and shutdown.
- [x] Extend `SubagentTransportKind`, settings validation, runtime status, inspection, rendering, help, and README with opt-in `rpc`; verify malformed settings remain protected, unknown fields survive, and the default remains `subprocess`.
- [x] Add a minor Changeset for the opt-in RPC transport and run focused tests, package typecheck, root boundary checks, `just pack subagents`, and an offline real Pi RPC loader smoke before continuing.

### Phase 2: Automatic routing and responsiveness setup

- [x] Add capability-probe tests and an `AutoTransport` composite that selects exactly one transport before child creation, caches that choice for the retained runtime, reports the reason, and never performs post-start fallback.
- [x] Add `auto` settings validation, configured-versus-effective status, per-run transport inspection, mixed-runtime cleanup, restored-record re-preflight, and actionable unsupported-capability errors; verify old transport values and persisted records remain compatible.
- [x] Add an Advanced settings transport screen with current and configured values, concrete isolation and tool trade-offs, preview, cancellation, serialized save, failure rollback, and reload-only application while retained agents are protected.
- [x] Add a responsiveness setup screen that previews `in-process` or `auto`, `auto-resume`, and explicit thinking guidance as separate choices rather than silently enabling them; verify cancellation is read-only and each selected patch preserves unrelated settings.
- [x] Re-run the transport benchmark and record whether RPC and automatic routing reduce measured follow-up overhead; do not recommend or default a route whose measured behavior does not improve its stated use case.

### Phase 3: Execution profiles and observability

- [x] Add failing settings tests for previewable Fast, Balanced, and Deep patches, explicit-call precedence, reset-to-inherited behavior, unavailable model preservation, unknown-field preservation, concurrent edits, invalid-file refusal, and rollback after persistence or runtime-application failure.
- [x] Add per-agent execution settings for model, thinking level, timeout, and reset alongside the existing tool editor, using Pi TUI Kit standard screens and the session model catalog without hard-coded provider aliases.
- [x] Implement named profiles as atomic visible patches over owned settings, preserve `context: none` unless explicitly approved, keep `max` manual-only, and show latency, quality, and cost trade-offs before confirmation.
- [x] Add normalized ephemeral transport progress to the registry and Current agents view with queue position, phase, elapsed time, and effective transport while keeping raw model text and event payloads out of persistence.
- [x] Extend `subagent_inspect get_run`, `status`, and `diagnose` with bounded current-session timing, protocol, effective transport, effective model and thinking, validated usage, capability checks, and failure phase; verify inspection stays side-effect-free and never launches a child.
- [x] Add deterministic timing tests with an injected clock for queue wait, startup, readiness, acceptance, first activity, settlement, completion batching, and auto-resume delivery while preserving the existing settled-completion snapshot ordering.
- [x] Update README and help with profiles, precedence, timing definitions, measurement limits, and the distinction between transport isolation and sandboxing; add a separate minor Changeset if this phase ships independently.

### Phase 4: Duplicate prevention, context guidance, and completion contracts

- [x] Add failing schema, registry, persistence, worktree, project-confirmation, reload, close, and mismatch tests for `subagent_spawn.idempotencyKey`, including same-key same-request reuse and same-key different-request rejection before side effects.
- [x] Implement canonical spawn hashing and retained-key lookup without exposing task or context content, preserve optional fields through current state storage when downgrade tests permit it, and release the key when the retained record closes.
- [x] Add a side-effect-free context preview projection to `subagent_inspect` or another existing safe surface, returning only mode, turns, source count, bytes, and truncation; verify private text, raw entries, and selected content never appear.
- [x] Add context-size metadata to spawn result details and settings/profile previews, and document that byte counts are not provider token estimates.
- [x] Prototype a versioned structured completion format with summary, evidence, changes, verification, and risks; test valid, partial, malformed, oversized, private, and plain-text fallback outputs across built-in and custom agents.
- [x] Ship structured completion only as an explicit opt-in after the prototype passes provider-compatibility review, otherwise record the rejection and keep bounded text as the sole stable contract.
- [x] Update tool descriptions, renderers, README, compatibility notes, and a separate minor Changeset for shipped public schema or completion behavior.

### Phase 5: Final verification and handoff

- [x] Audit every changed asynchronous flow for user cancellation, abort during creation, stale session generation after each `await`, component disposal, session replacement, shutdown, child crash, retry, expiry, and exactly-once cleanup; record the audit by owning module.
- [x] Audit every settings read and write for defaults, precedence, malformed and invalid files, latest-document locking, unknown-field preservation, ordered saves, stale confirmation, atomic publication, rollback, reload semantics, and older-version downgrade guidance.
- [x] Audit terminal and model-facing boundaries so paths, tasks, model IDs, RPC errors, stderr, context metadata, progress, and structured results are bounded, redacted, and sanitized before display.
- [x] Run all focused `pi-subagents` tests, `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; record exact passing evidence and inspect the tarball for intended source, README, manifest, license, and Changesets only.
- [x] Run a real local `pi -e ./packages/pi-subagents` smoke covering opt-in RPC spawn, two-turn reuse, interrupt, close, session shutdown, automatic routing inspection, profile cancellation and save, and completion delivery; stop after one clear provider or entitlement failure and retain deterministic evidence for unverified live paths.
- [x] Run an independent review against `docs/extension-conventions.md`, `docs/extension-settings.md`, Pi RPC documentation, package `AGENTS.md`, public API compatibility, and the final diff; resolve every material finding or document an explicitly accepted deviation.
- [x] Move durable protocol and mechanism facts to `docs/implementation-notes/` or an ADR, update the README for user behavior, check every plan item with evidence, and archive this plan only after no required work remains.

## Execution evidence

- The package gate passed with 18 files and 224 tests after the final hardening changes.
- The full repository test suite passed with 235 files and 2,658 tests.
- The full `VITEST_MAX_WORKERS=4 npm run check` gate passed with root Biome, boundaries, all workspace type checks, 235 test files, and 2,658 tests; the worker cap avoids local process-start deadline contention without reducing test coverage.
- `just benchmark-subagents 7` passed with deterministic fake-turn and isolated real Pi measurements recorded in `docs/implementation-notes/pi-subagents-rpc-v1.md`.
- `just pack subagents` produced a 56-file dry-run tarball containing only the manifest, README, license, and published source.
- The offline real Pi RPC loader returned a correlated successful `get_state` response without provider access.
- Live provider smokes passed RPC spawn and two-turn reuse, idle-root completion delivery, interrupt, inspection, close, automatic in-process selection, structured completion, and active-child session-shutdown cleanup.
- An automated real Pi TUI smoke cancelled a Balanced profile confirmation without a write and then saved the same profile successfully.
- The lifecycle audit covered `stateful.ts`, `stateful-lifecycle.ts`, `rpc-transport.ts`, `in-process-transport.ts`, `auto-transport.ts`, `completion-delivery.ts`, `workspace.ts`, `config-ui.ts`, `execution-ui.ts`, and `transport-ui.ts`.
- The settings audit covered malformed-file refusal, latest-document locking, unknown-field preservation, atomic publication, stale confirmation checks, reload-only transport application, retained-agent protection, and downgrade guidance.
- The terminal and model-boundary audit covered RPC framing and stderr, model and tool names, task and completion text, context metadata, telemetry, structured results, paths, and temporary role prompts.
- No publication, tag, visibility change, or release workflow was performed.

## Completion Checklist

- [x] `pi-subagents:v1` is documented, bounded, versioned, and implemented without changing Pi's underlying RPC wire vocabulary.
- [x] RPC retains one child per active retained agent, uses readiness and `agent_settled`, never replays accepted work, and cleans every owned process, stream, listener, timer, and temporary file.
- [x] Existing subprocess and in-process behavior remains available, and the default remains unchanged unless separately approved from benchmark evidence.
- [x] Automatic routing is deterministic, preflight-only, inspectable, and incapable of silently widening tools or retrying side effects.
- [x] Profiles and execution settings are previewable, cancelable, provider-neutral, precedence-safe, concurrency-safe, and recoverable after failure.
- [x] Timing and progress diagnostics identify queue, startup, readiness, execution, settlement, and delivery delays without exposing private content or launching inspection work.
- [x] Spawn retries can be deduplicated before confirmation, worktree creation, or child launch, while mismatched key reuse fails clearly.
- [x] Context guidance reports bounded bytes and turns without claiming provider token precision or revealing selected text.
- [x] Structured completion either passes the opt-in compatibility gate with bounded fallback behavior or is explicitly rejected without weakening the existing text contract.
- [x] Cancellation, disposal, session replacement, shutdown, settings concurrency, trust, terminal safety, packaging, runtime smokes, and CI-equivalent checks all have recorded evidence.
- [x] Every shipped behavior change has an appropriate Changeset, downgrade instructions are documented, and no publication occurred without explicit approval.
