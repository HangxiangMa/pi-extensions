# 🧭 Pi TUI Kit

[![npm](https://img.shields.io/npm/v/@narumitw/pi-tui-kit)](https://www.npmjs.com/package/@narumitw/pi-tui-kit)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Reusable navigation helpers and typed, declarative interaction flows for independently installable
[Pi](https://pi.dev) extensions, built on
[`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui). The initial
high-level API lets extensions describe menu screens and domain actions while this package owns
standard rendering, navigation, mode adaptation, cancellation, and lifecycle behavior.

## 📦 Install

Add the library as a runtime dependency of the extension package:

```bash
npm install @narumitw/pi-tui-kit
```

The published package contains built ESM and declarations in `dist/`; consumers do not need a
TypeScript loader for dependencies.

## 🚀 Example

```ts
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineMenu, runMenu } from "@narumitw/pi-tui-kit";

type Screen = "main" | "settings";
type Action = "refresh" | "setMode";
interface State {
  mode: "Safe" | "Fast";
}

declare function refreshDomainState(signal: AbortSignal): Promise<void>;
declare function saveMode(mode: State["mode"], signal: AbortSignal): Promise<void>;
declare function loadState(signal: AbortSignal): Promise<State>;
declare function currentGeneration(): number;
declare function formatError(error: unknown): string;

const menu = defineMenu<State, Screen, Action>({
  start: "main",
  screens: {
    main: ({ state }) => ({
      kind: "actions",
      title: "Example extension",
      lines: [`Current mode: ${state.mode}`],
      items: [
        { id: "refresh", label: "Refresh", action: "refresh", busyLabel: "Refreshing" },
        { id: "settings", label: "Settings", to: "settings" },
        { id: "close", label: "Close", close: true },
      ],
      hint: "close",
    }),
    settings: ({ state }) => ({
      kind: "settings",
      title: "Settings",
      items: [
        {
          id: "mode",
          label: "Mode",
          currentValue: state.mode,
          values: ["Safe", "Fast"],
          action: "setMode",
        },
      ],
    }),
  },
  actions: {
    refresh: async ({ signal }) => {
      await refreshDomainState(signal);
      return { kind: "stay" };
    },
    setMode: async ({ value, signal }) => {
      await saveMode(value === "Fast" ? "Fast" : "Safe", signal);
      return { kind: "stay" };
    },
  },
});

export async function showMenu(ctx: ExtensionCommandContext, generation: number) {
  return runMenu(ctx, menu, {
    getState: ({ signal }) => loadState(signal),
    signal: currentSessionSignal(),
    isCurrent: () => generation === currentGeneration(),
    onError: (_ctx, error) => ctx.ui.notify(formatError(error), "error"),
    onUnsupportedMode: (_ctx, mode) => {
      ctx.ui.notify(`The menu is unavailable in ${mode} mode.`, "warning");
    },
  });
}
```

The state loader runs again whenever a screen is entered or refreshed, so screen factories can
remain pure projections of current extension state.

## 🖥️ Standard screens

`defineMenu()` supports five standard screen kinds:

- **`actions`** — navigation targets, domain actions, close rows, and optional cancellable busy
  labels.
- **`detail`** — read-only wrapped text with Back or Close behavior.
- **`choice`** — one confirmed value from a static list, with separate current and initial items,
  selected details, disabled explanations, and a bounded viewport.
- **`settings`** — Pi-style searchable, aligned settings rows with immediate value changes,
  serialized saves, and rollback when an action rejects.
- **`multiSelect`** — optimistic toggles with stable cursor restoration, serialized saves, rollback,
  selected-row descriptions, optional bulk action rows, and a bounded TUI viewport.

All standard TUI screens use Pi's injected keybindings, sanitize display text, rebuild themed
content after invalidation, and bound rendered output to the supplied terminal width. Escape follows
the screen's Back/Close hint; `Ctrl+C` closes the menu.

Choice screens are for bounded static alternatives rather than actions that run while the cursor
moves. `currentItemId` adds the textual current marker; `initialItemId` controls the first cursor when
there is no remembered selection. They remain separate so a custom or legacy current value can focus
a safe fallback. A confirmed row invokes the screen action with its raw `itemId`; moving the cursor
only changes selected details. Rejected or thrown actions retain the selection. Disabled rows stay
focusable for their explanation but never invoke the action. RPC flattens choice rows to unique dialog
labels while preserving raw identity.

```ts
const profileScreen = {
  kind: "choice" as const,
  title: "Information profile",
  lines: ["Current profile: custom"],
  items: [
    {
      id: "minimal",
      label: "Minimal",
      description: "Four segments",
      details: ["Segments: model · cwd · branch · context"],
    },
    {
      id: "balanced",
      label: "Balanced",
      description: "Recommended",
      details: ["Segments: model · thinking · cwd · branch · tools · context · time"],
    },
  ],
  action: "setProfile" as const,
  currentItemId: "custom", // May be absent from items; no false current marker is shown.
  initialItemId: "balanced",
  viewportSize: 8,
};
```

Keep live previews, preview rollback, persistence, and confirmation policy in the consuming extension;
a specialized UI remains appropriate when cursor movement itself has side effects.

TUI settings screens retain the extension title and supporting context above Pi's familiar search
field, aligned label/value columns, ten-row viewport, position indicator, selected-row description,
and keyboard hint. Typing fuzzy-filters labels, arrows navigate, and Enter or Space changes the
selected value. Changes save immediately, so Back or Close never implies rollback. The embedded
search input forwards focus for IME positioning. The kit owns this adapter because Pi's public
`SettingsList` does not currently expose restored-cursor, disabled-row, async rollback, and search
focus behavior together.

Action handlers return one of these results:

```ts
{ kind: "stay" }
{ kind: "back" }
{ kind: "close" }
{ kind: "to", screen: "another-screen" }
{ kind: "rejected", error?: unknown }
```

A rejected settings or multi-select action restores the last accepted value. Throwing has the same
recovery behavior and is routed through `onError`.

For a large catalog, set `viewportSize` to the maximum number of toggle and action rows rendered at
once. Up and Down wrap; Page Up and Page Down move by one viewport and clamp at the first or last row.
The viewport applies only to TUI rendering—RPC keeps one flat list of unique dialog choices.
Descriptions for the selected row appear below the viewport.

```ts
const tools = {
  kind: "multiSelect" as const,
  title: "Tool permissions",
  viewportSize: 9,
  items: allTools.map((tool) => ({
    id: tool.name, // raw stable identity; never recover it from the display label
    label: tool.name,
    description: tool.description,
    selected: enabledTools.has(tool.name),
    disabled: blockedTools.has(tool.name),
    disabledReason: blockedTools.has(tool.name) ? "Blocked by the active policy" : undefined,
  })),
  action: "toggleTool" as const,
  actions: [
    // Bulk domain handlers must exclude disabled rows themselves.
    { id: "enable-all", label: "Enable all available", action: "enableAll" as const },
  ],
};
```

Disabled multi-select rows stay visible and focusable, use a textual `[-]`/`unavailable` marker, show
`disabledReason` with the selected description, and never invoke the toggle handler. RPC exposes the
same unavailable reason and safely returns to the screen when the row is selected. Keep policy and
bulk-set validation in the consuming extension and revalidate it again before mutation.

## 🔌 Runtime and mode behavior

`runMenu()` accepts Pi's `ExtensionCommandContext` by default, a definition, and runtime options:

- `getState({ ctx, signal })` loads extension-owned state.
- `signal` aborts state loads and actions immediately when the owning session is replaced or shut down.
- `isCurrent()` prevents stale continuations after session replacement or shutdown.
- `onError(ctx, error)` customizes observable failure reporting.
- `onUnsupportedMode(ctx, mode)` provides print/JSON fallback behavior.

In TUI mode the runtime uses `ctx.ui.custom()`. In RPC mode it adapts standard screens to
`ctx.ui.select()` dialogs. Print and JSON modes never attempt custom UI and instead call the
unsupported-mode hook. `runMenu()` resolves to `closed`, `unsupported`, `stale`, or `error`.

Lifecycle handlers can opt into the shared `ExtensionContext` surface without a cast. Existing
three-generic command menus keep `ExtensionCommandContext`, including command-only methods.

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const settledMenu = defineMenu<State, Screen, Action, ExtensionContext>({
  // screens and actions; action ctx is ExtensionContext here
});

pi.on("agent_settled", async (_event, ctx) => {
  const generation = currentGeneration();
  await runMenu(ctx, settledMenu, {
    getState: ({ signal }) => loadState(signal),
    signal: currentSessionSignal(),
    isCurrent: () => generation === currentGeneration(),
  });
});
```

The consumer must own and abort the session signal, check its generation or equivalent identity after
every await, and never retain or use an `ExtensionContext` after session replacement, reload, or
shutdown. The kit does not create lifecycle ownership for the extension.

## 🧩 Ownership boundary

Reuse Pi primitives and domain components from their package root whenever their public contract fits.
Use non-exported Pi composites only as interaction references; never deep-import Pi's `dist/*`
implementation paths. The kit owns a composite only when public controls do not provide the complete
cross-mode and lifecycle contract shared by multiple extensions.

The library owns:

- width-safe standard rendering and injected keybindings;
- screen-stack navigation, Back/Close semantics, and per-screen cursor memory;
- serial settings and multi-select updates, optimistic rollback, and pending-update draining;
- menu, screen, and busy-action cancellation;
- stale-continuation checks around asynchronous work;
- TUI/RPC adaptation and unsupported-mode routing.

The consuming extension still owns:

- domain state, tool activation, commands, and settings schemas;
- transactional persistence and preservation of unknown settings fields;
- confirmations and product-specific copy;
- session generation and shutdown policy supplied through `isCurrent()`;
- specialized editors, previews, forms, or other custom TUI.

Keep specialized UI local rather than adding package hooks that expose Pi TUI internals.

## 📚 Public API

- `defineMenu()` — validates and returns a typed menu definition.
- `runMenu()` — runs the definition in the current Pi mode.
- `resolveMenuScreen()` — resolves and validates a dynamic screen for tests or adapters.
- `createMenuNavigator()` — lower-level stack and selection state helper.
- exported screen, item, action, transition, runtime option, and result types.
- `PI_EXTENSION_MENU_API_VERSION` — current declarative API version (`2`).

## 🗂️ Package layout

- `src/` — authored TypeScript
- `dist/` — generated ESM and declarations included in the npm package
- `test/` — contract, renderer, navigation, and lifecycle coverage

## 📄 License

MIT © narumiruna
