# Pi Tool Extension Plan

## Goal

Add a small stable `@narumitw/pi-tool` extension whose `/tool` command lists every configured Pi tool and reveals all metadata exposed by `pi.getAllTools()`.

## Context

- The package name is `@narumitw/pi-tool`, matching the requested `pi-tool` name.
- The primary command is `/tool`, derived from the unscoped package name.
- The extension is read-only and owns no settings, persistence, status, or background resources.
- The bounded UI uses an extension-owned searchable list and Pi TUI Kit's exact-document `review` screen for list-to-detail progressive disclosure.
- Applicable convention MUST rules are package layout and lifecycle metadata, a thin entrypoint, independent runtime dependencies, command argument and mode handling, TUI lifecycle cancellation, terminal-safe rendering, deterministic tests, the root CI gate, package inspection, and a local Pi load smoke.

## Plan

- [x] Add focused tests under `packages/pi-tool/test/` for catalog status, complete details, command validation, supported modes, cancellation ownership, and terminal-safe rendering; the initial six-test run failed against intentional production stubs.
- [x] Implement `packages/pi-tool/src/` with a thin entrypoint, a read-only catalog projection, a searchable TUI browser, exact-document detail views, `/tool` registration, and session-owned menu cancellation; focused tests pass.
- [x] Add the package manifest, README, license, TypeScript config, root stable-extension registration, lockfile entry, and release changeset; package boundaries, package typechecking, and Changesets status pass.
- [x] Run formatting, focused tests, `npm run check`, `just pack tool`, and a local Pi package-load smoke; the full gate passed 2,869 tests, the dry-run tarball contains only the six intended publish files, and Pi loaded `/tool` and reported its expected print-mode rejection.
- [x] Audit the final diff against `docs/extension-conventions.md`, including cancellation, disposal, session replacement, shutdown, non-TUI rejection, terminal sanitization, and package publication rules; no deviations or unverified required paths remain.

## Completion Checklist

- [x] `/tool` opens a searchable list in TUI and RPC modes and shows every configured tool with active state.
- [x] Each detail view includes description, source metadata, JSON parameter schema, and prompt guidelines when exposed by Pi.
- [x] Arguments and print/JSON modes fail observably without opening interactive UI.
- [x] Session replacement and shutdown abort any open menu without stale-context use.
- [x] The package is independently installable, documented, included as a stable root extension, covered by a changeset, and passes all required checks and smokes.
