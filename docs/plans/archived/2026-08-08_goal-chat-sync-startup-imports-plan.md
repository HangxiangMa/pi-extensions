# Goal, Chat, and Sync startup import reduction plan

## Goal

Reduce idle Pi startup time from `pi-goal`, `pi-chat`, and `pi-sync` by removing command UI,
peer-to-peer networking, cryptographic identity, setup switching, snapshot creation, and sync-decision
implementation modules from startup paths that do not need them.

Preserve every command, setting, startup restore, recovery, cancellation, session replacement,
shutdown, security, and persistence contract.

## Context

- The reviewed installed run attributed 170 ms to `pi-goal`, 163 ms to `pi-chat`, and 149 ms to
  `pi-sync`, while each extension factory took at most 1 ms.
- Five combined warm runs reproduced the ranking with medians of 153 ms for Goal, 107 ms for Chat,
  and 122 ms for Sync.
- Isolated warm measurements were approximately 184 ms for Goal, 131 ms for Chat, and 175 ms for the
  current Sync source, but execution must capture fresh same-host baselines before editing.
- `pi-goal` eagerly imports `menu.ts` and `settings-ui.ts` from `command-registration.ts`, while
  `commands.ts` imports the complete menu only for `safeGoalMenuText()`.
- `pi-chat` eagerly imports HyperDHT, Hyperswarm, sodium, chat UI, directory networking, and wire
  protocol code even when settings are missing and `/chat` is never used.
- `pi-chat` settings currently import `identity.ts` and `protocol.ts`, so a valid lightweight settings
  read still reaches networking and signing dependencies through transitive imports.
- `pi-sync` already defers manager UI, operation routes, and selected backends, but `sync.ts` still
  imports setup switching, snapshot creation, sync formatting, sync decisions, and sync state.
- `pi-sync` startup transaction recovery must remain eager, but `snapshot-transaction.ts` imports the
  complete snapshot implementation only for `sessionStorageRoot()`.
- The authoritative implementations and Pi entrypoints remain TypeScript under each package's `src/`
  directory.

## Architecture

### Shared loading contract

- Keep synchronous factory registration and lightweight command contracts eager.
- Cache successful code-module imports per extension factory, reset a rejected loader promise so a
  later command can retry, and never cache session-owned work or contexts in a code loader.
- Capture the owning session manager, generation, and abort signal before each lazy import, then
  revalidate all applicable ownership immediately after every `await` before opening UI, creating a
  resource, acquiring a lock, changing settings, or publishing state.
- Prove dependency boundaries through injected loaders and fresh declared-entry imports rather than
  timing assertions in the normal test suite.
- Do not move work into an always-run `session_start` continuation merely to reduce the reported
  module-import number.

### Goal boundary

- Move `safeGoalMenuText()` into a lightweight display-text module used by both commands and menus.
- Keep direct Goal command parsing, tools, lifecycle, state restoration, safety, and run protocol
  eager.
- Load the Goal manager only when a command route opens it, and load settings presentation only when
  the manager or safety flow requests that screen.
- Keep Goal settings loading, validation, persistence, runtime application, and write ordering eager
  and extension-owned.

### Chat boundary

- Introduce a lightweight Chat bootstrap that owns command registration, the experimental warning,
  settings loading, session generation, runtime-module loading, and delegation to an optional active
  Chat runtime.
- Split nickname normalization and room descriptor parsing from DHT key generation, sodium signing,
  wire protocol handling, networking, directory networking, menu UI, composer UI, and widget runtime.
- Keep missing, malformed, and valid settings reads side-effect free and independent of HyperDHT,
  Hyperswarm, and sodium evaluation.
- Load the full Chat runtime only for a valid interactive `/chat` route or a valid remembered-room
  restore in TUI mode.
- Let the loaded runtime retain ownership of sockets, directories, tasks, widgets, drafts, and their
  idempotent cleanup.

### Sync boundary

- Keep configuration validation, state-directory guarding, transaction-journal discovery and
  recovery, command parsing, completions, migration policy, and lifecycle cancellation eager.
- Move `sessionStorageRoot()` into a lightweight snapshot-path module shared by snapshot creation and
  transaction recovery so recovery does not evaluate snapshot collection.
- Put setup-switch error contracts in a lightweight module and load `useSyncSetup()` only for the
  `use` route or an interactive manager path that needs it.
- Put sync-decision error types and guards plus generic error formatting in lightweight contract
  modules so `sync.ts` does not import decision construction or diff formatting.
