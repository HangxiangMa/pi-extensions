# pi-file-context Fuse.js Basic Plan

## Goal

Replace `pi-file-context`'s hand-written ordered-subsequence file filter with a reusable, relevance-ranked `fuse.js/basic` search index while preserving empty-query behavior and the explorer's navigation/reset behavior.

## Context

- File discovery is bounded to 5,000 paths.
- `filterProjectFiles()` in `experimental/pi-file-context/src/file-context.ts` currently lowercases the query and retains every path containing its characters in order, without relevance scoring.
- `FileQuoteExplorer` calls that helper after each search-input change; constructing a Fuse index on each keystroke would add avoidable work.
- Fuse.js provides a zero-dependency basic build containing fuzzy search without extended, logical, or token search features.
- This changes fuzzy-match semantics intentionally: results become typo-tolerant and relevance-ranked rather than preserving discovery order for every ordered-subsequence match.

## Architecture

- Add `experimental/pi-file-context/src/file-search.ts` as the owner of Fuse configuration and path-entry preparation.
- Expose a small project-file search abstraction that constructs one `Fuse` instance from the discovered paths and provides `search(query): string[]`.
- Represent each indexed item with its full path and basename so basename matches can receive more weight while full-path matches remain available.
- Trim queries explicitly; return the original file order for an empty query, and otherwise return Fuse's relevance order.
- Construct the abstraction once in `FileQuoteExplorer` and reuse it for every input update.

## Tech Stack

- Import the fuzzy engine from `fuse.js/basic`.
- Declare `fuse.js` in `experimental/pi-file-context/package.json#dependencies`, because extension consumers need it at runtime.
- Keep Fuse options local to `file-search.ts`; start with weighted basename/full-path keys, `ignoreLocation: true`, and a test-calibrated threshold rather than exposing settings in this change.

## Non-Goals

- Forking or rewriting Fuse.js.
- Adding user-configurable fuzzy-search settings.
- Searching file contents, Git metadata, or fields other than basename and project-relative path.
- Adding match highlighting to the explorer.
- Changing file discovery limits, preview behavior, quoting, Git context, commands, or keybindings.

## Assumptions

- Typo tolerance and relevance ranking are desired even where results differ from the current ordered-subsequence matcher.
- Exact and strong basename matches should rank ahead of weaker directory/full-path matches.
- The default 5,000-file bound is small enough for one in-memory Fuse index per explorer instance.

## Risks

- Fuse's Bitap scoring may reject abbreviation-style queries accepted by the current matcher; characterize representative queries in tests and tune only the threshold/weights needed for the agreed file-path behavior.
- Overly permissive thresholds can return noisy paths; include both positive and no-match cases before selecting the threshold.
- Importing the default full build accidentally would retain unused search features; verify the source imports exactly `fuse.js/basic` and that NodeNext typechecking passes.
- Dependency metadata or the lockfile can drift if modified with the wrong npm release; use the repository-pinned npm declared in root `package.json#packageManager` and inspect only intended manifest/lockfile changes.

## Plan

- [x] Added focused search-behavior coverage in `experimental/pi-file-context/test/file-context.test.ts` for empty-query order, case/whitespace normalization, exact basename priority, full-path matching, typo tolerance, deterministic ordering, and no matches; `npm test` failed against the old matcher because it retained `docs/file-context-notes.md` ahead of the exact basename.
- [x] Added `fuse.js` to `experimental/pi-file-context/package.json#dependencies` and regenerated the workspace lock entry; the final manifest/lock diff contains only the workspace dependency and one `node_modules/fuse.js` record (the pinned npm was attempted first, then its unrelated lockfile rewrite was discarded before the bounded regeneration).
- [x] Created `experimental/pi-file-context/src/file-search.ts` with one reusable `fuse.js/basic` index, weighted basename/full-path entries, explicit trimmed-empty-query handling, and a `0.2` threshold calibrated by positive/no-match coverage; `npm test` passed all 1,457 tests.
- [x] Updated `experimental/pi-file-context/src/file-context-explorer.ts` to construct and reuse `ProjectFileSearch`, removed `filterProjectFiles()` and `isOrderedSubsequence()` from `experimental/pi-file-context/src/file-context.ts`, and verified all existing explorer and repository tests with `npm test` (1,457 passed).
- [x] Updated `experimental/pi-file-context/README.md` to describe typo tolerance and relevance ranking without exposing tuning values; diff review confirms the warning, install commands, and quick-start workflow remain intact.
- [x] Ran `npm run check` successfully; Biome, extension boundaries, all workspace typechecks, and all 1,457 tests passed.
- [x] Ran `npm pack --workspace @narumitw/pi-file-context --dry-run --json`; the eight expected package files include `src/file-search.ts`, `package.json` carries the runtime dependency, and the dry run reports no bundled dependencies.
- [x] Ran `git diff --check` and reviewed the bounded source, test, README, manifest, lockfile, and plan diff; the lockfile is a 16-line additive change and no unrelated paths are modified.

## Completion Checklist

- [x] `file-search.ts` imports exactly `fuse.js/basic`, and `FileQuoteExplorer` constructs one `ProjectFileSearch` in its constructor rather than on input.
- [x] Tests prove empty-query order plus deterministic basename/full-path relevance, typo tolerance, case/whitespace handling, and no-match behavior.
- [x] Repository search confirms `filterProjectFiles` and `isOrderedSubsequence` have no remaining references.
- [x] `npm ls` resolves `fuse.js` beneath the workspace runtime dependency, and the package dry run includes the new source with no bundled dependencies.
- [x] README feature and quick-start copy document relevance-ranked typo-tolerant search without adding settings.
- [x] `npm run check` passed all gates and 1,457 tests; package dry run and final diff checks also passed.
