# Starship module alignment plan

## Goal

Align module-owned display behavior in `pi-starship` with the checked-in Starship reference, and use the same directly applicable presentation defaults in `pi-statusline`, without changing pi-statusline's configured segment list, responsive layout policy, or Pi-native module semantics.

## Context

- Reference implementation: `third_party/starship` at `cad50cd8`.
- `pi-starship` owns Starship-inspired TOML module options and should implement compatible behavior in each analogous module rather than in the root renderer.
- `pi-statusline` keeps its JSON settings, Powerline layout, information profiles, and Pi-native model/activity/status behavior; only directly analogous segment presentation defaults change.
- The applicable extension and settings guides are `docs/extension-conventions.md` and `docs/extension-settings.md`.

## Architecture

- Keep domain policy in the owning module or segment: directory path contraction in `directory`, branch truncation in `git_branch`, environment-path contraction in `conda`, and model aliases/truncation in `model`.
- Share only pure primitives within each independently installable extension; do not introduce extension-to-extension imports or a generic renderer-level truncation policy.
- Publish plain home/repository path data into immutable runtime snapshots where directory rendering requires it; rendering remains synchronous and side-effect free.

## Non-Goals

- Do not change pi-statusline information profiles, segment retention priorities, root layout, or extension-status layout.
- Do not copy Starship's module `disabled` defaults into pi-statusline.
- Do not claim complete Starship configuration compatibility or add unsupported Starship modules.
- Do not change Pi-native model truncation directions, activity lifecycle, usage accounting, or status-map semantics.

## Plan

- [x] Add focused failing `pi-starship` tests for Starship-compatible directory contraction/truncation, Git branch grapheme truncation, configurable commit hash length, empty hostname `trim_at`, configurable Conda path truncation, and exact model aliases; verified red failures through the compiled Node test path on 2026-08-02.
- [x] Implement pure module-owned path/text primitives and the `pi-starship` catalog options/runtime snapshot data needed by those tests; focused config, module, Git runtime, workspace runtime, and lifecycle tests pass.
- [x] Add focused failing `pi-statusline` tests for Starship-default directory presentation (home/repository contraction and three-component truncation) while preserving the existing segment list and Pi-native model behavior; verified the expected basename-to-contracted-path red failure.
- [x] Implement cached repository-root publication plus module-owned directory presentation in `pi-statusline`, using Starship defaults internally without adding renderer-level overflow policy; focused renderer, lifecycle, cancellation, settings, and responsive coverage passes.
- [x] Update both package READMEs to document the supported module options/defaults, adaptations, and intentional compatibility limits; examples match the tested defaults and schemas.
- [x] Audit the final diff against the extension/settings touched-area checklists: render paths consume snapshots only; Git refreshes are generation-guarded and abort on replacement/branch change/disposal; existing settings loading, validation, unknown-field preservation, and atomic publication remain covered by the full suite. Documented deviations are bounded integer sentinels, literal-only substitutions, and unavailable logical/repo-split formatting.
- [x] Run `npm run check`, then dry-run packs for `@narumitw/pi-starship` and `@narumitw/pi-statusline`; `npm run check` passed 2,184 tests plus all validators, and pack inspection found the forwarding entrypoints, new directory/truncation sources, READMEs, and no tests in 62/27 published entries respectively.

## Completion Checklist

- [x] `pi-starship` analogous modules expose and honor the agreed Starship-compatible options with deterministic Unicode/path behavior.
- [x] `pi-statusline` uses Starship directory presentation defaults without changing its default segment membership or Pi-native module defaults.
- [x] No renderer-wide truncation or cross-extension dependency was introduced.
- [x] Focused tests, full repository checks, and both package dry runs pass.
- [x] The completed plan is archived under `docs/plans/archived/` with all evidence checked.
