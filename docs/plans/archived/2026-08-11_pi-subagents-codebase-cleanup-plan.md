# pi-subagents codebase cleanup plan

## Goal

Reduce the cost of understanding and changing `packages/pi-subagents` without changing its public tool surface, settings behavior, lifecycle ownership, persistence formats, or runtime semantics.

## Context

`packages/pi-subagents/src` currently contains 104 TypeScript files and about 29,659 lines.

Its tests contain 53 TypeScript files and about 20,278 lines.

`agents.ts` is imported by 42 source modules and combines shared types, built-in definitions, discovery, prompts, and catalog formatting.

`execution.ts`, `work-item-ledger.ts`, `registry.ts`, and `stateful.ts` exceed 1,000 lines, but their comments intentionally preserve one lifecycle or state-transition owner.

The largest test files are `subagents.test.ts` at 4,010 lines, `runner-render.test.ts` at 1,533 lines, `orchestration.test.ts` at 1,334 lines, and `registry.test.ts` at 1,212 lines.

An existing event-driven workflow runtime plan may later touch `execution.ts`, `work-item-ledger.ts`, and related workflow modules, so this cleanup must not run concurrently with implementation of that plan.

## Architecture

Keep these ownership boundaries intact:

- `executeSubagent()` remains the single ordered owner of blocking preflight, confirmation, launch, cancellation, and settlement.
- `AgentRegistry` remains the single mutable owner of retained-agent, queue, tree, mailbox, transport, persistence-callback, and completion transitions.
- `WorkItemLedger` remains the single mutable owner of workflow item and verification-acceptance transitions.
- Settings loading and mutation continue to preserve latest-valid-document reads, cross-process locking, serialized writes, unknown fields, invalid-file protection, mode `0600`, and atomic same-directory rename.
- `src/index.ts` remains a thin default-export forwarder, and the registered command and tool schemas remain unchanged.

Extract only cohesive pure policy, type, validation, projection, formatting, or persistence-codec responsibilities from those owners.

Use temporary compatibility barrels or re-exports while imports migrate, then remove only barrels that have no supported or tested consumer.

## Non-Goals

- Do not redesign delegation, scheduling, verification, transports, settings, commands, menus, or tool schemas.
- Do not introduce base classes, a dependency-injection framework, or a generic repository abstraction.
- Do not split mutable state across multiple owners.
- Do not perform a repository-wide rename or move all source files into subsystem directories in one change.
- Do not implement the event-driven workflow runtime plan as part of this cleanup.
- Do not add a Changeset unless implementation reveals a published behavior or compatibility change.

## Assumptions

- Internal source-module imports are not a documented public API, but existing package tests that import those modules will be migrated deliberately rather than broken incidentally.
- Structural-only test moves can land separately from production refactors.
- Each phase will be reviewed and verified before the next phase begins.

## Risks

- Moving types can accidentally introduce runtime imports or dependency cycles under NodeNext resolution.
- Splitting settings can break ordering, locking, rollback, or invalid-file protection even when typechecking passes.
- Splitting orchestration can create multiple cancellation or settlement owners.
- Large mechanical import diffs can hide semantic changes.
- Parallel implementation of the event-driven workflow plan can invalidate file and symbol assumptions.

## Plan

### Phase 1: Establish boundaries and split tests

- [x] Record a fresh source import graph and file/line inventory for `packages/pi-subagents/src` and `packages/pi-subagents/test`; save the commands and notable hubs in the implementation handoff so later phases can compare dependency direction.
- [x] Confirm that no active implementation is concurrently changing `execution.ts`, `work-item-ledger.ts`, `registry.ts`, `stateful.ts`, or their tests; if there is overlap, sequence this cleanup after that work and refresh this plan before editing.
- [x] Split `test/subagents.test.ts` by registration, blocking lifecycle, settings/config UI, and catalog-refresh behavior while preserving test bodies and shared setup; verify the moved tests with the repository's focused test runner or `npm test` when no stable focused route exists.
- [x] Split `test/runner-render.test.ts`, `test/orchestration.test.ts`, and `test/registry.test.ts` along existing production subsystem boundaries without changing assertions; verify each moved group and compare the total discovered test count before and after.
- [x] Consolidate only demonstrably identical test fixtures into package-local test helpers, keeping mutable fixtures fresh per test; verify that no test begins depending on execution order.

### Phase 2: Separate foundational agent types from discovery

- [x] Create a cohesive agent type module containing `AgentConfig`, scope/source/thinking types, settings-facing agent types, transport/completion types, and CWD/resource policy types; ensure it has no filesystem, Pi loader, prompt, or catalog dependencies.
- [x] Move built-in agent definitions and prompt construction out of `agents.ts` while preserving cloned return values, capability manifests, aliases, and descriptions; verify with `agents.test.ts` and tool-description tests.
- [x] Move filesystem/frontmatter discovery and catalog formatting into descriptive modules while preserving trust, source precedence, settings overrides, diagnostics, and sanitization; verify with agent discovery, subagent registration, and rendering tests.
- [x] Migrate type-only consumers away from `agents.ts`, using `import type` wherever runtime values are unnecessary; regenerate the import graph and verify that the former hub no longer owns unrelated foundational types.
- [x] Keep an `agents.ts` compatibility facade only if tests or supported internal entrypoints still require it; document its temporary purpose and remove it when all intended consumers use the new boundaries.

