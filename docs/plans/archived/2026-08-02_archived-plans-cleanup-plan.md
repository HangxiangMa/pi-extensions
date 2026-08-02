# Archived Plans Cleanup Plan

## Goal

Reduce `docs/plans/archived/` from the audited 212-plan baseline plus two plans added concurrently on
`main` to only the newly completed cleanup plan required by the repository planning workflow, while
preserving current architectural, lifecycle, compatibility, settings, and empirical-test knowledge
in authoritative documentation.

## Context

- The starting archive contained 212 Markdown files, 17,303 lines, and about 1.47 MB of text.
- PR preparation rebased onto a newer `main` that had archived two additional Pi TUI Kit execution
  plans. They were reviewed as a separate post-baseline increment rather than silently added to the
  approved 212-file manifest.
- The audit classified 193 plans as fully superseded by Git/PR history, current source, tests,
  package READMEs, conventions, or roadmaps.
- Nineteen plans contain durable facts that should be distilled before their source plans are
  deleted:
  - six pi-goal lifecycle plans;
  - two pi-subagents policy plans;
  - one Pi TUI Kit compatibility-range plan;
  - nine pi-sync architecture/settings plans; and
  - one pi-lsp diagnostics-matrix plan.
- At plan creation, four maintained documents linked to 14 distinct archived plans:
  `docs/roadmaps/pi-tui-kit-roadmap.md`, `docs/roadmaps/pi-stamp-roadmap.md`,
  `docs/adr/pi-sync-git-backend.md`, and `extensions/pi-lsp/test/docker/README.md`.
- Git and GitHub remain the historical authority for completed checklists, PR follow-ups, migration
  sequencing, old verification counts, and superseded designs.

## Architecture

Documentation ownership after cleanup:

- Package READMEs own public behavior, configuration, API compatibility, and user workflows.
- `docs/adr/` owns accepted architectural decisions and their trade-offs.
- `docs/implementation-notes/` owns current internal lifecycle mechanisms, research conclusions, and
  implementation constraints that are not public API.
- `docs/roadmaps/` owns future direction and outcome-oriented milestone state, without depending on
  archived execution plans.
- `docs/plans/` owns active executable plans. Completed plans are archived as required by the planning
  workflow, but archived plans are eligible for later curation after durable facts have moved to the
  owning documentation.

## Non-Goals

- Changing extension or package runtime behavior.
- Preserving completed implementation chronology outside Git and GitHub.
- Moving whole plans into `docs/implementation-notes/` or creating a second historical archive.
- Rewriting package READMEs, roadmaps, ADRs, or implementation notes beyond the facts required to
  remove stale claims and archive dependencies.
- Changing package versions, dependency ranges, release state, or generated files.

## Assumptions

- The 212-file inventory is the approved baseline cleanup scope. Any post-baseline addition must be
  reviewed and evidenced separately before deletion rather than being folded silently into that
  manifest.
- Current source, tests, manifests, and package READMEs override conflicting archived-plan claims.
- The current cleanup plan will be archived only after all tasks pass, so the final archive will
  contain that newly completed plan rather than the 212 plans reviewed here.

## Risks

- **Durable rationale could be lost:** extract the 19 identified sources before deleting any archive
  file, and review each destination against current code/tests rather than copying plan prose.
- **Stale plan-era facts could become authoritative:** remove old versions, test counts, file sizes,
  branch names, and recommendations that current implementation has superseded.
- **Maintained documents could retain broken links:** replace every inbound archive link and run a
  repository-wide Markdown reference search before deletion is accepted.
- **The broad deletion could include concurrent additions:** record and verify the exact 212-path
  baseline before deletion; additions discovered during PR integration require their own extraction,
  review, and deletion evidence.

## Rollback / Recovery

All changes are documentation-only. Before commit, restore any incorrectly deleted plan with Git and
reopen its extraction task. After commit, revert the focused documentation commit or restore an
individual historical file from its parent commit. Do not retain duplicate source plans merely as a
rollback mechanism.

## Plan

- [x] Record the exact 212-file baseline from `docs/plans/archived/*.md`, confirm there are no
  non-Markdown archive files, and save a temporary sorted manifest for deletion review; accept when
  the manifest count is 212 and matches the audited topic partition
  `29 + 18 + 14 + 22 + 17 + 31 + 81`. Evidence: `/tmp/pi-archived-plans.before` contains 212 sorted
  Markdown paths (SHA-256 `aca3b465471b79be5334f48af3ca50b45a15186ef1b82e9beac39c8299c89e3d`),
  with zero non-Markdown files/subdirectories; an exclusive classifier reproduced the expected
  `29/18/14/22/17/31/81` partition.
