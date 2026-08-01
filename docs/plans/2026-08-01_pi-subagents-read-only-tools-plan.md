# pi-subagents read-only tools plan

## Goal

Add two capability-clean tools to `@narumitw/pi-subagents` without coupling it to Plan mode or changing the documented behavior of its existing delegation and lifecycle APIs:

- `subagent_inspect` reads bounded agent, model, run, runtime, and diagnostic metadata without changing workspace or subagent state.
- `subagent_consult` runs one ephemeral subagent synchronously under executor-enforced read-only tool and instruction-resource policies and returns its answer.

Users can independently activate these tools wherever a read-only surface is appropriate. `pi-subagents` owns their safety guarantees; other extensions may only use Pi's generic tool APIs.

## Approved Decisions

- Untrusted `project` or `both` agent scope fails before project-agent discovery for both tools. Omitted scope defaults to `user`.
- Inspection may obtain mailbox unread counts from a dedicated metadata snapshot, but it must not access, copy, expose, or acknowledge message content.
- `get_run` returns a safe state summary, not history output, context content, or mailbox content.
- Add the user setting `consult.resources` with `project-context`, `none`, and `all`; default to `project-context`. Project-controlled settings cannot override it, and child extensions are disabled under every value.
- A missing agent tool list means the default read-only set; an explicit empty list means no tools in both JSON settings and agent markdown frontmatter.
- Nested consultation usage is returned to Pi for footer, `/session`, and RPC accounting as well as result details.
- Pre-launch failures throw. A child that fails after launch returns bounded partial evidence and usage and is marked as an actual Pi tool error. User-declined confirmation is a normal `{ cancelled: true }` result with no launch or usage.
- `/subagents settings` is the single settings screen for completion delivery and consultation resources.
- A consultation `cwd` outside the canonical current workspace is allowed only when `consult.resources` is `none`. This does not sandbox absolute paths used by read-only tools.
- Trusted project agents still require confirmation by default. In a non-interactive context, `confirmProjectAgents: true` fails closed; the caller must explicitly pass `false`.
- `diagnose` returns a successful structured report whose checks are `pass`, `warning`, or `fail`; only failure of the diagnostic operation itself throws.
- Model and path projections use explicit safe fields. User-agent paths use `~`, and project-agent paths are workspace-relative.
- Consultation details expose the requested and effective safety policy without exposing prompts, credentials, or environment values.
- Tasks are not classified with write-related keyword heuristics. Executor policy, not prompt wording, enforces read-only behavior.

## Context

- The current package registers five tools by default: blocking `subagent` plus `subagent_spawn`, `subagent_send`, `subagent_manage`, and `subagent_mailbox` for detached lifecycles.
- `subagent_manage` mixes read-only `list` with mutating `interrupt`/`close`; `subagent_mailbox` mixes `send` with `read`, whose default acknowledgement changes mailbox state. Neither whole tool is a safe read-only capability.
- Blocking execution already supports ephemeral subprocesses, cancellation, byte-bounded output, project-agent trust checks, and usage details. Its child CLI arguments currently allow configured extensions and write-capable tools, and it does not return usage through Pi's top-level nested-usage field.
- `StatefulSubagentController.listAgents()` and `getRuntimeStatus()` currently copy complete retained records, including history and mailbox objects. Inspection therefore needs a dedicated metadata snapshot instead of projecting the existing full-record API.
- `readSubagentSettings()` updates a pending lifecycle notice. Inspection needs a separate pure settings snapshot so a read cannot consume, replace, or seed that notice.
- `extensions/pi-subagents/src/stateful.ts` is close to the repository's 1,000-line review threshold. New projection and consultation logic belongs in focused modules; any small controller bridge must be offset by extraction if the final file would exceed the threshold.
- Existing workflow settings derive `all`, `async-only`, `blocking-only`, or `disabled` from `blocking.enabled` and `stateful.enabled`. This change adds only the optional user-owned `consult.resources` preference; it does not change workflow derivation.

## Architecture

### Tool surface