- Load snapshot creation and local-change inspection only after automatic session push has passed the
  validated `automatic` and `sessions` inclusion gates.
- Preserve the existing lazy sync-operations and selected-backend boundaries.

## Non-Goals

- Reintroduce generated runtime bundles, emit extension entrypoints outside `src/`, or change Pi's
  extension loader.
- Change Goal command grammar, tools, continuation policy, queue behavior, settings schema, or
  persistence format.
- Change Chat invites, room IDs, wire protocol, DHT topology, identity fingerprints, settings schema,
  restore policy, experimental lifecycle, or user experience.
- Change Sync commands, settings schema, state migration, transaction recovery, snapshot format,
  backend protocols, locking, automatic-sync defaults, or conflict policy.
- Publish packages, change npm visibility, create tags, or dispatch release workflows.

## Assumptions

- Source-shipping simplicity remains more important than recovering the previously removed generated
  bundle architecture.
- A one-time first-use module load is acceptable when process-start-to-feature readiness does not
  regress materially and cancellation remains immediate and complete.
- Each package remains independently installable and does not import another extension package.

## Unknowns

- Jiti cache state and current host load can change absolute timings, so only serial same-host medians
  and median absolute deviations are comparable.
- The exact remaining eager subgraph after each split must be confirmed with resolver traces because
  ordinary source imports in tests can mask production entrypoint boundaries.

## Risks

- **Timing displacement:** a lower import number could hide equivalent idle startup work.
  Measure first RPC response and keep missing/default session behavior in the benchmark.
- **Stale continuation:** a session can be replaced while an uncancellable dynamic import resolves.
  Inject delayed loaders and prove ownership checks prevent stale UI, state, resource, lock, or file
  effects.
- **Settings regression:** splitting Chat validators or Goal presentation could create a second
  settings protocol.
  Keep canonical loaders and writers unchanged and rerun missing, malformed, unknown-field,
  permission, ordering, rollback, and replacement tests.
- **Error identity drift:** moving Sync error classes can break `instanceof` routing.
  Keep one canonical class definition, re-export it where compatibility requires, and test decision
  and setup-pull error routing through the declared extension.
- **Resource leak:** a Chat load or restore that races cancellation can leave DHT or UI ownership
  behind.
  Test loader rejection, partial runtime creation, restore cancellation, replacement, reload, and
  repeated shutdown.
- **Import-boundary false positive:** a test may preload the heavy module before loading the extension.
  Use injected counters plus fresh subprocess or declared-entry resolver evidence.

## Plan

- [x] Capture seven serial warm runs for each declared entry and one combined run with
      `scripts/benchmark-extension-startup.mjs`; record import median, MAD, first-response median,
      extension order, Node version, Pi version, and Jiti cache mode in this plan before editing.
- [x] Trace the current declared-entry import graphs for Goal, Chat, and Sync with Jiti resolver/debug
      output; record the eager package modules and confirm the suspected Goal UI, Chat network/crypto,
      and Sync setup/snapshot edges.
- [x] Add red-first Goal loader-boundary tests proving factory registration, session start, and direct
      non-menu routes do not load Goal manager or settings presentation, while the first applicable
      route loads each implementation once and a rejected loader can be retried.
- [x] Extract `safeGoalMenuText()` from `packages/pi-goal/src/menu.ts` into the already-eager
      lightweight display/error boundary; verify its terminal-control stripping and length-bound tests
      plus command confirmation tests use the shared implementation.
- [x] Add cached Goal manager and settings-presentation loaders to command registration and safety
      settings routing; verify delayed loads revalidate `menuGeneration`, `menuController.signal`, and
      session ownership before UI or mutation.
- [x] Run every `packages/pi-goal/test/*.test.ts` test plus `npm run test:runtime --workspace
      @narumitw/pi-goal`; record passing menu, settings rollback, queue, continuation, factory
      isolation, replacement, and shutdown evidence.
- [x] Re-run the seven-run Goal startup benchmark and resolver trace; require at least a 15% import
      median reduction larger than three baseline MADs, no idle first-response regression larger than
      three baseline MADs, and no eager `menu.ts`, `settings-ui.ts`, or Pi TUI Kit path.
- [x] Add red-first Chat bootstrap tests with an injected delayed runtime loader proving missing or
      invalid settings, unsupported modes, and malformed direct arguments load no runtime, while a
      valid menu, direct join, or remembered TUI restore loads one runtime and loader failure remains
      retryable.
