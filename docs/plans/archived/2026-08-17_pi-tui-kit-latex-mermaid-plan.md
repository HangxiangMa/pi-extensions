# Pi TUI Kit LaTeX and Mermaid Plan

Status: DONE

## Goal

Add an opt-in Markdown document format to `@narumitw/pi-tui-kit` so review screens and browse detail documents can render Pi TUI Markdown, terminal-friendly LaTeX, and width-safe Unicode Mermaid diagrams without changing existing text, code, diff, RPC, or older-host behavior.

## Context

The repository currently builds and tests against Pi `0.84.2`, whose public `Markdown` component renders supported LaTeX and accepts a width-aware source transform.

Pi's Mermaid transcript support is not part of `pi-tui`; the coding-agent layer uses `grok-mermaid`, and its transformer is not a public package export.

Pi TUI Kit already shares one cached, terminal-sanitized document pipeline between review screens and `browse.detailDocument`, while RPC intentionally paginates sanitized source text.

The Kit's production boundary must continue using public `pi-tui` primitives, keep coding-agent imports type-only, preserve callback-provided themes, and avoid loading optional Mermaid work on existing menu paths.

Applicable repository MUST rules are deterministic changed-behavior tests, width-bounded and terminal-safe rendering, theme invalidation, stale revalidation after asynchronous work, direct runtime dependency declaration, independent Changeset versioning, the root CI-equivalent gate, and package inspection.

`docs/extension-settings.md` is not applicable because this change will not add, read, or write extension-owned or Pi-owned settings.

## Architecture

Extend `ReviewFormat` with `{ kind: "markdown"; renderLatex?: boolean; renderMermaid?: boolean }` and treat both options as `true` when omitted after a consumer explicitly chooses the Markdown format.

Render Markdown only in TUI mode through Pi TUI's public `Markdown` component, a Markdown theme derived from the callback-provided Pi theme, and the Kit's existing syntax highlighter, without importing the coding-agent runtime.

Sanitize raw document content before Markdown parsing or Mermaid transformation, then let the renderer add trusted theme ANSI sequences.

Use a package-internal Mermaid transformer built from public `pi-tui` parsing exports and a declared direct `grok-mermaid` dependency; do not deep-import Pi's internal Mermaid transformer.

Lazy-load `grok-mermaid` only before opening a TUI screen that contains an enabled Markdown Mermaid path, cache the module result, and revalidate menu ownership after the await.

Feature-detect the host's rich Markdown capability through public `pi-tui` exports so older hosts continue importing the Kit and render readable Markdown source instead of failing module initialization.

Render a Mermaid diagram only when parsing is complete enough to produce warning-free art and its natural width fits the current document width; otherwise preserve the original fenced source, with a concise sanitized warning for partial parses.

Keep RPC pages as sanitized, bounded Markdown source because RPC has no terminal-rendering contract, and keep print and JSON behavior unchanged through the existing unsupported-mode result.

Reuse the existing document line cache, include normalized Markdown flags in its identity, and rebuild on content, format, width, host capability, or theme invalidation so resize can switch safely between diagram and source.

Advance `PI_EXTENSION_MENU_API_VERSION` for the additive public contract and record a minor Changeset without publishing or changing any consumer compatibility floor.

## Non-Goals

- Do not alter existing `text`, `code`, or `diff` formatting or treat semantic Markdown rendering as an exact whitespace preview.
- Do not read Pi's private settings manager or make Kit rendering inherit the transcript-only `markdown.mermaid` setting.
- Do not add streaming Mermaid rendering, arbitrary consumer transforms, browser graphics, SVG, images, horizontal scrolling, persistence, or network access.
- Do not deep-import Pi internals, import the coding-agent runtime from Kit production code, or rely on another extension package.
- Do not update the private showcase or any published consumer to use the new API before the Kit release is separately published and registry-verified.
- Do not publish, tag, change npm visibility, or dispatch a release workflow as part of this objective.

## Plan