- [x] Rewrite `docs/implementation-notes/pi-goal-interruption-research.md` from the current pi-goal
  source/tests and the six plans dated 2026-06-29, 2026-07-05 (continuation and stopped statuses),
  2026-07-10 (budget and idle continuation), and 2026-07-23 (runaway continuation); retain settled
  continuation, retry/compaction, ownership, interruption, and accounting facts, and accept with a
  source-path review showing no obsolete direct-`agent_end` continuation or old automatic-turn
  default remains. Evidence: the rewritten note maps current `turn_end`/`agent_end`/`agent_settled`,
  manual compaction, recovery, stale ownership, budget, and safety behavior to maintained source and
  tests; source inspection confirms `agent_end` records intent while the settled dispatcher sends,
  and the note records the current `automaticTurns: null` and `noProgressTurns: 3` defaults.
- [x] Update `docs/implementation-notes/pi-subagents-capability-matrix.md` from
  `2026-08-01_pi-subagents-read-only-tools-plan.md` and current registration/tests; document
  `subagent_inspect`, `subagent_consult`, workflow-dependent registration, and the current seven-tool
  surface, accepting when the matrix no longer claims five tools as the complete default surface.
  Evidence: the matrix now enumerates all seven default tools, all four workflow surfaces, pure
  inspection, executor-constrained consultation, output/error bounds, and current target/trust
  policy; a scripted extraction found all seven exact tool names and no stale five-tool claim.
- [x] Update `docs/implementation-notes/pi-subagents-stateful-runtime.md` from
  `2026-08-01_pi-subagents-read-only-tools-plan.md`,
  `2026-08-01_pi-subagents-trust-aware-cwd-policy-plan.md`, and current policy tests; retain trust
  resolution, consultation resource downgrades, transport parity, disposable-worktree inheritance,
  and the explicit non-sandbox boundary, accepting with focused source/test references. Evidence:
  the decision now records nearest saved external trust, current-session trust, `resources: "none"`
  downgrade, whole-batch preflight, subprocess/in-process parity, inherited worktree trust, restore
  re-resolution, `/trust` ownership, and the filesystem/process/network non-sandbox boundary with
  references to `cwd-policy.ts`, consult, orchestration, and transport tests.
- [x] Add a concise compatibility-floor section to `packages/pi-tui-kit/README.md` from
  `2026-07-31_narrow-pi-tui-kit-ranges-plan.md`; explain zero-major caret ranges and consumer-owned
  minimum minors without hard-coding the current workspace version, and accept by checking the
  guidance against every current consumer range. Evidence: the new Install subsection explains the
  minor-bounded zero-major caret rule, API-driven floor bumps, consumer ownership, and package-local
  declaration; a post-rebase manifest audit verified all 19 consumers use bounded caret ranges
  spanning their reviewed `^0.40.0`, `^0.41.0`, `^0.42.0`, or `^0.45.0` floors.
- [x] Refresh `docs/roadmaps/pi-tui-kit-roadmap.md` so completed outcomes are self-contained or refer
  to stable PR/current evidence rather than seven archived plans; remove stale package-version,
  import-count, and regression-count snapshots where they are not durable, accepting when all seven
  archive link definitions are gone and future milestones remain unchanged. Evidence: all seven link
  definitions/references are removed; completed phases now carry self-contained outcomes and stable
  PR evidence; transient release, consumer/dialog, source-line, and repository-test counts were
  removed; the three open Phase 4 milestones and Phase 5 direction remain unchanged. The PR-integration
  refresh also records current menu API version 6, read-only browse, custom-interaction lifecycle
  ownership, and the bounded Pi Starship/Pi Sync adoption through stable PRs #520 and #522.
- [x] Update `docs/adr/pi-sync-git-backend.md` from
  `2026-07-27_pi-sync-git-backend-plan.md`,
  `2026-07-27_pi-sync-git-native-storage-plan.md`, and current v3 config/source/tests; replace the
  stale Version 2 settings model and plan references, preserve native commit/blob representation,
  exact leases, ambiguous-outcome reconciliation, private cache/process boundaries, and resolve the
  branch-versus-path ownership claim with matching validation evidence. Evidence: the ADR now uses
  v3 `storageConnections`/`syncSetups`, current `<storage.path>/manifest.json` plus raw blobs, exact
  ref leases, private bare cache/runner policy, and reconciliation. It distinguishes operational
  one-branch ownership from exact remote/branch/path duplicate validation, matching the manager's
  new-branch guard, strict blob-membership validation, config identity tests, and fail-closed reader.
