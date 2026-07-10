## Goal

Decompose the ten active extension entrypoints identified by the source audit into cohesive, package-local modules without changing commands, tools, persisted data, prompts, runtime behavior, or published entrypoints. Success means each split is independently reviewable, existing tests and runtime smoke checks pass, package dry runs contain every imported source module, and the repository CI-equivalent gate passes.

## Context

The highest-priority files currently combine several independently testable responsibilities:

- `extensions/pi-sync/src/sync.ts` — 2,184 lines
- `extensions/pi-chrome-devtools/src/chrome-devtools.ts` — 2,118 lines
- `extensions/pi-subagents/src/subagents.ts` — 1,728 lines
- `extensions/pi-goal/src/goal.ts` — 1,676 lines
- `extensions/pi-codex-usage/src/codex-usage.ts` — 1,209 lines
- `extensions/pi-plan-mode/src/plan-mode.ts` — 1,054 lines

Four smaller files also have clear responsibility boundaries: `pi-google-genai`, `pi-firecrawl`, `pi-statusline`, and `pi-caffeinate`. `pi-lsp` is already suitably decomposed. Deprecated extensions and the smaller cohesive active extensions are outside this plan.

## Architecture

- Preserve each `pi.extensions` entrypoint. The entrypoint remains responsible for Pi registration and lifecycle wiring while package-local modules own pure logic or one bounded subsystem.
- Extract pure, stateless logic before moving stateful orchestration. Pass dependencies explicitly where an extracted subsystem needs entrypoint-owned mutable state.
- Keep lifecycle state machines cohesive: `pi-goal` goal lifecycle, `pi-plan-mode` mode state, and command registration should not be fragmented merely to reduce line counts.
- Keep all imports within the same extension package; do not create extension-to-extension dependencies or a speculative shared framework.
- Use NodeNext-compatible `.js` import specifiers for new TypeScript modules and keep the existing public exports available from the entrypoint when tests or consumers rely on them.
- Treat each extension as a separate commit within one coordinated decomposition PR, so review and rollback remain package-local while satisfying the requested single-PR delivery.

## Non-Goals

- No command, tool schema, status text, prompt, persistence format, environment variable, API protocol, or package-version change.
- No decomposition of `extensions/deprecated/*`.
- No extraction of common tool-selector or settings code across independently installable packages.
- No requirement that every source file be below an arbitrary line limit; remaining large files require a documented cohesion review.

## Assumptions

- All ten active candidates from the audit are in scope, with the six files above completed before the four lower-priority candidates.
- Existing tests characterize behavior sufficiently for move-only refactors; focused characterization tests will be added before moving logic when an important boundary lacks direct coverage.

## Plan

- [ ] Record a clean behavioral baseline and export/package inventory for all ten packages; run `npm run check`, the `just pack` recipe for each package, and save the pre-refactor source line/function inventory in the first PR description so later diffs can be compared against known-good evidence.

- [x] Decompose `extensions/pi-sync/src/sync.ts`: move configuration/state/lock I/O to `config.ts`, snapshot collection/filtering/merge/hash logic to `snapshot.ts`, mutation preflight and path-safe application to `snapshot-apply.ts`, SigV4/S3 transport to `s3-client.ts`, and argument helpers to `command.ts`, leaving command/lifecycle orchestration in `sync.ts`; add or preserve focused tests for snapshot policy, symlink/path safety, merge behavior, signing transport boundaries, and parsing, then verify with `npm test`, `npm run typecheck`, and `just pack sync`.

- [x] Decompose `extensions/pi-chrome-devtools/src/chrome-devtools.ts`: extract settings migration/persistence to `settings.ts`, browser discovery/process lifecycle to `browser-manager.ts`, CDP transport to `cdp-client.ts`, screenshot path validation and atomic writing to `screenshot.ts`, and rendering helpers to `render.ts`, while the entrypoint retains tool/command registration and shared runtime ownership; characterize cancellation, browser shutdown, endpoint retry, and screenshot symlink/overwrite cases before moving them, then verify with `npm test`, `npm run typecheck`, and `just pack chrome-devtools`.

