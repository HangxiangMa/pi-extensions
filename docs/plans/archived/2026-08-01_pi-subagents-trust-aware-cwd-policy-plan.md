# pi-subagents trust-aware working-directory policy plan

> Planning only: this plan follows the repository's `writing-plans` skill, extension conventions, settings conventions, and Pi's official security/trust documentation. It does not authorize implementation.

## Goal

Make `pi-subagents` use Pi's public `ProjectTrustStore` to understand the saved trust of a target working directory instead of knowing only the current session's `ctx.isProjectTrusted()` value.

- Let `subagent_consult` start in any existing directory by default. A trusted target uses the configured consultation resources; an untrusted, explicitly denied, or unresolved external target remains available for read-only consultation but is forced to `resources: "none"`.
- Restrict general `subagent` and `subagent_spawn` targets by default to the current workspace or saved-trusted targets. Let users tighten this to the current workspace only or widen it to anywhere in `/subagents settings`.
- Keep target and resource loading separate from filesystem security. Absolute paths, shell commands, extension/custom tools, and OS-user permissions continue to follow Pi's normal model; this feature is not a sandbox.

## Context

Pi stores project-trust decisions in `~/.pi/agent/trust.json` under canonical directory keys. It resolves a target by walking toward the filesystem root and using the nearest saved `true` or `false`. Pi publicly exports:

- `ProjectTrustStore`
- `ProjectTrustStore.getEntry(cwd)`
- `hasTrustRequiringProjectResources(cwd)`

The current machine's `/home/narumi/.worktrees: true` decision therefore covers sibling worktrees. `pi-subagents` currently does not directly read that decision:

- The parent extension receives only the current directory's `ctx.isProjectTrusted()` value.
- A general subprocess child indirectly resolves the trust of its own target during startup.
- The in-process transport directly sets `SettingsManager.projectTrusted` and does not perform complete target-trust resolution.
- Consultation derives `--approve` or `--no-approve` from current-workspace trust and rejects most external working directories, ignoring an external target's saved trust.

Project trust is an input-loading guard, not a sandbox. It protects `.pi` settings, resources, packages, and extensions. Pi loads `AGENTS.md` and `CLAUDE.md` regardless of project trust unless context files are disabled. Untrusted external consultation must therefore use `--no-context-files`, not only `--no-approve`.

`pi-subagents` will only read saved trust. Pi's `/trust` remains the sole owner of trust changes and restart semantics; this extension will not write or migrate `trust.json`.

### Public settings and defaults

Add the following user-owned settings to `~/.pi/agent/pi-subagents.json`:

```json
{
  "cwdPolicy": {
    "consultation": "anywhere",
    "delegation": "trusted-targets"
  },
  "consult": {
    "resources": "project-context"
  }
}
```

`cwdPolicy.consultation` accepts:

- `"anywhere"` (default): any existing target may host a read-only consultation; an untrusted target inherits no resources.
- `"current-workspace"`: only targets equal to or below the canonical current workspace are accepted.

`cwdPolicy.delegation` accepts:

- `"trusted-targets"` (default): allow the current workspace and external saved-trusted targets.
- `"current-workspace"`: allow only targets equal to or below the canonical current workspace.
- `"anywhere"`: allow any existing target. An untrusted target still starts with `projectTrusted: false`, while the general agent retains its configured tools and ordinary Pi/OS capabilities.

This is an intentional default change: general blocking and detached delegation no longer accepts arbitrary untrusted external targets by default. Defaults remain code-only when the settings file is absent. Do not add a project override, environment variable, or per-call bypass.

## Architecture

### Shared target and trust resolver

Create one focused resolver used by consultation, blocking execution, and stateful launch:

