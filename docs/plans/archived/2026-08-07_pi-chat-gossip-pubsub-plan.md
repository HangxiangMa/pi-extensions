# Pi Chat gossip/pubsub and public-room directory plan

## Goal

Replace Pi Chat's 16-peer full mesh with a bounded, signed P2P gossip/pubsub overlay that supports
approximately 256 active participants per room with at most 8 direct neighbors per client, prevents
duplicate local display and forwarding while a message remains in the bounded deduplication window,
and adds a best-effort public-room browser sorted by estimated active participants.

## Context

- Room discovery currently joins one deterministic HyperDHT topic, then `peer-list` messages attempt
  to complete a full mesh capped at 16 direct peers.
- Chat messages currently trust the authenticated immediate connection. Forwarding them would lose
  author identity unless each origin signs an immutable event envelope.
- Current duplicate tracking keys messages by the immediate peer, so the same forwarded event arriving
  through different neighbors would not deduplicate correctly.
- HyperDHT cannot enumerate unknown room topics. The approved public directory therefore uses a
  separate bounded gossip overlay and must say “discovered” and “estimated,” never complete or
  authoritative.
- Existing settings store public slugs and private invite secrets rather than transport internals, so
  no settings schema change is required. Existing `/chat`, `/chat #slug`, and private-invite command
  shapes remain supported.
- Applicable convention areas are package/runtime dependencies, command and Kit-menu behavior,
  bounded protocol output, TUI-only mode handling, asynchronous network ownership, session
  replacement and shutdown, deterministic tests, documentation, packaging, and Changesets. The v2
  discovery domains also require a narrow settings migration, so `docs/extension-settings.md` applies
  to side-effect-free load normalization, invalid-file protection, unknown-field preservation, and
  atomic publication; precedence and settings UI remain unchanged.

## Architecture

### Room overlay and transport

- Keep one Hyperswarm room topic but let Hyperswarm maintain at most 8 authenticated direct neighbors;
  remove application behavior that calls `joinPeer()` to complete a mesh.
- Retain the room-secret handshake before accepting any gossip event. Refresh discovery on a bounded
  schedule so churn can heal the sparse overlay.
- Model local connectivity separately from room membership: snapshots expose direct-neighbor count and
  a bounded active-participant catalog rather than treating every participant as a direct peer.

### Signed gossip events

- Introduce a versioned immutable event envelope for chat and presence with room id, origin public key,
  event id, issued time, payload, and an Ed25519 detached signature from the existing HyperDHT identity
  keypair. Hop budget is mutable forwarding metadata and is excluded from the signed canonical body.
- Verify shape, byte limits, room id, clock window, signature, hop budget, immediate-neighbor rate
  limits, and origin limits before accepting an event.
- Deduplicate on `originPublicKey:eventId`. Record locally created events before broadcasting; for a
  newly accepted remote event, update local state once and forward once to authenticated neighbors
  other than the ingress connection with a decremented hop budget.
- Bound deduplication by both capacity and local expiry. This provides at-most-once local display and
  forwarding only inside that window; it does not claim global exactly-once delivery.
- Use signed online, heartbeat, nickname, and leaving presence events. Expire participants after a
  bounded heartbeat timeout, cap the catalog at 256 remote origins, and keep local mute keyed by event
  origin. Muted content is not displayed but may still be forwarded so one user's local preference
  does not partition the overlay.
- Report a local send as relayed to direct neighbors, not delivered to the room. Preserve best-effort
  semantics, no history replay, and no delivery receipt.

### Protocol compatibility

- Move wire messages and discovery domains to protocol v2 so old full-mesh clients do not silently
  mix with the gossip overlay.
- Continue accepting existing `pichat:v1:<secret>` command and remembered-invite input, deriving the
  v2 private room from the same secret. Emit `pichat:v2` for newly created private invites and document
  that old clients cannot interoperate with the v2 overlay.
- Public settings continue storing the slug; restore derives the v2 public topic. Unknown settings
  fields and existing restart behavior remain unchanged.

### Public-room directory

- Add a separate versioned global directory gossip topic. A joined public room owns one room-scoped
  pseudonymous announcer so directory traffic does not expose the stable chat identity across rooms.
- Directory presence records contain a validated public slug, scoped origin key, event id, issued time,
  and signature. Peers deduplicate and forward bounded current records; heartbeat expiry produces an
  estimated count of unique scoped origins per slug.
- Bound the directory by room count, active records, frame size, hop budget, request frequency, and
  collection time. When any bound truncates results, return a partial marker for the UI.
- A disconnected browser uses an ephemeral identity and temporary swarm. A joined public-room browser
  may reuse its owned directory node. Browser cancellation, menu disposal, join failure, leave,
  session replacement, and shutdown stop every owned discovery, socket, timer, and task.
- Normalize results deterministically by estimated participant count descending, then slug ascending.

### Menu and state flows

- Add **Browse public rooms** before manual **Join public room** in disconnected and replacement menus.
  The browse screen shows estimated counts and explicit discovered/partial wording.
