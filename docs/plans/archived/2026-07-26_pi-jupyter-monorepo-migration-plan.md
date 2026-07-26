# pi-jupyter monorepo migration plan

## Goal

Migrate the independently developed `pi-jupyter` extension into `experimental/pi-jupyter` without deleting its original checkout, and adapt its package, source, tests, documentation, and root discovery to this monorepo's conventions.

## Assumptions

- Preserve `/home/narumi/workspace/pi-jupyter` as an unchanged standalone repository, per user choice.
- Preserve the published package name and existing command/shortcut surface while marking the migrated package experimental.
- Keep development notebooks out of the publishable package; use a small deterministic notebook fixture in tests instead.

## Plan

- [x] Add `experimental/pi-jupyter` package scaffolding, focused tests, and a thin `src/index.ts`; `npm test` initially failed on the intentionally absent `jupyter-preview.js` and `notebook.js` modules.
- [x] Split and adapt the extension implementation under `experimental/pi-jupyter/src/`, preserving preview behavior while enforcing TUI-only UI, scoped lifecycle cleanup, strict command arguments, current Pi imports, and an experimental warning; the first full `npm test` after implementation passed 1,474 tests.
- [x] Rewrite package metadata and README for workspace publishing, shared commands, security/limitations, package layout, and experimental status; `npm run check:boundaries` passed for 22 active packages and the package typecheck passed.
- [x] Add pi-jupyter to root discovery/documentation and update the workspace lockfile without unrelated dependency churn; `package-lock.json` contains only the new workspace and link records for pi-jupyter.
- [x] Run clean-install validation, focused tests, `npm run check`, an npm pack dry run, and a non-interactive Pi load smoke; `npm ci --dry-run` succeeded, eight focused tests and all 1,476 repository tests passed, the package contains only the intended eight publishable files, and Pi loaded the extension while listing 24 model lines.

## Completion Checklist

- [x] `experimental/pi-jupyter` is independently installable and follows active experimental package boundaries; the boundary validator and pack dry run passed.
- [x] Existing commands and shortcuts remain documented, and eight focused tests cover TUI overlay creation plus watcher, mouse-listener, overlay, and status cleanup.
- [x] The root README, `pack:jupyter` script, and generic/root convenience workflows expose the package consistently; `just --list` includes all four jupyter aliases.
- [x] The source checkout remains present and unchanged; its Git status is clean.
- [x] All required checks and smokes pass; `npm ci --dry-run`, `npm run check`, the pack dry run, and the non-interactive Pi load smoke completed successfully.