1. Resolve a relative requested directory with `path.resolve(ctx.cwd, requestedCwd)`.
2. Canonicalize the target and current workspace with `realpath`; fail before launch for a missing path or non-directory.
3. Classify a target equal to or below the current workspace as `current-workspace`; use `ctx.isProjectTrusted()` for resource trust so session-only and CLI trust overrides remain effective.
4. For an external target, call `new ProjectTrustStore(getAgentDir()).getEntry(target)` and classify the nearest saved decision:
   - nearest `true`: `saved-trusted`
   - nearest `false`: `saved-denied`
   - no entry: `unsaved`
   - malformed/read/lock failure: `trust-error`
5. Report location policy and resource trust separately; permission to use a launch target does not imply permission to load its resources.

Trust failures must fail closed:

- Consultation with `anywhere`: continue read-only with `resources: "none"` and return a bounded trust warning in details.
- Delegation with `trusted-targets`: reject an external target with actionable `/trust` recovery guidance.
- Delegation with `anywhere`: allow the target with untrusted resources and a bounded warning.
- A nearer saved `false` must override a trusted parent and must never count as a trusted target.

The resolver must accept a test-owned `agentDir` or trust-store dependency so tests never inspect the developer's real `~/.pi/agent/trust.json`.

### Consultation behavior

| Target | Effective behavior |
| --- | --- |
| Current and session-trusted | Use configured `consult.resources` |
| External and saved-trusted | Use configured `consult.resources`; discover resources from target cwd |
| Current/external untrusted, or trust error | If target policy permits, force `resources: "none"` |
| Target disallowed by consultation policy | Fail before agent discovery, confirmation, or child launch |

`resources: "none"` must use the minimal consultation system prompt, selected-agent prompt, package read-only instruction, `--no-context-files`, `--no-skills`, `--no-prompt-templates`, `--no-approve`, `--no-extensions`, `--no-session`, and the enforced intersection of `read`, `grep`, `find`, and `ls`.

For trusted targets, `project-context` and `all` must load applicable `SYSTEM.md`, `APPEND_SYSTEM.md`, context, skill, and prompt resources from the target cwd, not the parent session workspace. Extensions remain disabled under every consultation resource policy.

Consultation details must expose only bounded, safe audit fields: canonical cwd, boundary, target-trust decision/source, requested/effective resources, and downgrade reason. Do not expose prompt contents, the full trust store, credentials, or environment values.

Agent-definition discovery remains rooted in the current session workspace and follows existing `agentScope` rules. An external target must not replace the selected agent definition.

### Blocking delegation behavior

Apply `cwdPolicy.delegation` to single mode, every parallel task, every chain step, and the fan-in aggregator.

- Resolve and preflight every target and trust decision before project-agent confirmation or any child launch, preventing partial parallel/chain execution.
- Pass each child an explicit resolved `projectTrust` so subprocess behavior cannot diverge because of `defaultProjectTrust`.
- Preserve configured tools, user resources, and ordinary Pi capabilities. An untrusted target disables Pi-protected project resources only. Pi may still load `AGENTS.md` and `CLAUDE.md`; document and report this limitation honestly.

### Stateful delegation behavior

Apply policy before external agent discovery, confirmation, write-conflict checks, worktree creation, and registry mutation.

- For `workspaceMode: "worktree"`, evaluate the caller's requested base cwd. An extension-created disposable worktree inherits the base target's resolved trust and is not rejected merely because its generated path is external.
- Give subprocess and in-process transports the same resolved target-trust boolean. Pass explicit approve/no-approve to subprocess children and the same value to the in-process `SettingsManager`; retain existing extension-loading contracts.
- Add an optional, backward-compatible target-trust snapshot/source to retained records for follow-up, inspection, and transport parity. Re-resolve trust during session restore rather than trusting an old snapshot.
- Do not hot-revoke resources from a live retained child; Pi's `/trust` contract requires restart.
- `subagent_send`, `subagent_manage`, and `subagent_mailbox` do not choose new targets. Policy changes do not cancel active work, and recovery operations remain available.