| Tool | Registration | Safety contract |
| --- | --- | --- |
| `subagent_inspect` | Every workflow, including disabled delegation | Does not start a child, read mailbox message content, acknowledge messages, mutate registry/settings/files, or perform network/provider refresh work. |
| `subagent_consult` | Whenever blocking delegation is enabled | Runs one synchronous, non-retained child with an enforced subset of Pi's built-in `read`, `grep`, `find`, and `ls` tools. |
| Existing five tools | Preserve current workflow rules and schemas | Preserve current public behavior and compatibility. |

Expected registered surfaces:

- `all`: the existing five tools plus `subagent_inspect` and `subagent_consult`.
- `async-only`: the four detached lifecycle tools plus `subagent_inspect`.
- `blocking-only`: `subagent`, `subagent_consult`, and `subagent_inspect`.
- `disabled`: `subagent_inspect` only.

Keep `subagent_manage({ action: "list" })` as a compatibility route. Its wording may steer new read-only discovery toward `subagent_inspect`, but this change must not remove or alter the old call.

### `subagent_inspect` schema

Use one flat `Type.Object` schema whose `action` uses Google-compatible `StringEnum`. Set `additionalProperties: false` and also perform strict runtime action-specific validation so resumed or direct calls cannot smuggle cross-action fields.

| Action | Accepted fields and defaults |
| --- | --- |
| `list_agents` | `action`; optional `agentScope` default `user`; optional integer `limit` default 32, range 1–100 |
| `get_agent` | `action`; required non-empty `agent`; optional `agentScope` default `user` |
| `list_runs` | `action`; optional `includeClosed` default `false`; optional integer `limit` default 50, range 1–100 |
| `get_run` | `action`; required non-empty `agentId`; searches every still-retained record, including closed records |
| `list_models` | `action`; optional integer `limit` default 50, range 1–100 |
| `status` | `action` only |
| `diagnose` | `action` only |

Reject every field not listed for the selected action. Return deterministic ordering plus returned and omitted counts for bounded lists.

### `subagent_inspect` projections

- `list_agents`: name, bounded description, source/scope, safe source path, and enough configured/effective tool metadata to select an agent.
- `get_agent`: name, description, source/scope, safe path, model, thinking level, configured tools, and consult-effective tools. Never return system-prompt content or raw settings/model objects.
- `list_runs`: agent ID/name, state, created/updated times, history count, and unread count. Do not copy history entries, context, current task, errors, or mailbox entries for the list action.
- `get_run`: the list fields plus safe `cwd`, bounded current-task and error summaries, thinking level, and policy summary. Do not return history output, context content/source content, mailbox content, or system prompts.
- `list_models`: use `ctx.scopedModels` when non-empty, otherwise `ctx.modelRegistry.getAvailable()`. Project only provider, ID, display name, reasoning support, input modalities, context window, max output tokens, scoped thinking level, and whether it is the current model. Never project `baseUrl`, headers, compatibility objects, environment values, auth material, or the raw model object.
- `status`: effective workflow, stateful transport, completion delivery, active/retained counts, effective consultation-resource policy, and relevant pure settings-load errors.
- `diagnose`: aggregate settings validity, agent-discovery completeness, model availability, runtime initialization, and consultation support as `pass`, `warning`, or `fail`. A failed check remains report data; throw only when diagnosis itself cannot run.

Use a dedicated registry/controller inspection snapshot that reads only state fields, lengths, timestamps, and mailbox `readAt` metadata. It must not access or copy message `content`, history entries, or stored context. Update runtime counts to avoid `registry.list(true)` full-record copies. Keep the existing `listAgents()` compatibility API unchanged for existing callers.

Use a pure settings document snapshot for inspection and UI previews. It must not modify `pendingSettingsNotice`, create files/directories/locks, or race a pending settings write. Discovery must check `ctx.isProjectTrusted()` before any project-agent directory traversal; explicit untrusted `project`/`both` requests throw, while omitted scope reads only user and built-in definitions.

