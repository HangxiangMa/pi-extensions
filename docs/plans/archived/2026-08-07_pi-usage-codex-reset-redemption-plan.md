# Pi Usage Codex Reset Redemption Plan

> Approved and executed on `feat/pi-usage-codex-reset-redemption`.

## Goal

Let a Pi user redeem an earned OpenAI Codex usage-limit reset from the existing interactive
`/usage` flow, using the exact ChatGPT account currently resolved by Pi, with fresh availability,
an explicit confirmation, idempotent retry behavior, immediate usage refresh, and no new command
arguments or settings.

## Context

- `pi-usage` already reads `rate_limit_reset_credits.available_count` from
  `GET https://chatgpt.com/backend-api/wham/usage`, but only displays the count.
- Codex source at `/home/narumi/workspace/codex` defines the ChatGPT API contract in
  `codex-rs/backend-client/src/client/rate_limit_resets.rs`:
  - `GET /wham/rate-limit-reset-credits` returns detailed earned resets.
  - `POST /wham/rate-limit-reset-credits/consume` accepts `redeem_request_id` and an optional
    `credit_id`.
  - consume outcomes are `reset`, `nothing_to_reset`, `no_credit`, and `already_redeemed`.
- Codex sends both `Authorization` and `chatgpt-account-id`; Pi's stored OpenAI Codex OAuth
  credential exposes `access` and `accountId`, while Pi's resolved runtime auth exposes the active
  access token. The mutation must require those identities to match.
- The current `/usage` command is menu-only in TUI/RPC mode, has no arguments, and owns a five-minute
  account-fingerprinted cache plus session-scoped cancellation and status refresh.
- Codebase Memory indexing was attempted twice for both repositories and crashed on a file each time.
  This proposal therefore uses targeted source reads and literal searches; implementation must verify
  the cited source contracts directly again if either repository HEAD changes.

## Experience Proposal

### Findings and classification

- Viewing usage and refreshing it remain the primary, read-only flow.
- Redeeming a reset is a secondary, consequential account mutation: it consumes one earned reset and
  therefore requires current-account visibility, fresh server state, and confirmation.
- Selecting among detailed reset credits is progressive disclosure, not a new top-level command.
- Retry after an uncertain transport failure is a recovery flow and must reuse the same logical
  redemption request ID.

### Information architecture and states

1. Keep the existing root `Provider usage` screen. When the current provider is `openai-codex`, add
   `Redeem usage limit reset…` immediately after refresh:
   - enable it with `You have N … available` when the fresh usage report says `N > 0`;
   - disable it with `No usage limit resets available` when the report says `0`;
   - enable it as `Check reset availability` when the summary field is absent;
   - omit it when Codex is merely a configured, non-current provider, so a mutation can never target
     a background account.
2. On activation, resolve and revalidate the current Codex OAuth identity, then load detailed reset
   credits. Show available credits in expiration order with sanitized backend title/description and
   local expiration. If the backend reports only a positive count, offer one generic `Full reset`
   option without a `credit_id`. Show an empty state instead of a picker when fresh availability is
   zero.
3. After selection, show the exact reset title, expiry, effect, and current account/provider context.
   Put `No, go back` before `Yes, use reset` so the safe choice is initially focused in TUI and first
   in RPC. Back/Escape/cancellation before confirmation sends no POST.
4. After confirmation, generate one UUID redemption request ID and run the POST under a visible,
   user-non-cancellable task. Session replacement and shutdown still abort owned work. A retry after
   a transport/server failure reuses the same UUID and selected `credit_id`; choosing a reset again
   after leaving the attempt creates a new UUID.
5. Treat `reset` and `already_redeemed` as success, but distinguish `nothing_to_reset` and
   `no_credit` without claiming success. In every recognized outcome, invalidate Codex cache/backoff,
   force-refresh usage for the still-current account, update the report/statusline, and show the
   refreshed remaining-reset count when available. Unknown or malformed outcomes fail closed.
6. Keep recovery shallow: a failed attempt offers `Try again` and `Back`; a completed outcome offers
   `Back to usage` and `Close`. Print/JSON rejection and all existing cross-provider actions remain
   unchanged.

### Acceptance criteria

