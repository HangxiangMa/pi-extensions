# Pi TUI Kit Agent-Level Flows Plan

## Goal

Extend `@narumitw/pi-tui-kit` with three reusable composites that Pi coding-agent already
assembles above the raw `pi-tui` primitives:

1. a standalone, cancellable `runTask()` flow;
2. a declarative single-line `input` menu screen; and
3. a bounded, scrollable `review` menu screen for exact text, code, and diffs.

The change must preserve existing menu behavior, keep domain state and persistence in consuming
extensions, and enforce TUI/RPC/lifecycle behavior once inside the kit instead of repeating it in
callers.

## Context

- `packages/pi-tui-kit/src/runtime.ts` already embeds `BorderedLoader` for `busyLabel`, but no public
  task helper exists. Similar cancellation/result wrappers are repeated in
  `extensions/pi-image-drop/src/menu.ts`, `extensions/pi-usage/src/usage.ts`,
  `extensions/pi-sync/src/manager-ui.ts`, `extensions/pi-btw/src/btw.ts`, and
  `experimental/pi-jupyter/src/jupyter-preview.ts`.
- Pi exposes `ExtensionInputComponent`, `ExtensionEditorComponent`, `ctx.ui.input()`, and
  `ctx.ui.editor()`, while the kit cannot currently place text entry inside its screen stack.
  `extensions/pi-image-drop/src/menu.ts` consequently owns a custom input component to distinguish
  Back from Close and retain menu semantics.
- The existing `detail` screen word-wraps prose. It is unsuitable for code and diffs because exact
  whitespace can be lost and there is no viewport. Scroll/review behavior is independently owned by
  `extensions/pi-btw/src/bring-to-main.ts`, `extensions/pi-btw/src/transcript-pager.ts`,
  `experimental/pi-file-context/src/file-context-explorer.ts`, and
  `experimental/pi-jupyter/src/notebook-panel.ts`.
- Pi coding-agent publicly provides relevant higher-level behavior such as `BorderedLoader`,
  `renderDiff()`, `highlightCode()`, `getLanguageFromPath()`, keybinding hints, and visual truncation;
  raw `pi-tui` provides the lower-level components, key matching, width utilities, and focus model.
- Guides read for this plan: `docs/extension-conventions.md`, Pi's `docs/extensions.md`, `docs/tui.md`,
  `docs/rpc.md`, and `docs/keybindings.md`. Applicable MUST areas are TUI/non-interactive mode
  guards, width-bounded rendering, callback theme/keybindings, IME focus forwarding, cancellation and
  disposal, stale-context protection, reusable-library boundaries, deterministic tests, the root
  check, and package dry-run inspection. `docs/extension-settings.md` is not applicable because the
  kit will not load, validate, or persist extension settings.

## Architecture

### Public contracts

#### `runTask()`

Add a public helper with a generic context and typed terminal result. Final naming and parameter
ordering should be locked by type tests before implementation, with this intended shape:

```ts
const result = await runTask(ctx, {
  label: "Loading usage…",
  signal: sessionSignal,
  isCurrent: () => generation === currentGeneration(),
  task: ({ signal }) => loadUsage(signal),
  onError: (_ctx, error) => reportError(error),
});
```

```ts
type RunTaskResult<T> =
  | { kind: "completed"; value: T }
  | { kind: "cancelled" }
  | { kind: "stale" }
  | { kind: "error"; error: unknown };
```

The result meanings are part of the public contract:

- `completed`: the task settled successfully while its owner was current;
- `cancelled`: the user cancelled the task through the task UI;
- `stale`: the owner signal aborted, `isCurrent()` failed, or Pi externally disposed the task UI;
- `error`: a non-cancellation failure occurred while the owner was still current.

The kit owns signal composition, exactly-once settlement, stale checks after every await, error
reporting fallback, component disposal, and draining the task before returning. The supplied task
must honor its signal so cancellation can finish; the kit will not hide an uncooperative task behind
an arbitrary timeout.

`runMenu()` busy actions must use the same internal task flow so standalone tasks and `busyLabel`
actions cannot drift in cancellation or disposal behavior.

#### `input` screen

Add a screen whose submitted raw value is delivered through the existing action context `value`:

```ts
{
  kind: "input",
  title: "Maximum image count",
  lines: ["Current: 20"],
  placeholder: "Enter a positive integer",
  action: "setMaximum",
  hint: "back",
}
```

