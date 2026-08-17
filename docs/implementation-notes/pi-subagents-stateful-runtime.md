# pi-subagents stateful runtime decision

Date: 2026-07-11
Updated: 2026-08-17

## Decision

Keep the existing logical stateful registry and support two transports:

- `subprocess` (default): start a fresh `pi --mode json -p --no-session` child for every turn and replay bounded sanitized history.
- `in-process` (opt-in): retain one public Pi SDK `AgentSession` per stateful `agentId` and send follow-ups directly to that session.

Stateful lifecycle tools are registered by default and can be removed with `stateful.enabled: false`.
The default transport remains subprocess for compatibility and rollback safety. Read-only inspection is
registered independently of delegation workflow, and synchronous consultation follows blocking-tool
availability.

Detached completion is configurable. `stateful.completionDelivery: "next-turn"` is the default
Codex-style behavior: the lifecycle observer publishes final status/output with
`deliverAs: "steer"` and omits `triggerTurn`, allowing active-turn steering without waking an idle
root. Opt-in `"auto-resume"` holds completion while the root is active, coalesces simultaneous
completions, and requests at most one synthesis turn after the parent settles when no input is
pending. Completion metadata/output/error fields are independently
sanitized and bounded, and session-generation, shutdown, batching, and in-flight wake guards prevent
stale or duplicate scheduling pressure. Delivery remains best-effort because Pi's custom-message API
is fire-and-forget.

One shared target resolver canonicalizes every requested cwd before discovery or launch. The current
workspace uses session trust; external targets use Pi's nearest saved `ProjectTrustStore` decision.
General delegation defaults to current or saved-trusted targets, while consultation defaults to any
existing target and removes inherited target/project resources when effective trust is absent.

## In-process ownership

The extension constructs children only with public SDK APIs: `createAgentSession()`, `SessionManager.inMemory()`, `DefaultResourceLoader`, `SettingsManager`, `ModelRegistry`, and documented `AgentSession` methods.

Each child receives:

- the agent system prompt;
- an in-memory session seeded once with sanitized parent context and prior user/assistant turn boundaries;
- the selected cwd, model, thinking level, timeout, and built-in tool allow-list;
- a resource loader configured with `noExtensions: true` to prevent recursive extension loading and
  duplicate side effects; and
- the same resolved target-trust boolean passed to subprocess launch policy, applied to
  `SettingsManager` before project settings are read.

An existing child keeps its session configuration. Parent model/thinking changes are snapshotted only when a later child is created. Explicit models resolve through public `ModelRegistry` exact provider/id or unique id/name/fuzzy matching, with CLI-compatible `:thinking` suffix parsing and bounded ambiguity errors. Unsupported extension/custom tools fail before child creation and recommend `subprocess`; the runtime never silently widens tools or falls back after a failed in-process start.

## Lifecycle

```text
spawn -> starting -> running -> completed
                  |         -> failed
                  |         -> interrupted
                  v
             FIFO capacity queue

completed/failed/interrupted -> follow-up -> starting
any retained state -> close -> closed
restored persisted state -> idle -> explicit follow-up -> starting
```

- `starting` means queued for an active-turn slot.
- `running` owns one `AbortController` and one transport turn.
- `subagent_spawn` returns immediately.
  Prompt guidance keeps ordinary review in the main agent and reserves detached review for consequential independent verification with concrete parallel value.
  Under default next-turn delivery, detached work is allowed only when the current response does not depend on its result; under auto-resume, qualifying detached work may be final-answer-dependent.
- Blocking `subagent` batches are reserved for delegated outputs required before the root's next action because queued steering cannot be processed until the call returns. Critical-path work the root can perform directly remains local.
- Settled turns emit bounded `pi-subagent-completion` custom messages. The default does not wake an idle root; opt-in auto-resume batches a dispatch window and requests one synthesis turn.
- Active parent work is not interrupted; `agent_settled` schedules the held batch. User or extension input already pending at flush time suppresses auto-resume, and a parent `agent_start` acknowledgement clears the pre-set one-wake guard.
- Registry state-change callbacks are serialized in invocation order, preventing a slow `starting` persistence write from overwriting a later terminal snapshot.
- No detached wait tool is exposed; genuinely blocking one-shot work uses the batch `subagent` API.
- `subagent_manage` with `action: "interrupt"` aborts a queued/running turn but preserves identity and settled history.
- `subagent_manage` with `action: "close"` aborts current work, releases transport ownership exactly once, and excludes the record from persistence.
- Session shutdown aborts active work, drains queued work, persists non-closed records as inert `idle`, and shuts down every owned child session.

