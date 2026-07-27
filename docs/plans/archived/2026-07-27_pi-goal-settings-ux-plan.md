# pi-goal settings UX redesign plan

## Goal

Make Goal safety settings understandable from `/goal` without magic input values: show the active automatic-response policy in the Goal menu, offer explicit Unlimited/Off choices, accept only positive whole numbers in custom limit inputs, and move internal or experimental controls behind a shallow Advanced screen while preserving settings safety and compatibility.

## Plan

- [x] Add focused menu and settings-UI tests for visible Unlimited/capped state, explicit safety choices, positive-integer validation, cancellation, reached-limit confirmation, stale-goal protection, advanced navigation, load/save failure recovery, keyboard behavior, and 40/80/120-column rendering; focused menu/settings run failed in 10 intended behavior assertions before implementation.
- [x] Update `extensions/pi-goal/src/menu.ts`, `src/settings-ui.ts`, and the minimal runtime settings-load state needed to implement the approved information architecture and interaction flows without changing the persisted `number | null` schema; 281 compiled pi-goal tests pass.
- [x] Update `extensions/pi-goal/README.md` to document the final menu, explicit Unlimited/Off choices, positive-number-only custom input, Advanced screen, persistence, and error behavior.
- [x] Run the focused compiled pi-goal tests, pi-goal runtime smoke, `git diff --check`, and the repository `npm run check`; 281 focused tests, the runtime smoke, and the 1,657-test repository gate pass, with final settings/TUI review against `docs/extension-conventions.md` and `docs/extension-settings.md`.

## Completion Checklist

- [x] `/goal` displays `Unlimited` or `used/limit` automatic-response state for an active goal.
- [x] Goal Settings prioritizes Automatic work and the No-progress guard, with Goal tools and the experimental queue under Advanced.
- [x] Unlimited and Off are explicit choices; custom inputs accept only safe whole numbers greater than zero and reject every other value without saving.
- [x] Consequential reached-limit changes preview their immediate pause effect; cancellation and stale-goal changes have no side effects.
- [x] Successful changes save atomically and apply immediately; failures retain the prior valid state and show actionable feedback; invalid files remain untouched.
- [x] Existing numeric/null settings, unknown fields, non-TUI fallback, queue/tool behavior, theme/keybindings, and supported terminal widths remain compatible.
- [x] README and deterministic tests match the final behavior, all required checks pass, and this completed plan is archived here.
