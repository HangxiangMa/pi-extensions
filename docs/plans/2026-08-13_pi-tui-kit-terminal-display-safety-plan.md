# Pi TUI Kit Terminal Display Safety Plan

## Goal

Qualify one small extension-neutral terminal display sanitizer, publish it from Pi TUI Kit only if two consumers share an exact contract, and migrate those consumers only after the public API is independently released and registry-verified.

## Context

`packages/pi-statusline/src/terminal.ts` and `packages/pi-starship/src/modules/terminal.ts` contain the same `sanitizeTerminalText()` implementation.

Both copies remove terminal escape sequences and unsafe controls before rendering model names, symbols, paths, and footer metadata.

Other packages also sanitize terminal text, but their contracts differ materially.

Pi Fleet preserves newlines and expands tabs, Pi Chat replaces unsafe sequences while preserving transcript layout, Pi Subagents combines sanitization with redaction and byte limits, and Pi GitHub PR intentionally creates safe OSC 8 links.

Pi TUI Kit already sanitizes its declarative screens internally, but its internal `safeMenuText()` and `replaceTerminalControls()` normalize whitespace and individual controls for menu presentation rather than implementing the exact Statusline and Starship policy.

The duplicated pair is sufficient evidence to qualify one narrow display-boundary API, but it is not evidence for a universal text, redaction, path, truncation, or hyperlink framework.

## Architecture

The candidate API accepts untrusted text and returns display-only text.

Raw model IDs, paths, URLs, action IDs, persisted values, and domain payloads remain unchanged and never round-trip through the sanitizer.

The qualification phase must choose and document exact behavior for complete CSI, OSC, DCS, APC, and unterminated sequences; C0 and C1 controls; tabs; CR and LF; Unicode separators; bidi controls; malformed surrogate input; and printable Unicode.

The first public contract should be one single-line display policy unless the consumer matrix proves a second multiline policy is independently necessary.

Cell-aware wrapping and truncation remain owned by Pi TUI's `visibleWidth()` and `truncateToWidth()` rather than the sanitizer.

The Kit API pull request, package release, Statusline migration, and Starship migration remain separate, dependency-ordered changes.

## Non-Goals

- Do not add redaction, secret masking, byte or line limits, path contraction, URL validation, OSC 8 construction, error wording, or logging policy.
- Do not mutate raw payloads or use sanitized text as a filesystem path, stable ID, action value, persistence value, or network value.
- Do not replace package-specific multiline transcript policies whose replacement characters or whitespace semantics differ.
- Do not deep-import Pi implementation files or duplicate a stable root-exported Pi function if the qualification finds an exact public owner.
- Do not release the Kit API and its first consumer in the same publication step.
- Do not publish, create tags, change visibility, or dispatch a release workflow without explicit user approval.

## Risks

- Stripping only the ESC byte can leave attacker-controlled sequence payload visible, while stripping too much can remove legitimate neighboring text.
- Replacing line controls with spaces versus deleting them changes footer and path presentation and can create accidental token concatenation.
- Removing bidi controls improves visual trust but changes the current duplicate contract and therefore requires an explicit compatibility decision.
- Sanitizing before versus after path contraction can affect both display safety and recognizable path output.
- A broad helper can attract incompatible transcript, redaction, and hyperlink responsibilities and become harder to evolve safely.
- A local workspace can hide an unpublished or incompatible Kit dependency, so clean registry installation is a mandatory release gate.

## Rollback / Recovery

The Kit addition must be additive so consumer migrations can be reverted independently without removing the published export.

If a migrated consumer exposes a compatibility problem, restore its local sanitizer and prior dependency floor while retaining the additive Kit API until a separately approved deprecation decision.

No persisted data migration or rollback is required because sanitization occurs only at the display boundary.

## Evidence

- PR #743 added `sanitizeTerminalText()` after red-first package tests and review feedback coverage for generic ESC grammar and astral Unicode.
- PR #744 integrated the sanitizer with API 12 before the combined Kit release.
- The `@narumitw/pi-tui-kit@0.54.0` registry package exposes API 12 plus runtime and declaration exports; its 61-file tarball and clean installation were inspected.
- Statusline PR #746 and Starship PR #747 raise only their own Kit floors, delete their duplicate parser modules, preserve raw values, and have passing CI.
- Deterministic formatter tests cover model IDs, symbols, paths, CSI, OSC, DCS, APC, Unicode separators, bidi controls, width behavior, and adjacent text.

## Plan

### Phase 1: Contract qualification

