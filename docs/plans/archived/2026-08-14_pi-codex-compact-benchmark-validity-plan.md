# Pi Codex compact benchmark validity plan

## Goal

Make the repository-only benchmark reproducible, protocol-locked, replication-aware, and statistically honest enough for confirmatory use without changing the published extension runtime.

## Context

The current harness is useful for diagnostics, but review found four validity problems.

Dry runs and live runs use different token estimators, so they generate different fixture hashes.

The runner can mark changed densities or reused seeds as primary-eligible without a locked protocol artifact.

Each fixture has only one compaction artifact per arm, so opaque allocation variance can dominate the result.

The summary identifies seeds as the independent unit but calculates paired distributions over density-by-seed fixtures.

The retained `matched-tail-same-fixtures-gpt-5.6-sol.json` result is diagnostic evidence with SHA-256 `526bebd0833528e2dfab8a7203e65a5e9ac4cfbbb9e23a36f7ecba362ab6afc7`.

Its matched-tail seeds 301–304 and outcomes have been inspected, so those seeds must never be called held-out again.

The benchmark self-test will remain a documented manual check and will not be added to CI, following the explicit project decision.

## Architecture

- `benchmark/core.mjs` will continue to own fixture generation, exact scoring, and descriptive aggregation.
- A new `benchmark/protocol.mjs` will own canonical protocol manifests, validation, SHA-256 identity, conformance checks, and evidence labels.
- `benchmark/run.mjs` will use one SDK estimator-backed fixture plan for dry and live execution and will record runtime provenance and deviations.
- Tracked manifests under `benchmark/protocols/` will lock confirmatory model, profile, fresh seeds, calibrated densities, context target, thinking levels, repetition counts, and calibration evidence hash before provider calls.
- Results will distinguish machine-verifiable `protocolConformant` status from the human provenance decision to call evidence primary.
- Trial records will contain repetition identity, balanced request order, artifact-level quality, and seed-level grouping.
- Summary output will keep question-level counts descriptive and make seed-level paired deltas the primary statistical unit.

## Non-Goals

- Do not change `pi-codex-compact` runtime settings, checkpoint behavior, package metadata, or published files.
- Do not claim that Pi 20K and Codex 20K have equal information capacity or representation efficiency.
- Do not claim that a 50K synthetic manual-compaction study represents automatic compaction near the model context limit.
- Do not replace exact scoring with an LLM judge.
- Do not add the benchmark self-test or live provider work to CI.
- Do not run paid calibration or confirmatory calls without a separate explicit user authorization after request count and cost exposure are reviewed.

## Assumptions

- The primary quality estimand is end-to-end state recovery after each product path, including its normal compaction-generation variance.
- Three independent compaction-and-probe repetitions per arm and fixture are the minimum confirmatory replication level.
- Eight fresh confirmatory seeds across two calibrated densities are the target independent sample unless the approved cost gate requires a smaller explicitly downgraded diagnostic study.
- Calibration may inspect calibration-only seeds, but it must not inspect fresh confirmatory outcomes.
- The existing matched-tail result remains unchanged and is documented as diagnostic rather than rewritten into a new schema.

## Resolved Unknowns

- A compacted linear in-memory branch can be cloned into isolated probe sessions without carrying an earlier probe response into later contexts; provider-free lifecycle coverage verifies ID remapping and deep-cloned checkpoint details.
- Calibration found zero evaluator disagreements or parse failures, so the locked protocol uses one probe per confirmatory artifact.
- Calibration selected density 120 as the shoulder and density 160 as the stress point before fresh confirmatory fixtures were generated.
- The locked confirmatory plan contains 240 requests, projects $78.682920 recorded cost from calibration, and proposes a $100 between-fixture guard; the user chose not to execute it.

## Risks

- Repetition can multiply provider use substantially, so dry-run output must expose exact request counts and live execution must retain the between-fixture cost guard.
- A hosted model update can change behavior under the same model ID, so every result must record measurement time, Pi dependency versions, Node version, source revision when available, model metadata, and protocol hash.
- A protocol manifest cannot prove that a person never inspected a seed, so the runner must report conformance rather than automatically asserting held-out provenance.
- Full-context or fixed-artifact probe disagreement can make compression comparisons uninterpretable, so evaluator reliability needs an explicit blocking threshold.
- `run.mjs` is already close to 1,000 lines, so protocol and configuration logic must move to focused modules instead of extending the monolith.

## Plan