- [x] Create `docs/adr/pi-sync-backend-contract.md` from
  `2026-07-27_pi-sync-backend-contract-plan.md`, `2026-07-27_webdav-backend-plan.md`, and current
  contract tests; capture identity/reference/revision separation, expected-head publication,
  cancellation commit boundaries, typed unknown outcomes, and WebDAV capability-probe fail-closed
  behavior, accepting when backend-specific details remain behind the backend-neutral seam.
  Evidence: the ADR assigns collection/review/apply policy to orchestration and remote mechanics to
  `SyncBackend`; separately defines backend identity, `snapshotId`, `snapshotRef`, and opaque
  revision; records force re-read, `onCommit`, conflict/unknown outcomes, capability differences, and
  strong-ETag conditional WebDAV probes with no weak-write fallback.
- [x] Create `docs/adr/pi-sync-v3-settings-model.md` from the multi-profile UX, settings-filename,
  menu-wording, v3-schema, and destination-TUI plans dated 2026-07-24 through 2026-07-27; capture
  storage connections, sync setups, active setup, breaking v3 validation, switching policy,
  side-effect-free reads, unknown-field preservation, and atomic locked writes, accepting against
  `extensions/pi-sync/README.md`, config source, and settings tests. Evidence: the ADR records strict
  connection/setup ownership and backend shapes, exact path/name independence, backend-specific
  normalized location identities, ordered include/session policy, all three switch modes, unsupported
  old documents, one-lock latest-read/validate/publish behavior, first-save races, private atomic
  recovery, retained
  unknown fields, and byte-preserving legacy-filename recovery, matching v3/config/settings tests.
- [x] Merge the durable methodology and result interpretation from
  `2026-07-24_pi-lsp-server-profiles-plan.md` into
  `extensions/pi-lsp/test/docker/README.md`; retain the reproducible fresh-project matrix method,
  profile-policy categories, unresolved Kotlin finding, and diagnostic-versus-lifecycle timing
  distinction, accepting when the checked-in runner/matrix assets are sufficient evidence and the
  archive link is removed. Evidence: the README now records the dated 28-profile/three-error/three-
  clean method, 19 default/eight customized/one unresolved result, Rust/push/settle policy reasons,
  Kotlin cold-project finding, and latency/lifecycle distinction; a matrix parser verified 28 rows
  and the exact eight current non-empty policies, with no archived-plan link remaining.
- [x] Replace the four archived-plan references in `docs/roadmaps/pi-stamp-roadmap.md` with concise
  self-contained outcome or stable PR references, accepting when milestone status and remaining
  roadmap direction are unchanged. Evidence: five links to the four source plans were replaced with
  maintained source/test evidence beside Phases 1–5; all implemented milestones, Phase 6's upstream
  blocker, and remaining roadmap direction are unchanged, and no archive reference remains.
- [x] Add a concise `docs/plans/README.md` lifecycle rule stating that active plans live directly in
  `docs/plans/`, completed plans are first archived by the planning workflow, and later curation must
  promote durable facts before deletion; accept when it does not duplicate plan-writing mechanics or
  create a second archive taxonomy. Evidence: the concise guide defines only location, completion-
  before-archive, durable-owner routing, later deletion eligibility, and Git/GitHub history; it does
  not repeat plan shape, checkbox execution rules, commands, or add another archive directory.
- [x] Review the two Pi TUI Kit plans added by `main` after baseline capture—
  `2026-08-02_pi-tui-kit-p0-plan.md` and
  `2026-08-02_pi-tui-kit-v6-consumer-adoption-plan.md`—before deleting them. Evidence: current package
  README/source/tests already own browse, injected-keybinding, custom-interaction, and consumer
  contracts; the roadmap now records menu API version 6 and stable PRs #520/#522 without transient
  test or tarball counts. Both plans are independently eligible for deletion as execution history.
- [x] Delete the 212 baseline files under `docs/plans/archived/` only after all extraction and link
  tasks pass; accept when `git diff --name-status -- docs/plans/archived` contains exactly the 212
  manifest paths as deletions and no unreviewed path. Evidence: the pre-delete inventory still
  byte-matched `/tmp/pi-archived-plans.before`; deletion used only those manifest basenames; the
  directory then contained zero entries, and the 212 Git `D` basenames exactly matched the approved
  manifest.
