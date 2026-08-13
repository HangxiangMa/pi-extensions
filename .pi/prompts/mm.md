---
description: Inspect a target and render a compact, evidence-based Mermaid diagram
argument-hint: "<target and optional view>"
---

Diagram target: $ARGUMENTS

Turn the specified target into one accurate Mermaid diagram optimized for Pi's terminal UI.

## Inspect

1. Require a concrete target, such as a package, feature, component, API, or user workflow.
   If no target was provided, ask what the user wants to understand and stop.
2. Read the repository instructions first.
3. Inspect the relevant entry points, implementation, configuration, tests, and documentation.
4. Trace the requested behavior end to end before drawing it.
5. Infer the most useful view when the target is clear but the desired view is omitted.
6. Ask at most one focused question only when the target or view remains materially ambiguous.
7. Include only relationships supported by inspected evidence.
8. Label any material inference as an assumption rather than presenting it as verified fact.

## Choose the diagram

Use the simplest suitable Mermaid diagram type:

- Use `flowchart` for architecture, dependencies, control flow, data flow, and user workflows.
- Use `sequenceDiagram` for interactions ordered over time.
- Use `stateDiagram-v2` for states and transitions.
- Use `classDiagram` for types, classes, interfaces, and their relationships.
- Use `erDiagram` for data models and database relationships.
- Use `gantt` only for schedules or phased delivery plans.

## Optimize for the TUI

- Prefer `flowchart TD` over a wide left-to-right flowchart.
- Show the primary path, important decisions, and terminal outcomes only.
- Collapse repeated work, retries, and similar error or stopped states into one node when accurate.
- Target 8 to 12 nodes or entities and do not exceed 14 unless accuracy requires it.
- Keep decision nodes to at most three outgoing branches.
- Use no more than two small groups, and omit groups when they do not improve understanding.
- Keep labels short, ideally three to seven words and no more than two visual lines.
- Avoid long prose, source-code fragments, decorative styling, and dense cross-links inside the diagram.
- If the complete system is too large, diagram the most relevant end-to-end slice instead of shrinking unreadable detail into one chart.

## Mermaid compatibility

- Use broadly supported Mermaid syntax.
- Use simple ASCII identifiers and quote labels when needed.
- Avoid experimental directives, custom themes, icons, and renderer-specific features.
- Keep the direction and edge labels consistent.

## Return

1. One sentence describing the diagram's scope.
2. One fenced `mermaid` code block that Pi can render in the TUI.
3. An `Evidence` list containing at most five of the most relevant file paths.
4. An `Assumptions` list only when assumptions were necessary.

Return one primary diagram unless the user explicitly requests multiple views.
Do not modify files or implementation unless explicitly asked.
