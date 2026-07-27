# pi-sync Git-native snapshot storage plan

## Goal

Replace PR #434's one-`snapshot.json.gz`-per-commit Git representation with raw Git blobs and a strict manifest so unchanged files are reused, changed files remain delta-compressible, GitHub's regular-Git file limit is enforced, and the existing backend contract, lease safety, history, rollback, cancellation, redaction, and S3/R2/WebDAV formats remain unchanged.

## Context

The current unmerged Git backend writes one gzip archive per publication. This is correct but a poor Git storage shape: small source changes can produce a largely different compressed blob, every commit retains another full archive, and the backend's 256 MiB archive limit exceeds GitHub's 100 MiB regular-Git file limit. GitHub also warns for files larger than 50 MiB and recommends repositories stay below 1 GB when practical.

Because Git support has not shipped, this plan treats the gzip Git manifest as a pre-release format and does not add permanent dual-format compatibility. Existing S3/R2/WebDAV snapshots continue using `snapshot-codec.ts` byte-for-byte.

## Architecture

Each Git publication remains one immutable commit on one target-owned branch. The target subtree becomes:

```text
<directory>/profiles/<namespace>/
├── manifest.json
└── files/
    ├── settings.json
    ├── keybindings.json
    └── sessions/…
```

`manifest.json` is the authoritative Git wire format. It stores snapshot metadata plus an ordered list of `{ path, sha256, size }` entries; it never stores file content or credentials. Each `files/<logical-path>` entry is a regular `100644` Git blob containing the exact decoded bytes represented by the in-memory `SnapshotFile`. The manifest order preserves exact snapshot reconstruction, while stable logical paths let Git reuse identical blobs and find useful deltas for changed files.

Publication decodes and validates each `contentBase64` value, writes unique payloads to a private temporary directory, hashes them in one bounded `git hash-object -w --no-filters --stdin-paths` operation, constructs the tree through the private temporary index, and removes the temporary directory on success, failure, cancellation, replacement, or shutdown. It does not use the user's worktree, checkout machinery, attributes, or clean/smudge filters.

Read validates the manifest first, verifies the commit subtree has exactly one regular manifest plus the declared regular payload blobs, retrieves payloads through a bounded `git cat-file --batch` protocol, checks every size and SHA-256, reconstructs the existing `Snapshot`, and runs the existing snapshot/manifest validation before returning it. Missing, extra, duplicate, prefix-colliding, symlink, submodule, oversized, malformed, or checksum-mismatched entries fail closed.

A decoded payload blob larger than 100 MiB is rejected before commit construction with provider-oriented recovery guidance. The existing bounded total snapshot and manifest limits remain in force. Documentation warns at 50 MiB and recommends a non-Git backend for large or high-churn binary/session archives.

Manifest version is bumped for the new representation. A pre-release gzip-format owned branch fails with an actionable instruction to recreate that test branch; no released S3, WebDAV, local state, target identity, commit/ref mapping, or settings format is migrated.

## Non-Goals

- Add Git LFS, releases, encryption, chunk stores, or provider-specific APIs.
- Make a private Git repository a confidentiality boundary; repository readers can still inspect synchronized content.
- Change snapshot collection/application, S3/R2/WebDAV codecs, publication leases, branch ownership, history ordering, rollback semantics, or authentication.
- Rewrite or garbage-collect existing remote history automatically.

## Risks

- Raw files are easier to inspect in a Git host UI; mitigate with explicit private-repository and secret-retention documentation rather than implying gzip was protection.
- One Git process per payload would scale poorly; use a single bounded hash batch for writes and a single bounded cat-file batch for reads.
- Logical paths can create tree ambiguities; reject duplicate paths, file/directory prefix collisions, unsafe components, and non-regular tree modes before publishing or reconstructing.
- Provider repository growth remains cumulative even with deduplication; document retention limits and recommend S3/WebDAV for large binary-heavy workloads.
- The format change invalidates pre-release test branches; fail closed with explicit recreation guidance rather than silently interpreting both formats.

## Rollback / Recovery

Before merge, reverting the follow-up commit restores the gzip implementation without affecting released users. During development, delete and recreate only the disposable pi-sync-owned test branch and private local cache if it contains the pre-release gzip format. Never rewrite unrelated refs or a user's working tree. If CI or review finds a representation flaw, leave PR #434 unmerged and keep its issues open until the revised format passes all gates.

## Plan

