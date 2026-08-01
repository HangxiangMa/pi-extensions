# Pi TUI Kit Supported Testing Entrypoint Plan

## Goal

Add a supported `@narumitw/pi-tui-kit/testing` subpath to the existing
`@narumitw/pi-tui-kit` npm package so extension tests can drive Kit-owned TUI components and RPC
adapters without importing repository-private helpers or receiving raw component instances.

This is one package with two import boundaries, not a second npm package:

```ts
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";
import { createRpcHarness, createTuiHarness } from "@narumitw/pi-tui-kit/testing";
```

The package PR will add and verify the testing boundary only. Stamp and Image Drop adoption,
repository-level test-support cleanup, the fresh BTW migration gate, package versioning, and npm
publication remain separate follow-ups.

## Context

- Merged `main` is clean at PR #486's merge commit `a8b8926`. Repository source exposes menu API
  version 5; npm still publishes `@narumitw/pi-tui-kit@0.41.0` with menu API version 3.
- The package currently exports only `"."` from `packages/pi-tui-kit/package.json`. Its existing
  TypeScript build already compiles every `src/**/*.ts` file into JavaScript and declarations under
  `dist/`, and its `files` list already publishes the complete `dist/` tree.
- `test/support.ts` currently knows how to invoke a public `ctx.ui.custom()` factory, provide TUI,
  theme, and keybindings, render at controlled dimensions, send keys/text, forward focus, wait for
  pending Kit actions, dispose components, capture results, and adapt `select`/`input` callbacks to
  standard Kit screens.
- Stamp and Image Drop tests repeat or depend on that repository-private knowledge. Their demonstrated
  needs are the admission evidence for a supported test seam: input focus, rejected-draft retry,
  key-driven Back/Close, pending-action draining, disposal, owner abort, deterministic review/dialog
  cadence, and terminal resize.
- Pi's public `ctx.ui.custom()` contract passes `TUI`, `Theme`, `KeybindingsManager`, and an exactly-once
  `done` callback to a component factory. Its RPC UI methods expose signal-aware `input()` and
  `select()` calls. The testing entrypoint must model those public boundaries rather than private Pi
  `dist/*` implementation details.
- The canonical roadmap explicitly requires semantic driving and stable render/dialog observations
  through a separate testing entrypoint, and explicitly forbids exposing Pi TUI component instances.
- Guides read for this plan: `MEMORY.md`, `docs/extension-conventions.md`, Pi's complete
  `docs/extensions.md`, `docs/tui.md`, `docs/rpc.md`, and `docs/packages.md`, the installed public Pi
  typings, the current package build/manifest, Kit component/runtime contracts, repository test
  support, and the relevant Stamp/Image Drop tests. Applicable MUST areas are public package roots,
  callback-provided TUI/theme/keybindings, focus, cancellation/disposal and task draining, reusable
  library output, deterministic tests, the root check, and package dry-run inspection.
  `docs/extension-settings.md` is not applicable because this change does not read, write, validate,
  or migrate extension settings.

## Architecture

### npm and source boundaries

Keep one workspace and one npm package. Add one conditional subpath export:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "import": "./dist/testing/index.js"
    }
  }
}
```

Use this source layout:

```text
packages/pi-tui-kit/src/testing/
├── index.ts
├── types.ts
├── tui-harness.ts
└── rpc-harness.ts
```

`src/testing/index.ts` is the only testing export surface. The production `src/index.ts` must not
re-export testing helpers, and `PI_EXTENSION_MENU_API_VERSION` remains 5 because the menu definition
protocol does not change. The existing build should emit the mirrored `dist/testing/` tree without a
second `package.json`, workspace, dependency, or build pipeline.

All implementation imports use package-root Pi exports. Testing code may depend on package-internal
component contracts behind its own boundary, but generated declarations must not expose internal
source paths, private component types, or raw instances.

### TUI harness

`createTuiHarness()` owns a composable implementation of the public `ctx.ui.custom()` callback. A
consumer combines `harness.custom` with its own context fixture; the Kit must not publish a general
mock of `ExtensionContext`, session state, notifications, persistence, or domain services.

The intended usage shape is:

```ts
const tui = createTuiHarness({ width: 80, rows: 24 });
const ctx = {
  ...consumerContext,
  mode: "tui" as const,
  hasUI: true,
  ui: { ...consumerContext.ui, custom: tui.custom },
};