The kit owns the draft, focus forwarding, submit/pending state, Back/Close distinction, action
serialization, rejected-action recovery, and mode adaptation. The consuming action owns validation,
normalization, persistence, and product-specific errors. A rejected or thrown action keeps the same
TUI draft available for correction; an accepted transition follows the normal navigator semantics.

TUI uses an injected-theme/keybinding component built from public `pi-tui` controls rather than
instantiating Pi's globally themed extension input component. RPC uses `ctx.ui.input()` with the
combined owner signal and reopens the dialog after a rejected action. Print and JSON retain the
existing unsupported-menu contract.

Version one will not add secret masking, an initial editable value, or multi-field forms because Pi's
cross-mode input protocol does not provide those contracts consistently.

#### `review` screen

Add a read-only screen with raw content, an explicit rendering format, a bounded viewport, and at
most one primary confirmation action:

```ts
{
  kind: "review",
  title: "Review configuration changes",
  content: unifiedDiff,
  format: { kind: "diff", filePath: settingsPath },
  viewportSize: 14,
  confirm: { id: "apply", label: "Apply", action: "apply" },
  hint: "back",
}
```

The intended format union is exact text, code with an optional language/file path, and unified diff.
The final discriminated type must be fixed by public type tests. The kit owns terminal-control
sanitization, cell-aware hard wrapping that preserves whitespace, themed rendering, scroll clamping,
Page Up/Page Down behavior, position feedback, width bounds, confirmation dispatch, and Back/Close.
The consumer owns the content, consequences, confirmation wording, and mutation.

TUI renders a fixed-size viewport so it does not need undocumented terminal-height access. RPC
presents bounded pages through signal-aware `ctx.ui.select()` dialogs with Previous/Next, the primary
action when present, and Back/Close. It must never send the full unbounded document as one RPC title.
Print and JSON retain the existing unsupported-menu contract.

Use only package-root Pi imports. Prefer Pi's public highlighting/diff helpers when deterministic tests
prove they sanitize input, rebuild correctly after theme invalidation, and preserve width; otherwise
implement the smallest callback-themed adapter in the kit rather than deep-importing Pi internals.

### Internal ownership and layout

- Add `packages/pi-tui-kit/src/task.ts` for standalone task orchestration and the reusable internal
  task runner used by menu busy actions.
- Add `packages/pi-tui-kit/src/components/input.ts` for the input component and its pending/draft
  state.
- Add `packages/pi-tui-kit/src/components/review.ts` for review formatting, viewport state, and input
  handling; extract an exact-wrap helper beside it if tests show the responsibility is independently
  reusable.
- Keep `packages/pi-tui-kit/src/components/index.ts` as dispatch/composition rather than adding both
  implementations inline.
- Extend `packages/pi-tui-kit/src/types.ts`, `src/model.ts`, `src/runtime.ts`, and `src/index.ts` only
  with the public unions, validation, mode adapters, and exports they own.
- Raise `PI_EXTENSION_MENU_API_VERSION` from `2` to `3` because older runtimes cannot interpret the
  new screen discriminants. Do not hand-edit the npm package version; release versioning remains a
  separate repository workflow.

### Lifecycle and mode requirements

Audit these paths independently for each asynchronous flow:

- user cancellation;
- component disposal;
- owner/session signal abort;
- `isCurrent()` becoming false after an await;
- TUI replacement by another custom component;
- action/task success and failure racing with cancellation; and
- shutdown/session replacement while RPC waits for a response.

After any owner becomes stale, no continuation may report success, invoke another action, reopen a
screen, or use the captured context. Pending work must be aborted and drained before the public
promise resolves.

## Non-Goals

- Do not add the multi-line `editor` screen in this change. Pi's `ctx.ui.editor()` currently lacks an
  `AbortSignal` option, so it cannot satisfy the same RPC/session-replacement contract.
- Do not wrap `ModelSelectorComponent`, `SessionSelectorComponent`, `TreeSelectorComponent`, or other
  Pi-domain selectors; they remain coupled to Pi's model/session managers.
- Do not re-export shallow aliases for `DynamicBorder`, `keyHint()`, `Text`, `Box`, or other directly
  importable primitives.
- Do not add settings schemas, persistence, migrations, domain validation, live cursor-driven
  previews, external-editor launching, horizontal scrolling, or consumer-specific confirmations.