- Loading is cancellable. Empty results retain Refresh and manual-entry recovery; failures retain Retry
  and manual-entry recovery without discarding a valid previous catalog.
- Selecting a discovered room reuses the existing public-room warning, remembered join, and composer
  opening. Cancellation has no settings or room-network side effects.
- Update status, participants, widget, and composer copy to distinguish active participants, direct
  neighbors, and “relayed to neighbors.”

## Tech Stack

- Continue using TypeScript, Hyperswarm, HyperDHT, Pi's extension APIs, and
  `@narumitw/pi-tui-kit`.
- Add `sodium-universal` as a direct runtime dependency for detached Ed25519 signatures compatible
  with HyperDHT keypairs; do not rely on its current transitive installation.
- Use Node's test runner and local `hyperdht/testnet.js` for deterministic multi-peer overlay smokes.

## Non-Goals

- No central registry, product-owned relay, offline delivery, persistent history, global ordering,
  delivery receipts, or exactly-once guarantee.
- No claim that the directory lists every public room or that estimated participant counts resist
  Sybil identities.
- No unbounded room, directory, deduplication, transcript, retry, queue, or peer catalog.
- No interoperability between old v1 full-mesh clients and the new v2 wire overlay beyond accepting
  old invite text and stored secrets as v2 inputs.
- No RPC, print, JSON, browser, or mobile chat client.

## Risks

- Sparse gossip can partition temporarily or lose events during churn; bounded discovery refresh,
  multiple neighbors, hop budget, and local DHT testnets mitigate but do not eliminate this.
- A valid member can replay old signed events, create Sybil identities, or flood valid signatures;
  clock windows, expiry, per-neighbor/per-origin rate limits, bounded catalogs, and documented
  best-effort behavior limit impact.
- Global directory gossip can expose public room participation metadata. Room-scoped pseudonyms reduce
  cross-room linkability but do not provide anonymity from DHT infrastructure or direct neighbors.
- A v2 topic/domain change intentionally separates upgraded and old clients. README and Changeset must
  make this experimental protocol break explicit while preserving old invite parsing and settings
  restoration.
- Eight neighbors and the chosen hop budget may not cover every 256-node topology. The local testnet
  smoke proves representative propagation and duplicate suppression, not universal delivery.

## Rollback / Recovery

- The implementation remains one package release and introduces no persistent data migration. A code
  rollback restores the previous full-mesh runtime; stored public slugs and private secrets remain
  readable.
- If v2 join or directory startup fails, stop partial resources, retain the prior valid settings, and
  expose the existing retry/join-another/forget recovery paths.
- If browsing fails, keep the active chat session unchanged and offer Retry or manual slug entry.

## Plan

- [x] Add identity-level signature tests and a failing canonical-event test in
      `packages/pi-chat/test/identity.test.ts` and `protocol.test.ts` proving valid Ed25519 envelopes
      verify while payload mutation, wrong room, wrong origin, malformed signatures, and oversized
      payloads fail. Evidence: the initial `npm test` compile failed on the intentionally missing
      signature/event exports.
- [x] Add `sodium-universal` to `packages/pi-chat/package.json`, regenerate `package-lock.json` with
      npm 12.0.2, and implement canonical detached signing/verification in `src/identity.ts` and
      `src/protocol.ts`. Evidence: workspace typecheck and 13 focused identity/protocol tests passed.
- [x] Add failing `chat-session` tests for multi-path duplicate arrival, local-send loopback,
      forwarding excluding ingress, hop exhaustion, invalid signature rejection, bounded expiry,
      per-neighbor/per-origin rate limits, mute-by-origin, presence expiry, and a 256-member catalog.
      Evidence: the test compile initially failed on the absent gossip snapshot and relay contracts.
- [x] Refactor `src/chat-session.ts` into bounded event-deduplication, presence, and forwarding
      responsibilities without leaving any source file over 1,000 lines. Evidence: 10 focused session
      tests pass and snapshots distinguish active participants from direct neighbors.
- [x] Add transport tests showing at most 8 direct neighbors, no application-driven full-mesh
      `joinPeer()` calls, bounded discovery refresh, sparse-overlay recovery, and idempotent stop.
      Evidence: the transport contract no longer exposes `connectPeer`, limits clamp at 8, and local
      DHT recovery/cleanup coverage compiles against the sparse contract.
- [x] Update `src/network.ts` and protocol peer-discovery behavior to maintain the 8-neighbor sparse
      room overlay and protocol-v2 domains, while accepting v1 invite text as v2 input. Evidence:
      focused protocol tests and workspace typecheck pass; network smokes remain in the final suite.
- [x] Normalize stored v1 public/private room ids to v2 in memory without load-time writes, and preserve
      unknown room/resume fields when an explicit resume save publishes v2 ids. Evidence: the focused
      migration test verifies byte-for-byte side-effect-free load, both room kinds, active-id mapping,
      unknown-field retention, and atomic settings publication.
