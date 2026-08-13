# Pi TUI Kit Existing Contract Convergence Plan

## Goal

Remove duplicated interaction lifecycle and test-host ownership from compatible specialized TUI flows by adopting the published `runCustomInteraction()` and `/testing` contracts without adding a new Pi TUI Kit API or moving domain behavior into the Kit.

## Context

The completed inventory classified direct custom hosts by semantics rather than count.

Starship preview actions and File Context exploration shared the published custom-interaction lifecycle shell.

Accounts OAuth, BTW model resolution and fullscreen flows, Chat, Image Drop loading, and Statusline information preview remain specialized because they own authentication, full-screen composition, domain loading, preview, or distinct terminal outcomes.

Image Drop remains an explicit no-go because Escape means Back and Ctrl+C means Close, while `runTask()` exposes one user-cancelled result.

## Architecture

Pi TUI Kit owns the interaction signal, stale-owner classification, exactly-once wrapper disposal, error routing, and optional pending-work draining.

Each extension owns its component, raw result values, Back and Close mapping, domain state, asynchronous operations, persistence, notifications, and session-generation policy.

## Non-Goals

- Do not add a session-owner abstraction or lifecycle hooks to Pi TUI Kit.
- Do not redesign Starship preview content or File Context search, loading, Git history, revision, diff, and quote behavior.
- Do not migrate incompatible OAuth, fullscreen, composer, chat, loader, secret-input, or multi-stage interfaces.
- Do not expose component instances or add a general context mock to the Kit testing entrypoint.

## Evidence

- Starship implementation: PR #741, signed commit `a8587307`, passing focused tests, package check, root gate, and 79-file package dry-run.
- File Context implementation: PR #742, signed commit `713aaa4a`, passing focused lifecycle/search tests, package check, root gate, and 14-file package dry-run.
- Both pull requests are merged in `main`.
- Starship retained preview layout, scrolling, terminal-safe body rendering, actions, owner checks, and custom result mapping.
- File Context retained file/Git/search/revision/diff state, quote persistence, validation, nested cancellation, generation checks, and user notification policy.
- Compatible tests use `createTuiHarness()` through the public custom-factory boundary while domain fixtures remain local.
- Current direct custom hosts remain in Accounts OAuth, BTW, Chat, Image Drop, and Statusline specialized flows; no numeric removal target applies.
- Interactive Pi TUI smokes were not run because they require an interactive terminal; deterministic TUI harnesses exercised the public runtime boundary.

## Plan

### Phase 1: Compatibility inventory

- [x] Classify every active direct custom host by exact lifecycle and domain behavior; the retained-owner list and Image Drop no-go are recorded above.
- [x] Characterize Starship selected, Back, Close, owner abort, external disposal, empty actions, constrained rows, scrolling, controls, and body-render failures through maintained tests.
- [x] Characterize File Context quote, reference, Back, Close, replacement, shutdown, disposal, pending file load, content search, revision load, and error reporting through maintained tests.
- [x] Record Image Drop as a finite `runTask()` no-go because its Escape and Ctrl+C outcomes differ.
- [x] Adopt the supported test harness only where specialized observations remain intact.

### Phase 2: Starship lifecycle convergence

- [x] Preserve every characterized behavior while hosting the specialized preview component through `runCustomInteraction()`.
- [x] Remove duplicate abort-listener, completion, and wrapper-disposal ownership without moving preview behavior into the Kit.
- [x] Revalidate owner state and cancellation across awaits, disposal, and session replacement.
- [x] Use the supported TUI harness for compatible command and lifecycle tests.
- [x] Run focused tests, package check, root gate, diff check, and package dry-run; no Changeset was needed because the refactor preserves published behavior.
- [x] Not run: interactive Pi smoke requires an interactive TUI; deterministic public-harness coverage exercised the same wrapper boundary.

### Phase 3: File Context lifecycle convergence

- [x] Preserve characterized explorer behavior while hosting `FileQuoteExplorer` through `runCustomInteraction()`.
- [x] Compose flow and interaction signals so replacement, shutdown, and disposal abort explorer-owned operations.
- [x] Preserve Back, Close, quote/reference payloads, active-explorer guards, errors, and post-await generation checks.
- [x] Use the supported TUI harness while retaining specialized filesystem, search, revision, and diff fixtures.
- [x] Run focused tests, package check, root gate, diff check, and package dry-run; no Changeset was needed because the refactor preserves published behavior.
- [x] Not run: interactive Pi smoke requires an interactive TUI; deterministic public-harness coverage exercised the same wrapper boundary.

### Phase 4: Convergence decision

- [x] Recount and classify retained direct hosts without setting a numeric migration target.
- [x] Keep Image Drop and other incompatible hosts local until a published exact contract exists.
- [x] Preserve the durable adoption boundary in the Kit README and roadmap.
- [x] Complete the semantic audit proving no domain state, persistence, transaction, or session-hook ownership moved into Pi TUI Kit.

## Completion Checklist

- [x] Starship uses the published custom-interaction lifecycle shell without changing preview or action behavior.
- [x] File Context uses the published shell without changing explorer behavior or leaking pending work.
- [x] Back, Close, stale owner, external disposal, errors, and successful domain results remain distinct where required.
- [x] Compatible tests use the Kit harness while specialized fixtures remain local.
- [x] Retained direct hosts have evidence-backed ownership or no-go decisions.
- [x] Focused tests, package checks, root gates, pack inspections, semantic audits, and unavailable interactive paths are recorded.
- [x] This completed plan is archived after both intended pull requests merged.
