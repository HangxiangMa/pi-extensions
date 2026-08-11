# Pi Fleet and Ghostty split plan

## Goal

Create an experimental `@narumitw/pi-fleet` extension whose primary capability is actively starting a separate Pi process in a new Ghostty split, with secondary support for explicitly joined Pi sessions on one machine to exchange bounded messages and agent requests.

## Context

- `ghostty --help` reports helper actions, but on macOS it says terminal launch through the CLI is unsupported and recommends the app bundle.
- `ghostty +list-actions` includes `new_split`, `goto_split`, `resize_split`, `equalize_splits`, `toggle_split_zoom`, and related surface actions.
- The installed Ghostty is `1.3.1`, and its active defaults bind `super+d` to `new_split:right` and `super+shift+d` to `new_split:down`.
- Ghostty's `new_split` action supports `right`, `down`, `left`, `up`, and `auto`, but action names from `+list-actions` are keybinding or command-palette actions rather than arbitrary `ghostty +<action>` CLI helpers.
- Ghostty 1.3 introduced a native macOS AppleScript API whose installed `Ghostty.sdef` exposes `split`, focused terminals, working directories, commands, initial input, and environment variables.
- `osascript -e 'tell application "Ghostty" to get version'` successfully returned `1.3.1` in the current environment.
- Pi's in-process `pi.events` bus cannot cross Pi processes, and an interactive Pi process cannot be controlled through another process's RPC stdin.
- `packages/pi-chat` is intentionally a human P2P chat that keeps messages out of Pi model context, so this extension should be a separate package and must not depend on `pi-chat`.
- Applicable convention areas are experimental package metadata, commands and tools, TUI and non-TUI modes, privileged local IPC, bounded output, session-owned resources, cancellation, session replacement, shutdown, documentation, packaging, and Changesets.
- No persistent user setting is planned for the MVP, so group secrets and request permissions remain session-runtime state rather than a new settings file.

## Assumptions

- The MVP connects sessions owned by the same operating-system user on one machine.
- Group membership is explicit and bearer-invite based rather than automatic for every running Pi session.
- Messages may enter the recipient Pi transcript and model context because agent collaboration is the product purpose.
- Ghostty split creation is supported first on macOS with Ghostty 1.3 or newer, while the local communication layer may support other POSIX systems.
- The accepted product name is Pi Fleet, with package `@narumitw/pi-fleet`, command `/fleet`, status key `fleet`, and descriptive model tools `session_spawn` and `session_bus`.

## Architecture

### Package boundary

- Add `packages/pi-fleet/` as an independently installable experimental extension with a thin `src/index.ts` default-export forwarder.
- Declare exactly `"pi": { "extensions": ["./src/index.ts"] }` and `"piExtension": { "lifecycle": "experimental" }`.
- Show a clear runtime warning before the first spawn, group creation, or join in each Pi session, without starting sockets or writing state merely to display it.
- Keep the package out of the root stable `pi.extensions` list while retaining it in workspaces, checks, tests, packaging, and Changesets.
- Use Pi core APIs and Node built-ins without importing another extension package.

### Local session transport

- Create one session-owned Unix-domain socket endpoint only after `session_start` receives an invite or after the user starts or joins a group.
- Place sockets and discovery manifests in a short, owner-only runtime directory that is checked for symlinks, ownership, and `0700` permissions.
- Give each group a random 32-byte bearer secret and derive a non-secret group id with a domain-separated SHA-256 digest.
- Publish only bounded discovery metadata such as protocol version, endpoint path, Pi session id, display name, cwd, process id, and launch id.
- Authenticate `describe`, `send`, and acknowledgement frames with HMAC-SHA-256 over canonical payloads, and reject wrong-group, wrong-target, expired, malformed, replayed, and oversized frames.
- Probe endpoints before listing them, treat manifest text as untrusted, and remove only stale files that the current process can prove belong to dead endpoints.
- Use one request per connection with strict LF-delimited JSON, a 32 KiB frame limit, connection and acknowledgement deadlines, a bounded deduplication cache, bounded peers, bounded pending messages, and per-peer rate limits.
- Define delivery acknowledgement as accepted by the recipient extension, not completed by the recipient model.

### Membership and lifecycle

