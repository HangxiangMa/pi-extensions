---
"@narumitw/pi-subagents": major
---

Persist detached completion outbox records with stable completion, run, and generation identities so unacknowledged results can be redelivered after restart without rerunning child work.

Move retained-run listing exclusively to `subagent_inspect` and remove the compatibility `list` action from `subagent_manage`.
