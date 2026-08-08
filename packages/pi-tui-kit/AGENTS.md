# Pi TUI Kit Guidelines

## Runtime boundary

- Keep production JavaScript on public `pi-tui` primitives and make coding-agent imports type-only.
- Do not import the `pi-coding-agent` runtime root because repository resolution can evaluate a second agent runtime.
- Lazy-load command menus until consumers require the published Kit boundary.

## Interaction and tests

- Dispatch injected keys and distinct Back or Close outcomes in Kit wrappers instead of relying on public `SelectList.handleInput()` or `ctx.ui.select()`.
- Reserve only a standalone Space key for searchable-wrapper activation; never strip spaces from an entire pasted input chunk.
- Treat settings and multi-select actions as asynchronous settlements.
- Drain pending callbacks and observe an accepted transition with the async-capable `runCustomInteraction()` harness.