const running = runMenu(ctx, menu, options);
await tui.waitForOpen();
const frame = tui.render();
tui.press("tui.select.confirm");
tui.type("raw input");
tui.resize({ width: 60, rows: 12 });
await tui.waitForPending();
tui.dispose();
await running;
```

Lock final names and parameter ordering with compile-time tests before implementation. The public
harness must provide only semantic operations and immutable observations needed by demonstrated
consumers:

- wait for the current custom component to open, including a factory that returns a promise;
- render at the configured or supplied width and observe render-request count without rewriting output;
- send supported Kit binding events, Ctrl+C/Home/End, and explicit raw input; type text separately so
  tests do not confuse text with named keys;
- forward and inspect focus without returning the component;
- resize live terminal rows and width;
- invalidate themed content;
- wait for optional pending Kit work;
- settle `done` exactly once and expose the custom call's result promise;
- dispose exactly once, resolve externally closed custom UI as `undefined`, and ignore later input;
  and
- support sequential screen openings without allowing an obsolete component or promise to become the
  current target.

Default theme and keybinding adapters cover only the public behavior Kit components consume. Allow
explicit callback-compatible overrides for theme/keybinding tests rather than exposing global Pi
state. The harness may recognize package-internal pending/focus/disposal capabilities internally, but
those details must stop at `@narumitw/pi-tui-kit/testing`.

### RPC harness

`createRpcHarness()` owns a strict scripted adapter for the UI methods the current Kit runtime uses in
RPC: `input()`, `select()`, and a `custom()` trap that fails if RPC incorrectly requests TUI. It exposes
those handlers for composition into a consumer-owned context instead of constructing a broad Pi
context mock.

The intended usage shape is:

```ts
const rpc = createRpcHarness([
  { kind: "input", response: "not-a-number" },
  { kind: "input", response: "12" },
  { kind: "select", response: "Apply" },
]);

const ctx = {
  ...consumerContext,
  mode: "rpc" as const,
  hasUI: true,
  ui: { ...consumerContext.ui, ...rpc.ui },
};

