# Pi Sync Included-Content Deduplication Plan

## Goal

Make pi-sync's Included Content editor show each logical agent-relative path exactly once, while
preserving canonical built-in selection, safe custom-file discovery, transactional Save/Discard
behavior, and the existing version 3 settings schema.

## Context

- `extensions/pi-sync/src/file-selection.ts` renders every `BUILT_IN_SYNC_ROOTS` entry and then
  appends filesystem-backed custom candidates from `listCustomCandidates()`.
- `isSafeCustomIncludePath()` currently rejects reserved built-in directories but accepts built-in
  files such as `settings.json`, `models.json`, `AGENTS.md`, and case variants. Existing files can
  therefore appear once as `builtin:<path>` and again as `custom:<path>` with contradictory checked
  state.
- This is not only visual: selecting both identities can construct a duplicate `sync.include` value,
  which the version 3 validator correctly refuses to save.
- `extensions/pi-sync/README.md` already specifies that `sync.include` is duplicate-free and that
  custom paths are separate from supported Pi roots, so the implementation should be brought back to
  that documented contract rather than changing the documentation or schema.
- Touched areas are the pi-sync settings-selection policy, its transactional TUI projection, and
  deterministic tests. Applicable MUST checks are TUI width/cancellation behavior (`Test` and
  `Review`), settings validation and unchanged-on-cancel persistence (`Test` and `Review`), focused
  regression coverage (`Test`), and the repository CI-equivalent gate (`npm run check`). No new
  asynchronous task, lifecycle resource, command route, package metadata, or storage write path is
  planned.

## Architecture

- Keep `extensions/pi-sync/src/sync-policy.ts` as the single classification boundary between
  canonical built-in roots and custom include paths.
- Treat every built-in root, case-insensitively, plus `sessions` as reserved for custom-path
  validation. Exact built-in values must still pass through `normalizeSyncInclude()` and canonicalize
  to the declared `BUILT_IN_SYNC_ROOTS` spelling.
- Reject descendants under built-in file roots, such as `settings.json/child`, for the same ambiguous
  reserved-root reason already applied to built-in directories.
- Let `file-selection.ts` continue rendering built-ins separately and discovering custom candidates
  through `isSafeCustomIncludePath()`. Do not add label-only deduplication in the UI, because that
  would leave two underlying identities and inconsistent policy semantics.

## Non-Goals

- Redesign, reorder, or add search to the Included Content menu.
- Change defaults, `sync.include` persistence, backend behavior, migration, or concurrency handling.
- Change `@narumitw/pi-tui-kit` or introduce a new dependency.
- Bump versions, publish packages, or release the fix as part of plan execution.

## Risks

- An over-broad reserved-name check could reject canonical built-ins; cover normalization separately
  from custom-path classification.
- Case-insensitive matching could accidentally reject near names such as `settings.json.backup`; keep
  matching at the complete top-level path segment.
- A rendering-only test could miss the invalid duplicate state; cover both policy classification and
  the real TUI candidate projection.

## Implementation Record

- Branch: `fix/pi-sync-included-content-deduplication`.
- Red evidence: the focused policy test failed because `settings.json` was accepted as custom, and
  the TUI test stopped at the second `AGENTS.md` identity before reaching `custom.json` or `sessions`.
- The implementation expands the shared reserved-root set to every case-normalized built-in root;
  exact built-ins still canonicalize before custom validation, while nested built-in paths now fail
  the existing canonical-root rule.
- No command, package, dependency, schema, async task, settings writer, or lifecycle path changed.
- Local root `npm test` and `npm run check` were both attempted with canonical `TMPDIR` and Git commit
  signing disabled. All 27 focused pi-sync tests and all non-test gates pass, but unrelated existing
  tests in pi-github-pr and pi-worktree fail consistently on this macOS checkout; one concurrent root
  run also timed out an experimental pi-jupyter FIFO test. The same `origin/main` commit has a passing
  hosted CI run, so the pull request's hosted CI is the remaining authoritative root-gate evidence.

## Plan

- [x] Add a focused failing policy regression in
      `extensions/pi-sync/test/v3-schema.test.ts` proving that every `BUILT_IN_SYNC_ROOTS` value, its
      representative case variant, and descendants under built-in roots are not safe custom paths,
      while canonical built-ins still normalize successfully and near/custom names remain valid;
      verify the compiled `v3-schema.test.js` fails on the current policy for built-in files.
- [x] Add a focused failing TUI regression in `extensions/pi-sync/test/sync.test.ts` that creates real
      built-in files/directories plus one ordinary custom entry in a temporary agent directory, walks
      the pi-tui-kit multi-select rows by stable navigation, and asserts each built-in label and the
      custom label appear exactly once; cancel the editor and verify `pi-sync.json` remains byte-for-byte
      unchanged. Confirm the current implementation fails because built-in files are projected twice.
- [x] Tighten the shared reserved-root classification in
      `extensions/pi-sync/src/sync-policy.ts` so `isSafeCustomIncludePath()` excludes exact and
      case-equivalent built-in roots and their descendants, while `normalizeSyncInclude()` continues
      canonicalizing exact built-ins before custom validation; verify both focused regressions pass
      without adding a second deduplication layer to `file-selection.ts`.
- [x] Perform a bounded same-pattern audit across `normalizeSyncInclude()`,
      `includeFromSelectionConfig()`, `normalizeExtraFiles()`, and `listCustomCandidates()` for exact
      names, case variants, nested paths, safe near names, configured custom entries, and empty or
      missing agent directories; add only regression cases that expose the same built-in/custom
      identity bug, and verify existing duplicate/overlap/denied-path tests remain green.
- [x] Re-run the existing Included Content UI tests for narrow/wide rendering, concurrent settings
      changes, cancellation/disposal, Save/Discard review, and custom-entry selection; verify no row
      exceeds its supplied width, cancellation and session replacement remain read-only, and a saved
      include contains one canonical identity per path.
- [ ] Run the focused compiled pi-sync tests, `npm run check --workspace @narumitw/pi-sync`, root
      `npm test`, root `npm run check`, and `git diff --check`; leave any unavailable or failing gate
      open and report it rather than inferring success. A pack dry run or Pi load smoke is not required
      unless implementation unexpectedly changes package metadata, dependencies, exports, or runtime
      loading.
- [x] Audit the final diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md`, explicitly rechecking user cancellation, component disposal,
      session replacement, shutdown applicability, post-`await` state use, settings ordering/failure
      recovery, invalid-file protection, unknown-field preservation, and atomic publication; record
      that unchanged paths were reviewed rather than claiming tests alone cover them.

## Completion Checklist

- [x] `settings.json`, `models.json`, and every other built-in root render once even when physically
      present in the agent directory or encountered with a case variant.
- [x] Safe custom top-level files and directories still render once and can be selected.
- [x] Canonical built-in `sync.include` values remain accepted; duplicate, overlapping, denied, and
      nested reserved-root values remain or become correctly rejected.
- [x] Save, Discard, Escape, cancellation/disposal, concurrent-change detection, and settings bytes
      retain their existing behavior.
- [ ] Focused tests, pi-sync workspace checks, root tests, root `npm run check`, and `git diff --check`
      pass, with any exception documented.
- [x] No unrelated source, package metadata, README contract, version, or generated dependency output
      changes are included.
