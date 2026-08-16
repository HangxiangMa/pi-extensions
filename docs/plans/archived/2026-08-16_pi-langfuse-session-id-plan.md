# Pi Langfuse session attribution plan

## Goal

Ensure every Langfuse observation emitted by `@narumitw/pi-langfuse` carries the current Pi session ID so generation token and cost data aggregate into the correct Langfuse session.

## Context

Issue [#763](https://github.com/narumiruna/pi-extensions/issues/763) reports that only the root `pi.agent` observation receives `session.id` while the `pi.llm` generation carrying usage and cost does not.

A live Langfuse Cloud reproduction with Pi 0.84.2, `@narumitw/pi-langfuse` 0.49.3, and Langfuse SDK 5.10.0 exported 490 tokens and $0.000534 for the trace but zero tokens and zero cost when filtered by the root session ID.

The reproduction used `captureContent: false`, one non-sensitive provider request, and the isolated environment `issue-763-repro`.

Langfuse SDK 5.10.0 defines `LangfuseOtelSpanAttributes.TRACE_SESSION_ID` as the per-span OpenTelemetry attribute `session.id`.

The applicable extension-convention requirements are deterministic tests for changed behavior, a patch Changeset for published behavior, the repository CI-equivalent check, and explicit reporting of the live smoke result.

## Architecture

`TraceRecorder` owns the Pi session ID and creates the `pi.agent`, `pi.attempt`, `pi.turn`, `pi.llm`, `pi.tool.*`, and `pi.compaction` observations.

`ProductionTraceBackend` owns translation from recorder attributes to Langfuse observations and native OpenTelemetry span attributes.

The recorder will attach its session ID through one observation-creation helper, and the production backend will remove that extension-owned field before Langfuse observation serialization and set it directly as `session.id` on the native span.

The root `updateTrace()` flow will remain responsible for trace name, trace input and output, metadata, tags, and schema version.

## Non-Goals

- Do not invent or add a Langfuse user ID.
- Do not refactor the event-driven recorder into a `propagateAttributes()` callback scope.
- Do not change the `pi-langfuse.json` schema or settings behavior.
- Do not change observation hierarchy, usage, cost, metadata, content capture, or lifecycle behavior.
- Do not include the contributor branch's unrelated root `prepare` script change.

## Risks

- Passing `sessionId` into Langfuse's normal observation serializer could silently discard it, so the production backend must extract it and set the native OpenTelemetry attribute explicitly.
- Updating only `pi.llm` could leave the trace internally inconsistent, so one helper and a test covering all six observation kinds must enforce complete attribution.
- Changing root trace updates could regress trace naming or metadata, so the existing root `updateTrace()` behavior must remain intact and the current runtime assertions must continue passing.
- The post-fix Cloud smoke uses an external provider and Langfuse service, so it must use one bounded request, `captureContent: false`, and honest reporting if either service is unavailable.

## Plan

- [x] Add a regression test to `packages/pi-langfuse/test/recorder.test.ts` that creates all six observation kinds and expects each initial attribute set to contain the same session ID; the focused run failed at `recorder.test.ts:738` because the actual session ID was `undefined`.
- [x] Add an integration assertion to `packages/pi-langfuse/test/runtime.test.ts` that expects every finished OpenTelemetry span to contain `session.id = runtime-session`; the focused run failed at `runtime.test.ts:137` because the actual span attribute was `undefined`.
- [x] Add one observation-creation helper to `packages/pi-langfuse/src/tracing.ts` that forces `this.context.sessionId` onto every backend start, and route the six existing observation creation paths through it; the recorder test passed with 15 tests.
- [x] Update `packages/pi-langfuse/src/runtime.ts` to extract `sessionId` before Langfuse observation serialization and set `LangfuseOtelSpanAttributes.TRACE_SESSION_ID` on the created native span; the runtime test passed with 3 tests.
- [x] Add a patch Changeset for `@narumitw/pi-langfuse` that describes restored session-level token and cost aggregation; `npm run changeset:status` reports the planned 0.49.4 patch.
- [x] Add the repository's `bug` label to issue #763 after the deterministic regression test confirms the defect; `gh issue view 763 --json labels` reports `bug`.
- [x] Run `npm run check --workspace @narumitw/pi-langfuse`; Biome checked 15 files and the package TypeScript check passed.
- [x] Run `npm exec vitest -- run packages/pi-langfuse/test/recorder.test.ts packages/pi-langfuse/test/runtime.test.ts`; both files passed with 18 tests.
- [x] Run the CI-equivalent `npm run check`; build, Biome over 1,124 files, boundaries, all workspace typechecks, and 3,798 tests passed.
- [x] Run `just pack langfuse`; the dry run contained only `LICENSE`, `README.md`, `package.json`, and the six expected `src/*.ts` files.
- [x] Run one post-fix Langfuse Cloud smoke with `captureContent: false` and environment `issue-763-fixed`; Observations API v2 reported matching root session IDs for `pi.agent`, `pi.attempt`, `pi.turn`, and `pi.llm`.
- [x] Compare post-fix Metrics API totals filtered by trace ID and session ID; both reported 488 tokens and $0.000527999999.
- [x] Audit the final diff against `docs/extension-conventions.md`, issue #763 acceptance criteria, and the touched-area checklist; the change affects only synchronous observation attribution, adds the required deterministic tests and Changeset, preserves lifecycle and settings behavior, and has no deviation or unverified path.

## Completion Checklist

- [x] Every recorder-created observation carries the current Pi session ID.
- [x] Every production OpenTelemetry span carries the matching `session.id` attribute.
- [x] Generation usage and cost values remain unchanged.
- [x] Observation hierarchy and root trace attributes remain unchanged.
- [x] Recorder and runtime regression tests pass.
- [x] Package checks and the repository CI-equivalent gate pass.
- [x] The patch Changeset is valid and issue #763 has the `bug` label.
- [x] The package dry run contains only intended publishable files.
- [x] The post-fix Cloud smoke shows matching trace and session token and cost totals.
- [x] The final diff contains no unrelated changes.