- [x] Inventory every Statusline and Starship sanitizer call site as path, model ID, symbol, or formatted display metadata.
- [x] Compare the duplicate policy with Pi TUI, Node, and Kit text owners; no existing public owner matched the required complete-sequence and single-line policy.
- [x] Build a behavior matrix for printable Unicode, combining marks, emoji, line controls, C0/C1, CSI, OSC, DCS, APC, terminators, unterminated sequences, separators, bidi controls, and adjacent text.
- [x] Run the matrix against the duplicate implementations and real formatting boundaries; red-first consumer tests recorded the previously unsupported DCS/APC and bidi cases.
- [x] Select one single-line `sanitizeTerminalText()` display-only function with line separators converted to spaces and all other covered controls removed.
- [x] Map the contract to the terminal-safety, width, package, Changeset, and release MUST rules in `docs/extension-conventions.md`.

### Phase 2: Kit-only API

- [x] Add red-first package-root runtime and declaration tests for complete, unterminated, malformed, and printable Unicode input.
- [x] Add a cell-aware truncation composition test.
- [x] Implement and export one stateless sanitizer from `packages/pi-tui-kit/src/terminal-text.ts` and the package root.
- [x] Keep incompatible `safeMenuText()` and exact-document formatting behavior unchanged.
- [x] Keep the menu API marker at 11 in the sanitizer-only PR because the utility did not change menu definitions; the separate searchable-choice PR advanced it to 12.
- [x] Document the display-only trust boundary, exclusions, raw-payload rule, and cell-aware layout composition.
- [x] Add a Kit-only minor Changeset without consumer adoption in the API PR.
- [x] Pass Kit checks, runtime benchmark, boundaries, root gate, diff check, and package dry-run; inspect runtime and declaration exports.
- [x] Audit parser bounds, generic ESC grammar, malformed astral input, linear memory behavior, private imports, and unchanged menu rendering.

### Release gate

- [x] The user chose to perform the merge and publication themselves before consumer implementation continued.
- [x] Verify `@narumitw/pi-tui-kit@0.54.0` with `npm view`, its 61-file registry tarball, runtime import, and clean NodeNext declaration compilation.
- [x] Record `0.54.0` as the registry-visible compatibility floor before either consumer manifest changed.

### Phase 3: Statusline consumer

- [x] Create the Statusline-only branch `refactor/pi-statusline-terminal-sanitizer` from current `origin/main` and add red-first real-boundary model, symbol, and path tests.
- [x] Raise only Statusline's Kit floor to `^0.54.0`, refresh the lockfile, and verify the workspace resolves `0.54.0`.
- [x] Replace the local sanitizer with the published export while preserving model, symbol, directory, fallback, width, and existing CSI/OSC behavior.
- [x] Delete only `src/terminal.ts` and retain raw path and model values outside display formatting.
- [x] Add a patch Changeset and pass focused tests, package check, root gate, diff check, dependency verification, and the 28-file package dry-run; PR #746 CI passes.
- [ ] Exercise a live malicious provider-model or cwd footer smoke; deterministic renderer coverage passed, but selecting an external provider-controlled model was not practical.

### Phase 4: Starship consumer

- [x] Create the Starship-only branch `refactor/pi-starship-terminal-sanitizer` from current `origin/main` and add red-first real-boundary model, symbol, and directory tests.
- [x] Raise only Starship's Kit floor to `^0.54.0`, refresh the lockfile, and verify the workspace resolves `0.54.0`.
- [x] Replace the duplicate module with the published export while preserving contracted and repository paths, full-path metadata, model symbols, width, and existing CSI/OSC behavior.
- [x] Delete only `src/modules/terminal.ts` and retain raw filesystem, setting, template, and action values.
- [x] Add a patch Changeset and pass focused tests, package check, root gate, diff check, dependency verification, and the 78-file package dry-run; PR #747 CI passes.
- [ ] Exercise a live malicious provider-model or cwd Starship smoke; deterministic module coverage passed, but selecting an external provider-controlled model was not practical.

### Phase 5: Follow-up boundary

- [x] Reassess Fleet, Chat, Subagents, GitHub PR, and other sanitizer owners; their multiline, replacement, redaction, limits, or hyperlink semantics remain package-owned.
- [x] Update the roadmap with API 12, release ordering, open proof migrations, and retained specialized policies.
- [x] Audit both consumer diffs: sanitization stays at display boundaries and raw identity, persistence, paths, URLs, settings, templates, and actions remain unchanged.

## Completion Checklist

- [x] One exact display policy is qualified by Statusline and Starship.
- [x] The Kit export is additive, documented, terminal-safe, independently published, registry-verified, and covered through runtime plus declarations.
- [ ] Statusline and Starship migration PRs pass but remain unmerged, so repository adoption is not yet complete.
- [x] Incompatible multiline, redaction, byte-bound, path, and hyperlink policies remain package-owned.
- [x] Every package change has focused tests, semantic audits, package checks, root gates, and inspected tarballs.
- [x] Publication occurred through the user's explicitly chosen merge-and-publish path.
- [ ] Archive this plan only after PRs #746 and #747 merge or otherwise receive a final disposition and the unavailable live-smoke paths are accepted.
