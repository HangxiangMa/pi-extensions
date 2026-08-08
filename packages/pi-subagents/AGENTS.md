# Pi Subagents Guidelines

## Process lifecycle

- Keep signalling a cancelled POSIX process group until captured stdout and stderr close because descendants can outlive the leader while retaining its streams.
- Snapshot detached-subagent terminal state before resolving waiters, inject completion with `deliverAs: "steer"` and `triggerTurn: false`, and serialize persistence callbacks in invocation order.

## Pi runtime and settings

- Provide fake Pi in subprocess tests through a test-owned `PI_PACKAGE_DIR` and `package.json#bin.pi`; never derive Pi from host `process.argv[1]`.
- Explicitly merge core-selected append resources into subprocess role prompts because `--append-system-prompt` replaces automatic `APPEND_SYSTEM.md` discovery.
- Preflight core-selected `SYSTEM.md` and `APPEND_SYSTEM.md` paths as readable regular files before `DefaultResourceLoader.reload()`.
- Pass `{ projectTrusted: false }` to `SettingsManager.create()` for an untrusted cwd because changing trust after construction is too late.
- Report malformed settings as generic invalid JSON so parser errors cannot quote sensitive file bytes.
- Retain the last-known effective policy after later read errors instead of publishing partial or default state.
