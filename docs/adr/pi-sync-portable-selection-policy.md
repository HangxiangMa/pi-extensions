# ADR: pi-sync portable included-content policy

## Status

Accepted. The policy is implemented by pi-sync snapshots, orchestration, and Settings review.

## Context

A sync setup's `sync.include` is local because `pi-sync.json` also owns private storage credentials
and machine-specific behavior. That made a new environment unable to discover a selected custom path
when the path existed only remotely. Inferring intent from snapshot files is insufficient: a selected
path may currently be absent, and a snapshot may preserve files that its publisher did not select.

Syncing `pi-sync.json`, hard-coding another extension's filenames, or automatically selecting every
safe-looking remote file would respectively expose credentials, create cross-extension coupling, or
turn an incomplete denylist into policy.

## Decision

### Portable policy

Each new immutable `Snapshot` carries an additive credential-free field:

```ts
selection: {
  version: 1;
  include: string[];
}
```

The include list uses the same normalization and safety rules as local `sync.include`. It contains no
setup name, storage location, credentials, automatic-sync preference, or switch behavior. Selection
intent is separate from `files`, so selected-but-missing paths remain portable.

S3 and WebDAV include the field in their integrity-checked gzip snapshot. Their latest pointer also
carries a validated projection so Status stays lightweight. Git includes it in the strict publication
manifest, which binds it to the commit and supplies its head projection. Adoption always re-reads the
immutable snapshot and rejects a projection mismatch. New readers accept old snapshots and Git
manifests without `selection`. Invalid versions, extra fields, unsafe paths, oversized collections,
duplicates, and overlaps fail before settings or synced files change.

### Divergence behavior

Orchestration compares an explicit remote policy with the current local setup before applying remote
content. Ordinary sync, automatic startup/shutdown sync, and pull—including forced pull—pause on a
difference. Status names the difference and lists local-only and remote-only selections.

A force push is the explicit keep-local publication path. Its confirmation says that the local
selection will replace the differing remote policy; preserved unmanaged remote files remain subject
to the existing preservation rules.

Read-only diff remains available and labels policy state. A legacy snapshot without policy preserves
prior sync behavior because no authoritative remote intent exists.

### Review and adoption

Settings exposes **Remote included content**. For a differing explicit policy it offers:

- **Adopt remote included content** — revalidate the reviewed remote head, then save only local
  `sync.include` through the existing cross-process lock, expected-storage/include checks, unknown
  field preservation, and atomic publication;
- **Keep local included content** — make no change and explain that a reviewed force push publishes
  that choice;
- **Review paths** — show exact remote-only, local-only, and ordered selections; and
- **Cancel** — make no change.

Adopting `sessions` requires the existing privacy acknowledgement. Adoption never pulls files,
writes sync state, or starts another network operation. The user reviews Sync now separately.
Cancellation, component disposal, session replacement, shutdown, a changed remote head, and a
concurrent settings edit all preserve the last valid local selection.

For old snapshots, Settings offers a clearly labeled read-only partial discovery from safe file roots.
It cannot be adopted as authoritative policy because preserved files and selected-but-missing paths
cannot be distinguished. Users can copy needed paths through **Add custom path…**.

## Consequences

### Positive

- New environments can discover and adopt custom remote-only paths such as a TOML configuration
  without syncing private settings or knowing which extension owns the path.
- Selection conflicts are explicit and cannot silently expand automatic synchronization.
- The snapshot remains self-describing even when selected paths are temporarily absent.
- Backend transport stays extension-neutral; selection policy remains orchestration-owned.

### Negative

- Remote-policy review reads the active immutable snapshot; Status relies on the validated head
  projection and cannot partially discover legacy paths.
- Keep-local remains unresolved until the user publishes with a reviewed force push.
- Legacy discovery is necessarily incomplete and cannot reconstruct exact intent.
- Git publications containing `selection` require a reader that understands the additive manifest
  field; newer pi-sync remains backward-compatible with older Git publications, but an older strict
  Git reader may reject newer manifests.

## Verification

- Policy and legacy discovery: `packages/pi-sync/test/portable-selection.test.ts`.
- Snapshot intent and codec validation: `sync-snapshot.test.ts` and `snapshot-codec.test.ts`.
- Backend round trips: shared backend contract tests and Git backend tests.
- Divergence, automatic no-mutation, pull pause, and reviewed keep-local push:
  `sync-decision.test.ts`.
- Adoption, session acknowledgement, legacy review, stale remote/local rejection, and disposal:
  `remote-selection-ui.test.ts`.
