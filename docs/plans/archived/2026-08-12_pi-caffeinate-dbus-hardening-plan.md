# Pi Caffeinate D-Bus Hardening Plan

## Goal

Resolve the confirmed Linux D-Bus inhibitor review findings and add a reproducible Docker smoke for real session-bus behavior.

## Context

PR #721 adds `org.freedesktop.ScreenSaver` inhibition to Linux display mode.
The follow-up must prevent transport errors from crashing Pi, report D-Bus-only activation honestly, cancel in-flight acquisition during cleanup, and retain logind idle inhibition.
Docker can verify D-Bus transport and lifecycle behavior, but a real Wayland compositor remains outside this smoke.

## Architecture

Keep process and D-Bus backends independently owned by `caffeinate.ts`.
Let `dbus-inhibit.ts` own transport errors, bounded calls, cancellation, and connection-loss reporting.
Use deterministic fake clients for orchestration tests and a private `dbus-daemon` plus mock ScreenSaver service for the Docker smoke.

## Plan

- [x] Add focused failing tests for display-mode `idle:sleep`, D-Bus-only partial warnings, pending-acquisition cancellation, and active connection loss; verify each fails against the PR head.
  Evidence: the focused file initially failed five tests for the five reviewed behaviors.
- [x] Harden `dbus-inhibit.ts` and `caffeinate.ts` so transport errors are handled, D-Bus calls are bounded and abortable, pending clients are closed by stop/shutdown, and active disconnects update state; verify focused tests pass.
  Evidence: all 34 focused tests and the package typecheck pass.
- [x] Restore Linux display-mode logind idle inhibition while leaving sleep mode unchanged; verify command tests pass.
  Evidence: focused command tests assert `idle:sleep` for display and `sleep` for sleep mode.
- [x] Add `packages/pi-caffeinate/test/docker/` with a private session bus, mock standard and niri paths, stale-socket probe, D-Bus-only extension scenario, and pending-stop scenario; verify the Docker image passes.
  Evidence: `npm run smoke:caffeinate-dbus` passes all five real-bus scenarios.
- [x] Document the opt-in Docker command and its Wayland limitation, and expose a root smoke script; verify the documented command works.
  Evidence: `test/docker/README.md` documents the passing root script and excludes compositor claims.
- [x] Run package tests, package typecheck/format, root CI-equivalent checks, Changesets status, package dry-run, and an entrypoint load smoke.
  Evidence: focused tests, package typecheck, Biome, `npm run check`, Changesets status, the nine-file package dry-run, and offline `pi --list-models` entrypoint load pass.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, async cleanup, session replacement, partial failure, package, and Docker publishing boundaries.
  Evidence: generation and token guards follow every acquisition await, pending and active clients have owned cleanup, shutdown covers replacement, settings ordering is unchanged, process and D-Bus partial failures remain independent, and package contents exclude Docker fixtures.

## Completion Checklist

- [x] A stale or unreachable session-bus socket cannot terminate Pi.
- [x] D-Bus-only display mode is reported as partial and warns that system suspend may remain possible.
- [x] Stop, agent end, replacement, and shutdown abort and close an in-flight D-Bus acquisition.
- [x] Loss of an active D-Bus connection preserves process inhibition and reports partial activation, or reports unavailability when no process backend remains.
- [x] Linux display mode keeps `idle:sleep`; Linux sleep mode keeps `sleep`.
- [x] Docker smoke passes without claiming to emulate compositor display blanking.
- [x] Required repository checks and package smokes pass with no known findings remaining.
