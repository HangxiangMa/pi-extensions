# Pi Subagents PR 692 review follow-up plan

## Goal

Resolve review `4899226561` on PR #692, verify normalized patched state end to end, respond to the thread, and deliver signed commits to the current branch.

## Context

PR #692 targets `main` at `eb8e05554b2966fda7576ca60401272436fc13c0` from `feat/pi-subagents-autonomous-workflow-planning` at `03670868f3cab8a31f6025ad66de638b66505122`.

The working tree was clean before this plan was created.

The PR contains two valid signed commits, its CI check passed, and it has one unresolved inline thread with no conversation comments or other submitted feedback.

The change touches compiler-normalized workflow state, patch persistence, task generations, and deterministic tests.

Applicable extension convention MUST rules are deterministic behavior tests, generation-safe state, atomic persistence, final semantic review, and the CI-equivalent gate.

## Review Ledger

| Feedback | Final outcome | Evidence |
| --- | --- | --- |
| `discussion_r3751693429`: persist compiler-normalized tasks after a patch | Actionable and addressed | `mergeCompiledActivePlan()` replaces active candidate tasks with compiler-normalized definitions, retains cancelled tasks, appends synthesized tasks deterministically, marks normalized changes for generation rotation, and rejects normalization that would rewrite immutable work; revision identity, ledger construction, and `record.plan` now use the merged plan, with replacement, addition, stale-ledger, cancellation, and immutable-work regressions. |

## Plan

- [x] Add focused failing regressions proving replacement and added authoritative tasks retain caller criteria and evidence in compiled, recorded, and ledger state; both failed for the reported omission before implementation.
- [x] Merge compiler-normalized active tasks into the full patched plan while preserving cancelled task records and deterministic order.
- [x] Scan patch, persistence, and revision paths for the same mismatch; stale eligible ledger tasks now rotate, while normalization refuses to replay immutable completed work.
- [x] Run 17 focused patch/compiler tests, 395 Pi Subagents tests, package checks, root `npm run check` with 2,943 tests, and `git diff --check`; package inspection is not applicable because metadata and published contents did not change.
- [x] Audit generation state, persisted identity, cancellation retention, settings/lifecycle non-impact, and the final diff against both extension guides; no deviation remains.
- [x] Re-read the review after delivery, verify signed commit `535715d1`, push without rewriting history, reply to and resolve the thread, refresh mergeable PR #692 at the delivered head, and confirm CI run `31413473491` passed.

## Completion Checklist

- [x] Every feedback item has one evidence-backed final outcome.
- [x] Every actionable item is fixed at its owning boundary and has deterministic regression coverage.
- [x] Focused tests and the CI-equivalent gate pass.
- [x] Only intended files were staged, and signed commit `535715d1` verified with its configured ED25519 key.
- [x] The branch was pushed without rewriting history, and the review thread has an evidence-backed reply and resolution.
- [x] No runtime or package smoke was required because loading, metadata, and published contents did not change; deterministic tests, local gates, and CI passed with no remaining blocker.
