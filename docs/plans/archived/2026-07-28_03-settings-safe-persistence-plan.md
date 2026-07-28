# PR 03 — settings safe persistence

## Goal

Bring mutable extension settings in line with Pi core's read–merge–write and durability semantics: preserve unknown fields, block malformed-file replacement, serialize saves, and keep displayed, runtime, and persisted state consistent after failure.

## Architecture

- Package-owned update functions wait for earlier writes to the same path, reread the latest document, require a valid top-level object and valid recognized fields, merge only owned fields, and publish atomically.
- Missing files start from defaults and are created by the first explicit save. Malformed or invalid existing files block mutation until the user repairs or removes them.
- Interactive flows either apply runtime state only after persistence succeeds or capture enough state to roll back exact runtime/tool state when persistence or runtime application fails.
- Settings containing credentials retain private permissions and redact secrets from every error. Full-document editors in pi-starship and pi-statusline remain transactional document replacements and are outside this patch-based PR.

## Assumptions

- PR 03 is based after PR 02 and reuses its hard-link-free publication and canonical path behavior.
- The production scope is pi-caffeinate, pi-chrome-devtools, pi-firecrawl, pi-google-genai, pi-langfuse, and pi-worktree; experimental pi-webui receives the same treatment only if its current settings UI demonstrates the same stale-document failure during the first test task.
- Cross-process locking is added only where concurrent Pi processes can otherwise lose a verified update; in-process ordering alone is not presented as cross-process safety.

## Risks

- Tool selectors modify Pi's global active-tool list, so rollback must restore the exact pre-change list without removing tools owned by another extension.
- Google GenAI and Langfuse documents contain credentials; merge and error paths must not expose or relax them.
- Caffeinate runtime application may restart an inhibitor process, requiring rollback of both settings state and process behavior if the transaction fails.

## Rollback / Recovery

- Retain the prior document and effective runtime snapshot until both persistence and application succeed.
- On a failed write, remove only the owned temporary. On a failed runtime application after publication, atomically restore the prior valid document and exact runtime state; report combined primary and rollback errors when recovery is incomplete.

## Plan

- [x] Added focused tests across the six scoped packages and pi-webui; the initial compiled run recorded 11 failures showing unknown-field loss, invalid-file replacement, stale-document writes, and runtime divergence before implementation.
- [x] Refactored pi-caffeinate, pi-chrome-devtools, and pi-firecrawl into queued read–validate–merge–rename updates; tests cover first-save creation, invalid-file refusal, unknown fields, ordered saves, recovery after rejection, and temporary cleanup after failed publication.
- [x] Made caffeinate mode changes and Chrome DevTools/Firecrawl tool changes serialized runtime/persistence transactions; failed saves restore prior owned runtime state while preserving current tools from other extensions, and lifecycle generations prevent stale-session continuations.
- [x] Refactored pi-google-genai setup and tool patches to reread valid private documents, preserve unknown fields and literal keys, retain `0600`, serialize writes, redact parse failures, and restore Google tool state on failure.
- [x] Refactored pi-langfuse updates to merge the latest valid private document, preserve unknown fields, block malformed or invalid files, retain `0600`, serialize writes, redact parse failures, and await writes across session boundaries.
- [x] Changed pi-worktree queued saves to reread and validate immediately before merging `worktreeRoot`; tests cover concurrent unknown-field edits, invalid concurrent edits, failed publication, ordering, and delayed session replacement.
- [x] Reproduced pi-webui's stale-document save with a focused failure, then changed saves to reread and validate the latest document while retaining its existing action queue and displayed/effective rollback.
- [x] Updated all affected READMEs with first-save, validation, unknown-field, in-process ordering, reload, failure, and rollback behavior.
- [x] Ran focused typechecks and 392 touched-package tests during iteration, an isolated Pi RPC load smoke for all seven affected packages, and `npm run check` with 1,673 passing tests. Audited the diff against both settings guides; ordering is intentionally in-process only and no cross-process safety is claimed for these paths.

## Completion Checklist

- [x] Every scoped patch save begins from the latest valid document and preserves unknown fields.
- [x] No malformed or invalid existing settings file is silently replaced by a menu, command, setup, or tool-selection action.
- [x] Concurrent in-process saves remain ordered and usable after failure; no scoped path claims unsupported cross-process locking.
- [x] Failed persistence or runtime application leaves displayed, effective, and persisted settings consistent or reports an explicit recovery failure.
- [x] Credential permissions and redaction remain intact.
- [x] Documentation, focused tests, runtime smokes, typechecks, and `npm run check` pass.
