---
description: Decide and execute the next safe Changesets release action
argument-hint: "[release request, e.g. release now]"
---
Act as this repository's release manager. Understand the request below, inspect the real repository
and remote state, make routine release decisions yourself, and execute the workflow as far as the
request authorizes.

Release request:

> ${ARGUMENTS:-Assess release readiness and prepare the next safe action, but do not publish.}

## Authorization boundary

- With no argument, or when the request only asks to assess, prepare, or add a changeset: do not
  publish, merge a Version PR, create version tags, change npm visibility, or dispatch a release
  workflow.
- A clear request in any language to publish or release now (for example, `publish` or
  `release now`) is explicit approval for this run to merge a ready Changesets Version PR and allow
  its configured workflow to publish packages and create the corresponding tags and GitHub releases.
- Never treat an ambiguous request as publication approval. Ask at most one concise question only
  when the ambiguity changes whether publication will occur.
- Never change npm package visibility. Never bypass required reviews, branch protection, failing
  checks, or repository release safeguards.

## Establish the release state

Before deciding, inspect all relevant evidence rather than relying on the request's assumptions:

1. Read repository release instructions and the current Changesets configuration and workflow.
2. Inspect the current branch, working tree, merge-base diff, commits, package manifests, pending
   changesets, and `npm run changeset:status`.
3. Inspect relevant open pull requests, the Changesets Version PR, required checks, and recent
   release workflow runs.
4. Compare candidate package versions with npm when publication or version reconciliation matters.
5. Do not expose tokens or secrets in commands, logs, commits, or the final report.

## Make the release decisions

Use the observable package behavior and public API diff to decide without asking routine questions:

- Select only packages whose published behavior, API, dependencies, metadata, or distributable
  contents changed.
- Use `patch` for backward-compatible fixes, `minor` for backward-compatible features, and `major`
  for breaking changes. Explain any non-obvious choice briefly.
- Packages version independently. Do not align unrelated package versions and do not version the
  private workspace root.
- Documentation, tests, repository-only tooling, and path-only moves that do not change published
  package behavior normally need no release.
- Respect dependency ordering. In particular, publish a new `@narumitw/pi-tui-kit` API before
  raising an extension's dependency floor to consume it.
- Reconcile duplicate or stale changesets instead of creating redundant releases.

## Execute the appropriate path

Choose the first path matching the verified state:

1. **Changes need release metadata:** create or correct the smallest Changeset Markdown file, run
   release-status and relevant repository checks, then commit and push the focused change when the
   current request authorizes repository edits.
2. **Feature PR must land first:** ensure its changeset and checks are correct. Do not merge an
   ordinary feature PR solely because publication was requested unless the request clearly includes
   shipping that PR and all required reviews/checks have passed.
3. **Pending changesets are on `main`:** let the configured Changesets Action create or update the
   Version PR. Inspect the resulting versions, changelogs, package selection, and checks.
4. **A Version PR is ready and publication is explicitly authorized:** merge that Version PR through
   GitHub. Do not run `npm publish` directly. Wait for the configured publish workflow to finish,
   then verify the exact npm package versions and GitHub releases it created.
5. **Nothing is releasable:** do not manufacture a version bump. Report why no release is needed and
   what event would make one appropriate.

Use non-interactive commands. Keep edits and commits focused, follow Conventional Commits, and do not
add agent-attribution trailers. Stop rather than work around missing credentials, failed required
checks, branch protection, npm version conflicts, or an unexpected release payload.

## Final report

Report concisely:

- decision and rationale;
- selected packages and SemVer bumps;
- changesets, commits, PRs, and workflow runs created or used;
- checks and npm/GitHub verification performed;
- whether publication occurred, and any remaining blocker or next action.
