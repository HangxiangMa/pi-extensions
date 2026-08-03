# Plan Mode Git inspection policy

## Goal

Resolve GitHub issue #533 by aligning Plan Mode's reviewed Git inspection policy with Codex's
risk-reduction model: accept ordinary read-dominant Git forms such as `git diff --cached`,
`git show --stat`, and patch-producing `git log` without mandatory negative helper flags, while
continuing to reject unreviewed command families, explicit helper execution, file output, mutation,
and unsafe shell composition.

## Context

- `safeSubcommands` enables reviewed validators; it is not a raw Git or shell allowlist. Keep its
  persisted shape, accepted values, defaults, and precedence unchanged.
- The current `diff`, `show`, `log`, and configured `blame` validators require `--no-ext-diff`
  and/or `--no-textconv`, which causes the ordinary inspection failures reported in #533.
- Codex treats read-dominant Git subcommands with a small explicit-danger denylist, while mixed
  read/write subcommands use narrower read-form validation. Plan Mode will adopt that distinction,
  but unlike Codex it will continue to fail closed when a command family or shell segment has no
  reviewed validator because Pi supplies no extension-neutral sandbox fallback.
- Plan Mode already documents that tests and checks may execute trusted project code and that its
  shell policy is risk reduction rather than an OS sandbox. Allowing implicit configured Git helpers
  makes that boundary more internally consistent, but it is still an intentional policy relaxation
  that must be documented.
- Touched convention areas are limited-bash command policy, extension-owned `safeSubcommands`
  semantics, user-facing rejection text, package documentation, and deterministic tests. Applicable
  MUST verification is focused behavior testing, settings/documentation review, semantic review of
  the fail-closed boundary, and the repository `npm run check` gate.

## Architecture

- Retain one deterministic policy path in `extensions/pi-plan-mode/src/tool-policy.ts`; the model
  proposes commands but never decides whether they run.
- Continue parsing simple shell chains and require every segment to match a reviewed command
  validator. Redirects, expansions, substitutions, subshells, background work, unsafe generic
  arguments, and unknown commands remain blocked.
- For read-dominant Git validators (`status`, `diff`, `show`, `log`, and configured `blame`), rely on
  the shared explicit unsafe-argument guard rather than requiring negative helper flags. Ordinary and
  future inspection flags therefore pass unless they match a reviewed dangerous form.
- Keep strict command-specific validation for mixed or helper-oriented surfaces: mutating `branch`
  forms, transport-capable `remote show` without `-n`, `cat-file` filters/textconv, `git grep`
  helper/pager options, GitHub CLI reads without structured JSON, unsupported subcommands, and all
  existing unsafe Git global options remain blocked.
- Keep `isSafeCommand()` as the boolean enforcement API. Do not add an LLM judgment, automatic
  rewrite, exhaustive option allowlist, structured diagnostic engine, or settings migration for this
  issue.

## Non-Goals

- Providing sandbox guarantees or preventing every helper that Git configuration can invoke
  implicitly.
- Allowing arbitrary Git, GitHub CLI, PowerShell, Bash, or custom commands from settings.
- Adding a `/plan check-command` route, automatically executing a rewritten command, or changing
  tool-selection behavior.
- Changing package metadata, dependencies, settings file storage, or publishing a release.

## Risks

- A standard `git diff`, `git show`, `git log`, or `git blame` may invoke a textconv or external diff
  helper configured by the user or repository. Accept this as part of the documented trusted-project,
  non-sandbox risk model; continue blocking explicit `--textconv`, `--ext-diff`, signature helper,
  pager, output, and executable-path requests.
- A future Git option on a read-dominant subcommand will pass unless added to the explicit-danger
  guard. Mitigate by retaining narrow validators for mixed subcommands and regression tests for every
  currently recognized execution, output, and mutation escape hatch.
- Existing users may rely on the stricter helper policy. Make the relaxation explicit in README
  security guidance and examples; do not silently claim that accepted commands are side-effect-free.

## Rollback / Recovery