const result = await runMenu(ctx, menu, options);
rpc.assertConsumed();
```

The script and observations must:

- distinguish input and select steps and fail immediately on unexpected kind/order or exhausted steps;
- record raw, unmodified titles, placeholders, choices, call order, and whether the supplied signal
  was already aborted;
- return exact scripted strings or `undefined` cancellation without fuzzy matching or label inference;
- support a pending step that settles from caller abort so owner-abort tests cannot hang;
- remove abort listeners after every settlement and reject duplicate settlement;
- expose immutable dialog records and a finite `assertConsumed()` check; and
- reject `custom()` deterministically so tests prove RPC never crossed into TUI.

Do not add `confirm()`, editor, notification, session, model, settings, filesystem, timer, or network
mocks until a Kit-owned production path and compatible consumers require them. In particular, this
entrypoint does not become a general Pi SDK test framework.

### Ownership and migration boundary

The testing entrypoint owns only translation between Pi's public UI callback/dialog seams and
repeatable semantic test controls. Consumer tests continue to own:

- their `ExtensionContext` fixture and domain methods;
- session generation and owner `AbortController` instances;
- action results, validation, persistence, and error assertions; and
- decisions about which frame/dialog content is product-significant.

Package tests prove the harness itself and a representative `runMenu()` integration. Follow-up Stamp
and Image Drop PRs must prove that this smaller interface actually deletes their private orchestration
before equivalent logic is removed from `test/support.ts`.

## Non-Goals

- Do not create another npm package, workspace, package manifest, package version, release tag, or npm
  page such as `@narumitw/pi-tui-kit-testing`.
- Do not change production menu types, screen behavior, runtime branching, menu API version, result
  objects, rendering, RPC cadence, or task semantics.
- Do not migrate Stamp, Image Drop, BTW, or any other consumer in the package PR.
- Do not remove or broadly refactor `test/support.ts`; consumer-owned deletion belongs to follow-up
  migrations after the supported API is merged.
- Do not export raw Pi or Kit components, internal component factories, mutable current-component
  state, private source paths, or testing helpers from the production `"."` entrypoint.
- Do not publish a complete `ExtensionContext` mock, assertion library, snapshot framework, fake
  clock, filesystem, settings store, session manager, model registry, editor host, overlay host, or
  generic Pi-extension runner.
- Do not add a standalone confirmation harness before the Kit owns a compatible production
  confirmation flow.
- Do not add dependencies, change peer ranges, edit the lockfile without generated metadata evidence,
  bump the package version, publish npm artifacts, or combine the work with the BTW gate or runtime
  interaction-driver refactor.

## Assumptions

- Pi 0.83's installed public `ctx.ui.custom()`, `input()`, and `select()` signatures remain the tested
  compatibility target for this source milestone.
- Kit TUI factories are serial within one `runMenu()` loop. The harness still guards obsolete or
  concurrently opened sessions so a test failure is finite and actionable.
- Consumer tests can compose UI handlers into their existing context fixtures; they do not require the
  Kit to own notifications, editor state, session managers, or domain callbacks.
- The existing `src/**/*.ts` build include and `files: ["dist", "README.md", "LICENSE"]` publication
  boundary can carry `dist/testing/` without build-script or dependency changes.
- Testing helpers are a supported public API and therefore require compatibility discipline after
  publication even though applications normally import them only from test files.

## Risks

- **Internal coupling leaks outward:** declarations could expose `MenuScreenComponent`, private marker
  fields, or source-relative types. Mitigation: keep raw values private, define structural public
  testing types in `testing/types.ts`, and inspect declaration imports plus packed consumer
  compilation.
- **A fake host diverges from Pi:** invented key, focus, disposal, or dialog behavior could make tests
  pass incorrectly. Mitigation: invoke the real public custom factory signature, send real key data,
  compare one built-package TUI flow and one RPC transcript with Pi 0.83, and avoid emulating APIs the
  Kit does not use.
- **Lifecycle hangs:** unresolved `done`, pending work, async factories, owner abort, or disposal could
  strand tests. Mitigation: exactly-once per-open settlement, explicit pending/abort steps, listener
  cleanup, obsolete-session guards, and deterministic timeout-bounded smokes.
- **Testing API sprawl:** moving all of `test/support.ts` would replace one broad mock with a public
  broad mock. Mitigation: apply the deletion test; admit only policy repeated by Kit tests and the
  two named consumers, while leaving context/domain fixtures local.
- **Subpath packaging drift:** source tests can pass while Node or TypeScript cannot resolve
  `@narumitw/pi-tui-kit/testing` from the package. Mitigation: test generated JavaScript/declarations,
  package-root imports, a temporary packed consumer, and exact tarball contents.
- **Premature cleanup:** changing consumers or root support in the same PR would make rollback and API
  review difficult. Mitigation: keep this plan package-only and require separate migration evidence
  before deletion.

## Rollback / Recovery

No persisted data or production runtime contract changes. Before npm publication, revert the bounded
package PR to remove the `./testing` export and `src/testing/` implementation. Existing consumers
continue using repository-local support throughout this PR, so rollback does not strand them.

After publication, treat the testing subpath as public: retain `@narumitw/pi-tui-kit/testing` and fix
behavior or declaration defects in a patch rather than removing the export. If consumer migration
finds a missing contract, leave consumer tests on existing local support until a separately reviewed
additive patch is available; do not widen the harness opportunistically inside a migration.

## Plan

### 1. Establish baseline and lock the public boundary with red tests

- [x] Run `npm run check --workspace @narumitw/pi-tui-kit`, compile the repository test project, and
  execute all current Pi TUI Kit tests on clean `main`; record package/test counts and verify no stale
  `dist/` or worktree change exists before adding the entrypoint. Evidence: package check/build and
  repository test compilation passed at merge commit `a8b8926`; all 99 Kit tests passed, and the only
  initial worktree path was this plan before branching.
- [x] Inventory the exact TUI/RPC orchestration used by Kit, Stamp, and Image Drop tests and map every
  admitted operation to `createTuiHarness()` or `createRpcHarness()`; record any operation outside the
  Architecture section as deferred rather than silently widening the API. Evidence: TUI admission is
  limited to controlled width/rows, render requests, named/raw keys and text, focus, invalidate,
  pending drain, result, sequential open, disposal, and owner abort; RPC admission is exact
  input/select sequencing, records, cancellation, pending abort, and a custom trap. General context,
  Pi API, notifications/status, editor/confirm, overlay, fuzzy row inference, domain, settings, and
  specialized non-Kit component mocks remain local/deferred.
- [x] Add `packages/pi-tui-kit/test/testing-context-usage.ts` with positive imports from
  `../src/testing/index.js`, negative production-root import assertions, composable consumer-context
  examples, immutable public types, and no raw component access; verify package typechecking fails
  only because the new testing entrypoint is absent. Evidence: package typechecking reports the
  missing `../src/testing/index.js`; downstream unused-directive diagnostics are consequences of that
  absent contextual type, while production-root negative assertions remain active.
- [x] Add red-first `packages/pi-tui-kit/test/testing-tui.test.ts` cases for async/sync open, render and
  requestRender observation, named/raw keys, text, focus, resize, invalidation, exactly-once result,
  sequential screens, pending work, disposal, and ignored stale input; verify focused tests fail at
  the missing TUI harness rather than against unrelated runtime behavior. Evidence: compilation fails
  at the missing testing module and its absent contextual callback types before any production source
  changes.
- [x] Add red-first `packages/pi-tui-kit/test/testing-rpc.test.ts` cases for strict input/select
  scripts, exact records, cancellation, unexpected/exhausted steps, pending owner abort, listener
  cleanup, complete-script assertion, and the custom-TUI trap; verify focused tests fail at the missing
  RPC harness. Evidence: compilation fails at the missing testing module; the pre-change 99-test Kit
  baseline remains green.

### 2. Implement the TUI testing seam without exposing components

- [x] Add `packages/pi-tui-kit/src/testing/types.ts` and a thin `src/testing/index.ts` containing only
  the contract fixed by compile-time tests; verify emitted public types use package-root Pi types and
  do not name component internals or repository test support. Evidence: package typechecking/build
  pass; generated `dist/testing/types.d.ts` references only public coding-agent types and structural
  testing contracts, while `index.d.ts` exposes only the two factories and documented types.
- [x] Implement `src/testing/tui-harness.ts` around the public custom-factory callback with inert
  callback-compatible theme/keybinding defaults, configurable width/live rows, render-request
  observation, and semantic/raw input translation; make the focused synchronous render/key/text/focus/
  resize/invalidation tests pass. Evidence: the focused TUI suite passes actual terminal sequences,
  raw text, focus, 20x9 to 12x6 resize, invalidation, and render-request assertions.
- [x] Add per-open generation and exactly-once settlement inside the TUI harness so async factories,
  sequential screens, `done`, external disposal, and late input cannot target obsolete state; make the
  focused result/disposal/stale-session tests pass without returning the component. Evidence: focused
  tests pass sync/async opens, reject overlap/factory failure, dispose a late async component, advance
  two sequential owners, settle once, and ignore post-close input; compile-time coverage rejects raw
  component access.
- [x] Implement optional pending-work draining and result/open promises with abort-listener cleanup;
  integrate a representative `runMenu()` input flow that rejects once, retains the draft, accepts a
  correction, then proves owner abort and component disposal settle without later action or UI use.
  Evidence: focused tests drain a controlled pending promise, retain `bad` before accepting `12`,
  return stale for owner abort, and distinguish external disposal as a finite Close.

### 3. Implement strict RPC scripts at the current Kit boundary

- [x] Implement `src/testing/rpc-harness.ts` with composable `input`, `select`, and rejecting `custom`
  handlers, exact typed script steps, immutable dialog records, and strict call-order/exhaustion
  errors; make the focused immediate-response and cancellation tests pass. Evidence: focused tests
  pass exact expected input/select calls, frozen records/choice lists, undefined cancellation, and
  actionable unexpected-kind, exhausted, invalid-response, incomplete-script, and custom errors.
- [x] Add one-owner pending RPC steps that observe pre-abort and later abort, settle only once, remove
  listeners, and leave finite script state; make focused owner-abort and duplicate-settlement tests
  pass without timers or unresolved promises. Evidence: focused tests pass pre-abort and later abort,
  duplicate abort is inert, and instrumented signal methods observe one listener addition/removal.
- [x] Integrate the RPC harness with representative `runMenu()` input rejection/retry and adaptive
  review pagination flows; verify exact raw responses, deterministic page records, confirmation
  identity, Back/Close mapping, owner abort, and zero custom-TUI calls. Evidence: focused integration
  passes `bad`/`12` retry, exact two-page 8-row adaptive review records, raw `raw-apply` confirmation,
  Close, stale owner abort, and a rejecting custom trap.
- [x] Run every Pi TUI Kit test after TUI/RPC focused green and audit existing runtime/component tests
  for duplicated helper knowledge; keep behavior assertions, and defer broad test rewrites unless a
  small package-owned case can directly exercise the new public entrypoint. Evidence: all 113 Kit
  tests pass in the final root gate; the new package-owned integration cases exercise the public
  harnesses directly, while
  existing low-level component/runtime characterizations and consumer/root helper migrations remain
  unchanged for independent follow-ups.

### 4. Publish the subpath in package artifacts and documentation

- [x] Add the exact `"./testing"` export to `packages/pi-tui-kit/package.json` while retaining
  `main`, `types`, the production `"."` export, peer dependencies, `files`, package version `0.41.0`,
  and menu API version 5; verify no lockfile change is generated or required. Evidence: manifest
  inspection shows both exact exports, unchanged `dist`/README/LICENSE files, Pi `*` peers, version
  `0.41.0`, and source API 5; `package-lock.json` has no diff.
- [x] Update `packages/pi-tui-kit/README.md` with same-package installation, production versus testing
  imports, TUI and RPC composition examples, supported operations, lifecycle semantics, strict script
  behavior, and explicit non-goals; mirror the examples in compile-time usage coverage. Evidence: the
  English README documents both composable harnesses and boundaries; `test/readme-usage.ts` mirrors
  both examples and package typechecking passes.
- [x] Build the package and inspect `dist/testing/index.{js,d.ts}`, subordinate JavaScript/declarations,
  and the unchanged production entry; verify no declaration imports `src/`, `test/support.ts`, private
  Pi `dist/*`, or a raw component type. Evidence: the build emits four testing JavaScript/declaration
  pairs; searches find only public coding-agent types and structural testing contracts, and no
  forbidden source/private/component reference.
- [x] Add a package-root Node/TypeScript resolution smoke that imports both
  `@narumitw/pi-tui-kit` and `@narumitw/pi-tui-kit/testing` after a clean build; verify production
  exports do not contain testing names and the testing subpath exposes only its documented surface.
  Evidence: `testing-exports.test.ts` dynamically imports both built package roots, confirms source
  API 5 and exactly two testing runtime exports, and compiles a disposable NodeNext consumer; it
  passes.
- [x] Update `docs/roadmaps/pi-tui-kit-roadmap.md` only after implementation evidence exists: mark the
  supported testing-entrypoint milestone complete, keep Stamp/Image Drop adoption, root-support
  cleanup, BTW gate/migration, and npm release open, and update the decision log and regression count.
  Evidence: the roadmap records the same-package testing subpath as source-complete, retains every
  named follow-up, adds the bounded testing decision, and records the verified 1,937-test gate.

### 5. Verify conformance, package contents, and bounded scope

- [x] Run LSP diagnostics on every touched TypeScript file and
  `npm run check --workspace @narumitw/pi-tui-kit`; verify formatting, strict NodeNext types, generated
  output, source boundaries, and examples agree. Evidence: Biome LSP reports zero findings across all
  nine touched TypeScript paths, and the 32-file package check/typecheck/build passes.
- [x] Run a timeout-bounded generated-package TUI smoke using production `runMenu()` from `dist/index.js`
  and `createTuiHarness()` from `dist/testing/index.js`; exercise render, focus, rejected input retry,
  resize, pending action, disposal, Back/Close, and owner abort without opening an interactive TUI.
  Evidence: the package-root generated smoke passes all named paths, including width checks after
  resize and requestRender observation, without launching interactive Pi.
- [x] Run a real-Pi 0.83 RPC conformance smoke for one input retry and one paginated review, then run
  the same menu through the generated `createRpcHarness()` and compare dialog kinds/order, exact
  titles/options, cancellation, and abort outcomes; record any intentional Pi limitation rather than
  relaxing strict scripts. Evidence: four real-Pi/package-root comparisons pass exact retry, two-page
  review, cancellation, and owner-abort transcripts/results with no custom TUI request.
- [x] Run `npm test` and then `npm run check` sequentially after the shared package build; verify every
  repository test passes and consumer tests retain existing behavior without source or harness
  migration. Evidence: both sequential commands pass all 1,937 tests with zero failures, cancellations,
  skips, or todos; consumer source and private test support remain unchanged.
- [x] Run `just pack-tui-kit`, inspect the dry-run file list, and install a generated tarball into a
  disposable non-workspace fixture; verify Node and TypeScript resolve both exports, only expected
  `dist/`, README, LICENSE, and metadata ship, peer dependencies remain external, and the package
  version is unchanged. Evidence: the dry run contains 35 expected files; an actual tarball installed
  under `/tmp` passes Node and strict NodeNext TypeScript imports for both roots, contains no source,
  tests, or bundled dependencies, resolves Pi 0.83 peers externally, and remains version `0.41.0`.
- [x] Audit the final diff against this plan, `docs/extension-conventions.md`, and the roadmap deletion
  test; verify no second package, production-root re-export, raw component exposure, general Pi mock,
  consumer/root-support migration, runtime behavior change, menu API/package version bump, dependency,
  lockfile, tracked build artifact, private Pi import, or unrelated roadmap work entered the PR.
  Evidence: the 13-path diff is limited to the package testing subpath/tests/docs/manifest, this plan,
  and its canonical roadmap milestone. Automated scope assertions confirm every forbidden path/class
  is absent, production has no testing runtime export, testing has exactly two, declarations expose no
  internal component/source path, and the deletion test concentrates demonstrated host policy behind
  composable UI adapters while leaving broad context/domain mocks local.

## Completion Checklist

- [x] `@narumitw/pi-tui-kit/testing` resolves as a subpath of the existing package in source,
  generated declarations/JavaScript, package-root imports, and a disposable packed consumer.
- [x] `createTuiHarness()` drives real Kit custom factories through render, keys/text, focus, resize,
  invalidation, rejected retries, pending work, sequential screens, disposal, results, and owner abort
  without exposing raw components.
- [x] `createRpcHarness()` provides strict deterministic input/select scripts, immutable observations,
  cancellation and owner-abort settlement, complete-script checks, and a failing custom-TUI trap.
- [x] Production `@narumitw/pi-tui-kit` exports, menu API version 5, screen/runtime behavior, package
  version, peer dependencies, and current consumers remain unchanged.
- [x] README, compile-time examples, source ownership, declarations, tarball contents, and roadmap
  agree that testing is a supported but bounded API and consumer migrations remain follow-up work.
- [x] Focused TDD evidence, all Kit tests, lifecycle integrations, LSP diagnostics, package check,
  generated-package TUI smoke, real-Pi RPC conformance, root `npm test`, root `npm run check`, and
  `just pack-tui-kit` pass with no unrecorded skipped path or convention deviation.
