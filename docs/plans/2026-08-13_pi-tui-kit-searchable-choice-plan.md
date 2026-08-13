# Pi TUI Kit Searchable Choice Plan

## Goal

Qualify and, only with two compatible consumer needs, add optional TUI search to the existing declarative `choice` screen while preserving raw stable identity, deterministic RPC selection, lifecycle outcomes, and extension-owned domain behavior.

## Context

The current `choice` screen confirms one raw item ID and supports current and initial identity, descriptions, details, disabled reasons, paging, Back, Close, TUI, and RPC.

The current `choice` screen does not support search.

`browse` and searchable `multiSelect` already prove TUI fuzzy search, `searchText`, IME focus forwarding, control sanitization, no-match behavior, stable-ID restoration, and deterministic unfiltered RPC degradation inside Pi TUI Kit.

Pi BTW's in-memory Resume screen is the first concrete searchable-choice candidate because it presents user-owned thread titles and stable thread IDs.

Potential second candidates include long or variable Worktree selection, Recall's standard Save Message choice, and Pi Chat's public-room or participant choices, but none should be enrolled without evidence that search solves a real scan or recall problem and preserves its existing action contract.

Recall's separate scoped picker, File Context explorer, Pi session management, delete actions, scope switching, persistence, and tree navigation are not evidence for this narrow screen contract.

## Architecture

The preferred candidate shape is additive `enableSearch?: boolean` on `ChoiceScreen` and `searchText?: string` on `MenuChoiceItem`.

TUI search filters sanitized labels, descriptions, and explicit non-rendered `searchText` while actions continue to receive the original raw item ID.

The query belongs only to the current screen instance and is not persisted by the Kit.

The selected item is restored by stable raw ID after filtering, query clearing, resize, action rejection, and return navigation whenever that item remains visible.

Disabled rows remain searchable, focusable, explanatory, and inert.

Details describe the focused result but never become implicit search metadata unless the consumer explicitly supplies safe metadata through `searchText`.

RPC presents one deterministic unfiltered selector and does not claim an interactive search protocol.

Print and JSON retain their current unsupported-mode behavior.

The implementation should reuse internal search and selection primitives only when doing so deletes duplicated policy without coupling `choice`, `browse`, and `multiSelect` domain semantics.

## User Experience States

- Empty input shows the consumer-provided ordering and existing initial or remembered selection.
- A non-empty query shows matching rows without changing raw IDs or consumer ordering among equal matches unless the approved fuzzy-search contract already defines ranking.
- No match keeps the search field editable, shows a non-color textual empty state, and preserves a recoverable selection for query clearing.
- Disabled matches remain visible with their unavailable reason and cannot invoke the action.
- Rejected or failed actions retain both the query and selected raw ID for correction or another choice.
- Escape follows the screen's Back or Close hint, while Ctrl+C closes the whole menu.
- Owner replacement, shutdown, and external disposal settle as stale and never invoke a choice action.
- Narrow widths and resize preserve the search field, recognizable labels, selected details, and complete frame bounds.

## Non-Goals

- Do not add a new session picker, domain record store, filesystem scan, ordering policy, scope selector, rename, delete, trash, tree, persistence, or recent-item policy.
- Do not make live cursor movement invoke preview side effects; `runLiveChoice()` remains the owner for bounded live-preview selection.
- Do not add action rows, bulk actions, multiple selection, free-text submission, editor fallback, wizard steps, or forms to `choice`.
- Do not index detail-document bodies, secrets, full transcripts, or other large or sensitive content implicitly.
- Do not change ordinary choices unless `enableSearch` is explicitly set.
- Do not release the Kit API together with its first consumer or publish without explicit user approval.

## Risks

