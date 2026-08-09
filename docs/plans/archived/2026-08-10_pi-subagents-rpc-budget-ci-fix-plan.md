# Pi Subagents RPC Budget CI Fix

## Goal

Make RPC budget finalization deterministic when prompt acceptance and budget events arrive in one JSONL batch.

## Plan

- [x] Reproduce the CI failure in `packages/pi-subagents/test/rpc-transport.test.ts`; the tool-call budget promise beat the deeper prompt-acceptance promise chain when both records arrived together.
- [x] Make the fixture emit prompt acceptance and the budget event in one JSONL write; it failed with skipped finalization in 5 of 5 pre-fix runs.
- [x] Restrict pre-acceptance budget interruption to idle deadlines so observed assistant turns and tool calls proceed through bounded finalization; 60 concurrent focused repetitions passed.
- [x] Audit cancellation, child release, listener disposal, and stale settlement events against `docs/extension-conventions.md`; the existing `finally` disposal and bounded abort/release paths remain intact.
- [x] Run `npm run check`; all 237 test files and 2,679 tests passed with formatting, boundaries, and typechecks.

## Completion Checklist

- [x] The tool-call and idle budget summary paths pass deterministically.
- [x] The CI-equivalent repository gate passes.
- [x] The diff contains only the focused fix, regression coverage, and this archived plan.
