---
"@narumitw/pi-subagents": patch
"@narumitw/pi-workflow": patch
---

Reduce idle Pi startup imports by loading Subagents execution and selected transport implementations, plus Workflow manager and fresh-session handoff code, only when their registered routes first need them.
