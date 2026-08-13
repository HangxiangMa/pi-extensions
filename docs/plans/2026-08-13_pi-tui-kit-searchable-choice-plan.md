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

## Plan

### Phase 1: Consumer qualification

- [ ] Measure and document the current BTW Resume list shape, ordering, labels, duplicate-title behavior, interaction frequency evidence if available, and failure cost; do not infer a search need from list capability alone.
- [ ] Inventory standard `choice` screens with variable user-owned rows in Worktree, Recall, Chat, Analytics, Fleet, and File Context; identify candidates whose only missing behavior is local search and stable-ID confirmation.
- [ ] Select at least one independent second consumer with an evidence-backed search job, or record a finite no-go and stop before changing the Kit.
- [ ] Build a shared behavior matrix for both proof consumers covering initial ordering, raw ID, labels, descriptions, explicit search metadata, duplicate labels, disabled rows, details, empty data, Back, Close, stale owner, action rejection, RPC, and unsupported modes.
- [ ] Verify that neither proof consumer requires scope changes, delete actions, live previews, persistence, domain loading, action rows, or a different cancellation contract.
- [ ] Capture focused pre-change tests and map the proposal to TUI, IME, terminal-safety, lifecycle, package, Changeset, release, and consumer-mode MUST rules from `docs/extension-conventions.md`.

### Phase 2: UX and public contract approval

- [ ] Produce focused component examples for empty query, matches, no match, disabled match, duplicate sanitized labels, narrow width, and selected details using current Pi theme and injected keybindings.
- [ ] Decide whether matching preserves source ordering or uses the existing Kit fuzzy ranking, and document the choice with both consumers' ordering requirements.
- [ ] Decide the exact search corpus from sanitized label, description, and explicit `searchText`, and prove details plus raw IDs remain excluded unless intentionally copied into safe metadata.
- [ ] Confirm the additive `enableSearch` and `searchText` shape or record why a different minimal contract is required; do not add a new screen kind without a separate approved architecture decision.
- [ ] Obtain explicit user approval of the substantial cross-consumer interaction proposal before editing production UI files.

### Phase 3: Kit-only implementation

- [ ] Add failing public type and package-root declaration tests for optional searchable choice fields and the explicit compatibility-marker decision.
- [ ] Add failing TUI tests for filtering, source-order or approved ranking, stable raw ID, duplicate labels, initial and current selection, query clearing, no match, disabled reasons, details, rejected retries, and empty items.
- [ ] Add failing TUI lifecycle tests for IME focus, pasted controls, Escape Back, hinted Close, Ctrl+C Close, owner abort, `isCurrent()` failure, external disposal, resize, narrow widths, and complete frame bounds.
- [ ] Add failing RPC tests proving one deterministic unfiltered selector, duplicate-label identity, disabled-row behavior, action rejection, signal cancellation, and unchanged non-search choices.
- [ ] Implement optional search in the existing choice component and reuse internal search helpers only where behavior matrices prove exact compatibility.
- [ ] Preserve raw item IDs outside rendered strings and revalidate the selected item after every filter, resize, return, and asynchronous action boundary.
- [ ] Update the Kit README, examples, public types, API compatibility metadata when applicable, and root usage fixtures with TUI-only search and RPC degradation guidance.
- [ ] Add a Kit-only minor Changeset and verify that no consumer source or dependency floor adopts the unpublished fields.
- [ ] Run the complete Kit check and tests, runtime import benchmark, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack tui-kit` sequentially; inspect runtime and declaration exports.
- [ ] Audit IME focus forwarding, terminal sanitization before filtering, width and row bounds, query and selection restoration, stale action continuations, component disposal, RPC identity, and unchanged ordinary choice behavior.

### Release gate

- [ ] Obtain explicit user approval before publishing, tagging, changing visibility, or dispatching a release workflow.
- [ ] Verify the approved Kit release with `npm view`, tarball inspection, and a clean temporary installation that compiles and runs a searchable-choice fixture.
- [ ] Record the registry-visible compatibility floor before either proof consumer raises its dependency range.

### Phase 4: First proof consumer

- [ ] Create a consumer-only branch from then-current `origin/main`, raise only that package's Kit floor to the verified release, refresh the lockfile, and prove resolved compatibility before typechecking.
- [ ] Enable search without changing raw IDs, data loading, ordering, labels, domain actions, persistence, command modes, Back, Close, or session ownership.
- [ ] Add focused tests for the consumer's real duplicate, empty, no-match, narrow, disabled, stale, and unsupported-mode cases.
- [ ] Add the appropriate consumer Changeset, then run focused tests, the package check, dependency-resolution verification, `npm run check:boundaries`, `npm run check`, `git diff --check`, and the package's `just pack` recipe.
- [ ] Run a practical local Pi interaction smoke when possible and record any unverified user-data or provider path.

### Phase 5: Second proof consumer

- [ ] Repeat the independent compatibility-floor, implementation, test, Changeset, package, root, pack, and runtime-smoke gates for the second consumer in a separate pull request.
- [ ] Compare both final migrations against the qualification matrix and record any behavior that remained consumer-owned or prevented further convergence.
- [ ] Remove only local search or selection code made redundant by the published contract and retain all domain loading, validation, actions, and persistence.

### Phase 6: Completion decision

- [ ] Update the roadmap with the verified API, release order, two proof migrations, UX trade-offs, retained domain boundaries, and any no-go consumers.
- [ ] Recount ordinary searchable-choice adopters only as migration evidence, not as a target or justification for widening the API.
- [ ] Complete a final semantic audit proving that no session, scope, delete, tree, persistence, preview, or action-bearing catalog policy entered Pi TUI Kit.

## Completion Checklist

- [ ] Two independent consumers prove the same searchable single-choice need, or qualification ends before implementation with a finite no-go.
- [ ] Search is opt-in, TUI-local, IME-safe, terminal-safe, width-bounded, and preserves stable raw identity plus exact lifecycle outcomes.
- [ ] RPC remains deterministic and unfiltered without claiming unsupported interactive search parity.
- [ ] Ordinary choice, browse, multi-select, and live-choice behavior remain compatible and separately owned.
- [ ] The Kit API is independently published and registry-verified before either consumer adopts it.
- [ ] Both proof consumers preserve domain ordering, loading, validation, actions, persistence, and session ownership.
- [ ] Focused tests, package checks, root gates, pack inspections, semantic audits, and practical smokes are recorded.
- [ ] No release action occurs without explicit user approval.
- [ ] The plan is archived only after all accepted implementation, release, and consumer work is complete.
