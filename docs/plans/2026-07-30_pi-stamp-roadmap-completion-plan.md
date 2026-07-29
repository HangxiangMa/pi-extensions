# pi-stamp Roadmap Completion Plan

## Goal

Complete every actionable milestone in [`docs/roadmaps/pi-stamp-roadmap.md`](../roadmaps/pi-stamp-roadmap.md): add opt-in assistant provenance/usage and tool timing while preserving the timestamp-only default, and resolve the platform-integration phase against Pi's current public API. Finish with verified documentation, a focused commit, and a new pull request.

## Context

- Phases 1–3 are implemented with exact versioned custom-entry validation, TUI-only persistence, live user settings, and no model-context impact.
- Pi 0.82.1 exposes assistant API/provider/model/response-model/response-ID, stop reason, usage, cost, and bounded diagnostics through finalized assistant messages.
- Pi exposes parallel-safe tool lifecycle IDs, but tool-result messages are persisted after `tool_execution_end`; tool stamps therefore need to be retained by ID and appended in source order at `turn_end`.
- Pi still exposes no public decorator for built-in user, assistant, or tool transcript rows. Phase 6 remains an upstream dependency rather than an implementable extension change.
- Touched areas are persisted custom entries, assistant/tool lifecycle state, rendering, extension-owned settings and menu UI, documentation, package verification, and PR delivery. Applicable MUST rules are exact runtime validation; TUI-only custom UI/data; bounded and cleared session state; ordered atomic settings; cancellation/disposal/replacement/shutdown safety; width/theme safety; deterministic tests; root checks; pack inspection; and a Pi load/runtime smoke.

## Architecture

- Add an `assistantMetadata` setting with `off`, `compact`, and `expanded` modes. Keep `off` as the compatibility default. New assistant stamps persist a sanitized version-4 metadata snapshot so mounted entries can re-render after settings changes. Compact mode shows model, provider-reported model differences, reported total tokens, and reported estimated cost. Expanded mode additionally labels API, provider, requested/response models, stop reason, and every reported usage field.
- Keep response IDs and bounded diagnostic summaries behind both metadata opt-in and Pi's explicit transcript-expansion state. Persist only sanitized identifiers, diagnostic type/error-name/error-code summaries, and counts; never persist or display stacks, details, raw payloads, signatures, or content blocks in stamp data.
- Add a boolean `toolStamps` setting, defaulting to `false`. Track at most 256 currently enabled tool observations by exact `toolCallId`; finalize each from its matching end event, then append source-ordered version-1 tool entries at `turn_end`. Render only tool name, elapsed duration, and success/error. Clear all pending state on turn replacement, agent cancellation/end, session replacement/reload, and shutdown.
- Preserve version 1–3 message entries exactly. Version 4 accepts optional valid timing plus exact sanitized assistant metadata. Tool entries use a disjoint exact schema. Unknown or malformed entries render nothing.
- Update the roadmap into an outcome-oriented current record: Phases 4 and 5 implemented, Phase 6 explicitly blocked on a stable upstream transcript-decoration API, with success evidence and the compatibility strategy retained.

## Non-Goals

- Provider telemetry calls, cost estimation beyond the value already reported by Pi, token derivation, timing aggregation, relative-time refresh, or analytics dashboards.
- Raw diagnostics, diagnostic details/stacks, message content, opaque signatures, credentials, or tool arguments/results in stamp rows.
- Monkey-patching Pi transcript components or claiming in-row integration before a public API exists.
- Project settings, environment-variable overrides, cross-process locking, new dependencies, or new command routes.

## Risks

- Metadata strings are terminal input. Sanitize controls and cap persisted/displayed identifiers and summaries before publication; validate exact payload shapes on reload.
- Parallel tool completion order differs from source order. Pair only by ID and consume finalized observations according to `turn_end.toolResults`, never map insertion or completion order.
- Cancellation can leave starts without ends. Bound the map and clear it independently at every turn/session terminal boundary.
- Missing provider fields must remain missing. Format only individually validated values and never infer token totals, response models, costs, or diagnostic text.
- Longer metadata can wrap. Keep every line ANSI-width-safe and make expanded output intentionally multi-line.

## Plan

