# Pi Goal Pull Request #663 Feedback Plan

## Goal

Resolve every feedback item on pull request #663 with verified ownership fixes, thread responses, signed commits, and pushes to the existing branch.

## Context

The target is https://github.com/narumiruna/pi-extensions/pull/663 from `fix/pi-goal-external-wait` into `main`.
The working tree was clean at commit `db4b57613cddb8d37ca0beffadc0d32d9ed00e72` before this plan was created.
The pull request has one submitted automated review, one unresolved inline thread, no conversation comments, and a passing CI check.
The graph index `pi-extensions-quiet-river-5705` matched the worktree, branch, and original HEAD.
A post-edit fast re-index crashed in the indexing worker, so final changed-code review used source, focused searches, tests, history, and the complete merge-base diff as authoritative evidence.
Pi's installed input-transform pipeline confirms that transforms registered before pi-goal can change a live continuation before pi-goal records its exact fingerprint.

## Review Ledger

| Feedback | Outcome | Evidence |
| --- | --- | --- |
| `runtime.ts`: preserve continuation ownership through preceding input transforms | Already addressed by the current code | The shared terminal-boundary check accepts the complete generated prompt after prefix transforms on either side of pi-goal, claims the final fingerprint, and keeps automatic safety accounting active; focused regressions prove the one-turn cap pauses the transformed continuation while marker-only or appended external text remains manual. The equivalent Goal-prompt path uses the same boundary and tests. |
| Codex submitted-review wrapper for commit `db4b57613c` | Outdated or superseded | The wrapper is informational and names the original reviewed commit; its one inline finding is tracked separately above and the fix commit will be linked in the thread response. |

## Plan

- [x] Add focused regressions for a preceding transform of an owned continuation and the same ownership pattern on an owned Goal prompt; the pre-fix run failed both ownership assertions because the continuation stayed active instead of reaching the one-turn safety pause and Goal safety counters stayed at two.
- [x] Accept a transformed owned prompt only when it preserves the complete generated prompt at its terminal boundary, while rejecting messages that merely quote a marker or append external content; the same boundary now covers pending, claimed, cancelled, stale, Goal, and continuation paths.
- [x] Run focused pi-goal tests, package typecheck and runtime smoke, the root `npm run check` gate, and `git diff --check`; 337 package tests, the runtime smoke, all validators, and 2,787 root tests pass. The first root check exposed only test formatting, which was fixed before the complete passing rerun.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, prompt trust boundaries, input ordering, lifecycle cleanup, and safety accounting; no settings or new resources changed, retained prompt state is bounded by existing limits, terminal-boundary checks are shared, and final fingerprints preserve event-order ownership.
- [x] Re-read every pull-request feedback item and update the ledger with evidence-backed final outcomes; one actionable inline finding and one informational review wrapper are fully classified.
- [ ] Stage only intended files, create and push a signed conventional fix commit, then reply to and resolve the addressed thread.
- [ ] Archive this completed plan in a signed documentation commit, push it, and refresh the pull request once after the final push.

## Completion Checklist

- [ ] Every feedback item has an evidence-backed final outcome.
- [ ] Every actionable item is fixed at the shared ownership boundary and covered by deterministic regression tests.
- [ ] Prefix transforms preserve automatic ownership and safety accounting, while quoted or externally extended markers remain non-owned.
- [ ] Required checks pass with no concealed failures.
- [ ] The review thread is answered and resolved only after the fix is verified and pushed.
- [ ] Signed commits are pushed without rewriting history, and the final pull-request refresh reports no remaining blocker.
