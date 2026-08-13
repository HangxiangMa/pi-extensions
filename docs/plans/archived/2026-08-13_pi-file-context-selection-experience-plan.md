# Pi File Context selection experience plan

## Goal

Make selecting context feel like one coherent next-prompt workflow by clarifying state, supporting repeated selection, keeping primary controls visible, and showing cancellable scanning from every entry route.

## Architecture

- Keep exact snapshots, aggregate limits, prompt injection, widget ownership, and lifecycle guards in `packages/pi-file-context/src/file-context.ts`.
- Keep file, content, line-range, and Git navigation inside `FileQuoteExplorer`, with a callback for adding a snapshot without disposing the explorer.
- Keep standard selected-context review in `file-context-menu.ts`, using Pi TUI Kit choice and review screens so preview precedes removal.
- Preserve `F8`, `/file-context browse`, `/file-context remove`, normal `@path` references, XML injection syntax, and current cancellation semantics.

## Non-Goals

- Do not add persistence, quote editing, undo, bulk clearing, or reordering in this focused change.
- Do not change file discovery limits, Git provenance, settings storage, non-TUI support, or prompt injection ordering.
- Do not add a discovery cache that could hide files created during the current session.

## Risks

- A keep-browsing action could append twice or lose the originating search state unless it bypasses the explorer close result cleanly.
- A scanning loader on direct routes adds a second custom TUI handoff and must remain cancellable and lifecycle-safe.
- More preview state could recreate narrow-terminal truncation unless primary actions and advanced help are tested at constrained widths.
- Menu terminology changes must not remove the established `remove` compatibility route.

## Plan

- [x] Add focused failing tests for selected-context terminology, preview-before-remove, add-and-continue, visible capacity, adaptive primary hints, advanced help, and direct-route cancellable scanning; the menu test failed in four vocabulary/review paths, the explorer test lacked capacity/help, and direct routes timed out before a loader existed.
- [x] Update `file-context-menu.ts` so the menu presents next-prompt context, opens an exact review before removal, and preserves identity-safe repeated removal and compatibility entry routes.
- [x] Update `file-context-explorer.ts` and lifecycle wiring so `A` adds and keeps browsing, preview hints remain useful at narrow widths, `?` exposes Git and range actions, and capacity is visible before adding.
- [x] Route all explorer discovery through the existing cancellable Pi TUI Kit task while preserving stale-session, disposal, error, Back, and Close behavior.
- [x] Update the widget, notifications, README, package layout guidance, and a minor Changeset to use one selected-context vocabulary and document the new controls.
- [x] Audit the full diff against `docs/extension-conventions.md`, including TUI mode guards, async cancellation, component disposal, stale awaits, width safety, terminal sanitization, command compatibility, and deterministic tests; direct and menu scans share one abort-aware task, explorer disposal stays session-owned, every rendered line is bounded, established command routes remain, and independent review findings for stale help requests, short-terminal help, and per-snippet capacity warnings were fixed with regressions.
- [x] Run focused File Context tests, package typecheck and formatting, `npm run check`, Changesets status, `just pack file-context`, and a non-interactive Pi load smoke; 68 focused tests, all 3,707 root tests on the final successful gate, package checks, the 14-file tarball, and offline RPC `get_commands` registration pass.
- [x] Inspect the final diff and create a signed Conventional Commit containing the focused implementation, tests, docs, plan, and Changeset.
- [x] Push `worktree/rapid-field-7396` and open pull request [#735](https://github.com/narumiruna/pi-extensions/pull/735) with checks, package-smoke evidence, audit scope, and the unverified live-TUI path.

## Completion Checklist

- [x] `F8`, `/file-context browse`, and menu Add all show the same cancellable scan state before browsing; focused tests cover direct completion/cancellation and menu cancellation/error recovery.
- [x] Enter still adds one snippet and closes, while `A` adds the same exact snapshot and returns to the originating file or content results without duplicate insertion.
- [x] The preview shows selection size and resulting next-prompt capacity, keeps primary actions discoverable at narrow widths, and exposes advanced actions through `?`.
- [x] `/file-context` reviews exact selected context before removal, and cancellation never mutates selected snippets.
- [x] Existing references, Git provenance, quote limits, injection order and syntax, command compatibility, lifecycle cleanup, and non-TUI rejection remain covered by 68 focused tests.
- [x] Documentation, Changeset, repository gate, package contents, signed commit, pushed branch, and pull request match the implemented behavior.
