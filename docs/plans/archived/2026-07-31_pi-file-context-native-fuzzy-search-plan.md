# pi-file-context native fuzzy search plan

## Goal

Replace Fuse.js with a bounded package-owned file-path matcher that preserves relevance ranking, typo tolerance, abbreviation matching, and empty-query ordering without allowing long pasted queries to freeze Pi's TUI.

## Architecture

- Keep `ProjectFileSearch` as the explorer-facing boundary and precompute normalized path, basename, and path-part data once per picker.
- Rank exact, prefix, substring, ordered-subsequence, and bounded typo matches with deterministic original-order tie breaking.
- Reject overlong normalized queries before candidate scoring so work remains bounded independently of project size.
- Remove Fuse.js from runtime metadata and the lockfile.

## Risks

- A custom scorer can overmatch short queries or reorder exact basename results; focused tests will pin representative ranking, abbreviations, typo tolerance, empty input, and no-match behavior.
- Timing assertions are flaky; the regression test will prove that an overlong query returns before touching candidate-owned search data rather than asserting wall-clock duration.
- Dependency removal can drift package metadata; regenerate with the repository-pinned npm and inspect a package dry run.

## Plan

- [x] Added focused failing tests for abbreviation matching and overlong-query rejection; the Fuse implementation returned no abbreviation matches, and the first native version still accepted an exact 257-character query.
- [x] Replaced `experimental/pi-file-context/src/file-search.ts` with the bounded native matcher; focused exact-path, abbreviation, typo, transposition, tokenized typo, empty, no-match, and query-bound tests pass.
- [x] Removed Fuse.js with npm 12.0.2; manifest and lockfile removal is bounded, package typecheck passes, and the dry run contains the expected eight files with no bundled dependency.
- [x] Ran `npm run check` successfully with 1,884 tests and audited the diff against extension conventions and adjacent search-input boundaries.

## Completion Checklist

- [x] No source, manifest, or lockfile reference to Fuse.js remains.
- [x] Exact basename, full path, typo, abbreviation, no-match, and empty-query contracts have deterministic tests.
- [x] Overlong search work is bounded before per-file scoring; 10,000-character synthetic input now returns before candidate traversal.
- [x] `npm run check`, package dry run, Pi `--list-models` load smoke, and `git diff --check` pass.
