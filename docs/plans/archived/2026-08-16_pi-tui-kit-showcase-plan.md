# Pi TUI Kit Showcase Plan

## Goal

Add a repository-only interactive showcase that lets maintainers open one Pi command and inspect each public `@narumitw/pi-tui-kit` presentation pattern in a real TUI session.

## Context

`@narumitw/pi-tui-kit` is a reusable library and must not declare `pi.extensions`.

The showcase therefore belongs in a separate private experimental extension package.

The package will use only public Kit exports, so it doubles as a realistic consumer example.

The showcase owns no persistent settings; its settings screen mutates only in-memory demo state.

## Architecture

- Add `packages/pi-tui-kit-showcase/` as a private experimental extension package.
- Keep `src/index.ts` as the required thin default-export forwarder.
- Put the command factory in `src/showcase.ts` and the declarative menu in `src/menu.ts`.
- Register `/tui-kit-showcase` with no arguments as the primary TUI demo route.
- Use `defineMenu()` and `runMenu()` for actions, detail, browse, choice, settings, input, review, and multi-select screens.
- Use standalone `runTask()`, `runConfirmation()`, and `runLiveChoice()` from action handlers so those wrappers are visible from the same menu.
- Keep state in memory per session and abort owned work on session shutdown or replacement.
- Add `just showcase-tui-kit` as the local script that builds Kit and runs only this showcase extension.

## Non-Goals

- Do not publish the showcase package.
- Do not add it to the root stable `pi.extensions` manifest or the default `just dev` extension set.
- Do not deep-import Kit internals.
- Do not add persistent settings, migrations, network calls, or external dependencies.

## Plan

- [x] Review extension and settings conventions, Kit package boundaries, and representative Kit consumers before editing; evidence: `docs/extension-conventions.md`, `docs/extension-settings.md`, `packages/pi-tui-kit/AGENTS.md`, `packages/pi-fleet` metadata and menu patterns were inspected.
- [x] Add a focused failing showcase menu test using Kit's public test boundary; evidence: `npx vitest run packages/pi-tui-kit-showcase/test/showcase.test.ts` failed with `Cannot find module '../src/index.js'` before implementation.
- [x] Add package metadata, README, license, TypeScript config, thin entrypoint, command factory, in-memory state, and menu screens under `packages/pi-tui-kit-showcase/`; evidence: package files exist, `src/index.ts` forwards default export, `src/showcase.ts` lazy-loads `src/runtime.ts`, and `rg` review shows source uses public `@narumitw/pi-tui-kit` exports only.
- [x] Add a `just showcase-tui-kit` recipe without changing `just dev`; evidence: `just --list | rg "showcase-tui-kit|try|dev"` lists the new recipe and the existing `dev`/`try` recipes.
- [x] Run focused package tests and typechecking; evidence: `npx vitest run packages/pi-tui-kit-showcase/test/showcase.test.ts` passed 4 tests, `npm --workspace @narumitw/pi-tui-kit-showcase run typecheck` passed, and `npm --workspace @narumitw/pi-tui-kit-showcase run check` passed.
- [x] Run boundary checks and the repository CI-equivalent gate without concurrent Kit builds; evidence: `npm run check:boundaries` passed with 1 library and 28 active extensions, and `npm run check` passed with 380 files and 3,802 tests.
- [x] Run a package dry-run and a non-interactive Pi entrypoint smoke where practical; evidence: `npm --workspace @narumitw/pi-tui-kit-showcase pack --dry-run --json` produced 7 declared files, and `PI_CODING_AGENT_DIR=$(mktemp -d) pi --no-extensions --no-skills --no-session -e ./packages/pi-tui-kit-showcase --list-models` exited 0 with the expected no-models message.
- [x] Audit the final diff against touched extension conventions, settings non-persistence, Kit runtime boundary, cancellation/disposal, non-TUI behavior, documentation, and verification requirements; evidence: final audit found the package private and experimental, absent from root stable `pi.extensions`, no persistent settings path, lazy Kit runtime loading, session-owner abort tests, RPC unsupported-mode tests, README warning, pack contents, and passing gate evidence.

## Completion Checklist

- [x] The showcase opens from `/tui-kit-showcase` in TUI mode and links to every intended screen or standalone interaction; evidence: focused menu test validates all eight standard screens plus Task loader, Confirmation, and Live choice rows, and the Pi entrypoint smoke loads the package.
- [x] Print and JSON modes do not attempt custom TUI or ad hoc protocol output; evidence: command mode guard throws before runtime loading outside TUI/RPC and writes no direct output.
- [x] RPC mode has an observable unsupported-mode notification rather than starting the visual showcase; evidence: focused command test asserts the notification and proves the runtime loader is not called.
- [x] User cancellation, session shutdown, and replacement abort owned work; evidence: command lifecycle test asserts `session_shutdown` aborts the supplied signal and flips `isCurrent()` false, and menu/standalone flows pass the owner signal into Kit runners.
- [x] The package remains private, experimental, and absent from the root stable `pi.extensions` list; evidence: manifest metadata, unchanged root `package.json`, and `npm run check:boundaries`.
- [x] All required checks and smokes are recorded, or deviations are explicitly named; evidence: focused tests, package check, boundary check, root check, pack dry run, changeset status, diff check, and Pi smoke are recorded; live interactive traversal is intentionally left to `just showcase-tui-kit` because this agent terminal is non-interactive.
