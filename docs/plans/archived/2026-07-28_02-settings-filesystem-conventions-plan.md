# PR 02 — settings filesystem conventions

## Goal

Remove hard-link publication from active extension settings, make absent-settings reads side-effect free, and use Pi's canonical agent-directory API without weakening atomic publication, migration safety, private permissions, or concurrent-creator protection.

## Context

The audit found hard-link settings paths in pi-accounts, pi-caffeinate, pi-chrome-devtools, pi-firecrawl, pi-google-genai, pi-lsp, pi-plan-mode, pi-starship, pi-statusline, pi-subagents, pi-sync, and experimental pi-webui. Pi-starship and pi-statusline also create defaults during `session_start`; pi-sync creates lock state while reading an absent file; pi-accounts materializes an empty credential file during factory construction.

## Architecture

- Missing canonical and legacy files return defaults or an unconfigured result without creating a directory, file, lock, or temporary.
- Explicit saves use same-directory temporary files plus rename. Legacy-only preference files are read in place with a manual-rename warning instead of being published during loading; the first explicit save writes the canonical path, and canonical content always wins.
- Automatic credential/state migrations remain only in pi-accounts and pi-sync, where existing package-owned cross-process locks protect temp-file-plus-rename publication. Experimental pi-webui uses a package-local lock for explicit initialization and a stable plain Node `fs` adapter.
- Pi-accounts treats a missing credential store as empty in memory and creates it only on the first mutation. Pi-sync uses its existing configuration lock for migration and mutation, but takes a read-only fast path when both settings names are absent.
- Pi-starship and pi-statusline keep editable default documents in code and materialize them only after an explicit save.

## Assumptions

- PR 02 is based after PR 01 because both touch pi-lsp configuration lookup.
- Existing valid legacy files remain readable throughout the migration window; no migration deletes its source until the canonical publication is verified.
- Full read–merge–write and UI rollback changes belong to PR 03, except where required to make first explicit creation safe.

## Risks

- Replacing hard-link no-clobber semantics can overwrite a concurrent creator unless every remaining automatic or explicit exclusive path locks and rechecks before rename.
- Credential migrations must retain `0600`, regular-file and symlink checks, exact-byte validation, and rollback/recovery copies.
- Removing startup-created examples changes documented first-run behavior for pi-starship and pi-statusline.

## Rollback / Recovery

- Keep legacy inputs until canonical identity and bytes are verified; on failure, remove only the package-owned temporary or canonical file whose identity still matches.
- Preserve prior canonical bytes on every failed replacement and leave an actionable warning rather than silently falling back to a partially published file.

## Plan

- [x] Add failing regression tests for side-effect-free missing loads in pi-starship, pi-statusline, pi-sync, and pi-accounts, plus Android-style `EACCES` publication cleanup for experimental pi-webui; the pre-implementation starship/statusline tests created the missing parent (`true !== false`).
- [x] Replace pi-starship and pi-statusline `loadOrCreate*` startup paths with read-only loads and explicit-save creation; repeated `session_start` tests leave missing files and parent directories absent.
- [x] Replace hard-link legacy publication in pi-caffeinate, pi-chrome-devtools, pi-firecrawl, pi-google-genai, pi-lsp, pi-plan-mode, pi-statusline, and pi-subagents with side-effect-free legacy fallback and manual-rename warnings; tests prove canonical precedence and unchanged legacy bytes.
- [x] Refactor pi-sync's existing locked installer and recovery paths to use hard-link-free atomic publication; exact private bytes survive injected `EACCES`, post-install, migration, and rollback failures.
- [x] Refactor experimental pi-webui's explicit `/webui init` publication to avoid hard links while retaining concurrent-init and cleanup behavior; focused settings tests pass.
- [x] Make pi-accounts credential reads lazy and pi-sync absent reads lock-free; focused tests with nonexistent agent directories prove reads do not materialize storage, while mutation and concurrent migration tests pass.
- [x] Replace manual `PI_CODING_AGENT_DIR` reconstruction in pi-caffeinate, pi-chrome-devtools, pi-firecrawl, pi-google-genai, and pi-langfuse with `getAgentDir()`; `test/settings-filesystem-conventions.test.ts` verifies tilde expansion for all five.
- [x] Update affected package READMEs with the final migration and first-save behavior, and verify no documentation still promises automatic default-file creation or hard-link publication.
- [x] Run focused workspace typechecks for every touched package, `npm test`, `npm run check`, and `npm pack --workspace @narumitw/pi-webui --dry-run --json`; all 1,654 repository tests passed, the 30-file package preview was bounded, and the source convention test finds no settings/config publication through `link()` or `linkSync()`.

## Completion Checklist

- [x] Missing settings and credential stores are read-only until an explicit user mutation or a validated legacy migration is required.
- [x] No active or experimental settings publisher uses a hard link, including migration, initialization, replacement, or recovery.
- [x] Atomicity, canonical precedence, concurrent-creator handling, private permissions, invalid-file protection, and legacy recovery remain tested.
- [x] All settings paths resolve through Pi APIs and support tilde-expanded agent-directory overrides.
- [x] Package documentation, tests, typechecks, pack checks, and `npm run check` pass.
