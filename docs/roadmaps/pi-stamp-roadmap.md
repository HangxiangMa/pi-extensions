# pi-stamp Roadmap

## Vision

`@narumitw/pi-stamp` adds quiet, trustworthy metadata stamps to Pi's transcript. It starts
with local timestamps for user and assistant messages and may grow into an opt-in message
provenance and timing footer without changing message content or sending stamp data to the
model.

A stamp should answer a small question—when was this sent, how long did it take, which model
produced it, or what did it cost—without turning the transcript into an analytics dashboard.

## Product principles

- **Minimal by default:** the default transcript shows only a dim time stamp.
- **Truthful labels:** distinguish message creation, first-token, completion, and elapsed times
  instead of presenting them as interchangeable.
- **TUI-only presentation:** persist stamps as custom session entries that do not participate in
  LLM context.
- **Provider-neutral behavior:** show optional metadata only when the provider reports it.
- **Private by design:** perform no network requests and never display credentials, opaque protocol
  signatures, or raw diagnostic payloads by default.
- **Public Pi APIs only:** avoid monkey-patching built-in message or tool components.
- **Compatible persistence:** version persisted stamp data and ignore unknown or malformed entries
  safely.

## Platform boundary

Pi currently lets extensions render custom messages and custom entries, but it does not expose a
public decorator for built-in user, assistant, or tool rows. `pi-stamp` therefore renders a compact
custom entry after the associated transcript item. Exact in-row or in-bubble placement depends on a
future Pi transcript-decoration API or a Pi core change.

Custom entries become part of the session tree but are excluded from LLM context. Messages created
before `pi-stamp` was installed cannot be retroactively interleaved with new custom entries, so
historical backfill is not planned under the current API.

## Roadmap

### Phase 1 — Message time stamps

**Status:** implemented; see the archived
[initial-version plan](../plans/archived/2026-07-29_pi-stamp-initial-version-plan.md)

- Show one dim, right-aligned local `HH:mm:ss` stamp for each new user and assistant message in TUI
  mode.
- Use the message's persisted `timestamp`, not the extension handler's wall-clock time.
- Persist stamps as versioned `pi-stamp` custom entries so they survive session reloads.
- Remain passive: no command, settings file, status item, tool, network access, or background task.
- Ignore tool calls/results, custom messages, bash messages, compaction summaries, and branch
  summaries.

### Phase 2 — Presentation controls

- Add date context when a conversation crosses a local day boundary.
- Consider 12/24-hour display, seconds visibility, locale, and explicit time-zone selection.
- Consider absolute versus relative labels such as `14:32:08` and `3m ago`; relative labels require
  a bounded refresh strategy and lifecycle cleanup.
- Keep the existing minimal format as the compatibility default.

This phase introduces extension-owned settings and must follow `docs/extension-settings.md`,
including precedence, validation, malformed-file recovery, unknown-field preservation, and atomic
publication.

### Phase 3 — Response timing

- Record assistant completion time at `message_end` separately from `message.timestamp`.
- Derive response duration from request/message creation to completion.
- Evaluate time-to-first-content using the first meaningful assistant `message_update`.
- Label unavailable or provider-dependent timing honestly rather than substituting a different
  measurement.

A possible compact stamp is:

```text
14:32:08 · 3.2s
```

### Phase 4 — Assistant provenance and usage

Add optional compact or expanded fields already carried by assistant messages:

- API, provider, requested model, and provider-reported response model.
- Stop reason (`stop`, `toolUse`, `length`, `error`, or `aborted`).
- Input, output, reasoning, cache-read, cache-write, and total tokens when reported.
- Per-message estimated cost when reported.
- Response ID and sanitized diagnostic summaries in an explicit debug view only.

A possible opt-in compact stamp is:

```text
14:32:08 · 3.2s · claude-sonnet-4-6 · 842 tok · $0.018
```

Opaque `textSignature`, `thinkingSignature`, and `thoughtSignature` fields remain excluded from UI.

### Phase 5 — Tool timing

- Capture tool start and completion times from `tool_execution_start` and `tool_execution_end`.
- Pair parallel executions strictly by `toolCallId`, never by completion order.
- Show duration and outcome only when tool stamps are explicitly enabled.
- Preserve bounded state and clear it on cancellation, session replacement, reload, and shutdown.

Under the current Pi API, tool stamps can appear only as separate transcript entries after the tool
block. In-row placement remains platform-dependent.

### Phase 6 — Platform integration

If Pi adds a stable built-in transcript decoration API:

- Move stamps into the owning user, assistant, and tool rows without changing persisted message
  content.
- Preserve rendering of existing `pi-stamp` custom entries for older sessions.
- Provide a bounded migration or deduplication strategy before changing the persisted format.

## Candidate message metadata

`message_end` exposes only `{ type, message }`; useful metadata is nested in the role-specific
message object.

| Role | Candidate metadata not normally shown beside each message |
| --- | --- |
| User | `timestamp` |
| Assistant | `timestamp`, `api`, `provider`, `model`, `responseModel`, `responseId`, `usage`, normal `stopReason`, and `diagnostics` |
| Tool result | `timestamp`, `toolCallId`, optional `usage`, `addedToolNames`, and renderer-specific `details` |

Provider support varies for optional usage, response-model, response-ID, reasoning, cache, cost, and
diagnostic fields. Missing data must remain missing rather than being estimated without an explicit
label.

## Non-goals

- Editing message text to append metadata, because that would alter LLM context.
- Replacing or monkey-patching Pi's built-in transcript components.
- Sending telemetry or querying provider APIs.
- Exposing credentials, opaque signatures, full diagnostics, or raw tool details by default.
- Building a full session analytics dashboard inside the transcript.
- Retroactively stamping messages created before the extension recorded them.
