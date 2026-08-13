# pi-usage Codex Fast mode plan

## Goal

Add one persistent Codex Fast preference to `@narumitw/pi-usage` that users can toggle with `/fast` or from `/usage`, and apply the same effective state to official OpenAI Codex requests without changing other providers.

## Context

- `packages/pi-usage/src/usage.ts` currently owns `/usage`, provider usage state, status publication, and session lifecycle, and it is already 979 lines.
- Pi 0.84.1 exposes `before_provider_request`, but the hook receives only the serialized payload and not the provider's `serviceTier` option.
- Codex represents Fast with request value `service_tier: "priority"` and explicit standard routing with `service_tier: "default"`.
- The inspected Codex catalog currently exposes Fast for `gpt-5.4`, `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`, but not `gpt-5.4-mini` or older catalog entries.
- Codex describes Fast as approximately 1.5× faster with increased plan usage, so every enabling surface must make the usage consequence visible.
- This change touches command, menu, settings, provider-request, lifecycle, status, documentation, and release conventions.
- Execution started on `feat/pi-usage-codex-fast` from `main` at `a18694ee`, with the pre-existing untracked plan preserved.

### Touched-area MUST map

- Command changes must document and test every accepted route and mode, reject arguments and unsupported modes observably, and preserve `/usage` compatibility through tests and README review.
- Settings changes must use `getAgentDir()`, keep missing reads side-effect free, validate runtime values, preserve unknown fields, block invalid-file overwrite, serialize dependent reads and writes, publish atomically, and prove failure recovery through tests and review.
- Lifecycle changes must start session work at `session_start`, abort or release owned work, await settings durability at `session_shutdown`, and revalidate generations and contexts after asynchronous boundaries through tests and review.
- Menu changes must continue using `@narumitw/pi-tui-kit`, keep cancellation side-effect free, avoid TUI-only calls outside TUI, and prove RPC plus TUI behavior through tests.
- Status changes must reuse and clear the exact `usage` key on model changes, replacement, failure, and shutdown through lifecycle tests and review.
- Published-behavior changes must add a package Changeset, retain the canonical entrypoint and package boundaries, pass `npm run check`, and receive package and local-load smoke evidence.

## Architecture

- Add `packages/pi-usage/src/settings.ts` as the sole owner of the user-level `pi-usage.json` document and a `codexFastMode` boolean whose code default is `false`.
- Store settings only at `<getAgentDir()>/pi-usage.json` because Fast is an account-wide consumption preference, not a project-owned policy.
- Keep missing-file reads side-effect free, validate the whole JSON object, preserve unknown fields, reject malformed files, serialize in-process reads and writes, publish with temporary-file-plus-rename, retain the previous effective state on failure, and expose a shutdown durability boundary.
- Add `packages/pi-usage/src/codex-fast.ts` as the single owner of Fast-capable model IDs, official-Codex eligibility, `priority` versus `default` payload rewriting, labels, and toggle behavior.
- Treat Fast as effective only for an `openai-codex` model using `openai-codex-responses` at the official `https://chatgpt.com` origin and present in the explicit supported-model set.
- Rewrite only object payloads, preserve every unrelated payload field, send `priority` when Fast is effective, and send `default` for an eligible official Codex request when Fast is off or the selected Codex model does not support Fast.
- Leave non-Codex providers, custom Codex origins, incompatible APIs, and malformed payloads unchanged.
- Register bare `/fast` as the frequent direct action, reject arguments, support observable TUI and RPC notifications, and reject print and JSON modes before mutation.
- Show current Fast state and one dynamic `Turn Fast mode on/off` action in the existing `/usage` root menu when Codex is current, with an unavailable or read-only explanation for unsupported models or invalid settings.
- Keep `/usage` as one shallow menu because the new contextual toggle keeps the action count at seven or fewer and does not justify a separate settings screen.
- Reuse the existing `usage` status key and add a `fast` marker only while Fast is effective instead of creating another permanent status channel.
- Apply a successful toggle to the next provider request that has not already been sent, while an in-flight HTTP request remains unchanged.
- Keep `usage.ts` below 1,000 lines by exposing narrow Fast helpers from the new module, or extract a coherent existing responsibility if integration would cross the limit.