- Do not migrate existing extension call sites in the initial package change. The existing
  `busyLabel` path is the first in-package consumer; extension migrations should be separate bounded
  follow-ups after the public contract ships.
- Do not add runtime dependencies; the existing Pi peer packages must provide all required behavior.

## Assumptions

- Existing action, detail, choice, settings, and multi-select definitions remain source-compatible and
  behavior-compatible.
- RPC clients can display multiline `select` titles, as documented by Pi's extension UI protocol;
  review pages will nevertheless be bounded to limit protocol/UI burden.
- `input` action rejection is observable through the existing `onError`/notification path, while the
  draft remains in the active TUI component.
- Exact review content is untrusted terminal input and must be sanitized before any highlighting or
  wrapping.

## Risks

- Refactoring busy actions onto `runTask()` can subtly change whether Escape returns to the menu or
  exits stale. Preserve the existing `runtime.test.ts` behavior before migrating the path.
- Pi's public `renderDiff()` reads Pi's active theme internally rather than accepting the callback
  theme. Theme-switch and invalidation tests must decide whether it is safe to reuse.
- ANSI-aware hard wrapping can corrupt style resets, split wide graphemes, or lose indentation.
  Exercise narrow widths, CJK/emoji, tabs, long unbroken tokens, ANSI styles, and terminal controls.
- RPC review pagination can create label collisions or navigation loops. Keep raw action identity
  separate from display labels and test cancellation at every page.
- New screen kinds expand a public discriminated union. API version `3`, declaration output, README
  examples, and the packed tarball must agree.

## Plan

### 1. Establish the task contract and shared runner

- [x] Add red-first public type and behavior coverage in
  `packages/pi-tui-kit/test/task.test.ts` and `test/context-usage.ts` for `runTask()` completion,
  user cancellation, owner abort, stale generation, external disposal, task draining, real errors,
  rejecting error reporters, and TUI versus non-TUI execution. Evidence: package typechecking failed
  on the missing `runTask` export and task callback types before implementation.
- [x] Implement `packages/pi-tui-kit/src/task.ts` and export its function/result/options types from
  `src/index.ts`, yielding exactly one typed terminal result while combining cancellation and stale
  ownership. Evidence: package typechecking and all seven focused task tests pass.
- [x] Refactor the `busyLabel` branch in `packages/pi-tui-kit/src/runtime.ts` to use the shared task
  runner without changing menu outcomes. Evidence: all 25 focused runtime regressions and all six
  task tests pass together.

### 2. Add the declarative input screen

- [x] Add red-first type, validation, component, and runtime cases in
  `packages/pi-tui-kit/test/menu-model.test.ts`, a new `test/input-screen.test.ts`, and
  `test/readme-usage.ts` for the intended `InputScreen` contract. Evidence: package typechecking
  failed only on the missing screen type, component callback, and screen union before implementation.
- [x] Implement `InputScreen` validation and the focused TUI component in
  `packages/pi-tui-kit/src/types.ts`, `src/model.ts`, and `src/components/input.ts`, preserving raw
  submitted values while sanitizing display text, keeping rejected drafts, serializing submission,
  bounding every width, rebuilding themed content, and aborting/draining on disposal. Evidence: all
  focused input component and model tests pass across widths 1–120.
- [x] Integrate input dispatch and action handling into `src/components/index.ts` and
  `src/runtime.ts`, using `ctx.ui.input(..., { signal })` in RPC and preserving TUI Back versus
  Ctrl+C Close semantics. Evidence: seven focused input runtime/component tests cover RPC retry and
  cancellation, TUI draft retention, action disposal, owner abort, raw values, and no RPC custom UI.

### 3. Add the bounded review screen

- [x] Add red-first type, validation, formatting, viewport, and RPC pagination cases in
  `packages/pi-tui-kit/test/menu-model.test.ts`, a new `test/review-screen.test.ts`, and
  `test/readme-usage.ts` for exact text, code, diff, optional confirmation, viewport bounds, and
  invalid configurations. Evidence: package typechecking failed only on the unsupported review
  discriminant and missing public type before implementation.
- [x] Implement review sanitization, exact cell-aware wrapping, theme-aware text/code/diff formatting,
  and viewport state in `packages/pi-tui-kit/src/components/review.ts`, keeping every rendered line
  within widths `1`, `2`, `8`, `20`, `40`, `80`, and `120`. Evidence: focused tests pass for
  CJK/emoji, tabs, indentation, long tokens, control bytes, resize clamping, and line/page scrolling.
