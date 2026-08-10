# Pi Subagents Delegation Intelligence Pull Request Feedback Plan

## Goal

Resolve every feedback item on pull request #662 with verified fixes, thread responses, signed commits, and pushes to the existing branch.

## Context

The target is https://github.com/narumiruna/pi-extensions/pull/662 from `feat/pi-subagents-delegation-intelligence` into `main`.
The working tree was clean at commit `4d50d2300e913c43e79851f994d09559e1115ab5` before this plan was created.
The pull request had one submitted automated review, four unresolved inline threads, no conversation comments, and a passing CI check.
The graph index `pi-extensions-quiet-valley-ee3d` matched the worktree, branch, and original HEAD, but focused searches did not index the new symbols, so source and full merge-base diff inspection were the authoritative fallback.

## Review Ledger

| Feedback | Final outcome | Evidence |
| --- | --- | --- |
| `adaptive-scheduler.ts`: identical-string checks miss hierarchical write/write and read/write scope overlap | Already addressed by the current code | Scheduler scopes now normalize separators and dot segments, treat absolute or escaping scopes conservatively, and check write/write plus read/write ancestry against selected and active work; focused regressions cover both batch and active-read conflicts. |
| `execution.ts`: production workflows never use `WorkItemPersistence` | Already addressed by the current code | Explicit workflow creation, starts, settlements, cancellation finalization, and terminal state now pass through atomic mode-0600 session persistence; `list_workflows` and `get_workflow` expose bounded redacted snapshots, and running records inspect as interrupted without replay. |
| `capability-router.ts`: agents with omitted `tools` cannot satisfy required default tools | Already addressed by the current code | Omitted tool lists resolve to Pi's installed default `read`, `bash`, `edit`, and `write` set for routing and enforce-mode intersection; regressions cover manifested and manifest-less workers plus rejection of non-default `grep`. |
| `result-contract.ts`: empty, whitespace-only, or duplicate artifact IDs reach throwing ledger settlement | Already addressed by the current code | Structured-v2 parsing validates normalized IDs, non-empty kinds and optional settlement fields, rejects duplicate IDs, and the workflow integration regression proves malformed output becomes `contract-invalid` with a failed WorkItem rather than throwing; stored duplicate artifacts are also rejected. |
| Codex submitted-review wrapper for commit `4d50d2300e` | Outdated or superseded | The wrapper is informational and names the original reviewed commit; its four inline findings are tracked separately above and the replacement fix commit will be linked in the thread replies. |

## Plan

- [x] Confirm each finding against its caller, lifecycle, and error path, and scan the full pull-request diff for the same failure class; the scan found sibling default-tool enforcement and stored-artifact uniqueness paths, which were fixed too.
- [x] Add focused failing regressions for scope overlap, workflow persistence, default tools, and malformed artifact identifiers; the pre-fix run failed six intended assertions across five files.
- [x] Fix each issue at its owning boundary while preserving cancellation, generation, trust, output, and atomic persistence guarantees.
- [x] Audit the final changes against `docs/extension-conventions.md` and `docs/extension-settings.md`; no settings changed, tool actions are documented and tested, writes are serialized and atomic, inspection is read-only and bounded, and workflow finalization persists after abort or replacement before status cleanup.
- [x] Run focused tests, `npm run check`, `git diff --check`, `just pack subagents`, and an RPC extension-load smoke; 312 package tests, 2,758 root tests, all validators, the 85-file pack, and `get_state` passed.
- [x] Re-read every pull-request feedback item and inspect the final diff; every item has the evidence-backed outcome recorded above.
- [ ] Reply to and resolve each addressed review thread only after the verified fix commit is pushed.
- [ ] Archive this completed plan, create any final signed documentation commit, push without rewriting history, and refresh pull request #662 once.

## Completion Checklist

- [x] Every feedback item has an evidence-backed final outcome.
- [x] Every actionable item is fixed and covered by deterministic regression tests.
- [x] Required checks and package/runtime smokes pass with no concealed failures.
- [ ] Review threads are answered and resolved only after verification.
- [ ] Signed commits are pushed without rewriting history.
