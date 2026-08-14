# Pi native vs Codex Remote V2 compaction benchmark

This repository-only benchmark compares three paths on the same seeded synthetic coding-agent history:

1. An uncompressed full-context control.
2. Pi-native plaintext compaction.
3. This extension's Codex Remote Compaction V2 path.

It measures whether each fixture is answerable, then compares Pi and Codex on compaction speed, Pi-catalog estimated USD cost, downstream context size, and exact state recovery.

The production profile compares the shipped retention policies under a controlled no-retry protocol, not every runtime default and not equal information capacity.

## Metrics

| Area | Primary metric | Supporting metrics |
| --- | --- | --- |
| Answerability | Full-context exact-recall rate | Parse failures and probe stop reason |
| Speed | Paired wall-clock compaction latency | Probe and compaction-plus-probe latency |
| Cost | Paired compaction `usage.cost.total` | Probe cost, end-to-end cost, and input/output/cache usage |
| Compression quality | Exact matches after compaction | Results by density, category, epoch, seed, and paired question outcome |
| Compression footprint | Probe request input tokens | Compaction output tokens and Pi's local `estimatedTokensAfter` |

Lower latency, estimated cost, and probe input tokens are better.

Higher exact-recall rate is better.

A quality comparison is not primary evidence when any full-context fixture scores below 98%, because that indicates an evaluator, output-format, model, or fixture-answerability problem.

## Fixture design

The fixture version is `multi-state-compaction-recall:v2`.

Each fixture has a deterministic seed, ten history epochs, a fixed target near 50K estimated history tokens, and five state categories:

| Category | What it tests |
| --- | --- |
| `exact_recall` | Exact key-to-value state |
| `relational_state` | Directional source-to-target associations |
| `tool_history` | Exact values returned by historical tool calls |
| `distractor_resolution` | Final corrections instead of superseded candidates |
| `task_continuation` | Current status, receipt, and next-action bundles |

Density means authoritative records per category.

Raising density replaces unrelated filler with authoritative records while keeping total history length nearly fixed.

This changes information load without making difficult fixtures proportionally longer.

Scored questions are selected deterministically across categories and epochs and appear only in the post-compaction probe.

Expected values appear in historical assistant messages or tool results, never in historical user text.

This prevents Codex's retained user-role plaintext from answering a probe without preserving assistant or tool state.

The full-context, Pi, and Codex arms receive identical messages and questions.

## Study suites

| Suite | Seeds | Densities | Questions per fixture | Fixtures | Provider requests |
| --- | --- | --- | ---: | ---: | ---: |
| `exploratory` | 1 | 120 | 15 | 1 | 5 |
| `calibration` | 111 | 120, 160, 200 | 75 | 3 | 15 |
| `confirmatory` | 301–304 | 180, 200 | 75 | 8 | 40 |

The exploratory suite is only a harness and entitlement smoke.

The calibration suite finds a shoulder where at least one compaction path is below ceiling and a stress density where both paths face meaningful information pressure.

The confirmatory defaults are starting values adapted from an earlier related harness.

Inspect this benchmark's own calibration before spending held-out seeds, and override `--densities` before the confirmatory run when its shoulder differs.

Never include calibration scores in confirmatory totals.

Do not inspect or tune against seeds 301–304 before their confirmatory run.

The result marks evidence as primary-eligible only when the locked 50K production-profile protocol and held-out seeds are unchanged, except for densities fixed from calibration, every planned fixture completes, and every full-context fixture passes.

Questions within one fixture share one model response and are nested outcomes.

The independent replications are seeds, not the total number of question rows.

## Safety-first dry runs

From the repository root, preview the exploratory suite without provider requests:

```bash
just benchmark-codex-compact
```

Preview the larger request plans the same way:

```bash
just benchmark-codex-compact --suite calibration
just benchmark-codex-compact --suite confirmatory
```

The direct equivalent is:

```bash
node packages/pi-codex-compact/benchmark/run.mjs --suite exploratory
```

Dry-run output includes fixture hashes and sizes, suite controls, and exact request counts.

It does not require credentials or contact OpenAI.

Run the deterministic provider-free benchmark self-test with:

```bash
node packages/pi-codex-compact/benchmark/self-test.mjs
```

## Live workflow

A live run requires Pi's `openai-codex` OAuth login and Remote Compaction V2 entitlement.

Every fixture makes five provider requests: two compactions and three quality probes.

Start with the exploratory suite:

```bash
just benchmark-codex-compact \
  --live \
  --suite exploratory \
  --output packages/pi-codex-compact/benchmark/results/exploratory-gpt-5.6-sol.json
```

Then run calibration with a modest estimated-cost guard:

