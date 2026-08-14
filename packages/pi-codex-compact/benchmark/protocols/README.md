# Confirmatory protocol manifests

A protocol manifest turns a reviewed calibration decision into immutable machine-checked controls.

Do not create the final manifest until calibration evidence is complete, retained, and hashed.

Commit the manifest before making any confirmatory provider request.

A manifest has this shape:

```json
{
  "schemaVersion": 1,
  "protocolId": "matched-tail-confirmatory-v3-<date>",
  "benchmarkId": "pi-codex-compact-comparison:v3",
  "createdAt": "<UTC ISO timestamp>",
  "calibrationEvidenceSha256": "<64 lowercase hex characters>",
  "model": "gpt-5.6-sol",
  "profile": "matched-tail",
  "seeds": ["<eight fresh increasing integer seeds>"],
  "densities": ["<locked shoulder>", "<locked stress>"],
  "questionsPerCategory": 15,
  "epochs": 10,
  "fixtureTargetTokens": 50000,
  "compactionThinkingLevel": "medium",
  "probeThinkingLevel": "low",
  "compactionRepetitions": 3,
  "probesPerArtifact": 1,
  "evaluatorDisagreementThreshold": 0.02,
  "contextRegime": "controlled-manual-50k"
}
```

The placeholder example is documentation and is not a valid executable manifest.

The manifest validator rejects unknown fields, duplicate values, unsorted lists, consumed seeds 301–304, unsupported profiles, and invalid ranges.

The following controls remain operational CLI options and are not locked by the manifest:

- `--agent-dir`
- `--output`
- `--timeout-ms`
- `--request-delay-ms`
- `--max-cost-usd`
- `--live`

A conformant completed run is only a confirmatory candidate.

Human review must verify that the manifest commit predates execution, the seeds were not inspected, calibration selected the densities, all planned work completed, and no provider-side change invalidated the comparison.

The current locked protocol is `matched-tail-confirmatory-v3-2026-08-14.json`.

Its reviewed zero-network execution plan is in `CONFIRMATORY-V3-PREFLIGHT.md`.
