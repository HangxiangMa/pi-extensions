## Goal

Move status emoji ownership out of producer extensions and into `@narumitw/pi-statusline`. Success means active extensions publish plain status text, while `pi-statusline` can centrally choose, override, or suppress per-extension status icons from JSON config.

## Context

Current status icons are split across extensions: `pi-caffeinate` has `PI_CAFFEINATE_ICON`, while `pi-goal`, `pi-sync`, `pi-plan-mode`, `pi-retry`, `pi-subagents`, `pi-firecrawl`, `pi-chrome-devtools`, and `pi-codex-usage` embed emoji in status strings. `pi-statusline` already parses a leading emoji from extension status text and falls back to `🔌` when none exists.

## Architecture

`pi-statusline` becomes the presentation owner for extension status icons. Producer extensions call `ctx.ui.setStatus()` with plain text only. `pi-statusline` reads `${PI_CODING_AGENT_DIR:-~/.pi/agent}/pi-statusline-settings.json` and applies icons by Pi status key.

Proposed config shape:

```json
{
  "extensionStatusIcons": {
    "caffeinate": "☕",
    "goal": "🎯",
    "pisync": "☁️",
    "unknown-error-retry": "",
    "plan-mode": "📝",
    "subagents": "🤖"
  }
}
```

Semantics:

- Missing key: use `pi-statusline`'s built-in icon for that status key, or `🔌` for unknown keys.
- String value: use that exact string as the icon.
- Empty string: render the status text with no icon.
- `PI_STATUSLINE_PRESET` remains the only preset configuration path.
- During the deprecation phase, if JSON does not configure `caffeinate`, `pi-statusline` may still use the leading emoji emitted by `PI_CAFFEINATE_ICON` for compatibility.

Precedence during the deprecation phase:

1. JSON `extensionStatusIcons[key]`, including `""`.
2. A leading emoji already present in the producer status text, for `PI_CAFFEINATE_ICON` compatibility.
3. `pi-statusline`'s built-in default icon map.
4. Unknown-key fallback `🔌`.

## Non-Goals

- Do not add per-state icons such as separate `retryingIcon` and `receivingIcon` in this phase.
- Do not add settings loaders to every producer extension.
- Do not change `pi-statusline`'s main statusline segment emoji, only extension status icons.
- Do not include deprecated extensions in the first pass.

## Assumptions

- It is acceptable that users without `pi-statusline` see plain status text instead of emoji-prefixed status text, except `pi-caffeinate` during the deprecation phase.
- `PI_CAFFEINATE_ICON` remains as a deprecated compatibility path for at least one release cycle because it is a documented feature.
- `pi-statusline-settings.json` is local config only unless a separate future change teaches `pi-sync` to sync extension config files.

## Plan

- [x] Add a `pi-statusline-settings.json` loader in `extensions/pi-statusline/src/statusline.ts` that reads from `getAgentDir()`, validates `extensionStatusIcons`, and ignores invalid fields; verify with focused `extensions/pi-statusline/test/statusline.test.ts` cases for missing, valid, and invalid config.
- [x] Add a built-in extension icon map in `pi-statusline` keyed by status key (`caffeinate`, `goal`, `pisync`, `unknown-error-retry`, `plan-mode`, `subagents`, `firecrawl`, `chrome-devtools`, `codex-usage`, `lsp`) and update `formatExtensionStatus()` so JSON overrides, `""` suppression, leading-emoji compatibility, default icons, and unknown-key fallback work; verify with tests for each precedence branch.
- [x] Remove producer-owned emoji from active extensions except the deprecated `PI_CAFFEINATE_ICON` compatibility path by changing status strings in `pi-goal`, `pi-sync`, `pi-plan-mode`, `pi-retry`, `pi-subagents`, `pi-firecrawl`, `pi-chrome-devtools`, and `pi-codex-usage` to plain text; verify with `rg -n "setStatus\([^\n]*(🎯|📝|🔁|📥|🔄|🧑|🔥|🌐|📊)" extensions/*/src` returning no active producer hits outside `pi-statusline`.
- [x] Keep `PI_CAFFEINATE_ICON` in `pi-caffeinate` as a deprecated compatibility path that warns once per session when set and explains the `pi-statusline-settings.json` replacement; verify with `extensions/pi-caffeinate/test/caffeinate.test.ts`.
- [x] Update affected tests to assert plain producer statuses, deprecated `PI_CAFFEINATE_ICON` behavior, and centralized `pi-statusline` icon rendering; verify with `npm test -- --workspace @narumitw/pi-statusline`, `npm test -- --workspace @narumitw/pi-caffeinate`, and the touched package tests or `npm test`.
- [x] Update READMEs for `pi-statusline` and affected producer extensions: document `pi-statusline-settings.json`, mark `PI_CAFFEINATE_ICON` as deprecated rather than removed, and show `""` for no icon; verify with `rg -n "PI_CAFFEINATE_ICON|deprecated|pi-statusline-settings|extensionStatusIcons|status icon" README.md extensions/*/README.md`.
- [x] Run full verification after implementation; verify with `npm run check`.

## Risks

- Removing `PI_CAFFEINATE_ICON` immediately would be a breaking change; mitigate by keeping it for at least one release cycle with a deprecation warning and README migration guidance to `pi-statusline-settings.json`.
- Some status keys are less obvious than package names (`pisync`, `unknown-error-retry`); mitigate with a documented default map and examples.
- Empty icon rendering can accidentally leave extra spacing; mitigate with explicit `pi-statusline` tests for no-icon output.

## Completion Checklist

- [x] Producer extensions emit plain status text except deprecated `PI_CAFFEINATE_ICON`, verified by source grep and updated package tests.
- [x] `pi-statusline` owns default, custom, suppressed, and compatibility leading-emoji extension status icons, verified by `extensions/pi-statusline/test/statusline.test.ts`.
- [x] JSON config behavior and `PI_CAFFEINATE_ICON` deprecation/migration are documented, verified by README grep and source review.
- [x] The repo passes `npm run check` after all changes.

## Completion Evidence

- `npm test -- --workspace @narumitw/pi-statusline`, `npm test -- --workspace @narumitw/pi-caffeinate`, `npm test -- --workspace @narumitw/pi-goal`, and `npm test -- --workspace @narumitw/pi-codex-usage` passed after the status icon changes.
- `npm run check` passed after all implementation and docs updates.
- `rg -n "setStatus\([^\n]*(🎯|📝|🔁|📥|🔄|🧑|🔥|🌐|📊)" extensions/*/src` returned no producer status hits; remaining status emoji are centralized in `pi-statusline` or its main statusline segments.
- README docs now cover `pi-statusline-settings.json`, `extensionStatusIcons`, empty-string icon suppression, and `PI_CAFFEINATE_ICON` deprecation.
