# Pi Subagents Graceful Timeout Plan

## Goal

Let the main agent choose a bounded work timeout for every subagent turn and turn elapsed work deadlines into an abort-then-summarize flow with a separate hard-bounded finalization phase.

## Architecture

- Treat public `timeoutMs` as the work deadline selected by the main agent.
- On a work timeout, abort the active run, wait for authoritative settlement, and request a concise summary of only evidence already gathered.
- Bound finalization independently so an ignored abort, stuck provider, or failed summary cannot block the parent indefinitely.
- Preserve explicit user interruption semantics: user aborts stop immediately and do not launch a summary turn.
- Keep retained spawn timeouts as per-agent defaults and allow `subagent_send.timeoutMs` to override one follow-up turn.
- Keep subprocess finalization tool-less and bounded; RPC and in-process transports reuse their retained child context after successful abort settlement.

## Non-Goals

- Do not make finalization unbounded.
- Do not automatically retry or replay the timed-out task.
- Do not infer task difficulty from task text.
- Do not change the existing default timeout when the main agent omits `timeoutMs`.

## Risks

- A summary turn can itself hang, so it needs a hard finalization deadline and process/session cleanup.
- A retained summary prompt can still attempt tools because current child APIs cannot replace one turn's active tool set; the prompt prohibits tool use, while the separate deadline and abort path remain authoritative.
- Spawn idempotency must include the retained timeout because it changes execution behavior.
- Timeout summaries must remain bounded, sanitized, private-text-safe, and accurately labeled as partial evidence.

## Rollback / Recovery

- Keep the timeout exit code and failed retained-agent state so callers can still distinguish work deadline expiry.
- If abort does not settle or summary finalization fails, return bounded partial evidence and release the unusable child.
- The existing default timeout and explicit user-abort behavior remain the compatibility rollback path.

## Plan

- [x] Add failing focused tests for main-agent timeout selection on spawn and follow-up turns, including idempotency and persistence; the initial focused run failed in six intended assertions before implementation.
- [x] Add failing focused tests for abort-then-summary behavior and hard-bounded finalization in subprocess, RPC, and in-process transports; the initial focused run failed before summary recovery existed.
- [x] Implement retained timeout storage and per-follow-up overrides across tool schemas, registry state, persistence, inspection, hashing, and transport resolution.
- [x] Implement bounded timeout finalization prompts and subprocess summary recovery without task replay or tool access.
- [x] Implement RPC and in-process abort-settle-summary state transitions with a separate finalization timeout and deterministic cleanup.
- [x] Update model-facing guidance, README, protocol note, renderers, and result metadata to explain work deadlines and summary finalization.
- [x] Update the existing minor Changeset for the published timeout behavior.
- [x] Audit cancellation, stale session generation, shutdown, settings, output bounds, private text, terminal rendering, idempotency, and retained-tool limitations against `docs/extension-conventions.md` and `docs/extension-settings.md`.
- [x] Run focused tests, package checks, root `npm run check`, `git diff --check`, and `just pack subagents`; all passed.
- [x] Run independent bounded reviews of subprocess, retained timeout selection, RPC/in-process cleanup, and explicit-abort races; resolve every reported finding and finish with no remaining finding.

## Execution Evidence

- `npm run check --workspace @narumitw/pi-subagents` passed Biome and TypeScript checks.
- The focused package suite passed 18 files and 231 tests before the final root run.
- `VITEST_MAX_WORKERS=4 npm run check` passed Biome, package boundaries, every workspace typecheck, 235 test files, and 2,666 tests.
- `git diff --check` passed.
- `just pack subagents` produced and inspected a 60-file dry-run tarball containing the manifest, README, license, and published source, including the new timeout modules.
- Independent reviewers found and prompted fixes for pre-close subprocess finalization, unbounded process/RPC cleanup, abort-to-prompt races, and an unbounded RPC prompt client; the final focused re-review reported no findings.

## Completion Checklist

- [x] Main-agent calls can set a work timeout for blocking, consultation, spawn, and individual retained follow-up turns.
- [x] Work timeout aborts first and returns a bounded summary when finalization succeeds.
- [x] Finalization always has a finite model-work deadline plus bounded abort and cleanup grace.
- [x] Explicit user interruption never starts timeout finalization.
- [x] Timeout selection, idempotency, persistence, inspection, documentation, and tests agree.
- [x] Required verification and package inspection pass.
- [x] The completed plan is ready to archive.
