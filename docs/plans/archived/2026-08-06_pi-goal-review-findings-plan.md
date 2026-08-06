# pi-goal Review Findings Remediation Plan

## Goal

Resolve the four confirmed `pi-goal` review findings: prevent terminal-control injection in rendered
text, bound terminal-tool inputs and outputs, make command parse failures observable in headless
modes, and restore a portable Pi runtime smoke test.

## Context

- `packages/pi-goal/src/commands.ts`, `tools.ts`, `lifecycle.ts`, and `runtime.ts` interpolate goal
  text, blocker reports, and provider errors into `ctx.ui.notify()` messages.
- `packages/pi-goal/src/menu.ts` and `settings-ui.ts` have local control-character filters, but they
  do not remove complete ANSI/OSC sequences and duplicate presentation-boundary policy.
- `goal_complete.summary` and both terminal tools' `goal_id` parameters have no schema or runtime
  length limit. Tool-result `details` are not automatically truncated by Pi.
- `packages/pi-goal/src/command-registration.ts` reports parse failures only through
  `ctx.ui.notify()`, which is not observable in print or JSON mode. Status requests already reject
  those modes by throwing.
- `packages/pi-goal/test/goal-runtime-smoke.mjs` imports private Pi `AuthStorage` internals and its
  `retryAtHardLimitScenario` requires an optional aborted cleanup provider call. The current runtime
  reaches the correct paused state without that extra call.
- Pi 0.84.0 already exposes the required public APIs: `stripTerminalSequences` from
  `@earendil-works/pi-tui`; `truncateHead`, `DEFAULT_MAX_BYTES`, and `DEFAULT_MAX_LINES` from
  `@earendil-works/pi-coding-agent`; and `InMemoryCredentialStore` plus the Faux provider from
  `@earendil-works/pi-ai`.

## Architecture

Keep raw domain data in Goal state and prompts. Sanitize only copies that cross a terminal-rendering
boundary, before any optional theme styling. Put the shared policy in `src/errors.ts`: remove complete
ESC-based terminal sequences with Pi's `stripTerminalSequences`, replace remaining unsafe C0/C1
controls while preserving intentional line breaks, and then apply the caller's character limit.
Reuse this policy from notifications, menu/status previews, settings errors, and terminal-tool display
text instead of maintaining partial local filters.

Treat terminal-tool schemas, runtime validation, returned `content`, and returned `details` as one
size protocol. Use a compatibility-sized goal-ID cap, a 4,000-character completion-summary cap, the
existing blocker caps, and runtime checks that remain effective if a `tool_call` hook mutates validated
arguments. Reject oversized semantic input instead of silently completing or blocking with truncated
data. Apply Pi's output truncation utility as a final content defense, and construct every details
object only from explicitly bounded fields.

For command errors, retain notifications in TUI and RPC, where they are observable. Throw the same
parse error in print and JSON modes so Pi emits its supported extension-error channel rather than a
silent success. Do not add ad hoc stdout output.

The runtime smoke remains an SDK-level harness built from public Pi APIs. Its hard-limit assertion
will verify final Goal state and permit either no cleanup provider call or one call carrying an already
aborted signal, because that extra invocation is not part of Pi's public contract.

## Non-Goals

- Change Goal persistence, prompt trust boundaries, queue semantics, continuation limits, or settings.
- Add a new dependency or a new extension-to-extension integration.
- Introduce a custom Pi test harness API or rely on another private Pi module.
- Redesign command routes, menus, or managed-run RPC events.
- Publish the package; release action still requires explicit user approval.

## Assumptions

- `MAX_GOAL_ID_LENGTH = 128` provides compatibility headroom over current UUID goal IDs while
  preventing unbounded echoes.
- `MAX_COMPLETION_SUMMARY_LENGTH = 4_000` is sufficient for completion evidence and keeps a complete
  tool result comfortably below Pi's 50 KB and 2,000-line limits.
- Expected validation and stale-turn rejections remain normal tool results; unexpected operational
  failures continue to throw.
- No settings behavior is touched, so `docs/extension-settings.md` requires no implementation change
  or settings migration.

## Risks

- Sanitizing stored values instead of presentation copies could alter objectives, blocker evidence,
  or managed-run data. Tests must prove state and protocol data retain their intended plain-text
  content while rendered copies are safe.
- Applying ANSI stripping after theme formatting would remove legitimate extension styling. Sanitize
  untrusted values before formatting.
- Truncating only tool `content` would leave oversized `details`; every success and rejection path
  needs the same bounded-result construction.
- An overly strict runtime-smoke call-count assertion would repeat the current portability failure;
  state and abort ownership are the stable contract.