## Non-Goals

- Do not add Fast support to direct OpenAI API, GitHub Copilot, OpenRouter, custom Codex proxies, or unsupported Codex models.
- Do not read or modify Codex CLI `config.toml` or depend on the local Codex checkout at runtime.
- Do not add project settings, environment-variable overrides, keyboard shortcuts, `/usage` arguments, or `/fast on|off|status` subcommands.
- Do not replace or wrap the complete built-in `openai-codex` provider solely to bypass a missing Pi request-option API.
- Do not promise an exact quota multiplier because provider plan accounting can change independently of the extension.

## Assumptions

- Fast defaults to Off for backward compatibility and persists across Pi sessions after the first explicit toggle.
- The explicit supported-model set is intentionally conservative and will require maintenance when Codex adds another Fast-capable model.
- A global toggle remains stored while another provider or unsupported Codex model is selected and becomes effective again after returning to a supported official Codex model.
- In-process settings operations are ordered, but separate Pi processes are not claimed to be mutually serialized.
- `/usage` continues to require TUI or RPC mode, while `/fast` follows the same supported-mode boundary.

## Unknowns

- Pi's post-serialization payload hook may not preserve correct session cost accounting when Codex echoes `service_tier: "default"`, because Pi's priority-tier fallback currently reads the provider option rather than the rewritten payload.
- A deterministic source probe and, when credentials permit, one live Codex smoke must resolve that accounting question before the user-facing command is shipped.
- If the installed Pi extension API cannot express Fast without inaccurate accounting, implementation must stop and record the required upstream Pi request-option capability instead of shipping a partial provider override.

## Risks

- Another extension can rewrite `service_tier` later in load order, so tests can prove this extension's output but cannot guarantee final ownership across arbitrary third-party extensions.
- A stale supported-model set can hide Fast for a new model or incorrectly offer it after Codex removes support.
- A failed or concurrent settings write can otherwise leave the menu, statusline, and request hook disagreeing unless all three read one committed runtime state.
- Session replacement or shutdown during a toggle can otherwise publish stale UI or lose an accepted write unless cancellation, generation checks, and the settings flush boundary are coordinated.
- Adding Fast behavior directly to `usage.ts` can cross the repository's 1,000-line source limit and further mix provider mutation with usage orchestration.

## Rollback / Recovery

- Turning Fast off writes `codexFastMode: false` and sends explicit `service_tier: "default"` for eligible official Codex requests.
- Uninstalling or disabling `pi-usage` removes the request hook, and the unused `pi-usage.json` field remains harmless.
- A patch rollback may remove `/fast`, the `/usage` action, and the request hook while retaining settings parsing so an existing forward-compatible file is not corrupted.
- Invalid settings remain untouched and read-only until the user repairs or removes `pi-usage.json`.

## Plan

