# Extension Independence Audit

This is a small snapshot of known gaps against the repository rule that extension packages remain
independently installable and semantically self-contained. It records existing behavior; fixes belong
in separate, package-focused changes.

## Summary

The package/import boundary is healthy: `node scripts/check-extension-boundaries.mjs` passes for one
library and 22 active extensions. No active extension directly imports or declares a dependency on
another extension package.

Four extensions still contain extension-specific runtime knowledge:

| Extension | Existing coupling |
| --- | --- |
| `pi-statusline` | Its extension-status settings and renderer contain known-extension icon/compatibility maps and parse the `github-pr` status format. |
| `pi-starship` | Its extension-status module still contains known-extension icon/compatibility maps, and installed-package discovery still detects `pi-statusline` for a conflict warning. Its native `github_pr` module is package-owned, while external `github-pr` statuses remain generic; it no longer has `pi-github-pr`-specific runtime behavior. |
| `pi-accounts` | `src/account-store.ts` reads and migrates settings owned by the deprecated `pi-codex-accounts` extension. |
| `pi-caffeinate` | Its deprecated-icon warning names `pi-statusline` and describes that extension's settings shape. This is message-only coupling. |

## Audit Boundary

Generic use of Pi-owned surfaces—such as enumerating tools, rendering arbitrary status keys, or
observing lifecycle events without package-specific branching—is not a violation. Documentation-only
comparisons and migration instructions are also excluded here because they do not change runtime
behavior.

Removing these gaps may change published compatibility behavior, especially settings migration and
status rendering. Review and verify each package independently rather than combining the cleanup into
this guidance change.