## Applicable Convention Gates

- **Commands:** preserve all established routes, reject unsupported print/JSON behavior observably,
  and test TUI, RPC, print, and JSON paths (`Test` and `Review`).
- **Tools:** bound potentially large output to Pi's documented limits and test every applicable
  rejection/output path (`Test` and `Review`).
- **TUI/non-interactive:** use `ctx.mode` and Pi-supported error channels; do not write directly to
  stdout (`Test` and `Review`).
- **Package/release:** keep Pi runtime imports in existing `"*"` peer dependencies, add a patch
  Changeset for published behavior, run boundary validation, and inspect a dry-run package (`Review`,
  `Validator`, and `Smoke`).
- **Lifecycle:** this work adds no owned asynchronous task; still audit cancellation, shutdown,
  session replacement, and post-`await` state use for the touched runtime smoke and command paths
  (`Review`).

## Plan

- [x] Record the remediation baseline from clean HEAD by running `npm test`, building
      `@narumitw/pi-tui-kit` if needed before `npm run check --workspace @narumitw/pi-goal`, and
      running `npm run test:runtime --workspace @narumitw/pi-goal`; verified 2,421 ordinary tests and
      the package check passed, while the runtime smoke reproduced only the expected `[false]` versus
      `[false, true]` hard-limit assertion failure at line 365.
- [x] Add focused red-state regressions in `packages/pi-goal/test/menu.test.ts`,
      `goal-contracts.test.ts`, and `goal-error-lifecycle.test.ts` for CSI, OSC 52, C1 CSI, BEL,
      carriage-return, and NUL payloads carried by objectives, blocker reasons, and provider errors;
      the focused compiled run failed exactly four new assertions because rendered notifications and
      previews retained terminal controls or escape payloads.
- [x] Update `packages/pi-goal/src/errors.ts` with the shared Pi-backed terminal-text sanitizer and
      migrate dynamic presentation paths in `menu.ts`, `settings-ui.ts`, `commands.ts`, `tools.ts`,
      `lifecycle.ts`, and `runtime.ts`; the focused compiled suites passed all 66 tests, including raw
      objective/detail preservation, Unicode bounds, multiline messages, and sanitized OSC/CSI/C0/C1
      presentation. Added the existing Pi TUI peer to package dev dependencies at the tested 0.84.0
      version so standalone package typechecking resolves the public API rather than a stale peer.
- [x] Add focused red-state terminal-tool tests in `packages/pi-goal/test/goal-contracts.test.ts` and
      `goal-tool-policy.test.ts` for oversized `goal_id` and completion `summary`, direct execution
      representing post-schema argument mutation, multiline/byte-heavy output, sanitized display
      content, and bounded `details`; the focused run failed on the missing schema caps and runtime
      goal-ID limit before reaching later result assertions.
- [x] Update `packages/pi-goal/src/tools.ts` to add TypeBox limits, duplicate critical limits in
      runtime validation, reject oversized semantic fields before state transitions, and funnel all
      tool responses through bounded content/details builders using Pi's truncation constants and
      `truncateHead`; the focused contract/policy suites passed all 56 tests, including valid
      completion/blocker behavior, stale IDs, sanitized content, raw bounded details, and a
      1,979-line completion result below both Pi limits. Broader budget, queue, and managed-run
      semantics remain assigned to the final full suite.
- [x] Add red-state command tests in `packages/pi-goal/test/goal-tool-policy.test.ts` showing malformed
      `/goal` arguments notify in TUI/RPC but reject observably with no UI dependency in print/JSON;
      the focused run passed 32 tests and failed only the new headless assertion because the existing
      notify-only parse-error path resolved silently.
- [x] Update `packages/pi-goal/src/command-registration.ts` with a mode-aware command-error reporter
      that notifies in TUI/RPC and throws sanitized errors in print/JSON without entering menu code;
      the focused policy suite passed all 33 tests, including existing no-argument/status routes and
      the new malformed-command mode matrix.
- [x] Replace the private `AuthStorage` import in
      `packages/pi-goal/test/goal-runtime-smoke.mjs` with a per-harness public
      `InMemoryCredentialStore`, and change hard-limit/pause/budget cleanup assertions to stable final
      state and abort-ownership bounds. The now-unmasked manual-compaction scenario exposed that Pi
      emits `session_compact` before clearing its compaction controller, so `runtime.ts` now owns and
      cancels a one-task deferred continuation with generation/goal revalidation; focused lifecycle
      tests passed 16/16 and the full runtime smoke passed twice without private Pi paths or exact
      optional-cleanup counts.
