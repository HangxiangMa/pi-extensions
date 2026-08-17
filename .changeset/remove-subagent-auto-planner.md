---
"@narumitw/pi-subagents": major
---

Remove the built-in `planner` subagent and the `subagent_auto` autonomous workflow planning tool.
Also remove `bash` from the built-in `explorer` default tools so automatic transport keeps a default read-only in-process route.
Use main-agent-authored `subagent` workflow calls when explicit task graphs are needed.