- [x] Trace a Fast request through installed Pi 0.84.1 and Codex response accounting before adding product surfaces; deterministic source and provider regressions prove the payload hook emits `priority`, Pi can echo `default`, and `message_end` corrects the same 2× or GPT-5.5 2.5× accounting without double charging.
- [x] Record the supported Fast model IDs from `/Users/narumi.chen/personal/codex/codex-rs/models-manager/models.json` in one tested `packages/pi-usage/src/codex-fast.ts` constant; `codex-fast.test.ts` accepts exactly the five advertised Fast models and rejects `gpt-5.4-mini`, Codex Spark, incompatible APIs, and custom origins.
- [x] Implement `packages/pi-usage/src/settings.ts` with default-Off normalization, side-effect-free load, unknown-field preservation, invalid-file protection, private atomic writes, an unpoisoned in-process queue, and `flush()`; `settings.test.ts` covers missing, valid, malformed, invalid, oversized, symlink, first-save, permission repair, unknown-field, aborted-save, failed-save, and serialized-update cases.
- [x] Implement pure Fast eligibility and payload rewriting in `packages/pi-usage/src/codex-fast.ts`; `codex-fast.test.ts` proves `priority`, `default`, field preservation, original-payload immutability, unsupported-model fallback, unchanged non-Codex or malformed payloads, scoped status labeling, and cost correction.
- [x] Integrate settings reload, invalid-file warnings, request-hook registration, cancellation, and settings flush through `packages/pi-usage/src/codex-fast-runtime.ts` without factory-time session work; runtime tests cover startup, replacement, shutdown, stale loads, invalid files, failed write recovery, and the shutdown durability boundary.
- [x] Register `/fast` through the shared Fast state and persistence path; runtime tests cover bare toggle on and off, exact argument rejection, supported and unsupported models, custom origin, invalid settings, save rollback, TUI/RPC notifications, print/JSON rejection before mutation, and before-versus-after request capture.
- [x] Add the shared Fast state and one dynamic action to the `/usage` root menu; menu tests cover Off, unavailable, invalid-file, successful save, and cancellation, while the existing Kit menu retains action ownership and session-generation guards after awaits.
- [x] Extend status publication to render `codex fast …` only when Fast is effective; focused unit and lifecycle tests cover immediate refresh, model eligibility, failed-save rollback, replacement, and existing exact-key shutdown cleanup.
- [x] Extract small orchestration helpers and the Fast runtime so `packages/pi-usage/src/usage.ts` remains 990 lines; all 77 focused package tests pass, including usage queries, reset redemption, cache isolation, provider selection, cancellation, and status refresh.
- [x] Update `packages/pi-usage/README.md` with `/fast`, the `/usage` toggle, supported modes and models, the increased-usage warning, default and persistence path, user-only scope, reload behavior, official-origin boundary, concurrency scope, invalid-file recovery, limitations, and package layout while retaining existing badges and standard sections.
- [x] Add `.changeset/fast-crabs-respond.md` as a minor Changeset for `@narumitw/pi-usage`; `npm run changeset:status -- --verbose` reports the intended package and also names the two unrelated pre-existing Changesets separately.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, the review skill, and the hardening edge-case checklist; command modes, settings ordering/recovery, menu cancellation/disposal, session replacement/shutdown, post-await ownership, provider origin/model boundaries, sanitized model display, request-tier capture, cost accounting, and the 990-line `usage.ts` disposition are covered by code, tests, or documented residual risks.
- [ ] Run `npm exec vitest -- run packages/pi-usage/test`, `npm run typecheck --workspace @narumitw/pi-usage`, `npm run check:boundaries`, `npm run check`, and `git diff --check`; focused tests pass 77/77, workspace typecheck, boundaries, Biome, and diff checks pass, but two full `npm run check` attempts remain red because unrelated `pi-subagents`, `pi-sync`, and `pi-worktree` timing/path tests fail under repository-wide parallel load even though a representative 20-test rerun passed in isolation.
- [x] Run `just pack usage` and inspect the tarball for the new source, README, license, and canonical entrypoint, then run a non-interactive local Pi entrypoint load; the dry-run contains 17 intended files, `pi --list-models -e ./packages/pi-usage` exits 0, print-mode `/fast` rejects without creating settings, and real OAuth-backed GPT-5.4 smokes capture `priority` with Fast On and `default` with Fast Off.

## Completion Checklist

- [ ] `/fast` and `/usage` read and update one committed persistent Fast preference.
- [ ] Supported official Codex requests send `priority` when effective and `default` otherwise without mutating unrelated payload data.
- [ ] Unsupported providers, APIs, models, origins, and non-interactive command modes fail safely without changing settings.
- [ ] Fast state and increased-usage consequences are visible in the command notification, `/usage`, README, and effective Codex statusline.
- [ ] Settings loading, validation, ordering, atomic publication, rollback, unknown-field preservation, shutdown durability, and concurrency scope have deterministic evidence.
- [ ] Cancellation, disposal, in-flight toggles, model changes, stale sessions, replacement, and shutdown have deterministic lifecycle evidence.
- [ ] Existing provider usage, reset redemption, caching, selection, and status behavior remain covered and passing.
- [ ] The provider accounting unknown is resolved or explicitly accepted as an upstream blocker before release.
- [ ] The minor Changeset, package tarball inspection, focused tests, root CI-equivalent gate, diff check, and applicable runtime smoke are complete.
- [ ] The fully executed plan is moved to `docs/plans/archived/2026-08-13_pi-usage-codex-fast-mode-plan.md` only after every item above has evidence.