- [x] Split lightweight Chat nickname and room-descriptor validation from identity signing and wire
      protocol implementation; verify settings normalization, v1/v2 room migration, invite parsing,
      room IDs, and protocol fixtures retain byte-for-byte compatible results.
- [x] Move menu, network, composer, and widget implementations behind cached Chat code loaders while
      keeping settings and lifecycle generation in the extension owner; verify every post-load
      continuation checks session manager, generation, room/session identity, and abort state before
      creating DHT, directory, widget, or custom UI resources.
- [x] Extend Chat lifecycle tests for loader completion after replacement, shutdown during initial
      load, partial runtime initialization failure, remembered-room restore cancellation, retry, and
      complete task/socket/UI disposal.
- [x] Run every `packages/pi-chat/test/*.test.ts` test, including deterministic local DHT and
      subprocess fixtures; record passing settings permissions/order, protocol, network, restore,
      replacement, and shutdown evidence.
- [x] Re-run the seven-run Chat missing-settings startup benchmark and resolver trace; require at least
      a 25% import median reduction larger than three baseline MADs, no idle first-response regression
      larger than three baseline MADs, and no eager `hyperdht`, `hyperswarm`, `sodium-universal`, menu,
      network, or composer module.
- [x] Add red-first Sync loader-boundary tests proving startup recovery still runs while missing or
      automatic-disabled settings do not load setup switching, snapshot creation, sync-state diffing,
      operations, or backends; prove `/sync use` and eligible automatic session push load only their
      required modules once.
- [x] Extract `sessionStorageRoot()` into a lightweight Sync snapshot-path module and update snapshot
      collection plus transaction recovery to share it; verify session path mapping, transaction
      recovery, apply rollback, custom session directories, and path-boundary tests.
- [x] Split canonical Sync setup-pull and decision-required error contracts plus generic error
      formatting from their heavy implementations; verify `instanceof`, direct-message routing,
      non-TUI rejection, and conflict-resolution behavior remain unchanged.
- [x] Add cached Sync setup-switch and automatic-session-push loaders, with signal and ownership checks
      after each import; verify ineligible startup/shutdown paths perform no snapshot, lock, backend,
      state, publication, or UI work.
- [x] Extend Sync lifecycle tests for delayed setup/snapshot imports racing cancellation, session
      replacement, state-directory migration guards, shutdown, load rejection, and later retry.
- [x] Run every `packages/pi-sync/test/*.test.ts` test; record passing configuration, settings locking,
      transaction recovery, snapshots, decisions, publication, Git, WebDAV, S3, migration, custom UI,
      replacement, and shutdown evidence.
- [x] Re-run the seven-run Sync missing-settings startup benchmark and resolver trace; require at least
      a 20% import median reduction larger than three baseline MADs, no idle first-response regression
      larger than three baseline MADs, eager transaction recovery, and no eager setup-switch,
      snapshot-collection, sync-format, sync-decision implementation, operation, or backend path.
- [x] Run the three declared entries together in the original measured extension order; require at
      least a 20% reduction in their combined import median, larger than three combined baseline MADs,
      without shifting equivalent work into the first RPC response.
- [x] Update the three package READMEs and package-layout sections to describe their bootstrap,
      contract, runtime, and lazy-loader ownership without changing command or settings claims.
- [x] Add patch Changesets for `@narumitw/pi-goal`, `@narumitw/pi-chat`, and `@narumitw/pi-sync`,
      describing startup import reduction with no public command, settings, protocol, or data-format
      change; verify with `just changeset-status`.
- [x] Run `npm run typecheck`, `npm test`, and `npm run check` serially, rebuilding
      `@narumitw/pi-tui-kit` before consumer tests when required; leave any failure open until it is
      fixed or proven unrelated with focused reproduction.
- [x] Run `just pack goal`, `just pack chat`, and `just pack sync`; inspect each dry-run tarball for its
      complete `src/` graph, manifest entrypoint, README, license, Changeset intent, and absence of
      generated runtime artifacts.
- [x] Load each packed or extracted declared entry through a noninteractive offline Pi RPC process;
      verify command discovery, missing-settings startup, session shutdown, and mode-appropriate Chat
      rejection without an interactive TUI.
- [x] Audit the final diff against `docs/extension-conventions.md`, `docs/extension-settings.md`,
      `packages/pi-goal/AGENTS.md`, and `packages/pi-sync/AGENTS.md`; record cancellation, disposal,
      replacement, shutdown, settings ordering, recovery, path safety, benchmark, test, pack, smoke,
      deviation, and unverified-path evidence.