- [x] Install the locked workspace dependencies with `npm install`, confirm the pre-implementation worktree changes only contain this plan, and stop for review if npm changes tracked manifests or the lockfile unexpectedly; verified on `narumi/feat/tui-kit-latex-mermaid` with 393 packages installed, zero vulnerabilities, no tracked manifest or lockfile drift, and only this plan untracked.
- [x] Record a clean behavioral and performance baseline for the Kit before production edits; package check passed, all 17 Kit test files and 185 tests passed, and five-run medians were 116.77 ms import, 122.37 ms actions first frame, 125.40 ms review first frame, and 119.82 ms task first frame with no coding-agent runtime load.
- [x] Add failing public-contract tests for the Markdown `ReviewFormat`, both boolean controls, package-root declaration usability, README type examples, and API literal `13`; `npm run typecheck --workspace @narumitw/pi-tui-kit` failed only on absent `markdown` union members and the version-12-to-13 literal mismatch.
- [x] Add failing review and browse TUI tests using the real Pi `Markdown` component for headings, code, inline and block LaTeX, malformed-LaTeX source fallback, disabled LaTeX, terminal-control removal, narrow widths, scrolling, resize reflow, cache reuse, and theme invalidation; focused Vitest ran 24 tests with only the three new semantic-rendering assertions failing on raw Markdown/LaTeX output.
- [x] Implement the internal Markdown document renderer, callback-derived `MarkdownTheme`, semantic cache identity, and public type/API-version changes without Mermaid transformation; focused review, browse, and model suites passed all 36 tests and the Kit typecheck passed with existing text, code, and diff characterizations intact.
- [x] Add failing Mermaid tests for a supported themed diagram, labels containing backtick runs, disabled rendering, unsupported syntax, partial-parse warnings, width overflow, narrow-to-wide resize recovery, terminal-control sanitization, and mixed Markdown around the fence; the focused review suite ran 19 tests with only valid-art rendering and partial-warning assertions failing on raw fences.
- [x] Add the direct `grok-mermaid` runtime dependency, update `package-lock.json` through `npm install`, and implement a cached lazy loader plus width-aware top-level Mermaid transform using only public package APIs; all 19 focused review tests passed, `npm ls` resolved Kit-owned `grok-mermaid@0.2.2`, and import plus code-review benchmark workers loaded neither Grok nor the coding-agent runtime.
- [x] Integrate Mermaid preparation into the TUI menu loop so only relevant screens await it, load failure degrades to fenced source, and owner abort or replacement during the await returns `stale` before opening UI; two isolated Vitest files passed controlled concurrent one-load, stale-owner, and mocked-load-failure regressions.
- [x] Add RPC compatibility characterizations proving Markdown, LaTeX, and Mermaid remain sanitized bounded source in review and browse dialogs, selector labels do not absorb document content, and Back/Close plus pagination behavior is unchanged; focused `runtime.test.ts` passed all 37 cases.
- [x] Build and pack the Kit, then exercise the tarball in a temporary install against the last pre-rich-Markdown Pi host to prove package import and existing formats still work while the new Markdown format degrades to readable source; a clean temporary install with Pi `0.83.0` rendered existing code, ordinary Markdown, raw LaTeX, and raw Mermaid successfully, then removed the temporary directory.
- [x] Extend the runtime benchmark with a Markdown/Mermaid first-frame scenario and compare it with the recorded baseline; five-run medians were 117.88 ms import, 117.45 ms actions, 125.90 ms code review, 135.60 ms Mermaid, and 118.65 ms task, with no material existing-path regression, no coding-agent runtime load, and Grok loaded only by Mermaid.
- [x] Update `packages/pi-tui-kit/README.md`, `test/readme-usage.ts`, public export fixtures, API-version history, runtime-performance notes, and package layout to document opt-in syntax, defaults, TUI-only rich rendering, supported Mermaid families, width/warning/source fallbacks, older-host degradation, terminal safety, and independence from Pi transcript settings; Kit typecheck passed, built-root/model tests passed 13 cases, and README badges plus required sections remain present.
- [x] Add a minor Changeset for `@narumitw/pi-tui-kit`, run the repository formatter, and inspect the selected diff to ensure only the Kit, root lock metadata, Changeset, benchmark, and this plan changed; `npm run format` fixed six intended files, `git diff --check` passed, and status/stat showed only the planned package, lock, benchmark, Changeset, tests, and plan paths.
- [x] Run focused and repository verification sequentially, keeping failed or skipped checks open; an initial package preflight found two import-order and two control-regex Biome errors, all were corrected, then the Kit check passed, 21 focused files/197 tests passed, boundaries passed, final root `npm run check` passed 352 files/3,475 tests, and Changesets selected Kit `0.55.0` while emitting the expected unchanged-consumer-floor notices.
- [x] Run `just pack tui-kit` and inspect the dry-run artifact list and manifest so built ESM, declarations, README, license, and the declared Mermaid dependency are present with no source-only or unrelated files; pack produced 63 files with README, license, manifest, Mermaid ESM/declarations, no `src/` or tests, and direct Grok metadata. An auxiliary jq query initially assumed npm's JSON was an array, then the corrected package-key query passed.
- [x] Audit the final diff against `AGENTS.md`, `packages/pi-tui-kit/AGENTS.md`, and the touched TUI, package, documentation, and verification sections of `docs/extension-conventions.md`; review found no blocking correctness, security, lifecycle, compatibility, or scope issue. Hardening added shared bidi-control removal, alternate/case-insensitive fences, wide Unicode labels, disabled-load proof, third-party load/render failure fallbacks, and stale concurrent-load coverage. Existing formats/modes remain tested, coding-agent imports stay type-only, only public Pi APIs are used, and no consumer changed. A manual interactive TUI smoke remains unrun under the non-interactive execution policy; real-component harnesses, the benchmark, packaging smoke, and old-host smoke cover the runtime path.
- [x] Mark this objective `DONE` and archive the plan only after every completion item has evidence; all required evidence is recorded, and the plan was moved to `docs/plans/archived/2026-08-17_pi-tui-kit-latex-mermaid-plan.md`.

