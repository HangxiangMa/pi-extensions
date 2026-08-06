# pi-statusline agent directory fix plan

## Goal

Make `pi-statusline` discover globally installed extension packages from Pi's configured agent
directory, while preserving project-local package discovery, duplicate detection, and extension-status
icon aliases.

## Context

Issue #573 reports that `extensions/pi-statusline/src/extension-status.ts` reconstructs the global
`settings.json` path from `HOME` instead of using Pi's agent-directory contract. When
`PI_CODING_AGENT_DIR` points elsewhere, the configured global packages are omitted and an unrelated
`$HOME/.pi/agent/settings.json` may be included. On Windows without `HOME`, the current expression is
relative to the working directory.

The affected behavior runs during TUI session setup and feeds two derived values: duplicate-extension
warnings and installed-package aliases for status icons. The project candidate
`<cwd>/.pi/settings.json` must remain unchanged.

Applicable repository guidance read before implementation:

- `docs/extension-conventions.md`: deterministic regression coverage and the full repository gate are
  required for changed extension behavior.
- `docs/extension-settings.md`: consume the agent directory through Pi's public `getAgentDir()` API
  instead of reading `PI_CODING_AGENT_DIR` or rebuilding `~/.pi/agent`.

Touched areas are package discovery and focused filesystem tests. No package metadata, settings
persistence, command surface, UI flow, or lifecycle ownership changes are planned.

## Plan

- [x] Add a focused test under `extensions/pi-statusline/test/` that gives
  `PI_CODING_AGENT_DIR`, `HOME`, and the project different temporary roots; verify the configured
  agent and project packages participate in duplicate and alias discovery while the unrelated HOME
  package is excluded. Evidence: the focused compiled test failed because it loaded
  `@test/pi-home-only` instead of the configured `@test/pi-foo`.
- [x] Update `extensions/pi-statusline/src/extension-status.ts` to derive the global Pi
  `settings.json` candidate from `getAgentDir()` while leaving `<cwd>/.pi/settings.json` unchanged.
  Evidence: the regression test passed, followed by all 128 compiled `pi-statusline` tests.
- [ ] Audit the final diff against the touched-area rules, run `npm run check`, and record any skipped
  or inapplicable smoke; package and loader smokes are not expected because metadata and runtime
  loading are unchanged.
- [ ] Create focused Conventional Commits, push `fix/statusline-agent-dir` to `origin`, and open a PR
  against `main` referencing issue #573; verify the remote branch and PR URL.

## Risks

- Process-wide environment changes in a test could leak into other tests. Mitigate by saving and
  restoring both variables in `finally` and using only per-test temporary files.
- An overly broad refactor could alter project-package precedence or source identity. Keep the
  production change limited to the global candidate path and assert both duplicate and alias outputs.

## Completion Checklist

- [ ] The global package settings candidate follows `getAgentDir()` and therefore honors
  `PI_CODING_AGENT_DIR` with Pi's platform-safe fallback.
- [ ] The project-local `<cwd>/.pi/settings.json` candidate behaves as before.
- [ ] Regression evidence proves an unrelated HOME settings file is excluded and the configured
  global source affects both duplicate detection and npm-source aliases.
- [ ] Focused tests and `npm run check` pass, with the final semantic audit reporting no unaddressed
  applicable MUST rule.
- [ ] The branch is pushed and an open PR against `main` references issue #573.