After every confirmation, worktree, or model-session `await`, revalidate abort state, session generation, and target ownership. A stale flow must clean up its owned worktree and must not register a child.

### Settings UX

Add four rows to the existing **Subagent User Settings** screen:

1. **Read-only consultation target**
   - `Anywhere · untrusted targets inherit nothing`
   - `Current workspace only`
2. **General delegation target**
   - `Current or saved-trusted folders`
   - `Current workspace only`
   - `Anywhere · normal Pi permissions`
3. **Consultation resources for trusted targets**
   - `Project context only`
   - `No inherited resources`
   - `All trusted resources`
4. **When async work finishes**
   - Existing completion choices

Display this fixed explanation:

```text
Target and trust settings control startup resources, not filesystem access or sandboxing.
Manage folder trust with Pi /trust; restart Pi after changing it.
```

Do not add a per-launch permission popup. Widening policy in Settings is the explicit action. Successful saves apply immediately and refresh model-facing tool guidance. Escape only closes the screen. Malformed settings retain the existing read-only repair state.

The manager summary, `/subagents status`, `/subagents help`, and `subagent_inspect({ action: "status" })` must report runtime/configured policies, each source, and the settings path without dumping `trust.json`. Target-specific results and errors may report only the nearest effective source.

### Public API and compatibility

- Add `cwdPolicy.consultation` and `cwdPolicy.delegation` settings types, normalization, inspection snapshots, and atomic update functions.
- Add bounded target-location/trust details to consultation, blocking result policy, retained state, and inspection projections as appropriate.
- Keep all existing tool input schemas, agent scope rules, package metadata, versions, and dependencies unchanged.
- Keep old retained records readable. Re-resolve missing trust snapshots during restore.
- Preserve unknown top-level and nested settings fields so rolling back leaves harmless `cwdPolicy` data rather than requiring migration.

## Non-Goals

- Do not implement a filesystem, network, or process sandbox.
- Do not wrap absolute paths or shell commands with a path policy.
- Do not add permission popups, project settings overrides, environment variables, or per-call target-policy bypasses.
- Do not modify, migrate, or duplicate Pi's `trust.json` algorithm; use only the public `ProjectTrustStore` and current-context trust.
- Do not change tool schemas, `agentScope`, dependencies, package metadata, versioning, or publishing workflows.

## Assumptions

- The approved intentional default is `trusted-targets` for general delegation and `anywhere` for consultation.
- Saved external trust means the nearest `ProjectTrustStore` entry is exactly `true`; an unsaved target does not become saved-trusted merely because Pi might otherwise have no trust-requiring resources.
- An allowed untrusted general target may still load `AGENTS.md` or `CLAUDE.md` under Pi's documented rules. Only resource-free consultation disables context files entirely.
- Pi `/trust` remains the user-facing way to add or revise saved trust and requires restart before retained-runtime behavior is expected to change.

## Risks

- Calling trust resolution after discovery could read an untrusted target before policy validation. Resolve and preflight first, and test zero target discovery/launch on rejection.
- A symlink could escape the workspace or inherit the wrong trust entry. Use canonical paths for both containment and `ProjectTrustStore` lookup.
- Batch validation after a first child starts could create partial work. Preflight every single/parallel/chain/fan-in target as one phase.
- Subprocess and in-process transports could load different resources. Carry one resolved trust value into both and test exact CLI flags plus `SettingsManager` state.
- `AGENTS.md` and `CLAUDE.md` can be mistaken for protected trust resources. Disable all context for untrusted consultation and document that general delegation follows Pi's ordinary exception.
- A malformed or locked trust store could fail open. Consultation may degrade to `none`; trusted-target delegation must reject; anywhere delegation must explicitly use untrusted resources.
- A stale continuation after confirmation or worktree creation could launch in a replaced session or leak a worktree. Revalidate ownership after every await and test cleanup separately.
- New settings and persistence fields could violate settings concurrency or backward compatibility. Use the existing mutation lock, latest-document reads, atomic publication, rollback behavior, and additive record parsing.
- `src/stateful.ts` is already close to 1,000 lines. Put target resolution and persistence projections in focused modules and extract cohesive stateful responsibilities if necessary.

