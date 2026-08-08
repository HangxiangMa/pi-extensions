# Stabilize the Pi Chat cross-process DHT test

## Goal

Prevent the cross-process Pi Chat DHT smoke test from racing both peer announcements during a busy CI run.

## Plan

- [x] Update `packages/pi-chat/test/network.test.ts` to launch each child only after the previous child reports readiness, while preserving process cleanup and the cross-process message assertion; five focused Vitest runs passed.
- [x] Audit the test-only lifecycle against `docs/extension-conventions.md`, including child failure diagnostics and cleanup after partial startup; the child launch now occurs inside the existing `try`/`finally`, and every started child remains tracked for shutdown.
- [x] Run `npm run check` to prove the CI-equivalent gate passes; all 227 test files and 2,581 tests passed.

## Completion Checklist

- [x] The focused Pi Chat network suite passes repeatedly.
- [x] The repository CI-equivalent check passes.
- [x] No changeset is present because the fix changes repository-only test orchestration, not published behavior.
