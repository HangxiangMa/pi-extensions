# 🎯 pi-goal — Goal Mode for the Pi Coding Agent

[![npm](https://img.shields.io/npm/v/@narumitw/pi-goal)](https://www.npmjs.com/package/@narumitw/pi-goal) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@narumitw/pi-goal` is a native [Pi coding agent](https://pi.dev) extension that adds `/goal <goal_to_complete>` and a `goal_complete` tool for autonomous, verifiable task completion.

Goal mode keeps sending automatic follow-up messages until the agent calls `goal_complete`, so tasks such as `/goal implement snake game` continue past planning, partial progress, and intermediate tool calls.

## ✨ Features

- Adds `/goal <goal_to_complete>` to start goal mode.
- Adds `/goal-status` to show the active goal.
- Adds `/goal-stop` to cancel the active goal loop.
- Registers a `goal_complete` tool for explicit completion.
- Automatically prompts the agent to continue if a turn ends early.
- Encourages verification before the goal is marked complete.

## 📦 Install

```bash
pi install npm:@narumitw/pi-goal
```

Try without installing permanently:

```bash
pi -e npm:@narumitw/pi-goal
```

Try this package locally from the repository root:

```bash
pi -e ./extensions/pi-goal
```

## 🚀 Commands

```text
/goal implement snake game
/goal-status
/goal-stop
```

- `/goal <goal_to_complete>` starts goal mode and asks the agent to keep working until complete.
- `/goal-status` shows the active goal.
- `/goal-stop` cancels the active goal loop.

## ✅ How completion works

The extension registers a `goal_complete` tool. While a goal is active, the system prompt tells the agent to keep working, verify the result, and call `goal_complete` only when the goal is fully done.

If an agent turn ends before `goal_complete` is called, the extension automatically sends a follow-up prompt to continue the same goal.

## 🧠 Use cases

- Finish implementation tasks without stopping at a plan.
- Keep debugging until the bug is verified fixed.
- Run refactors that require multiple tool cycles.
- Encourage agents to test, lint, or typecheck before completion.
- Make long-running Pi coding sessions more autonomous.

## 🗂️ Package layout

```txt
extensions/pi-goal/
├── src/
│   └── goal.ts
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```

The package exposes its Pi extension through `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/goal.ts"]
  }
}
```

## 🔎 Keywords

Pi extension, Pi coding agent, goal mode, autonomous coding agent, AI agent workflow, task completion, agent loop, verification, TypeScript Pi package.

## 📄 License

MIT. See [`LICENSE`](./LICENSE).