## Rollback / Recovery

The default-policy change is reversible by setting `cwdPolicy.delegation` to `"anywhere"`. A source rollback removes enforcement, UI rows, and optional retained fields; older versions preserve the unknown `cwdPolicy` object without data conversion.

Do not write or migrate `trust.json`, so rollback has no trust-store data operation. If a settings write fails, retain the previous file, runtime value, and displayed value. If trust resolution fails, use the fail-closed behaviors defined above and point users to repair Pi trust through `/trust` or the reported trust-store error.

## Plan

- [x] Add red tests in `extensions/pi-subagents/test/settings.test.ts` for both default cwd policies, accepted and invalid values, missing-file side-effect-free loads, per-field sources, unknown-field preservation, manual reload, latest-document mutation, malformed/invalid protection, and atomic rollback; implement settings types, defaults, normalization, combined snapshots, and updaters only after the intended failures are confirmed.
- [x] Add red tests for a focused target/trust resolver using test-owned agent directories, temporary directories, and `ProjectTrustStore` fixtures. Cover current-session trust, parent `true`, nearer `false`, unsaved and malformed trust stores, relative paths, canonical descendants, siblings, symlink escapes, missing paths, and non-directories; implement canonical resolution and fail-closed classifications after red evidence.
- [x] Add red consultation tests in `extensions/pi-subagents/test/consult.test.ts` for trusted external configured resources, untrusted/denied/error automatic `none`, current-workspace restriction, target-rooted `SYSTEM.md`/`APPEND_SYSTEM.md`/context discovery, pre-discovery rejection, exact child argv, and bounded audit details; preserve read-only tools, usage, post-launch errors, replacement, shutdown, and cleanup while implementing the resolver integration.
- [x] Add red blocking tests in `extensions/pi-subagents/test/subagents.test.ts` for single, parallel, chain, and fan-in targets under current, saved-trusted, denied, unsaved, and anywhere modes. Prove policy rejection launches zero children and every accepted child receives explicit resolved trust before implementing whole-batch preflight.
- [x] Add red stateful and transport tests in `extensions/pi-subagents/test/orchestration.test.ts`, `extensions/pi-subagents/test/in-process-transport.test.ts`, and runner/subprocess tests for policy-before-read, trusted/default/anywhere targets, approve/no-approve parity, worktree trust inheritance, optional persistence fields, restore-time re-resolution, follow-up/manage/close compatibility, and lifecycle cleanup; implement stateful wiring without allowing `stateful.ts` to exceed 1,000 lines.
- [x] Add red UI integration tests in `extensions/pi-subagents/test/subagents.test.ts` for the four rows, exact labels/values/descriptions, immediate application, tool-guidance refresh, unknown JSON, failed-save rollback, malformed read-only state, Escape, narrow rendering, and non-TUI/RPC/JSON/print behavior; then wire runtime getters/setters and settings actions.
- [x] Add red status and inspection tests in `extensions/pi-subagents/test/inspect.test.ts` for runtime/configured cwd policies, per-field source, bounded target trust, pure inspection, and omission of prompts, mailbox/history, credentials, and full trust entries; implement only the approved projections.
- [x] Update `extensions/pi-subagents/README.md` with nearest-parent trust semantics, `/trust` ownership and restart behavior, tool/transport behavior matrices, `resources: "none"`, the `AGENTS.md`/`CLAUDE.md` exception, settings JSON, the intentional general-default change, the non-sandbox limitation, and container/VM guidance; verify every claim against source and tests.
- [x] Audit all touched asynchronous UI and lifecycle flows after implementation. Verify cancellation, component/session disposal, session replacement, shutdown, target ownership, worktree/process cleanup, and no stale continuation after each await; add focused regressions for any gap.
- [x] Run focused compiled tests after each red/green slice, then run `lsp_diagnostics` on changed TypeScript and `npm run check`. Resolve failures without weakening target, trust, resource, or lifecycle assertions.
- [x] Run an isolated non-provider RPC `/subagents status` smoke, a synthetic subprocess argv/resource smoke, and `just pack-subagents`; inspect the package tarball for only declared source, README, license, and entrypoint files.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`, and Pi's security, settings, extensions, TUI, and RPC documentation. Record guides, touched areas, checks, smokes, accepted deviations, and unverified paths in the implementation handoff.

## Completion Checklist

- [x] Target trust resolution uses current-context trust for the current workspace and nearest saved trust for external targets, and never fails open.
- [x] Consultation is wider by default than general delegation; every untrusted consultation is resource-free and executor-enforced read-only.
- [x] Blocking and stateful general delegation share the trusted-target default and transport-consistent project trust.
- [x] Settings UX clearly distinguishes target selection, resource inheritance, tool permissions, and sandboxing, with `/trust` ownership stated explicitly.
- [x] Batch preflight, worktree inheritance, retained restore, cancellation, replacement, and shutdown produce no partial launch or resource leak.
- [x] Existing tool schemas, `agentScope`, dependencies, package metadata, and compatible retained records remain unchanged or additive as specified.
- [x] Focused tests, `lsp_diagnostics`, `npm run check`, RPC/synthetic smokes, and `just pack-subagents` pass, with any unavailable verification left unchecked and documented.
- [x] The final semantic audit names the guides read, touched areas, checks run, accepted deviations, and unverified paths, and no required decision remains.


## Implementation Evidence

- TDD red evidence was observed for the missing cwd-policy settings exports, the missing shared resolver module, and the untrusted in-process `SettingsManager` construction that read malformed project settings before trust was applied. Each focused test passed after the corresponding production change.
- Focused compiled `pi-subagents` tests pass, including canonical/symlink trust resolution, consultation resource downgrades, whole-batch blocking preflight, stateful transport parity, disposable-worktree non-restore, retained trust re-resolution, clear/replacement serialization, malformed-settings last-known-good behavior, settings UI, status/inspection projections, and untrusted in-process project-settings suppression.
- `npm run check` passes: Biome, extension boundaries, all workspace typechecks, and 2,024 repository tests.
- `lsp_diagnostics` reports zero diagnostics across all 46 `pi-subagents` source and test files.
- Isolated RPC `/subagents status` smoke passes without provider traffic and reports runtime/configured consultation and delegation policies. Synthetic subprocess smokes verify consultation enforcement, stateful `--approve`/`--no-approve`, and untrusted in-process resource loading.
- `just pack-subagents` passes; the 36-file dry run contains the declared entrypoint, README, LICENSE, package metadata, and source modules only, with no tests, settings, state, cache, credentials, or unrelated files.
- Three independent reviewer passes found lifecycle, last-known-good settings, error-redaction, worktree-persistence, status/guidance, and pre-trust `SettingsManager` issues; all were fixed. The final reviewer verdict is PASS.
- Guides audited: `docs/extension-conventions.md`, `docs/extension-settings.md`, Pi security/project-trust, settings, extensions, TUI, and RPC documentation. Touched areas included settings concurrency and UI, target/trust resolution, protected resource loading, blocking batch preflight, stateful transport/lifecycle ownership, persistence/restore, inspection projections, and documentation.
- Every source file remains below 1,000 lines; `src/stateful.ts` was decomposed into cohesive guidance, lifecycle, and safety modules.
- Accepted unverified path: no live model-provider request was made. Provider-independent child argv, resource policy, lifecycle, usage, and error behavior are covered by synthetic subprocess and in-process tests.
