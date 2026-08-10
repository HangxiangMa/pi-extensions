---
"@narumitw/pi-accounts": patch
---

Pass the account menu's abort signal to provider-owned OAuth login so interactive GitHub Copilot and other provider logins do not fail while Pi is idle and stop safely when their session closes.
