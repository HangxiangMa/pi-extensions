# MEMORY

## GOTCHA

### Tooling and verification

- Node's strip-only TypeScript loader rejects parameter properties and does not remap NodeNext `./module.js` imports to local `.ts` files. For direct-source tests, avoid parameter properties or compile to a temporary JS outDir first.
- A focused `node --test` run can reject a compiled test beneath `node_modules/.cache`; pass the test file's realpath.
- Do not run root checks and the `pi-tui-kit` build/check concurrently: both clear `packages/pi-tui-kit/dist`. Rebuild the kit before consumer tests because consumers resolve its built output.
- On macOS, temporary paths may appear as `/var/...` while Git canonicalizes them to `/private/var/...`; compare realpaths or run tests with a canonical `TMPDIR`.
- Lifecycle tests can read real extension settings because handlers call `getAgentDir()` and some paths are cached at module load. Isolate `PI_CODING_AGENT_DIR` before importing the extension and use fresh imports for cached paths.
- Root tests create temporary commits and inherit Git signing. If the signing agent is unavailable, disable `commit.gpgsign` with command-scoped Git configuration rather than changing user config.
- The pi-sync Git-environment test can fail only in a linked worktree because Git injects that worktree's `GIT_DIR` into shell aliases; verify the exact patch in a normal clone rather than weakening environment stripping.
- Root Biome checks reject nested worktrees with another `biome.json`, ignore nested `.gitignore` rules for generated JSON, and honor the root `.gitignore`. Keep worktrees outside the repository, ignore generated paths at the root, and never blanket-ignore `src/`.
- Tests compiled under root `node_modules/.cache` resolve Pi packages from the root, not a source workspace. Keep imported Pi packages as root devDependencies so the alternate-Pi matrix installs matching copies.
- Treat `package.json#packageManager` plus CI/release workflows as the npm-version authority. A different npm can rewrite unrelated lock metadata or mishandle the alternate-Pi install matrix.
- Official Pi can misresolve static `@earendil-works/pi-ai/api/*` imports beneath its compatibility alias. Prefer root exports; otherwise use a variable-specifier dynamic import.

### Processes, lifecycle, and state

- On WSL, prefer Windows `powershell.exe` with `SetThreadExecutionState` for sleep inhibition; `systemd-inhibit` may exist without usable logind. Release Windows flags on stdin EOF and parent-bind/trap Unix inhibitors.
- A subprocess can outlive its leader while descendants retain stdout/stderr. Cancellation must keep signaling the POSIX process group until captured streams close, not merely until `exitCode` is set.
- An awaited retry timer must remain referenced when it is the only active handle; `unref()` can let a lock-waiting CLI exit before retrying.
- Do not call Pi action methods such as `getThinkingLevel()` during extension factory load; defer them until `session_start` or later.
- `agent_end` is only a low-level run boundary. Use `agent_settled` for idle work, retries, final activity clearing, and next-item activation; ignore events belonging to a replaced session manager.
- Extension follow-ups are most reliable when `agent_end` records intent and queues `deliverAs: "followUp"`, while `agent_settled` retries retained intent. Manual compaction needs a narrowly idle-gated fallback because it does not emit `agent_settled`.
- `pi.events.emit()` can synchronously re-enter an extension through sibling listeners. Revalidate session/goal ownership after emission before updating UI or sending prompts.
- Delayed callbacks must not depend on a captured stale `ExtensionContext`; pass plain data, catch stale-context failures, and scope cleanup to the owning request/session.
- Concurrent tools sharing one extension status key need per-session ownership tracking; one call must not clear or relabel a still-running sibling.
- Pi persists an assistant message after `message_end`. Use `tool_execution_end` when a tool-using turn needs the just-finished usage, with `agent_end` as the no-tool fallback.
- `pi.appendEntry()` survives in session branch state but never enters model context. Inject compaction-sensitive contracts through one canonical `context` hook block when their original handoff is gone.
- Pi `--no-session` does not mean an empty in-memory branch. Copy the live branch rather than inferring emptiness from `getSessionFile() === undefined`.

### TUI and rendering

