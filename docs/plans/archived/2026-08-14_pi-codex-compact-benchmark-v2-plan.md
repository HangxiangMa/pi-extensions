# Pi Codex compaction benchmark v2 plan

## Goal

Strengthen the repository-only benchmark so quality conclusions come from answerable, fixed-length, multi-seed fixtures across realistic state categories and history positions, while preserving paired speed and estimated-cost measurements.

## Context

The current benchmark repeats one 13-fact fixture and has no uncompressed control, density calibration, held-out seeds, or category and epoch analysis.

The revised method will adapt the useful controls from `/home/narumi/workspace/pi-openai-server-compaction/benchmarks/product-defaults` without changing the extension runtime or replacing its real Pi SDK and `openai-codex` OAuth execution paths.

The production profile compares shipped retention policies under a controlled no-retry protocol, while matched-tail remains a narrower diagnostic.

## Architecture

- `packages/pi-codex-compact/benchmark/core.mjs` will own seeded fixed-length fixtures, five quality categories, post-compaction questions, exact scoring, and grouped and paired summaries.
- `packages/pi-codex-compact/benchmark/run.mjs` will own dry-run planning, three isolated SDK arms, rotated compaction and evaluation order, latency and usage capture, cost guarding, cancellation, and JSON evidence.
- `packages/pi-codex-compact/benchmark/self-test.mjs` will provide a deterministic provider-free benchmark smoke outside the published runtime and repository production-test boundary.
- `packages/pi-codex-compact/benchmark/README.md` will define exploratory, calibration, and held-out confirmatory workflows and prevent nested question outcomes from being described as independent samples.

## Non-Goals

- Do not change extension settings, package metadata, or published runtime behavior, and do not add benchmark artifacts to the tarball.
- Do not claim equal information capacity for the production profile.
- Do not add an LLM judge or semantic score that can hide exact-state errors.
- Do not perform a live provider run without a separate explicit request.

## Risks

- A full confirmatory suite can consume material quota, so dry-run remains the default, `--live` remains explicit, and a between-fixture estimated-cost guard will stop additional trials.
- Structured multi-question output can fail despite answerable context, so an uncompressed full-context control will expose evaluator or fixture failures.
- Codex retains user-role text differently from Pi, so expected values will stay out of historical user messages while realistic tool results and assistant state remain represented.
- Questions within one fixture share a model response and are nested under a seed, so reporting will identify independent seed count and avoid question-level independence claims.
- Provider latency and cache state remain noisy, so raw trial order and paired deltas will remain available.

## Applicable convention gates

- Changed benchmark behavior MUST have deterministic verification when practical.
  Verification: `node packages/pi-codex-compact/benchmark/self-test.mjs`, dry-run CLI smokes, and `npm run check`.
- Every asynchronous SDK flow MUST release sessions on success, failure, cancellation, and partial setup.
  Verification: review all session creation and cleanup paths plus dry-run and repository checks.
- Documentation MUST accurately state privacy, cost, retention-policy scope, controlled retry behavior, external-provider limits, and statistical independence.
  Verification: review both benchmark and package READMEs.
- Repository-only tooling may omit a Changeset and MUST remain outside the package tarball.
  Verification: manifest review and `just pack codex-compact`.

## Plan

- [x] Added a deterministic provider-free self-test that initially failed because v1 did not export the five-category contract; it now verifies seeded fixed-length generation, category and epoch coverage, no expected-value leakage into user messages, post-compaction-only questions, exact scoring, answerability failure, and grouped paired analysis.
- [x] Replaced the v1 fixture and summary core with deterministic 50K-token density fixtures and summaries for independent seeds, density, category, epoch, per-fixture full-context control, and paired outcomes; the self-test and Pi SDK estimator smoke passed at densities 120, 160, 180, and 200.
- [x] Refactored the live runner into full-context, Pi-native, and Codex-remote arms with separately rotated request order, medium compaction thinking, low probe thinking, fail-closed remote detection, request spacing, incremental evidence, cancellation revalidation, session shutdown, and a between-fixture cost guard.
- [x] Added exploratory, calibration, and held-out confirmatory CLI suites with deterministic defaults, custom overrides, primary-evidence eligibility metadata, and exact dry-run request accounting; the three suites planned 5, 15, and 40 provider requests without contacting OpenAI.
- [x] Updated benchmark and package documentation with the strengthened method, calibration-to-holdout workflow, controlled no-retry scope, metric interpretation, nested-sample caveat, commands, and cost and privacy boundaries.
- [x] Ran the provider-free self-test, all suite dry runs, targeted Biome checks, `npm run check`, and `just pack codex-compact`; the root gate passed 374 test files and 3,758 tests, and the 10-file tarball excluded `benchmark/`. A later explicit user request authorized the live calibration and confirmatory suites; both completed without fallback, the full-context controls passed 825/825, and recorded Pi-catalog cost estimates totaled $20.8336.

## Completion Checklist

- [x] Full context evaluates each scored fixture under the same evaluator, and one sub-98% fixture blocks primary eligibility.
- [x] Pi and Codex receive the same seeded history, post-compaction questions, model, tools, retry policy, and probe thinking level.
- [x] Quality reports overall, density, category, epoch, seed, and paired Codex-versus-Pi outcomes.
- [x] Speed and estimated cost remain available per trial and in summaries.
- [x] Calibration and confirmatory defaults use disjoint documented seeds, and calibrated density overrides remain explicit and predeclared.
- [x] Default invocation makes zero provider calls, and live execution has an estimated-cost guard.
- [x] No settings, published runtime, or package manifest changed, and the benchmark artifacts remained outside the tarball; only the packaged README documentation changed.
- [x] All required provider-free and repository checks passed, and the explicitly authorized paid calibration and confirmatory paths completed successfully.