- TUI and RPC expose the same labels, order, confirmation, cancellation, result, and retry semantics.
- Backend text is terminal-sanitized and bounded; opaque credit IDs are never displayed or altered.
- Loading, zero-count, summary-only, detailed, success, already-redeemed, nothing-to-reset,
  no-credit, malformed, timeout, cancellation, replacement, and shutdown states are observable and
  deterministic.
- No POST occurs after account/model revalidation fails or after pre-confirmation cancellation.
- Narrow TUI rendering, keyboard focus/order, Escape/Back, and Ctrl+C remain owned by
  `@narumitw/pi-tui-kit`; critical meaning never depends on color.

## Architecture

- Add a small Codex-reset domain module under `packages/pi-usage/src/` to own endpoint paths, bounded
  response parsing, reset-option normalization, consume outcomes, and request payloads. Keep the
  generic authenticated JSON transport separate from provider normalization so read and mutation
  requests share timeout, abort, response-size, redaction, and error behavior without creating a
  `usage.ts`/provider import cycle.
- Add a current-Codex reset-auth resolver that accepts only the official ChatGPT origin, requires a
  Pi-stored OAuth credential, compares its `access` token with Pi's resolved runtime token, validates
  `accountId`, and forwards only `Authorization`, `chatgpt-account-id`, and the existing safe user
  agent. Include the account identifier in the salted fingerprint and redact it from provider errors.
- Keep reset workflow state local to one `/usage` invocation: selected credit, fresh summary/options,
  idempotency key, outcome, and retry error. Never persist credentials, credit IDs, or mutation state
  to disk or session history.
- Revalidate menu generation, selected model, and auth fingerprint after every await that precedes a
  display update or mutation. Revalidate once more immediately before POST. A replaced session,
  changed model/account, disposed component, user cancellation, and shutdown each have separate abort
  paths.
- Continue using declarative Pi TUI Kit screens and `runTask()`; use `cancellable: false` only for the
  confirmed POST, while retaining the parent session signal and stale-owner guard.

## Non-Goals

- No `/usage redeem`, `--redeem`, print/JSON mutation route, automatic redemption, settings, account
  switching, Codex CLI fallback, or support for custom/proxy origins.
- No redemption against a configured-but-not-current Codex account and no support for API-key Codex
  auth; earned resets are a ChatGPT OAuth account feature.
- No changes to Copilot/OpenRouter semantics, cache TTL, statusline format, package dependencies, Pi
  TUI Kit API, or deprecated `pi-codex-usage`.
- No live redemption during tests or smoke verification; deterministic mocked HTTP contracts are the
  safety boundary.

## Assumptions

- The current Codex backend contract and response codes are intentionally consumable by compatible
  clients, despite not being documented as a public OpenAI API.
- A positive summary with unavailable detail rows may be redeemed without `credit_id`, matching the
  official Codex fallback.
- The stored OAuth credential is the account-identity authority only after its access token exactly
  matches Pi's freshly resolved runtime token.
- This is a new published capability and requires a minor Changeset for `@narumitw/pi-usage`.

## Risks

- The undocumented ChatGPT endpoints may change. Strict parsing, bounded responses, recognized
  outcome handling, and actionable errors must fail closed without affecting ordinary usage reads.
- A POST can have an uncertain transport result. Reusing one UUID for in-menu retries prevents
  duplicate consumption; reopening the flow first refreshes server state instead of blindly retrying.
- Auth or model selection can change while detail or consume requests are pending. Post-await identity
  guards and forced post-mutation refresh must prevent stale UI/status publication.
- Adding the workflow directly to the already-large `usage.ts` would blur provider/network/UI
  ownership. Keep provider contracts and normalization in dedicated modules and keep every source
  file below the repository's 1,000-line review threshold.

## Applicable Convention Gates

- Touched areas: existing command/menu behavior, provider auth/network mutation, cache/status state,
  asynchronous UI/lifecycle, tests, README, and release intent. Settings and package dependencies are
  not touched.
- Preserve `/usage` as the only command and reject all arguments and unsupported modes exactly as
  today; verify every TUI/RPC path and unchanged print/JSON behavior.
- Use Pi TUI Kit standard screens/tasks, provide explicit destructive confirmation, make cancellation
  side-effect free before confirmation, and test disposal, replacement, and shutdown independently.
- Keep credentials on official origins, forward only allowlisted headers, redact errors, bound output,
  and keep the extension independently installable.
