# pi-lsp per-server diagnostics profiles plan

## Goal

Empirically test every built-in pi-lsp server through Pi inside Docker, then give each server an explicit, evidence-based diagnostics profile so cold-start diagnostics do not disappear behind premature empty results without imposing unnecessary delays on unrelated servers.

## Context

pi-lsp currently starts a fresh language-server process for each tool call. The built-in catalog contains 28 servers with different pull, push, startup, project-loading, and publication behavior. PR #367 added a generic late-push grace mechanism and enabled it for rust-analyzer after a real reproduction; this follow-up validates the entire catalog instead of extrapolating one server's behavior.

## Architecture

- Keep production behavior data-driven in the built-in adapter catalog; do not add server-name conditionals to `LspClient`.
- Run the real Pi SDK with the local pi-lsp entrypoint and invoke the registered `lsp_diagnostics` tool inside each Docker environment.
- Put a transparent stdio proxy between pi-lsp and each real language server to record timestamped JSON-RPC capabilities, pulls, responses, refreshes, progress, and push publications without changing production protocol behavior.
- Give every built-in server a matrix profile containing a pinned test environment, minimal erroneous fixture, clean control, expected diagnostic, and explicit production diagnostics policy. An explicit default policy is valid when measurements show no special settling is needed.

## Assumptions

- Docker Desktop remains available with Linux-container and outbound network access.
- The matrix targets one representative current Linux release of each server. Platform-only differences are documented and not inferred from an untested platform.
- Per-server customization means evidence-backed policy, initialization, or an explicit no-special-wait profile—not arbitrary delays for every server.

## Risks

- Some language servers or toolchains are large, platform-constrained, renamed, unredistributable, or unavailable from a reproducible Linux package source. Keep these rows open until a real runnable image exists; do not mark command discovery as a diagnostics pass.
- Timing varies by hardware. Use repeated cold starts, protocol events, bounded safety margins, and clean controls rather than setting delays equal to one observed sample.
- A full matrix is an opt-in smoke suite, not part of the normal repository gate, because it downloads many external toolchains.

## Plan

- [x] Add a Docker smoke harness under `extensions/pi-lsp/test/docker/` that loads local pi-lsp through the Pi SDK, invokes `lsp_diagnostics` without an external model, captures transparent JSON-RPC timing, and emits machine-readable results; verify it against the existing rust-analyzer regression scenario.
- [x] Add all 28 built-in servers to a validated matrix with pinned installation source/version, startup command, erroneous and clean fixtures, expected diagnostic match, repeats, and platform support; verify matrix names and commands stay synchronized with `DEFAULT_SERVER_CONFIGS`.
- [x] Run every runnable Linux matrix row repeatedly in Docker, exactly one server per harness invocation, and save a concise evidence report containing server version, advertised diagnostics capability, pull/push/refresh sequence, diagnostic latency, clean latency, and pass/fail reason.
- [x] Update `extensions/pi-lsp/src/adapters.ts` and the shared diagnostics state machine only where measurements require it, giving every catalog entry an explicit diagnostics profile while keeping pull errors, cancellation, timeouts, clears, and non-empty results correct; prove each new policy with deterministic fixtures before production changes.
- [x] Update focused tests and `extensions/pi-lsp/README.md` with per-server behavior, configuration semantics, matrix execution instructions, tested versions, and Linux/platform exceptions.
- [x] Run focused tests, the runnable Docker matrix, `npm run check`, and `just pack-lsp`; record exact evidence and archive this plan after every row reaches its required terminal status.

## Final evidence (2026-07-24)

The matrix was run strictly as 28 separate invocations of `run-matrix.mjs <profile>`. Every invocation used three fresh erroneous projects followed by three fresh clean projects. Timings below come from the final raw JSON results on Docker Desktop Linux x86_64 with Pi 0.82.0. Diagnostic latency is measured from `didOpen` to the first correct non-empty push or pull response; clean time is the full Pi tool lifecycle and therefore also exposes slow server shutdowns.

