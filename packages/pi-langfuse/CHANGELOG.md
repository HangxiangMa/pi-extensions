# @narumitw/pi-langfuse

## 0.50.0

### Minor Changes

- 1086433: Add an optional `userId` setting to `pi-langfuse.json` and stamp it on every observation so Langfuse attributes traces and sessions to a user.

### Patch Changes

- Updated dependencies [3176172]
  - @narumitw/pi-tui-kit@0.55.0

## 0.49.4

### Patch Changes

- 1e630c1: Stamp the Langfuse session ID on every observation and apply session updates so session-level token and cost totals include generations.
- Updated dependencies [11bdf1e]
  - @narumitw/pi-tui-kit@0.54.1
