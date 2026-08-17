# pi-subagents current direction

This note is the entry point for current `@narumitw/pi-subagents` planning.

## Current product shape

`pi-subagents` is a delegation runtime, not an automatic planner.

The main agent decides whether to delegate and how to split work.

The built-in catalog is intentionally small:

| Built-in | Purpose | Default tools |
| --- | --- | --- |
| `explorer` | Bounded read-only repository exploration with cited paths and evidence. | `read`, `grep`, `find`, `ls` |
| `worker` | Implementation, command execution, fixes, and other write-capable work. | Pi default tools |

Removed built-ins and tools are not part of the active surface:

- `planner`;
- `reviewer`;
- `general`;
- `general-purpose`; and
- `subagent_auto`.

## Delegation rules

Use no subagent for simple, latency-sensitive, conversational, or tightly coupled work that the main agent can do directly.

Use `explorer` when a bounded read-only search can save main-context space or run independently.

Use `worker` when the delegated task may run commands, edit files, or perform implementation work.

Use custom user or project agents for specialist review, verification, or shell-capable read-mostly work.

Custom project agents remain subject to existing trust and confirmation behavior.

Review should usually be handled by the main agent plus review skills and deterministic checks.

Use custom verifier agents only when independent child verification is explicitly worth the added cost and coordination.

## Tool-surface direction

The current transition target is async-first.

`subagent_spawn` is preferred for independent non-critical-path work.

Blocking `subagent` remains available for synchronous output that the main agent needs before its next action.

`subagent_consult` remains the synchronous read-only exception while its use case is still supported.

Future async-only behavior needs a separate approved migration decision.

## Active follow-ups

- [`2026-08-17_pi-subagents-async-first-tool-surface-plan.md`](../plans/2026-08-17_pi-subagents-async-first-tool-surface-plan.md) defines the async-first and tool-surface migration questions.
- [`2026-08-17_pi-subagents-main-agent-led-delegation-guidance-plan.md`](../plans/2026-08-17_pi-subagents-main-agent-led-delegation-guidance-plan.md) defines prompt and documentation cleanup for main-agent-led delegation.
- [`2026-08-10_pi-subagents-event-driven-workflow-runtime-plan.md`](../plans/2026-08-10_pi-subagents-event-driven-workflow-runtime-plan.md) remains the owner for rolling execution of caller-authored workflows.
- [`2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md`](../plans/2026-08-10_pi-subagents-minimal-delegation-admission-evaluation-plan.md) remains the owner for matched evidence before any adaptive/default routing change.

## Current reference notes

- [`pi-subagents-capability-matrix.md`](pi-subagents-capability-matrix.md) records maintained capability boundaries.
- [`pi-subagents-stateful-runtime.md`](pi-subagents-stateful-runtime.md) records detached lifecycle and transport behavior.
- [`pi-subagents-rpc-v1.md`](pi-subagents-rpc-v1.md) records the RPC transport contract.

## Historical evidence

Historical notes are retained for evidence only and are not active product direction.

- [`archived/pi-subagents-autonomous-workflow-planning.md`](archived/pi-subagents-autonomous-workflow-planning.md) describes the removed `subagent_auto` design.
- [`archived/pi-subagents-proactivity-research.md`](archived/pi-subagents-proactivity-research.md) predates the current minimal built-in catalog.
- [`archived/pi-subagents-l1-proactivity-eval.md`](archived/pi-subagents-l1-proactivity-eval.md) preserves historical evaluated expectations.
- [`archived/pi-subagents-native-runtime-verification.md`](archived/pi-subagents-native-runtime-verification.md) preserves old runtime smoke evidence.
- [`../roadmaps/archived/2026-08-10_pi-subagents-full-automation-roadmap.md`](../roadmaps/archived/2026-08-10_pi-subagents-full-automation-roadmap.md) is historical only.
