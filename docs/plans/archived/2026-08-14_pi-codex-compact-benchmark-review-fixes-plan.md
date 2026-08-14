# Pi Codex compact benchmark review fixes plan

## Goal

Prevent diagnostic context regimes and mutable source trees from being reported as confirmatory benchmark evidence.

## Context

PR #757 review confirmed that a non-50K or context-scale protocol can currently become a confirmatory candidate.

The review also confirmed that live provenance is captured only once while Pi can reload extension source between sessions.

The benchmark self-test remains manual and will not be added to CI.

## Architecture

- `benchmark/protocol.mjs` will enforce the controlled 50K cross-field invariant and keep context-scale manifests diagnostic.
- `benchmark/provenance.mjs` will capture deterministic hashes for local executable inputs and the locked protocol manifest.
- Live runs will load the extension from a read-only temporary snapshot rather than the mutable worktree.
- Live runs will revalidate source hashes before each fixture, before every result checkpoint, and before final evidence classification.
- Detected drift will persist in provenance and downgrade evidence to diagnostic while the immutable snapshot keeps execution internally consistent.

## Plan

- [x] Added manual self-test cases for the context-regime cross-field rules and diagnostic evidence label; the first run failed because the new exports did not exist.
- [x] Added a provider-free source-drift test that proves the read-only extension snapshot loads and stays unchanged while changed, added, removed, and protocol inputs are detected.
- [x] Enforced exact 50,000-token controlled protocols and made context-scale protocols ineligible for confirmatory plans or completed evidence.
- [x] Added deterministic local runtime-input capture, immutable extension snapshot creation, cleanup, and drift comparison helpers.
- [x] Integrated the snapshot and repeated drift checks into live session loading, pre-fixture boundaries, diagnostic checkpoint publication, and final classification.
- [x] Documented context-regime eligibility, immutable execution, drift downgrade behavior, checkpoint status, and local provenance scope.
- [x] Ran the manual self-test, default and context-scale dry-run smokes, immutable loader smoke, targeted Biome, `git diff --check`, `npm run check`, and `just pack codex-compact`; 374 test files and 3,758 tests passed, and the 10-file package tarball excludes the benchmark.
- [x] Audited the full diff against both review findings and the touched-area extension checklist; settings remain unchanged, no live provider call occurred, and the manual benchmark test remains outside CI.

## Completion Checklist

- [x] A controlled protocol with any target other than 50,000 tokens fails validation.
- [x] A context-scale protocol and dry run cannot receive a confirmatory label.
- [x] Codex sessions load extension code only from the immutable run snapshot.
- [x] Added, removed, or changed local executable inputs are detected at live-run boundaries and permanently downgrade the result.
- [x] Provider-free regression checks and repository-required checks pass.
- [x] The completed plan is archived under `docs/plans/archived/`.