- [x] Revise `docs/plans/2026-07-27_pi-sync-git-backend-adr.md` and `extensions/pi-sync/README.md` to adopt the manifest-plus-raw-blobs representation, state the 50/100 MiB GitHub thresholds, explain that gzip was not encryption, document pre-release branch recovery, and preserve the branch-per-target/authentication/lease decisions; verify the documents contain no claim that Git publications use `snapshot.json.gz`.
- [x] Add focused failing cases to `extensions/pi-sync/test/git-backend.test.ts` for stable unchanged blob IDs, changed raw blob content, exact tree layout with no gzip file, duplicate-content reuse, empty snapshots, unsafe/prefix-colliding paths, malformed manifests, missing/extra/non-regular entries, checksum/size mismatches, the 100 MiB policy boundary without allocating an oversized fixture, fresh-cache history, rollback, and rejection of the pre-release manifest version; verified the initial red state in `/tmp/git-native-red-behavior.log` (native tree and path-conflict assertions failed against the gzip implementation) before production edits.
- [x] Extend `extensions/pi-sync/src/git-runner.ts` with only the bounded process options/protocol helpers needed for private temporary-path hashing and `cat-file --batch`; add parser, truncation, malformed-response, cancellation, timeout, process-tree cleanup, and secret-redaction tests in `extensions/pi-sync/test/git-runner.test.ts`.
- [x] Replace the gzip-oriented `GitManifest` and validators in `extensions/pi-sync/src/git-backend.ts` with a strict versioned metadata/file manifest; enforce ordered unique safe paths, no file/directory prefix collisions, regular-file modes, exact declared tree membership, per-file and aggregate bounds, strict base64 decoding on publish, and size/SHA-256 verification on read.
- [x] Replace Git commit construction in `extensions/pi-sync/src/git-backend.ts` with private-temporary-file batch hashing using `--no-filters`, stable `files/<logical-path>` tree entries, the private index, and unconditional cleanup; verify unchanged and duplicate contents resolve to reused Git blob IDs and no user worktree/config/hooks/attributes are read or modified.
- [x] Replace Git snapshot reads in `extensions/pi-sync/src/git-backend.ts` with exact tree inspection and bounded batch blob retrieval, reconstruct the existing in-memory `Snapshot`, and retain ancestor checks, backend-scoped revisions, history ordering, diagnostics, exact ref leases, cancellation commit boundaries, and ambiguous-push reconciliation unchanged.
- [x] Update shared contract and route coverage in `extensions/pi-sync/test/git-backend-contract.test.ts` and `extensions/pi-sync/test/git-routes.test.ts` only where the storage representation changes; verify push, pull, sync, status, diff, history, rollback, doctor, automatic sync, fresh-cache recovery, concurrent writers, and post-push reconciliation continue to operate through the backend-neutral interface.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`, specifically asynchronous cancellation/disposal/shutdown, temporary-file cleanup, post-`await` state revalidation, secret-safe output, unknown-field preservation, state identity compatibility, and unchanged S3/R2/WebDAV behavior; audit found no accepted deviations: the new temporary resource is request-scoped and unconditionally removed, each post-I/O continuation either passes/rechecks cancellation or performs cleanup, literal/NUL-delimited Git paths protect user-derived publication locations, disposable caches are verified as SHA-1 and retry transient initialization, snapshot IDs resolve safely through validated history, Git errors are redacted at the subprocess boundary, head/history validate exact trees, no settings/state/S3/WebDAV code changed, and all output remains metadata-only and redacted.
- [x] Run `npm run check`, `just pack-sync`, `npm audit --omit=dev`, an isolated offline Pi RPC extension-load smoke, and a real local-bare-repository Git smoke; `npm run check` passed all 1,687 tests plus Biome/boundaries/typechecks, the pack contained 42 expected files, production audit reported zero vulnerabilities, RPC returned successful `get_state`, and the real local-bare backend/route smoke passed.
- [x] Archive this completed plan under `docs/plans/archived/`, commit the revision on `feat/pi-sync-git-backend`, push it to PR #434, update the PR description to describe Git-native blobs rather than gzip, and verify GitHub CI passes before requesting merge; implementation commit `6b87d5b` and GitHub Actions run `30257024926` passed, and the PR body now documents native blobs and the final test/package evidence.

## Completion Checklist

- [x] Git publication commits contain `manifest.json` and declared raw `files/**` blobs, with no `snapshot.json.gz`.
- [x] Repeated publications reuse unchanged/duplicate Git blobs and preserve independently addressable commit history.
- [x] Reads reject malformed, incomplete, extra, non-regular, oversized, or checksum-mismatched trees without applying files.
- [x] No single payload above the documented GitHub-compatible limit can reach commit construction.
- [x] S3/R2/WebDAV snapshot bytes, settings/state identities, routes, and tests remain compatible.
- [x] Exact leases, cancellation boundaries, process cleanup, redaction, history, rollback, and outcome reconciliation remain verified.
- [x] PR #434 documentation, commit history, package dry run, local checks, and GitHub CI all describe and validate the revised representation.