- Adding search because a list can be long, rather than because users need it, would increase focus and navigation cost for small choices.
- Fuzzy ranking can reorder consumer-provided recent-first lists and make the initial selection appear unstable.
- Sanitized duplicate labels can lose identity if adapters infer IDs from display strings.
- Searching details or raw IDs can disclose sensitive or implementation-only values.
- Reusing browse or multi-select code too mechanically can import read-only detail or toggle semantics into single choice.
- A zero-major dependency range can hide an unpublished API through workspace hoisting, so release and clean-install gates are mandatory.

## Rollback / Recovery

The new fields must be optional and preserve existing screen behavior when omitted.

Consumer migrations can be reverted independently to ordinary `choice` without removing the additive Kit contract.

If post-release evidence rejects the UX, stop further adoption and record the API disposition before considering a separately approved deprecation.

No persisted data migration is involved because query and selection presentation remain interaction-local.

## Evidence

- PR #744 added optional `enableSearch` and `searchText` to API 12 after red-first TUI/RPC tests and review feedback coverage for retained-query cursor restoration.
- The `@narumitw/pi-tui-kit@0.54.0` registry package exposes API 12 and compiles a searchable-choice fixture from a clean NodeNext installation.
- BTW Resume is newest-first in-memory data with first-question labels, question-count descriptions, possible duplicate titles, and raw thread IDs.
- Worktree Switch and Remove share a variable Git-owned list with displayed path/state labels, explicit path/branch/HEAD search metadata, raw path IDs, and mandatory post-selection identity revalidation.
- BTW PR #748 and Worktree PR #749 have passing focused tests, package checks, root gates, package dry-runs, and CI.

## Plan

### Phase 1: Consumer qualification

- [x] Document BTW Resume ordering, first-question labels, counts, duplicate-title behavior, in-memory lifetime, and the cost of selecting the wrong raw thread.
- [x] Inventory variable standard choices and select Worktree identity selection as an independent compatible consumer.
- [x] Verify both consumers need only local search plus stable-ID confirmation; scope, delete, preview, persistence, loading, and domain actions remain outside the Kit.
- [x] Build and test the shared matrix for ordering, raw ID, labels, descriptions, explicit metadata, duplicates, disabled and empty states, exits, stale ownership, rejection, RPC, and unsupported modes.
- [x] Preserve BTW session-owned thread state and Worktree Git inventory, identity revalidation, destructive confirmation, and session switching.
- [x] Map the contract to TUI, IME, terminal-safety, lifecycle, package, Changeset, release, and consumer-mode MUST rules.

### Phase 2: UX and public contract approval

- [x] Exercise empty query, matches, no match, disabled match, duplicate labels, narrow widths, details, and injected keybindings through focused component tests.
- [x] Use the existing Kit fuzzy ranking for non-empty queries while empty queries preserve source order.
- [x] Search sanitized label, description, and explicit `searchText`; details and raw IDs stay excluded unless a consumer intentionally supplies safe metadata.
- [x] Use additive `enableSearch?: boolean` and `searchText?: string` fields on the existing choice contract.
- [x] Treat the user's active roadmap implementation objective as approval for the bounded cross-consumer interaction described in this saved plan.

### Phase 3: Kit-only implementation

- [x] Add red-first public type and package-root declaration tests and advance the compatibility marker to API 12.
- [x] Add TUI tests for filtering, fuzzy ranking, stable raw IDs, duplicate labels, selection, query clearing, no match, disabled reasons, rejection, and empty items.
- [x] Cover IME focus, pasted controls, Back, Close, owner abort, external disposal, narrow widths, resize, and bounded frames across searchable-choice and existing runtime suites.
- [x] Prove RPC remains one deterministic unfiltered selector with stable duplicate-label identity and unchanged ordinary choices.
- [x] Implement opt-in search in the existing choice component using shared fuzzy filtering without importing browse or multi-select domain semantics.
- [x] Keep raw IDs separate and restore selection and query across filtering and rejected actions.
- [x] Update README guidance, public types, API metadata, and root usage fixtures.
- [x] Add a Kit-only minor Changeset without consumer adoption in the API PR.
- [x] Pass complete Kit tests/checks, runtime benchmark, boundaries, root gate, diff check, and package dry-run; inspect runtime and declarations.
- [x] Audit focus, terminal sanitization, bounds, retained-query cursor editing, stale/disposal behavior, RPC identity, and unchanged ordinary choices.