- [x] Search all maintained Markdown for `plans/archived/`, each deleted basename, and relative links
  resolving into the removed archive; accept when no maintained document depends on a deleted plan
  and all newly written local Markdown links resolve. Evidence: a repository-wide parser found zero
  deleted basenames and zero Markdown links to removed archive files outside this execution plan; the
  only generic archive-directory mentions are the authoritative writing-plan skill and the new
  lifecycle README. All local links introduced or retained in changed maintained files resolve (the
  changed links are external or removed, so no unresolved local target remains).
- [x] Run `git diff --check` and `npm run check`; accept when both pass without changing runtime code,
  generated output, package versions, dependency manifests, or the pre-existing lockfile state.
  Evidence: after rebasing onto current `main`, `git diff --check` passes for the final 226-path
  documentation diff (214 deletions and 12 maintained/new paths). The exact diff was applied to a
  normal local clone with lockfile-matched dependencies, where the CI-equivalent gate passed Biome,
  boundaries, all workspace typechecks, and all 2,126 tests. No runtime source, generated, version,
  manifest, or lockfile change is part of this cleanup diff.
- [x] Audit the final diff by destination ownership: public compatibility in the package README,
  architectural decisions in ADRs, internal lifecycle/evidence in implementation notes or the Docker
  README, and roadmap outcomes in roadmaps; accept when no destination contains copied execution
  checklists, obsolete versions/counts, or duplicate authoritative policy. Evidence: final independent
  follow-up review passes for both the general documentation set and the three Pi Sync ADRs after all
  reported identity, race, WebDAV, Git-cache/tree, lifecycle, and evidence wording was corrected.
  Public instructions remain in READMEs, decisions in ADRs, mechanics in implementation notes, and
  future work in roadmaps.

## Completion Checklist

- [x] All 19 durable-source plans have been distilled into their named authoritative destinations and
  the resulting claims match current source/tests. Evidence: the audited partition is six pi-goal,
  two pi-subagents, one Pi TUI Kit, nine pi-sync, and one pi-lsp source plan; every named extraction
  task above is complete and its final independent review passes.
- [x] All 212 baseline archived plans are deleted, with the sorted manifest reconciled against the
  deletion diff. Evidence: the 212 deletion basenames exactly match the approved manifest with SHA-256
  `aca3b465471b79be5334f48af3ca50b45a15186ef1b82e9beac39c8299c89e3d`.
- [x] The two post-baseline Pi TUI Kit plans have been distilled and deleted independently of the
  212-file manifest. Evidence: API-v6 durable facts remain in the package README, current source/tests,
  and the refreshed roadmap; the two plan files are absent from the final archive.
- [x] No maintained Markdown file links to or relies on a deleted archived plan. Evidence: the final
  basename/link audit found zero references to deleted archive files.
- [x] The Pi TUI Kit roadmap, pi-stamp roadmap, pi-sync Git ADR, pi-goal note, pi-subagents notes, and
  pi-lsp Docker README contain no identified stale archive-era claims. Evidence: current source/test
  comparison and independent follow-up review pass after every reported wording correction.
- [x] The two new pi-sync ADRs clearly separate backend contract and v3 settings ownership without
  duplicating `docs/extension-settings.md` or the package README. Evidence: the backend ADR owns
  transport-neutral publication semantics and WebDAV decisions; the v3 ADR owns schema/persistence
  rationale; the README retains the public field/workflow reference and the settings guide retains
  repository-wide publication rules.
- [x] `docs/plans/README.md` records the archive-curation lifecycle without contradicting the required
  post-completion archive step. Evidence: it requires completed plans to be archived first and durable
  facts to be promoted before any later deletion.
- [x] `git diff --check` and `npm run check` pass, and the final diff contains documentation changes
  only. Evidence: whitespace validation passes; the post-rebase normal-clone CI-equivalent gate passed
  all 2,126 tests after Biome, boundaries, and workspace typechecks; the 226-path diff contains only
  Markdown changes and deletions.
- [x] After every item above is checked with evidence, archive this completed plan as
  `docs/plans/archived/2026-08-02_archived-plans-cleanup-plan.md` and report that final path. Evidence:
  the completed plan is the sole file in `docs/plans/archived/`; the previous 212-file baseline and
  two separately reviewed post-baseline plans remain represented only by the deletion diff.
