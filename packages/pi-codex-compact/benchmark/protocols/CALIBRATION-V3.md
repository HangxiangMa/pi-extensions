# Benchmark v3 calibration preflight

This preflight is diagnostic and makes no held-out or primary claim.

It was generated without provider requests from benchmark `pi-codex-compact-comparison:v3`.

## Locked preflight controls

- Model: `openai-codex/gpt-5.6-sol`.
- Profile: matched-tail Pi 20K and Codex 20K nominal settings.
- Context regime: controlled manual 50K.
- Calibration seed: 111.
- Densities: 120, 160, and 200.
- Questions: 15 per category and 75 per fixture.
- Compaction repetitions: one artifact per arm and fixture.
- Evaluator probes: three isolated probes per artifact and three full-context probes per fixture.
- Compaction thinking: medium.
- Probe thinking: low.
- Evaluator disagreement threshold: 2%.
- Retries: disabled.
- Planned fixtures: 3.
- Planned provider requests: 33.
- Between-fixture estimated-cost guard: $20.
- Intended output: `packages/pi-codex-compact/benchmark/results/calibration-v3-matched-tail-gpt-5.6-sol.json`.

The cost guard is not a strict invoice cap because one in-flight fixture may finish after the recorded estimate crosses $20.

## Fixture identities

| Fixture | Estimated tokens | SHA-256 |
| --- | ---: | --- |
| `multi-state-compaction-recall:v2:s111:d120` | 50,055 | `d4e2abdc2f88befc85ce4d2b75636de0b73da65240ff2ffda6a396db6fa716ed` |
| `multi-state-compaction-recall:v2:s111:d160` | 50,055 | `3ece76b7a9971107bfd44993215ef2700dd47992497229105081435d877997f8` |
| `multi-state-compaction-recall:v2:s111:d200` | 50,055 | `26678f5c2401303ec1ec26664ee3f3442c9aab5dba8d4e6ac5ad2da3226fa4e4` |

## Approved command template

Do not run this command until the user separately approves the 33 requests and $20 between-fixture guard.

```bash
just benchmark-codex-compact \
  --live \
  --suite calibration \
  --repetitions 1 \
  --probes-per-artifact 3 \
  --max-cost-usd 20 \
  --output packages/pi-codex-compact/benchmark/results/calibration-v3-matched-tail-gpt-5.6-sol.json
```

After an approved run, verify every fixture completed, full-context answerability passed, evaluator disagreement stayed at or below 2%, and the result file was atomically published before using it to choose confirmatory densities.