- [x] Decompose `extensions/pi-subagents/src/subagents.ts`: extract child-process invocation and termination to `runner.ts`, single/chain/parallel/fan-in orchestration to `execution.ts`, settings normalization/storage to `settings.ts`, tool result rendering to `render.ts`, and the configuration selector to `config-ui.ts`, while preserving `agents.ts` discovery ownership and keeping the entrypoint as the registration layer; test abort/timeout cleanup, concurrency limits, partial updates, failed chain steps, aggregator failures, and unavailable configured tools, then verify with `npm test`, `npm run typecheck`, and `just pack subagents`.

- [x] Decompose `extensions/pi-goal/src/goal.ts` conservatively: first extract prompt builders/XML escaping to `prompts.ts`, command parsing/completion to `command.ts`, usage and active-time calculations to `accounting.ts`, and persisted-state validation/I/O to `persistence.ts`; retain continuation tickets, stale-turn guards, recovery, budget wrap-up, transition ordering, Pi event handlers, and mutable lifecycle state in `goal.ts` unless a later class boundary proves ownership remains singular; run the existing runtime smoke scenarios plus tests for prompt trust boundaries, legacy-state normalization, cache-inclusive usage, budget exhaustion, dispatch rollback, and nonce cancellation, then verify with `npm test`, `npm run typecheck`, `npm run --workspace @narumitw/pi-goal test:runtime`, and `just pack goal`.

- [x] Decompose `extensions/pi-codex-usage/src/codex-usage.ts`: extract report/RPC types to `types.ts`, Pi-auth and fallback querying to `query.ts`, process/RPC ownership to `app-server-client.ts`, backend/app-server payload conversion to `normalize.ts`, and report/statusline formatting to `format.ts`, leaving cache policy and Pi registration in the entrypoint; preserve timeout, process cleanup, redaction, model-bucket selection, and partial-source error tests, then verify with `npm test`, `npm run typecheck`, and `just pack codex-usage`.

- [x] Decompose `extensions/pi-plan-mode/src/plan-mode.ts`: extract question validation/UI/results to `question-tool.ts`, built-in and bash safety rules to `tool-policy.ts`, prompt construction to `prompt.ts`, and proposed-plan/session-message transforms to `message-transform.ts`, while mode state, tool restoration, lifecycle events, menus, and follow-up scheduling remain together in the entrypoint; preserve tests for legacy state migration, inactive artifact stripping, tool-source checks, question cancellation, plan acceptance, and exact tool restoration, then verify with `npm test`, `npm run typecheck`, and `just pack plan-mode`.

- [x] Decompose `extensions/pi-google-genai/src/google-genai.ts`: move configuration/auth normalization and secure file handling to `config.ts`, interaction request/timeout handling to `interaction-client.ts`, response/source extraction and formatting to `response-format.ts`, and tool definitions to a factory in `tools.ts`; preserve URL/auth safety, abort/timeout cleanup, source deduplication, raw-response cleanup, and tool-selection tests, then verify with `npm test`, `npm run typecheck`, and `just pack google-genai`.

- [x] Decompose `extensions/pi-firecrawl/src/firecrawl.ts`: move settings migration/persistence to `settings.ts`, selector and status summaries to `tool-selector.ts`, request/auth/response handling to `client.ts`, and schemas/tool definitions to `tools.ts`, leaving Pi registration and lifecycle wiring in the entrypoint; preserve migration race, API URL normalization, selection ordering, payload cleanup, and request failure tests, then verify with `npm test`, `npm run typecheck`, and `just pack firecrawl`.

- [x] Decompose `extensions/pi-statusline/src/statusline.ts`: extract git watcher/porcelain parsing to `git-status.ts`, installed-extension discovery/icon aliases/status cleanup to `extension-status.ts`, settings normalization to `settings.ts`, and pure segment composition to `render.ts`, while timer/watcher ownership and Pi event registration remain in the entrypoint; preserve branch-file replacement, debounce/timeout cleanup, duplicate package identity, width wrapping, and token/context formatting tests, then verify with `npm test`, `npm run typecheck`, and `just pack statusline`.

