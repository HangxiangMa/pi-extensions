# Preserve pi-github-pr status after abort

## Goal

Keep the last successful pull request status visible when an agent tool run is aborted.

## Context

A real TUI reproduction confirmed that aborting `sleep 20` clears the `pi-github-pr` status until the next successful agent turn or periodic refresh.

The reported Pi process exit in issue 725 was not reproduced and is outside this fix.

## Non-Goals

- Do not claim to fix the unconfirmed Pi TUI exit.
- Do not close issue 725.
- Do not change normal GitHub failure reporting, branch refreshes, or shutdown cleanup.

## Plan

- [x] Add focused lifecycle regression coverage proving an aborted `agent_end` preserves the displayed PR status, skips the cancelled refresh, and leaves periodic polling active.
- [x] Update `packages/pi-github-pr/src/github-pr.ts` so pre-aborted and mid-refresh cancellation cannot clear or replace the last successful status.
- [x] Document cancellation behavior in `packages/pi-github-pr/README.md` and add `.changeset/calm-pr-statuses-stay.md` as a patch changeset.
- [x] Run the focused `pi-github-pr` test file and package checks; 28 tests and the package check passed.
- [x] Run the repository `npm run check` gate; 363 files and 3,680 tests passed with all checks green.
- [x] Audit cancellation, session replacement, shutdown, timer ownership, and the final diff for unintended behavior; existing ownership and cleanup guards remain intact.

## Completion Checklist

- [x] The two regression tests failed for the cancellation behavior before the production fix and passed afterward.
- [x] Aborting a tool run leaves the current PR status visible.
- [x] A later periodic refresh still updates the status.
- [x] Existing ambient-failure and session-shutdown tests prove their prior behavior remains intact.
- [x] Issue 725 remains open and the handoff distinguishes the fixed status bug from the unverified TUI exit.
- [x] Move this completed plan to `docs/plans/archived/`.
