## Goal

Rename pi-sync's canonical private settings file from `pi-sync.local.json` to `pi-sync.json` without losing or exposing existing credentials.

## Non-Goals

- Do not split credentials into a second file or change the settings schema.
- Do not change environment-variable precedence, remote snapshot formats, or sync behavior.

## Plan

- [x] Add focused filename-migration tests covering the canonical path, exact-byte legacy migration, private permissions, canonical precedence, malformed/symlink safety, snapshot exclusion, and one-time startup notice; the initial `npm test` compile failed on the intentionally missing canonical-path and notice exports.
- [x] Update pi-sync settings persistence to use `pi-sync.json`, safely migrate `pi-sync.local.json` without overwriting a concurrent canonical file, retain legacy fallback on migration failure, and surface a redacted one-time notice; 103 focused pi-sync tests pass, including semantic-invalid, permission, and replacement-race cases.
- [x] Update command/help text and `extensions/pi-sync/README.md` with the canonical path and compatibility behavior; repository search leaves the old filename only in intentional migration, exclusion, test, and historical-plan references.
- [x] Run formatting, diagnostics, the full repository check, and `npm run pack:sync`; `npm run check` passed all 1,313 tests and `pack:sync` included `src/config-file.ts` plus the expected 23 package files. The Biome LSP route timed out during initialization on three attempts, while the equivalent Biome and TypeScript gates passed inside `npm run check`.

## Risks

- A migration race could overwrite a newly created canonical file or discard changed credentials; use exclusive installation, identity/content rechecks, and retain the legacy recovery copy.
- The file contains credentials; create migrated and rewritten files with POSIX `0600` permissions and never include values in notices.
- Renaming the file could make credentials eligible for pi-sync snapshots; deny canonical, legacy, temporary, and recovery filenames explicitly.

## Rollback / Recovery

The migration copies and syncs the exact legacy bytes while retaining `pi-sync.local.json` as a private recovery copy, avoiding cross-process deletion races. If installation or verification fails, pi-sync keeps using the legacy file for that read and does not overwrite it. When both files exist, `pi-sync.json` wins and the legacy file remains untouched for manual recovery.

## Completion Checklist

- [x] Existing valid `pi-sync.local.json` installations move safely to `pi-sync.json` while retaining a private recovery copy; invalid or unsafe legacy files remain untouched.
- [x] All active UI, command, help, and documentation paths name `pi-sync.json`, while compatibility behavior is documented.
- [x] Credentials remain private and canonical, legacy, temporary, and recovery filenames cannot enter a snapshot.
- [x] Focused tests, `npm run check`, and `npm run pack:sync` pass.
