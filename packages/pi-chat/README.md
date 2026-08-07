# 💬 Pi Chat — Experimental P2P Developer Chat for Pi

[![npm](https://img.shields.io/npm/v/@narumitw/pi-chat)](https://www.npmjs.com/package/@narumitw/pi-chat) [![Pi extension](https://img.shields.io/badge/Pi-extension-blue)](https://pi.dev) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

> [!WARNING]
> Pi Chat is experimental. Its protocol, identity format, networking behavior, and interaction flow
> may change between releases. It is not an anonymous or reliable messaging service.

`@narumitw/pi-chat` adds an ephemeral peer-to-peer chat room beside your Pi coding workflow. It uses
Hyperswarm and HyperDHT to discover peers and opens encrypted Noise streams directly between them.
Chat messages remain separate from Pi sessions, prompts, model context, repositories, and agent
output.

## ✨ Features

- Creates random private rooms shared through bearer invite codes.
- Joins guessable public rooms by lowercase slug.
- Shows every nickname with a stable public-key fingerprint such as
  `Mika~7K2P-9D4M-HQ3T`.
- Keeps an adaptive joined-room dock visible above the Pi editor with explicit input-target status.
- Opens a focused, scrollable full-size chat composer with multiline IME support.
- Preserves chat drafts when returning to Pi or when no direct peer can accept a message.
- Restores a remembered room and the last intentional chat/Pi surface when Pi restarts.
- Uses authenticated direct streams and an invite-derived private-room handshake.
- Limits peers, frames, messages, transcript entries, reconnect work, and per-peer message rates.
- Keeps identity settings local with private permissions and atomic publication.
- Cleans up discovery, sockets, timers, status, and widgets on leave, reload, session replacement,
  or shutdown.

## 📦 Install

Install persistently after the package is published:

```bash
pi install npm:@narumitw/pi-chat
```

Try from npm without installing permanently:

```bash
pi -e npm:@narumitw/pi-chat
```

Try the extension from a local checkout:

```bash
pi --no-extensions --no-skills --no-session -e ./packages/pi-chat
```

Load the package only once per Pi process. Repeating `-e ./packages/pi-chat` creates duplicate
extension instances and suffixed commands such as `/chat:1` and `/chat:2`.

Pi extensions execute with your user permissions. Review source before installing third-party
packages.

## 🚀 Quick start

Run:

```text
/chat
```

Then choose one of these actions:

- **Join public room** accepts a lowercase slug such as `pi-dev`, remembers it after the public-room
  warning is confirmed, and opens the chat composer.
- **Join with invite** accepts a private-room invite, then offers **Join and remember**, **Join once**,
  or **Cancel** before networking starts.
- **Create private room** generates a random `pichat:v1:…` bearer invite and uses the same explicit
  persistence choice.

The first join asks for a nickname and joined-room display mode, then previews the generated
identity fingerprint and display choice before one atomic save. Pi Chat does not read your OS
username, Git identity, cwd, repository, or Pi session to fill these values. Cancelling creates
neither identity settings nor network activity.

A successful remembered join stores the room and `chat` surface atomically. On the next Pi start,
Pi Chat reconnects and reopens the full composer without another command. If you intentionally press
Escape or Ctrl+C to return to Pi, it remembers the `pi` surface instead: the next start reconnects in
the background and leaves the Pi editor focused.

While connected, `/chat` opens the state-aware manager. **Open chat in <room>** is selected first,
followed by participants, private invite, settings, status, help, and **Leave and forget room** last.
The persistent dock continues showing room state while the normal Pi editor targets Pi/LLM.

Inside the dedicated chat composer:

- The header says `CHAT INPUT → <room>` so the destination is never color-only.
- `Enter` sends the current message.
- Pi's configured newline key inserts a newline in the composer.
- `PageUp` and `PageDown` scroll transcript history.
- `Escape` or `Ctrl+C` returns to Pi/LLM without leaving the room or discarding the chat draft.

The composer retains the draft when no authenticated direct peer is available or a broadcast reaches
zero peers. A successful local message reports how many authenticated direct peers accepted the
broadcast. A disconnect race can still record an attempted message as **not delivered**; Pi Chat
never claims delivery receipts or offline retry.

## 💬 Commands

| Command | Modes | Description |
| --- | --- | --- |
| `/chat` | TUI | Open the state-aware Pi Chat manager. |
| `/chat <pichat:v1:invite>` | TUI | Choose private persistence, join, and open chat. |
| `/chat #<public-slug>` | TUI | Review the warning, join, and open the chat composer directly. |

RPC, print, and JSON modes reject the command before starting networking or custom TUI work.
Unknown and trailing arguments are rejected instead of ignored.

## 🪪 Identity and nicknames

The display format is:

```text
nickname~7K2P-9D4M-HQ3T
```

The nickname is editable. The 12-character identity tag is the first 60 bits of the SHA-256 digest
of the authenticated DHT public key, encoded with Crockford Base32 and grouped `4-4-4`. The complete
public key remains the protocol identity. If short tags collide in one room, the UI can extend them;
the short tag is never an authorization boundary.

A fingerprint establishes continuity for one pseudonymous key. It does **not** prove a person's
real-world identity, prevent a user from creating many identities, or recover trust after the local
identity is reset or lost.

Nicknames are NFKC-normalized, trimmed, and limited to 24 grapheme clusters. Terminal, C0/C1, and
bidirectional control characters are rejected. Remote display text is sanitized again before
wrapping or rendering.

## ⚙️ Settings

Pi Chat uses this user-owned file:

```text
<getAgentDir()>/pi-chat.json
```

The usual location is `~/.pi/agent/pi-chat.json`. Pi Chat does not add environment variables or read
project-local settings because the identity material is user-owned and secret.

Example with a remembered public room:

```json
{
  "nickname": "Mika",
  "identitySeed": "base64url-encoded-private-seed",
  "widgetMode": "count",
  "resume": {
    "rooms": [
      {
        "id": "derived-room-id",
        "kind": "public",
        "slug": "pi-dev"
      }
    ],
    "activeRoomId": "derived-room-id",
    "surface": "chat"
  }
}
```

`resume.rooms` is a bounded catalog designed to permit future multi-room expansion. This release
connects only `activeRoomId`. `surface` is `chat` when the user last kept the composer open and `pi`
after an intentional return to Pi/LLM. Transcripts, drafts, peers, and unread counts are never stored.

`widgetMode` accepts:

- `dock`: room and input-target status plus up to three recent messages, adapting to terminal height.
- `latest`: the existing single-message preview.
- `count`: room, direct-peer, and unread status only, without message text.
- `off`: hides the persistent widget.

New identities choose a mode before confirmation, with **Room dock** listed first. Existing settings
retain their stored mode; an older document without `widgetMode` continues to default to `count`, so
an upgrade does not expose message text unexpectedly.

Public rooms are remembered only after their existing risk confirmation. A private room is remembered
only when **Join and remember** is selected; this stores its bearer invite in `pi-chat.json`.
**Join once** stores no room material, and Cancel starts neither persistence nor networking. An older
file without `resume` remains disconnected until the next confirmed remembered join.

The identity seed and stored private invites are redacted from UI, notifications, status, and errors.
On POSIX, settings are published with `0600` permissions. A missing file is a side-effect-free read;
it is created only after an explicit first-use confirmation or settings change. Saves are ordered
within one Pi process, preserve unknown top-level and nested resume fields, and use a same-directory
temporary file plus rename. Malformed, invalid, symlinked, non-regular, invalid UTF-8, or oversized
files fail closed and remain unchanged.

**Reset identity** previews the old and candidate fingerprints and requires confirmation. Resetting
changes your fingerprint everywhere, forgets startup restore, and leaves the active room.

## 🌐 Network and protocol behavior

Pi Chat uses one versioned 32-byte discovery topic per room:

- A private topic and handshake key are domain-separated from a random 32-byte invite secret.
- A public topic is deterministically derived from the public room slug.

Each peer announces and looks up the topic through HyperDHT. Hyperswarm establishes authenticated,
encrypted Noise streams. The application handshake binds the room proof, nickname, and both peer
public keys. Messages are sent only across authenticated direct connections; they are not forwarded
as multi-hop messages. A bounded peer-list exchange asks Hyperswarm to complete a small direct mesh.

The implementation limits a room to 16 direct peers, messages to 4 KiB, protocol frames to 16 KiB,
and the local transcript to 256 entries. There is no authoritative room membership count, global
ordering, server history, delivery receipt, or offline delivery. The UI therefore reports only
**direct peers**.

Hyperswarm's default DHT depends on public bootstrap infrastructure. “P2P” does not mean
infrastructure-free. NAT, UDP blocking, enterprise firewalls, bootstrap availability, or peer churn
can prevent connectivity. Pi Chat performs bounded early refresh and reconnect work but cannot
promise a connection on every network.

## 🔒 Privacy, security, and recovery

- Noise encrypts direct transport, but DHT infrastructure and direct peers may observe IP addresses,
  timing, and topic participation metadata. Pi Chat does not provide anonymity.
- Anyone holding a private invite can join. There is no member revocation in the initial protocol;
  create a new room after an invite leak.
- Public slugs are guessable. Anyone may join, record, or repost public-room content.
- A local session mute reduces immediate abuse but does not stop Sybil identities.
- Remote peers can save or copy messages. Leaving or clearing the local transcript cannot withdraw
  copies from their devices.
- Pi Chat never sends cwd, repository data, Git remotes, Pi sessions, prompts, models, files, or agent
  output unless a user manually types that information into chat.
- Chat messages never call Pi message APIs and never enter model context or the main transcript.
- Deleting `pi-chat.json` loses identity continuity and produces a new fingerprint on the next
  confirmed join.

If an ordinary join fails, Pi Chat tears down partially opened discovery and sockets and preserves
the previous valid settings. If startup restore fails, the remembered room is kept and `/chat` shows
Retry, Join another room, and Forget recovery actions instead of retrying forever. Invalid settings
must be fixed manually before a save can proceed.

Reloading, replacing the Pi session, or shutting down still releases every session-owned network and
UI resource. A new TUI session then restores the remembered room. Explicit **Leave and forget room**
atomically removes resume state before disconnecting; if that save fails, the room stays connected
and remembered with an actionable error.

## 🧪 Experimental limitations

The first release intentionally omits:

- simultaneous multi-room connections or UI;
- persistent or synchronized history;
- offline messages and delivery receipts;
- files, images, reactions, replies, editing, or deletion;
- administrator roles, global bans, or identity recovery;
- browser, mobile, RPC, print, or JSON chat clients;
- large-room gossip pubsub and product-owned relay infrastructure;
- automatic transfer of chat content into the Pi editor, transcript, or model context.

The joined room uses a persistent read-only widget while the normal Pi view is active. Selecting
**Reply in <room>** temporarily opens the full custom chat view instead of a small floating window.
Closing it returns to Pi and the dock without leaving the room. The dock and composer reduce message
rows before hiding room, connectivity, or input-target status.

Pi's public extension widget API does not provide generic mouse hit-testing, so the dock is not
clickable and Pi Chat registers no global shortcut. `/chat` remains the menu-first entrypoint.

## 🗂️ Package layout

```text
packages/pi-chat/
├── src/
│   ├── index.ts
│   ├── pi-chat.ts
│   ├── chat-session.ts
│   ├── network.ts
│   ├── protocol.ts
│   ├── identity.ts
│   ├── settings.ts
│   ├── menu.ts
│   ├── chat-view.ts
│   ├── widget.ts
│   └── text.ts
├── test/
├── README.md
├── LICENSE
├── package.json
└── tsconfig.json
```

## 🔎 Keywords

Pi extension, Pi coding agent, peer-to-peer chat, P2P developer chat, Hyperswarm, HyperDHT, terminal
chat, TypeScript Pi package.

## 📄 License

MIT. See [`LICENSE`](./LICENSE).
