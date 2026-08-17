# Pi Subagents Delegation Intelligence Roadmap

- **Status:** Current strategy summary.
- **Audience:** `@narumitw/pi-subagents` maintainers and contributors.
- **Entry point:** [`pi-subagents-current-direction.md`](../implementation-notes/pi-subagents-current-direction.md).

## Direction

Keep `pi-subagents` as a delegation runtime.

Do not make it an automatic planner or router by default.

The main agent decides whether to delegate and how to split work.

Caller-authored workflows remain explicit.

Automation, adaptive routing, wider mutating teams, recursion, and default routing changes require matched evidence and separate approval.

## Current surface

The maintained built-in agents are:

| Built-in | Purpose |
| --- | --- |
| `explorer` | Read-only repository exploration with `read`, `grep`, `find`, and `ls`. |
| `worker` | General implementation and command execution with Pi default tools. |

The removed active surfaces are:

- `planner`;
- `reviewer`;
- `general`;
- `general-purpose`; and
- `subagent_auto`.

Review and planning guidance should point to the main agent, skills, deterministic checks, custom agents, or explicit `subagent.workflow` payloads.

## Implemented capabilities

`pi-subagents` currently provides:

- blocking single, parallel, chain, fan-in, panel, and caller-authored workflow execution;
- detached `subagent_spawn`, follow-up, management, and mailbox lifecycle tools;
- metadata-only `subagent_inspect`;
- synchronous read-only `subagent_consult`;
- subprocess, in-process, RPC, and automatic transport selection;
- target trust resolution, context selection, output bounds, timeout checkpoints, and cleanup;
- capability manifests, execution plans, grants, structured results, WorkItems, semantic snapshots, and verification receipts for opted-in workflows; and
- generation-aware cancellation and stale-result rejection for the supported contracted paths.

The capability matrix remains the detailed boundary record: [`pi-subagents-capability-matrix.md`](../implementation-notes/pi-subagents-capability-matrix.md).

## Active follow-ups

| Follow-up | Owner |
| --- | --- |
| Async-first and tool-surface simplification | [`2026-08-17_pi-subagents-async-first-tool-surface-plan.md`](../plans/2026-08-17_pi-subagents-async-first-tool-surface-plan.md) |
| Main-agent-led guidance cleanup | [`2026-08-17_pi-subagents-main-agent-led-delegation-guidance-plan.md`](../plans/2026-08-17_pi-subagents-main-agent-led-delegation-guidance-plan.md) |
| Rolling runtime for caller-authored workflows | [`2026-08-10_pi-subagents-event-driven-workflow-runtime-plan.md`](../plans/2026-08-10_pi-subagents-event-driven-workflow-runtime-plan.md) |
| Matched evidence before adaptive/default routing | [`2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md`](../plans/2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md) |

## Deferred or rejected ideas

| Idea | Current disposition |
| --- | --- |
| Built-in planner or reviewer roles | Removed; use main-agent skills or custom agents. |
| `subagent_auto` objective-to-DAG planning | Removed; use caller-authored `subagent.workflow`. |
| Extension-owned automatic topology selection | Deferred until matched evidence and explicit approval. |
| Recursive workflow grandchildren | Rejected until separately evaluated and approved. |
| More than two concurrent mutating children | Rejected until separately evaluated and approved. |
| Treating tool policy as OS sandboxing | Rejected; docs must keep the boundary explicit. |

## Evidence requirements

A future default or adaptive delegation change must compare against simpler baselines.

The comparison must use the same model, task sample, information, tool access, evaluator, aggregate budget, and wall-clock ceiling.

It must report verified success, cost, tokens, latency, unnecessary delegation, conflict/rework rate, stale-result rejection, cancellation containment, and accepted late results.

A deterministic simulation cannot replace the paired evidence gate.

No publication, release, tag, visibility change, default routing change, or release workflow dispatch is part of this roadmap.

## Historical records

Superseded full-automation and `subagent_auto` design notes were removed from the active docs tree.

Git history remains the historical record.

Research inputs remain under [`../research/`](../research/).