- Keep the group secret and receive policy in memory and do not save them to a user settings file or Pi model context.
- Let a short-lived process-global handoff keyed by `sessionManager` preserve plain membership data across `/reload`, then consume and clear it in the replacement extension instance.
- Do not carry membership into `/new`, `/resume`, or another logical Pi session unless that session receives an invite explicitly.
- Consume the Ghostty child invite from a launch-only environment envelope during `session_start`, then delete those environment variables before Pi tools can inherit them.
- Key every server, socket, task, timer, manifest, status, and handoff by `sessionManager` and generation rather than `ctx.ui`.
- Abort and drain owned work, close accepted sockets and the server idempotently, unlink owned files, clear status, and invalidate stale continuations on leave, replacement, reload failure, and `session_shutdown`.

### Tools and agent-request contract

- Register a Google-compatible `session_spawn` tool as the primary model-facing capability for actively creating a separate Pi process without replacing the current session.
- Give `session_spawn` explicit `direction`, optional `task`, optional `name`, and optional `cwd` parameters, with the current cwd as the default and strict size and path validation.
- Let `session_spawn` create an ephemeral communication group automatically when the parent is disconnected, then return the authenticated child session id, name, cwd, and readiness state.
- Require a mode-appropriate user confirmation before the tool creates the split, and reject JSON or print invocation before side effects because those modes cannot show the consequential launch preview.
- Register a separate Google-compatible `session_bus` tool with explicit `list`, `send`, and `reply` actions so communication schemas stay smaller than the process-launch schema.
- Use `notify` messages for transcript and model-context delivery without automatically starting a recipient turn.
- Use `request` messages only when the recipient session has explicitly enabled agent requests, and inject them through `pi.sendMessage()` as bounded custom messages delivered as follow-ups.
- Allow one accepted request to trigger one recipient turn, while replies are delivered without automatically triggering another turn to prevent unbounded agent ping-pong.
- Include sender session id, sanitized display label, cwd summary, message id, reply correlation, and delivery mode in the custom-message details.
- Rebuild the recent message-id deduplication window from active-branch custom messages on `session_start` when practical.
- Throw observable tool errors, honor cancellation, cap tool and protocol output below Pi's 50 KB or 2,000-line limits, and never claim that an acknowledgement means the remote task succeeded.

### Ghostty adapter

- Do not use Pi's `ctx.newSession()` for this flow because it replaces the current logical session instead of preserving the parent and launching a separate Pi process.
- Detect Ghostty through `TERM_PROGRAM=ghostty`, confirm macOS, and require Ghostty 1.3 or newer before offering split automation.
- Use `osascript` with positional arguments rather than interpolating cwd, paths, names, or secrets into AppleScript source.
- Target the focused terminal of the selected tab of Ghostty's front window and call the native `split` command with `right`, `down`, `left`, or `up`.
- Build a Ghostty surface configuration with the current `ctx.cwd`, a direct temporary launcher executable path, private launch environment values, and `wait after command` for visible startup failures.
- Resolve the current Pi runtime and CLI entry safely, then generate an owner-only, short-lived launcher under the private runtime directory so arbitrary paths and arguments never pass through shell expansion.
- Pass only the invite, parent session id, launch id, child request policy, optional child name, and inherited model identity through the launch envelope.
- Wait for an authenticated child readiness probe that matches the launch id before reporting success.
- Send the optional first task only after readiness through a launch-id-bound kickoff frame that may trigger exactly one child turn without permanently enabling general agent requests.
- If readiness times out after Ghostty created the split, report the partial result and leave the visible split open instead of closing a potentially usable terminal without confirmation.
- Disable the action with an actionable explanation when Ghostty, AppleScript, Automation permission, the focused terminal, or a safe Pi invocation is unavailable.

## User experience

### Capability priority

- Treat **New Pi session in Ghostty** as the first action whether the parent is disconnected or already connected.
- Treat **Send message** and the live session list as primary connected actions.
- Treat **Start group**, **Join with invite**, and **Invite another session** as supporting connection actions.
- Treat automatic agent-request permission as an explicit safety control rather than a hidden default.
- Keep protocol diagnostics, limits, and raw identifiers in Status or detail views rather than the first menu.

### Main flows

