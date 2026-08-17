# Pi Fleet automatic terminal selection plan

## Goal

Make `defaultTerminal: "auto"` the Pi Fleet built-in default so an omitted `session_spawn.terminal` resolves the current supported terminal backend at launch time, while explicit backend choices remain strict and predictable.

## Context

- `packages/pi-fleet/src/settings.ts` currently accepts only `tmux`, `ghostty`, and `zellij`, with `tmux` as the built-in default.
- `packages/pi-fleet/src/fleet-controller.ts` currently resolves the configured value directly and preflights only that adapter.
- `packages/pi-fleet/src/menu.ts` currently passes the configured backend as if it were an explicit spawn override.
- `packages/pi-fleet/README.md` currently promises a tmux default, Ghostty and Zellij opt-in behavior, and no automatic backend probing or fallback.
- The change touches the settings, menu, command tool, asynchronous launch, documentation, testing, and published-behavior rules in `docs/extension-conventions.md` and `docs/extension-settings.md`.

## Architecture

- Define a terminal preference as `"auto" | "tmux" | "ghostty" | "zellij"`, while keeping a resolved launch backend limited to `"tmux" | "ghostty" | "zellij"`.
- Resolve `auto` synchronously for every launch from the current process environment before creating a group, launcher, socket, or split.
- Select tmux when `TMUX` is non-empty and `TMUX_PANE` is a valid pane id, otherwise select Zellij when `ZELLIJ` is non-empty and `ZELLIJ_PANE_ID` is valid, otherwise select Ghostty when `TERM_PROGRAM` is `ghostty`.
- Use tmux before Zellij and Zellij before Ghostty when multiple complete environment signatures are present, and document this deterministic nested-terminal precedence.
- Run `assertAvailable()` only for the resolved backend so version, platform, executable, focus, and permission checks remain adapter-owned.
- Fail before launch side effects when no backend can be resolved or when the resolved adapter is unavailable, without probing another backend.
- Keep explicit `session_spawn.terminal` values strict, exclude `auto` from the tool schema, and let explicit values bypass automatic resolution.
- Return and display the resolved concrete backend in confirmation text, status, tool results, and launch errors without rewriting the saved `auto` preference.

## Non-Goals

- Do not make `session_bus` spawn or discover arbitrary Pi processes.
- Do not add terminal fallback after adapter preflight, split creation, child startup, or kickoff delivery begins.
- Do not inspect the process tree to infer the innermost nested multiplexer.
- Do not add project settings, environment-variable overrides, durable migration state, or cross-process settings locking.

## Assumptions

- `auto` becomes the built-in default, while existing user files that explicitly contain `tmux`, `ghostty`, or `zellij` remain pinned to that backend.
- No settings migration is required because existing valid documents remain valid and a previously rejected `auto` value can become valid in place.
- An automatic Ghostty selection may perform the existing macOS Automation availability check, and the README will describe that behavior.

## Risks

- Nested multiplexers can expose more than one valid environment signature, so deterministic precedence may select an outer backend rather than the visually innermost pane.
- Changing the missing-file default from tmux to auto changes published behavior, so the release requires a Pi Fleet minor changeset and clear compatibility notes.
- Menu code can accidentally turn `auto` into an explicit backend value, so controller ownership of final resolution must be covered by menu and spawn integration tests.
- Availability or cancellation failures must remain pre-split failures so automatic group rollback and lifecycle cleanup retain their current guarantees.

## Plan

