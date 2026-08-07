# Pi Chat persistent room dock plan

## Goal

Make a joined Pi Chat room persistently visible while the normal Pi editor remains the default input target, and make the dedicated chat composer unmistakable without adding a global shortcut or unsupported mouse interaction.

## Context

The final design keeps `/chat` menu-first. A joined room gains an adaptive dock above the Pi editor, and the connected menu's first action opens a clearly labeled full custom composer. Existing direct join routes, settings, identity data, unknown fields, privacy modes, and session-owned networking remain compatible. A compact floating composer was implemented and deterministically tested, then rejected during user acceptance as harder to use and replaced with the prior full-view presentation.

## Architecture

- `widget.ts` owns responsive read-only dock rendering and keeps legacy `count`, `latest`, and `off` modes intact while adding `dock`.
- `chat-view.ts` owns the focused full custom composer, explicit input-target labeling, responsive transcript viewport, and externally retained draft.
- `chat-session.ts` publishes whether the composer is open so the dock always reports the real input target.
- `pi-chat.ts` owns session-scoped draft state, first-use display choice, full custom-view invocation, and lifecycle cleanup.
- `menu.ts` keeps `/chat` menu-first and presents Reply as the first connected action while preserving the existing shallow controls.
- `settings.ts` accepts the additive `dock` value and preserves old documents and unknown fields.

## Non-Goals

- Generic mouse hit-testing or Pi core changes.
- A global keyboard shortcut or new focus command.
- Auto-rejoin, persistent chat history, offline delivery, delivery receipts, or model-context integration.
- A permanently focused or transcript-obscuring side overlay.

## Risks

- The dock consumes terminal rows; rendering must collapse predictably at low height and narrow width.
- Overlay focus or disposal could leak across session replacement; every continuation must revalidate ownership and cleanup must retain no task or stale draft.
- Showing multiple messages is a privacy change; only the new `dock` mode may do so, and legacy modes must retain their existing disclosure level.
- A send attempted with no direct peer must retain the draft without creating a misleading delivered state.

## Plan

- [x] Add failing settings and first-use tests for additive `dock` support, legacy mode compatibility, atomic display/identity persistence, cancellation, and unknown-field preservation; focused run failed in three intended assertions (`dock` rejected/missing and cancelled selection still joined).
- [x] Implement `dock` settings normalization and first-use display selection in `settings.ts` and `pi-chat.ts`; focused settings/lifecycle run passed 10 tests.
- [x] Add failing dock rendering tests for joining, empty, connected, degraded, input-target, privacy modes, message limits, CJK/control sanitization, and representative widths/heights; focused run failed in the intended missing dock and composer-state assertions.
- [x] Implement the adaptive persistent dock in `widget.ts` plus composer-open snapshot state in `chat-session.ts`; focused widget/session run passed 11 tests.
- [x] Add failing composer tests for explicit target labels, retained drafts, successful clearing, zero-peer preservation, Escape/disposal focus release, IME forwarding, and narrow/low layouts; focused runs failed for the missing target label, retained draft, and view state.
- [x] Implement the responsive full custom composer and session-owned draft integration in `chat-view.ts` and `pi-chat.ts`; focused component and custom-view lifecycle tests pass. A later red/green acceptance correction proved and removed compact overlay options while preserving the composer behavior.
- [x] Update the connected menu's primary label/state presentation while keeping `/chat` menu-first and all existing controls/routes; menu tests failed before the change and now pass.
- [x] Open the full chat composer immediately after a confirmed public-room join from either the menu or `/chat #slug`. A later red/green hardening pass found that closing the join menu aborted the already-started transport; startup signals are now released after startup, while cancellation during startup still tears down partial resources.
- [x] Update `packages/pi-chat/README.md` for the dock, first-use display choice, composer workflow, no mouse/shortcut claim, responsive/privacy behavior, and one-extension local launch command; package formatting passes.
- [x] Audit async cancellation, disposal, session replacement, shutdown, settings ordering/rollback, privacy disclosure, and narrow-terminal behavior against `docs/extension-conventions.md` and `docs/extension-settings.md`; no accepted convention deviation. The composer subscription disposes, session ownership is revalidated after awaits, drafts clear with room lifecycle, settings publish once after confirmation, and legacy privacy modes retain disclosure semantics.
- [x] Run focused package tests repeatedly, `npm run check`, `just pack chat`, Changesets status, and a local Pi entrypoint smoke; evidence is recorded below.

## Completion Checklist

- [x] A joined room remains visible in every non-hidden display mode and `dock` shows bounded recent messages without obscuring the Pi transcript.
- [x] The dock and composer always state whether input targets Pi/LLM or the room without relying on color.
- [x] `/chat` remains the no-argument manager; Reply is first when connected; direct join routes remain compatible.
- [x] Chat drafts survive closing/reopening and zero-peer attempts, clear only after a successful broadcast, and clear on confirmed leave/session shutdown.
- [x] Existing `count`, `latest`, and `off` settings retain disclosure semantics; old documents and unknown fields remain valid.
- [x] Joining, cancellation, errors, partial connectivity, responsive layouts, IME/focus, lifecycle cleanup, and destructive confirmations have deterministic evidence.
- [x] Documentation and package contents match shipped behavior.
- [x] Repository CI-equivalent verification is green and the completed plan is archived.

## Execution Evidence

- Red/green cycles: settings/first-use failed in 3 intended assertions before implementation; dock/composer state failed in 3 intended assertions; composer behavior failed in 2 intended assertions; menu behavior failed in 3 intended assertions. The public-join follow-up failed in 3 intended assertions: menu and direct routes did not open chat, and aborting the completed join action left two peers permanently undiscoverable. All focused cycles ended green.
- Focused package suite: the original 41 tests passed three consecutive runs; the final 42-test suite, including the public-join signal regression, also passes (`node --test` over every compiled `packages/pi-chat/test/*.test.js`).
- Package checks: `npm run check --workspace @narumitw/pi-chat` passed Biome and TypeScript.
- Full repository: final `npm run check` passed in a temporary clean clone with 2,424 tests. The linked worktree's root Biome phase cannot include user-owned untracked `test1/` and `test2/`; those identity directories were read only for the authorized two-client smoke and were not modified or staged.
- Package smoke: `just pack chat` passed with 15 expected files, 27.1 kB packed and 94.1 kB unpacked.
- Release intent: `npm run changeset:status` reports `@narumitw/pi-chat` minor to `0.1.0`.
- Entrypoint smoke: `pi -e ./packages/pi-chat --list-models` loaded successfully and returned 8 model lines.
- Real public-DHT smoke: the two distinct identities from `test1/` and `test2/` joined `#pi` after the first join action's signal was aborted, converged to one authenticated peer each, and delivered one message end to end.
- Manual interactive composer and mouse behavior were not exercised because the agent harness cannot open an interactive TUI. Component, Pi-context, absence-of-overlay-options, focus, IME, disposal, width, height, and lifecycle harnesses cover the supported extension path; the design intentionally claims no mouse interaction.
