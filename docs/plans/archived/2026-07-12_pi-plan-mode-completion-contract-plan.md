## Goal

Strengthen `@narumitw/pi-plan-mode` so a completed plan is delivered through a structured, reviewable completion contract instead of relying only on assistant text. Success means the model has a terminating `plan_mode_complete` tool, users see the submitted plan before the ready action flow, missing completion output has an explicit recovery command, legacy `<proposed_plan>` output remains compatible, and resume/branch behavior preserves only the active branch's ready plan.

## Context

Issue #195 shows the model saying it will present the plan and then ending without a `<proposed_plan>` block. The current `agent_end` parser treats an absent block as an ordinary planning turn, so no plan is stored or shown. Codex improves rendering after a block exists but does not recover a completely missing block. Claude Code and OpenCode's experimental workflow reduce this failure by separating plan content from the completion signal with a dedicated exit tool.

Pi already supports the needed primitives: custom tools with `terminate: true`, tool-result `details` for branch-aware state, `agent_settled` for post-retry/post-follow-up actions, slash-command autocomplete, and persisted custom entries. The bounded Pi adaptation is a completion tool carrying Markdown directly; it does not require a separate plan file.

## Architecture

- Add required Plan-mode tool `plan_mode_complete({ plan })`. It validates a non-empty, bounded Markdown plan, returns the complete plan in its visible result, stores the same plan in typed `details`, and returns `terminate: true`. The prompt requires calling it alone as the final planning action.
- Keep `plan_mode_question` as the only valid unfinished-turn endpoint. Update the Plan-mode prompt so a turn should end with either a material question or `plan_mode_complete`; normal prose must not claim that a plan is being presented without calling the completion tool.
- Treat `plan_mode_complete` as the primary completion source and the existing exact `<proposed_plan>` parser as a legacy compatibility source. Both feed one idempotent ready-state transition.
- Move ready-flow dispatch from the zero-delay `agent_end` timer to `agent_settled`. Retain a nonce/source snapshot until Pi is idle with no pending messages, then show the ready menu once; stale intent is discarded if a newer Plan-mode turn, exit, session replacement, or different completed plan supersedes it.
- Render the primary plan in the completion tool result before opening the ready menu. Keep the existing proposed-plan custom message only for the legacy block path so the plan is not duplicated.
- Add `/plan show`, `/plan finalize`, and `/plan implement` management subcommands. `show` displays only a stored plan, `finalize` explicitly asks the active Plan-mode agent to submit the current decision-complete plan through `plan_mode_complete`, and `implement` uses the existing checked handoff. No command silently invents or recovers content that was never submitted.
- Keep state in the session tree. Restore extension custom state from `getBranch()` rather than all entries, and include completion source/version in tool-result details so forks and tree navigation cannot revive a ready plan from another branch.

## Non-Goals

- Do not add a filesystem plan artifact or plans directory.
- Do not add semantic phrase detection such as matching “let me present the plan”; model wording is not a reliable completion protocol.
- Do not automatically reprompt after every plan-less turn, because clarification and research turns legitimately have no final plan.
- Do not remove `<proposed_plan>` parsing in this release; older sessions, prompts, and models must continue to work.
- Do not redesign the existing question tool, shell policy, thinking-level settings, or Plan-mode tool selector beyond making the completion tool required and non-disableable.

## Assumptions

- `agent_settled` and terminating custom-tool results require Pi 0.80.6 for this package; package metadata and user documentation must state that compatibility floor.
- `terminate: true` is a best-effort early-termination hint and only terminates a parallel batch when every finalized sibling tool also terminates; the prompt must therefore require `plan_mode_complete` to be called alone as the last action.
- A 50,000-character plan limit is sufficient for an implementation-ready plan and aligns with Pi's normal 50 KB tool-output boundary; exact Unicode byte/character handling should be specified by tests before implementation.
- Ready-menu actions remain TUI/RPC UI when available, while direct `/plan show|finalize|implement` subcommands provide explicit non-modal control.

## Plan

