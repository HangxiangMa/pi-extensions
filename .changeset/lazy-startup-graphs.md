---
"@narumitw/pi-goal": patch
"@narumitw/pi-chat": patch
"@narumitw/pi-sync": patch
---

Reduce idle startup imports by loading Goal presentation, Chat networking and UI, and Sync operation-specific modules only when their routes require them.
