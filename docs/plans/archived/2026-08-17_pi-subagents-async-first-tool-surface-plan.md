# Pi Subagents Async-First Tool Surface Plan

## Goal

Make `pi-subagents` smaller and easier to choose by moving the product direction from all-tools-by-default toward async-first behavior and, later, async-only behavior when evidence and migration support are sufficient.

Keep the main agent responsible for task decomposition while preserving explicit escape hatches for synchronous output and read-only consultation during the transition.

## Context

The built-in agent catalog is now only `explorer` and `worker`.

`planner`, `reviewer`, `general`, `general-purpose`, and `subagent_auto` are removed.

The default `all` workflow still exposes seven tools: `subagent`, `subagent_spawn`, `subagent_send`, `subagent_manage`, `subagent_mailbox`, `subagent_inspect`, and `subagent_consult`.

`async-only` already exists, but it is not the default.

The desired product direction is async-first now and async-only later.

The [completed main-agent-led delegation guidance plan](2026-08-17_pi-subagents-main-agent-led-delegation-guidance-plan.md) owns the delegation rubric plus its prompt, README, and example wording.

This plan consumes the completed rubric and owns registration modes, settings defaults, compatibility, and migration decisions without redefining delegation policy.

Async-first must create real parallelism rather than move the main agent's only useful task into one detached worker.

One ordinary async worker may directly implement a bounded slice only when named non-overlapping main-agent work starts immediately after spawn and the result has a supported delivery and integration path.

Two or more disjoint workers may justify a detached implementation round while the main agent coordinates and retains integration ownership.

## Architecture

The audited registration surface is:

| Workflow | Status | Registered tools | Model-facing guidance |
| --- | --- | --- | --- |
| `all` | Compatibility default | `subagent`, `subagent_spawn`, `subagent_send`, `subagent_manage`, `subagent_mailbox`, `subagent_inspect`, `subagent_consult` | Blocking, detached, inspection, and consultation guidance is available. |
| `async-only` | Recommended async-first workflow | `subagent_spawn`, `subagent_send`, `subagent_manage`, `subagent_mailbox`, `subagent_inspect` | Detached guidance omits blocking and consultation tools. |
| `blocking-only` | Compatibility workflow | `subagent`, `subagent_inspect`, `subagent_consult` | Blocking and consultation guidance omits detached tools. |
| `disabled` | JSON-only opt-out | `subagent_inspect` | Inspection metadata is the only advertised extension capability. |

`src/subagents.ts`, `src/stateful.ts`, `src/consult-registration.ts`, and `src/inspect-registration.ts` own registration and prompt metadata.

`test/subagents-settings-ui.test.ts`, `test/subagents-registration.test.ts`, `test/stateful-tool-registration.test.ts`, `test/consult.test.ts`, and `test/inspect.test.ts` define the focused registration boundaries.

Keep `all` as the default during this compatibility phase so existing settings and explicit blocking workflows do not change silently.

Recommend `async-only` in the README quick start and `/subagents` workflow chooser so new selections lead with a smaller responsive surface.

Keep blocking `subagent` available in `all` and `blocking-only` as an explicit synchronous compatibility route with no current deprecation deadline.

Keep `subagent_consult` coupled to blocking availability as the synchronous read-only exception with no current deprecation deadline.

Keep `subagent_spawn`, `subagent_send`, `subagent_manage`, and `subagent_mailbox` split because they have distinct start, follow-up, lifecycle, and queue semantics.

Any default change, tool removal, or lifecycle consolidation needs a separately approved compatibility migration.

## Non-Goals

- Do not remove blocking delegation without a migration path and explicit approval.
- Do not remove `subagent_consult` until its synchronous read-only use case has a replacement or an intentional deprecation decision.
- Do not add a new autonomous planner or router.
- Do not recommend one ordinary implementation worker when the main agent would only announce the spawn and stop.
- Do not publish, release, tag, or change npm visibility from this plan.

## Plan

- [x] Audit current tool registration for `all`, `async-only`, `blocking-only`, and `disabled`; the Architecture table records exact tools, prompt ownership, README intent, and focused test boundaries.
- [x] Keep `all` as the compatibility default while recommending `async-only` in `/subagents` and the README quick start; preserve the rule that one detached worker requires immediate useful main-agent work.
- [x] Keep blocking `subagent` available in `all` and `blocking-only` as an explicit synchronous compatibility route; require a separately approved migration for removal or a default change.
- [x] Keep `subagent_consult` coupled to blocking availability as the synchronous read-only exception; require a separately approved migration for removal.
- [x] Keep `subagent_spawn`, `subagent_send`, `subagent_manage`, and `subagent_mailbox` split because their start, follow-up, lifecycle, and queue semantics are distinct; defer any smaller public API to a separate migration.
- [x] Update only the README quick start and `/subagents` workflow-selection presentation to recommend `async-only`, explain automatic-resume needs, and preserve the completed delegation rubric.
- [x] Verify mode-specific prompt metadata names only registered tool surfaces; no production prompt change was required because blocking and detached guidance was already capability-gated.
- [x] Add regression coverage for the recommended first workflow choice, exact bidirectional preview effects, all four registration surfaces, unavailable-tool prompt omissions, cancellation, reload guards, save failure, session replacement, and narrow rendering; 65 focused tests and all 400 `pi-subagents` tests pass.
- [x] Add `.changeset/recommend-async-subagent-surface.md` for the published workflow-chooser and documentation behavior; `npm run changeset:status` exits successfully, the aggregate package bump remains major because of existing breaking Changesets, and existing `pi-tui-kit` range notices require no dependency change in this plan.
- [x] Run focused tests, all package tests, `npm run check`, `git diff --check`, local Markdown link validation, and `just pack subagents`; the first root gate found an import-order lint error and two implicit test parameter types, those defects were corrected, the final gate passes 3,423 tests across 344 files, the archive link check passes after correcting its moved-plan relative path, and the dry run contains the expected README, source, manifest, and license in 120 files.

## Completion Checklist

- [x] The README workflow table documents the compatibility default, recommendation, and exact tool names, matching registration tests.
- [x] Async-first behavior keeps `all` available and explains when blocking, consultation, next-turn delivery, or automatic resume is needed.
- [x] One-worker async guidance still requires a useful concurrent main-agent lane and does not permit spawn-then-idle behavior.
- [x] Blocking delegation and consultation remain explicit compatibility routes with no current deprecation deadline.
- [x] Model-facing guidance names only tool surfaces available in each registered mode.
- [x] README examples lead with main-agent-authored async delegation and reserve blocking workflows for intentional synchronous cases.
- [x] Focused tests, all package tests, the corrected root gate, `git diff --check`, and the package dry run pass; no live TUI or provider smoke was run because the deterministic menu harness covers the changed constant presentation and no tool execution, schema, settings persistence, or lifecycle path changed.
- [x] No release, publication, tag, visibility change, or release workflow occurred.
