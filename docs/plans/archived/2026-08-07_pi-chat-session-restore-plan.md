# Pi Chat session restore plan

## Goal

Restore the previously remembered room and input surface when Pi starts, while making `/chat` goal-oriented and preserving explicit safety for private bearer invites, destructive leave, compatibility, and settings failure recovery.

## Context

Pi Chat currently persists identity and display preferences but deliberately disconnects and forgets its room on every shutdown. The approved redesign removes the repeated `/chat` → join → `/chat` → reply workflow. Public rooms become remembered after their existing risk confirmation; private rooms remain one-time unless the user explicitly chooses to store the bearer invite. Runtime support remains one active room, while the additive settings shape leaves room for future multi-room support.

## Architecture

- `settings.ts` owns a bounded additive `resume` document containing a room catalog, active room id, and `chat`/`pi` surface. It validates stored room material by reconstructing descriptors, preserves unknown top-level and nested fields, serializes writes, and publishes atomically with private permissions.
- `pi-chat.ts` separates explicit leave-and-forget from lifecycle disconnect, persists successful joins and user-selected surfaces, runs one generation-owned restore task on `session_start`, and retains the prior valid file/runtime state on publication failure.
- `menu.ts` keeps related actions flat, prioritizes public join when empty, shows remembered/restoring/error state where decisions are made, and places destructive leave-and-forget last.
- `chat-view.ts` reports intentional user return separately from host disposal so shutdown cannot overwrite a remembered `chat` surface with `pi`.
- Public direct routes remain compatible; transcript, peers, and drafts remain ephemeral.

## Non-Goals

- Simultaneous multi-room networking or UI.
- Persisted transcript, messages, peer lists, unread counts, or drafts.
- Offline delivery, automatic infinite reconnect, cross-process room coordination, mouse interaction, or new textual subcommands.

## Risks

- Automatically restoring a remembered room creates network activity at startup; only previously confirmed and successfully persisted rooms may restore.
- A stored private invite is a bearer secret; persistence requires an explicit concrete warning and `Join and remember` choice.
- Session replacement or shutdown can race restore, persistence, or custom UI creation; every continuation must revalidate generation and all owned tasks must abort and drain.
- Navigation state and shutdown disposal are different events; only intentional user return may change the remembered surface to `pi`.
- Multiple Pi processes sharing one agent directory remain last-successful-writer-wins, matching the existing documented in-process settings ordering scope.

## Rollback / Recovery

- Old files without `resume` remain valid and produce no startup network activity.
- Restore failures keep the remembered room and expose retry/forget recovery without rewriting settings.
- A failed join-state publication tears down the candidate room and leaves the prior valid document unchanged.
- Explicit leave clears remembered state atomically before disconnecting; publication failure leaves the current room connected and remembered.
- Private `Join once` never writes room material.

## Plan

- [x] Add failing settings tests for public/private remembered rooms, active-room consistency, bounded catalogs, legacy documents, nested unknown-field preservation, field removal, invalid-file protection, ordered writes, and private permissions; TypeScript first failed on the missing model/API, then all 9 focused settings tests passed with the additive `resume` model and mutation protocol.
- [x] Add failing chat-view tests that distinguish intentional Escape/Ctrl+C return from host disposal and remain focus/IME/width safe; TypeScript failed on the missing callback, then all 6 component tests passed with `onReturnToPi` emitted only by user close.
- [x] Add failing lifecycle tests for successful public persistence, direct/menu auto-open, private join-once versus join-and-remember previews, publication rollback, leave-and-forget rollback, and unchanged direct-route compatibility; focused failures covered missing persistence/restore and rollback injection, and the final 14 lifecycle tests pass.
- [x] Add failing startup tests for no saved room, remembered `chat` and `pi` surfaces, waiting peers, restore failure/retry, invalid settings, session replacement, shutdown cancellation, and no stale UI; the generation-owned restore flow now aborts/drains network, persistence, and composer work, and focused lifecycle/widget tests pass.
- [x] Update menu tests and `menu.ts` so disconnected users see public join first, connected state and restart behavior are visible, destructive leave-and-forget is last, and recovery remains shallow with clear Back/Cancel/Close behavior; all 5 focused menu tests pass.
- [x] Update `packages/pi-chat/README.md` with restart behavior, concrete public/private persistence semantics, the additive example, recovery states, lifecycle behavior, compatibility, and ephemeral-data boundaries; package formatting passes.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md` for cancellation, disposal, session replacement, shutdown, write ordering/failure recovery, invalid-file protection, unknown-field preservation, privacy disclosure, TUI focus, and responsive rendering; all owned restore/composer/persistence tasks abort and drain, every post-await continuation revalidates ownership, and no convention deviation was accepted. Cross-process settings remain explicitly last-successful-writer-wins, matching the existing documented scope.
- [x] Run the full focused Pi Chat suite repeatedly, a two-identity public-DHT restore smoke, `npm run check` in a clean clone, `just pack chat`, Changesets status, and the Pi entrypoint smoke; exact evidence is recorded below.

## Completion Checklist

- [x] Restarting Pi restores a remembered public room without user commands and opens chat only when the last intentional surface was chat.
- [x] Private invites are persisted only after an explicit bearer-secret preview; Join once and cancellation perform no room-state write.
- [x] Old settings and unknown fields remain valid; invalid or failed writes preserve the previous file and effective runtime state.
- [x] Restore loading, waiting, success, degraded, error, retry, disabled/empty, cancellation, replacement, and shutdown states have deterministic evidence.
- [x] `/chat` remains menu-first with compatible direct routes, goal-prioritized flat actions, visible consequential state, and destructive actions last.
- [x] Keyboard focus, IME, non-color text cues, narrow/low layouts, Back/Cancel/Close, and disposal behavior remain covered.
- [x] Documentation and packed package contents match the final behavior.
- [x] Repository CI-equivalent verification is green and this completed plan is archived.

## Execution Evidence

- TDD: settings first failed at TypeScript on the missing resume model/API; surface restoration failed by timeout; startup restoration and rollback tests failed on missing persistence/behavior before implementation. Each slice ended green.
- Focused package suite: all 57 Pi Chat tests passed three consecutive final runs, including settings, menus, public/private persistence, restore/retry, replacement, stale shutdown, owner abort, responsive composer/dock, local DHT, and separate-process DHT coverage.
- Package gate: `npm run check --workspace @narumitw/pi-chat` passed Biome and TypeScript.
- Repository gate: final `npm run check` passed in a temporary clean clone with 2,439 tests.
- Real public-DHT restore smoke: two distinct read-only identities from `test1/` and `test2/` restored the same saved public room through extension `session_start`, automatically opened two composers, converged to one authenticated peer each, and delivered a message end to end. User-owned identity directories were not modified or staged.
- Package smoke: `just pack chat` passed with 15 expected files, 30.9 kB packed and 111.7 kB unpacked.
- Release intent: `npm run changeset:status` reports `@narumitw/pi-chat` minor to `0.1.0` through `.changeset/fuzzy-chats-connect.md`.
- Entrypoint smoke: `pi -e ./packages/pi-chat --list-models` loaded successfully and returned 8 model lines.
- Manual physical TUI and cross-NAT startup restore were not available. Component, Pi-context, lifecycle, local public-DHT, width/height, focus, IME, cancellation, disposal, and clean-clone harnesses cover the supported path; no mouse or native screen-reader API is claimed.