| Server | Tested version | Protocol | Correct diagnostic latency | Clean lifecycle | Error · clean counts | Explicit policy | Terminal status |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| biome | 2.5.4 | push | 6–20 ms | 1209–1211 ms | 2/2/2 · 0/0/0 | none | `passed-default` |
| ty | 0.0.61 | pull | 16–35 ms | 96–101 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| ruff | 0.15.22 | pull | 5–21 ms | 83–86 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| rust-analyzer | 2026-06-15 | empty pull → push + refresh | 577–738 ms | 5089–5092 ms | 1/1/1 · 0/0/0 | `pullDiagnosticsGraceMs=5000` | `passed-customized` |
| gopls | 0.23.0 | push | 57–623 ms | 1979–2031 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| rubocop | 1.80.2 | push | 40–44 ms | 1512–1517 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| elixir-ls | 0.31.1 | push | 128–135 ms | 16305–16963 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| zls | 0.16.0 | push | <1 ms | 899–908 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| csharp | 5.9.0-1.26319.6 | pull | 1332–1421 ms | 3424–3988 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| fsharp | 0.83.0 | push | 1742–1980 ms | 3396–3432 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| sourcekit-lsp | Swift 6.1.3 | push | 1297–1343 ms | 2555–2572 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| clangd | 21.1.8 | push | 10–39 ms | 907–910 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| jdtls | 1.60.0 | push | 1596–2086 ms | 4403–4525 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| kotlin-lsp | 262.8190.0 | pull | 36.4–36.6 s when available | 40.0–40.1 s | 0/1/1 · 0/0/0 | all attempted waits reverted | `unresolved` |
| yaml-language-server | 1.24.0 | push | 206–207 ms | 1886–1950 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| lua-language-server | 3.18.2-dev | push | 516–615 ms | 3204–3209 ms | 2/2/2 · 0/0/0 | `pushDiagnosticsGraceMs=3000` | `passed-customized` |
| intelephense | 1.18.2 | repeated push | 18–19 ms | 4726–4783 ms | 2/2/2 · 0/0/0 | `diagnosticsSettleMs=4000` | `passed-customized` |
| prisma | 31.1.0 | push | 111–137 ms | 1236–1243 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| dart | SDK 3.11.4 | push | 38–309 ms | 2104–2115 ms | 1/1/1 · 0/0/0 | `pushDiagnosticsGraceMs=2000` | `passed-customized` |
| ocaml-lsp | 1.26.0 | push | 267 ms | 31.2–31.4 s | 1/1/1 · 0/0/0 | none | `passed-default` |
| bash-language-server | 5.6.0 | push | 518–535 ms | 1545–1580 ms | 4/4/4 · 0/0/0 | none | `passed-default` |
| terraform-ls | 0.38.7 | empty push → non-empty push | 7–8 ms | 2086–2089 ms | 1/1/1 · 0/0/0 | `pushDiagnosticsGraceMs=2000` | `passed-customized` |
| texlab | 5.26.0 | push | 303–304 ms | 1185–1189 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| gleam | 1.17.0 | push | 122–137 ms | 2082–2084 ms | 1/1/1 · 0/0/0 | `pushDiagnosticsGraceMs=2000` | `passed-customized` |
| clojure-lsp | 2026.02.20 | push | 33–35 ms | 983–1004 ms | 3/3/3 · 0/0/0 | none | `passed-default` |
| nixd | 2.9.1 | push | 2 ms | 911–916 ms | 1/1/1 · 0/0/0 | none | `passed-default` |
| tinymist | tested pinned Nix build | push | 2–8 ms | 2096–2097 ms | 1/1/1 · 0/0/0 | `pushDiagnosticsGraceMs=2000` | `passed-customized` |
| haskell-language-server | 2.13.0.0 / GHC 9.10.3 | push | 760–786 ms | 4159–4188 ms | 1/1/1 · 0/0/0 | `pushDiagnosticsGraceMs=3000` | `passed-customized` |

### Decisions and exceptions

- **Result:** 19 `passed-default`, 8 `passed-customized`, 0 `unsupported`, and 1 `unresolved`.
- Push-only clean files previously had no terminal event and waited for the global timeout. The deterministic silent-push regression was added before the bounded `pushDiagnosticsGraceMs` implementation. Only six measured built-ins enable it; all other servers retain zero added delay.
- Rust-analyzer keeps its measured empty-pull-to-late-push grace. Intelephense keeps its repeated-publication settle window.
- A generic pull-repoll experiment and the C# repoll policy were reverted. The corrected C# syntax fixture returned the correct diagnostic on its first pull in all three runs, and the repoll only delayed clean files.
- Kotlin became runnable only after adding Gradle and the official JetBrains distribution/runtime compatibility setup. With that environment fixed, 15 s, 25 s, and 35 s repoll attempts still missed the first cold erroneous project (respectively 2/3, 2/3, and 2/3 error passes). Later projects benefited from Gradle caches, so increasing a fixed wait would hide a project-readiness problem and penalize every clean call. All production changes were reverted and the row is `unresolved`.
- SourceKit uses `swift:6.1.3-jammy`; the pinned Nix Swift 5.10 derivation attempted a local build and failed because its Clang rejected `-mtls-dialect=gnu2`.
- ElixirLS is preinstalled during image construction; otherwise its first tool invocation spends the request timeout compiling the release rather than testing diagnostics. OCaml fixtures prebuild Dune metadata; erroneous compiler output is permitted because the LSP is the component under test.
- ElixirLS and OCaml return correct diagnostics quickly but have long full lifecycle times, indicating server startup/shutdown overhead rather than a need to delay diagnostics.

### Final verification

- `npm run check` — passed after rebasing onto `origin/main`: Biome, boundary checks, all workspace typechecks, and 1,246 tests.
- `just pack-lsp` — passed: 13 publishable files; Docker smoke assets and raw evidence are excluded.
- `git diff --check` — passed.
- Final `docker ps` — no leftover matrix containers.

## Completion Checklist

- [x] Every built-in server has a synchronized matrix row and an explicit evidence-backed diagnostics profile.
- [x] Every supported Linux row executes the real Pi + local pi-lsp + real LSP path in Docker against erroneous and clean controls.
- [x] No server is reported as passing solely because its command starts or because an empty result was returned.
- [x] Protocol traces demonstrate why each non-default wait, settle, reverted experiment, initialization, or exception exists.
- [x] Repository checks and package dry run pass, the worktree contains only intended files, and the completed plan is archived.
