# Pi TUI Kit Existing Contract Convergence Plan

## Goal

Remove duplicated interaction lifecycle and test-host ownership from compatible specialized TUI flows by adopting the already-published `runCustomInteraction()` and `/testing` contracts without adding a new Pi TUI Kit API or moving domain behavior into the Kit.

## Context

Twenty-five active extensions consume Pi TUI Kit, but eight source areas still call `ctx.ui.custom()` directly.

Direct custom UI is not automatically duplication because OAuth, chat composers, secret input, and multi-stage domain workflows own behavior that the Kit must not absorb.

`packages/pi-starship/src/command-preview.ts` repeats owner-abort listening, external disposal, completion, and key-hint lifecycle around an extension-owned preview-and-action component.

`packages/pi-file-context/src/file-context.ts` directly hosts `FileQuoteExplorer`, while the explorer already owns its file, search, preview, revision, and diff behavior and aborts its internal work from `dispose()`.

`packages/pi-image-drop/src/menu.ts` is not a direct `runTask()` migration because its loader deliberately maps Escape to Back and Ctrl+C to Close, while `runTask()` currently returns one user-cancelled outcome.

The plan therefore requires behavior matrices and explicit no-go decisions instead of treating every direct `custom()` or loader call as interchangeable.

## Architecture

Pi TUI Kit owns the interaction signal, stale-owner classification, exactly-once wrapper disposal, error routing, and optional pending-work draining.

Each extension owns its component, raw result values, Back and Close mapping, domain state, asynchronous operations, persistence, notifications, and session-generation policy.

The consumer passes its existing owner signal and `isCurrent()` check into `runCustomInteraction()`.

The consumer component completes through the helper-provided `complete()` callback and continues to implement its own rendering, input, focus, and domain cancellation.

Tests should use `createTuiHarness()` where it can drive the public custom-factory boundary without weakening specialized component assertions.

Repository-level context, filesystem, clock, network, process, and domain fixtures remain outside `@narumitw/pi-tui-kit/testing`.

## Non-Goals

- Do not add a session-owner abstraction or register lifecycle hooks from Pi TUI Kit.
- Do not redesign Starship preview content, File Context search, file loading, Git history, revision, diff, or quote behavior.
- Do not migrate Accounts OAuth, BTW fullscreen or composer flows, Chat, secret input, or other multi-stage interfaces without a separate compatibility decision.
- Do not change Image Drop's Escape-versus-Ctrl+C loader outcomes to make it fit `runTask()`.
- Do not expose raw component instances or add a general `ExtensionContext` mock to the Kit testing entrypoint.
- Do not combine unrelated extension migrations in one implementation pull request.

## Risks

- A wrapper migration can accidentally collapse Back, Close, stale owner, and external disposal into one result.
- A component can call its old `done()` callback during wrapper disposal and race the helper's stale result.
- File Context owns nested asynchronous searches and detail loads, so disposal evidence must prove that every controller is aborted and drained or safely settled.
- Replacing root test helpers can reduce coverage if the Kit harness cannot observe a specialized component's required intermediate state.
- A source-only refactor can still change published package behavior, so Changeset intent must be decided from the final diff rather than assumed.

## Plan

### Phase 1: Compatibility inventory

- [ ] Record every active direct `ctx.ui.custom()` and local loader owner in `packages/*/src`; classify each as standard, lifecycle-only specialized, or domain-specialized, and preserve the evidence in this plan.
- [ ] Write a Starship behavior matrix for selected, Back, Close, owner abort, external disposal, empty actions, constrained rows, scrolling, terminal controls, and thrown body rendering; verify each row against focused existing tests before editing production code.
- [ ] Write a File Context behavior matrix for quote, reference, Back, Close, owner replacement, shutdown, external disposal, pending file load, content search, revision load, and error reporting; verify each row against focused existing tests before editing production code.
- [ ] Record Image Drop as a `runTask()` migration or a finite no-go by comparing Escape, Ctrl+C, owner abort, error reporting, and task-draining semantics; require exact result compatibility before any source change.
- [ ] Decide separately for each candidate whether `createTuiHarness()` can replace repository test support without losing direct component observations; retain the old helper where evidence says no.

