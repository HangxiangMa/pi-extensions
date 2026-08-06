# Issue 527 Pi subagent CLI resolution plan

## Goal

Fix [issue #527](https://github.com/narumiruna/pi-extensions/issues/527) by making
`@narumitw/pi-subagents` launch subprocess children through the exact
`@earendil-works/pi-coding-agent` installation already loaded by the extension, never through an
unverified host entrypoint or an unrelated `pi` found on `PATH`.

## Context

- `packages/pi-subagents/src/runner.ts` currently treats every existing `process.argv[1]` as the Pi
  CLI. Under `@agegr/pi-web`, that value is the pi-web entrypoint, so Pi CLI arguments are sent back
  to pi-web and `-p` is misparsed as `--port`.
- `@narumitw/pi-subagents` already declares `@earendil-works/pi-coding-agent` as a peer dependency and
  imports its public runtime API. Pi core exports `getPackageDir()`, and its package manifest declares
  the `pi` executable through `bin.pi`.
- `PI_CODING_AGENT` is not sufficient entrypoint validation: both Pi's CLI and RPC entrypoints set the
  process-wide marker, and another host or descendant can inherit it.
- The applicable guide is `docs/extension-conventions.md`: this change touches subprocess launch
  behavior, deterministic tests, extension boundaries, lifecycle cleanup review, root verification,
  and package inspection. It adds no extension-owned setting, so `docs/extension-settings.md` is out
  of scope.

## Architecture

- Add `packages/pi-subagents/src/pi-invocation.ts` as the single owner of child Pi executable
  resolution. `runner.ts` will supply built Pi arguments and consume only its resolved
  `{ command, args }` result.
- Support two validated launch forms:
  1. an official standalone Pi executable identified from Pi core's package directory/manifest and
     the current executable; or
  2. the `bin.pi` target from the loaded Pi core package, executed by its supported Node/Bun script
     runtime.
- Validate that the discovered manifest belongs to `@earendil-works/pi-coding-agent`, require an
  explicit string-valued `bin.pi`, resolve that target relative to the package directory, and require
  the expected file/executable form before launch.
- Do not infer CLI identity from `process.argv[1]`, host names, Next.js, pi-web, another extension,
  `PI_CODING_AGENT` alone, or arbitrary executable basenames.
- Do not fall back to `command: "pi"`. An unresolved, malformed, or unsupported loaded Pi package
  must fail before spawn with a bounded actionable launch error; this avoids silently selecting a
  different Pi version from `PATH`.
- Keep the resolver synchronous and side-effect free apart from reading the trusted loaded Pi package
  metadata. Expose a narrow test seam for test-owned package directories and runtime facts rather
  than mutating the developer's installation or inspecting the repository's real manifest as test
  data.

## Non-Goals

- Do not add pi-web, Next.js, or any other extension/package-specific detection or dependency.
- Do not add a user setting, environment override, shell command string, or executable search path.
- Do not change child CLI arguments, subprocess isolation, extension/tool loading policy, process
  termination, timeout, cancellation, stateful transport selection, or in-process transport behavior.
- Do not publish a package, close the GitHub issue, or post externally without separate approval.

## Risks

- **Standalone and package installs have different layouts:** derive both from Pi core's own package
  directory and manifest, and cover each layout with test-owned fixtures.
- **A malformed package could fail after temporary prompts are created:** route resolution failures
  through the existing bounded `launchFailed` result path and verify prompt cleanup without starting
  a process.
- **Overfitting to the current `dist/cli.js` layout could break a future core release:** consume
  `package.json#bin.pi` instead of hard-coding the current relative path.
- **A permissive fallback could reintroduce version skew:** fail closed and include the package path
  and recovery direction without echoing manifest contents.
- **Resolver extraction could accidentally alter child lifecycle behavior:** keep spawn ownership in
  `runner.ts` and audit cancellation, process disposal, session replacement, and shutdown separately
  after integration.

## Plan

- [x] Extract the existing invocation policy without behavior changes from
  `packages/pi-subagents/src/runner.ts` into an exported resolver in
  `packages/pi-subagents/src/pi-invocation.ts`, with a narrow runtime/package-directory input that
  production fills from process facts and `getPackageDir()` and tests can fill from temporary
  fixtures; package typechecking and 68 focused runner, blocking, and orchestration tests remained
  green on 2026-08-03.
- [x] Add `packages/pi-subagents/test/pi-invocation.test.ts` with a test-owned fake Pi package and a
  fake existing non-Pi host entrypoint; the focused compiled Node test failed on 2026-08-03 because
  the extracted current policy selected `host.js` instead of the fixture package's `dist/cli.js`.
- [x] Extend the focused resolver tests for an explicit string-valued `bin.pi`, symlink/normalized
  paths, a validated standalone Pi executable fixture, unsupported runtimes, wrong package names,
  malformed/missing manifests, non-object or non-string `bin.pi` values, and missing/escaping bin
  targets; the focused run recorded six intended failures and one legacy standalone pass on
  2026-08-03, including the old `command: "pi"` fallback and missing fail-closed errors.
- [x] Replace the extracted policy with Pi core's public `getPackageDir()` plus validated package
  metadata, and remove the `process.argv[1]`, Bun virtual-script, and PATH fallback branches; all
  seven focused resolver tests and package typechecking passed on 2026-08-03.
- [x] Add a `runSingleAgent()` regression test proving a resolution failure is reported as a bounded
  `launchFailed` result before spawn and that any temporary prompt files are removed; the test first
  failed by rejecting with `PiInvocationError`, then passed with 76 focused resolver, runner,
  blocking, and orchestration tests including spawn errors, timeout, abort, and process-group cleanup.
- [x] Audit the final diff against `docs/extension-conventions.md`: the resolver references only Pi
  core and Node built-ins, adds no dependency/settings/factory work, and leaves child cancellation,
  process disposal, session replacement, and shutdown ownership unchanged. Resolution is synchronous,
  failures return before spawn through existing bounded details, and the enclosing `finally` removes
  prompts; component disposal is not applicable because no UI path changed. No deviation accepted.
- [x] Run `npm test`, `npm run check`, and `just pack subagents`; both repository test runs passed
  2,197 tests on 2026-08-03, all format/boundary/typecheck gates passed, and the 37-file dry-run
  tarball contained `src/index.ts`, `src/pi-invocation.ts`, and `src/runner.ts` without test files or
  new runtime dependencies.
- [x] Reproduce the issue's host condition with the non-interactive
  `subagent launch does not re-execute a pi-web-like host entrypoint` fixture: it set an existing host
  in `process.argv[1]`, launched the loaded fake package's CLI with
  `--mode json -p --no-session`, and verified the host marker was never created. The PR handoff will
  reference this regression plus `npm test`, `npm run check`, and the package dry run.

## Completion Checklist

- [x] An existing non-Pi `process.argv[1]` can never become the child Pi command.
- [x] Package installs launch the exact loaded Pi core package's declared `bin.pi`; validated
  standalone installs reuse only their own executable.
- [x] Missing or invalid Pi CLI metadata fails clearly before spawn, with no PATH fallback and no
  leaked temporary resources.
- [x] The implementation contains no pi-web, Next.js, or other extension-specific dependency,
  setting, environment contract, or behavior branch.
- [x] Focused regression coverage, existing subprocess lifecycle tests, `npm test`, `npm run check`,
  the host-condition smoke, and `just pack subagents` all pass with recorded evidence.
- [x] Archived as
  `docs/plans/archived/2026-08-03_issue-527-pi-subagents-cli-resolution-plan.md` after every task and
  completion check had evidence; no package was published and issue #527 was not closed.