Normalize model-facing text with terminal-control removal, private-text redaction where applicable, and both Pi limits: at most 50 KB or 2,000 lines, whichever is reached first. Render user paths beneath the agent directory with `~` and project paths relative to the canonical workspace. Arbitrary task/error text is not a confidentiality boundary; document that limitation and never source credential-bearing model/settings fields.

Suggested public wording:

```text
Name: subagent_inspect
Label: Inspect Subagents
Description: Inspect available subagent definitions, models, retained runs, runtime status, and diagnostics without changing subagent or workspace state. This tool never starts a child, sends or acknowledges messages, interrupts or closes runs, changes settings, or modifies files.
Prompt snippet: Inspect subagent metadata and runtime state without changing it.
```

### `subagent_consult` schema

Expose one actionless `Type.Object` with `additionalProperties: false`:

- required non-empty `agent` and `task`;
- optional `agentScope`, default `user`;
- optional `confirmProjectAgents`, default `true`;
- optional `cwd`;
- optional positive `timeoutMs`;
- optional Google-compatible thinking-level enum.

Do not expose blocking parallel, chain, task-array, or fan-in fields. Do not reject task text through write/edit/shell keyword matching; append an explicit read-only instruction and rely on the executor policy.

Suggested public wording:

```text
Name: subagent_consult
Label: Consult Read-only Subagent
Description: Run one ephemeral subagent synchronously under enforced read-only tool and resource policies and return its answer. The child can use only the effective subset of Pi's built-in read, grep, find, and ls tools. Shell commands, file writes, extension tools, detached lifecycle operations, and persistent agent state are disabled.
Prompt snippet: Consult one constrained read-only subagent and wait for its answer.
Prompt guideline: Use subagent_consult for bounded reconnaissance, planning, or review whose result is required in the current turn. An implementation-shaped task remains read-only and can return only analysis or instructions.
```

### Consultation tool enforcement

Resolve the requested agent while retaining its model, thinking level, timeout, prompt, source, and scope. Preserve tool-list presence separately from its contents:

```text
missing tools  -> [read, grep, find, ls]
explicit []    -> []
explicit list  -> stable, deduplicated intersection with [read, grep, find, ls]
```

Apply the same absent-versus-empty rule to JSON agent overrides and markdown frontmatter. Support previously ambiguous/unsupported blank or empty frontmatter as an explicit empty list without changing existing valid missing or comma-separated declarations.

Extend the blocking runner with a typed optional launch-policy object. Existing callers receive byte-for-byte-equivalent defaults. Consultation launches with:

- `--no-extensions` on every resource policy, with no explicit extension path;
- `--tools <effective-list>` or `--no-tools` for an empty intersection;
- `--no-session` and no stateful registry/persistence record;
- the configured resource-policy flags and explicit prompt sources described below;
- an agent prompt followed by a package-owned read-only instruction that cannot widen executor capabilities.

Disable extension discovery rather than trusting a same-name tool allowlist. Prove exact child arguments, no registry/mailbox allocation, and the effective tool list in tests.

### Consultation instruction-resource policy

Add this optional user setting to `pi-subagents.json`:

```json
{
  "consult": {
    "resources": "project-context"
  }
}
```

Accepted values:

| Value | Effective child instruction resources |
| --- | --- |
| `project-context` | Default. Retain ordinary user context/system files and trusted current-project `AGENTS.md`/`CLAUDE.md`/`SYSTEM.md`; disable skills and prompt templates. Do not auto-load append-system files beyond the selected agent and package read-only instructions. For an untrusted current project, omit project context before launch; fail closed with `--no-context-files` if Pi cannot separate user from project context. |
| `none` | Inherit no user/project context, system, skill, prompt-template, or append-system files. Use only Pi's package-owned consultation base, the selected agent prompt, and the read-only instruction. |
| `all` | Retain ordinarily discoverable trusted context/system/append-system files, skills, and prompt templates, while still forcing `--no-extensions` and the read-only tool intersection. Omit untrusted project resources before launch. |