## Cleanup

Subprocess cleanup retains process-group SIGTERM/SIGKILL escalation. In-process cleanup calls `AgentSession.abort()` and `dispose()`. Timeout and parent abort allow a bounded settlement grace; a child that remains unsettled is disposed and removed instead of being reused. Close, TTL eviction, and session shutdown release child ownership deterministically.

## Public surface

The compatibility-default `all` workflow exposes seven tools: blocking `subagent`; detached `subagent_spawn`,
`subagent_send`, `subagent_manage`, and `subagent_mailbox`; metadata-only `subagent_inspect`; and
synchronous read-only `subagent_consult`.
The user-facing recommendation is `async-only`, while registration follows workflow capability:

- `all`: all seven tools as the compatibility default;
- `async-only`: the four detached tools plus inspection as the recommended workflow;
- `blocking-only`: blocking delegation, consultation, and inspection as a compatibility workflow; and
- `disabled`: inspection only.

Within an enabled stateful workflow, lifecycle tool membership does not change after spawn,
completion, interrupt, close, or mailbox activity, preserving a stable provider tool-schema prefix.
`subagent_manage` keeps the compatibility `list | interrupt | close` actions, and
`subagent_mailbox` keeps `send | read`; model guidance prefers inspection when the whole operation
must be read-only.

`subagent` remains the blocking batch API for single, parallel, chain, and fan-in work.
The full batch is target/trust-preflighted before any child starts.
`subagent_spawn` is the detached sidecar API, `subagent_send` starts a follow-up turn, `subagent_manage` owns interruption and closure, and mailbox `send` only queues context.
Their distinct contracts keep the four async lifecycle tools split.
No detached wait operation is exposed.

`subagent_inspect` reads only pure settings and metadata snapshots. It never starts a child,
acknowledges mailbox messages, exposes message/history/context content, refreshes providers, or
changes registry/workspace state. `subagent_consult` runs one ephemeral non-retained child with
extensions and persistent sessions disabled. Missing tool configuration selects the built-in
read-only set, explicit empty configuration selects no tools, and explicit lists are intersected with
`read`, `grep`, `find`, and `ls`. Pre-launch failures throw; post-launch failures preserve bounded
partial evidence and nested usage and finalize as Pi-visible tool errors.

Bare `/subagents` is the TUI manager and leads with delegation workflow, completion behavior, target
policies, trusted-resource policy, and agent counts. Workflow changes preview the exact tool-surface
change and refuse reload while detached agents are retained. The shared Settings route atomically
updates completion delivery, consultation/delegation targets, and consultation resources while
preserving unknown fields and prior runtime values on failure. Status separates configured values,
sources, and path from current runtime policy. RPC uses bounded notifications; JSON and print modes
remain silent. Each `session_start` re-reads settings and reports deduplicated migration or validation
notices.

## Context and policy boundary

Parent context is opt-in (`none`, `all`, `summary`, recent N user turns, or selected entry IDs),
text-only, sanitized, and bounded. Tool results, reasoning, custom messages, and image data are
excluded.

Target policy controls where a child may start and whether protected project resources may load. It
is not a filesystem, process, network, or confidentiality sandbox. Current-workspace trust comes from
the session. External trust uses Pi's nearest saved decision, with a nearer denial taking precedence.
General `trusted-targets` delegation rejects unsaved, denied, or unresolved external targets before
any batch launch. `anywhere` delegation may start them with project trust disabled. Consultation may
start in any existing target by default, but a target without effective trust is downgraded to
`resources: "none"`; project context, skills, prompts, extensions, and sessions are disabled while
agent/package read-only instructions remain.

Disposable worktrees inherit the approved base target's resolved trust. Subprocess and in-process
transports receive the same decision; restored retained records re-resolve trust rather than trusting
a stale snapshot. Pi `/trust` remains the only trust writer.

Neither transport claims to clone parent approval decisions, sandbox profiles, provider-header
extension hooks, or extension state. In-process children also do not provide global core scheduling
or parent/child transcript switching. Result metadata marks these guarantees unsupported.
