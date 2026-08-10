# pi-accounts native login dialog plan

## Goal

Use Pi's exported native login dialog for `pi-accounts` OAuth flows in TUI mode while preserving named-account policy, RPC behavior, cancellation, and credential safety.

## Context

`pi-accounts` currently translates provider OAuth events into separate extension notifications and prompts.
Pi's native `/login` keeps those events in `LoginDialogComponent` and temporarily uses `ExtensionSelectorComponent` for provider-owned choices.
This is a bounded login-flow UI change and does not change account storage or authentication semantics.

## Architecture

TUI login will run inside one `ctx.ui.custom()` flow backed by Pi's exported `LoginDialogComponent`.
Provider-owned select prompts will temporarily delegate rendering and input to Pi's exported `ExtensionSelectorComponent`, then restore the login dialog.
RPC login will retain the existing `ctx.ui.select()`, `ctx.ui.input()`, and `ctx.ui.notify()` adapter.
The flow will combine menu ownership, dialog cancellation, prompt cancellation, and component disposal into one abort protocol.

## Plan

- [x] Add focused failing tests in `packages/pi-accounts/test/accounts.test.ts` for native dialog rendering, provider-owned selection, Escape cancellation, and disposal/owner cancellation. Evidence: the three new tests initially failed because `loginWithOAuthUI` did not exist, then passed after implementation.
- [x] Update `packages/pi-accounts/src/oauth.ts` and the login call site to use Pi's native dialog only in TUI mode while retaining the current RPC interaction. Evidence: focused TUI tests and the existing RPC account integration matrix pass.
- [x] Update `packages/pi-accounts/README.md` and add a Changeset for the published behavior change. Evidence: `.changeset/calm-accounts-login.md` records a patch release.
- [x] Run focused tests, package typechecking, the repository `npm run check` gate, and a local Pi package load smoke. Evidence: 50 focused tests, all 2,863 repository tests, typechecks, Biome, boundaries, `pi --list-models -e ./packages/pi-accounts`, and the package dry run passed.
- [x] Audit the touched flow against `docs/extension-conventions.md`, including TUI-only guards, width delegation, IME focus, cancellation, disposal, stale owner checks, and non-TUI behavior. Evidence: custom UI is guarded by `ctx.mode === "tui"`; native components own rendering; the wrapper forwards focus; combined abort signals cover Escape, prompts, owner shutdown, and disposal; and `loginAccount` retains its post-await owner checks.

## Completion Checklist

- [x] TUI OAuth URL, device code, waiting, progress, and input states render through Pi's native login dialog.
- [x] Provider-owned select prompts render through Pi's native selector and return to the same login dialog.
- [x] RPC behavior remains deterministic through standard extension UI requests.
- [x] Escape, provider prompt cancellation, owner cancellation, component disposal, session replacement, and shutdown release the active login task without publishing stale credentials.
- [x] Focused and repository-wide checks pass, and runtime loading succeeds.
- [x] The completed plan is archived under `docs/plans/archived/`.
