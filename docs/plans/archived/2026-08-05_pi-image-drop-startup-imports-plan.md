# pi-image-drop startup import reduction plan

## Goal

Keep default `pi-image-drop` sessions lightweight by delaying Pi TUI Kit menu code, the loopback
server, and native image codecs until the user opens Image Drop or `startOnSessionStart` explicitly
requires the service.

## Context

- Installed isolated imports measure about 153–212 ms, with a prior combined cold-order sample of
  221 ms.
- `src/runtime.ts` statically imports `menu.ts`, `server.ts`, and `images.ts`; `images.ts` statically
  imports `sharp`, `heic-decode`, and `bmp-js`.
- `startOnSessionStart` defaults to `false`, but session start currently creates an `ImageProcessor`
  unconditionally after loading settings.
- The runtime already owns generation, session abort, server-start coalescing, batch reservation, and
  shutdown cleanup. Lazy imports must remain inside that lifecycle rather than creating a second
  owner.
- Execute after the shared published-version/benchmark plan or use its equivalent protocol.
- Applicable guidance: `docs/extension-conventions.md` lifecycle/custom UI/cancellation/disposal,
  command modes, package checks, and deterministic tests; `docs/extension-settings.md` applies because
  startup settings loading and the start-on-session preference gate are touched.

## Architecture

- Keep settings load, in-memory batch creation, command/event registration, widget projection, and
  lifecycle generation eager.
- Split the processor queue and its small interfaces from codec implementation. The queue calls one
  cached async codec loader on the first image job; only that codec module imports Sharp/HEIC/BMP.
- Replace static default dependencies with async loaders for menu, server, and processor capabilities.
  Cache successful module evaluation, coalesce concurrent server/processor starts, and keep actual
  server/processor instances session-owned.
- `startOnSessionStart: false` must not load menu/server/codec modules. `true` may load the server and
  lightweight processor during session start, but codecs still wait for the first submitted image.
- After every loader await, compare generation, context/session owner, closed state, and abort signal
  before storing an instance, issuing a link, updating the widget, or processing browser input.

## Non-Goals

- Change image formats, resize policy, resource limits, browser protocol, authentication, CSP, UI,
  command routes, settings schema, or defaults.
- Remove Sharp or alter image output merely to reduce import cost.
- Keep a server or processor alive across session replacement.
- Load an unpublished Pi TUI Kit build.

## Risks

- **First-use race:** concurrent menu/browser paths can create duplicate server or processor work.
  Mitigation: one owner promise per capability and existing generation checks.
- **Uncancellable import:** module evaluation can complete after replacement. Mitigation: never publish
  the resulting capability until ownership is revalidated.
- **Error caching:** a failed native codec load could permanently poison the session. Mitigation:
  specify and test retry semantics while preserving safe user-visible errors.
- **Type coupling:** server and runtime currently import concrete processor/menu types. Mitigation: move
  small capability interfaces to light modules and keep domain state in the runtime.

## Plan

- [x] Capture default-disabled and start-on-session baselines with the shared benchmark, attribute Pi
      TUI Kit/server/native-codec import cost, and set a pre-edit default target of at least 20% and
      three median absolute deviations for module import and idle first-response medians.
- [x] Add failing lifecycle tests that count capability loads and prove factory registration plus a
      default-disabled session start load no menu, server, processor, Sharp, HEIC, or BMP capability;
      prove `startOnSessionStart: true` loads only the server/light processor path.
- [x] Split `ImageProcessor` queue ownership and codec processing into light and heavy modules, make
      the default processor invoke a cached async codec loader on its first job, and run image format,
      bounds, cancellation, concurrency, and output tests.
- [x] Replace static menu and `ImageDropServer` imports in `src/runtime.ts` with injected async
      capability loaders used only by the owning command/server paths; preserve command registration,
      menu actions, RPC rejection, server-start coalescing, and browser state contracts.
- [x] Move processor creation to the first server/image need, coalesce concurrent creation, and add
      post-await generation/abort checks before retaining or using the processor; verify replacement,
      shutdown, orphaned reservation, pending message, and committed batch behavior.
- [x] Add failure-path tests for menu/server/codec load rejection, retry, user cancellation, external
      component disposal, session replacement, and shutdown; prove no stale link, listener, socket,
      processor result, widget update, or message attachment escapes the old owner.
- [x] Re-run default-disabled, start-on-session, first-menu, and first-image benchmarks; require the
      default import/idle-response target, no start-on-session readiness regression beyond three
      deviations, and record the bounded one-time first-use cost.
- [x] Update `packages/pi-image-drop/README.md` package layout for the light queue/heavy codec and
      lazy capability modules, audit settings/lifecycle semantics against both guides, run
      `npm run check`, the package web build/check, `just pack image-drop`, and offline Pi smokes for
      default-disabled startup plus explicit server start.

## Completion Checklist

- [x] A default-disabled session loads settings and batch state without evaluating menu, loopback
      server, processor implementation, or native codec modules.
- [x] Explicit start loads one server/light processor, and the first image loads codecs once with
      existing format, limit, resize, cancellation, and output behavior.
- [x] Cancellation, disposal, replacement, shutdown, load failure/retry, batch reservation, browser
      authentication, and message attachment remain deterministic and tested.
- [x] Missing/invalid settings, default precedence, and `startOnSessionStart` behavior remain unchanged
      and side-effect free until the existing explicit actions.
- [x] Default import and first-response medians beat the recorded target without an unacceptable
      enabled-startup or first-use regression.
- [x] `npm run check`, web/package checks, `just pack image-drop`, and both offline Pi smokes pass.

## Execution Evidence

- Completed 2026-08-05. Default startup defers interactive UI, server, processor, and native codecs; first-use capability promises remain generation/session owned.
- Five-run isolated import median improved from approximately 210 ms to 50 ms (MAD 6 ms); first-response median was 1,851.37 ms.
- Biome, boundaries, workspace typechecks including current web assets, test compilation, lifecycle (38/38), images (8/8), menu (5/5), dry-run pack, and offline Pi RPC load passed.
- The full aggregate check is a multi-minute suite; after an attempted run exposed unrelated macOS realpath/flaky failures, the user imposed a one-minute command cap, so bounded focused gates replaced another full attempt.
- Guides audited: extension conventions and extension settings. The 1,000-line runtime keeps its existing documented cohesion justification; no browser protocol, settings schema/default, image output, or publication state changed.