- `/fleet` with no arguments opens a state-aware `@narumitw/pi-tui-kit` manager in TUI mode.
- A disconnected manager shows New Pi session in Ghostty first, followed by Join with invite, Start local group, Status, and Help.
- A connected manager shows New Pi session in Ghostty first, followed by Send message, Sessions, Invite another session, Request policy, Status, Help, and Leave group with the destructive action last.
- The first spawn, group creation, or join shows that the extension, protocol, Ghostty automation, and agent-request behavior are experimental before any side effect.
- Starting or joining previews the bearer-secret meaning, the local-only boundary, whether incoming requests may start paid model turns, and the current cwd before applying state.
- Spawning asks for split direction and an optional first task, previews the child cwd, inherited model, and request policy, creates a group automatically when needed, creates the split only after confirmation, and sends the first task only after authenticated readiness.
- Invite display uses a copyable TUI editor or detail screen and never sends the secret to the model.
- `/fleet <invite>` remains a direct TUI or RPC join route because the invite is the primary payload, while unknown or trailing arguments are rejected.
- JSON and print modes reject command UI routes before opening sockets, while tools and deterministic transport behavior remain testable in supported long-lived modes.
- Activity status appears only while starting, joining, launching, retrying, or reporting an actionable fault, and uses the stable `fleet` status key.
- Escape or cancellation before AppleScript execution leaves no group, socket, split, launch file, or message side effect.

### States and recovery

- Cover disconnected, starting, connected-alone, connected-with-peers, launching, waiting-for-child, partially launched, permission-denied, peer-stale, rate-limited, malformed-message, cancelled, and shutdown states.
- Preserve the typed first task if Ghostty launch or readiness fails so the user can retry or start Pi manually.
- Keep peer labels, paths, message previews, and errors safe for terminal display without mutating raw protocol data.
- Make sender, destination, cwd boundary, request policy, and acknowledgement meaning visible without relying on color.

## Tech Stack

- Use TypeScript, Node `net`, `crypto`, `fs`, and `child_process`, Pi extension APIs, `typebox`, `StringEnum`, and `@narumitw/pi-tui-kit`.
- Use Ghostty 1.3's native AppleScript dictionary on macOS rather than GUI keystroke automation or assumptions about user keybindings.
- Use Vitest through the repository test harness, deterministic Unix-socket fixtures, fake AppleScript executors, and an opt-in real Ghostty smoke.

## Non-Goals

- No internet, LAN, cross-user, remote-host, or public-room communication in the MVP.
- No dependency on or replacement for `pi-chat`.
- No central daemon, always-on broker, offline mailbox, separate Fleet history, delivery receipt, global ordering, or exactly-once guarantee.
- No automatic discovery or trust of every Pi process owned by the user.
- No automatic remote tool execution without the recipient session's explicit request permission.
- No unattended `session_spawn` in modes that cannot present the launch preview and user confirmation.
- No Linux Ghostty split automation until Ghostty exposes a stable supported control path there.
- No tab, window, resize, focus-navigation, or layout manager beyond creating one configured split.
- No publication or npm visibility change without separate explicit user approval.

## Risks

- A bearer invite lets its holder send collaboration messages and can be copied or reused, so invites must remain local, be rotated by starting a new group when needed, stay redacted from logs, and remain excluded from model context.
- Agent requests can incur model cost or cause concurrent file edits, so they require explicit recipient permission and must show the sender and cwd boundary.
- Another privileged extension or same-user process can inspect local process state, so the design provides group separation and accidental-cross-session protection rather than a sandbox against the operating-system user.
- Unix socket path limits and stale files can break discovery, so runtime paths must be short, private, ownership-checked, and deterministically cleaned.
- Ghostty's front focused terminal can change before AppleScript runs, so the flow must execute immediately after confirmation and fail when no focused target is available.
- The first AppleScript call can trigger macOS Automation permission, so denial and delayed approval need actionable recovery without repeated prompts or hidden retries.
- A split may exist even when child readiness fails, so UI wording must distinguish split creation from Pi and bus readiness.
- Multiple sessions may edit the same workspace concurrently, which the extension cannot make safe and must warn about before enabling agent requests.

## Rollback / Recovery

- Removing or disabling the experimental package stops future endpoints and leaves no persistent group migration.
- Session shutdown removes owned runtime files, and stale endpoint cleanup handles an ungraceful process exit on the next authenticated probe.
- A failed join keeps the previous disconnected or connected state unchanged.
- A failed Ghostty launch keeps the parent group intact and retains the draft task for retry.
- A protocol-version change rejects incompatible peers clearly rather than silently downgrading authentication or limits.

## Execution Notes