- [x] Add behavior-contract tests in `packages/pi-fleet/test/settings.test.ts`, `terminal.test.ts`, `spawn.test.ts`, `menu.test.ts`, and `tools.test.ts` for the new built-in default, accepted `auto` setting, environment precedence, missing-context errors, strict explicit overrides, concrete results, menu delegation, and exclusion of `auto` from the tool enum; focused Vitest ran on 2026-08-17 and produced 14 expected pre-implementation failures at the new contracts.
- [x] Update `packages/pi-fleet/src/terminal.ts` and `packages/pi-fleet/src/settings.ts` to separate terminal preferences from resolved backends, validate `auto`, label it as `Automatic`, and resolve complete environment signatures deterministically; 9 focused settings and terminal tests passed on 2026-08-17.
- [x] Update `packages/pi-fleet/src/fleet-controller.ts` so omitted tool input resolves the current setting on each launch, automatic detection has no launch side effects, only the selected adapter is preflighted, explicit input stays strict, and every existing post-`await` session and cancellation guard remains intact; all 16 spawn tests passed after hardening empty explicit input on 2026-08-17.
- [x] Update `packages/pi-fleet/src/menu.ts` so Settings exposes `Automatic`, Status and Help describe the preference accurately, and New Pi session omits the backend override while allowing the controller to show the resolved backend in the final confirmation; all 10 menu tests passed across TUI and RPC paths on 2026-08-17.
- [x] Audit `packages/pi-fleet/src/tools.ts` descriptions and schema so omission clearly follows automatic or pinned settings while `terminal` continues accepting only concrete overrides; all 8 tool tests passed on 2026-08-17.
- [x] Update `packages/pi-fleet/README.md` to document the `auto` default, exact environment signatures and precedence, pinned and explicit override behavior, Ghostty Automation implications, no-context errors, and the rule that no fallback occurs after resolution or preflight.
- [x] Add a minor Changeset for `@narumitw/pi-fleet` describing automatic terminal selection and compatibility for existing pinned settings; `changeset status` resolved only `auto-fleet-terminals` for Pi Fleet as a `0.2.0` to `0.3.0` minor release on 2026-08-17.
- [x] Run focused Vitest for every Pi Fleet test, `npm test`, `npm run typecheck`, and `npm run check`, keeping root checks separate from any `pi-tui-kit` build or check; 21 Pi Fleet files with 104 tests, 344 repository files with 3,427 tests, root typechecks, Biome, boundaries, and the CI-equivalent gate passed on 2026-08-17.
- [x] Run `npm pack --workspace @narumitw/pi-fleet --dry-run --json` and inspect the file list, then perform a local Pi load smoke for `packages/pi-fleet/src/index.ts` without opening an interactive workflow; the dry run contained the expected 23 package files, and an offline RPC `get_commands` smoke loaded the entrypoint and returned the `fleet` extension command on 2026-08-17.
- [x] Audit the final diff against the touched-area checklists in `docs/extension-conventions.md` and `docs/extension-settings.md`, including settings preservation and atomicity, TUI and RPC behavior, explicit tool compatibility, cancellation, session replacement, shutdown cleanup, no post-split fallback, documentation, and the experimental warning; the review found and fixed an empty explicit-terminal fallback regression, then found no remaining correctness, security, lifecycle, compatibility, or same-pattern issues.

## Completion Checklist

- [x] A missing settings file produces `defaultTerminal: "auto"` without creating or modifying the file, as covered by `settings.test.ts`.
- [x] Settings accepts and persists `auto` while preserving unknown fields, ordered writes, failure recovery, private atomic publication, and existing concrete values, as covered by all six settings tests.
- [x] Automatic launches resolve tmux, Zellij, and Ghostty from their documented environment signatures and fail safely when none applies, as covered by terminal and spawn tests.
- [x] Explicit tool and pinned setting choices remain strict and never switch to another backend after availability or launch failure, including invalid empty explicit input and failed selected-adapter preflight.
- [x] Menu, Status, Help, confirmation text, tool output, and README distinguish the saved preference from the resolved concrete backend.
- [x] Focused tests, repository CI-equivalent checks, package inspection, and the local extension load smoke pass with recorded evidence.
- [x] The Pi Fleet minor Changeset is present, and no unrelated package, plan, or generated artifact is changed.