### Phase 2: Starship lifecycle convergence

- [ ] Add or strengthen Starship characterization tests for every accepted behavior-matrix row; verify that the focused suite passes before the refactor.
- [ ] Refactor `showPreviewActionMenu()` to run its extension-owned component through `runCustomInteraction()` with the existing session signal and current-owner check; preserve the public `PreviewMenuResult` contract.
- [ ] Remove only Starship abort-listener, exactly-once completion, and wrapper-disposal code now owned by the Kit; retain preview layout, scrolling, injected controls, sanitization, and action semantics locally.
- [ ] Migrate compatible Starship tests to `createTuiHarness()` and remove only test-support imports made unused by this flow; verify focus, resize, disposal, and result observations through the public factory boundary.
- [ ] Audit every Starship await, cancellation path, component disposal, and session replacement against `docs/extension-conventions.md`; record any intentional deviation next to its owner.
- [ ] Decide and record Starship Changeset intent from the final behavior and dependency diff, then run focused tests, the package check, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack starship` sequentially.
- [ ] Run a local `pi -e` or `just try starship` interaction smoke when practical; leave the task open with the exact unavailable path if an interactive runtime cannot be exercised.

### Phase 3: File Context lifecycle convergence

- [ ] Add or strengthen File Context characterization tests for every accepted behavior-matrix row, including pending search and detail cancellation; verify that the focused suite passes before the refactor.
- [ ] Adapt `FileQuoteExplorer` completion to `runCustomInteraction()` without moving files, Git state, selected quotes, notifications, or validation into the Kit.
- [ ] Compose the existing flow signal with the helper-owned signal and prove owner replacement, shutdown, and external disposal abort all explorer-owned controllers exactly once.
- [ ] Preserve menu-owned Back versus root Close, quote and reference payloads, post-await session checks, and the active-explorer guard while deleting only superseded custom-host ownership.
- [ ] Migrate compatible File Context tests to `createTuiHarness()` and retain specialized fixtures required to inspect content search, revision, and diff behavior.
- [ ] Audit user cancellation, component disposal, session replacement, shutdown, stale continuations after every await, and pending-work release against `docs/extension-conventions.md`.
- [ ] Decide and record File Context Changeset intent from the final diff, then run focused tests, the package check, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack file-context` sequentially.
- [ ] Run a local `pi -e` or `just try file-context` interaction smoke when practical; leave the task open with the exact unavailable path if an interactive runtime cannot be exercised.

### Phase 4: Convergence decision

- [ ] Recount direct custom hosts and repository test-helper consumers after both migrations; record deleted ownership and every retained specialized owner without setting a numeric removal target.
- [ ] Reassess Image Drop and the remaining direct hosts against the published Kit contract; create a separate focused plan only when another exact behavior match exists.
- [ ] Update `packages/pi-tui-kit/README.md` or the roadmap only if execution establishes a durable adoption rule not already documented.
- [ ] Complete a final semantic audit across both extension diffs and verify that no domain state, persistence, transaction, or session-hook ownership moved into Pi TUI Kit.

## Completion Checklist

- [ ] Starship uses the published custom-interaction lifecycle shell without changing preview or action behavior.
- [ ] File Context uses the published custom-interaction lifecycle shell without changing explorer behavior or leaking pending work.
- [ ] Back, Close, stale owner, external disposal, errors, and successful domain results remain distinct where each extension currently distinguishes them.
- [ ] Compatible tests use the supported Kit harness, while specialized fixtures remain local and no general context mock is added.
- [ ] Image Drop and every retained direct host have an evidence-backed migration or no-go decision.
- [ ] Focused tests, package checks, root gates, pack inspections, semantic audits, and practical runtime smokes are recorded for each implementation pull request.
- [ ] The plan is archived only after every task has evidence and all intended pull requests are complete.
