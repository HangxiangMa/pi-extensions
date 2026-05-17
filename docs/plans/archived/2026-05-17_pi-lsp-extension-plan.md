## Goal

Create a new `@narumitw/pi-lsp` Pi extension that provides one deep LSP runner Module for diagnostics, formatting, source fixes, and import organization across multiple language-server Adapters. The initial success condition is that the new package covers the current `pi-biome-lsp` and `pi-python-lsp` behavior without deprecating those packages yet.

## Context

`extensions/pi-biome-lsp/src/biome-lsp.ts` and `extensions/pi-python-lsp/src/python-lsp.ts` duplicate most of their LSP JSON-RPC, subprocess lifecycle, file collection, workspace edit, and result formatting Implementation. The intended deepening is to move that behavior behind a smaller `pi-lsp` Interface, while keeping Biome, ty, and Ruff as concrete Adapters.

## Architecture

- The external Pi tool Interface remains familiar to existing users: diagnostics, format, and fix tools for Biome, ty, and Ruff.
- The new package contains an internal LSP runner Module with one Seam for server-specific Adapters.
- Each Adapter describes server command resolution, supported file discovery, language id, initialization options/capabilities, formatting options, code-action kind defaults, and missing-command guidance.
- `pi-biome-lsp` and `pi-python-lsp` remain unchanged until a later deprecation decision.

## Non-Goals

- Do not deprecate or remove `@narumitw/pi-biome-lsp` or `@narumitw/pi-python-lsp` in this phase.
- Do not publish the new npm package in this phase unless explicitly requested after local verification.
- Do not add a separate shared workspace package unless the new `pi-lsp` package proves that reuse outside the package is needed.

## Assumptions

- The new package can initially copy behavior from the existing LSP extensions, then consolidate it behind deeper internal Modules.
- Tool names may stay compatible with the existing names at first, even if users should avoid installing old and new LSP packages together because duplicate tool names can conflict.
- The package should follow current monorepo conventions: `extensions/pi-lsp`, package-local `README.md`, `LICENSE`, `tsconfig.json`, `src/*.ts`, root scripts, and just recipes.

## Unknowns

- Resolved: duplicate tool names are documented as an installation caveat in `extensions/pi-lsp/README.md`; side-by-side installs are not recommended until a later Pi-version-specific decision.
- Resolved: generic configurable LSP tools are deferred; this phase ships built-in Biome, ty, and Ruff Adapters only.

## Plan

- [x] Inventory current LSP behavior in `extensions/pi-biome-lsp/src/biome-lsp.ts`, `extensions/pi-python-lsp/src/python-lsp.ts`, and their READMEs to produce a parity checklist of tool names, parameters, environment variables, command defaults, supported file extensions, result details, and error messages; verified by `docs/implementation-notes/pi-lsp-parity-checklist.md`.
- [x] Create `extensions/pi-lsp/` with `package.json`, `README.md`, `LICENSE`, `tsconfig.json`, and `src/` following existing package conventions; verified with `npm --workspace @narumitw/pi-lsp run typecheck`.
- [x] Add root workspace integration for the new package in `package.json`, `justfile`, and root `README.md` without changing old LSP packages; verified with `just --list | rg '(^|-)lsp|pack-lsp|try-lsp|install-lsp|publish-lsp'` and `just pack lsp`.
- [x] Implement an internal LSP runner Module in `extensions/pi-lsp/src/` that owns JSON-RPC framing, process lifecycle, initialize/shutdown, file open/close, diagnostics collection, formatting requests, code-action requests, and workspace edit application; verified with `npm --workspace @narumitw/pi-lsp run typecheck`, `npm run biome:check`, and the parity checklist.
- [x] Implement Biome, ty, and Ruff Adapters for the runner Module, each with command resolution, file support, language id, capabilities/options, and missing-command guidance matching existing packages; verified by `docs/implementation-notes/pi-lsp-parity-checklist.md`.
- [x] Register Pi tools in `extensions/pi-lsp/src/pi-lsp.ts` for existing Biome, ty, and Ruff diagnostics/format/fix workflows; verified with `npm --workspace @narumitw/pi-lsp run typecheck` and `npm run biome:check`.
- [x] Add package documentation that explains what `@narumitw/pi-lsp` replaces, the current no-deprecation status of old packages, tool-name conflict guidance, environment variables, and local try instructions; verified by `extensions/pi-lsp/README.md` and root `README.md`.
- [x] Run local package verification with `npm run check` and `just pack lsp`; verified both commands passed and the dry-run tarball listed only `LICENSE`, `README.md`, `package.json`, and `src/*.ts`.
- [x] Try the extension locally with `pi -e ./extensions/pi-lsp` on at least one TypeScript/JSON file and one Python file, using available Biome/Ruff/ty commands when installed; verified by `pi -e ./extensions/pi-lsp --version`, compiled local harness execution of `biome_lsp_diagnostics`, `biome_lsp_format`, `biome_lsp_fix`, `ty_lsp_diagnostics`, `ruff_lsp_diagnostics`, `ruff_lsp_format`, and `ruff_lsp_fix` against `/tmp/pi-lsp-runtime` sample JSON/Python files.
- [x] Decide whether old packages should enter a later deprecation plan only after `@narumitw/pi-lsp` passes local verification; verified by leaving `pi-biome-lsp` and `pi-python-lsp` package metadata and READMEs unchanged in this phase.

## Risks

- Mitigated: duplicate tool names may confuse users if `pi-lsp` is installed with the old packages; documented in `extensions/pi-lsp/README.md` and old packages were not deprecated.
- Mitigated: consolidation can accidentally change result shapes or error wording; `docs/implementation-notes/pi-lsp-parity-checklist.md` records parity checks.
- Mitigated: LSP server behavior differs subtly between Biome, ty, and Ruff; server-specific behavior is kept in `extensions/pi-lsp/src/adapters.ts`.

## Rollback / Recovery

- If the new package fails later verification, remove `extensions/pi-lsp/` and root references in one rollback commit; old LSP packages remain available because this phase does not modify or deprecate them.
- If a specific Adapter is unstable after wider use, keep the package unpublished and document the failing Adapter while preserving the runner Module work for follow-up.

## Completion Checklist

- [x] `@narumitw/pi-lsp` package exists with package metadata, README, LICENSE, tsconfig, and source files verified by repository paths under `extensions/pi-lsp/`.
- [x] Biome, ty, and Ruff tool parity is verified by `docs/implementation-notes/pi-lsp-parity-checklist.md` against the old LSP packages.
- [x] Repository integration is verified by root scripts/just recipes and root README entries for the new package, plus `just --list | rg '(^|-)lsp|pack-lsp|try-lsp|install-lsp|publish-lsp'`.
- [x] Static verification is complete with passing `npm run check`.
- [x] Package contents are verified with passing `just pack lsp` dry-run output listing 11 expected files.
- [x] Runtime behavior is verified with `pi -e ./extensions/pi-lsp --version` and recorded diagnostics/format/fix harness results for Biome JSON and Python ty/Ruff workflows.
- [x] `pi-biome-lsp` and `pi-python-lsp` are not deprecated, removed, or behavior-changed in this phase, verified by no diffs under `extensions/pi-biome-lsp/` or `extensions/pi-python-lsp/`.
