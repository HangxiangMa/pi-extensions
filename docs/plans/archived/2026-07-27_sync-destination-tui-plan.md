# Pi Sync destination TUI plan

## Goal

Make a new or existing pi-sync destination fully configurable from the TUI, including masked credentials, without requiring users to understand the internal profile/target split or manually edit JSON.

## Architecture

Keep the version 2 `profiles` and `targets` persistence schema unchanged. Present a destination-oriented manager that composes a reusable storage connection (profile) with a remote destination and sync policy (target). A package-owned masked input component handles secrets without ever rendering their plaintext. Existing atomic settings writers remain the only publication path.

## Plan

- [x] Add focused failing tests for masked secret entry, complete WebDAV setup, credential editing, cancellation, narrow rendering, and invalid WebDAV destination repair; the initial missing-module and missing-password failures established the red states.
- [x] Add a focus-aware masked secret TUI component and credential helpers that honor callback keybindings, paste/edit safely, validate before returning, clear component-owned secret state on disposal, and never render plaintext; covered by `secret-input.test.ts`.
- [x] Update WebDAV setup/profile editing to collect or replace passwords in TUI and save complete usable profiles atomically while preserving existing secrets and unknown fields; covered by WebDAV setup, edit, cancellation, and manager-flow tests.
- [x] Replace profile-first management labels with destination-oriented primary flows, retain saved connections as advanced reuse, and add a reviewed WebDAV repair flow for S3-only target fields; covered by manager navigation and repair tests.
- [x] Extend R2/S3 setup and connection editing with a private-settings credential option using masked secret input while preserving environment-credential behavior; covered by first-time S3 and existing environment-credential tests.
- [x] Update `extensions/pi-sync/README.md` for the destination workflow, masked credential behavior, recovery, and unchanged settings schema.
- [x] Run focused pi-sync tests, then `npm run check`, and audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md` touched-area checklists; `npm run check` passed with 1,618 tests and `just pack-sync` included all new runtime modules.

## Completion Checklist

- [x] A new WebDAV destination saved through TUI loads without manual JSON edits.
- [x] Secret plaintext never appears in rendered lines, reviews, notifications, or errors.
- [x] Cancellation and write failure retain the previous settings.
- [x] Existing version 1/version 2 settings, unknown fields, and environment credentials remain compatible.
- [x] The invalid local `webdav` target can be repaired through the TUI without changing unrelated destinations.
- [x] Required tests and repository checks pass, and this completed plan is archived.
