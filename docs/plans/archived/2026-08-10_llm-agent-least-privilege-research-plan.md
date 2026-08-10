# LLM Agent Least-Privilege Research Plan

## Goal

Read the 12 requested papers with a three-reviewer Codex research panel and write evidence-traceable notes under `docs/research/`.

## Plan

- [x] Run three Codex research panes in Herdr for runtime enforcement, least privilege and isolation, and security benchmarks; evidence: complete memos from `runtime_guard`, `privilege_scope`, and `benchmark_safety`.
- [x] Require each reviewer to cite primary paper sources, distinguish paper claims from synthesis, and record methods, results, limitations, and design implications; evidence: all three memos used explicit evidence labels and full-text anchors.
- [x] Synthesize the panel output into `docs/research/2026-08-10_llm-agent-least-privilege-and-runtime-enforcement.md`.
- [x] Verify all 12 requested papers, source links, and traceable cross-paper claims; evidence: targeted Node validation, three section-owner audits, Biome, and `git diff --check` passed.

## Risks

- Similar titles and evolving preprints may cause source confusion, so the note must identify each paper with a canonical URL and available publication metadata.
- Abstract-only evidence may omit important caveats, so reviewers must prefer full paper text and explicitly flag inaccessible or unverified details.
- Benchmark metrics are not directly comparable across datasets, so the synthesis must avoid ranking systems from headline numbers alone.

## Completion Checklist

- [x] The research note covers all 12 papers in numbered subsections.
- [x] The note includes a comparison table, cross-paper synthesis, limitations, and a 12-entry primary-source bibliography.
- [x] Markdown structure passed targeted validation, 12 canonical source links returned HTTP 200 after replacing one unavailable DOI resolver link with arXiv, and Biome plus `git diff --check` passed.
- [x] The completed plan is archived under `docs/plans/archived/`.