- Implementation branch: `feat/pi-fleet`, created from local `main` at `3df7c506`, which matched the last fetched `origin/main`; the initial refresh failed because the configured SSH agent could not authenticate.
- Touched MUST areas: experimental package metadata and boundaries, thin entrypoint, factory and session resource lifecycle, observable and bounded tools, Google-compatible enums, command routes and modes, Kit menu behavior, stable status cleanup, terminal sanitization, deterministic tests, README, Changeset, pack inspection, Pi load, and runtime smoke.
- Settings audit: no user or project settings file is introduced, and launch-only environment values are explicit ephemeral handoff data that must be consumed, deleted, redacted, and tested.
- Verification map: `npm run check:boundaries`, focused Vitest runs, cross-process and launch fixtures, `npm run check`, `just pack fleet`, local Pi load, opt-in Ghostty smoke, and semantic convention audit.
- Deterministic result: the initial 17 Pi Fleet test files and 53 tests passed, including separate-process transport and real-child launch integration; the follow-up Unix-socket hardening raised this to 65 focused tests.
- Live result: Ghostty 1.3.1 created the requested split, a distinct Pi child joined with the package cwd and launch id, notify and kickoff were accepted, one correlated reply returned without a parent turn, only the returned terminal id was closed, and endpoint files disappeared within the bounded cleanup check.
- Packaging result: `just pack fleet` contains 17 declared files consisting of package metadata, README, license, and `src/` only.
- Root-gate result: Biome, all workspace typechecks, package boundaries, and all Pi Fleet tests pass; repeated full isolated root test runs reached 316–317 passing files and retained timing-sensitive failures in untouched `packages/pi-subagents` timeout and readiness tests, while the implicated 12 tests pass together when focused, so `npm run check` remains red outside the touched paths.
- Hardening result: the initial adversarial pass fixed the macOS Unix-socket path budget, AppleScript launcher command syntax, launcher lifetime, stale async results, concurrent membership start, in-flight shutdown draining, failed-delivery deduplication, concurrent kickoff admission, reload kickoff state, private endpoint modes, carriage-return display controls, partial Ghostty cancellation, and reusable-invite documentation.
- Follow-up transport result: protocol version 2 adds endpoint-bound strict frames and authenticated manifests, finite message lifetimes, structured acknowledgements, concurrent deadline-bounded discovery, absolute connection deadlines, delivery cancellation and backpressure, global and per-sender limits, bounded diagnostics, identity-conflict rejection, bounded manifest reads, and grace-period orphan cleanup.
- Settings result: `docs/extension-settings.md` is non-applicable to persisted configuration because the package adds no user or project settings file; ephemeral launch-envelope consumption and membership mutation ordering were audited instead.

## Plan

