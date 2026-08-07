# pi-chrome-devtools unpacked extension plan

## Goal

Allow `@narumitw/pi-chrome-devtools` to launch its isolated managed browser with one or more
user-approved unpacked Chrome extensions configured in `pi-chrome-devtools.json`, without requiring
new environment variables or changing externally managed Chrome instances.

## Context

- `packages/pi-chrome-devtools/src/browser-manager.ts` already owns browser discovery, isolated temp
  profiles, process startup, dynamic CDP ports, and session-shutdown cleanup. Its managed launch argv
  is the narrow integration point for extension startup flags.
- `packages/pi-chrome-devtools/src/settings.ts` currently stores tool selection in
  `${getAgentDir()}/pi-chrome-devtools.json`, preserves unknown fields, serializes writes, and
  publishes atomically. Its validator currently requires `tools` and `updatedAt`, so it cannot yet
  load a browser-only settings document or a project override.
- Local probes established the compatibility boundary: branded Chrome 148 ignored an unpacked
  extension passed through startup flags and exposed `Extensions.getExtensions` as `Method not
  available` over the current port/WebSocket transport, while Chrome for Testing 149 loaded the same
  fixture and exposed its Manifest V3 service-worker target.
- Applicable guidance is `docs/extension-conventions.md` and `docs/extension-settings.md`. The touched
  areas are settings validation/precedence/persistence, managed-process launch and shutdown,
  command status/help, documentation, tests, package contents, and release intent.

## Architecture

Add an optional browser object to the existing canonical user settings file:

```json
{
  "browser": {
    "executablePath": "/absolute/path/to/chrome-for-testing",
    "extensionPaths": ["/absolute/path/to/unpacked-extension"]
  }
}
```

Also accept a trusted project override at `<workspace>/${CONFIG_DIR_NAME}/pi-chrome-devtools.json`:

```json
{
  "browser": {
    "extensionPaths": ["."]
  }
}
```

Resolve settings as defaults, canonical user settings, then trusted project overrides. Existing
`PI_CHROME_DEVTOOLS_*` variables remain backward-compatible explicit runtime overrides; no new
environment variable is added. User-file paths must be absolute. Project `extensionPaths` may be
absolute or relative to `ctx.cwd`, and the project array replaces the user array. A project file does
not override `browser.executablePath`; executable selection remains machine-owned user configuration.

`settings.ts` owns schema normalization, source-aware path validation, side-effect-free loading,
unknown-field preservation, read/write ordering, and global tool-selection saves. `runtime.ts` owns
the resolved effective browser configuration for the current session. `browser-manager.ts` consumes
only validated absolute paths and adds comma-joined `--disable-extensions-except` and
`--load-extension` arguments when launching an extension-owned isolated browser.

When `extensionPaths` is non-empty, the extension must not reuse an already-running external CDP
endpoint because extensions cannot be retrofitted through the current transport. It instead requires
local auto-launch, a configured Chrome for Testing or Chromium-compatible executable, and a managed
browser. Explicit remote hosts, disabled auto-launch, unsupported branded browsers, missing manifests,
and occupied explicit ports fail with actionable diagnostics. Existing external browsers are never
closed or modified.

Changing JSON during a session takes effect after `/reload` or session replacement; existing
shutdown behavior closes the prior managed browser before the next configuration is applied.
Quick-start and status output show effective sources and resolved paths without printing unrelated
settings content.

## Non-Goals

- Implement pipe-based CDP or call `Extensions.loadUnpacked` in branded Chrome.
- Download or install Chrome for Testing automatically.
- Dynamically add, reload, or uninstall an extension in an already-running browser.
- Persist browser paths through a new environment variable or a second settings filename.
- Build a path-picker/settings TUI in this phase; free-form paths remain documented JSON settings.
- Change the existing page, navigation, evaluation, or screenshot tool schemas.

## Risks

- A trusted unpacked extension executes privileged browser code. Honor only canonical user settings
  and trusted project overrides, validate directory identity and `manifest.json`, and document the
  trust boundary prominently.
- The current attach-first behavior could silently connect to a browser without configured
  extensions. Extension-configured sessions must force a managed launch or fail before exposing a
  misleading page list.
- Branded Chrome may silently ignore startup extension flags. Classify the configured executable
  before launch and reject unsupported products rather than claiming success.
- Settings saves could erase browser fields or project reads could race pending user writes. Keep one
  ordered settings protocol, preserve unknown and recognized sibling fields, and await pending saves
  before reload/shutdown-dependent reads.
- Process startup may be cancelled or the session may be replaced between validation and endpoint
  readiness. Revalidate generation/cancellation after each await and retain idempotent process and
  temp-profile cleanup.

## Rollback / Recovery

- The browser object is additive. Older releases treat it as unknown data and preserve it during tool
  selection saves.