- Treat model IDs, session text, and pasted search text as untrusted terminal input. Strip or escape OSC, CSI, C0, and C1 controls at the display boundary without mutating raw payloads.
- Sanitize terminal escapes before path splitting or truncation; OSC payloads can contain `/` and otherwise change path-component semantics before final-sink sanitization.
- `wrapTextWithAnsi` trims whitespace at word-wrap boundaries; use cell-aware hard wrapping or horizontal scrolling for exact code/text previews.
- A custom component embedding `Input` or `Editor` must implement `Focusable` and forward `focused`. Sanitize pasted input after handling but before rendering/filtering so the child retains its own cursor escapes.
- Pi's public `SelectList.handleInput()` reads global keybindings, while `ctx.ui.select()` maps both Escape and Ctrl+C to `undefined`. Wrappers needing injected keys or distinct Back/Close outcomes must dispatch those keys themselves.
- `Editor.getText()` retains large pastes as markers; use `getExpandedText()` when moving a draft outside that editor.
- Tests constructing `BorderedLoader` must initialize a theme and dispose the loader harness so its animation timer cannot keep Node alive.
- Kit settings and multi-select actions settle asynchronously. UI harnesses must drain pending callbacks and observe an accepted transition; use the async-capable harness with `runCustomInteraction()`.
- Searchable TUI wrappers should reserve only a standalone Space key for activation; stripping spaces from an entire input chunk corrupts pasted multi-token queries.

### Integrations and package-specific traps

- ty and Ruff LSP servers request `workspace/configuration`; return one empty configuration object per requested item or diagnostic requests can hang.
- Rust-analyzer may publish real errors after an initially empty pull-diagnostics result; allow a bounded server-specific grace period for a newer push publication.
- On Windows, extensionless LSP commands may resolve to `.cmd` or `.bat`; resolve against the adapter's effective `PATH` and child cwd, then launch batch shims through `%ComSpec%`.
- Langfuse's media scanner can reject data-URI-like substrings anywhere in stringified trace content. Redact embedded base64 data URIs before observations end, not only strings that begin with an image URI.
- Keep `@opentelemetry/exporter-trace-otlp-http` as a direct pi-langfuse runtime dependency because Pi's extension install can omit the peer expected by `@langfuse/otel`.
- Loopback cookies are shared by hostname across ports; simultaneous browser servers on `127.0.0.1` need unique cookie names, not merely unique values.
- EventSource may remain reconnecting when replay is empty unless the server calls `flushHeaders()` and writes an initial SSE comment.
- Browser mutation deduplication must retain the exact request id, payload, and delivery mode across uncertain retries, and bounded caches must never evict in-flight records.
- Framework-free browser modules must be added to the authenticated asset allowlist and covered by HTTP asset tests and a package dry run.
- Radix form buttons need `type="button"` for non-submit actions. Radix modal styles also require a CSP nonce via `__webpack_nonce__`; do not loosen CSP to allow unsafe inline styles.
- Lease snapshots and non-replayed events need a monotonic generation so an older HTTP snapshot cannot clear state established by newer SSE data.
- Pi's `sendUserMessage()` is fire-and-forget. Browser APIs must preflight idle model/auth state before acknowledging, and final message projection must run after later `message_end` handlers can replace the message.
- Goal-owned markers must be bounded to the originating goal id and include a unique nonce where iterations can repeat. On failed delivery, restore prior state only if that prompt still owns the current goal.
- Activate completed-goal successors and busy priority changes only from the settled idle boundary; persist pending priority intent so reload cannot lose it or charge the old run to the new goal.
- Reject exhausted stopped goals before rotating their id. If `/goal resume` delivery fails, restore the original stopped state, id, and stale-tool guard.
- Do not classify transient rate limits, HTTP 429, or server failures as goal `usage_limited`; reserve it for explicit quota, subscription, credit, or billing exhaustion.
- Pi-sync settings read-modify-write must hold one cross-process lock through full validation and atomic same-directory replacement. Queue the whole mutation before prerequisite awaits so rapid commands retain invocation order.
- Missing-file settings loads must remain side-effect free. Android/Termux may forbid hard links, and Node lacks an atomic no-replace rename, so supported writers must share the lock protocol and recheck absence immediately before rename.
- Non-interactive Git subprocesses must close stdin, strip inherited Git control variables, disable prompts/hooks/pagers/editors, serialize shared-cache mutations, and reconcile remote refs after ambiguous transport failures.
- A pi-sync pull that replaces a file ancestor with a directory must defer descendant preflight until the ancestor deletion and journal `ENOTDIR` descendants as missing so rollback restores the file.
- Cloudflare R2 may reject `X-Amz-Security-Token` for static keys; preserve temporary-credential support but retry once without the token for that rejection.
- When constructing a child `SettingsManager` for an untrusted cwd, pass `{ projectTrusted: false }` to `SettingsManager.create()`; changing trust after construction is too late.
- Report malformed settings as generic invalid JSON because Node parser errors can quote sensitive file bytes. On later read errors, retain the last-known effective policy rather than replacing it with partial/default state.
- `proper-lockfile` can violate a Proxy invariant under Bun if it annotates loader-proxied `graceful-fs`. Pass one stable plain Node `fs` adapter to both async and sync locks.
- Credential maps must be own-property dictionaries; names such as `__proto__` and `constructor` must not traverse or mutate `Object.prototype`.
- Credential storage must validate path identity and permissions on every locked read, reject symlinks, repair `0600` through the descriptor, and keep canonical, legacy, temporary, and recovery names out of sync/export.
- Runtime provider overlays must preserve the complete previous provider config, verify the resolved key rather than the reported auth source, and fail closed when stored auth cannot be displaced.
- OAuth/account cleanup must invalidate in-flight work instead of waiting behind a serialized conversion. Guard both credential mutation and outer status/connection publication with latest-task ownership.
- For detached subagents, snapshot terminal state before resolving waiters, inject completion with `deliverAs: "steer", triggerTurn: false`, and serialize persistence callbacks in invocation order.
- Blocking a Pi `tool_call` returns a non-terminating error, so agent-core may continue. Abort the turn too when a bounded flow must stop after the blocked call.

