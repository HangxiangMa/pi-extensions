# Pi BTW Bring-to-Main UX Plan

## Goal

Make bring-to-main choices easier to predict, preview, confirm, cancel, and recover from without changing `/btw`'s ephemeral default or automatically submitting main-editor content.

## Assumptions

- Latest question-and-answer remains the default, fastest scope because it is the smallest predictable choice; its usage frequency is not yet measured.
- Token counts remain approximate (`UTF-8 bytes / 4`) and are labeled with `~`.
- Pi's TUI has no documented screen-reader protocol, so non-color textual markers and status summaries are the applicable accessibility mechanism.

## Plan

- [x] Add scope metadata and configured-key hints to bring-to-main menus; focused tests verify labels, default ordering, bounded rendering, and remapped keys.
- [x] Add exact-draft previews for question-suffix, custom-range, and entire-thread scopes with Bring, Back, and Close paths; focused tests verify preview identity and recovery transitions.
- [x] Strengthen the text selector with explicit empty/selected status, line/message/token counts, non-color selection markers, consistent terminology, and responsive hints; focused tests cover line, character, narrow-width, and configured-key states.
- [x] Make occupied-editor handling default to append, label replace as destructive, require a second replace confirmation, and preserve cancellation/concurrent updates; focused tests cover append, replace/back, confirmed replace, cancel, and editor-update races.
- [x] Report concrete loaded/appended/replaced outcomes with content size while retaining editable-draft and no-auto-submit behavior; focused tests verify notification text, draft loading, and unchanged session state.
- [x] Update `extensions/pi-btw/README.md` with the final workflow and controls; documented behavior matches the passing focused tests.

## Completion Checklist

- [x] Focused pi-btw tests pass: 57 tests after the final custom-preview coverage was added.
- [x] `npm run check` passes: 1,440 tests.
- [x] `just pack-btw` contains the expected eight package files.
- [x] `git diff --check` passes and the diff is limited to pi-btw plus this plan.
- [x] Archive this completed plan under `docs/plans/archived/`.
