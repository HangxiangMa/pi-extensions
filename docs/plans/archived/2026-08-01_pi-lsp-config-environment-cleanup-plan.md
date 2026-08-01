# pi-lsp config environment cleanup

## Goal

Remove pi-lsp's extension-specific environment-variable configuration surfaces while preserving its explicit argv-array server configuration and `servers[].env` forwarding to LSP server processes.

After the change, pi-lsp configuration comes from its user/trusted-project JSON files or the built-in catalog. Existing JSON commands such as `{"command":["uv","run","--no-sync","ruff","server"],"extensions":[".py",".pyi"]}` remain supported.

## Context

- `PI_LSP_CONFIG` currently supplies inline JSON or a config-file path above all file-based settings.
- Each adapter currently derives `PI_<SERVER>_LSP_COMMAND`, which can replace the configured argv through a shell-like string parser.
- Canonical settings already exist at `<getAgentDir()>/pi-lsp.json` and trusted `<workspace>/.pi/pi-lsp.json`; current legacy `lsp.json` compatibility remains in scope only as unchanged behavior.
- `servers[].env` is not a pi-lsp settings source. It intentionally overrides values passed to one LSP child process and may provide `JAVA_HOME`, logging, proxy/CA, memory, or an effective `PATH`.

## Architecture

Configuration precedence becomes:

```text
trusted project pi-lsp.json (or existing legacy fallback)
→ user pi-lsp.json (or existing legacy fallback)
→ built-in catalog
```

Command resolution becomes:

```text
server command argv from JSON/catalog
→ resolve command[0] with cwd and the server's effective PATH
→ spawn with inherited process environment plus servers[].env overrides
```

`PI_CODING_AGENT_DIR` remains Pi infrastructure handled indirectly through `getAgentDir()`; standard process variables such as `PATH` and Windows `ComSpec` remain runtime inputs rather than pi-lsp-specific settings.

## Non-Goals

- Managed runtimes, package installation, registries, isolated caches, or LSP value benchmarking.
- Removing or changing `servers[].env` or inherited child-process environment behavior.
- Changing argv-array `command`, `extensions`, initialization, skip-directory, or diagnostics-timing fields.
- Changing current server-map replacement semantics, flat/wrapper JSON compatibility, canonical paths, project trust gating, or legacy `lsp.json` fallback.
- Adding replacement environment variables, shell command strings, runtime selectors, settings UI, or implicit command fallback.

## Plan

- [x] Add focused regression tests proving `PI_LSP_CONFIG` cannot override user/trusted-project settings and `PI_<SERVER>_LSP_COMMAND` cannot override configured argv, while existing `servers[].env` forwarding and effective-`PATH` command resolution still work. Red evidence: file-source expectations received `explicit`, then command status received `overridden-user --stdio`; green evidence: all 24 focused pi-lsp tests pass, including child-environment forwarding.
- [x] Update `extensions/pi-lsp/src/adapters.ts` and `extensions/pi-lsp/src/types.ts` to remove `PI_LSP_CONFIG` loading and per-adapter command-environment metadata, leaving canonical/legacy file loading, project trust, validation, and explicit argv normalization unchanged; focused canonical, legacy-race, trust, and validation tests pass.
- [x] Update `extensions/pi-lsp/src/runner.ts`, `extensions/pi-lsp/src/routes.ts`, `extensions/pi-lsp/src/pi-lsp.ts`, and `extensions/pi-lsp/src/command.ts` to execute adapter argv directly, remove shell-string environment override parsing and `PI_*` installation hints, and preserve cwd/effective-`PATH` resolution plus child environment merging; focused command, route, and LSP-client tests pass.
- [x] Update `extensions/pi-lsp/README.md` to document file-only settings precedence, migration from `PI_LSP_CONFIG` to canonical JSON, migration from `PI_<SERVER>_LSP_COMMAND` to `servers.<name>.command`, and the distinct retained purpose of `servers[].env`; examples use argv arrays and no longer recommend pi-lsp-specific environment variables.
- [x] Audit the final settings and asynchronous process paths against `docs/extension-conventions.md` and `docs/extension-settings.md`: missing-file reads remain side-effect free, project settings remain trust-gated, invalid files still fail without overwrite, no persistence path changed, and command selection no longer changes timeout/cancellation/session/shutdown ownership.
- [x] Run focused pi-lsp tests and typecheck, `lsp_diagnostics` with an explicit configured command, `just pack-lsp`, and the repository CI-equivalent `npm run check`. Evidence: 24 focused tests and package check pass; the explicit file-config SDK smoke ignores both removed variables and returns the expected diagnostic; the 13-file pack dry run contains the edited sources/README; and a normal-clone root check passes all 2,026 tests. Windows runtime execution remains untested on this Linux host, while deterministic Windows PATH/batch-wrapper coverage passes.

## Risks

- Existing automation that depends on inline/path `PI_LSP_CONFIG` or per-server command variables will break immediately. Mitigation: preserve equivalent JSON argv configuration and provide a direct README migration table.
- Removing command-string parsing also removes quoting behavior users may rely on. Mitigation: JSON argv arrays represent each argument without shell quoting ambiguity.
- Broad environment-variable searches can confuse Pi infrastructure or server-owned variables with removed pi-lsp settings. Mitigation: audit production reads by ownership and retain `getAgentDir()`, standard process environment, and `servers[].env` behavior explicitly.

## Completion Checklist

- [x] Production pi-lsp code no longer reads `PI_LSP_CONFIG` or generated `PI_<SERVER>_LSP_COMMAND` variables and exposes no replacement pi-lsp-specific environment setting.
- [x] Explicit argv-array server commands and `servers[].env`, including effective-`PATH` resolution, have regression coverage and unchanged documented behavior.
- [x] Canonical user/trusted-project settings precedence, project trust, validation, current JSON shapes, and legacy file fallback remain verified.
- [x] Focused checks, package dry run, runtime smoke, and full repository gate pass, with no unintended source, metadata, or public tool changes.
