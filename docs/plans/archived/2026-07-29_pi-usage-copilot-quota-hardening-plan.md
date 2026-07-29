# Pi Usage Copilot Quota Hardening Plan

## Goal

Supersede PR #451 with GitHub Copilot usage support that preserves current AI-credit semantics,
legacy premium-request semantics, free-tier quota responses, and valid overage states without
weakening runtime-account credential checks.

## Context

The reviewed adapter handles the legacy paid `quota_snapshots.premium_interactions` shape, but it
labels token-based billing as premium requests, rejects negative overage balances, and rejects the
observed Copilot Free `limited_user_quotas`/`monthly_quotas` shape.

## Plan

- [x] Add focused adapter and formatter regressions for token-based AI credits, overage, and the
      Copilot Free response shape; verified four focused failures against the reviewed code.
- [x] Normalize the supported Copilot response variants in
      `extensions/pi-usage/src/providers/github-copilot.ts`, preserving distinct quota labels and
      representing overage without a query failure; 38 focused package tests pass.
- [x] Update Copilot report/status formatting and `extensions/pi-usage/README.md` so labels match the
      normalized billing mode; legacy status output remains compatible and package checks pass.
- [x] Audit adjacent malformed, unlimited, reset-date, numeric-boundary, auth-origin, cancellation,
      and secret-redaction paths; added AI-credit unlimited and derived-overage coverage while retaining
      the existing auth-origin, cancellation, and redaction regressions.
- [x] Run the package check, focused tests, root CI-equivalent check, package dry run, and local Pi
      load smoke; package checks, 38 focused tests, pack, and load smoke pass. The root gate reached
      1,767 passing tests but failed two unrelated `pi-github-pr` branch-watch tests; a focused rerun
      passed one and reproduced the other without touching that package.
- [x] Archive this completed plan, commit only the intended paths, push the new branch, and open
      replacement PR #453 to `main`, superseding PR #451.

## Completion Checklist

- [x] AI-credit, legacy request, free-tier, unlimited, and overage payloads have deterministic tests.
- [x] User-visible detail and statusline text use the correct quota unit.
- [x] Runtime credential matching and official-origin fail-closed behavior remain intact.
- [x] Required checks and package/runtime smokes pass or have an explicit unrelated-failure record.
- [x] The worktree is clean after the focused commits and replacement PR #453 is open.
