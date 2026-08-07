# @narumitw/pi-chrome-devtools

## 0.49.4

### Patch Changes

- 1b64919: Pass `--do-not-de-elevate` when auto-launching the managed browser so Chrome no longer relaunches de-elevated and exits when Pi runs in an elevated Windows terminal, which the launch watchdog misread as "Auto-launched browser exited before DevTools became available."