- [x] Add failing regression tests in `extensions/pi-plan-mode/test/plan-mode.test.ts` for issue #195 and the new contract: root `npm test` ran 339 tests with 336 passing and exactly 3 expected red failures for missing completion-tool registration, new autocomplete entries, and completion execution; the prose-only issue #195 regression already passes and remains `plan active`.
- [x] Create `extensions/pi-plan-mode/src/completion-tool.ts` with `PLAN_MODE_COMPLETE_TOOL_NAME`, dependency-free JSON Schema parameters, input normalization, the 50,000-character boundary, typed versioned result details, and compact result-format helpers; `npm test` passes 340/340 including valid, whitespace, oversized, and inactive cases, and `src/plan-mode.ts` remains 859 lines.
- [x] Register `plan_mode_complete` in `extensions/pi-plan-mode/src/plan-mode.ts`, reject calls outside active Plan mode, pin it alongside `plan_mode_question` in required active tools, remove it when Plan mode exits, and exclude it from `/plan tools`; lifecycle tests pass in the 340-test root suite and `npm run typecheck --workspace @narumitw/pi-plan-mode` passes.
- [x] Rewrite `extensions/pi-plan-mode/src/prompt.ts` finalization instructions so complete plans are submitted by one final standalone `plan_mode_complete` call, unfinished turns end with `plan_mode_question` or a concise plain-text question only when UI is unavailable, and legacy XML is no longer the advertised primary path; prompt assertions pass in the 348-test root suite.
- [x] Introduce one idempotent ready-state transition shared by completion-tool execution and legacy `<proposed_plan>` detection, recording plan text, source, and a fresh presentation nonce while preserving stale-plan clearing at the next Plan-mode `before_agent_start`; duplicate, replacement, repeated legacy, Stay/revision, exit, and implementation tests pass in the 348-test root suite.
- [x] Raised `extensions/pi-plan-mode`'s Pi development compatibility floor to 0.80.6, regenerated the lockfile from baseline with the repository-pinned npm 11.16.0, and replaced timer dispatch with `agent_settled`; deterministic tests cover retained busy/pending intent, exact-once delivery, repeated settlement/`agent_end`, supersession, no-UI, stale nonce/context, and session replacement in the passing 354-test root suite.
- [x] Present `plan_mode_complete` output as the authoritative visible plan before the ready menu, using full Markdown and typed details without a second custom message; retain one `proposed-plan` custom message for legacy XML only. Ordering, exact-once, no-UI, and stale-context tests pass in the 348-test root suite.
- [x] Add `/plan show`, `/plan finalize`, and `/plan implement` branches plus autocomplete. `show` displays stored plans without a model turn, `finalize` requires active mode and uses idle/follow-up-safe delivery, and `implement` fails closed without a plan while reusing rollback-safe handoff; idle, busy, inactive, ready, and send-failure cases pass in the 352-test root suite.
- [x] Made restoration branch-correct with the active `ctx.sessionManager.getBranch()` path and recovery only from valid versioned `plan_mode_complete` results after the latest state; resume, divergent branch, malformed details, legacy custom state, recovered result, and discarded-plan fixtures pass in the 354-test root suite.
- [x] Updated `extensions/pi-plan-mode/README.md` for Pi 0.80.6+, tool-based completion, legacy `<proposed_plan>` compatibility, `/plan show|finalize|implement`, the 50,000-character limit, parallel-batch termination caveat, no automatic semantic retry, TUI/no-UI behavior, and `max` thinking; the required `rg` command finds every contract and documented commands match autocomplete.
- [x] Ran release-quality gates from the repository root: `npm test` passed 357/357, `npm run typecheck` passed all 15 workspaces, and `npm run check` passed Biome, boundaries, all workspace typechecks, and 357 tests. `just pack-plan-mode` listed 11 intended files including `src/completion-tool.ts` and `src/state.ts`; package metadata has no runtime dependencies. `pi -ne -e ./extensions/pi-plan-mode --help` loaded successfully and exposed `--plan`.

## Risks

- Tool termination is not absolute when the model batches sibling calls. Mitigate with the standalone-final-call prompt rule, result idempotency, and tests that do not assume termination beyond Pi's documented contract.
- Moving presentation to `agent_settled` can lose or duplicate UI if intent is not retained across retries or is not invalidated on replacement. Mitigate with a nonce, idle/pending gates, one shared transition, and repeated lifecycle tests.
- Tool-result plan content plus persisted custom state can create duplicate context or stale branch state. Mitigate by making the tool result the primary visible/context-bearing record, avoiding a duplicate custom message on that path, and restoring only from the active branch.
- A hard content bound can reject unusually large plans. Keep the error explicit, leave Plan mode active, and document the limit rather than truncating an implementation plan silently.
- `/plan finalize` could be invoked before requirements are decision-complete. Its injected request must tell the agent to ask a material question instead of submitting if unresolved decisions remain.

## Completion Checklist

- [x] Issue #195's prose-only ending remains `plan active`, while `/plan finalize` provides explicit idle/follow-up-safe recovery; named regressions pass in the 357-test root suite.
- [x] `plan_mode_complete` is required, Plan-only, standalone, terminating, bounded to 50,000 characters, and returns full visible Markdown with versioned details; tool contract and lifecycle tests pass.
- [x] Exactly one ready flow occurs after final settlement for tool and legacy XML sources; retry-style repeated events, pending messages, duplicates, supersession, no-UI, and stale-context regressions pass.
- [x] Review, show, finalize, implement, stay, revise, exit, resume, failure rollback, and divergent-branch behavior are covered by passing command/session lifecycle tests.
- [x] Legacy `<proposed_plan>` remains accepted by parser/lifecycle tests while prompt, active UI, and README make `plan_mode_complete` primary.
- [x] README, autocomplete, package metadata, and the inspected 11-file dry-run tarball agree; both new source modules are included and no runtime dependency exists.
- [x] Repository quality is proven by passing `npm test`, `npm run typecheck`, `npm run check`, `just pack-plan-mode`, and non-interactive Pi extension loading with `--plan` shown.