## Risks

- Pi's Markdown renderer is semantic and may reflow or normalize source, so only the new explicit format may use it while exact formats retain their current hard-wrapping path.
- A static Mermaid import would tax every Kit consumer, so the implementation must preserve lazy loading and benchmark the existing cold paths.
- An unavailable host transform API could break all screens if imported as a required named export, so capability detection must degrade only the new rich format.
- Mermaid art can be misleading when a parse is partial or can overflow when its natural width exceeds the viewport, so both cases must retain source instead of clipping or presenting incomplete art as authoritative.
- Expanding the internal theme surface can break lightweight test doubles, so all affected harness themes must supply the same style methods as the real callback theme.
- A dynamic import cannot be cancelled, so the menu must ignore its completion after owner replacement and avoid opening a stale component.
- The lockfile already contains `grok-mermaid` transitively, which can hide a missing direct declaration, so package-owned dependency metadata and a packed temporary install must prove independent resolution.

## Rollback / Recovery

No data or settings migration is involved.

Before publication, the additive type, renderer, dependency, lock metadata, API version, documentation, and Changeset can be reverted together.

After publication, preserve the public Markdown union and issue a patch that falls back to sanitized source if rich rendering causes a host incompatibility; do not remove the accepted format in a patch release.

## Completion Checklist

- [x] `ReviewFormat` exposes a documented opt-in Markdown contract with explicit LaTeX and Mermaid controls and API version `13`, proven by source and packed declaration typechecks.
- [x] Review screens and browse detail documents render ordinary Markdown plus supported inline and block LaTeX in TUI mode, proven at normal, narrow, resized, scrolled, and invalidated states.
- [x] Supported warning-free Mermaid fences render themed Unicode only when they fit, while disabled, unsupported, partial, failed, and oversized cases preserve safe source, proven by deterministic tests.
- [x] Raw document controls cannot inject terminal sequences through Markdown, LaTeX, Mermaid labels, warnings, or fallbacks, and every rendered line stays within the supplied width.
- [x] RPC retains bounded sanitized source, existing print/JSON behavior is unchanged, and Back/Close, pagination, focus, selection, cancellation, disposal, and stale-session contracts remain intact.
- [x] Existing text, code, and diff outputs remain compatible, older hosts import without a missing-export crash, and rich-format absence degrades to readable source.
- [x] Existing cold paths do not load the coding-agent runtime or Mermaid renderer, and benchmark evidence records the new Mermaid first-frame cost without an unexplained regression.
- [x] Package metadata, lockfile ownership, built ESM, declarations, README, license, API history, Changeset intent, and packed contents agree.
- [x] Focused tests, boundaries, the CI-equivalent `npm run check`, Changesets status, `git diff --check`, package inspection, and the semantic convention audit all pass with evidence.
- [x] No consumer compatibility floor, npm publication, tag, visibility, or release workflow changed in this objective.
