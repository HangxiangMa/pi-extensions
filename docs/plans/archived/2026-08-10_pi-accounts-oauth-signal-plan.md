# Fix pi-accounts OAuth login signal

## Context

Issue [#664](https://github.com/narumiruna/pi-extensions/issues/664) is an open, unlabeled bug in `@narumitw/pi-accounts` 0.49.5 with Pi 0.84.1.

The interactive `/accounts` login path runs while Pi is idle, so `ExtensionCommandContext.signal` is `undefined`.

`packages/pi-accounts/src/oauth.ts` forwards that value through an `AuthInteraction`, while Pi's provider login contract requires a non-optional `ProviderAuthInteraction.signal`.

GitHub Copilot reads `interaction.signal.aborted` before its network request and therefore throws `Cannot read properties of undefined (reading 'aborted')`.

The failure was reproduced through `/accounts` and independently against the pinned GitHub Copilot OAuth implementation without making a network request.

The account menu already provides each action with a non-optional signal tied to menu ownership, session replacement, and shutdown, but the login action currently ignores it.

## Goal

Make every `/accounts` provider login receive the menu action's concrete `AbortSignal`, so idle GitHub Copilot login proceeds instead of crashing and stale login work remains cancellable by its owning lifecycle.

## Non-Goals

- Do not change provider selection, account naming, credential storage, activation, refresh, or fail-closed behavior.
- Do not alter Pi's provider implementations or make GitHub Copilot-specific exceptions.
- Do not add new commands, settings, dependencies, or menu screens.
- Do not require a live GitHub login or external entitlement for deterministic verification.

## Plan

- [x] Update `packages/pi-accounts/src/oauth.ts` to type provider-owned login against Pi's `ProviderAuthInteraction` contract and require `createOAuthInteraction` callers to supply a concrete `AbortSignal`; package typechecking passed.
- [x] Update the `login-provider` action and `loginAccount` flow in `packages/pi-accounts/src/accounts.ts` to pass the action-owned signal into `createOAuthInteraction`; `rg` confirms no login path falls back to idle `ctx.signal`.
- [x] Extend `packages/pi-accounts/test/accounts.test.ts` with a regression test where `ctx.signal` is undefined and the provider observes a usable action signal; the focused test failed on both missing-signal assertions before implementation and passed afterward.
- [x] Add lifecycle coverage in `packages/pi-accounts/test/accounts.test.ts` proving session shutdown aborts a pending provider login and prevents stale credential publication.
- [x] Add `.changeset/gentle-accounts-signal.md` as a patch changeset for `@narumitw/pi-accounts`.
- [x] Run the focused account test, package typecheck, and CI-equivalent gate; 31 focused tests, package typechecking, and the post-rebase `npm run check` with 2,798 tests passed.
- [x] Inspect the final diff against `docs/extension-conventions.md`; prompt cancellation, component ownership, session replacement, shutdown, post-`await` freshness checks, and unchanged credential behavior were audited with no required deviation.
- [x] Add the repository's `bug` label to issue #664 after deterministic tests and required checks confirm the reproduced defect is fixed.

## Risks

- A fallback signal that never aborts would stop the crash but leave device-code polling alive after its owner becomes stale, so the implementation must use the existing action-owned signal rather than a detached `AbortController`.
- Cancellation can race with credential normalization or storage, so tests must prove stale completion cannot publish an account after the owner signal aborts.
- Narrowing the local login type could reveal another internal contract mismatch, which should be corrected only where required by Pi's published provider interaction contract.

## Completion Checklist

- [x] Idle `/accounts` login always passes a non-optional `AbortSignal` to every supported provider.
- [x] The GitHub Copilot regression test reaches provider login without the `undefined.aborted` failure.
- [x] Pending OAuth work aborts on the covered lifecycle boundary and does not store or activate stale credentials.
- [x] Existing account login, replacement, switching, storage, and provider-overlay tests remain passing.
- [x] A patch changeset covers `@narumitw/pi-accounts`.
- [x] Focused tests, package typechecking, and `npm run check` pass with recorded command evidence.
- [x] The final diff contains only the plan, implementation, regression tests, and changeset required for issue #664.
- [x] The completed plan is archived under `docs/plans/archived/` only after every checklist item is satisfied.
