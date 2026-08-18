## Goal

Expose lightweight, supported `@narumitw/pi-tui-kit/terminal-text` and `@narumitw/pi-tui-kit/interaction-hints` subpaths so consumers can avoid evaluating the package root while preserving every existing root import.

**Status: DONE**

## Context

The published package already contains ESM and declaration files for both modules, but its export map exposes only `.` and `./testing`.

Fresh Pi-loader measurements showed the root taking roughly 75 ms while each lightweight module took roughly 3–4 ms when loaded directly.

The two subpaths cover the current startup-sensitive leaf helpers without turning every internal source module into a new public path.

Changesets explicitly schedules only the Kit minor, while the repository's `updateInternalDependencies: "patch"` policy reports automatic patch bumps for current `^0.55.0` dependents because a zero-major `0.56.0` leaves their existing range.

## Non-Goals

Consumer migrations in `pi-starship`, `pi-statusline`, and `pi-recall` are separate follow-up work because consumers must not raise their Kit compatibility floor until the new Kit API is published.

This objective does not add subpaths for `runMenu`, `runConfirmation`, `runLiveChoice`, `runCustomInteraction`, `runTask`, `defineMenu`, `resolveMenuScreen`, or `createMenuNavigator`.

It does not increment `PI_EXTENSION_MENU_API_VERSION` because the declarative menu contract is unchanged.

Publishing, tagging, changing npm visibility, and dispatching release workflows are excluded until separately approved.

## Risks

Subpath names become public compatibility contracts once published, so their export names and declaration targets must remain stable.

A test that only proves resolution could miss accidental eager loading of `dist/index.js`, so verification must also inspect fresh-process module resolution and benchmark output.

Root consumers must remain fully compatible, including existing runtime exports, types, and the separate `./testing` boundary.

## Rollback / Recovery

Before publication, revert the export-map, tests, documentation, benchmark, and changeset together if verification fails.

After publication, retain the published subpath names and issue a forward fix rather than removing them in a patch release.

## Plan

- [x] Record a fresh baseline for the root, `dist/terminal-text.js`, and `dist/interaction-hints.js` with the Pi extension loader; verified on 2026-08-18 with five fresh `PI_TIMING=1` loader processes per target: root `83/83/79/75/75ms`, terminal text `3/3/3/3/3ms`, and interaction hints `3/3/3/3/3ms`.
- [x] Add `./terminal-text` and `./interaction-hints` entries to `packages/pi-tui-kit/package.json`, each mapping `types` and `import` to its existing built declaration and ESM files; verified `npm run build --workspace @narumitw/pi-tui-kit` and fresh ESM imports resolved to the intended `dist/*.js` files with exact runtime exports.
- [x] Replace `packages/pi-tui-kit/test/testing-exports.test.ts` with the accurately named `package-exports.test.ts` contract covering root compatibility, the isolated `./testing` API, exact subpath runtime exports, and NodeNext function/type imports; verified `npx vitest run packages/pi-tui-kit/test/package-exports.test.ts` passed (1 file, 1 test).
- [x] Extend `scripts/benchmark-tui-kit-runtime.mjs` with fresh-process import scenarios and graph flags for both subpaths; verified a one-run smoke reported root/runtime/components/highlight/Mermaid all `false` for both leaf imports while the root scenario reported its expected graph as loaded.
- [x] Update `packages/pi-tui-kit/README.md` installation guidance, runtime-performance guidance, examples, public API notes, and package layout for both optimized subpaths while retaining root compatibility; verified a script matched every documented Kit specifier to a `package.json` export key.
- [x] Add a Changesets minor entry for `@narumitw/pi-tui-kit` describing the two backward-compatible public subpaths; verified `npm run changeset:status` schedules the explicit Kit `0.56.0` minor and, as expected from repository policy, reports only automatic dependent patch bumps with no consumer changeset or source migration in this diff.
- [x] Run `npm run check --workspace @narumitw/pi-tui-kit` without concurrent root or Kit builds; verified Biome checked 60 files, TypeScript passed with no emit, and the clean ESM/declaration build succeeded.
- [x] Run the updated runtime benchmark serially with five measured runs; verified root median `110.87ms`, terminal-text median `1.06ms`, and interaction-hints median `1.21ms`, with both subpaths reporting root/runtime/components/highlight/Mermaid flags `false` and no timing threshold added to CI.
- [x] Pack and inspect the Kit tarball; the initially planned `just pack pi-tui-kit` failed because the recipe prepends `pi-`, then `just pack tui-kit` passed, and an actual cache-local `npm pack` produced 65 files containing package metadata, README, license, both ESM/declaration pairs, and an extracted-fixture smoke resolved both public subpaths.
- [x] Run the repository CI-equivalent `npm run check` after focused checks; the first attempt exposed benchmark formatting and failed Biome while boundaries, typechecks, and 3,483 tests passed, then targeted formatting passed and the final post-hardening rerun passed build, 1,056-file Biome check, boundaries, all workspace typechecks, and 354 files/3,483 tests.
- [x] Inspect the final diff against `docs/extension-conventions.md`, package and release boundaries, the hardening edge-case checklist, and this plan; verified root/testing compatibility, exact leaf exports, workspace and installed-package benchmark URL detection, no lifecycle or state path, and no consumer floor, unrelated API, tracked `dist`, visibility, tag, or publication change.

## Completion Checklist

- [x] `@narumitw/pi-tui-kit/terminal-text` resolves to built ESM and declarations, exports the documented sanitizer API, and avoids the root runtime graph, proven by the package contract, five-run benchmark, and extracted-tarball smoke.
- [x] `@narumitw/pi-tui-kit/interaction-hints` resolves to built ESM and declarations, exports the documented formatter and types, and avoids the root runtime graph, proven by the package contract, five-run benchmark, and extracted-tarball smoke.
- [x] Existing `@narumitw/pi-tui-kit` and `@narumitw/pi-tui-kit/testing` imports remain compatible, proven by runtime export assertions, the NodeNext fixture, and the full repository suite.
- [x] README guidance, the minor Changeset, pack inspection, package check, repository check, and final semantic audit all passed with evidence recorded above.
- [x] The objective is `DONE` with every required checkbox verified; publication and consumer migration were explicitly not performed.
