# pi-sync portable selection policy plan

## Goal

Make included-content intent portable across environments without syncing private credentials, and
require an explicit reviewed choice before a differing remote selection can affect local settings or
content synchronization.

## Architecture

- Store an optional versioned `selection` policy in each immutable snapshot, separate from the files
  that happened to exist when the snapshot was created. New snapshots always publish the normalized
  local `sync.include`; old snapshots without policy remain readable.
- Keep `pi-sync.json` local and private. The remote policy contains only safe agent-relative include
  paths and no storage connection, credentials, automatic-sync, or setup names.
- Compare local and remote policy in orchestration. Automatic and ordinary synchronization pause on
  explicit divergence; a force push is the reviewed “keep local” publication path, while pulls require
  local adoption first.
- Add a remote-selection review under Settings with Adopt remote, Keep local, Review paths, and Cancel.
  Adoption updates only local settings through the existing locked, stale-checked, atomic mutation
  protocol and never starts a pull.
- For old snapshots, derive a clearly labeled partial discovery list from remote file roots without
  treating it as authoritative policy.

## Non-Goals

- Do not sync `pi-sync.json`, credentials, automatic-sync settings, setup names, or backend details.
- Do not hard-code `pi-starship.toml` or coordinate with another extension package.
- Do not add silent remote-policy adoption or automatically pull files after adopting a policy.

## Plan

- [x] Add snapshot selection schema, normalization, and backward-compatible S3/WebDAV/Git wire handling; focused codec, Git, and all four backend contract suites pass with policy round trips and malformed-policy rejection.
- [x] Add backend-neutral policy comparison and old-snapshot path discovery; `portable-selection.test.ts` proves exact divergence, selected-but-missing intent, head/snapshot revalidation, and safe partial discovery.
- [x] Make status report policy state and make sync/pull pause before mutation on explicit divergence while force push remains the reviewed keep-local path; `sync-decision.test.ts` proves manual/automatic no-mutation and exact force-push review.
- [x] Add the Settings remote-policy review/adoption flow with Adopt remote, Keep local, Review paths, and Cancel; `remote-selection-ui.test.ts` and `settings-management.test.ts` prove session acknowledgement, stale remote/local rejection, disposal/replacement, discoverability, and save-without-pull behavior.
- [x] Record the accepted architecture in `docs/adr/pi-sync-portable-selection-policy.md`, update the package README and patch Changeset, then verify 2,380 tests through `npm run check`, Changesets status, and the 49-file `just pack sync` dry run.

## Risks

- Git snapshots use a strict manifest rather than the gzip codec, so selection metadata must be
  integrity-bound in that manifest without rejecting old manifests.
- Remote policy is untrusted input. Invalid versions, paths, duplicates, and overlaps must fail closed
  before settings or synced files change.
- A remote head can change during review. Adoption must re-read and verify the reviewed head and must
  also reject concurrent local settings changes.

## Rollback / Recovery

The snapshot field is additive and optional. Older pi-sync versions ignore it on S3/WebDAV, while
new pi-sync readers continue to accept Git manifests without the field. An older strict Git reader may
reject a newer manifest containing selection; recover by using the current reader or restoring a
pre-feature Git publication. Local adoption is an ordinary atomic settings edit and can be reversed
in the Included Content editor.

## Completion Checklist

- [x] New snapshots preserve selected paths even when those paths have no current file; covered by snapshot and backend contract tests.
- [x] A new environment can review and adopt valid remote included content without copying private settings or mutating synced files; covered by remote-selection UI tests.
- [x] Divergent or malformed remote policy cannot be silently applied by startup, shutdown, sync, or pull flows; cancellation and lifecycle replacement have no side effects in focused and full-suite coverage.
- [x] Old snapshots remain readable and offer only clearly labeled partial discovery; covered by codec/backend compatibility and legacy discovery tests.
- [x] The final diff passes the extension/settings semantic audit, `npm run check`, Changesets status, package dry run, and `git diff --check`; archive this completed plan under `docs/plans/archived/`.
