# Pi Codex compaction benchmark plan

## Goal

Add a reproducible benchmark under `packages/pi-codex-compact/` that compares Pi-native plaintext compaction with Codex Remote Compaction V2 on latency, estimated USD cost, and post-compaction recall quality.

## Context

The benchmark will use Pi's SDK with the same `openai-codex` model, synthetic session fixture, system prompt, thinking level, tool set, retry policy, and run count for both arms.

The native arm will load no extensions.

The Codex arm will load only `packages/pi-codex-compact/src/index.ts` and must reject silent fallback to Pi-native compaction.

Quality will use deterministic exact-match probes over facts stored in old assistant messages, because the Codex checkpoint is opaque and cannot be graded directly.

Live provider calls will require an explicit flag, and cost values will be labeled as Pi model-catalog estimates rather than subscription invoices.

## Architecture

- `packages/pi-codex-compact/benchmark/core.mjs` will own fixture generation, exact-match scoring, argument-independent statistics, and result summarization.
- `packages/pi-codex-compact/benchmark/run.mjs` will own CLI parsing, isolated SDK sessions, paired alternating arm execution, timing, usage collection, cancellation, and JSON output.
- `packages/pi-codex-compact/benchmark/README.md` will define metrics, fairness controls, commands, cost caveats, and interpretation limits.
- Focused provider-free smoke commands will validate fixture placement, scoring, statistics, paired comparison, and dry-run safety because repository test-isolation rules exclude benchmark tooling from production TDD boundaries.

## Assumptions

- "Pi compact" means Pi's built-in plaintext summarization on the same selected `openai-codex` model.
- "Codex compact" means this extension's Remote Compaction V2 path, not Codex CLI's full context-window lifecycle.
- Compaction latency and compaction-call usage are primary speed and cost metrics.
- The next probe's latency, usage, and exact recall are reported separately and as an end-to-end total.
- Production-profile retained-tail defaults remain visible in result metadata; a matched-tail profile will be available to isolate compaction implementation effects.

## Risks

- Provider load and stochastic generation can dominate small samples, so raw paired runs, medians, and median absolute deviations will be retained.
- OAuth subscription billing can differ from catalog estimates, so the benchmark will not call estimates actual charges.
- A synthetic recall fixture measures state retention, not every coding-task outcome, so documentation will keep the quality claim narrow.
- A remote entitlement or protocol failure can fall back silently, so the Codex arm will fail closed when checkpoint details are absent.
- Live runs spend quota and transmit the synthetic transcript to OpenAI, so dry-run is the default and no live run will be performed without explicit execution.

## Applicable convention gates

- Documentation MUST retain the package README's standard sections and accurately describe privacy, limits, and verification.
  Verification: review `packages/pi-codex-compact/README.md` and `benchmark/README.md`.
- Changed behavior SHOULD have deterministic verification, while external-provider behavior uses the smallest representative smoke.
  Verification: provider-free core and dry-run smokes plus `npm run check`; live smoke remains explicit because it spends provider quota.
- The benchmark MUST isolate extension loading and reject unintended fallback so results compare the named arms.
  Verification: dry-run/configuration smoke and review of the SDK arm setup and checkpoint assertion.
- Every asynchronous benchmark session MUST clean up on completion, failure, and process cancellation.
  Verification: review abort/disposal paths and focused subprocess cancellation or dry-run tests where practical.
- No package metadata or published runtime behavior is intended to change, so no Changeset or pack smoke is required unless implementation expands the package `files` list or manifest behavior.

## Plan

- [x] Added `benchmark/core.mjs` with a deterministic old-state fixture and exact-match quality scoring; a provider-free smoke checked 30K, 48K, and 180K fixtures, user-message non-leakage, retained-tail placement, perfect and malformed scoring, statistics, and paired deltas.
- [x] Added `benchmark/run.mjs` with safe CLI parsing, dry-run default, paired alternating native/remote SDK arms, fail-closed remote detection, timing, usage, cost, cancellation, shutdown, disposal, and temporary-path cleanup; matched-tail dry runs made no provider call.
- [x] Added raw and summarized compaction latency, estimated USD cost, post-compaction input size, probe latency/cost, exact recall, end-to-end totals, and paired Codex-minus-native differences; the provider-free core smoke verified numeric aggregation.
- [x] Documented production and matched-tail profiles, reproducible commands, metric boundaries, privacy, cost, and interpretation in `benchmark/README.md` and the package README.
- [x] Added a safe `just benchmark-codex-compact` entry; `just --list` exposed it and a two-pair matched-tail invocation remained a dry run.
- [x] Ran provider-free benchmark smokes, package formatting/checks, and `npm run check`; the final gate passed all 374 files and 3,758 tests after two unrelated `pi-worktree` timing/UI flakes passed on focused reruns. After completion, the user explicitly authorized a five-pair `gpt-5.4-mini` production-profile live run, which completed without fallback or provider failure.
- [x] Audited the final diff against `docs/extension-conventions.md`; no extension settings behavior, package `files` list, entrypoint, or published runtime behavior changed, and `just pack codex-compact` confirmed the benchmark remains repository-only.

## Completion Checklist

- [x] Both arms use the same fixture, model, thinking level, tools, retry policy, and paired run index.
- [x] The Codex arm cannot be reported when it fell back to native compaction.
- [x] Speed, estimated cost, and exact recall quality are all present in raw and summarized JSON.
- [x] Default invocation makes zero provider calls and clearly shows how to opt in.
- [x] Provider-free benchmark smokes and `npm run check` pass.
- [x] Documentation states that quality is synthetic exact recall and USD is an estimate, not an invoice.
- [x] The completed plan is archived with verification evidence reflected in checked tasks.