- [x] Add red-first formatter tests for assistant metadata off/compact/expanded output, requested-versus-response model labels, every optional usage field, cost/token boundaries, explicit debug expansion, sanitized diagnostics, missing data, tool duration/outcome, and narrow widths; `npm test` reached the intended TS2307 failure for the absent `src/metadata.ts` module.
- [x] Implement pure metadata/tool formatting and bounded sanitization in `extensions/pi-stamp/src/metadata.ts`, with the elapsed helper reused by `format.ts`; seven focused metadata tests and all nine existing formatter tests pass.
- [x] Add red-first settings/menu tests for `assistantMetadata` and `toolStamps` defaults, exact validation, source reporting, unknown-field preservation, ordered persistence, live rows, rollback, invalid-file read-only behavior, cancellation/disposal, and RPC adaptation; test compilation reached the intended TS7053/TS2339/TS2353 failures for the absent fields/actions.
- [x] Extend `extensions/pi-stamp/src/settings.ts` and `extensions/pi-stamp/src/menu.ts` through the existing settings protocol and `pi-tui-kit` menu; all five focused menu and seven settings tests pass alongside formatter/metadata coverage.
- [x] Add red-first persistence/lifecycle tests for exact version-4 assistant and version-1 tool schemas, legacy compatibility, context exclusion, metadata capture, signature/raw-diagnostic exclusion, strict parallel ID pairing, source-order append, duplicate/unmatched/invalid events, the 256-entry bound, disabled behavior, and cleanup on turn, cancellation, replacement, reload, and shutdown; compilation first reached the intended missing-export failures, and a later duplicate-result test reproduced two stamps before the one-shot fix.
- [x] Implement assistant snapshot and bounded tool observation ownership in `extensions/pi-stamp/src/stamp.ts`; all 27 focused stamp/lifecycle tests pass, and tool-specific coverage was split into `stamp-tool.test.ts` to keep every source/test file below 1,000 lines.
- [x] Update `extensions/pi-stamp/README.md` and `docs/roadmaps/pi-stamp-roadmap.md` with settings, display examples, privacy/debug semantics, tool timing behavior, persistence versions, completed Phases 4–5, and the verified Phase 6 upstream dependency; 11 documentation assertions pass, the root catalog/package metadata match, and the roadmap now records all required strategic sections plus the blocked public-API dependency.
- [x] Format only touched paths, run focused tests, root `npm test`, `npm run check`, `just pack stamp` with tarball inspection, and non-interactive Pi load plus representative programmatic TUI/lifecycle smokes; all 55 focused tests and all 1,838 root tests pass, the full check exits cleanly, the exact nine-file pack is verified, Pi package loading leaves settings absent, and a real RPC `/stamp` menu opens/closes without mutation.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, Pi extension/session/TUI/package/keybinding docs, and every roadmap requirement; package boundaries, defaults, exact payload/settings validation, unknown-field and malformed-file protection, atomic ordering/rollback, menu cancellation/disposal, TUI/non-TUI behavior, width/theme safety, metadata privacy, parallel tool association/bounds, turn/session cleanup, context exclusion, older-entry compatibility, and Phase 6's public-API dependency pass with no accepted deviation or unverified path.
- [ ] Mark every item complete with evidence, archive this plan under `docs/plans/archived/`, create one focused Conventional Commit, push the branch, open a new PR, and verify its head/base, body, checks, and diff.

## Completion Checklist

- [x] Timestamp-only output remains the default, all version 1–3 entries remain readable, and stamps remain TUI-only and outside model context.
- [x] Opt-in assistant metadata truthfully presents only provider/message-reported fields; response IDs and sanitized diagnostic summaries require explicit transcript expansion; signatures, raw diagnostics, credentials, and content never appear.
- [x] Opt-in tool stamps report duration and outcome after the tool block, pair parallel tools strictly by ID, remain bounded, and clear on every cancellation/replacement/shutdown path.
- [x] New settings preserve the established validation, precedence, unknown-field, malformed-file, atomic-publication, ordering, rollback, reload, menu, and RPC contracts.
- [x] The roadmap records Phases 4–5 as implemented and Phase 6 as an explicit upstream dependency with the older-entry compatibility contract intact.
- [ ] Focused and root tests, full checks, package dry run, Pi load/runtime smoke, semantic audit, commit, push, and new PR are all complete and verified.