- [x] Record a focused Ghostty capability spike in `packages/pi-fleet/test/ghostty-smoke.md` that verifies native AppleScript version lookup, focused-terminal lookup, one harmless configured split, authenticated child readiness, and cleanup on Ghostty 1.3 or newer; keep Linux split automation disabled if no supported control API is found.
- [x] Add `packages/pi-fleet/package.json`, `tsconfig.json`, `LICENSE`, the thin `src/index.ts`, experimental metadata, peer dependencies, Kit dependency, and an initial failing loader test; verify package boundaries reject any extension-to-extension dependency and keep the root stable extension list unchanged.
- [x] Add failing protocol tests for canonical HMAC frames, wrong group and target, expiry, replay, malformed JSONL, invalid UTF-8, frame limits, rate limits, deduplication, acknowledgement meaning, and terminal-control payloads; implement the bounded protocol in descriptive modules under `src/`.
- [x] Add failing runtime-directory and discovery tests for owner and mode checks, symlink rejection, Unix-socket path length, atomic manifests, authenticated probing, stale endpoint cleanup, maximum peers, connection deadlines, and idempotent close; implement the session-owned local transport with no factory-time resources.
- [x] Add a cross-process fixture that starts two isolated transport nodes, discovers both, sends one message, retries the same id without duplicate acceptance, rejects an unauthenticated third process, and exits with no socket, manifest, timer, or child-process leak.
- [x] Add failing extension lifecycle tests for the once-per-session experimental warning with zero startup side effects, explicit start and join, launch-envelope consumption and deletion, reload handoff keyed by `sessionManager`, no carry into a different logical session, partial initialization, cancellation, replacement, repeated shutdown, stale continuations after every await, and exact status cleanup; implement generation-owned session orchestration.
- [x] Add failing `session_spawn` tool tests for disconnected auto-group creation, connected reuse, all directions, optional name/task/cwd, inherited model metadata, confirmation, JSON/print rejection, cancellation rollback, readiness results, bounded output, and thrown failures; implement the primary launch tool without using `ctx.newSession()`.
- [x] Add failing `session_bus` tool tests for list, notify, request, reply correlation, recipient permission, busy-recipient follow-up delivery, one-turn request triggering, non-triggering replies, cancellation, bounded output, thrown failures, and honest accepted-versus-completed wording; implement communication tool registration and custom-message injection.
- [x] Add failing custom-message renderer tests for sender and destination cues, raw-data preservation, terminal sanitization, CJK and narrow widths, expanded details, and theme invalidation; implement compact transcript rendering without a persistent ready widget.
- [x] Add failing command and Kit-menu tests that keep New Pi session first when disconnected or connected, plus invite preview, request-policy warning, direction selection, first-task preservation, cancellation with zero side effects, destructive leave confirmation, direct invite compatibility, unknown arguments, TUI/RPC behavior, and JSON/print rejection; implement the shallow manager and direct route through the same launch service as `session_spawn`.
- [x] Add failing Pi invocation and launcher tests for Node, Bun, standalone Pi, missing binaries, spaces and quotes in paths, owner-only permissions, no shell interpolation, one-time cleanup, and no secret in the launcher file; implement a safe short-path launcher.
- [x] Add failing Ghostty adapter tests with a fake executor for version gating, `TERM_PROGRAM` detection, positional AppleScript arguments, all four directions, focused-terminal absence, Automation denial, cancellation before execution, readiness timeout, split-created partial failure, and stale-session suppression; implement the AppleScript adapter behind an injectable boundary.
- [x] Add a deterministic launch integration fixture that substitutes a fake Ghostty executor, starts a real child Pi-compatible endpoint with the launch environment, proves cwd and launch-id propagation, sends the optional first request after readiness, and cleans every temporary resource.
- [x] Write `packages/pi-fleet/README.md` with the experimental warning, standard badges and emoji sections, installation, `/fleet` and tool usage, Ghostty 1.3/macOS requirement, invite and model-cost risks, acknowledgement semantics, lifecycle, limits, recovery, unsupported modes, local-only boundary, and package layout.
- [x] Add an initial minor Changeset, run `npm install`, `npm run format`, focused package tests, the cross-process fixture, `npm run check`, `just pack fleet`, and a local `pi -e` entrypoint smoke; inspect the tarball for only declared source, README, and license files.
- [x] Run the opt-in real Ghostty smoke in a disposable tab or window, confirm the created split launches a distinct named Pi session in the same cwd, verify two-way notify plus one permitted request and non-triggering reply, then close only the created split and record any Automation-permission limitation.
- [x] Audit the final diff against `docs/extension-conventions.md` and `docs/extension-settings.md` for package metadata, public command routes and modes, tool errors and limits, terminal sanitization, TUI cancellation, session replacement, shutdown, local IPC permissions, settings non-applicability, tests, documentation, Changeset, package contents, and every skipped or manual-only path.

## Completion Checklist

- [x] Two explicitly joined Pi processes on the same machine discover each other and exchange authenticated bounded messages without duplicate recipient injection.
- [x] `session_spawn` actively creates a distinct child Pi process while preserving the parent, auto-creates or reuses the communication group, and returns authenticated child readiness metadata.
- [x] A notify enters the recipient transcript and model context without starting a turn, while a permitted request starts at most one recipient turn and its reply does not create an automatic loop.
- [x] Outside the explicit invite review and direct join input, group invites, launch envelopes, temporary launchers, logs, statuses, renderers, and tool results do not expose the bearer secret to the model or terminal output.
- [x] Cancelling before launch creates no split or runtime resource, and cancellation, leave, reload, replacement, crash recovery, and shutdown have deterministic cleanup evidence.
- [x] Ghostty 1.3 or newer on macOS creates a split through native AppleScript, starts a distinct Pi session in the requested cwd, joins it through the launch envelope, and reports readiness separately from split creation.
- [x] Unsupported Ghostty versions, platforms, missing focus, Automation denial, unsafe Pi invocation, child startup failure, and readiness timeout produce actionable non-destructive recovery.
- [x] `/fleet`, its direct invite route, the primary `session_spawn` tool, the `session_bus` communication tool, custom messages, menus, modes, limits, privacy boundary, and delivery semantics match the README and tests.
- [x] The package remains experimental, shows its runtime warning before first consequential use, stays independently installable and absent from the root stable extension list, is covered by a Changeset, and is correct in the inspected tarball.
- [x] Focused tests, cross-process tests, the opt-in Ghostty smoke, local Pi load, `npm run check`, package inspection, and the convention audit all have recorded evidence, including the unrelated root-test exception recorded above.