- Symptom: concurrent `@tursodatabase/database` file transactions fail with `statement was interrupted`, and `BEGIN CONCURRENT` fails unless MVCC is separately enabled. Cause: connection timeout does not serialize cross-connection exclusive/immediate transactions, and default file databases do not enable MVCC. Fix: use short immediate/exclusive transactions with bounded whole-transaction retry and in-transaction rechecks; pre-create/chmod the database and WAL because both defaulted to `0644`, and include both files in stopped-process backups because committed data can remain in the WAL.

## TASTE

- Prefer canonical JSON and explicit argv arrays for pi-lsp configuration; avoid extension-specific environment-variable settings while retaining `servers[].env` for child-process needs.
- Prefer pi-sync setup that collects credentials in a masked TUI and reviews one exact backend path; storage connections and sync setups are the only managed user concepts.
- Prefer direct, user-owned context selection; avoid dedicated shortcuts or manual copy steps for routine quoting workflows.
- Prefer reading GitHub issue and pull request links with `gh --json` first; use web tools only when `gh` cannot expose the needed content.
- Live provider smokes are acceptable when relevant, but stop after one clear external or entitlement failure and fall back to deterministic tests unless the user asks to retry.
- Keep a predecessor extension active while its successor soaks; deprecate it only after an explicit follow-up decision.
- Prefer an executable repository plan before non-trivial implementation, verify it, and archive it when complete.
- Prefer manually reviewed `pi-tui-kit` dependency-floor changes per consumer; do not automatically synchronize compatibility ranges with the workspace version.
- Keep package versions out of long-lived guidance; derive current values from manifests, lockfiles, or workflows unless a version is itself historical compatibility evidence.
- Keep `just` install recipes resilient: verify registry visibility first and fall back to the local workspace only when it solves the current install path.

## CONVENTIONS

- Key headless session-owned resources by `sessionManager`, not `ctx.ui`; headless Pi runners can share one no-op UI object.
- Keep pi-lsp's built-in catalog to direct-command, non-overlapping routes that target real standalone launchers, account for platform wrappers, and include initialization and dialect-specific language IDs needed by a stateless client.
- Keep pi-sync snapshot content IDs, backend snapshot references, and backend-scoped opaque revisions distinct; `--force` re-reads and republishes against the observed revision rather than disabling concurrency checks.
- pi-statusline owns footer rendering and the `/statusline` settings command; keep it out of prompt interception.