- Omitting or removing `browser.extensionPaths` restores the current attach-first behavior after
  `/reload`; no browser-profile migration is required because managed profiles are temporary.
- Invalid global or project JSON remains unchanged and is ignored with a warning. Launch failure
  leaves external browsers untouched and managed-process cleanup removes only extension-owned
  resources.

## Plan

- [ ] Add failing settings cases under `packages/pi-chrome-devtools/test/` for browser-only user
      documents, omitted defaults, absolute user paths, trusted project relative paths, untrusted
      project suppression, project-array replacement, invalid browser shapes and manifests, global
      tool-save preservation, malformed-file protection, unknown fields, and pending-save/read
      ordering; verify the focused compiled tests fail because the current loader only accepts the
      tool-selection schema and has no project precedence.
- [ ] Refactor `packages/pi-chrome-devtools/src/settings.ts` to normalize independent tool and browser
      sections, load canonical user plus trusted project settings without creating missing files,
      resolve paths by scope, preserve both recognized and unknown siblings during atomic global
      saves, and expose effective values with source metadata; verify the new focused settings suite
      and all existing legacy/canonical settings tests pass.
- [ ] Add failing managed-launch cases for extension-configured attach bypass, local auto-launch
      requirements, supported/unsupported executable classification, deterministic ordered launch
      arguments, multiple extension paths, occupied explicit ports, partial startup failure,
      cancellation, repeated shutdown, and unchanged no-extension attach-first behavior; use
      test-owned temporary manifests and fake process/endpoint operations rather than real user
      profiles, and confirm each red state fails for the intended missing contract.
- [ ] Update `packages/pi-chrome-devtools/src/runtime.ts` and
      `packages/pi-chrome-devtools/src/browser-manager.ts` to apply the session's validated browser
      configuration, force an owned isolated launch when extensions are requested, pass safe argv
      entries without a shell, reject unsupported launch modes before spawn, and clean up every
      partial or cancelled launch; verify the managed-launch tests pass without weakening existing
      endpoint retry and shutdown behavior.
- [ ] Extend `packages/pi-chrome-devtools/src/chrome-devtools.ts` and the existing selector/status
      helpers so `session_start` loads settings with `ctx.cwd` and `ctx.isProjectTrusted()`,
      post-await continuations revalidate session generation, shutdown waits for settings and browser
      cleanup, and quick-start/status output reports canonical/project paths, effective browser
      source, configured unpacked extensions, restart semantics, and actionable Chrome for Testing
      guidance; verify command tests cover TUI, RPC notification, replacement, and shutdown paths.
- [ ] Update `packages/pi-chrome-devtools/README.md` with both JSON locations, schema, precedence,
      relative-path rules, trusted-project and arbitrary-extension-code warnings, supported browser
      requirements, `/reload` behavior, failure diagnostics, and a current-project example; add a
      minor Changeset for `@narumitw/pi-chrome-devtools` and verify every documented branch is covered
      by a deterministic test or the explicit runtime smoke.
- [ ] Run a bounded runtime smoke with `just try chrome-devtools`, a temporary Manifest V3 fixture,
      and an explicitly selected Chrome for Testing/Chromium binary: confirm the managed browser
      exposes the fixture service-worker target, normal page navigation/evaluation/screenshot tools
      still work, `/reload` closes the old managed browser, and an external CDP browser remains
      untouched; record the executable product/version and any platform not exercised.
- [ ] Audit the final diff against the settings, lifecycle, process ownership, cancellation,
      non-TUI, documentation, and package MUST rules; run the focused compiled tests,
      `npm run check --workspace @narumitw/pi-chrome-devtools`, root `npm test`, root
      `npm run check`, `just pack chrome-devtools`, `npm run changeset:status`, and
      `git diff --check`, leaving any unavailable smoke or accepted deviation open before handoff.

## Completion Checklist

- [ ] `pi-chrome-devtools.json` can configure a Chrome for Testing/Chromium executable and unpacked
      extension paths without any new environment variable.
- [ ] Missing settings preserve current behavior; canonical user and trusted project precedence,
      path resolution, invalid-file protection, unknown-field preservation, atomic saves, and reload
      semantics match the README.
- [ ] Extension-configured sessions use only an extension-owned isolated browser and never silently
      attach to, mutate, restart, or close an external browser.
- [ ] Supported browsers load every configured test extension with safe startup argv; unsupported
      branded browsers and invalid paths fail before a misleading successful result.
- [ ] Cancellation, partial startup, session replacement, `/reload`, and shutdown release every owned
      process, retry, status entry, and temporary profile exactly once.
- [ ] Existing list/select/navigate/evaluate/screenshot behavior and no-extension attach-first startup
      remain backward compatible.
- [ ] Focused tests, package and root checks, Changeset status, package dry run, Chrome for Testing
      runtime smoke, final semantic audit, and plan evidence all pass before the plan is archived.
