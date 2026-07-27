# Code-scanning alerts plan

## Goal

Resolve every open GitHub code-scanning alert with bounded code fixes for confirmed issues and documented false-positive dismissals for intentionally safe designs.

## Context

GitHub reports 14 open CodeQL alerts across pi-starship, pi-statusline, pi-btw, pi-usage, pi-lsp, pi-image-drop, and experimental pi-webui. The affected trust boundaries are parsing uncontrolled text, HTTP error responses and session cookies, credential fingerprints, and process launch configuration.

## Plan

- [x] Classify all 14 open alerts against their end-to-end data flows; alerts 1–3, 7–8, and 11–15 receive bounded code fixes, while 4, 6, 9, and 10 are false positives for argument-array process spawning, a process-salted cache HMAC, and opaque in-memory loopback session identifiers.
- [x] Add focused regressions for shortstat parsing, prompt-frame escaping, usage-label normalization, and generic HTTP failures; the initial root test run failed on quadratic shortstat parsing and exposed unexpected HTTP messages, while existing framing tests already covered every accepted delimiter form.
- [x] Replace vulnerable or analyzer-ambiguous regular expressions and no-op/incomplete replacements without changing valid outputs; 140 focused tests across the touched packages pass.
- [x] Prevent unexpected pi-webui errors from exposing implementation details while preserving actionable client-error messages; focused server tests prove generic 500 responses and specific expected 401 responses.
- [x] Run `npm run check` and audit the final diff against `docs/extension-conventions.md`, including trust-boundary and lifecycle implications; all 1,646 tests and repository gates pass, no settings/command/lifecycle contracts changed, and the affected parsing, framing, process, credential, cookie, and HTTP-response boundaries were reviewed.
- [x] Commit and push the focused change, open pull request #437, and use its passing CI and CodeQL results to verify the fixes.
- [x] Dismiss only verified false-positive alerts 4, 6, 9, and 10 with specific GitHub comments, merge pull request #437, and confirm the main-branch CodeQL analysis reports zero open alerts.

## Completion Checklist

- [x] Every alert open at task start (1–4 and 6–15) is fixed or dismissed with evidence.
- [x] Focused regressions and the repository CI-equivalent gate pass.
- [x] The security fix is merged into `main` and GitHub reports no open code-scanning alerts.
- [x] The completed plan is archived under `docs/plans/archived/`.