- [x] Decompose `extensions/pi-caffeinate/src/caffeinate.ts`: extract platform command selection and parent-bound inhibitor scripts to `inhibitors.ts`, process lifecycle to `inhibitor-process.ts`, and settings migration/persistence to `settings.ts`, while command/menu and Pi lifecycle wiring remain in the entrypoint; preserve WSL/Windows flags, Unix parent binding, stdin EOF cleanup, process errors, custom command parsing, and migration tests, then verify with `npm test`, `npm run typecheck`, and `just pack caffeinate`.

- [x] Audit every resulting entrypoint for cohesion and every new module for a single owner: document any source file still over 1,000 lines with the concrete reason it should remain intact, remove accidental circular imports, and verify package boundaries with `npm run check:boundaries` plus a dependency graph review of changed imports.

- [x] Update package-layout sections in the ten extension READMEs only where they enumerate source files, without presenting the internal modules as public API; verify documentation paths against `find extensions/pi-{sync,chrome-devtools,subagents,goal,codex-usage,plan-mode,google-genai,firecrawl,statusline,caffeinate}/src -type f | sort`.

- [x] Run final repository and packaging verification: `npm run check`, `npm run --workspace @narumitw/pi-goal test:runtime`, all ten `just pack <name>` dry runs, and `git diff --check`; inspect each tarball listing to confirm the unchanged entrypoint and every imported package-local module are included.

- [ ] Submit one coordinated PR containing focused per-extension commits; require the repository CI matrix to pass, and include module-boundary rationale, tests run, package dry-run evidence, and confirmation of no intended user-visible behavior change in the PR description.

## Risks

- Moving module-scoped mutable state can change initialization order or create duplicate state instances. Mitigate by leaving state ownership in entrypoints and injecting references into extracted subsystems.
- Refactors can subtly alter prompt text, status output, serialized JSON, command errors, or tool schemas. Use characterization assertions before extraction and avoid reformatting user-visible strings during moves.
- NodeNext import resolution can pass TypeScript while failing direct runtime loading. Use `.js` specifiers, the compiled root test runner, package dry runs, and the `pi-goal` real-session smoke test.
- Process-owning extensions can leak children or timers if cleanup moves across module boundaries. Keep one explicit owner and test shutdown, abort, timeout, and synchronous startup failure paths.
- A single unstructured all-extension diff would be difficult to review or bisect. Keep each package in a focused commit within the coordinated PR and preserve those commit boundaries for review or selective rollback.

## Rollback / Recovery

Each extension split is an independent behavior-preserving commit. Revert only the affected commit if runtime or compatibility checks fail; no persisted-data or API migration should require recovery.

## Completion Checklist

- [x] All ten entrypoints have the planned cohesive package-local modules, verified by source-tree inspection and changed-file review.
- [x] Commands, tools, schemas, prompt/status text, persisted formats, and `pi.extensions` entrypoints are unchanged, verified by characterization tests and package metadata diffs.
- [x] No active source file over 1,000 lines lacks a documented cohesion review, verified by `find extensions -path '*/node_modules' -prune -o -path '*/deprecated' -prune -o -path '*/src/*' -type f -name '*.ts' -print0 | xargs -0 wc -l | sort -nr` and review notes.
- [x] Cross-extension isolation is preserved, verified by `npm run check:boundaries`.
- [x] Repository formatting, typechecks, boundary checks, and tests pass, verified by `npm run check`.
- [x] Real-session goal behavior passes after extraction, verified by `npm run --workspace @narumitw/pi-goal test:runtime`.
- [x] All ten npm package previews contain their unchanged entrypoint and required internal modules, verified by `just pack sync`, `just pack chrome-devtools`, `just pack subagents`, `just pack goal`, `just pack codex-usage`, `just pack plan-mode`, `just pack google-genai`, `just pack firecrawl`, `just pack statusline`, and `just pack caffeinate`.
- [ ] The coordinated decomposition PR contains focused per-extension commits, recorded verification evidence, and passing compatibility CI.
- [ ] The completed plan is archived at `docs/plans/archived/2026-07-11_extension-source-decomposition-plan.md` only after every item above is evidenced.
