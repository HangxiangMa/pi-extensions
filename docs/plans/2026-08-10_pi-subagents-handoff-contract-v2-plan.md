# Pi Subagents Handoff Contract v2 Plan

## Goal

Add one opt-in versioned delegation request and result contract that preserves objectives, authority requests, dependencies, evidence, artifacts, limitations, provenance, and outcome state across blocking, chained, fan-in, detached, persisted, inspected, and rendered subagent flows.

Keep existing free-form text and `structured-v1` behavior compatible when callers omit the new contract.

## Context

The current blocking schema accepts free-form task strings, chain execution substitutes raw previous output into `{previous}`, and fan-in constructs bounded Markdown from worker results.

The current `structured-v1` result is available only as an opt-in stateful completion shape and does not define the request side of delegation.

The repository research notes report that explicit delegation contracts improve evidence sufficiency and reviewability but can increase tokens, wall-clock time, and tool calls.

This phase therefore needs a bounded contract with selectable detail rather than an unconditional verbose default.

## Architecture

`result-contract.ts` will evolve into a delegation-contract boundary or delegate request ownership to a new `delegation-contract.ts` while retaining parsing and compatibility adapters for `structured-v1`.

The request contract will cover version, task identity, objective, non-goals, dependencies, required inputs, requested authority, acceptance criteria, required evidence, and budget references.

The result contract will cover version, status, summary, evidence-backed claims, artifacts, changed paths, verification, limitations, unresolved dependencies, provenance, usage, and truncation.

Contract levels will provide a minimal lookup shape and a full software-change shape without changing the meaning of individual fields.

Structured transfer will remain data rather than proof of enforcement, and requested authority will be labelled advisory until later phases produce an enforceable `ExecutionPlan`.

Validated structured envelopes will be carried in typed details and metadata, while bounded raw output remains the authoritative compatibility fallback for malformed or non-participating agents.

Chain and fan-in will consume structured results when valid and preserve source task, agent, state, evidence, and truncation instead of flattening them into anonymous prose.

## Non-Goals

- Do not enforce capabilities, paths, tools, network access, secrets, or sandbox policy in this phase.
- Do not automatically choose an agent, model, transport, workspace, or concurrency level.
- Do not add a WorkItem DAG or persistent artifact store.
- Do not make the full contract the default for existing payloads.
- Do not reject ordinary text from agents that were not asked for `structured-v2`.
- Do not expose raw chain-of-thought, private context, credentials, or unbounded tool output as evidence.

## Risks

- A large nested tool schema can reduce provider compatibility or increase prompt cost.
- A prompt-only JSON contract can be malformed even when the delegated work is useful.
- Chain and fan-in compatibility can regress if structured transfer replaces the existing raw fallback.
- Evidence fields can create false confidence unless claims remain explicitly observed, inferred, or unverified.
- Contract metadata can leak task text, paths, or private content if bounds and redaction are inconsistent.
- Adding outcome values before enforcement can tempt callers to treat self-reported completion as verified acceptance.

## Rollback / Recovery

- Keep `text` and `structured-v1` parsers and omitted-field behavior unchanged.
- Gate `structured-v2` behind an explicit request and retain raw bounded output on parse failure.
- Keep chain `{previous}` substitution and Markdown fan-in as compatibility fallbacks until structured transfer passes the compatibility gate.
- Make persisted additions optional and additive so older readers can ignore them.
- Revert the new public schema and its Changeset independently if provider compatibility is unacceptable.

## Plan

- [ ] Record characterization tests for current text, `structured-v1`, chain `{previous}`, fan-in Markdown, completion metadata, persistence, inspection, and rendering behavior; verify the focused package tests pass before contract changes.
- [ ] Decide the exact `pi-subagents:delegation:v2` and `pi-subagents:result:v2` field names, contract levels, status vocabulary, size limits, unknown-field policy, and observed/inferred/unverified provenance semantics; verify the decision against the two research notes and existing provider-compatible schema conventions.
- [ ] Add failing parser and serializer tests for valid minimal and full contracts, malformed JSON, unsupported versions, missing required fields, unknown fields, duplicate identifiers, oversized arrays, oversized strings, terminal controls, private text, and UTF-8 truncation; verify failures precede implementation.
- [ ] Implement bounded immutable request and result types plus parse, normalize, copy, redact, and compatibility helpers in responsibility-focused modules under `packages/pi-subagents/src/`; verify no source file crosses 1,000 lines.
- [ ] Add optional contract and `structured-v2` request fields to blocking single, task, chain, aggregator, detached spawn, and follow-up shapes without changing calls that provide only `task`; verify TypeBox schemas remain bounded and provider-compatible.
- [ ] Append contract instructions through one shared prompt builder across subprocess, in-process, and RPC turns; verify each transport receives semantically identical bounded instructions and no duplicate suffix.
- [ ] Capture valid `structured-v2` results in blocking `SingleResult`, retained `ManagedAgent`, turn history projection, completion metadata, inspection details, and tool details while keeping bounded raw output available.
- [ ] Change chain transfer to prefer a validated structured envelope with source and provenance while preserving raw `{previous}` fallback for legacy output; verify mixed v2, v1, text, failed, and truncated sequences.
- [ ] Change fan-in context to preserve per-result task identity, agent, status, evidence, artifacts, errors, and truncation through a bounded structured projection while preserving the existing Markdown fallback.
- [ ] Add rendering for contract level, outcome, evidence count, artifacts, verification, limitations, invalid-contract warning, and fallback state without rendering untrusted terminal controls or exceeding width.
- [ ] Extend persistence validation and copy logic for optional v2 request and result metadata; verify old records restore, new records round-trip, invalid persisted contracts are quarantined or omitted safely, and raw private context is not added.
- [ ] Update `subagent_inspect` and completion delivery with bounded safe contract metadata while preserving side-effect-free inspection and current completion ordering.
- [ ] Run a deterministic fake-provider matrix and one bounded live-provider smoke when credentials permit to measure valid-contract rate, prompt bytes, output bytes, tool calls, and latency for minimal versus full contracts; record unsupported numeric targets as baseline data rather than claims.
- [ ] Update `packages/pi-subagents/README.md`, help, compatibility notes, package layout, and a minor Changeset with exact opt-in behavior, overhead evidence, fallback semantics, and the fact that authority requests are not yet enforcement.
- [ ] Audit cancellation, timeout finalization, partial output, session replacement, shutdown, redaction, persistence, settings neutrality, and every model-facing or terminal-facing contract path against `docs/extension-conventions.md`.
- [ ] Run focused tests, `npm test`, `npm run check`, `git diff --check`, and `just pack subagents`; inspect the tarball and record any skipped live-provider path.

## Completion Checklist

- [ ] Existing omitted-field text and `structured-v1` calls have zero unapproved behavior changes.
- [ ] Every opted-in execution mode can carry the same bounded v2 request and result semantics.
- [ ] Invalid structured output is visible as invalid or fallback and is never silently presented as valid evidence.
- [ ] Chain and fan-in preserve source, status, evidence, artifact, and truncation provenance when v2 data is available.
- [ ] Contract levels expose measured cost and latency tradeoffs without making unsupported performance promises.
- [ ] Authority fields are documented as requested rather than enforced until the capability-enforcement phase.
- [ ] Persistence, inspection, completion delivery, rendering, cancellation, timeout, replacement, and shutdown retain their existing safety guarantees.
- [ ] Every changed behavior has deterministic coverage, required checks pass, and the package contains an appropriate Changeset without publishing.
