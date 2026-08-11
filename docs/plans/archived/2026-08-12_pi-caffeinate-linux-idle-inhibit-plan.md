# Pi Caffeinate Linux Idle Inhibit Plan

## Goal

Make Linux `display` mode block desktop or compositor idle actions as well as system sleep.

## Context

`systemd-inhibit --what=idle:sleep` blocks logind suspend but does not stop every Wayland compositor idle timer.

Issue #248 requests compositor-level idle inhibition, and a 20-minute niri and DankMaterialShell smoke confirmed `org.freedesktop.ScreenSaver` works for this setup.

## Plan

- [x] Pair Linux display-mode process inhibition with a session-bus `org.freedesktop.ScreenSaver.Inhibit` cookie.
- [x] Support both standard `/org/freedesktop/ScreenSaver` and niri-compatible `/ScreenSaver` object paths.
- [x] Release D-Bus and child-process resources on agent end, manual stop, session replacement, shutdown, partial failure, and an in-flight acquisition race.
- [x] Preserve mode-change persistence ordering and runtime rollback behavior.
- [x] Add the runtime dependency, package Changeset, focused tests, and user-facing Linux behavior documentation.
- [x] Run package checks, repository gate, package dry-run, and local Pi smoke.
  Evidence: package format, typecheck, and 31 tests pass; repository build, Biome check over 974 source-controlled files, boundaries, all workspace typechecks, and 3,104 tests pass; dry-run tarball contains nine expected files; tsx loads the entrypoint.
- [x] Audit lifecycle, package, documentation, and verification requirements from `docs/extension-conventions.md` and `docs/extension-settings.md`.
  Evidence: session generations and inhibitor sequence reject stale async work; every child and D-Bus path releases on stop or connection close; package metadata and README match runtime behavior; settings ordering and rollback remain intact; independent review found no blocking issues.

## Completion Checklist

- [x] Linux sleep mode remains system-sleep-only.
- [x] Linux display mode can remain partially active when one inhibitor backend fails.
- [x] D-Bus-only fallback reports its logind limitation.
- [x] No behavior changes on macOS, Windows, WSL, or custom commands.
- [x] Verification evidence recorded and plan archived.
