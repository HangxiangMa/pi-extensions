# Publish experimental packages plan

## Goal

Include publishable packages under `experimental/` in shared version bumps, release-tag publishing, manual recovery publishing, and `just publish-all`, while preserving their experimental user-facing warning and excluding private/deprecated packages.

## Plan

- [x] Update focused release-script tests to specify shared versioning and publish selection for experimental packages; focused run failed in the five expected production-only paths.
- [x] Update shared version discovery, release selection, workflow staging, and `just publish-all` to include non-private `experimental/*` packages; all 1,457 tests passed in the focused-name run.
- [x] Update repository guidance and user documentation to describe automated experimental publishing without weakening the requirement for a visible experimental warning; targeted search found no stale manual-only claim outside archived historical plans.
- [x] Run the repository CI-equivalent `npm run check` and dry-run pack the experimental package; 1,457 tests and all repository gates passed, and the `@narumitw/pi-file-context@0.1.0` tarball contained the expected seven files.

## Risks

- Experimental packages become externally visible on npm whenever an eligible version has not already been published. Existing npm version checks remain the duplicate-publication guard.
- Release selection could miss experimental changes if package roots are handled inconsistently. Fixture tests must cover changed, unchanged, private, fallback, and all-package modes.

## Rollback / Recovery

Revert the selector, bump script, workflow, `justfile`, and policy/documentation changes. Already-published npm versions cannot be reused or removed by this repository rollback.

## Completion Checklist

- [x] Tag releases bump and select changed publishable packages from both `extensions/` and `experimental/`.
- [x] Manual workflow recovery and `just publish-all` consider both roots.
- [x] Private and deprecated packages remain excluded.
- [x] Documentation and repository instructions match the implemented policy.
- [x] Focused tests, full checks, and experimental package dry-run pass.