### Phase 3: Extract runtime policy from blocking execution

- [x] Move `parsePositiveInteger`, `FALLBACK_TIMEOUT_MS`, `resolveDefaultSubagentTimeoutMs`, and `assertSubagentDepthAllowed` into a runtime-policy module with focused tests for missing, malformed, bounded, and depth-limit environment values.
- [x] Preserve the existing `subagents.ts` re-export of `parsePositiveInteger` until repository searches prove that no intended consumer relies on its location; do not change extension entrypoint exports.
- [x] Extract pure timeout, turn-limit, and execution-budget calculations from `executeSubagent()` without moving abort controllers, generation checks, confirmation, launch, settlement, or persistence ownership; add table-driven tests for precedence and orchestration-deadline behavior.
- [x] Extract pure workflow request preflight only where it can accept plain inputs and return plain results without capturing `ExtensionContext`, mutable ledgers, controllers, grants, or transports; otherwise leave the code in `execution.ts` and record the rejected extraction in the handoff.
- [x] Verify blocking single, parallel, chain, workflow, panel, cancellation, timeout, and verified-execution tests after the extraction.

### Phase 4: Separate settings responsibilities without weakening the protocol

- [x] Map every function and type in `settings.ts` to schema normalization, defaults/effective resolution, storage/locking, mutation, or inspection, and identify the smallest cuts that preserve one settings concurrency protocol.
- [x] Extract pure settings schema normalization and settings-owned types without changing accepted values, unknown-field behavior, malformed error redaction, defaults, or environment precedence; verify malformed, invalid, and valid settings tests.
- [x] Extract pure effective-value and inspection snapshot construction while preserving configured-versus-runtime source reporting; verify status, inspect, and configuration UI tests.
- [x] Keep latest-document read, cross-process lock, serialized mutation order, failure recovery, mode `0600`, temporary-file cleanup, and atomic rename under one storage owner; split files only if these operations remain one explicit protocol.
- [x] Preserve the existing settings facade while consumers migrate, then update imports by responsibility and verify that no UI or lifecycle module bypasses validation or mutation serialization.
- [x] Re-run settings semantic audits for missing-file side effects, first save, malformed and invalid files, unknown fields, concurrent writes, failed writes, stale reads, immediate runtime application, rollback, session replacement, and shutdown durability.

### Phase 5: Reduce orchestration presentation and codec clutter

- [x] Move pure stateful formatting and terminal sanitization from `stateful.ts` into the existing stateful render boundary, preserving sanitization before splitting, filtering, wrapping, and truncation; verify tool rendering and untrusted-text tests.
- [x] Identify pure snapshot validation, normalization, projection, or codec helpers inside `registry.ts` and `work-item-ledger.ts`; extract only helpers that do not mutate owner state or sequence callbacks.
- [x] Keep registry queue, tree, mailbox, grant, transport, persistence callback, waiter, and completion transitions in `AgentRegistry`; verify restore, FIFO limits, subtree cleanup, cancellation, mailbox, generation, and persistence callback ordering.
- [x] Keep ledger transition and restore invariants in `WorkItemLedger`; verify dependency readiness, generations, artifact provenance, invalidation, verification, rework, acceptance, and legacy restore behavior.
- [x] Review every `await` in touched lifecycle paths for cancellation, disposal, session replacement, generation revalidation, stale context use, and shutdown cleanup; add focused regression tests for any uncovered gap before proceeding.

### Phase 6: Apply subsystem directories only where boundaries are proven

- [x] Group proven agent, settings, transport, stateful, workflow, panel, and shared boundaries into directories one subsystem per commit, avoiding mixed semantic edits and broad path churn.
- [x] Keep `src/index.ts` as the thin default-export forwarder and keep implementation entry composition in a descriptive module.
- [x] Replace temporary compatibility barrels only after repository search, typechecking, tests, and package inspection show they are unnecessary.
- [x] Regenerate the import graph and compare it with Phase 1, requiring fewer imports from mixed-responsibility hubs and no new dependency cycles before accepting the directory migration.

### Phase 7: Final semantic audit and verification