- [x] Added provider-free checks in `benchmark/self-test.mjs` for estimator parity, manifest mismatch rejection, changed-density non-conformance, consumed-seed metadata, repetition grouping, and seed-level paired summaries; each behavior slice first failed on its missing or legacy implementation and now passes.
- [x] Extracted protocol constants and validation into `benchmark/protocol.mjs`; `run.mjs` remains below 1,000 lines, and malformed, unknown-field, duplicate-seed, consumed-seed, invalid-density, short-seed, and unsupported-version manifests fail closed.
- [x] Replaced automatic `primaryEligible` calculation with `protocolConformant`, `protocolSha256`, `deviations`, `humanPrimaryClaim: false`, and diagnostic or confirmatory-candidate classification; no CLI-only run can claim held-out primary status.
- [x] Made a protocol manifest authoritative for confirmatory fields and rejected locked CLI overrides while preserving operational credentials, output, timeout, delay, live, and cost-guard options.
- [x] Marked seeds 301–304 as consumed and preserved the existing diagnostic result byte-for-byte at SHA-256 `526bebd0833528e2dfab8a7203e65a5e9ac4cfbbb9e23a36f7ecba362ab6afc7`.
- [x] Refactored dry-run planning to use Pi SDK `estimateTokens`; all eight comparable dry-run fixture hashes matched the preserved live fixture hashes.
- [x] Recorded benchmark, fixture, protocol, Node, Pi dependency, extension package, Git source, dirty-state, model, and estimator provenance in dry and live results.
- [x] Added deterministic repetition IDs and balanced compaction and three-arm probe ordering; the self-test proves equal position counts over a complete two-density, three-repetition seed block.
- [x] Implemented configurable independent end-to-end repetitions with fail-closed sessions, cancellation guards, per-session cleanup, and atomic fixture checkpoints; protocol manifests require at least three artifacts per arm and fixture.
- [x] Added linear active-branch cloning with ID remapping and deep-cloned checkpoint details; the provider-free lifecycle test proves isolated pre-probe context equivalence.
- [x] Added evaluator-reliability calibration through repeated full and fixed-artifact probes and a locked parse-failure or exact-disagreement gate.
- [x] Restructured v3 result JSON so probes nest under artifacts and arms within density-and-seed trials while preserving request order, usage, latency, stop reason, hashes, and exact scores without opaque content.
- [x] Changed primary quality analysis to seed-level paired deltas with all seed values, median, MAD, mean, and deterministic seed-clustered bootstrap bounds while keeping question totals descriptive.
- [x] Added artifact distributions, per-fixture variance, parse failures, evaluator contexts, failed contexts and fixtures, and descriptive output-token correlation.
- [x] Reported realized input, output, downstream footprint, latency, and estimated cost beside nominal settings and set `equalInformationCapacity` to `false`.
- [x] Added `contextRegime`, scoped 50K evidence to controlled manual compaction, and kept context-scale work explicitly diagnostic.
- [x] Updated benchmark and package documentation with manifests, consumed seeds, repetitions, seed statistics, estimator parity, evaluator gates, claim scope, privacy, cost, and evidence labels.
- [x] Updated preserved-result documentation and PR #757 so the tracked v2 result is diagnostic, seeds 301–304 are consumed, and the v3 calibration remains diagnostic evidence.
- [x] Ran `node packages/pi-codex-compact/benchmark/self-test.mjs`, dry-run protocol and altered-control smokes, targeted Biome checks, `git diff --check`, `npm run check`, and `just pack codex-compact`; 374 test files and 3,758 tests passed, and the 10-file package tarball excluded the benchmark.
- [x] Produced `benchmark/protocols/CALIBRATION-V3.md` from a zero-network dry run with three exact fixture hashes, one artifact repetition, three evaluator probes, 33 provider requests, a $20 between-fixture guard, and the intended output path.
- [x] Obtained explicit user approval for the documented 33-request calibration and $20 between-fixture guard before making any live provider request.
- [x] Completed all 33 calibration requests for three fixtures within $10.348713 recorded cost; retained the diagnostic evidence at SHA-256 `23b7e0197a7a921e5e155591b80ce911ccdf07edfc9f37c62f700691e65dad19`; verified full-context and evaluator gates; selected densities 120 and 160; generated eight unseen seed identifiers; and created the final confirmatory protocol manifest before execution.
- [x] Produced a zero-network confirmatory dry run from committed source revision `d8a2149e6d332d4465ce61d638920e548a66e3e5`; verified all 16 fixture hashes, canonical protocol SHA-256 `5d2e1a6e0c4c45c9a4824e76e5d498c5c99e35365418029ee399e912ad851a10`, 240 requests, the proposed $100 between-fixture guard, clean tracked inputs, a tracked unchanged manifest, and no consumed seeds; and recorded the review in `benchmark/protocols/CONFIRMATORY-V3-PREFLIGHT.md` before requesting separate live-run approval.
- [x] Not applicable: the user chose not to authorize or execute the paid 240-request confirmatory run after reviewing its sampling basis, $78.682920 calibration-based projection, and proposed $100 between-fixture guard; no confirmatory provider request was made, and the committed protocol and zero-network preflight remain available for a separately approved future study.
- [x] Audited the implementation diff against `docs/extension-conventions.md`, confirmed `docs/extension-settings.md` remains inapplicable, and scanned the complete benchmark for estimator divergence, false primary labels, unlocked controls, consumed seeds, pseudo-replication, unclosed sessions, and non-atomic result writes.
- [x] Archived this completed implementation plan after the approved calibration completed and the user explicitly declined the separately gated confirmatory execution.

## Completion Checklist

- [x] Dry and live planning produce identical fixture hashes under the same estimator and protocol.
- [x] Changed densities, reused seeds, altered locked controls, incomplete runs, failed full-context controls, evaluator failures, and dirty tracked inputs cannot be represented as conformant completed candidates.
- [x] The runner never automatically claims that protocol-conformant evidence was genuinely held out.
- [x] Confirmatory manifests require at least three independent artifacts per arm, fixture, and seed.
- [x] Evaluator reliability is measured and can block interpretation.
- [x] Paired quality uncertainty is calculated at the seed level rather than treating questions or density fixtures as independent.
- [x] Nominal 20K settings, realized footprints, and unequal-capacity limitations are explicit in JSON and documentation.
- [x] The 50K study is described as controlled manual compaction, and broader context-scale claims require separate evidence.
- [x] The existing matched-tail result remains unchanged, tracked, and clearly diagnostic.
- [x] No live provider call occurred without a reviewed dry run and explicit approval.
- [x] Manual benchmark checks, repository checks, package packing, semantic audits, and implementation diff review pass.
- [x] The completed plan is archived under `docs/plans/archived/` with calibration, manifest, checks, the declined confirmatory execution, and the absence of v3 confirmatory evidence recorded.