## Execution Evidence

- Baselines used Node 26.5.0, Pi 0.84.1, warm Jiti filesystem cache, seven measured runs after one
  warm-up, and declared entries in Goal, Sync, Chat order.
- Goal import median improved from 183 ms (MAD 2 ms) to 154 ms (MAD 2 ms), a 15.8% reduction, while
  first response improved from 674.99 ms to 651.70 ms.
- A trial that delayed the complete Goal command controller changed the managed-run protocol's
  synchronous active-state publication and failed three existing protocol tests, so it was rolled
  back rather than trading correctness for the original 20% package target.
- Chat import median improved from 134 ms (MAD 1 ms) to 66 ms (MAD 1 ms), a 50.7% reduction, while
  first response improved from 616.58 ms to 563.31 ms.
- Sync import median improved from 178 ms (MAD 5 ms) to 97 ms (MAD 2 ms), a 45.5% reduction, while
  first response improved from 664.12 ms to 597.16 ms.
- Combined import median improved from 447 ms (MAD 11 ms) to 270 ms, a 39.6% reduction, while first
  response improved from 946.17 ms to 773.26 ms.
- Final Jiti traces contain no eager Goal manager/settings/Kit path, no eager Chat HyperDHT,
  Hyperswarm, sodium, menu, network, directory, composer, or widget path, and no eager Sync setup,
  snapshot collection, formatting, decision implementation, operation, or backend path.
  Sync transaction recovery remains eager through `snapshot-transaction.ts`.
- TDD red evidence was captured for Goal and Sync loader boundaries before implementation.
  Chat's established lifecycle suite was extended around loader caching, retry, replacement,
  concurrent joins, directory creation failure, and cleanup; the hardening review found and fixed the
  same-session directory race and concurrent delayed-join race introduced by asynchronous loading.
- Focused final evidence passed 308 Goal tests plus the runtime smoke, 86 Chat tests before the final
  hardening additions, and 305 Sync tests before the final cancellation regression.
  The final CI-equivalent rerun passed 2,590 tests across 230 files, including every later hardening
  regression.
- `npm run typecheck`, `npm test`, and the CI-equivalent `npm run check` passed.
  The latter also passed Biome and the extension-boundary validator.
- `just changeset-status` reports patch intent for all three packages.
  `just pack goal`, `just pack chat`, and `just pack sync` produced complete source-only dry runs with
  23, 20, and 55 files respectively.
- Real tarballs were extracted, installed with production dependencies, and loaded through offline
  noninteractive Pi RPC from each packed declared entry.
  The one-run packed imports were 152 ms for Goal, 66 ms for Chat, and 96 ms for Sync.
- The semantic audit covered command compatibility, UI mode guards, loader rejection/retry, stale
  session/generation/room ownership, settings ordering and invalid-file preservation, Chat resource
  disposal, Sync transaction recovery and state guards, package contents, and terminal sanitization.
  No required platform or provider path remains unverified for this source-only import change.

## Completion Checklist

- [x] Goal startup does not evaluate manager, settings presentation, or Pi TUI Kit code, while direct
      commands, tools, lifecycle, safety, state restoration, and settings semantics remain unchanged.
- [x] Chat missing/default startup does not evaluate HyperDHT, Hyperswarm, sodium, networking,
      directory, menu, composer, or widget runtime, while valid restore and first-use behavior remain
      compatible and fully cancellable.
- [x] Sync missing/default startup retains configuration and transaction recovery but does not evaluate
      setup switching, snapshot collection, sync formatting/decision implementation, operations, or
      backends until a validated route requires them.
- [x] Every lazy load is cached only as code, retries after rejection, and revalidates session,
      generation, context, and cancellation ownership before side effects.
- [x] Missing, malformed, invalid, migrated, concurrently written, unknown-field, private-permission,
      rollback, reload, and shutdown settings behavior remains covered for every applicable package.
- [x] Each package meets its import and first-response benchmark gate, and the three-package combined
      median improves by at least 20% on the same host and cache mode.
- [x] Focused suites, runtime smoke, `npm run typecheck`, `npm test`, `npm run check`, three package dry
      runs, and three noninteractive Pi loads pass with recorded evidence.
- [x] READMEs, package layouts, patch Changesets, semantic audits, and all required handoff evidence are
      complete, with no publication, visibility, tag, or release action performed.