- [x] Audit the complete cleanup diff against `docs/extension-conventions.md`, naming the applicable factory/lifecycle, tools/state, TUI, package-boundary, documentation, and verification MUST rules and their evidence.
- [x] Audit settings changes against `docs/extension-settings.md`, explicitly checking ordering, locking scope, failure recovery, stale reads, invalid-file protection, unknown-field preservation, atomic publication, runtime application, session replacement, and shutdown.
- [x] Run `npm run typecheck` and `npm test` after any intermediate focused checks pass.
- [x] Run the CI-equivalent `npm run check` from the repository root without concurrently running a `pi-tui-kit` build or check.
- [x] Run `npm run pack:subagents` and inspect the dry-run contents for the declared `src/index.ts`, moved source modules, README, and license.
- [x] Run the smallest practical non-interactive local Pi load smoke for `packages/pi-subagents/src/index.ts`; verify registration succeeds without factory-owned background work or settings side effects.
- [x] Inspect the final diff for accidental tool-schema, prompt-guideline, command, settings, persistence-version, public documentation, or runtime behavior changes; revert or explicitly plan any behavior change rather than hiding it in cleanup.
- [x] Decide Changeset applicability from the final diff; record `Not applicable` only if the result is strictly repository structure/internal refactoring with no published behavior change.

## Completion Checklist

- [x] Source and test responsibilities are easier to locate, and no newly created source file exceeds 1,000 lines without an adjacent ownership rationale.
- [x] Foundational agent types no longer require importing filesystem discovery, built-in prompts, or catalog formatting.
- [x] Generic runtime policy no longer depends on blocking execution orchestration.
- [x] Settings schema, inspection, and storage responsibilities are explicit while one tested concurrency and atomic-publication protocol remains authoritative.
- [x] `executeSubagent()`, `AgentRegistry`, and `WorkItemLedger` each retain exactly one mutable lifecycle or transition owner.
- [x] Test files are split by subsystem with the same or greater discovered test coverage and no order dependence.
- [x] The final import graph has no new cycles and demonstrates reduced reliance on mixed-responsibility hubs.
- [x] `npm run check`, `npm run pack:subagents`, and the local Pi load smoke pass, or any unavailable smoke remains unchecked with a concrete reason.
- [x] The handoff names all focused tests, semantic audits, full checks, smokes, deviations, and unverified paths.
- [x] Every plan task is checked with evidence before this plan is moved to `docs/plans/archived/`.

## Implementation Evidence

- Baseline inventory: 104 source files, 53 test files, 29,659 source lines, 20,278 test lines, and 14 static relative-import cycles.
- Final inventory before commit: 113 source files; the same 14 static relative-import cycles and no new cycle.
- Test organization: all 405 pre-existing test names remain, six focused policy/budget tests were added, and the package suite passed with 75 files and 420 tests.
- Agent boundaries: `src/agents/{types,built-ins,discovery,catalog}.ts` separate foundation, definitions, filesystem discovery, and model-facing formatting; `agents.ts` remains the compatibility facade.
- Execution boundaries: `src/execution/runtime-policy.ts` and `src/execution/budget.ts` contain pure environment, timeout, turn-limit, and deadline policy; `executeSubagent()` retains lifecycle ownership.
- Settings boundaries: `src/settings/schema.ts` and `src/settings/inspection.ts` contain pure normalization and snapshot construction; `settings.ts` retains reading, locking, ordered mutation, permissions, temporary files, and atomic publication.
- Stateful boundary: `src/stateful-agent-view.ts` owns sanitized formatting and bounded detail projection; registration, cancellation, session replacement, workspace cleanup, and persistence remain in `stateful.ts`.
- Registry and ledger audit: their validators and transition helpers remain colocated because extracting them would split the explicitly documented atomic invariant owner; no second mutable owner was introduced.
- Test preservation: the four oversized integration files were split into subsystem files; a name comparison found 405 old tests, 411 final tests, no missing tests, and exactly six new policy/budget tests.
- Focused verification: split suites passed (58 blocking/config tests, 21 runner tests, 14 orchestration tests, and 32 registry tests); settings/config/inspect passed 55 tests; stateful/rendering passed 20 tests.
- Full package verification: `npx vitest run packages/pi-subagents/test` passed 75 files and 420 tests.
- Repository verification: after `npm install` refreshed consumer workspace resolutions, `npm run check` passed Biome, boundaries, all workspace typechecks, and 301 files with 2,981 tests.
- Package smoke: `npm run pack:subagents -- --json` included `src/index.ts`, all new subsystem modules, README, and LICENSE in 116 entries.
- Runtime smoke: offline RPC loading with only `packages/pi-subagents/src/index.ts` returned a successful `get_commands` response containing `/subagents`.
- Security and lifecycle audit: terminal sanitization remains at stateful display boundaries; settings validation, generic malformed-JSON errors, last-valid state, lock ordering, mode `0600`, and atomic rename stayed under the existing tested owners; every touched `await` remained in its original lifecycle owner.
- Review: two independent reviewer attempts reported no confirmed finding but timed out before a complete verdict; the parent review then compared every moved production block against `HEAD`, verified all existing test names, static cycles, package contents, and runtime registration.
- Deviation: subsystem directories were integrated in one production refactor rather than one commit per directory because shared composition modules import several boundaries and intermediate commits would not typecheck.
- Changeset: not applicable because the final diff preserves published behavior, command/tool schemas, settings formats, persistence versions, and user documentation.
