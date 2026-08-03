# @narumitw/pi-codex-compact

> [!WARNING]
> This extension is experimental. It depends on an undocumented OpenAI Codex Responses wire
> contract and stores provider-specific opaque checkpoints. Keep backups of important sessions.

Codex Remote Compaction V2 for Pi's built-in `openai-codex` OAuth provider. It replaces Pi's
plaintext summary-generation call with a server-generated opaque compaction item, then replays
that item in later OpenAI Codex Responses requests.

Pi still owns compaction thresholds, `/compact`, overflow retries, retained-message selection, and
the append-only session tree. This package does not reproduce Codex core's context-window lineage
or exact pre-turn and mid-turn lifecycle.

## Install

```bash
pi install npm:@narumitw/pi-codex-compact
```

From this repository:

```bash
just try codex-compact
```

Loading the package enables it. Use Pi normally, including its built-in `/compact` command. Open
the extension's TUI control menu with:

```text
/codex-compact
```

The menu shows the active model and whether compaction will use Codex Remote V2 or Pi's native
fallback. Choose **Compact now** to close the menu and compact immediately, or **Settings** to edit
user settings in `~/.pi/agent/pi-codex-compact.json` (or the active Pi agent directory). Invalid
files are never overwritten; manual compaction remains available, while Settings opens read-only
repair guidance until the file is fixed and `/reload` is run.

| Setting | Default | Accepted values |
| --- | ---: | --- |
| `enabled` | `true` | Boolean |
| `requestTimeoutMs` | `300000` | Integer from 30,000 to 600,000 ms |
| `maxRetries` | `2` | Integer from 0 to 2 |
| `replacementTokenBudget` | `64000` | Integer from 8,000 to 128,000 tokens |
| `notifyOnFallback` | `true` | Boolean |

Missing fields use built-in defaults; the file has no environment-variable or project-level
override. Settings reload on every `session_start`, including `/reload`, resume, and fork. Menu
writes apply immediately, preserve unknown JSON fields, serialize within the current Pi process, and
use a conflict check plus atomic rename. Separate Pi processes are not coordinated by a shared lock;
a detected concurrent edit is rejected for the user to reopen and retry.

## Requirements

- Pi `0.83.0`-compatible extension APIs.
- A model using provider `openai-codex` and API `openai-codex-responses`.
- A working OpenAI Codex OAuth login in Pi.

OpenAI API-key, Azure, Copilot, proxies, and generic Responses-compatible providers are not
supported. Unsupported models continue to use Pi's native compaction.

## How it works

1. Pi decides when compaction is needed.
2. The extension sends the current Codex Responses input with a final `compaction_trigger`.
3. It validates and persists the server's encrypted `compaction` item in the Pi
   `CompactionEntry.details` field.
4. Later Codex requests replace Pi's fallback summary and kept suffix with the opaque replacement
   history before dispatch.

The SSE response is limited to 8 MiB, the opaque item to 2 MiB, and the persisted replacement
history to the configured text budget (64,000 tokens by default) and 8 MiB. Oversized media
retention is dropped rather than creating an unbounded session entry.

## Failure and portability

Remote auth, transport, protocol, or validation failures fall back to Pi's native plaintext
compaction. User cancellation does not start that fallback.

After a successful remote compaction, full older history can be replayed only when this extension
is loaded with the same `openai-codex` model. If the extension is removed or the model/provider is
changed, Pi exposes a warning summary plus its retained recent messages. Switching back restores
opaque replay. Repeated compaction after an opaque checkpoint also requires the checkpoint to be
projected safely; otherwise Pi falls back rather than guessing.

## Privacy and storage

Remote compaction sends the active conversation context, system prompt, and active tool schemas to
the same OpenAI Codex backend used by the selected model. The extension stores the encrypted
compaction item and bounded recent user-role Responses items in the Pi session. It never persists
the OAuth token or request headers.

## Development

```bash
npm --workspace @narumitw/pi-codex-compact run check
npm test
just pack codex-compact
```

See
[`docs/implementation-notes/codex-compaction-mechanism.md`](../../docs/implementation-notes/codex-compaction-mechanism.md)
for the underlying Codex mechanism research and the extension boundary.

## License

MIT
