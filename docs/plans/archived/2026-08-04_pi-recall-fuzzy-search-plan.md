# Pi Recall fuzzy search implementation plan

## Goal

Add visible, transient TUI fuzzy search to Pi Recall's scoped saved-message picker without changing RPC, storage, command, or quote semantics.

## Architecture

- Keep `ScopedRecallPicker` extension-owned because it combines scope switching with saved-message selection.
- Use Pi TUI's public `Input` and `fuzzyFilter` over message text, role, and optional session name.
- Apply scope filtering before search; retain the scope total separately from the current match count.
- Carry the transient query through picker results so one `/recall` interaction can restore it after selected-message navigation.
- Keep Pi TUI Kit unchanged: it already consumes Pi TUI's generic fuzzy primitive, while pi-file-context's typo/path scorer remains domain-specific.

## Non-Goals

No typo-edit-distance matching, RPC search, persistent query, settings, storage/schema changes, package metadata changes, publication, tag, merge, or release.

## Plan

- [x] Add focused failing picker tests for visible search, content/role/session matching, relevance order, scope-before-search behavior, match counts, empty/no-match/overlong states, safe pasted controls and spaces, selection restoration, query persistence, focus forwarding, disposal, and narrow-width rendering. Evidence: the focused compile failed because `initialQuery` was absent from the picker contract.
- [x] Implement bounded `Input`-driven fuzzy filtering in `experimental/pi-recall/src/picker.ts`; verify focused picker tests pass. Evidence: focused picker suite passes 9/9.
- [x] Add a failing menu-flow test for same-interaction query restoration and fresh-flow reset; implement the smallest state handoff in `experimental/pi-recall/src/menu.ts` while preserving RPC behavior. Evidence: the new menu test first reopened with an empty Search row, then passed after the query handoff; menu suite passes 8/8 and the existing RPC scope/list test remains green.
- [x] Update `experimental/pi-recall/README.md`; verify package typechecking and Biome. Evidence: README documents fields, semantics, reset/limit behavior, and RPC; `npm run check --workspace @narumitw/pi-recall` passes.
- [x] Run focused Pi Recall tests, `npm run check:boundaries`, full `npm run check`, and `just pack recall`; inspect dry-run contents. Evidence: Pi Recall passes 35/35 focused tests; boundary validation passes for 1 library and 25 active extensions; a clean normal clone under CI's Node 24/npm 11 path with latest Pi passes all 2,344 root tests and gates; dry-run pack contains only the 9 manifest-allowed files and leaves no tarball.
- [x] Audit the final diff against `docs/extension-conventions.md` for custom TUI rendering, focus, input sanitization, cancellation/disposal, TUI/RPC behavior, documentation, tests, and package boundaries; settings guidance remains inapplicable. Evidence: search is TUI-only and visibly labeled; lines are tested width-safe; `Focusable`, invalidation, control replacement, disposal, Back/Close, lifecycle ownership, and unchanged RPC are covered; no settings, metadata, storage, or dependency boundary changed.
- [x] Mark all evidence complete and archive this plan at `docs/plans/archived/2026-08-04_pi-recall-fuzzy-search-plan.md` without changing the earlier archived implementation plan. Evidence: all plan and completion items are checked before the archive move.

## Completion Checklist

- [x] Body, role, and session-name queries filter and relevance-rank only records in the active scope using standard Pi fuzzy semantics; non-searchable local metadata is covered.
- [x] Scope totals, active match counts, empty/no-match/overlong states, and all keyboard hints are visible and width-safe.
- [x] Query, selected ID, and prior-selection restoration behave correctly across filtering, scope changes, and same-flow navigation; a new flow resets to an empty query and Current cwd.
- [x] Controls are removed from query input, spaces support multiple tokens, overlong queries do not run matching, and disposal/focus semantics satisfy Pi's custom TUI contract.
- [x] Escape/Ctrl+C, RPC dialogs, JSONL storage, editor drafts, command behavior, and quote format remain unchanged.
- [x] Focused tests, package checks, boundaries, root CI-equivalent checks, and package dry run pass.
