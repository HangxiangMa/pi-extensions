# Pi TUI Kit Pull Request 685 Feedback Plan

## Goal

Resolve every feedback item on pull request #685 with a verified fix, thread response, signed commit, and push to `feat/pi-tui-kit-browse-detail-document`.

## Context

The exact target is https://github.com/narumiruna/pi-extensions/pull/685 from `feat/pi-tui-kit-browse-detail-document` into `main`.
The reviewed head was `4a0358bf4dc2cc48d897e4dce5f8fb19de7cc2a9`, and this worktree was clean before feedback work began.
The pull request had one successful CI check, one submitted Codex review, one unresolved inline thread, and no conversation comments.
The touched area is synchronous read-only TUI browse and review document rendering in the reusable `pi-tui-kit` library.
Applicable convention MUST rules are width-bounded and terminal-safe rendering, themed-cache invalidation, deterministic behavior tests, the root CI-equivalent gate, and package inspection because published package source changed.
Settings, commands, asynchronous work, session replacement, shutdown resources, and extension-owned lifecycle are not touched.

## Review Ledger

| Feedback | Final outcome | Evidence |
| --- | --- | --- |
| `browse.ts`: cache exact detail formatting across renders by document content, format, and width, and clear themed output from `invalidate()` | Actionable and addressed | Fix commit `69228f204fddf0ec9d321f54d3c72b93e16e6a68` adds one shared single-entry cache keyed by content, format kind and fields, and width; browse and the same-pattern review path reuse it, and each component clears it from `invalidate()`. Focused regressions prove scroll reuse plus width, content, format, and invalidation recomputation. |
| Codex submitted-review wrapper for commit `4a0358bf4d` | Outdated or superseded | The wrapper is informational and its single inline finding is tracked separately above. |

## Plan

- [x] Add a focused regression proving unchanged scroll renders reuse exact formatted lines while content, format, width, and invalidation changes recompute them; the new browse assertion failed `24 !== 12` before implementation and passes afterward.
- [x] Cache exact browse detail formatting at component scope without changing legacy prose, search, navigation, width, terminal-safety, or disposal behavior; the cache retains only one formatted document and validates every output-affecting input.
- [x] Scan the full pull-request diff and sibling exact-document rendering for the same repeated-formatting pattern; review rendering had the same render-time work, so both components now use the shared internal cache and review has its own reuse and invalidation regression.
- [x] Run verification sequentially where Kit build output is shared; 20 focused browse and review tests, all 170 Kit tests, the complete Kit check, final root `npm run check` with 268 files and 2,902 tests, `git diff --check`, and the 59-file `just pack tui-kit` dry run pass. The first Kit-suite attempt correctly exposed missing built output and passed after the required Kit build. The first two root runs exposed unrelated timing failures in `pi-sync` and `pi-worktree`; each passed alone, and the clean final root rerun passed completely.
- [x] Re-read all pull-request reviews, inline comments, conversation comments, and thread state; no new feedback appeared, the final diff has no whitespace errors, and an independent scoped reviewer reported no confirmed findings.
- [x] Reply to and resolve the inline thread only after verification; reply `discussion_r3751124751` cites the implementation and passing checks, and GraphQL confirmed thread `PRRT_kwDOSW8GGM6X7tkG` is resolved.
- [x] Stage only the five implementation and regression files, create signed conventional fix commit `69228f204fddf0ec9d321f54d3c72b93e16e6a68`, and push it without rewriting history. Archive this completed ledger in a separate signed documentation commit, push it, then perform the required single post-push pull-request refresh.

## Completion Checklist

- [x] Every feedback item has an evidence-backed final outcome.
- [x] Scroll-only renders no longer reformat unchanged exact documents.
- [x] Cache invalidation and changed document inputs cannot reuse stale themed output.
- [x] Required tests, checks, and package inspection pass.
- [x] The review thread is answered and resolved only after verification.
- [x] The signed fix commit is pushed without rewriting history.