The setting is user-owned only; do not add a project override or environment variable. Default it in code without creating a file. Reload manual edits on `session_start`. `/subagents settings` edits it immediately for subsequent consultations in the current session, using the existing settings mutation lock, atomic publication, unknown-field preservation, invalid-file protection, ordered save/error recovery, and no required reload.

`cwd` must be canonicalized. An equal or descendant path of the canonical current workspace may use any policy. A path outside that boundary, a symlink escape, or a path whose boundary cannot be verified is allowed only when the effective policy is `none`; otherwise throw before launch. This controls implicit instruction loading, not file access: read-only tools can still read an explicitly requested accessible absolute path.

### Consultation trust, confirmation, and lifecycle

- Check `ctx.isProjectTrusted()` before any `project`/`both` agent discovery. An untrusted explicit project scope always throws, even if a user agent of the same name exists.
- For a resolved project agent in a trusted project, honor `confirmProjectAgents`, default `true`.
- When confirmation is required and `ctx.hasUI` is false, throw and require an explicit `confirmProjectAgents: false`; never silently skip confirmation.
- A user-declined UI confirmation returns a bounded normal result with `cancelled: true`, no child launch, and no usage.
- After every confirmation or other `await`, revalidate the request/session owner and abort signal before using context or launching work.
- Abort before launch starts nothing. Abort, timeout, session replacement, or shutdown after launch terminates the process tree, awaits cleanup, removes temporary prompt resources once, and prevents late updates or results from the old owner.

### Consultation result, usage, and errors

Return bounded answer content and details containing:

- agent source/scope, safe `cwd`, model, thinking level, and timeout;
- requested and effective tools;
- requested and effective instruction-resource policy;
- explicit `extensions: disabled`, `sessionPersistence: disabled`, and `retainedAgent: false` facts;
- bounded child status/error/activity details without prompts, credentials, headers, or environment values;
- combined nested model usage in both details and Pi's top-level `usage` field.

Aggregate the child usage into Pi's `Usage` shape so footer, `/session`, and RPC totals include consultation cost. Bound both content and details to 50 KB or 2,000 lines and expose truncation/omission metadata.

Validation, trust, unknown-agent, unsafe-`cwd`, pre-launch abort, and spawn failures throw observable tool errors. Once a model process has started, failures, aborts, and timeouts preserve bounded partial evidence and usage, and a `subagent_consult`-specific `tool_result` handler marks the finalized Pi result `isError: true`. Tests must inspect the finalized Pi-visible result, not merely an `isError`-looking details field. This post-launch structured-error path is an explicit compatibility/usage-preservation deviation from the repository's default throw-only tool convention and must be recorded in the final audit.

### Settings and command UI

Extend settings types, normalization, pure inspection snapshots, and atomic updates for `consult.resources`. Unknown top-level and nested fields remain preserved. Invalid/malformed files block writes and leave the current effective policy unchanged.

Make `/subagents settings` and the no-argument manager's **Settings** action open the same standard settings screen. Include rows for:

- async completion delivery;
- consultation instruction resources.

Update Status and Help with configured/effective values, source, path, default, accepted values, immediate UI application, and manual-edit reload behavior. Non-TUI routes must not open custom UI or corrupt JSON/RPC output.

### Ownership boundaries

- `pi-subagents` owns inspection accuracy, safe projections, trust gates, resource selection, and consultation executor policy.
- No source, settings, docs, or tests in this change may branch on another extension's name, mode, settings, schema, or runtime state.
- Other extensions may activate these tools only through Pi's generic tool APIs.
- Keep `src/index.ts` as a forwarding entrypoint. Put inspection, consultation, launch-policy, and snapshot projections in focused modules, and keep every source file below 1,000 lines unless the final audit documents a concrete justification.

## Non-Goals

