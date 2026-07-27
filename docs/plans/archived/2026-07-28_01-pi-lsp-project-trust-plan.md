# PR 01 — pi-lsp project settings trust

## Goal

Prevent pi-lsp from reading or executing project-local LSP configuration unless Pi trusts the current project, while preserving explicit environment configuration, user settings, defaults, and documented precedence.

## Architecture

- `extensions/pi-lsp/src/adapters.ts` remains the configuration parser, but configuration lookup receives the session project root and an explicit trust decision instead of inferring that every requested tool root is trusted.
- Command, lifecycle, and tool handlers pass `ctx.cwd` plus `ctx.isProjectTrusted()` for configuration selection. Tool parameters may still select files beneath another operation root, but they do not implicitly grant that root permission to supply executable configuration.
- Trusted project paths use Pi's `CONFIG_DIR_NAME`; untrusted projects skip canonical and legacy project files and continue with explicit `PI_LSP_CONFIG`, user settings, or built-in defaults.

## Non-Goals

- Do not change LSP server schemas, tool behavior, environment-variable compatibility, or legacy-file publication; hard-link removal belongs to PR 02.
- Do not add a new trust prompt or trust store outside Pi's existing API.

## Plan

- [x] Add focused tests in `extensions/pi-lsp/test/lsp.test.ts` proving an untrusted project's canonical and legacy config cannot alter the selected command, while a trusted project can; the focused red test selected `project` instead of `user` before implementation.
- [x] Refactor `loadRuntime()` and `loadConfig()` in `extensions/pi-lsp/src/adapters.ts` to accept an explicit project root and trust state, use `CONFIG_DIR_NAME`, and preserve precedence `PI_LSP_CONFIG -> trusted project -> user -> built-in`; the focused configuration tests pass.
- [x] Update `extensions/pi-lsp/src/pi-lsp.ts` so session, command, diagnostics, and fix paths use the active session's trust decision and never treat a tool-supplied root as trusted configuration authority; the command and diagnostics-tool test resolves only the user server without spawning the untrusted command.
- [x] Update `extensions/pi-lsp/README.md` to document project trust, precedence, and the distinction between configuration root and operation root; the documented four-level order agrees with the tested implementation.
- [x] Run `npm run typecheck --workspace @narumitw/pi-lsp`, `./node_modules/.bin/tsc -p tsconfig.test.json`, `node --test "$(realpath node_modules/.cache/pi-extensions-test/extensions/pi-lsp/test/lsp.test.js)"`, and `npm run check`; all focused tests and all 1,654 repository tests passed, while no external LSP server was needed for the deterministic trust path.

## Completion Checklist

- [x] No untrusted `.pi/pi-lsp.json` or `.pi/lsp.json` value can reach an adapter or spawned command.
- [x] Trusted project, user, environment, and built-in configuration retain deterministic documented precedence.
- [x] All configuration entrypoints use the same trust-aware lookup contract.
- [x] Documentation, focused tests, typecheck, deterministic tool smoke, and `npm run check` pass.
