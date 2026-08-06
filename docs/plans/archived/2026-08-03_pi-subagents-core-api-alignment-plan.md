# Pi Subagents Core API Alignment Plan

## Goal

Align `pi-subagents` with public `@earendil-works/pi-coding-agent` APIs where they are
semantically equivalent, so Pi core owns resource precedence, model-pattern parsing, and shared
output-limit defaults while `pi-subagents` retains its consultation policy, privacy boundaries,
lifecycle ownership, and exact streaming limits.

## Context

- `consult.ts` currently discovers `SYSTEM.md` and `APPEND_SYSTEM.md` itself and hard-codes `.pi`.
  Pi core publicly exposes `DefaultResourceLoader` and `CONFIG_DIR_NAME`.
- Explicit CLI `--append-system-prompt` values replace, rather than add to, core discovery. Every
  subprocess child receives the selected agent prompt through that flag, so simply deleting the
  extension's append-file discovery would silently omit ordinary `APPEND_SYSTEM.md` resources.
- `in-process-transport.ts` implements model-pattern and `:<thinking>` parsing while Pi core publicly
  exposes `resolveCliModel()`. The core resolver requires a `ModelRuntime`, but the extension resolves
  the model before constructing its optional child runtime for compatibility with older Pi versions.
- `limits.ts` duplicates Pi's default byte and line constants, but its exact UTF-8 streaming behavior
  and extension-specific truncation marker are not equivalent to core's whole-line truncators.
- The current checkout is the PR #530 branch. Implementation should use a separate focused branch
  from the intended base (normally current `origin/main`) unless the user explicitly asks to stack it
  on PR #530.

## Architecture

- Keep trust and consultation resource selection (`none`, `project-context`, `all`) in
  `pi-subagents`. Delegate source precedence to a public core API only if a bounded probe proves it
  does not execute extensions, install packages, or widen the target's trust/resource policy.
- Keep agent-role prompts extension-owned. The resource adapter must merge them with core-selected
  append sources without relying on deep `dist/*` imports or another extension.
- Construct a child `ModelRuntime` before resolving an explicit in-process model when the installed
  public API supports it, then use `resolveCliModel()` and preserve the existing precedence:
  spawn override → agent thinking setting → model suffix → parent thinking level.
- Keep exact byte-bounded streaming, private-text redaction, and terminal sanitization in
  `pi-subagents`; share only core defaults or truncators whose behavior is proven equivalent.
- Any new asynchronous resource or model setup remains request/session-owned. After each `await`,
  revalidate cancellation and session generation before using the result or spawning work.

## Non-Goals

- Replacing `runner.ts` or `protocol.ts` with core `RpcClient`; its current fixed Node launch and
  process cleanup do not satisfy PR #530's exact-CLI and lifecycle requirements.
- Replacing agent Markdown discovery, extension settings, retained-agent persistence, mailbox,
  registry, or context-selection policy with Pi session APIs.
- Importing private `dist/*` modules, coupling to pi-web or another extension, publishing a package,
  merging PR #530, or changing the public consultation modes.
- Replacing `truncateUtf8()` wholesale when complete-line core truncation would change protocol,
  stderr, mailbox, or persistence semantics.

## Assumptions

- Public API behavior is evaluated against the workspace's locked Pi core version, currently declared
  by `packages/pi-subagents/package.json` dev dependencies; durable guidance must not hard-code that
  version.
- Repository convention keeps Pi runtime packages at peer version `"*"`, so compatibility must be
  handled in code or by disabling only the unsupported optional in-process path with an actionable
  error—not by narrowing the peer range.
- Trusted-target resource behavior should match ordinary Pi precedence. Untrusted targets must remain
  downgraded to `none` before any project-local resource read.

## Risks

- `DefaultResourceLoader.reload()` is broader than prompt-source lookup and may resolve configured
  packages even when extensions are disabled. Using it in the parent without a side-effect proof
  could widen consultation setup.
- Moving resource setup from synchronous to asynchronous can allow cancellation, session replacement,
  or shutdown to win while discovery is pending.
- Core model resolution may intentionally differ for aliases, fuzzy matches, dynamic provider model
  IDs, and ambiguity. Aligning in-process behavior can therefore be a user-visible compatibility fix.
- A fallback copy of the legacy model resolver would preserve old-Pi support but also preserve two
  semantic owners. Disabling unsupported in-process mode is simpler but may reduce compatibility.
- Core truncation utilities retain complete lines and report different metadata; careless reuse could
  drop a useful partial line or exceed the extension's marker-inclusive byte cap.

## Plan

- [x] Move this plan onto a new focused implementation branch based on the selected current base,
  leaving PR #530's branch unchanged; verified `refactor/pi-subagents-core-api-alignment` was created
  from `origin/main` at `ee21fd4` after PR #530 merged, with only this plan untracked.
- [x] Add a test-only resource probe around public `DefaultResourceLoader` using trusted and untrusted
  temporary projects, global/project `SYSTEM.md` and `APPEND_SYSTEM.md`, and a marker extension; a
  bounded Node probe confirmed project-over-global precedence, global fallback when untrusted, zero
  loaded extensions, no marker execution, and no project `node_modules` creation.
- [x] Record the resource-probe decision in this plan: use `DefaultResourceLoader` with an in-memory
  `SettingsManager`, all non-prompt resources disabled, and explicit target trust. This keeps package
  settings empty, avoids project settings and package installation, and makes core the prompt-source
  owner while the extension retains its bounded forwarded base prompt and agent-role append prompt.
