## Goal

Migrate the complete Pi WebUI browser surface to React and the Radix UI ecosystem—Primitives, Colors, Themes, and Icons—while preserving its authenticated loopback protocol, current-session semantics, draft and attachment recovery, streaming transcript behavior, and accessibility.

## Context

- The current browser page is a framework-free DOM application in `extensions/pi-webui/src/web/` with native details/dialog controls and a hand-authored color system.
- `@radix-ui/themes` and Radix Primitives are React libraries, so applying the requested stack coherently requires a bundled React entrypoint rather than selectively restyling the existing DOM.
- Published Pi extensions execute source directly, while browsers cannot resolve npm bare imports. The package therefore needs checked-in, reproducibly generated browser assets plus source modules and a stale-bundle verification step.

## Architecture

- Keep `state.js`, the server API, SSE events, authentication, lease ownership, and Pi runtime unchanged.
- Add a React source tree under `src/web/ui/`; use `@radix-ui/themes` for layout and controls, `radix-ui` Primitives for disclosures/popovers/dialogs/tooltips, `@radix-ui/colors` for official color scales, and `@radix-ui/react-icons` for interface iconography.
- Bundle React, Radix, and local browser modules with esbuild into authenticated `src/web/app.js` and `src/web/app.css`. Keep generated assets committed and verify them against a temporary rebuild during checks.
- Preserve semantic Markdown by rendering the existing safe parser AST through React elements; keep untrusted content out of raw HTML APIs.

## Non-Goals

- Do not change message delivery, attachment processing, retention, settings, authentication, replay, or session lifecycle semantics.
- Do not add remote assets, browser persistence, a CDN, a session manager, or new product capabilities.
- Do not reproduce every Radix demo pattern; use primitives only where they improve existing controls and states.

## Risks

- A framework migration can regress draft idempotency, lease behavior, scroll following, drag ordering, or dialog focus; retain pure state tests and run focused browser scenarios.
- Bundling React and Radix increases static asset size; minify production assets and inspect the npm pack while accepting the explicit dependency tradeoff requested here.
- Radix overlays render through portals; verify CSP compatibility, focus restoration, narrow reflow, dark mode, and ended/stale states in a real browser.

## Plan

- [x] Added React, Radix Primitives/Themes/Colors/Icons, and esbuild dependencies plus deterministic `build:web`/`check:web` scripts; a temporary rebuild matches committed `app.js` and `app.css` byte-for-byte.
- [x] Added red-first `radix-ui-contract.test.ts` coverage (initially 4/4 failing) and migrated `web-ui-contract.test.ts`/server asset coverage for the React root, complete Radix stack, safe Markdown, and local bundles.
- [x] Rebuilt the header, transcript, status states, composer, attachment cards, confirmations, disclosures, popover, tooltips, and preview with Radix Themes and Primitives while retaining the existing pure state and authenticated API protocol; all 1,281 tests pass.
- [x] Replaced custom colors/icons with Jade/Red Radix Colors scales and Radix Icons; Chrome verified automatic dark appearance, text labels, 44 px controls, and reduced motion.
- [x] Narrowed the authenticated server allowlist to `app.js`/`app.css` and updated the README package/build guidance; server header/asset tests and the npm pack preview pass.
- [x] Ran package checks, root `npm run check`, browser smokes, `git diff --check`, and `just pack-webui`; all pass and evidence is recorded below.

## Completion Checklist

- [x] Controls use Radix Themes or Primitives, iconography uses Radix Icons, and custom states use official Jade/Red Radix Colors variables, verified by focused source contracts and the bundled browser smoke.
- [x] Existing send/queue/steer, draft, reconnect, lease, transcript, attachment, retention, stale-tab, and ended-session coverage passes in the 1,281-test root suite.
- [x] Safe Markdown renders parser AST nodes as React elements without raw HTML APIs; parser security and source contract tests pass.
- [x] Chrome verified light UI, session popover/Escape restoration, draft/send, image staging, non-submitting preview controls, dialog focus return, clear confirmation/cancel/confirm recovery, 320 px zero overflow, dark mode, reduced motion, and 44 px minimum controls.
- [x] Generated assets are current; `npm --workspace @narumitw/pi-webui run check`, root `npm run check`, `git diff --check`, and `just pack-webui` pass. The dry run contains 29 intended files, including both bundles and all browser source, and excludes tests/build scripts/cache/node_modules.
