---
"@narumitw/pi-subagents": major
---

Remove the built-in `general` and `general-purpose` worker aliases so the built-in implementation agent catalog exposes only `worker`.
Remove Fast/Balanced/Deep execution profile presets so thinking defaults are selected by task calls or explicit per-agent settings.
Default the built-in `scout` agent to `low` thinking while `planner`, `reviewer`, and `worker` inherit unless configured.