- [x] Add failing consultation tests for the selected architecture covering project-over-global
  `SYSTEM.md`/`APPEND_SYSTEM.md` precedence, global fallback/missing optional files, `none` isolation,
  untrusted downgrade, agent-role prompt retention, no marker-extension execution, and bounded
  structured details; the focused test initially failed because `project-context` omitted the core-
  selected append source, then passed after implementation (22 tests).
- [x] Extract consultation resource assembly from `consult.ts` into `consult-resources.ts` using an
  in-memory-settings `DefaultResourceLoader`; duplicated prompt discovery was removed while
  `none | project-context | all`, bounded base prompts, read-only agent instructions, disabled
  extensions, and pre-spawn failure handling remain covered by focused tests.
- [x] Add cancellation and lifecycle tests for delayed consultation resource setup so caller abort,
  session replacement, and shutdown each prevent spawn and await owned cleanup; focused tests pass.
  These lifecycle tests were added with the injection seam after the resource red/green slice, so no
  separate pre-implementation red run was available for this supporting asynchronous seam.
- [x] Replace operational `.pi` literals in `agents.ts`, `consult.ts`, `inspect.ts`, and model-facing
  `subagents.ts` guidance with public `CONFIG_DIR_NAME`, retaining literal `.pi` only in user-facing
  documentation/global-layout text; focused agent, consultation, inspect, and registration tests pass.
- [x] Add failing in-process model-resolution parity tests using core `resolveCliModel()` as the oracle
  for exact provider/model, broad/ambiguous patterns, IDs containing `/` or `:`, dynamic provider
  model IDs, unknown models, and `:<thinking>` suffixes; compilation initially failed because the
  production resolver lacked core support, and all focused parity/precedence tests now pass.
- [x] Decide the old-core compatibility behavior: retain the peer `"*"` convention and dynamically
  detect public `ModelRuntime` plus `resolveCliModel`, but do not retain a second parser. An unsupported
  optional in-process launch fails actionably with `stateful.transport: "subprocess"`; its capability
  test passes and the package still loads without a static named-export dependency.
- [x] Refactor child runtime construction so registered provider definitions are copied before model
  resolution, explicit models resolve through public `resolveCliModel()`, and parent runtime auth is
  transferred only for the selected model; the 21 focused tests cover parity, provider copy, session
  disposal, startup failure, abort, and shutdown.
- [x] Replace duplicated default output byte/line literals with public `DEFAULT_MAX_BYTES` and
  `DEFAULT_MAX_LINES`, retaining exact `truncateUtf8()`, redaction, terminal sanitation, and extension
  markers; focused context, consultation, and rendering coverage passes for multibyte, oversized,
  line-count, tail, and marker-inclusive caps.
- [x] Update `packages/pi-subagents/README.md` for core prompt precedence, `APPEND_SYSTEM.md` in
  project-context mode, core CLI model parsing, and the actionable unsupported-core fallback; examples
  and settings names remain unchanged.
- [x] Run `npm test`; final run passed all 2,205 tests. Two earlier full-suite runs exposed the same
  unrelated `pi-btw` timing flake, whose focused test passed immediately; no unrelated code was
  changed, and the final direct run plus both final CI-equivalent runs passed the complete suite.
- [x] Run `npm run check` and audit the final diff against applicable factory/lifecycle, tool output,
  trust, package-boundary, documentation, and verification MUST rules; the final gate passed all
  format, boundary, workspace typecheck, and 2,205 test checks. Subprocess launch/termination and
  temporary-prompt ownership were unchanged; no deviation was accepted.
- [x] Run `just pack subagents`; the 38-file dry run contains README, license, package metadata,
  `src/index.ts`, `src/consult-resources.ts`, and all runtime source, with no tests, deep core import,
  new dependency, or generated artifact (107.5 kB packed, 429.3 kB unpacked).
- [x] Run a bounded non-interactive Pi RPC loader smoke without provider traffic using the loaded core
  CLI, `--mode rpc --no-session --no-approve --no-extensions`, explicit local `src/index.ts`, and
  `get_state`/`get_commands`; it exited 0 with two valid responses and the extension-owned
  `subagents` command registered. Two pre-existing global model-pattern warnings were confined to
  stderr.

## Completion Checklist

- [x] Pi core, not `pi-subagents`, is the primary owner of model-pattern parsing on supported runtimes;
  the unsupported-runtime behavior is explicit and tested.
- [x] Consultation resource precedence matches Pi core without widening trust, loading another
  extension, installing packages, or losing the selected agent's system-level instructions.
- [x] No operational project-resource path in active source hard-codes `.pi` where
  `CONFIG_DIR_NAME` is applicable.
- [x] Exact UTF-8 streaming limits, truncation markers, private-text redaction, and terminal safety
  remain covered; only semantically equivalent limits are shared with core.
- [x] Cancellation, request disposal, session replacement, shutdown, child-session cleanup, and
  temporary-prompt cleanup were audited; changed async resource setup has dedicated abort,
  replacement, and shutdown tests. Component disposal is not applicable because no component changed.
- [x] `npm test`, `npm run check`, package inspection, and the non-interactive runtime smoke all have
  recorded passing evidence, with no required check left open.
- [x] The final diff contains no deep Pi import, PATH fallback, pi-web/host detection, extension-to-
  extension coordination, unrelated dependency, or unrelated PR #530 change.
- [x] Every plan item is checked with evidence; archived without overwrite at
  `docs/plans/archived/2026-08-03_pi-subagents-core-api-alignment-plan.md`.