```bash
just benchmark-codex-compact \
  --live \
  --suite calibration \
  --max-cost-usd 8 \
  --output packages/pi-codex-compact/benchmark/results/calibration-gpt-5.6-sol.json
```

Choose and write down the shoulder and stress densities before touching held-out seeds.

Run the confirmatory suite once with those fixed densities:

```bash
just benchmark-codex-compact \
  --live \
  --suite confirmatory \
  --densities 180,200 \
  --max-cost-usd 20 \
  --output packages/pi-codex-compact/benchmark/results/confirmatory-gpt-5.6-sol.json
```

Custom seeds and densities are supported for additional predeclared studies:

```bash
just benchmark-codex-compact \
  --live \
  --suite exploratory \
  --seeds 501,502 \
  --densities 140,180 \
  --questions-per-category 15
```

The runner checkpoints `--output` after every completed fixture.

Each checkpoint is written to a same-directory temporary file and atomically renamed so an interrupted write cannot truncate the previous result.

The cost guard is checked between fixtures, so one in-flight fixture can take the estimate past the configured amount.

It stops on the first provider, entitlement, protocol, or validation failure.

It refuses to label a silent Pi-native fallback as Codex.

Run `node packages/pi-codex-compact/benchmark/run.mjs --help` for every option.

## Fairness controls

Both compaction arms use the same current Pi SDK, model, synthetic history, system prompt, retained-tail profile, transport, retry policy, and fixture index.

Pi's current product-default `medium` thinking level is used for compaction.

All three quality probes use `low` thinking to keep the evaluator consistent and reduce evaluation cost.

Tools are disabled during probes, and all Pi summarization, provider, and extension transport retries are disabled.

The runner alternates Pi and Codex compaction order and rotates the three-arm probe order separately.

A 300 ms delay separates provider requests by default.

The uncompressed control receives no compaction request, so only Pi and Codex have comparable compaction latency and cost.

## Profiles

| Profile | Pi retained-tail budget | Codex retained user-text budget | Purpose |
| --- | ---: | ---: | --- |
| `production` | 20K tokens | 64K approximate tokens | Compare shipped retention policies with retries controlled off. |
| `matched-tail` | 20K tokens | 20K approximate tokens | Reduce retained-tail differences for a narrower diagnostic. |

The matched-tail profile still does not make opaque Codex capacity numerically equivalent to Pi plaintext output capacity.

Never set Pi's output budget after observing a paired Codex artifact or vice versa, because that uses one treatment's outcome to configure the other treatment.

## Result interpretation

The JSON retains every fixture, execution order, per-question exact score, usage object, latency, estimated cost, checkpoint size, and fixture hash.

Its summary reports:

- Overall quality for full context, Pi, and Codex.
- Quality by density, category, epoch, and seed.
- Paired outcomes where both matched, only Codex matched, only Pi matched, or both missed.
- Medians, median absolute deviations, minima, and maxima for resource metrics.
- Paired Codex-minus-Pi deltas.
- The number of independent seeds and the nested-question caveat.

A negative Codex-minus-Pi latency or cost delta favors Codex.

A positive Codex-minus-Pi quality delta favors Codex.

The quality probe's input-token count is the best provider-observed approximation of downstream context size in this SDK harness.

Compare quality and footprint together because retaining more context can improve recall while weakening compression.

Exact matching intentionally treats wrong case, punctuation, formatting, or a lost negation as failures.

Inspect raw misses before deciding whether they represent semantic state loss or only formatting sensitivity.

## Cost and privacy

Live runs send only deterministic synthetic transcripts and probes to the OpenAI Codex backend used by Pi.

They do not send repository content or user session data.

The runner reads the selected Pi agent directory's `auth.json` through Pi's model runtime and never copies credentials into result files.

Extension settings and sessions live in a temporary directory that is removed after success, failure, or cancellation.

Opaque compaction content is not stored in results.

Only its SHA-256 hash and byte count are retained.

Reported dollars use the selected model's current Pi catalog rates and returned usage.

They are estimates, not an OpenAI invoice and not a statement about ChatGPT or Codex subscription billing.

## Limits

- Remote Compaction V2 is an undocumented hosted protocol and can change independently.
- Pi and Codex use different compaction representations, so production-profile results compare policies rather than equal capacities.
- Prompt-only JSON conformance can fail because the Pi SDK path does not request a benchmark-specific provider response schema.
- The synthetic benchmark does not measure images, real coding success, repeated compaction, resume, fork, model switching, or tool execution after compaction.
- Provider cache state, load, OAuth tier, model updates, and Pi dependency updates can change latency, usage, and quality across dates.
- Four confirmatory seeds remain a small independent sample even though they produce hundreds of nested question outcomes.
- The Codex arm measures this extension's checkpoint projection, not Codex CLI's complete context-window lifecycle.