### Release gate

- [x] The user chose to perform the merge and publication themselves before consumer implementation continued.
- [x] Verify `@narumitw/pi-tui-kit@0.54.0` through `npm view`, its 61-file tarball, runtime API 12 import, and a clean NodeNext searchable-choice fixture.
- [x] Record `0.54.0` as the registry-visible compatibility floor before consumer manifests changed.

### Phase 4: BTW proof consumer

- [x] Create `feat/pi-btw-searchable-resume` from current `origin/main`, raise only BTW's Kit floor to `^0.54.0`, refresh the lockfile, and verify resolution.
- [x] Enable Resume search without changing raw thread IDs, in-memory loading, newest-first ordering, titles, counts, persistence lifetime, command modes, Back, Close, or session ownership.
- [x] Cover no-match recovery, duplicate titles, raw-ID confirmation, narrow width, Back, Close, disposal, and the existing empty/no-Resume state.
- [x] Add a minor Changeset and pass 35 focused tests, package check, root gate, dependency verification, diff check, the 12-file package dry-run, and PR #748 CI.
- [ ] Run an interactive Pi Resume smoke; the deterministic public TUI harness covered the complete flow, but an interactive terminal was not opened.

### Phase 5: Worktree proof consumer

- [x] Create `feat/pi-worktree-searchable-selection` from current `origin/main`, raise only Worktree's Kit floor to `^0.54.0`, refresh the lockfile, and verify resolution.
- [x] Enable the shared Switch/Remove identity selector search over displayed labels plus explicit path, branch, and HEAD metadata while returning the raw path ID.
- [x] Preserve Git inventory, source order, label formatting, identity revalidation, removal confirmation, mutation policy, RPC behavior, and session switching.
- [x] Add a minor Changeset and pass 32 focused command/Git tests, package check, root gate, dependency verification, diff check, the 10-file package dry-run, and PR #749 CI.
- [x] Fix one CI-only test ambiguity caused by fuzzy ranking by querying both path and branch terms; the production contract was unchanged and the complete root gate passed again.
- [ ] Run an interactive Pi switch smoke; the deterministic public TUI harness covered the flow, but an interactive smoke would replace the active coding session.

### Phase 6: Completion decision

- [x] Update the roadmap with API 12, release order, open proof migrations, fuzzy-ranking behavior, and retained domain boundaries.
- [x] Treat BTW and Worktree only as proof evidence, not an adoption target or reason to widen the API.
- [x] Audit the Kit and consumer diffs: no session, scope, delete, tree, persistence, preview, Git mutation, or action-bearing catalog policy entered Pi TUI Kit.

## Completion Checklist

- [x] BTW and Worktree prove the same searchable stable-ID choice need with independent domain owners.
- [x] Search is opt-in, TUI-local, IME-safe, terminal-safe, width-bounded, and preserves raw identity plus lifecycle outcomes.
- [x] RPC remains deterministic and unfiltered.
- [x] Ordinary choice, browse, multi-select, and live-choice remain compatible and separately owned.
- [x] API 12 was independently published and registry-verified before consumer adoption.
- [x] Both proof consumers preserve domain ordering, loading, validation, actions, persistence, and session ownership.
- [ ] Consumer PRs #748 and #749 pass but remain unmerged, and interactive smoke limitations remain recorded rather than performed.
- [x] Publication occurred through the user's explicitly chosen merge-and-publish path.
- [ ] Archive this plan only after both consumer PRs merge or receive a final disposition and the unavailable interactive-smoke paths are accepted.