- Do not add `subagent_control` or merge the existing lifecycle tools.
- Do not remove or rename an existing tool or action.
- Do not add `allowedSubagents`, Plan-specific behavior, mode detection, extension-to-extension communication, a project override for `consult.resources`, or a new environment variable.
- Do not claim an OS sandbox, general path sandbox, network isolation, arbitrary-data confidentiality boundary, or zero-cost operation.
- Do not add detached read-only consultation, retained consult sessions, parallel consult arrays, chains, fan-in, mailbox-content inspection, or settings mutation through `subagent_inspect`.
- Do not publish, bump package versions, or change package metadata unless separately requested.

## Assumptions

- “Read-only consultation” means the child cannot modify workspace files or persistent subagent state through Pi tools. It still starts a temporary process, can read accessible absolute paths, calls a configured model over the network, and incurs token cost.
- Instruction-resource policy controls automatically loaded instructions; it is not a data-access sandbox.
- A synchronous single consultation is the primary read-only delegation need. Existing blocking batches and detached workflows remain on the existing tools.
- Additive tool names are acceptable in the default `all` surface; clear capability boundaries are preferred over minimizing schema count.

## Risks

- A same-name extension override could invalidate a built-in-name allowlist. Disable all child extension discovery and test exact emitted CLI arguments.
- Pi resource flags may not independently suppress every context/system source. Build an explicit launch policy for each `consult.resources` value and test the child-visible prompt/resources, not only setting normalization.
- A project trust check performed after discovery would read untrusted definitions. Gate explicit project scope and project resource loading before directory traversal or subprocess launch.
- Agent prompts may describe unavailable write or shell behavior. Report the enforced policy and append a read-only instruction, but rely on executor capabilities rather than prompt compliance.
- Full retained records can leak prompts, mailbox content, or history before projection. Add metadata-only registry snapshots and make status counts avoid full-record copies.
- Broad model/status projection can leak endpoints, headers, or credentials. Return only the approved fields and use already-loaded model snapshots without refresh or auth resolution.
- Settings inspection can mutate pending notices or stale reads can race writes. Keep inspection pure and participate in the existing settings concurrency protocol.
- Cancellation, timeout, replacement, or shutdown can leak a child or allow a stale continuation to launch. Test each owner transition separately and reuse process-tree termination.
- Post-launch structured errors can look successful if middleware is omitted. Test the finalized Pi-visible `isError` and top-level usage.
- New registration and settings rows can make workflow labels or previews inaccurate. Update exact-surface and UI wording tests together.

## Rollback / Recovery

This is an additive public API with no required migration. A rollback removes the two tool registrations and focused modules, restores prior workflow wording/tool lists, and reverts the optional runner launch policy and consultation settings UI. Existing retained-agent persistence and the five existing tool schemas remain readable.

The optional `consult` object may remain in `pi-subagents.json`; preceding versions treat it as an unknown field and settings updates must preserve it. Users may delete that object manually, but rollback requires no data conversion. A released version can be rolled back by pinning the preceding package release.

## Plan