- [x] Add `.changeset/safe-goal-terminal-contracts.md` with a patch release intent for
      `@narumitw/pi-goal` covering safe terminal rendering, bounded terminal-tool contracts,
      observable headless errors, and public-API runtime coverage; `npm run changeset:status`
      recognized the package, and no version, tag, publication, or visibility action occurred.
- [x] Audit the complete diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md` for command, tool, TUI/non-interactive, lifecycle, settings-display,
      package, and verification MUST rules; confirmed all routes remain, TUI/RPC and headless modes
      are tested, tool outputs are bounded, the deferred task is canceled on explicit pause, shutdown,
      and replacement, settings persistence is unchanged, Pi peers and the thin entrypoint remain
      valid, and the existing cohesive-runtime justification still covers the only source file above
      1,000 lines.
- [x] Run `npm run check`, `npm run test:runtime --workspace @narumitw/pi-goal`,
      `npm run check:boundaries`, `just pack goal`, and `git diff --check`; the final root gate passed
      2,429 tests, runtime smoke passed, boundaries passed for 25 active extensions, the dry-run
      tarball contained the expected 23 source/README/license files, and the diff check was clean.

## Execution Evidence

- Final verification: `npm run check` passed all 2,429 tests plus Biome, boundaries, and workspace
  typechecks; the package runtime smoke passed again; explicit boundary validation passed for 25
  active extensions; `just pack goal` reported exactly 23 declared source/README/license files; and
  `git diff --check` passed.
- Convention audit: read `docs/extension-conventions.md` and `docs/extension-settings.md`; audited
  command modes, tool schemas/results, terminal presentation, async cancellation/disposal/session
  replacement, unchanged settings persistence, package peers, Changeset intent, and the existing
  `runtime.ts` cohesion justification. No deviation or unverified path remains.
- Codebase-memory coverage: re-indexed the repository in fast mode after implementation with 12,810
  nodes, 44,956 edges, and zero skipped files; the notification helper has 41 direct inbound call
  sites across the Goal command/menu/lifecycle/runtime/tool/settings boundaries.
- Release intent: `npm run changeset:status` recognizes
  `.changeset/safe-goal-terminal-contracts.md` as a patch for `@narumitw/pi-goal`; no release action
  was run.
- Runtime smoke: after adopting `InMemoryCredentialStore`, optional aborted-call bounds, and the
  owned deferred manual-compaction dispatch, the focused lifecycle suite passed 16 tests and the
  complete runtime smoke passed twice consecutively.
- Headless command green state: the focused policy suite passed all 33 tests after a mode-aware,
  protocol-safe error reporter replaced the notify-only branch.
- Headless command red state: the focused policy suite passed 32 tests and failed only the expected
  missing print/JSON rejection.
- Terminal-tool green state: the same focused contract/policy suites passed all 56 tests after schema
  and runtime caps plus shared bounded result builders were applied.
- Terminal-tool red state: the focused contract/policy run passed 54 tests and failed the two new
  entry assertions because schema `minLength`/`maxLength` and runtime goal-ID bounds were absent.
- Terminal-sanitization green state: the same focused compiled suites passed all 66 tests after all
  Goal notification sinks and shared preview/error helpers adopted the Pi-backed sanitizer; tests
  retain raw objective and blocker detail data outside display boundaries.
- Terminal-sanitization red state: the focused compiled menu, contract, and provider-error suites
  passed 62 tests and failed the four new regressions on retained OSC/CSI/control payloads.
- Baseline on branch `fix/pi-goal-review-findings`: `npm test` passed 2,421 tests;
  `npm run build --workspace @narumitw/pi-tui-kit` and
  `npm run check --workspace @narumitw/pi-goal` passed; the runtime smoke reached the expected
  hard-limit assertion with actual signals `[false]` and otherwise correct final state.

## Completion Checklist

- [x] Terminal notifications, menu/status previews, settings errors, and terminal-tool display text
      contain no executable ANSI/OSC or remaining unsafe C0/C1 controls from untrusted values.
- [x] Raw Goal semantics are preserved outside presentation boundaries, and normal Unicode plus
      intentional multiline output remain readable.
- [x] Both terminal tools enforce schema and runtime input caps, and every returned `content` and
      `details` path stays within its declared and Pi-wide limits.
- [x] Malformed command input is observable in TUI, RPC, print, and JSON without ad hoc protocol
      output or entering TUI-only code.
- [x] The runtime smoke uses only public Pi APIs and passes while testing stable hard-limit state and
      abort-ownership invariants.
- [x] Focused regressions, root CI-equivalent checks, boundary validation, runtime smoke, package dry
      run, and diff checks pass with evidence.
- [x] The patch Changeset is present, all applicable convention gates are audited, and no publish or
      release operation has occurred.
