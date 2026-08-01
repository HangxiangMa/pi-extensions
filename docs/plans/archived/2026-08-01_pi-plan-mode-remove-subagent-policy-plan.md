## Goal

Remove `extensions/pi-plan-mode/src/subagent-policy.ts` and every runtime path that makes
`pi-plan-mode` interpret another extension's tool names or argument shapes. Plan mode must continue
to disable extension/custom tools by default and treat an explicitly enabled non-built-in tool as one
opaque, fully trusted user opt-in.

## Context

`allowedPlanSubagents` was added for issue #335 so active Plan mode could recognize `subagent` and
`subagent_spawn`, parse their role-bearing arguments, and reject launches outside a Plan-specific
allowlist. That preserved package-level independence but introduced semantic coupling. The coupling
now conflicts with the repository's extension-independence guidance and is recorded in
`docs/implementation-notes/extension-independence-audit.md`.

`@narumitw/pi-subagents` owns `subagent_spawn` and its other tool schemas. Any future fully read-only
inspection tool or general role allowlist belongs in that extension and must remain useful without
`pi-plan-mode`. This plan does not require either extension to know whether the other is installed.

## Architecture

After this removal:

- `pi-plan-mode` owns Plan state, built-in tool classification, explicit custom-tool selection, and
  limited-shell enforcement only.
- Extension/custom tools remain `user-opt-in`: they are disabled by default, and choosing one through
  `defaultPlanTools` or `/plan tools` trusts the whole effective tool without inspecting its input.
- `pi-subagents` owns launch, lifecycle, inspection, role, and permission policy for its own tools.
- No import, dependency, event channel, shared protocol, tool-name exception, or argument-shape parser
  connects the two extensions.

Removing `allowedPlanSubagents` is a breaking safety change. Existing settings files are never
rewritten; because Plan-mode settings already ignore unknown top-level fields, the removed field will
become inert. A user who also keeps a delegation tool in `defaultPlanTools` will therefore trust that
whole tool. The migration notice must tell users to remove any custom tool they do not trust in full
before upgrading.

## Non-Goals

- Do not add a read-only inspection tool, `allowedSubagents`, or any other behavior to
  `@narumitw/pi-subagents`; plan that as a separate extension-owned change.
- Do not solve compatibility for external `pi-subagents` packages or keep action-specific exceptions
  in `pi-plan-mode`.
- Do not change generic `defaultPlanTools`, `/plan tools`, built-in policy classes, limited `bash`,
  Plan persistence, or implementation handoff behavior.
- Do not clean the other extension-independence gaps recorded for `pi-accounts`, `pi-caffeinate`,
  `pi-starship`, or `pi-statusline`.
- Do not bump versions, publish packages, or merge a release; communicate the breaking change in the
  implementation PR and leave release coordination separate.

## Risks

- Existing users may believe `allowedPlanSubagents` still limits a custom tool. Remove current feature
  documentation, add a concise migration notice that the setting is gone, and mark the implementation
  PR as breaking.
- Removing the policy also removes malformed/disallowed-role blocks. Preserve the generic rule that
  custom tools are disabled by default and verify explicit opt-in remains the only activation path.
- Tightening unknown-field validation to catch the removed setting would break forward compatibility
  and settings conventions. Keep unknown fields ignored and do not add a hidden compatibility parser.
- Deleting policy-focused tests can accidentally remove useful generic coverage. Retain or strengthen
  the existing arbitrary extension-tool opt-in assertion in `tool-policy.test.ts`.

## Rollback / Recovery

The change does not mutate user settings or persisted sessions. Reverting the implementation commit
restores the previous parser and allowlist behavior, and retained `allowedPlanSubagents` bytes become
active again. If release validation finds unsafe activation or unclear migration behavior, stop the
release and revert the removal rather than adding a package-specific compatibility layer.

## Plan

- [x] Retain or strengthen focused generic regressions in
  `extensions/pi-plan-mode/test/tool-policy.test.ts` and `default-tools.test.ts` proving an arbitrary
  extension tool is absent without opt-in, becomes active through generic configuration/selection,
  and reaches the active `tool_call` hook without argument interpretation. Evidence: the pre-removal
  focused baseline passed 35/35 tests; after strengthening the configured-custom-tool hook assertion,
  `default-tools.test.ts` and `tool-policy.test.ts` passed 18/18.
- [x] Delete `extensions/pi-plan-mode/src/subagent-policy.ts`, remove its import and
  `allowedPlanSubagents` branch from `extensions/pi-plan-mode/src/plan-mode.ts`, and delete the
  policy-only `subagent-policy.test.ts` and `subagent-allowlist.test.ts`. Evidence: targeted `rg` over
  active source and tests found no `subagent-policy`, `subagent_spawn`, covered-tool set, or policy
  function references.
