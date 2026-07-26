# Pi Image Drop menu redesign

## Goal

Make `/image-drop` a side-effect-free TUI menu whose primary **Open staging page** action alone starts or reuses the browser service, while adding visible status, shallow help/settings flows, atomic compatible settings saves, tests, and documentation.

## Plan

- [x] Add failing command-flow tests proving menu cancellation has no side effects, Open starts the service, unsupported modes reject safely, and unused-link rotation is confirmed. Evidence: the first TDD compile failed because `showMainMenu` did not exist; focused lifecycle tests now pass.
- [x] Implement a width-safe, keyboard-accessible Image Drop menu and connect it to `ImageDropRuntime`; verify focused lifecycle/menu tests. Evidence: menu tests pass at 20, 40, 80, and 120 columns with Escape/Ctrl+C coverage.
- [x] Add failing settings tests for unknown-field compatibility, atomic saves, cancellation/failure preservation, and validation; implement queued settings persistence and the approved settings flows. Evidence: the settings test compile initially failed because `saveSettings` did not exist; focused persistence and lifecycle tests now pass.
- [x] Add status/help state and navigation tests, including empty/partial/disabled/error states and narrow-width rendering; implement the shallow subviews and actionable feedback. Evidence: focused menu/lifecycle tests cover cancellable loading, partial/queued summaries, model/policy state, and last-valid-state refresh failure.
- [x] Update `extensions/pi-image-drop/README.md` for the menu-first command, settings UI, state behavior, compatibility change, and non-TUI behavior.
- [x] Run focused tests, `npm run check`, `just pack image-drop`, and a bounded local Pi load smoke; record evidence. Evidence: 1,513 root tests pass, pack contains 23 intended files, and RPC-mode Pi load started and shut down the extension cleanly.

## Completion Checklist

- [x] `/image-drop` opens only the menu; cancelling starts no server, rotates no link, and writes no settings.
- [x] Open, status, settings, help, back, close, confirmation, failure, responsive rendering, keyboard navigation, and compatibility behavior are covered.
- [x] Confirmed settings writes are atomic and serialized, preserve unknown fields, and retain the previous valid state on failure.
- [x] Existing browser staging, startup automation, draft/history, image processing, and manual JSON workflows remain passing.
- [x] Documentation matches the shipped behavior and all required verification passes.
