---
"@narumitw/pi-subagents": major
---

Persist detached completion outbox records with stable completion, run, and generation identities, retry transient terminal writes before resolving, and acknowledge only IDs observed in parent context so unacknowledged results can be redelivered without rerunning child work.

Move retained-run listing exclusively to `subagent_inspect` and remove the compatibility `list` action from `subagent_manage`.
