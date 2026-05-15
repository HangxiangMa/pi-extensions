# pi-goal

A public [pi](https://pi.dev) extension package that adds `/goal <goal_to_complete>`.

Goal mode keeps sending automatic follow-up messages until the agent calls the `goal_complete` tool, so tasks such as `/goal implement snake game` continue past planning and partial progress.

## Install

```bash
pi install npm:@narumitw/pi-goal
```

Try without installing:

```bash
pi -e npm:@narumitw/pi-goal
```

Try this package locally from the repository root:

```bash
pi -e ./extensions/pi-goal
```

## Commands

```bash
/goal implement snake game
/goal-status
/goal-stop
```

- `/goal <goal_to_complete>` starts goal mode and asks the agent to keep working until complete.
- `/goal-status` shows the active goal.
- `/goal-stop` cancels the active goal loop.

## How completion works

The extension registers a `goal_complete` tool. While a goal is active, the system prompt tells the agent to keep working, verify the result, and call `goal_complete` only when the goal is fully done.

If an agent turn ends before `goal_complete` is called, the extension automatically sends a follow-up prompt to continue the same goal.

## Package layout

```txt
extensions/pi-goal/
├── src/
│   └── goal.ts
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```

The package exposes its extension through `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/goal.ts"]
  }
}
```
