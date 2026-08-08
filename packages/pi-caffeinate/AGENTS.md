# Pi Caffeinate Guidelines

- On WSL, prefer Windows `powershell.exe` with `SetThreadExecutionState` because `systemd-inhibit` may lack usable logind.
- Release Windows execution-state flags on stdin EOF, and parent-bind or trap Unix inhibitor processes.
