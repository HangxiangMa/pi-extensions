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

## Plan

### Phase 1: Contract qualification

- [ ] Inventory every call site and focused test for the Statusline and Starship duplicate sanitizer; record whether each value is a path, model ID, symbol, metadata value, or already-formatted line.
- [ ] Compare the duplicate policy with Pi TUI root exports, Node's terminal-control utilities, and Pi TUI Kit's internal text functions; select an existing public owner if and only if its exact behavior and compatibility floor match.
- [ ] Build a behavior matrix covering printable Unicode, combining marks, emoji, tabs, CR, LF, C0 and C1 controls, CSI, OSC, DCS, APC, ST and BEL terminators, unterminated sequences, Unicode separators, bidi controls, and adjacent safe text.
- [ ] Run the matrix against both duplicate implementations and their real formatting call sites; record every current difference or missing test before choosing a public contract.
- [ ] Decide whether one single-line function is sufficient, choose its stable name and replacement policy, and record a finite no-go instead of adding an API if the two consumers do not share the same required behavior.
- [ ] Map the selected contract to terminal-safety, width, package, Changeset, and release MUST rules from `docs/extension-conventions.md` and identify focused verification for each rule.

### Phase 2: Kit-only API

- [ ] Add failing package-root type and runtime tests for the qualified sanitizer contract, including malicious complete and unterminated terminal sequences and printable Unicode preservation.
- [ ] Add failing width-boundary composition tests proving sanitized output remains safe when consumers subsequently use Pi TUI cell-aware truncation.
- [ ] Implement the smallest stateless sanitizer in a descriptive Pi TUI Kit module and export only the qualified function and required type, if any, from `packages/pi-tui-kit/src/index.ts`.
- [ ] Reuse the new function internally only where exact existing Kit behavior is characterized as compatible; leave `safeMenuText()` and exact-document formatting unchanged where whitespace or multiline semantics differ.
- [ ] Make an explicit compatibility-literal decision for `PI_EXTENSION_MENU_API_VERSION`; do not increment a menu-definition marker mechanically for an unrelated utility export.
- [ ] Update the Kit README with the display-only trust boundary, examples, exclusions, and guidance to keep raw IDs and payloads separate.
- [ ] Add a Kit-only minor Changeset and verify that no consumer source or dependency floor uses the unpublished export.
- [ ] Run the complete Kit tests and check, the runtime import benchmark, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack tui-kit` sequentially; inspect root runtime and declaration exports in the tarball.
- [ ] Audit the final Kit diff for escape-parser bounds, malformed input, memory behavior on large strings, zero private imports, and unchanged existing menu rendering.

### Release gate

- [ ] Obtain explicit user approval before performing any publication, tag, visibility, or release-workflow action.
- [ ] Verify the approved Kit release with `npm view`, registry tarball inspection, and a clean temporary installation that imports the sanitizer from runtime JavaScript and declarations.
- [ ] Record the registry-visible compatibility floor before changing either consumer manifest.

### Phase 3: Statusline consumer

- [ ] Create a Statusline-only branch from then-current `origin/main`, add characterization tests for every real call-site class, and verify the existing package baseline.
- [ ] Raise only Statusline's Kit floor to the registry-verified release, refresh the root lockfile, and prove the consumer scope resolves the intended version before typechecking.
- [ ] Replace the local sanitizer with the published Kit export while preserving model, symbol, directory, path fallback, width, and terminal-control presentation.
- [ ] Delete only the superseded local module and imports, and retain raw path and model values for all non-display behavior.
- [ ] Add the appropriate Statusline Changeset, then run focused tests, the package check, dependency-resolution verification, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack statusline`.
- [ ] Exercise a practical local Pi footer smoke with malicious model or path display text when possible and record any unverified provider-controlled path.

### Phase 4: Starship consumer

- [ ] Create a Starship-only branch from then-current `origin/main`, add characterization tests for every model and directory call-site class, and verify the existing package baseline.
- [ ] Raise only Starship's Kit floor when its current range does not already include the registry-verified release, refresh the lockfile if needed, and prove resolved compatibility before typechecking.
- [ ] Replace the duplicate module with the published Kit export while preserving contracted paths, repository-relative paths, full-path metadata, model symbols, width, and terminal-control presentation.
- [ ] Delete only the superseded local module and imports, and retain raw values for filesystem, settings, template, and action behavior.
- [ ] Add the appropriate Starship Changeset, then run focused tests, the package check, dependency-resolution verification, `npm run check:boundaries`, `npm run check`, `git diff --check`, and `just pack starship`.
- [ ] Exercise a practical local Pi Starship smoke with malicious model or path display text when possible and record any unverified provider-controlled path.

### Phase 5: Follow-up boundary

- [ ] Reassess Fleet, Chat, Subagents, GitHub PR, and other sanitizer implementations against the published contract; record compatible future migrations or explicit semantic no-go reasons without widening the API.
- [ ] Update the roadmap decision record with the verified API, proof consumers, release ordering, retained specialized policies, and any accepted compatibility change.
- [ ] Complete a final cross-package audit proving that sanitization remains at display boundaries and no raw identity, persistence, path, URL, or domain behavior changed.

## Completion Checklist

- [ ] One exact terminal display policy is qualified by at least two compatible consumers or the proposal ends with a finite no-go.
- [ ] Any new Kit export is additive, documented, terminal-safe, independently published, registry-verified, and covered through runtime plus declaration tests.
- [ ] Statusline and Starship adopt only a published compatible API and preserve their user-visible output contract or document an explicitly approved change.
- [ ] Incompatible multiline, redaction, byte-bound, path, and hyperlink policies remain package-owned.
- [ ] Every package change has focused tests, semantic audit evidence, package checks, root gates, and inspected tarballs.
- [ ] No publication or release workflow occurs without explicit user approval.
- [ ] The plan is archived only after all accepted implementation, release, and consumer tasks have evidence.
