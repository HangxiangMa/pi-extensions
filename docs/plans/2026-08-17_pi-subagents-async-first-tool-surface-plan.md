# Pi Subagents Async-First Tool Surface Plan

## Goal

Make `pi-subagents` smaller and easier to choose by moving the product direction from all-tools-by-default toward async-first behavior and, later, async-only behavior when evidence and migration support are sufficient.

Keep the main agent responsible for task decomposition while preserving explicit escape hatches for synchronous output and read-only consultation during the transition.

## Context

The built-in agent catalog is now only `explorer` and `worker`.

`planner`, `reviewer`, `general`, `general-purpose`, and `subagent_auto` are removed.

The default `all` workflow still exposes seven tools: `subagent`, `subagent_spawn`, `subagent_send`, `subagent_manage`, `subagent_mailbox`, `subagent_inspect`, and `subagent_consult`.

`async-only` already exists, but it is not the default.

The desired product direction is async-first now and async-only later.

## Non-Goals

- Do not remove blocking delegation without a migration path and explicit approval.
- Do not remove `subagent_consult` until its synchronous read-only use case has a replacement or an intentional deprecation decision.
- Do not add a new autonomous planner or router.
- Do not publish, release, tag, or change npm visibility from this plan.

## Plan

- [ ] Audit current tool registration for `all`, `async-only`, `blocking-only`, and `disabled`; record the exact tool names, prompt snippets, prompt guidelines, README promises, and tests that define each mode.
- [ ] Decide whether async-first means a settings default change, a stronger `/subagents` recommendation, a README quick-start change, or only model-facing prompt guidance for the first step.
- [ ] Define the migration policy for blocking `subagent`, including whether it stays available as an explicit compatibility route, moves behind `blocking-only`, or remains in `all` until a later major release.
- [ ] Define the migration policy for `subagent_consult`, including whether it remains the synchronous read-only exception under an async-first posture.
- [ ] Decide whether lifecycle tools should stay split as `subagent_spawn`, `subagent_send`, `subagent_manage`, and `subagent_mailbox`, or whether a smaller command/tool shape should be proposed separately.
- [ ] Update `packages/pi-subagents/README.md` so quick start, workflow selection, examples, and security notes describe async-first usage before blocking workflow usage.
- [ ] Update tool prompt metadata so the main agent prefers `subagent_spawn` for independent non-critical-path work and uses blocking `subagent` only when the next action truly requires child output.
- [ ] Add or update tests for registration surfaces, disabled-state guidance, mode-specific prompt guidance, and any changed settings default.
- [ ] Add a Changeset for any published behavior change, and omit one only if the work is documentation-only.
- [ ] Run focused pi-subagents tests, `npm run check`, `git diff --check`, and `just pack subagents` when package behavior or README package contents change.

## Completion Checklist

- [ ] The default and recommended tool surfaces are documented in one place and match registration tests.
- [ ] Async-first behavior is defined without surprising users who still need synchronous child output.
- [ ] Blocking delegation and consultation each have an explicit keep, migrate, or deprecate decision.
- [ ] Model-facing guidance names available tools only in modes where those tools are registered.
- [ ] README examples lead with main-agent-authored async delegation and reserve blocking workflows for intentional synchronous cases.
- [ ] Tests and required checks pass, or unavailable runtime smokes are recorded with reasons.
- [ ] No release or publication action occurs without separate explicit approval.
