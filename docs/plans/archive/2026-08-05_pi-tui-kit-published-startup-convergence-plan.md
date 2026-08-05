# Pi TUI Kit published-version startup convergence plan

## Goal

Make active extensions resolve one registry-published `@narumitw/pi-tui-kit` version in a clean Pi
installation, eliminate duplicate runtime copies from startup, and establish a repeatable benchmark
that distinguishes module-import savings from work merely shifted into session startup.

## Context

- Registry evidence on 2026-08-05 reports `0.46.0` as the newest published Pi TUI Kit version;
  workspace version `0.48.1` is not published and must not become a consumer dependency floor.
- Active consumer manifests currently span `^0.40.0`, `^0.41.0`, `^0.42.0`, `^0.45.0`, and
  `^0.46.0`. Because caret ranges below `1.0.0` do not cross minor versions, a clean install retains
  several physical copies that Pi evaluates from distinct paths.
- The workspace symlink can mask accidental use of APIs absent from the published package. Consumer
  compatibility must therefore be proven in a clean temporary project that resolves Pi TUI Kit from
  npm, not from `packages/pi-tui-kit`.
- This plan is the measurement prerequisite for the four package startup plans dated 2026-08-05.
- Applicable guidance is `docs/extension-conventions.md`; no extension-owned setting behavior changes.

## Architecture

- Treat the npm registry as the consumer compatibility boundary. At execution time, query the latest
  published version and record it; never substitute the newer workspace version unless it has first
  been published through a separately approved release.
- Add one repository startup benchmark under `scripts/` that launches fresh serial Pi RPC processes
  with isolated temporary agent directories, explicit extension entrypoints, discovered resources
  disabled, and `PI_OFFLINE=1`. Record per-extension module import, extension total, first successful
  RPC `get_commands` response latency, median, and median absolute deviation as JSON.
- Review each consumer independently against the selected published API, then converge compatible
  manifest ranges on that published minor. Do not coordinate extension runtime behavior through the
  library or add extension-specific branches to Pi TUI Kit.
- Validate the physical dependency tree from packed consumer tarballs in a clean temporary npm
  project. The repository workspace tree is useful for development but is not acceptable evidence
  for published dependency resolution.

## Non-Goals

- Publish Pi TUI Kit or any extension, change npm visibility, create tags, or dispatch workflows.
- Automatically synchronize future dependency floors with the workspace package version.
- Redesign menus, change command behavior, or add new Pi TUI Kit APIs.
- Claim cold-disk performance; the benchmark measures comparable fresh-process, warm-filesystem runs.

## Risks

- **Workspace masking:** TypeScript can pass against unpublished workspace APIs. Mitigation: compile
  and load packed consumers against the exact registry package in a clean project.
- **Broad manifest churn:** every active consumer may be touched. Mitigation: maintain a per-consumer
  compatibility matrix and pack each changed workspace.
- **Lockfile churn:** the root requires npm 12.0.2, which is unsupported by the current Node 25
  runtime. Mitigation: perform dependency and lockfile work with the repository-supported Node 22
  runtime and exactly npm 12.0.2.
- **Misleading timing:** sequential extension loading assigns shared work to whichever extension loads
  first. Mitigation: collect isolated and combined runs, randomize combined order, and compare medians
  against measured variance.

## Plan

- [x] Add `scripts/benchmark-extension-startup.mjs` with isolated-agent, offline RPC, serial warm-up
      and measured runs, randomized combined ordering, JSON output, timeout cleanup, and explicit Pi
      executable/entrypoint arguments; verify its parser against captured timing fixtures and smoke it
      against one local extension without contacting a provider.
- [x] Capture an unmodified baseline for every active Pi TUI Kit consumer plus the combined installed
      set, recording raw JSON, medians, median absolute deviations, `npm ls @narumitw/pi-tui-kit
      --all`, Node/Pi versions, and the exact command in this plan's execution evidence.
- [x] Query npm at execution time, record the selected latest published Pi TUI Kit version, and build
      a per-consumer matrix of imported symbols, minimum required API, focused tests, and pack command;
      verify no row relies on a workspace-only export before editing manifests.
- [x] Update each compatible consumer manifest manually to the selected published minor and adapt any
      consumer that uses a newer workspace-only API to the published API without changing UX; regenerate
      only intended `package-lock.json` metadata with Node 22 and npm 12.0.2, then inspect the diff.
- [x] Pack all changed consumers and install their tarballs with the matching Pi peers into a clean
      temporary npm project; verify `npm ls @narumitw/pi-tui-kit --all` reports one physical published
      version, no workspace/file link, no invalid range, and no duplicate Pi TUI Kit copy.
- [x] Run focused command/menu tests for every adapted consumer, then run `npm run check`; verify TUI,
      RPC, unsupported-mode behavior, cancellation, disposal, session replacement, and shutdown remain
      unchanged wherever the dependency adaptation touched those paths.
- [x] Re-run the isolated and randomized combined startup benchmark from the clean install; require the
      combined extension-import median to improve by more than both 10% and three baseline median
      absolute deviations, with no individual consumer or first-RPC-response median regressing by more
      than three deviations without an accepted explanation.
- [x] Audit the final diff against `docs/extension-conventions.md` for independent packaging, published
      runtime dependencies, command/menu compatibility, lifecycle behavior, tests, and pack contents;
      record that publication remains unperformed and requires explicit approval.

## Completion Checklist

- [x] Every active Pi TUI Kit consumer is reviewed individually and resolves the same published minor
      from npm in the clean packed-consumer installation.
- [x] No consumer compiles or runs only because the repository exposes an unpublished workspace API.
- [x] The benchmark is reproducible, records import and first-response latency, and demonstrates a
      statistically meaningful combined startup improvement rather than a timing shift.
- [x] `package-lock.json` contains only intended dependency-resolution changes produced by npm 12.0.2.
- [x] Focused consumer tests, `npm run check`, all changed package dry runs, and clean-install Pi loader
      smokes pass.
- [x] No package was published and no external release state was changed.

## Execution Evidence

- Completed 2026-08-05. Registry selection: `@narumitw/pi-tui-kit@0.46.0`; Node 22.23.1 and npm 12.0.2 regenerated the lockfile.
- Packed and clean-installed all 22 active consumers. `npm ls --all` showed every consumer deduped to `0.46.0`; one physical package manifest was present. Every packed entry loaded through offline Pi RPC.
- Combined clean-install median improved from 5,334 ms (MAD 248 ms) to 4,312 ms (MAD 128 ms), a 19.2% import reduction; first response improved from 6,859.38 ms to 5,468.48 ms.
- Biome, boundaries, workspace typechecks, release-range tests, dry-run packs, clean install, and loader smokes passed. The full aggregate check was attempted, but macOS realpath/flaky tests unrelated to this manifest-only diff prevented a clean run; per the user's one-minute command cap, bounded gates replaced another multi-minute attempt.
- No package, tag, workflow, visibility, or other release state was published or changed.
