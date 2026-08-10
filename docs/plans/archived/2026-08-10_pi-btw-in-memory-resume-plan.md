# pi-btw in-memory Resume plan

## Goal

Add a minimal `/btw` Resume flow that uses Pi TUI Kit's existing `choice` screen to select any non-empty BTW side thread retained by the current extension instance.

## Context

- `/btw <question>` remains a fresh-thread fast path.
- Pi TUI Kit `choice` provides stable-ID selection, bounded navigation, descriptions, Back/Close semantics, TUI/RPC adaptation, and existing test support, but no search.
- Searchable single choice is tracked separately in `docs/roadmaps/pi-tui-kit-roadmap.md` Phase 7.
- The initial feature intentionally uses no files, settings fields, Pi custom session entries, or other persistence.

## Architecture

Keep an extension-instance-owned registry in `btw()`:

```ts
interface ResumableBtwThread {
  id: string;
  title: string;
  thread: SideThread;
  thinkingLevel: BtwThinkingLevel;
  createdAt: number;
  updatedAt: number;
}
```

- Create a fresh candidate for Start and `/btw <question>`.
- Add the candidate to the registry only after it records at least one answered or visible error turn.
- Keep all non-empty threads until the extension instance is replaced or unloaded.
- Sort Resume choices by `updatedAt` descending without mutating thread identity.
- Derive the fixed title from the first submitted question and sanitize it for terminal display.
- Show the question count as the Kit choice description.
- Reuse the selected `SideThread` and its latest local thinking level when resuming.
- Resolve model credentials again for every invocation and never retain authentication material in the registry.
- Update `updatedAt` only when a new answered or error turn is recorded; merely opening and closing Resume does not reorder the list.

The `/btw` main menu remains Start-first for compatibility:

```text
Start side thread
Resume side thread    # shown only when at least one thread is resumable
Settings
```

The Resume screen uses the first question as each stable label, newest activity first, and Escape to return to the main menu.

## Non-Goals

- Search, rename, delete, pin, tree relationships, custom names, disk persistence, or cross-session restore.
- Restoring an unsent composer draft, queued steering, or an interrupted answer.
- Reusing Pi's `SessionSelectorComponent` or imitating its filesystem, folder-scope, and session-management behavior.
- Changing `/btw <question>` into a follow-up route.

## Plan

- [x] Add focused failing menu tests in `packages/pi-btw/test/menu.test.ts` for conditional Resume visibility, Start-first compatibility, recent-first choice ordering, fixed first-question labels, counts, selection, Back, Close, narrow widths, and editor preservation. Evidence: the focused test build failed because `resumeThreads` does not exist.
- [x] Add focused failing command/state tests in `packages/pi-btw/test/btw.test.ts` and `packages/pi-btw/test/side-thread.test.ts` for multiple retained threads, stable IDs, selected-thread reuse, provider-history continuation, per-thread thinking-level reuse, fresh direct questions, empty/cancelled candidates, visible error turns, model re-resolution, and isolated extension instances. Evidence: the focused test build failed because resumable state and the deterministic `now` dependency do not exist.
- [x] Add an extension-instance registry and thread-state handoff in `packages/pi-btw/src/btw.ts`; verify no factory-load action methods, background resources, timers, settings writes, session entries, or authentication data are introduced. Evidence: focused command and thread tests pass, and the registry retains only thread messages, title, thinking level, ID, and timestamps.
- [x] Extend `packages/pi-btw/src/menu.ts` with a Kit `choice` Resume screen and typed selected-thread result while preserving the existing Settings flow, invalid-settings protection, Back/Close behavior, and TUI-only command boundary. Evidence: focused menu tests pass across selection, Back, Close, width bounds, and editor preservation.
- [x] Update `packages/pi-btw/README.md` to document first-question labels, recent-activity ordering, fresh direct questions, retained and discarded fields, and loss on `/new`, Pi `/resume`, `/reload`, extension replacement, or restart.
- [x] Add a minor Changeset for `@narumitw/pi-btw`; do not change the Pi TUI Kit dependency floor because the implementation uses the already-supported `choice` contract. Evidence: `.changeset/tidy-bats-resume.md` records the minor behavior change.
- [x] Run focused pi-btw tests, package typecheck/check, root `npm test`, and `npm run check`; inspect `just pack btw` because published behavior and README content change. Evidence: 121 focused tests passed; package check passed; root `npm run check` passed with 2,870 tests; the dry-run tarball contained the expected 12 files; Changesets selected a pi-btw minor; and a fresh-agent-directory `pi -e ./packages/pi-btw --list-models` smoke exited 0.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`, including custom-UI mode guards, width safety, terminal sanitization, IME ownership inherited from Kit, cancellation, disposal, stale contexts after every await, editor preservation, session replacement, settings ordering, and absence of new persistence. Evidence: the command retains its TUI guard; Kit owns choice rendering/focus/Back/Close; titles cross `sanitizeSingleLine`; existing fullscreen disposal and safe notifications remain unchanged; no settings or session entry is added; Pi's documented replacement flow creates a fresh extension instance; and the isolated-factory test proves closure state is not shared.

## Risks

- Long-lived sessions can retain many or large side threads in memory.
  The initial tradeoff is accepted because state is session-instance scoped and no arbitrary eviction policy has been approved.
- A resumed thread may continue with a different configured model.
  Re-resolving current credentials avoids stale secrets; prior assistant messages remain conversation history.
- Choice has no search and becomes less convenient as the list grows.
  The roadmap tracks a generic searchable picker rather than expanding this first implementation.

## Completion Checklist

- [x] `/btw` shows Start, Resume, and Settings when resumable threads exist, with Start still selected first.
- [x] Resume lists every non-empty in-memory thread by fixed first question and newest recorded activity.
- [x] Selecting an item continues that exact side conversation and local thinking level.
- [x] `/btw <question>` always starts a new thread.
- [x] Empty or cancelled threads are not listed, while completed visible errors are resumable.
- [x] Drafts, steering queues, interrupted answers, credentials, and contexts from replaced extension instances are not retained.
- [x] No settings schema, settings file, Pi session entry, package dependency floor, or disk state changes.
- [x] Documentation, Changeset, tests, package smoke, repository gate, and semantic audits are complete.