- [x] Add failing directory unit tests for slug validation, signed room-scoped presence, multi-path
      deduplication, heartbeat expiry, catalog/frame/hop/request bounds, partial-result marking,
      count-descending/slug-ascending sorting, and abort cleanup. Evidence: compilation first failed on
      the absent directory module and its contract.
- [x] Implement the directory state machine and Hyperswarm adapter in descriptive modules under
      `packages/pi-chat/src/`, including ephemeral browsing and room-scoped advertising. Evidence: 6
      directory tests pass, including abort cleanup and a two-advertiser local DHT smoke.
- [x] Add failing `menu.test.ts` cases for browse ordering, approximate labels, loading cancellation,
      empty results, partial results, retry after failure, manual-entry recovery, selected-room warning,
      and selected-room join. Evidence: test compilation initially failed on the absent source and
      menu routes.
- [x] Extend `src/menu.ts` through `@narumitw/pi-tui-kit` with Browse, Refresh/Retry, and manual recovery
      while preserving all established command routes and TUI-only rejection. Evidence: 7 focused
      menu tests pass and the disconnected root has exactly seven rows.
- [x] Add failing `pi-chat.test.ts` lifecycle cases for advertiser startup only after a successful
      public join, no advertiser for private rooms, browse cancellation, failed join cleanup, leave,
      session replacement, shutdown, and stale continuation suppression. Evidence: focused coverage
      asserts public/private ownership and temporary browse cleanup alongside existing replacement,
      failed-join, and shutdown cases.
- [x] Wire directory ownership and gossip session state through `src/pi-chat.ts`, revalidating session,
      generation, context, and mutable owner after every await. Evidence: 18 focused extension tests
      pass with injected directory ownership and no stale UI/network continuation.
- [x] Update chat view, widget, status, and participant tests and implementation to say active
      participants, direct neighbors, and relayed-to-neighbors. Evidence: 7 focused view/widget tests
      pass with width bounds, focus, cancellation, disposal, and draft retention intact.
- [x] Extend the local DHT integration fixture to propagate one signed chat event across at least one
      non-origin intermediate peer, deliver it once after duplicate paths, converge representative
      presence/count state, and fully stop all processes. Evidence: the 10-peer test finds a non-neighbor,
      relays through the sparse overlay exactly once at every transcript, enforces 8 connections, and
      passes with complete cleanup; all 76 Pi Chat tests pass.
- [x] Update `packages/pi-chat/README.md` with the discovered-room workflow, sorting, approximate-count
      caveat, 256-participant/8-neighbor bounds, v2 invite compatibility, signed deduplication window,
      metadata/Sybil risks, lifecycle, and delivery limitations. Evidence: documented commands and the
      package layout match the final source and preserve all standard README sections.
- [x] Add a minor Changeset for `@narumitw/pi-chat`, run `npm run format`, `npm run check`, and
      `just pack chat`, inspect that the tarball contains the declared source/README/license and the
      direct signature dependency resolves, then run the local Pi load smoke. Evidence: all 2,461 root
      tests and CI-equivalent checks passed; the 17-file tarball includes both directory modules;
      Changesets reports a minor bump; offline Pi source loading exited 0.
- [x] Audit the final diff against `docs/extension-conventions.md` and
      `docs/extension-settings.md` for dependency metadata, command compatibility/modes, bounded
      protocol data, cancellation, component disposal, failed startup, side-effect-free migration,
      session replacement, shutdown, independent packaging, deterministic tests, docs, and release
      intent. Accepted deviations: discovery/counts are explicitly approximate and sparse gossip is
      best-effort rather than exactly-once/global delivery. Unverified path: no live public-bootstrap
      interoperability smoke; deterministic local HyperDHT testnets cover room and directory overlays.

## Completion Checklist

- [x] A representative sparse local overlay forwards a valid signed chat event through an intermediate
      peer, and each client displays and forwards `originPublicKey:eventId` at most once inside the
      bounded deduplication window.
- [x] Invalid, replay-window-expired, oversized, over-hop, over-rate, wrong-room, and bad-signature
      events cannot enter transcript/presence state or propagate.
- [x] Each room client maintains no more than 8 direct neighbors while the bounded active-participant
      catalog supports approximately 256 identities and expires stale presence.
- [x] `/chat` in TUI browses currently discovered public rooms sorted by estimated participants
      descending and slug ascending, clearly marks approximate/partial results, and retains retry plus
      manual-entry recovery.
- [x] Selecting a discovered room reuses the public warning and remembered join; `/chat`, `/chat
      #slug`, old/new private invite input, startup restore, cancellation, and unsupported-mode behavior
      remain covered.
- [x] Public advertising and temporary browsing release every owned discovery, socket, timer, and task
      on success, cancellation, disposal, failed join, leave, replacement, and shutdown.
- [x] UI and README distinguish active participants, direct neighbors, and relay acceptance without
      claiming complete discovery, authoritative counts, room-wide delivery, global ordering, or
      exactly-once semantics.
- [x] Pi Chat focused tests, representative local DHT smokes, workspace typecheck, `npm run check`,
      package inspection, local Pi load, Changeset, and convention audit all have recorded evidence.
