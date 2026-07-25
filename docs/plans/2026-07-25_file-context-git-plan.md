# File Context Git integration plan

## Goal

Add bounded, read-only Git provenance and navigation to `pi-file-context`: file status, repository identity, backward-compatible quote metadata, changed hunks, blame, history, revision browsing, and explicit diff context.

## Architecture

- Keep filesystem discovery/loading and quote formatting in `src/file-context.ts`.
- Add `src/git-context.ts` as the sole Git process boundary. It will invoke `git` without a shell, disable pagers/external diff/textconv where applicable, bound output/time, normalize deterministic records, and degrade cleanly outside a repository.
- Extend `src/file-context-explorer.ts` with progressively disclosed Git states. Repository/status context stays visible; blame, history, revision input, and diff views appear only when requested and preserve a clear Escape path.
- Preserve `/file-quote`, `@` behavior, whole-file references, and the existing `<user_file_quote path="…" lines="…">` shape. Git provenance uses ordered optional attributes, so non-Git quotes remain byte-for-byte compatible.

## Plan

- [x] Added focused repository/file-status tests; they first failed on the missing Git module, then passed with shell-free, timeout/output-bounded Git discovery and non-repository fallback in `git-context.ts`.
- [x] Added a focused optional-provenance test; it first failed on the four-argument quote API, then passed with ordered optional Git attributes and SHA-256 content identity while legacy output stayed unchanged.
- [x] Added a focused explorer Git test; it first failed on the absent Git adapter, then passed with textual status codes, branch/HEAD/dirty preview context, changed-line gutters, cyclic hunk selection, token estimates, and provenance-bearing attachment.
- [x] Added focused blame/history disclosure tests; the explorer test first failed on absent detail handling, then passed with request-owned async blame, bounded history, author-email omission, width-safe rendering, and Escape recovery.
- [x] Added focused revision/diff tests; the explorer test first failed on absent revision state, then passed with validated commit/branch resolution, bounded historical file loading, explicit diff view/hunk attachment, token estimates, and provenance that distinguishes revision/worktree/diff sources.
- [x] Updated the package README with Git controls, optional provenance semantics, privacy/output bounds, deterministic token estimates, non-repository fallback, limitations, and the new Git module; focused legacy workflow tests remain green.
- [x] Ran focused tests and the full repository gate (1,402 passing tests), inspected the seven-file package dry run, and loaded the extension through isolated Pi.
- [ ] Commit the bounded Git integration, update PR #405, then archive this completed plan.

## Completion Checklist

- [x] File list and preview expose deterministic textual status plus branch/HEAD/dirty information without relying on color alone.
- [x] Git-backed quotes include ordered provenance and a SHA-256 content identity; non-Git quote syntax remains unchanged in regression tests.
- [x] Users can navigate changed hunks, inspect blame/history, load a validated revision, and attach explicit diff context.
- [x] Git calls are read-only, shell-free, pager/external-diff/textconv/fsmonitor-safe, bounded, and non-repository tolerant.
- [x] File, preview, history, revision, and diff states are width-safe, keyboard-operable, cancellable, and show bounded failures.
- [x] `npm run check`, seven-file package inspection, and isolated Pi loading pass.