- Add deterministic tests, run the full CI-equivalent gate, inspect the package dry run, and perform a
  no-provider-traffic Pi load smoke. No settings-guide review is required unless implementation adds
  or changes extension-owned settings.

## Plan

- [x] Add focused failing tests in `packages/pi-usage/test/` for Codex reset auth and HTTP contracts:
  matching/mismatched OAuth identity, official-origin enforcement, exact GET/POST paths and headers,
  optional `credit_id`, UUID reuse, response-size/error redaction, abort/timeout, normalized detail
  ordering/sanitization/fallback, and all consume outcomes. Evidence: the first test compile failed on
  the missing reset exports; the final focused reset suites pass 12/12.
- [x] Implement the bounded shared JSON request path and Codex reset domain/auth modules under
  `packages/pi-usage/src/`; focused contract tests pass and existing provider response-bound,
  cancellation, timeout, and redaction tests remain green.
- [x] Add focused failing `/usage` menu tests for current-only action visibility, positive/zero/unknown
  availability, detailed and summary-only selection, safe-default confirmation, cancellation without
  POST, retry with the same request ID, semantic outcomes, forced report/status refresh, auth/model
  changes, component disposal, session replacement, and shutdown. Evidence: the menu test compile
  first failed on the missing dependency seam, and the replacement test then failed until owned work
  was aborted; final reset-menu coverage passes 7/7.
- [x] Extend `packages/pi-usage/src/usage.ts` with the approved Pi TUI Kit workflow, post-await
  generation/account guards, confirmed non-cancellable task, cache/backoff invalidation, and refreshed
  result state. Existing command/provider tests plus new TUI/RPC and lifecycle tests pass; the file
  remains below the 1,000-line review threshold.
- [x] Update `packages/pi-usage/README.md` for eligibility, selection, confirmation, retry, endpoint
  privacy/security, outcomes, cancellation, and unchanged modes; `.changeset/fresh-codex-resets.md`
  records a minor release and `npm run changeset:status` resolves it to `0.50.0`.
- [x] Run focused tests, package check, boundary validation, and full tests. Evidence: package Biome and
  typecheck pass, boundaries pass for all active packages, focused usage/reset suites pass, the direct
  `npm test` run passed on the initial base, and after rebasing onto current `origin/main` the final
  root gate passed all 2,454 tests.
- [x] Run `npm run check`, `just pack usage`, and a no-provider-traffic Pi RPC load smoke. Evidence:
  the final CI-equivalent gate passed; the 13-file dry run contains README, license, metadata, and all
  declared source including `src/codex-resets.ts`, with no tests or tarball left behind; RPC
  `get_state`/`get_commands` returned two successful responses and exactly one extension-owned
  `usage` command while an unsupported provider prevented usage traffic.
- [x] Audit the final diff against `docs/extension-conventions.md` for command compatibility,
  destructive confirmation, auth/origin safety, TUI/RPC behavior, cancellation/disposal/session
  replacement/shutdown, stale continuations, status/cache ownership, documentation, release intent,
  and named verification methods. Evidence: `/usage` remains the sole argument-free interactive
  route; only matching current OAuth identity reaches POST; safe confirmation, retry identity,
  bounded/sanitized responses, post-await guards, cache refresh, and every lifecycle path have focused
  coverage. No settings changed, no convention deviation was accepted, and no live reset was used.

## Completion Checklist

- [x] Only the currently active, official-origin OpenAI Codex ChatGPT OAuth account can redeem a reset;
  mismatched, API-key, configured-only, changed, or proxy accounts fail before mutation.
- [x] Fresh reset details, summary fallback, option ordering, exact confirmation, safe cancellation,
  idempotent retry, and all backend outcomes behave consistently in TUI and RPC.
- [x] Successful/idempotent redemption invalidates stale Codex state, refreshes the current account,
  updates the statusline/report, and reports the remaining resets without leaking account data.
- [x] Existing `/usage` arguments, unsupported modes, read-only providers, all-provider queries,
  caching, and lifecycle behavior remain compatible.
- [x] Focused tests, full tests, `npm run check`, boundary validation, package inspection, and the
  no-traffic Pi load smoke pass with evidence; no live reset was consumed.
- [x] Every plan item has evidence and the semantic convention audit is complete; archived without
  overwrite at `docs/plans/archived/2026-08-07_pi-usage-codex-reset-redemption-plan.md`.