No settings or persisted state migration is involved. If the relaxed policy causes an unacceptable
regression, restore the mandatory negative-helper guards together with their prior tests and README
instructions; existing `safeSubcommands` files remain valid in either direction.

## Plan

- [x] Add red-first policy regressions to `extensions/pi-plan-mode/test/tool-policy.test.ts` for the
      three ordinary #533 forms, configured `git blame` without `--no-textconv`, and a compound
      inspection chain; retain assertions that explicit `--ext-diff`, `--textconv`, `--output`,
      signature/helper, mixed-subcommand mutation, and unsafe chain segments are rejected. Evidence:
      after a clean test compile, the focused test ran all 8 cases and failed only the changed Git
      inspection case because `git diff` still returned false.
- [x] Simplify the read-dominant validators in `extensions/pi-plan-mode/src/tool-policy.ts` so the
      shared Git argument guard remains authoritative while negative helper flags become optional;
      remove obsolete mandatory-guard helpers and make the focused policy test pass without widening
      `branch`, `remote`, `cat-file`, `grep`, GitHub CLI, shell-chain, or unknown-command behavior.
      Evidence: the cleanly compiled focused policy suite passed all 8 cases.
- [x] Add a red-first active-hook assertion in
      `extensions/pi-plan-mode/test/safe-subcommands.test.ts` that an unsupported or explicitly unsafe
      command is described as outside the reviewed inspection policy rather than necessarily
      mutating; update the rejection text in `extensions/pi-plan-mode/src/plan-mode.ts`. Evidence: the
      message test initially failed both active-hook cases against the old wording; after the update,
      the compiled hook and policy suites passed all 11 cases.
- [x] Update `extensions/pi-plan-mode/README.md` to show ordinary accepted Git inspection forms,
      remove mandatory `--no-textconv`/`--no-ext-diff` guidance, preserve the explicit-danger and
      mixed-subcommand rejection examples, and state that configured helpers may run because Plan
      Mode is risk reduction rather than a sandbox. Evidence: the documented examples map to focused
      policy cases, and the package Biome/typecheck gate passed all 31 checked files.
- [x] Audit the final diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md`: confirm `safeSubcommands` schema/defaults/precedence are unchanged,
      every shell segment still fails closed without a reviewed validator, explicit execution/output/
      mutation paths remain rejected, no model decision or extension-specific dependency was added,
      and no source file crossed the 1,000-line decomposition threshold. Evidence: settings,
      manifest, and lock files are unchanged; focused tests cover both sides of the policy; the guard
      scan retained all named mixed/helper surfaces; `tool-policy.ts` is 559 lines and `plan-mode.ts`
      remains exactly 1,000 lines; the extension diff passes `git diff --check`.
- [x] Run `npm run check` from the repository root and record formatter/lint, boundary, workspace
      typecheck, and complete test results. Evidence: the linked worktree run passed all relevant gates
      but reproduced the repository-known unrelated `pi-sync` Git-alias environment failure; the same
      complete patch then passed `npm run check` in a normal local clone with all 2,222 tests passing.
      Metadata/loading are unchanged, so no package dry run or interactive Pi smoke was required.

## Completion Checklist

- [x] `git diff --cached`, `git show --stat --oneline <commit>`, and
      `git log -p -1 <commit> -- path/to/file` pass the deterministic Plan Mode policy without
      mandatory negative helper flags; covered by the focused and full test runs.
- [x] Explicit helper execution, output, pager/signature, mutation, unsafe shell syntax, unsafe chain
      segments, unsupported Git/GH paths, and unreviewed commands remain blocked by retained
      regression cases.
- [x] `safeSubcommands` remains backward compatible and continues to enable reviewed validators
      rather than granting raw subcommand permission; settings code and tests are unchanged.
- [x] Rejection text and README accurately describe the reviewed-inspection, trusted-project,
      non-sandbox risk boundary and the implicit-helper trade-off; package checks passed.
- [x] Focused red/green evidence, the semantic convention/settings audit, and `npm run check` pass;
      the linked-worktree-only unrelated failure and its successful normal-clone verification are
      recorded above.
