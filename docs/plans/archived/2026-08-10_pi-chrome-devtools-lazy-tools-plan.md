# Pi Chrome DevTools Lazy Tools Plan

## Goal

Keep one lightweight `chrome_devtools_load` tool active and load the five Chrome DevTools capability tools only when the model requests a matching browser capability.

## Context

Pi 0.84 supports dynamic tool loading when a loader makes a purely additive `setActiveTools()` call during execution.

The five existing tools are already independently registered and configurable through `pi-chrome-devtools.json`.

The saved `tools` array becomes the allowed lazy-load catalog rather than an eager startup list.

## Architecture

- Register all five capability tools plus one loader tool at extension load.
- Keep the loader active across the session and remove allowed capability definitions from the initial active set.
- Match loader queries against a small package-owned capability catalog and add only allowed matches.
- Keep loader activation additive so Pi can use native deferred tool references where supported.
- Remove `promptSnippet` metadata from deferred tools so loading a tool does not rebuild the system prompt prefix.
- Treat menu and settings selection as availability policy; removing availability also unloads the affected active capability, while adding availability waits for a loader call.

## Non-Goals

- Do not lazy-load the extension module itself.
- Do not change CDP execution, browser launch, screenshot safety, or endpoint behavior.
- Do not add provider-specific deferred-loading payloads.

## Plan

- [x] Add focused lazy-loading tests under `packages/pi-chrome-devtools/test/` for registration, initial active-set reduction, matching, additive activation, allowed-catalog enforcement, and repeated loads; the initial focused run failed in the four new lazy-loading cases before implementation.
- [x] Add the loader and allowed-catalog runtime policy under `packages/pi-chrome-devtools/src/`; package typecheck and all 65 Chrome DevTools tests pass.
- [x] Update menu, command status, and settings language to distinguish available tools from currently loaded tools; focused menu, settings, lifecycle, managed-browser, and extension tests pass.
- [x] Update `packages/pi-chrome-devtools/README.md` and add a minor Changeset; `npm run changeset:status` resolves the package to the intended minor release.
- [x] Audit dynamic-loading additivity, prompt metadata, cancellation/lifecycle, settings ordering and rollback, invalid-file protection, unknown-field preservation, and session replacement against `docs/extension-conventions.md` and `docs/extension-settings.md`; no deviation remains.
- [x] Run package-focused tests and typecheck, `npm run check`, `just pack chrome-devtools`, and a non-interactive Pi load smoke; all pass with an isolated temporary Pi agent directory, and the tarball contains 16 expected files including `src/lazy-tools.ts`.

## Completion Checklist

- [x] Only `chrome_devtools_load` is initially active for the extension after session initialization.
- [x] A loader call exposes matching allowed capability tools on the next model request without removing any active tool.
- [x] Disabled capabilities cannot be loaded, and explicit settings changes remain ordered, atomic, and rollback-safe.
- [x] Documentation explains native deferred loading, fallback behavior, availability policy, and command semantics.
- [x] All required checks pass and the completed plan is archived.
