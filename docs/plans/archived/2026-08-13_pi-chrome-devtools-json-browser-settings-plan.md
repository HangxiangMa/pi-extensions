# Pi Chrome DevTools JSON Browser Settings Plan

## Goal

Make the Chrome DevTools endpoint, auto-launch policy, and browser executable editable through `pi-chrome-devtools.json` and the `/chrome-devtools` Settings flow while temporarily preserving the existing `PI_CHROME_DEVTOOLS_*` overrides with a visible deprecation warning.

## Context

The canonical user file already owns browser executable and unpacked-extension paths, but endpoint and auto-launch behavior are initialized from environment variables at module load.
The current **Settings & setup** menu is read-only.
The environment variables must remain effective during this compatibility period, take precedence over JSON, and identify themselves as deprecated without exposing sensitive values.

Applicable convention gates are `docs/extension-conventions.md` and `docs/extension-settings.md`.
The change must preserve user cancellation, RPC/TUI mode adaptation, project trust, unknown JSON fields, invalid-file protection, ordered atomic writes, runtime rollback, stale-session checks, managed-browser cleanup, and shutdown durability.

## Architecture

- Store user-owned `browser.endpoint`, `browser.autoLaunch`, and `browser.executablePath` in the canonical extension JSON file.
- Keep trusted project ownership limited to `browser.extensionPaths`; warn and ignore project attempts to set machine-owned browser connection fields.
- Resolve defaults, user JSON, trusted project extension paths, then deprecated environment overrides.
- Move runtime endpoint and launch initialization to `session_start` so each session receives one coherent effective settings snapshot.
- Add a Pi TUI Kit settings workflow with immediate, serialized saves for endpoint, auto-launch, and executable selection; apply successful changes to the next browser connection and close any extension-owned managed browser first.
- Keep unpacked-extension paths visible with manual JSON guidance because they require multi-path manifest validation and are not environment-variable replacements.

## Plan

- [x] Add focused failing settings and lifecycle tests for JSON endpoint/auto-launch resolution, deprecated environment precedence and warnings, project-scope rejection, validation, unknown-field preservation, ordered writes, and runtime application; the initial focused run failed six new settings contracts before implementation.
- [x] Refactor `packages/pi-chrome-devtools/src/settings.ts` and `src/runtime.ts` to own validated browser connection settings, compatibility overrides, source metadata, shared atomic mutation ordering, and session-time runtime publication; focused settings and lifecycle tests pass.
- [x] Add focused failing TUI/RPC menu tests for editable browser settings, cancellation, invalid-file read-only behavior, failed-save rollback, immediate runtime refresh, stale-session disposal, and narrow rendering; the initial test could not resolve the not-yet-created settings workflow module.
- [x] Implement the `/chrome-devtools` browser settings workflow with Pi TUI Kit screens and package-owned persistence/lifecycle policy; 80 focused package tests and package typechecking pass.
- [x] Update `packages/pi-chrome-devtools/README.md`, status/setup copy, and a minor Changeset to document JSON fields, defaults, precedence, deprecation, reload/runtime behavior, and security boundaries; Changesets resolves the package to a minor bump.
- [x] Audit the final diff against both convention guides, including TUI/RPC modes, cancellation/disposal, generation checks after awaits, settings read/write ordering, failure recovery, invalid-file protection, unknown-field preservation, and managed-browser cleanup; no unresolved convention finding remains.
- [x] Run package-focused tests and typecheck, `npm run check`, `just pack chrome-devtools`, Changesets status, and an isolated non-interactive Pi entrypoint smoke; the repository gate passed 364 files and 3,697 tests, the 17-file tarball contains the new settings module, and RPC applied the JSON endpoint and auto-launch source without a provider request. Chrome's built-in permission endpoint and native Windows rendering remain unverified and are documented as unsupported or untested rather than claimed.

## Completion Checklist

- [x] JSON and `/chrome-devtools` Settings can manage endpoint, auto-launch, and executable behavior without requiring environment variables.
- [x] Existing environment overrides still win and emit an actionable deprecation warning.
- [x] Settings persistence and UI lifecycle semantics satisfy the repository guides.
- [x] Documentation, release metadata, focused checks, repository checks, package contents, and runtime loading are verified.
