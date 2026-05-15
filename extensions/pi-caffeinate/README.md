# pi-caffeinate

A public [pi](https://pi.dev) extension package that keeps your computer awake while the pi agent is processing a prompt.

The extension starts an OS sleep inhibitor on `agent_start` and releases it on `agent_end` or `session_shutdown`.

## Install

```bash
pi install npm:@narumitw/pi-caffeinate
```

Try without installing:

```bash
pi -e npm:@narumitw/pi-caffeinate
```

Try this package locally from the repository root:

```bash
pi -e ./extensions/pi-caffeinate
```

## Supported platforms

- macOS: uses `caffeinate -dimsu`
- Windows: uses PowerShell `SetThreadExecutionState`
- WSL: uses Windows `powershell.exe` with `SetThreadExecutionState`
- Linux: uses `systemd-inhibit` with `sleep infinity`
- Linux fallback: uses `caffeinate -dimsu` if available

If no supported inhibitor is available, the extension stays loaded and reports that caffeinate is unavailable.

## Commands

```text
/caffeinate-status
```

Shows whether an inhibitor is active, unavailable, or disabled.

```text
/caffeinate-stop
```

Manually releases any active inhibitor for the current session.

## Configuration

Disable the extension:

```bash
PI_CAFFEINATE_DISABLED=1 pi
```

Use a custom inhibitor command:

```bash
PI_CAFFEINATE_COMMAND='systemd-inhibit --what=idle:sleep --why="pi running" --mode=block sleep infinity' pi
```

The custom command is parsed with shell-like quoting and is run directly without a shell.

## Package layout

```txt
extensions/pi-caffeinate/
├── src/
│   └── caffeinate.ts
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```
