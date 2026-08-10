# Pi Tool Pull Request 679 Feedback Plan

## Goal

Resolve every feedback item on pull request #679 with a verified fix, thread response, signed commit, and push to `feat/pi-tool-browser`.

## Context

The exact target is https://github.com/narumiruna/pi-extensions/pull/679 from `feat/pi-tool-browser` into `main`.
The pull request was merged as `36321964b02dbb9d9cd1c0946a2a3f7aad93d071` before the automated review was submitted, and GitHub deleted the remote head branch.
The local target branch remained at reviewed commit `6a032290452c8226aa7f40d532954987a4ad0360` with a clean working tree before this plan was created.
The submitted review contains one unresolved inline finding and no conversation comments.
The pull-request CI check and the post-merge CI check both pass.
The touched areas are exact document rendering in the `/tool` TUI and RPC detail paths, terminal-safe display, package tests, and release documentation.
Applicable convention MUST rules are width-bounded and terminal-safe custom rendering, cancellation and disposal ownership, deterministic behavior tests, a release changeset, the root CI gate, and package inspection.

## Review Ledger

| Feedback | Current outcome | Evidence |
| --- | --- | --- |
| `tool-catalog.ts`: preserve indentation in nested parameter schemas in TUI and RPC detail views | Already addressed by the current code | `tool-catalog.ts` keeps the pretty JSON as one exact document and both mode paths use Pi TUI Kit's cell-aware `review` renderer; regressions assert two- and four-space nesting in RPC and TUI, including a 20-column TUI. |
| Codex submitted-review wrapper for commit `6a03229045` | Outdated or superseded | The wrapper is informational and names the reviewed commit; its single inline finding is tracked separately above. |

## Plan

- [x] Add focused regressions that exercise nested schema details through the real TUI and RPC display boundaries and fail when indentation is flattened; both mode assertions failed against reviewed commit `6a032290` and now pass.
- [x] Fix exact schema rendering at the owning `pi-tool` boundary without relying on an unpublished Pi TUI Kit release; the installed `@narumitw/pi-tui-kit@0.51.0` review API preserves document whitespace.
- [x] Scan the full pull-request diff and sibling exact-text paths for the same whitespace-loss pattern; the parameter schema is the only exact-text document in the package, while prose metadata remains safely normalized at list boundaries.
- [x] Audit width bounds, terminal sanitization, cancellation, disposal, session replacement, shutdown, and RPC navigation against `docs/extension-conventions.md`; focused tests cover narrow widths, controls, back-state preservation, replacement, shutdown, and scripted RPC pages.
- [x] Run focused package tests, `git diff --check`, the CI-equivalent `npm run check`, and `just pack tool`; 8 focused tests, all validators, 2,888 root tests, and the 7-file dry-run pack pass, and the local print-mode smoke reports the expected observable rejection. The first root run exposed one unrelated `pi-sync` timing failure that passed alone and in the clean full rerun.
- [x] Re-read all pull-request feedback and inspect the final diff; both ledger items have final evidence-backed outcomes, and an independent scoped reviewer reported no findings.
- [ ] Reply to and resolve the addressed review thread only after verification.
- [ ] Create signed conventional commits, push them to the recreated `feat/pi-tool-browser` branch without rewriting history, then refresh the pull request once.

## Completion Checklist

- [x] Every feedback item has an evidence-backed final outcome.
- [x] Nested schema indentation remains visible in both TUI and RPC detail views at narrow and ordinary widths.
- [x] Terminal controls remain stripped and every rendered TUI line remains width-bounded.
- [x] Required checks and smokes pass with the initial unrelated timing failure recorded above.
- [ ] The review thread is answered and resolved only after verification.
- [ ] The signed fix commit is pushed without rewriting history.
