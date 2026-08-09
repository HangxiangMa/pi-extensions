# Pi Subagents Pull Request Feedback Plan

## Goal

Resolve every feedback item on pull request #658 with verified fixes, thread responses, a signed commit, and a push to the existing branch.

## Context

The target is https://github.com/narumiruna/pi-extensions/pull/658 from `feat/pi-subagents-fluency-improvements` into `main`.
The working tree was clean at commit `08e9ae28a0b4388dc1d25d6d286851958bc456bc` before this plan was created.
The submitted review initially contained three unresolved inline findings and no conversation comments.
The existing CI check passes.

## Review Ledger

| Feedback | Final outcome | Evidence |
| --- | --- | --- |
| `execution.ts`: non-deadline stops skip finalization when an orchestration deadline caps the child | Already addressed by the current code | `execution.ts` no longer derives finalization policy from the launch-time timeout reason, and `runner.ts` skips recovery only for the actual `orchestration_timeout`; the integration regression changed from `skipped` to `completed`. |
| `timeout-checkpoint.ts`: checkpoint shrinking can repeat without progress | Already addressed by the current code | `shrinkCheckpointText()` halves or removes each remaining text field with a strict `currentBytes - 1` ceiling; the pre-fix 2,048-byte case timed out, while 512-byte and 2,048-byte regressions now complete within their bounds. |
| `rpc-turn-capture.ts`: RPC tool results can be journaled twice | Already addressed by the current code | RPC `tool_execution_end` is the authoritative evidence event and later `message_end` tool-result records only activity; the dual-event regression changed from two completed entries to one. |
| Codex submitted-review wrapper for commit `82f609ffd4` | Outdated or superseded | The wrapper is informational and names an older reviewed commit; its three inline findings remain current and are tracked separately above. |

## Plan

- [x] Add focused regressions for early non-deadline finalization, strictly bounded checkpoint shrinking, and duplicate RPC evidence; pre-fix results were `skipped`, a command timeout, and two entries respectively.
- [x] Fix finalization gating, checkpoint shrink progress, and RPC journaling at their owning boundaries; all three focused regressions pass.
- [x] Scan the full pull-request diff and sibling callers for the same patterns; only recursive summary suppression remains, the checkpoint has one strict-progress loop, and other journal callers consume one representation.
- [x] Audit cancellation, process cleanup, listener disposal, deadlines, UTF-8 byte bounds, and evidence redaction against `docs/extension-conventions.md`; no ownership or redaction path changed and all existing bounded cleanup remains intact.
- [x] Run package tests, the CI-equivalent `npm run check`, `git diff --check`, and the package smoke; 246 package tests, 2,680 root tests, all validators, and the 65-file dry-run pack passed.
- [x] Re-read all pull-request feedback and inspect the final diff; every item has the final outcome recorded above.
- [x] Reply to and resolve each addressed review thread; all three GraphQL thread states are resolved.
- [x] Create signed commit `60af1a15973c4a6083c5872029f419d81877cc4a`, push the current branch without rewriting history, and defer the one pull-request refresh until after archiving this ledger.

## Completion Checklist

- [x] Every feedback item has an evidence-backed final outcome.
- [x] Every actionable item is fixed and covered by deterministic regression tests.
- [x] Required checks and smokes pass with no concealed failures.
- [x] Review threads are answered and resolved only after verification.
- [x] The signed fix commit is pushed without rewriting history.
