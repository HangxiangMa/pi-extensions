# Pi Subagents PR 688 review follow-up plan

## Goal

Resolve every item in review `4898914669` for PR #688, verify the fixes, respond to each thread, and push one signed focused commit to the PR head branch.

## Context

PR #688 targeted `main` at `08f1c39ad11a4868cc16e3e36ef12ebbf6ec2579` from `feat/pi-subagents-autonomous-workflow-planning` at `ae0677dd6368015ae645d590f28ff88afe99f6b7`.

GitHub merged the PR as `843b093ea52fe32774c036a998d13f4c7a7166a5` one second before the automated review was submitted, and the remote head branch was deleted.

The local PR head branch remains available and will be pushed without rewriting history.

The change touches automation contracts, settings consumption, planner selection, workflow compilation, persisted revision state, and deterministic tests.

Applicable extension convention MUST rules are deterministic behavior tests, pre-execution validation, settings consistency, generation revalidation, atomic state publication, CI-equivalent verification, and package inspection.

## Review Ledger

| Feedback | Final outcome | Evidence |
| --- | --- | --- |
| `discussion_r3751418944`: carry caller criteria into compiled contracts | Actionable and addressed | `applyRequestRequirements()` merges deduplicated caller criteria and evidence into bounded terminal, integration-owner, and verifier tasks before contracts, prompts, and persistence are compiled; focused compiler tests cover propagation and overflow rejection. |
| `discussion_r3751418952`: do not replenish an exhausted aggregate budget | Actionable and addressed | `reserveExecutionBudget()` returns no budget when reserved timeout, turns, or tool calls leave less than one; automation returns `execution-budget-exhausted` before planner, persistence, or workflow calls, covered across all three dimensions. |
| `discussion_r3751418956`: honor configured workflow task limits before execution | Actionable and addressed | The execution request now narrows `maxTasks` to `blocking.maxParallelTasks` before planning output is compiled or persisted; focused tests prove a synthesized-verifier overflow does not persist or execute and the boundary value of two remains admitted. |
| `discussion_r3751418961`: select the immutable built-in planner | Actionable and addressed | `getBuiltInAgent()` returns an isolated clone from the built-in catalog, and `runDefaultPlanner()` uses it instead of merged discovery; a same-name user definition plus model/thinking overrides cannot replace or mutate it in regression coverage. |
| `discussion_r3751418967`: rotate compiled plans returned by patches | Actionable and addressed | Patch results now derive task generations from the patched ledger, rotate execution-plan generations, and align compiled plan ID, workflow ID, workflow generation, and revision with the rotated record; focused tests compare record, compiled output, ledger, and prior execution-plan IDs. |

## Plan

- [x] Add focused failing regression tests for all five feedback items; all five failed for the reported reasons before implementation.
- [x] Fix request-requirement propagation at the compiler-owned acceptance boundary; compiled contracts, prompts, normalized plans, and overflow rejection are covered.
- [x] Fix aggregate planner/execution budget partitioning across timeout, turns, and tool calls; exhausted budgets launch neither planner nor workflow.
- [x] Apply the effective blocking task ceiling before compilation and persistence; synthesized verifier overflow returns a typed non-launch result.
- [x] Select an immutable built-in planner definition; a same-name user agent and settings override cannot replace it.
- [x] Rotate patched compiled identities and execution-plan task generations from the authoritative patched ledger; record, compiled result, and ledger agree.
- [x] Scan the full PR diff and sibling paths for the same requirement-loss, lower-bound replenishment, deferred-limit, override, and stale-generation patterns; no additional actionable instance survived review.
- [x] Run 391 focused Pi Subagents tests, package check, root `npm run check` with 2,939 tests, `git diff --check`, and `just pack subagents`; all passed.
- [x] Audit cancellation, session replacement, one-snapshot settings consistency, generation state, persistence ordering, terminal safety, and the final diff against both extension guides; no deviation remains.
- [x] Re-read the review after delivery, reply to and resolve all five threads, verify signed commit `b927c6ef`, push the recreated PR branch, and refresh PR #688 once; GitHub keeps the merged PR snapshot at `ae0677dd` even though the recreated branch contains the follow-up.

## Completion Checklist

- [x] Every ledger item has one evidence-backed final outcome.
- [x] Every actionable item is fixed at its owning boundary and has deterministic regression coverage.
- [x] Focused tests, the CI-equivalent gate, diff check, and package dry run pass.
- [x] Only intended files were staged, and signed commit `b927c6ef` verified with its configured ED25519 key.
- [x] The PR head branch was recreated and pushed without rewriting history, and all five addressed threads have verified responses and resolutions.
- [x] The refresh confirms the PR remains merged at `843b093e`, its immutable head snapshot remains `ae0677dd`, and its original CI remains successful; local follow-up evidence is recorded above.