- [x] Add red settings tests in `extensions/pi-subagents/test/settings.test.ts` for default `project-context`, all three accepted values, invalid-value rejection, side-effect-free pure snapshots, pending-notice preservation, missing-file behavior, unknown-field preservation, atomic update failure recovery, immediate in-memory application, and manual reload. Compile with `./node_modules/.bin/tsc -p tsconfig.test.json`, run the compiled test by real path, implement the `consult.resources` types/normalizer/inspector/updater, and rerun to green.
- [x] Add red agent-discovery tests in `extensions/pi-subagents/test/agents.test.ts` proving absent tools remain `undefined`, blank or empty markdown frontmatter becomes `[]`, JSON `tools: []` remains `[]`, and existing comma-separated tools still parse. Implement the smallest parser change and rerun the focused compiled test.
- [x] Add red registry tests for metadata-only counts, list snapshots, and one-record snapshots. Seed history, context, tasks, errors, and mailbox messages with sentinel content; prove snapshots expose approved fields and unread counts without copying/accessing content fields, and prove status counting no longer calls full-record `list()`. Implement focused snapshot types/functions in `registry.ts` plus the smallest controller bridge, extracting code if needed to keep `stateful.ts` below 1,000 lines.
- [x] Add red `extensions/pi-subagents/test/inspect.test.ts` cases for the exact name, label, wording, `StringEnum` action, strict action-field matrix, defaults/limits, deterministic ordering/omitted counts, safe paths, empty/error states, all approved projections, and structured `diagnose` statuses. Implement `src/inspect.ts`, rerun the compiled test, and verify malformed or cross-action fields throw.
- [x] Extend inspect tests with untrusted `project`/`both` pre-discovery rejection, trusted same-name precedence, incomplete discovery, invalid settings, empty models/runs, safe model fields, bounded task/error summaries, and sentinels for omitted prompts, history, context, mailbox content, endpoints, headers, and credentials. Prove no child launch, provider refresh/auth resolution/network call, registry mutation, settings notice change/write, or filesystem mutation occurs.
- [x] Add red runner tests in `extensions/pi-subagents/test/runner-render.test.ts` for a typed optional launch policy: exact `--no-extensions`, tools/`--no-tools`, `--no-session`, trust/resource flags and prompt sources for `project-context`, `none`, and `all`, stable read-only tool intersection, top-level usage aggregation support, and byte/line bounds. Implement the runner extension while proving every existing caller emits its previous argument list and behavior.
- [x] Add red `extensions/pi-subagents/test/consult.test.ts` cases for the exact actionless schema, unknown-field rejection, required fields, default scope/confirmation, no task-keyword rejection, missing/empty/intersected tools, and the package read-only instruction. Add trust tests proving untrusted project scope reads no project files, trusted confirmation cancellation launches nothing, non-UI confirmation fails closed, and explicit false proceeds only when trusted.
- [x] Implement `src/consult.ts` agent resolution and preflight ownership. Canonicalize `cwd`; test equal/descendant, outside, nonexistent, and symlink-escape cases against each resource policy. Prove outside-workspace launch is accepted only under `none` and that policy details report requested versus effective resources.
- [x] Complete consultation execution tests for extension suppression, effective tools, no registry/mailbox/persistence state, no retained ID, streaming updates, successful output, combined Pi-visible usage, spawn failure, malformed child output, child error, abort before launch, abort during execution, timeout, process-tree cleanup, and temporary prompt cleanup. Assert post-launch failures are finalized with actual `isError: true`, while declined confirmation returns normal `cancelled: true` with no usage.
- [x] Add lifecycle tests that separately replace the session or shut it down while confirmation is pending and while a child is running. Prove late confirmations/updates/results are ignored, no stale continuation launches, all owned processes are reaped, and cleanup is idempotent after every `await` boundary.
- [x] Wire both modules through `src/subagents.ts` and the metadata snapshot through the stateful controller. Update exact registration tests so `all`, `async-only`, `blocking-only`, and manually disabled settings expose exactly the Architecture table, while the five existing schemas and `subagent_manage({ action: "list" })` remain compatible.
- [x] Replace the settings UI's completion-only route with one shared standard Settings screen containing completion delivery and consultation resources. Add config-UI tests for all displayed values, immediate save/application, ordered saves, failed-save rollback, session replacement/disposal, non-TUI behavior, safe paths, Status/Help, and the no-argument **Settings** entry.
- [x] Revise labels, descriptions, snippets, workflow previews, Status/Help, and compatibility wording in `src/subagents.ts`, `src/stateful.ts`, and `src/config-ui.ts`. Clearly distinguish inspection, consultation, blocking batches, detached lifecycles, mailbox acknowledgement, resource policy, cost, confirmation, and the lack of a path/OS sandbox.
- [x] Update `extensions/pi-subagents/README.md` with the seven-tool default surface, workflow tables, exact inspection action schema, safe projections, consultation tools/resources/trust/confirmation/`cwd`/error/usage behavior, `consult.resources` JSON and UI reference, empty-tool semantics, examples, compatibility note, limits, and package layout. Verify every claim against source/tests.
- [x] Run `lsp_diagnostics` on changed TypeScript, apply only relevant fixes, and run focused compiled tests after each red/green slice. Then run `npm run check`; resolve Biome, boundary, typecheck, and test failures without weakening safety assertions.
- [x] Run a representative isolated `pi -e ./extensions/pi-subagents` smoke for registration/settings behavior and consultation launch-policy argument capture without real provider traffic. Record any child-resource path that cannot be exercised locally rather than silently claiming it.
- [x] Run `just pack-subagents`; inspect the dry-run contents for source modules, README, license, and declared entrypoint, and confirm no tests, caches, settings, credentials, or unrelated files are included.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md`: extension independence; public schemas; settings ordering/recovery/unknown fields; trust before reads; prompt/resource policy; tool origins; output limits; Pi-visible errors/usage; user cancellation; subprocess disposal; session replacement/shutdown; compatibility; and the 1,000-line source threshold. Record the approved post-launch structured-error deviation and every unverified path before completion.

## Completion Checklist

- [x] `subagent_inspect` implements the exact seven-action schema and is demonstrably side-effect-free, trust-aware, metadata-only, bounded by bytes and lines, and free of prompts, mailbox/history/context content, credential-bearing model fields, and unsafe paths.
- [x] `subagent_consult` runs exactly one ephemeral synchronous child with extensions disabled, the approved read-only tool intersection, the configured instruction-resource policy, no retained state, and auditable result details.
- [x] Project trust is checked before discovery/resource loading; confirmation is fail-closed without UI; external `cwd` obeys the `none` rule; declined confirmation launches nothing.
- [x] Consultation usage reaches Pi session totals, post-launch failures are actual Pi-visible errors with bounded evidence, and every cancellation/timeout/replacement/shutdown path cleans up its owned process and temporary files.
- [x] `consult.resources` defaults, validation, pure inspection, atomic persistence, unknown-field preservation, immediate UI application, unified Settings UI, and reload behavior match the settings guide.
- [x] Existing `subagent`, `subagent_spawn`, `subagent_send`, `subagent_manage`, and `subagent_mailbox` schemas and behavior remain compatible, including `subagent_manage({ action: "list" })`.
- [x] Every workflow exposes the exact intended tool set, and wording accurately distinguishes all capabilities and limitations.
- [x] Focused tests, runtime smoke, `npm run check`, `lsp_diagnostics`, and `just pack-subagents` pass with recorded evidence or an explicitly accepted unverified path.
- [x] The final semantic audit confirms no coupling to `pi-plan-mode` or any other extension and no unknown required decision remains.

## Implementation Evidence

- Guides audited: `docs/extension-conventions.md` and `docs/extension-settings.md`; touched areas were public tool schemas, trust-gated discovery, settings inspection/persistence/UI, subprocess ownership, usage/error reporting, output bounds, workflow surfaces, and documentation.
- Focused compiled tests passed for agents, settings, registry, inspection, consultation, runner launch policy/rendering, and extension registration. The final repository gate, `npm run check`, passed with 1,955 tests.
- `lsp_diagnostics` reported zero diagnostics across all 36 `pi-subagents` source and test files.
- An isolated RPC smoke loaded `pi-subagents`, ran `/subagents status`, and verified the consultation resource status without provider traffic. The production runner was separately exercised against a synthetic JSON child to verify exact launch arguments, appended read-only instructions, output, and usage aggregation.
- `just pack-subagents` included the declared entrypoint, README, license, and all source modules (28 files), with no tests, caches, settings, credentials, or unrelated files.
- The largest source file is `src/stateful.ts` at 969 lines; every source file remains below the 1,000-line threshold. No cross-extension coupling was introduced.
- Approved deviation: after a child process starts, consultation failures return bounded evidence and usage and are marked `isError: true` by the tool-result handler instead of throwing away that evidence. Pre-launch failures continue to throw.
- Accepted unverified path: no live provider request was made during the isolated smoke, by design. Provider-independent subprocess protocol, launch policy, lifecycle, usage, and finalized Pi-visible error behavior are covered by synthetic-child and extension-event tests.
