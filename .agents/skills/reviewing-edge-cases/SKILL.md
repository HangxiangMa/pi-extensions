---
name: reviewing-edge-cases
description: Stress-test a code change before formal review by building a risk matrix, probing boundary and interaction cases, and adding focused regression tests and minimal fixes when implementation is requested. Use for PR preflight, edge-case audits, reviewer simulation, or requests to find what reviewers may catch; do not use as a substitute for a general code review.
---

# Reviewing Edge Cases

Simulate a skeptical reviewer after the primary behavior works. Find plausible failures at boundaries and at intersections between state, input, lifecycle, and representation.

## Operating Mode

Infer authority from the request:

- For an audit, review, or diagnosis request, inspect and report only.
- For a preflight, hardening, fix, or implementation request, add focused failing tests first when practical, make the smallest justified fixes, and verify them.
- Do not post comments, resolve threads, commit, push, or otherwise write externally unless explicitly requested.

Read the diff, affected implementation, existing tests, contracts, and repository instructions before judging behavior. For non-trivial work, check repository memory or equivalent project notes when instructed.

## Workflow

### 1. Establish the change contract

Write down:

- intended behavior and explicit non-goals;
- changed inputs, outputs, state transitions, and trust boundaries;
- compatibility and cancellation expectations;
- relevant invariants from tests, types, APIs, and documentation.

Do not broaden the product behavior merely to satisfy hypothetical cases.

### 2. Map the changed surface

Trace each changed value through parsing, normalization, storage, transformation, rendering, and publication. Include callers and consumers immediately adjacent to the diff, especially across `await`, callbacks, process boundaries, or serialization.

Load [the edge-case checklist](references/edge-case-checklist.md) and select only applicable domains.

### 3. Build a bounded risk matrix

Cross the few dimensions most likely to interact:

- representative inputs, including boundaries and hostile forms;
- operations or user actions;
- before/during/after states;
- lifecycle events such as cancellation, retry, replacement, and teardown;
- representations such as source text, bytes, display cells, and serialized form.

Rank cases:

- **High**: security, data loss, corruption, hangs, irreversible actions, or broken core behavior.
- **Medium**: realistic incorrect behavior, inaccessible controls, compatibility regressions, or stale state.
- **Low**: cosmetic or implausible cases with bounded impact.

Test high-risk intersections first. Avoid exhaustive Cartesian products and speculative platform cases without evidence.

### 4. Prove findings

For each candidate:

1. Trace the concrete failure path.
2. Check whether existing validation or tests already prevent it.
3. Reproduce with the smallest deterministic test or command.
4. Reject findings based only on naming preference, unsupported assumptions, or unreachable states.

When editing is authorized, follow red-green-refactor:

1. Add one focused regression that fails for the expected reason.
2. Make the smallest production change that passes it.
3. Refactor only when it improves the changed path.
4. Run the focused test before broader gates.

Prefer invariant-oriented tests over assertions coupled to implementation details. Add fuzz or property-based coverage only when the input space is broad, the invariant is crisp, and deterministic examples are insufficient.

### 5. Re-review the fix

Perform one fresh reviewer pass over the resulting diff:

- look for equivalent encodings or delimiter variants;
- check both directions and both ends of ranges;
- verify cancellation and stale-state behavior at every asynchronous boundary;
- distinguish source units from bytes, code points, graphemes, terminal cells, and wrapped rows;
- check that tests would fail if the defect returned;
- inspect adjacent same-pattern sites once, rather than waiting for comment-by-comment discovery.

Stop after this bounded second pass unless new evidence reveals a materially different failure class.

### 6. Verify proportionately

Run, in order when available:

1. focused regression tests;
2. affected package tests and type checks;
3. repository lint/format checks;
4. the CI-equivalent suite for implementation work;
5. packaging or runtime smoke tests when the change affects publication or integration.

Report commands and outcomes. Label checks not run and why.

## Output

Lead with confirmed findings, highest severity first:

```text
Risk: High
Location: path/to/file.ts:123
Case: Selection ends at column 0 of the next line
Expected: Preserve the crossed newline
Observed: Output drops the newline
Evidence: Focused regression or concrete trace
Action: Minimal fix or recommended test
```

Finish with:

- risks covered;
- regression cases added or proposed;
- checks run;
- unresolved assumptions or unverified risks;
- readiness: ready, ready with caveats, or not ready.

If no actionable issue remains, say so directly and identify the most material evidence gaps.

## Checklist Maintenance

Update `references/edge-case-checklist.md` only when work reveals a verified, reusable failure class not already represented. Add one concise general rule, not project names, incident history, or one-off details. Do not modify the checklist during read-only review unless the user also requested skill maintenance.
