# Pi Fleet Zellij Support Plan

## Goal

Add Zellij as a configurable and explicit Pi Fleet terminal backend while keeping tmux as the built-in default.

## Context

- Pi Fleet currently supports tmux and Ghostty through one terminal adapter contract.
- `/fleet` Settings persists `defaultTerminal`, and `session_spawn.terminal` can override it.
- Zellij 0.44 introduced pane IDs from pane-creating CLI commands and pane-targeted `move-pane`, which are needed for authenticated readiness metadata and left/up placement.
- The installed host has Zellij 0.44.3, and the final implementation was live-smoked from an active Zellij pane.

## Architecture

- Add a package-owned `ZellijAdapter` that validates the current Zellij pane, requires Zellij 0.44 or newer, launches through `zellij action new-pane`, and returns its `terminal_<id>` identity.
- Pass Zellij only a private self-deleting launcher path, with launch-only environment values embedded briefly in that `0700` file so Zellij command metadata cannot retain bearer values.
- Use Zellij's native right/down split and a pane-targeted move for left/up placement.
- Extend the existing terminal union, controller dependency port, Settings row, tool schema, labels, and documentation without adding fallback behavior.
- Preserve `defaultTerminal: "tmux"` for missing settings and existing files.

## Risks

- A failed left/up move can leave a successfully created child pane, so it must be reported as a partial launch with the pane ID.
- Cancellation or session replacement after pane creation can leave a visible pane, so post-await stale and abort checks must preserve partial-launch semantics.
- Zellij lacks per-pane environment flags, so launch values briefly exist in a private launcher that must unlink itself before starting Pi and remain covered by the existing same-user process boundary.
- A real split smoke requires Pi to run inside Zellij, so deterministic adapter tests remain the primary repeatable gate and a live four-direction smoke supplies runtime evidence.

## Plan

- [x] Add focused failing tests for Zellij availability, version gating, all split directions, private launcher transport, invalid input, partial failures, cancellation, and stale continuations; the initial adapter run executed five tests and all failed on the unimplemented behavior.
- [x] Implement `packages/pi-fleet/src/zellij.ts` with Zellij 0.44+ capability checks, direct pane launch, left/up placement, bounded validation, and partial-launch errors; focused adapter tests pass, and a live smoke exposed and removed `--near-current-pane` because Zellij 0.44.3 hid that pane while leaving its child process running.
- [x] Add focused failing integration tests for Settings normalization and UI selection, configured/default controller routing, explicit tool override, result labels, and unchanged tmux default; the integration red run executed 37 tests and failed the seven intended Zellij assertions.
- [x] Wire Zellij through `terminal.ts`, `settings.ts`, `fleet-controller.ts`, `menu.ts`, `pi-fleet.ts`, and `tools.ts`; package tests and typechecking pass.
- [x] Update the Pi Fleet README, package keywords/layout, and existing minor Changeset to document Zellij requirements, no fallback, private launcher transport, limitations, and tmux remaining the default.
- [x] Audit cancellation, partial pane creation, stale sessions, shutdown, settings preservation/order/failure behavior, terminal-safe labels, and every touched MUST rule in `docs/extension-conventions.md` and `docs/extension-settings.md`; no deviation or unverified Zellij launch path remains.
- [x] Run formatting, focused tests, package typechecking, `npm run check`, `just pack fleet`, Changesets status, local Pi entrypoint loading, non-interactive Zellij CLI capability checks, and a live runtime smoke; Zellij 0.44.3 created visible authenticated panes in all four directions, delivered a kickoff and reply, and cleaned every smoke pane and peer.

## Completion Checklist

- [x] Missing or legacy settings still resolve to tmux without rewriting the file.
- [x] `/fleet` Settings and `session_spawn` accept `zellij`, and explicit terminal arguments still override settings.
- [x] Zellij launches return authenticated readiness metadata with a validated pane ID for right, down, left, and up.
- [x] Pre-launch failures create no Fleet group or pane, while post-pane failures are reported as partial and preserve launcher cleanup semantics.
- [x] Documentation and the Changeset describe the shipped behavior and supported Zellij floor.
- [x] All required deterministic checks and the live Zellij four-direction split smoke pass.