- [x] Integrate review confirmation and exits into `src/components/index.ts`, `src/model.ts`, and
  `src/runtime.ts`, and implement bounded signal-aware RPC pages with collision-free labels. Evidence:
  focused TUI/RPC tests prove raw confirmation identity, bounded pagination, label collision handling,
  owner abort, Back/Close, read-only behavior, and no RPC custom TUI.

### 4. Finalize the public API and documentation

- [x] Raise `PI_EXTENSION_MENU_API_VERSION` to `3`, export the new task and screen types from
  `packages/pi-tui-kit/src/index.ts`, and extend `test/context-usage.ts` with positive and negative
  compile-time examples. Evidence: existing screen definitions remain unchanged, invalid action ids
  are compile-time errors, and package typechecking passes.
- [x] Update `packages/pi-tui-kit/README.md` with `runTask()`, input, and review examples, the complete
  mode/cancellation behavior, API version `3`, ownership boundaries, editor deferral, and package
  layout while preserving the existing English title, badges, and standard sections. Evidence:
  `test/readme-usage.ts` mirrors and typechecks every new public shape.
- [x] Rebuild `packages/pi-tui-kit/dist/` using the package build script and inspect declarations and
  JavaScript exports for source parity. Evidence: generated declarations expose `runTask`, input,
  review, and API version `3`; `npm run check --workspace @narumitw/pi-tui-kit` passes cleanly.

### 5. Verify runtime and publication behavior

- [x] Run a temporary built-package TUI-host smoke that exercises successful and cancelled
  `runTask()`, input rejection with draft correction, review scrolling/resizing, confirmation, Back,
  and Ctrl+C Close. Evidence: `node node_modules/.cache/pi-tui-kit-consumer-smoke.mjs` passed against
  package-root imports from generated `dist/`. Accepted deviation: repository instructions prohibit
  launching an interactive TUI, so the smoke used Pi's real components with an automated custom-UI
  host rather than opening an interactive Pi process; deterministic TUI tests cover the same inputs.
- [x] Run an RPC smoke or deterministic protocol harness for task execution, signal-cancelled input,
  rejected input retry, review pagination, confirmation, and cancellation. Evidence:
  `node node_modules/.cache/pi-tui-kit-rpc-client.mjs` passed against a real `pi --mode rpc` process;
  focused owner-abort tests cover signal cancellation, no custom request was emitted, and every
  observed review title was bounded below 2,000 characters.
- [x] Run `npm test`, `npm run check`, and `just pack-tui-kit`, inspect the tarball for `dist/`,
  declarations, README, and LICENSE only. Evidence: 1,907 root tests pass, the CI-equivalent root
  check exits successfully, and the 27-file dry-run tarball contains package metadata, LICENSE,
  README, generated JavaScript, and declarations with no source or tests.
- [x] Audit the final diff against the TUI/non-interactive, lifecycle, package-boundary,
  documentation, and verification MUST rules in `docs/extension-conventions.md`. Evidence: all new
  custom UI is TUI-guarded and width-tested; RPC uses signal-aware dialogs; tasks/actions abort and
  drain on cancellation, disposal, and replacement; imports use Pi package roots; no persistence or
  dependency moved into the kit; the largest changed source file is 767 lines; LSP reports zero
  diagnostics; and the automated-host TUI smoke deviation is documented above.

## Completion Checklist

- [x] `runTask()` has one public contract shared by standalone callers and menu busy actions, proven
  by task and regression tests.
- [x] Input screens preserve raw payload identity, rejected drafts, IME focus, width safety,
  cancellation, disposal, stale ownership, and TUI/RPC adaptation.
- [x] Review screens preserve exact safe content, remain width/viewport bounded, scroll predictably,
  dispatch optional confirmation by raw id, and paginate safely in RPC.
- [x] Existing menu definitions and behavior remain compatible; the new screen capability is marked
  by `PI_EXTENSION_MENU_API_VERSION === 3`.
- [x] Source, declarations, generated `dist/`, README examples, and packed contents expose the same
  API.
- [x] Focused tests, `npm test`, `npm run check`, automated-host TUI and real-Pi RPC smokes, and
  `just pack-tui-kit` all pass; the prohibited interactive-TUI path is explicitly covered by the
  documented automated-host deviation.
