## Goal

Harden PR #201 so `pi-langfuse` coexists with other Pi extensions, never adds Langfuse network latency to normal agent completion, bounds each exported payload globally, and uses Langfuse-native observation semantics. Success means the extension keeps its JSON-only credential policy, all local checks pass, and the PR checks remain green.

## Context

The current extension already follows repository package conventions: isolated workspace package, deferred startup in `session_start`, cleanup in `session_shutdown`, private `pi-langfuse.json`, command autocomplete, package docs, and tests. Review found three merge-blocking risks: global OpenTelemetry provider registration, awaited `forceFlush()` on every `agent_end`, and per-value limits without a total trace-content budget. Lower-risk consistency work remains around observation types, command guidance, and runtime test coverage.

## Architecture

- `src/runtime.ts` owns an isolated Langfuse tracer provider and exporter lifecycle without registering a process-global OpenTelemetry provider.
- `src/tracing.ts` owns trace state, Langfuse observation types, and one cumulative UTF-8 content budget per captured input/output value.
- `src/langfuse.ts` maps Pi lifecycle events without awaiting routine exports; only explicit flush and shutdown paths wait for export completion.
- `src/config.ts` remains the sole JSON configuration boundary. Credentials stay literal in `pi-langfuse.json`; `.env` and Langfuse credential environment variables remain unsupported.

## Non-Goals

- Do not add `.env` or environment-variable credential fallback.
- Do not add a general-purpose secret scanner; retain exact Langfuse-key masking and the documented privacy warning.
- Do not migrate or rewrite previously exported Langfuse traces.
- Do not add interactive secret entry unless Pi exposes a masked-input API; provide config/help guidance instead of echoing tokens in a normal input dialog.

## Assumptions

- Langfuse v4's `setLangfuseTracerProvider()` remains the supported way to select an isolated provider.
- Node.js 20+ remains acceptable because the current Langfuse dependencies already require it.
- HTTP self-hosted Langfuse endpoints remain supported, with the existing HTTPS safety warning.

## Plan

- [ ] Add failing runtime tests for coexistence with a pre-registered OpenTelemetry provider, one-time initialization across reloads, changed-config rejection, idempotent shutdown, and parent/child export through an in-memory exporter; verify the new tests fail before runtime changes with `TMPDIR="$(realpath "${TMPDIR:-/tmp}")" npm test`.
- [ ] Replace `NodeSDK.start()` global registration in `extensions/pi-langfuse/src/runtime.ts` with an isolated tracer provider selected through Langfuse's provider API, and make provider/exporter factories injectable for deterministic tests; verify no global tracer provider is replaced and the in-memory exporter receives agent, generation, and tool observations.
- [ ] Update runtime dependencies in `extensions/pi-langfuse/package.json` and `package-lock.json` to list every directly imported OpenTelemetry package and remove `@opentelemetry/sdk-node` if it is no longer used; verify with `npm run typecheck --workspace @narumitw/pi-langfuse` and `just pack-langfuse`.
- [ ] Add failing lifecycle tests proving `agent_end` closes trace state without calling `forceFlush()`, `/langfuse flush` still waits for completed exports, and `session_shutdown` drains and shuts down exactly once; verify with the Langfuse test assertions in the root `npm test` run.
- [ ] Remove awaited routine export from the `agent_end` handler in `extensions/pi-langfuse/src/langfuse.ts`; rely on the batch processor during a live session and reserve forced export for `/langfuse flush` and `session_shutdown`, while retaining actionable error reporting for explicit flush/shutdown failures.
- [ ] Add failing sanitizer tests for many object keys, nested arrays, multibyte UTF-8 strings, repeated references, circular values, and oversized tool details; require a deterministic truncation marker and a bounded serialized result before changing the sanitizer.
- [ ] Replace the independent string/array-only bounds in `extensions/pi-langfuse/src/tracing.ts` with a cumulative UTF-8 byte budget plus bounded object/array traversal, preserving image base64 omission and circular-reference handling; verify every sanitized input/output stays within the documented budget using `Buffer.byteLength(JSON.stringify(value), "utf8")` assertions.
- [ ] Extend the internal observation type contract so `pi.agent` is emitted as Langfuse `agent`, `pi.llm` as `generation`, and `pi.tool.*` as `tool`; verify observation types and parent-child relationships through fake-backend unit tests and the in-memory exporter test.
- [ ] Align command guidance with other extensions by adding `/langfuse help` and `/langfuse config` completion/aliases that show the config path and a credential-free JSON template; verify parsing, completions, non-interactive behavior, and that status/help never include public or secret key values.
- [ ] Expand configuration/lifecycle tests for missing files, malformed JSON, permission-repair warnings, `captureContent: false`, HTTP/HTTPS normalization, and runtime initialization failure; isolate settings-loading tests with an explicit temporary config path or temporary `PI_CODING_AGENT_DIR`.
- [ ] Update `extensions/pi-langfuse/README.md` to document isolated-provider coexistence, batching versus explicit flush, the total payload budget, native observation types, and the config/help commands; verify examples match the accepted JSON schema and command parser.
- [ ] Run the complete repository and packaging gates, inspect the final diff for credentials, then update PR #201 with the hardening commit and revised summary; verify with `git diff --check`, `TMPDIR="$(realpath "${TMPDIR:-/tmp}")" npm run check`, `just pack-langfuse`, `npm audit --omit=dev`, a staged long-key scan, and green GitHub checks for both supported Pi versions.

## Risks

- An isolated provider may require replacing `@opentelemetry/sdk-node` with lower-level trace packages; keep direct dependencies explicit so npm package installs do not rely on transitive imports.
- Removing per-run forced flush delays visibility by the configured batch interval, but avoids blocking Pi; explicit flush and shutdown preserve deterministic delivery when needed.
- A global byte budget can reduce trace detail for very large conversations or tool results; truncation markers and metadata must make this visible rather than silently dropping content.
- Langfuse export failures may be logged internally instead of rejected by `forceFlush()`; tests should distinguish errors the extension can report from exporter diagnostics it cannot intercept.

## Completion Checklist

- [ ] OpenTelemetry coexistence is verified by an automated test showing an existing global provider is untouched while Langfuse observations still reach an in-memory exporter.
- [ ] Normal `agent_end` latency is independent of Langfuse export latency, verified by a lifecycle test where a pending fake flush does not block the handler.
- [ ] Every captured input/output is globally bounded, verified by UTF-8 serialized-byte assertions for adversarial nested tool and conversation payloads.
- [ ] Agent, generation, and tool observations use native Langfuse types with correct parentage, verified by unit and in-memory exporter assertions.
- [ ] JSON-only credential handling remains intact, verified by config tests and a staged scan showing no long Langfuse credentials or `.env` fallback code.
- [ ] Config/help/status command behavior is documented and covered by parser, autocomplete, non-interactive, and secret-redaction tests.
- [ ] Repository verification passes with `TMPDIR="$(realpath "${TMPDIR:-/tmp}")" npm run check`, `just pack-langfuse`, `npm audit --omit=dev`, and `git diff --check`.
- [ ] PR #201 contains the hardening commit and both GitHub Pi-version checks are successful.
