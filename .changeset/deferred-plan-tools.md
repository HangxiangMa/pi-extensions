---
"@narumitw/pi-plan-mode": minor
---

Plan mode now treats a tool that Pi already knows about (via `getAllTools()`) but has not yet activated as plannable, instead of hard-blocking it, when the current model supports Pi's native additive deferred-tool-loading protocol. When such a tool is actually called during planning, Plan mode activates it additively with `pi.setActiveTools()` — mirroring the `lazy-tools.ts` pattern in `pi-firecrawl` and `pi-chrome-devtools` — without removing any tool that is already active. Models that do not support native deferred tool loading keep the previous active-only Plan policy and blocking behavior unchanged.