- [x] Remove `allowedPlanSubagents` from `PlanModeSettings` and
  `normalizePlanModeSettings()` in `extensions/pi-plan-mode/src/settings.ts`, remove its dedicated
  normalization cases from `settings.test.ts`, and add a generic unknown-top-level-field assertion.
  Evidence: the removal test first failed 1/5 because the field was still exposed, then passed 5/5;
  the final generic test also proves an unknown field is omitted from effective settings while the
  legacy-file test proves unknown JSON bytes remain unchanged.
- [x] Update `extensions/pi-plan-mode/README.md`: remove the feature bullet, settings example field,
  and `Allowed Plan subagents` section; strengthen the generic custom-tool text to state that Plan
  mode never interprets extension-tool arguments and trusts an explicitly enabled tool as a whole;
  add a short migration notice for the removed public setting without documenting another
  extension's schema. Evidence: targeted README/source/test search leaves only the bounded migration
  notice for the removed setting and no foreign tool or schema names.
- [x] Update `docs/implementation-notes/extension-independence-audit.md` to remove the resolved
  `pi-plan-mode` row, change the known runtime-gap count from five to four, and remove
  `allowedPlanSubagents` from the remaining-risk examples. Evidence: the summary says four and the
  table contains exactly the four remaining package rows.
- [x] Run focused formatting, typechecking, and Plan-mode tests with Biome,
  `npm run typecheck --workspace @narumitw/pi-plan-mode`, test compilation, and the compiled
  `extensions/pi-plan-mode/test/*.test.js` files. Evidence: focused Biome and workspace typecheck
  passed; a clean test-cache compile followed by all compiled Plan-mode tests passed 86/86. The first
  compiled run exposed only stale deleted JS in the uncleared cache, then passed after the same cache
  cleanup used by the root test runner.
- [x] Run `npm test` and `npm run check`; resolve only failures caused by this removal and record the
  passing Biome, extension-boundary, workspace-typecheck, and full-test evidence. Evidence: the linked
  worktree run reached 1,926/1,927 with only the unrelated Git-alias `GIT_DIR` worktree artifact; in a
  clean normal clone of the exact patch, standalone `npm test` passed 1,927/1,927 and `npm run check`
  passed Biome, boundaries, all workspace typechecks, and 1,927/1,927 tests.
- [x] Run `just pack-plan-mode` and inspect the dry-run tarball to confirm
  `src/subagent-policy.ts` is absent, the thin `src/index.ts` remains, and no extension dependency was
  added. Evidence: the 18-file dry run omitted the deleted policy, included the 42-byte forwarding
  `src/index.ts`, produced no tarball artifact, and `check-extension-boundaries.mjs` passed for one
  library and 22 active extensions.
- [x] Audit the final diff against `AGENTS.md`, `docs/extension-conventions.md`, and
  `docs/extension-settings.md`; use a final targeted search to confirm active `pi-plan-mode` source,
  tests, and current feature documentation contain no `subagent-policy`, `subagent_spawn`, or foreign
  argument-shape parsing, and that any remaining `allowedPlanSubagents` reference is limited to the
  migration notice, this plan, or archived history. Evidence: source/test search is clean, the only
  package match is the migration notice, LSP/Biome report zero diagnostics, and a direct compiled
  settings assertion proves the removed field is inert. The settings audit found no writes or
  concurrency changes; cancellation, disposal, replacement, and shutdown own no changed async flow.
  The breaking safety migration is accepted and documented; version bump, publication, and live
  release validation remain intentionally unverified release work.

## Completion Checklist

- [x] `extensions/pi-plan-mode/src/subagent-policy.ts` and its policy-only tests no longer exist.
- [x] `pi-plan-mode` contains no runtime knowledge of another extension's tool names, schemas,
  actions, settings, installation state, version, or behavior.
- [x] Extension/custom tools remain disabled by default and are trusted only after explicit generic
  user opt-in, proven by focused hook and tool-selection tests.
- [x] Existing settings files remain byte-for-byte untouched; the removed field is inert under the
  existing generic unknown-field behavior, and migration risk is documented as breaking.
- [x] The README and extension-independence audit reflect the new ownership boundary without claiming
  that Plan mode enforces another extension's internal safety.
- [x] Focused checks, `npm test`, `npm run check`, and `just pack-plan-mode` pass with recorded
  evidence and no unrelated source changes.
