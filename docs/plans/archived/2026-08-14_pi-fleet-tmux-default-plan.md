# Pi Fleet tmux-default launch plan

## Goal

Make tmux the default `session_spawn` backend while preserving Ghostty as an explicit opt-in backend.

## Context

- Pi Fleet currently launches every child through Ghostty on macOS.
- The user selected a tmux default with Ghostty available only after explicit selection.
- This changes the published tool schema, menu workflow, launch result, terminal adapter boundary, documentation, and package contents.
- No persistent setting is needed because the tool argument or menu choice owns each launch decision.

## Architecture

- Keep group creation, launch envelopes, child readiness, kickoff delivery, rollback, and cleanup in `fleet-controller.ts`.
- Add an isolated tmux adapter that validates the current pane, requires a tmux version with per-pane environment support, creates directional splits, and reports partial-launch state.
- Keep the Ghostty adapter and route to it only when `terminal: "ghostty"` is explicitly selected.
- Preserve `ghosttyVersion` for Ghostty result compatibility while adding backend-neutral terminal metadata.

## Plan

- [x] Add failing adapter tests for tmux availability, directional command construction, environment propagation, cancellation, stale sessions, and partial splits; `tmux.test.ts` first failed on the missing adapter and invalid direction, then passed with `src/tmux.ts` and shared terminal types.
- [x] Add failing controller and integration tests proving omitted terminal selection uses tmux, explicit Ghostty still works, confirmation identifies the selected backend, and rollback/partial-launch behavior remains safe; `spawn.test.ts` and `launch-integration.test.ts` failed against Ghostty-only routing before passing with backend routing.
- [x] Add failing menu and tool tests proving tmux appears first/default and Ghostty requires explicit selection; focused menu and tool tests failed before the schema, workflow, prompt guidance, and notifications were updated, then passed.
- [x] Update `packages/pi-fleet/README.md`, package keywords, changelog-facing Changeset, and package layout for tmux requirements, explicit Ghostty behavior, result compatibility, security, and limitations; Changesets reports the intended `0.2.0` minor bump.
- [x] Run formatting, focused Pi Fleet tests, package typechecking, root `npm run check`, `just pack fleet`, a local Pi entrypoint smoke, and a disposable tmux split smoke; all passed, and the tarball contains 21 declared files with the new terminal sources and no tests.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`, including command/tool compatibility, mode behavior, cancellation, disposal, stale-session guards, terminal sanitization, package boundaries, and published files; no convention deviation remains.

## Completion Checklist

- [x] `session_spawn` without `terminal` launches through tmux and never probes Ghostty.
- [x] Ghostty launches occur only after an explicit menu choice or `terminal: "ghostty"` tool argument.
- [x] Tmux and Ghostty launches preserve confirmation, authenticated readiness, kickoff, rollback, cancellation, and cleanup semantics.
- [x] Documentation and tool schemas accurately describe supported platforms, versions, defaults, and recovery.
- [x] All required checks and smokes pass, and the unchanged real Ghostty AppleScript path remains unverified on this Linux host while its adapter and explicit routing pass deterministic tests.
