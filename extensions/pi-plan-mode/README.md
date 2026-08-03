# 🧭 pi-plan-mode — Codex-like Plan Mode for Pi

[![npm](https://img.shields.io/npm/v/@narumitw/pi-plan-mode)](https://www.npmjs.com/package/@narumitw/pi-plan-mode) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

`@narumitw/pi-plan-mode` adds a Codex-like `/plan` collaboration mode to Pi. Plan mode is for read-only exploration, clarifying questions, and a structured implementation-ready plan before any code mutation happens.

Pi core intentionally does not ship a built-in plan mode; this package provides one as an independently installable extension.

## ✨ Features

- Adds `/plan` to enter or manage Plan mode.
- Adds `--plan` to start a session in Plan mode.
- Enables built-in read-only tools by default while Plan mode is active.
- Disables extension and custom tools by default, with a `/plan tools` selector for explicit user-risk opt-in.
- Blocks `update_plan`, mutating built-in tools, and unsafe `bash` forms such as writes, substitutions, background jobs, dependency installs, and mutating Git commands.
- Injects Codex-like Plan mode instructions: explore first, ask decision questions for high-impact ambiguity, do not mutate files, and finalize only when decision-complete.
- Adds required `plan_mode_question` and `plan_mode_complete` tools for structured questions and completion.
- Presents the complete plan and prompts you to implement, export it to a chosen Markdown file, save it for later, stay in Plan mode, or exit and discard it.
- Exports ready, saved, or active implementation plans with `/plan export [path]` without overwriting existing paths; exporting a ready plan completes and exits Plan mode.
- Keeps legacy `<proposed_plan>` responses compatible without advertising XML as the primary workflow.
- Shows Plan mode state in Pi's statusline as `plan active`, `plan ready`, `plan saved`, or `plan implementing`; `@narumitw/pi-statusline` adds the default `📝` icon unless configured otherwise.
- Persists Plan mode, one session-local saved plan, and active implementation state so resume and compaction retain the exact accepted plan.

## 📦 Install

This release requires Pi 0.80.6 or newer.

```bash
pi install npm:@narumitw/pi-plan-mode
```

Try without installing permanently:

```bash
pi -e npm:@narumitw/pi-plan-mode
```

Try this package locally from the repository root:

```bash
pi -e ./extensions/pi-plan-mode
```

## 🚀 Usage

```text
/plan
/plan <prompt>
/plan tools
/plan show
/plan finalize
/plan implement
/plan save
/plan export [path]
/plan exit
```

Use `/plan` to enter Plan mode before writing your planning prompt. Use `/plan <prompt>` to enter
Plan mode and immediately submit `<prompt>` as the first Plan-mode user message. Use `/plan tools`
to choose which tools are active while Plan mode is enabled; the standard bounded multi-select shows
10 rows at a time, supports viewport paging, descriptions, and explicit unavailable rows for blocked
tools. In TUI mode, type to fuzzy-search tool names, descriptions, policy, and source metadata; clear
the query to restore the stable tool cursor. RPC keeps the complete unfiltered tool list. The
`plan_mode_question` tool keeps its one-off question/choice dialog because it is a
model-requested planning interaction, not command-menu navigation. `/plan show` displays the stored
plan without starting a model turn, including the accepted plan while implementation is active.
`/plan finalize` explicitly asks the agent to complete the plan or ask one remaining material
question, `/plan save` stores a completed ready plan for later and leaves Plan mode, `/plan
export [path]` writes a ready, saved, or active implementation plan to Markdown, and `/plan
implement` hands a ready or saved plan to a normal implementation turn. A successful ready-plan
export also leaves Plan mode; saved and active implementation exports retain their existing state.
`show`, `save`, `export`, and `implement` fail closed when no applicable plan is stored; `finalize`
requires active Plan mode.

`/plan export` creates `PLAN.md` in Pi's current working directory. Supply a path to choose another
location; relative paths resolve from that directory, absolute paths remain absolute, and missing
parent directories are created. Export never overwrites an existing file, directory, or symbolic
link: choose another path or remove the existing target first. A successful export adds one trailing
newline but otherwise preserves the accepted Markdown exactly. After a ready plan is written, Plan
mode ends, its tools and thinking level are restored, and the ready state is cleared without starting
a model turn. Exporting a saved or active implementation plan leaves that state unchanged. Failed or
cancelled exports leave every Plan-mode state unchanged. The resulting file is available to the agent
through its normal file-reading tools. Export is an explicit user-requested file mutation;
model-initiated Plan-mode writes remain blocked.

In TUI and RPC, **Export plan…** opens a single-line path input from every ready, saved, or active
plan menu. Submit an empty value to use `PLAN.md`, or enter a relative or absolute custom path. A
failed TUI export retains the draft for correction; RPC reopens its input dialog. Escape returns to
the owning menu without writing a file. A successful ready-plan export closes the menu and ends Plan
mode; saved and active implementation menus close without changing their stored state.

When Plan mode is active, ask the agent to design the change. The agent may inspect files and run read-only commands, but it should not edit files or execute the implementation. It should explore first, then use structured questions when your preference or a tradeoff materially changes the plan.

By default, Plan mode manages only Pi's built-in tools: `read`, limited `bash`, available read-only built-ins such as `grep`, `find`, and `ls`, plus the required `plan_mode_question` and `plan_mode_complete` tools. Built-in `edit` and `write` are blocked. `update_plan` is also blocked because it tracks execution progress rather than conversational planning. Extension and custom tools are disabled by default because Pi tools do not expose standardized mutability metadata; enable them from `/plan tools` only when you accept the risk for that session. For example, you can opt into `firecrawl_scrape`, `firecrawl_search`, or `lsp_diagnostics` if those extensions are loaded and you want to use them during planning.

Limited `bash` uses a fail-closed policy, including when an extension overrides the canonical `bash` tool name. It accepts common inspection commands, read-only Git and npm queries, pipelines and command lists composed entirely of accepted commands, plus selected checks such as `npm test`, `npm run typecheck`, and `cargo test`. It rejects output/input redirects, shell expansion, substitutions, subshells, background jobs, mutating flags, dependency changes, editors, and unknown commands. Tests and builds may still write ignored caches or build artifacts and may execute project-defined hooks; enable or invoke them only when the repository is trusted. This is extension-level risk reduction, not an OS sandbox.

`plan_mode_question` follows Codex's `request_user_input` pattern: the agent can ask 1-3 concise questions, each with meaningful options and a free-form Other path. If you cancel or no interactive UI is available, the agent should ask a concise plain-text question or proceed only with a clearly stated low-risk assumption instead of prematurely producing a final plan.

Pi activates tools by tool name. The `/plan tools` standard selector stores selections by name and
shows each currently effective tool's source from Pi metadata, such as `built-in`, a user extension
path, or a project extension path. If an extension overrides a built-in tool with the same name, Pi exposes the effective tool for that name and the selector shows that source.

A complete Plan mode answer should appear only after the agent has resolved discoverable facts and high-impact user decisions. The agent must call `plan_mode_complete({ plan })` alone as its final action, passing the complete Markdown plan. The tool rejects empty or whitespace-only plans and plans longer than 50,000 JavaScript characters; it does not truncate. Its visible result contains the full plan, and versioned result details let the extension restore it safely from the active session branch.

`plan_mode_complete` uses Pi's `terminate: true` hint. Termination is best effort: if a model puts it in a parallel tool batch, Pi terminates the batch early only when every finalized sibling tool also terminates. The prompt therefore requires the completion call to be standalone and last. The extension deliberately does not infer completion from phrases such as “I will present the plan,” and it does not automatically retry a turn with no plan because research and clarification turns may legitimately remain unfinished. If a turn ends without a plan, Plan mode stays active; use `/plan finalize` for explicit recovery.

Legacy sessions and models may still submit one non-empty `<proposed_plan>` block with tags on their own lines. That compatibility path remains accepted, but it is not the primary workflow. Empty, malformed, unclosed, or multiple legacy blocks keep Plan mode active and produce a warning.

After completion, `/plan` opens the ready actions when interactive UI is available. Choosing implementation—or running `/plan implement`—disables Plan mode, restores full tool access, and starts an implementation turn with the stored plan. Choosing **Export plan…** asks for a destination, writes the plan, restores normal tools and thinking, and leaves Plan mode without starting a model turn. Choosing **Save for later**—or running `/plan save`—instead stores one plan in the current Pi session before leaving Plan mode.

A saved plan appears as `plan saved` and remains available after reload, resume, branch-local fork, and compaction in that session. It does not expire automatically, cross into a new session, or participate in ordinary model context. Open `/plan` to Show, Implement, Export, or Clear it; `/plan show`, `/plan implement`, `/plan export [path]`, and `/plan exit`/`off` provide the same direct routes in TUI and RPC. Implementation checks the selected model and authentication before consuming the saved plan. Starting another workflow with `/plan <prompt>` or `/plan tools` is blocked until the saved plan is implemented or cleared, so the single saved slot is never silently overwritten. Resuming that session with `--plan` moves the saved plan back to ready Plan mode. Cancellation or failed implementation preflight leaves it unchanged.

Text print and JSON modes can export any stored plan with `/plan export [path]`, save a ready plan with `/plan save`, and clear it with `/plan exit` or `/plan off`. Successful export is observable through the created file; exporting a ready plan also leaves Plan mode, while saved and active implementation state remains unchanged. An existing target or missing plan fails the command without changing state. These modes reject saved-plan display and implementation before changing state because Pi provides neither printable custom-message output nor acknowledged extension-triggered turns; resume the session in TUI or RPC to show or implement it.

Once implemented, the exact accepted plan remains active across later turns, session resume, and manual or automatic compaction without depending on the compaction summary. Plan mode avoids a duplicate context block while the original implementation handoff remains available and injects one hidden canonical copy after that handoff is compacted away. This can consume up to the existing 50,000-character plan limit in model context when reinjection is needed.

While implementation is active, `/plan show` displays the accepted plan. Interactive `/plan` offers Show, Export plan…, Start a new plan, and Clear; `/plan exit` and `/plan off` are the direct clear routes. Starting a new Plan-mode workflow or implementing a replacement plan supersedes the previous active plan. The extension deliberately does not infer completion from assistant prose or agent settlement, so clear the active plan when the implementation no longer applies. Choosing Stay before implementation keeps the plan ready. Revision feedback starts another Plan-mode turn and clears the previous implementable plan until an updated completion arrives. For clarification-only follow-ups, the agent answers and resubmits the complete unchanged plan so it remains implementable. Before saving or implementation, exit/off discards the ready plan and removes its completion result from later non-Plan model context.

While Plan mode is enabled, the extension also publishes a compact status for Pi statuslines. With `@narumitw/pi-statusline`, this appears in the extension status area:

- `plan active`: Plan mode is enabled and still gathering context or drafting a plan.
- `plan ready`: A completed plan is stored until you implement it, export it, save it, continue planning, or exit Plan mode.
- `plan saved`: One completed plan is stored outside model context in the current session until you implement or clear it.
- `plan implementing`: The exact accepted plan remains active until you clear or supersede it.

You can also exit directly. Before implementation, direct exit discards the latest proposed plan; while a plan is saved, it clears that saved plan. During implementation, it removes both the original implementation handoff and the extension's canonical active-plan block from later model calls; an earlier Pi-generated compaction summary may still describe prior work:

```text
/plan exit
```

## ⚙️ Settings

Create `$PI_CODING_AGENT_DIR/pi-plan-mode.json` (normally `~/.pi/agent/pi-plan-mode.json`) to configure Plan mode globally. The file is optional, is read at session start, and is never created automatically.

```json
{
  "thinkingLevel": "inherit",
  "defaultPlanTools": ["read", "bash", "grep", "find", "ls"],
  "safeSubcommands": {
    "git": ["status", "log", "rev-parse", "blame"],
    "gh": ["pr view", "pr list", "issue view", "issue list"]
  }
}
```

### Default Plan tools

`defaultPlanTools` defines the initial tool selection when a session has no stored `/plan tools` selection. Omit it to keep the available safe built-ins as the default. An explicit empty array is valid and enables only the required `plan_mode_question` and `plan_mode_complete` tools.

Tool names must be non-empty strings; duplicates are removed in first-seen order. Unknown, unavailable, and Plan-mode-blocked names are ignored when tools are activated. A tool registered after Plan mode is already active is not added automatically; re-enter Plan mode or reopen `/plan tools` to reapply the selection. Non-built-in tools named in this global setting are an explicit user-risk opt-in, just like selecting them with `/plan tools`. Plan mode does not interpret their arguments or actions: enabling one trusts the whole effective tool. Pi resolves tools by name, so if an extension overrides a built-in name, the effective extension tool is selected instead. An effective tool named `bash` remains subject to the limited-shell policy regardless of its source metadata.

A selection made with `/plan tools` is stored in that Pi session and takes precedence over `defaultPlanTools` when the session resumes. The global setting remains the baseline for fresh sessions and sessions without an explicit selection.

### Safe shell subcommands

`safeSubcommands` adds reviewed command validators to limited `bash`; it is not a raw shell allowlist. Only the following exact values are accepted:

- `git`: `status`, `log`, `diff`, `show`, `branch`, `remote`, `ls-files`, `grep`, `rev-parse`, `blame`, `describe`, `merge-base`, `ls-tree`, and `cat-file`.
- `gh`: `pr view`, `pr list`, `issue view`, and `issue list`.

The first eight Git validators are built in and remain enabled when omitted, so listing them is valid but redundant. The other six Git validators and every `gh` path require an explicit opt-in. Git entries select one exact subcommand; `gh` entries select one exact two-word path, so `"pr view"` never enables `pr merge`, `pr close`, or `pr edit`. Omitted `safeSubcommands`, an empty object, and empty arrays preserve the default policy. Duplicate values are removed in first-seen order.

With the example configuration above, commands such as these are accepted:

```bash
git rev-parse --show-toplevel
git blame --no-textconv -- src/plan-mode.ts
gh pr view 218 --json number,title,state
gh issue list --state open --json number,title,state
```

The command-specific validators still reject unsafe forms, including:

```bash
git blame -- src/plan-mode.ts
git cat-file --filters HEAD
git diff
git log -Ssecret
git remote show origin
git show --ext-diff HEAD
gh pr merge 218
gh pr view 218
gh pr view 218 --web
gh pr view 218 > pr.txt
gh pr list --json number,title && gh pr merge 218
```

Redirects, shell expansion and substitution, pagers or browsers, external diff/textconv/filter/signature helpers, output flags, malformed command layouts, and any chain containing an unsafe segment fail closed. Commands that can invoke configured Git helpers implicitly require explicit guards: use `--no-textconv` with `blame`, `show`, and patch-producing or pickaxe/searching `log`; use both `--no-ext-diff` and `--no-textconv` with content-producing `diff` (`git diff --check` remains accepted); and use `git remote show -n` to avoid invoking a transport helper. GitHub CLI read paths require `--json <fields>` output so Plan mode does not rely on `GH_PAGER`, `PAGER`, or gh pager configuration. Unknown `safeSubcommands` keys or values, non-array values, and non-string entries invalidate the entire settings file and trigger the normal warning/default fallback on session start.

Read-only does not mean private: Git inspection can expose repository history and tracked secrets, while `gh` queries can expose remote repository, pull request, and issue data available to your authenticated account. The policy reduces accidental mutation and helper execution; it is not a sandbox or a confidentiality boundary.

### Thinking level

Plan mode inherits Pi's current thinking level by default. Set `thinkingLevel` to request a fixed level only while Plan mode is active. Supported values are `inherit`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. The extension snapshots the prior level and restores it on exit only if the level still matches the value it applied; a manual change made during Plan mode is preserved. The setting never changes Pi's default thinking level.

Invalid settings produce a warning and fall back to inherited thinking plus the available safe-built-in tool defaults. Compatibility: a valid legacy `plan-mode.json` remains readable with a warning and is never modified automatically; rename it to `pi-plan-mode.json`. If both files exist, the new filename takes precedence.

## 🧠 Codex-like behavior

This extension maps Codex's `ModeKind::Plan` behavior onto Pi's extension API:

- Plan mode is a conversational collaboration mode, not TODO/progress tracking.
- `/plan <prompt>` follows Codex behavior by switching to Plan mode before submitting the inline prompt.
- The agent should use `plan_mode_question` for important non-discoverable preferences or tradeoffs before finalizing.
- The agent completes with a standalone `plan_mode_complete` tool call instead of relying on semantic prose detection.
- `update_plan` checklist use is blocked while Plan mode is active.
- The implementation boundary is explicit: Plan mode restores tools before saving or starting implementation, saving keeps the plan outside ordinary model context, choosing implementation immediately triggers a normal agent turn with full tool access, and the accepted plan remains active across compaction until exit/off or a replacement workflow clears it.
- Pi extension safety is approximated with tool classification and fail-closed filtering for every effective tool named `bash`; other non-built-in tools remain user-selected at user risk because Pi does not expose standardized tool mutability metadata.
- Unlike native Codex, this extension uses a terminating Pi tool plus an `agent_settled` ready flow; Pi cannot provide sandbox-level enforcement.

## 🗂️ Package layout

```txt
extensions/pi-plan-mode/
├── src/
│   ├── index.ts      # Pi package entrypoint
│   ├── plan-mode.ts  # Extension registration and mode state
│   └── *.ts          # Package-local prompt, policy, question, and message modules
├── README.md
├── LICENSE
├── tsconfig.json
└── package.json
```

`index.ts` is the Pi entrypoint and forwards to `plan-mode.ts`; the other source modules are internal. The package exposes its Pi extension through `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

## 🔎 Keywords

Pi extension, Pi coding agent, plan mode, Codex-like plan mode, AI coding workflow, read-only planning, implementation plan.

## 📄 License

MIT. See [`LICENSE`](./LICENSE).
