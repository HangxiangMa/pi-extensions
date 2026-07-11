# pi-subagents native runtime alignment

Date: 2026-07-11

## Implemented

- A transport-neutral registry accepts `SubagentTransport`; the supported `SubprocessTransport` preserves the current child invocation and a function adapter keeps tests deterministic.
- Agents now persist `parentId`, `rootId`, `depth`, ordered children, bounded mailboxes, stable message IDs, deduplication keys, and read state.
- Parent completion is delivered exactly once into the parent mailbox. `subagent_message` does not start a turn; `subagent_send` consumes mailbox context and starts a follow-up.
- Subtree interrupt and close use child-first order. Restore rejects orphaned/cyclic hierarchy and always returns valid records as inert.
- Context supports none, all, recent N, summary checkpoint plus recent messages, and selected session entry IDs with stable source IDs.
- Shared-workspace write-capable concurrency is blocked by default. Opt-in disposable detached worktrees require a clean repository and are removed on close or shutdown.
- `/subagents:agents` renders hierarchy indentation, unread counts, state, elapsed time, and available actions.

## Native API boundary

No supported Pi API currently creates a child agent session, exposes its transcript, or propagates resolved approval/sandbox state. The implementation therefore does not import private Pi paths or emulate transcript switching. `docs/implementation-notes/pi-subagents-core-api-proposal.md` remains the upstream contract. A native transport can be added behind the transport interface when that contract exists; the subprocess transport remains the explicit fallback.

## Persistence and compatibility

Older records without hierarchy or mailbox fields migrate to root agents with empty children/mailboxes. New state remains versioned and bounded. Worktree agents are closed rather than restored because their disposable workspace is removed at shutdown. Existing one-shot and stateful tool shapes remain valid; all new parameters and tools are additive.
