## Goal

Let a `/btw` user explicitly bring selected side-thread context back to the main editor while preserving the default ephemeral behavior. Support quick scopes and a contiguous raw-text line range selected with `Space`, without sending or persisting anything until the user submits the resulting main-editor draft.

## Architecture

- Keep `SideThread` ephemeral and return a plain bring-to-main result from `runBtwThread`; the `/btw` command handler alone loads the resulting draft into Pi's main editor.
- Add a composer action for `Ctrl+R`, available only after a successful answer, that opens scope selection: latest question and answer, from a chosen question onward, custom text range, entire side thread, or cancel.
- Represent bring-to-main content as ordered user/assistant text segments. Build every quick scope and custom range through the same deterministic formatter.
- Implement custom selection over raw source lines rather than rendered Markdown rows. `Space` anchors a contiguous range, arrows extend it, `Enter` confirms, `Esc` returns, and `Ctrl+C` closes without bringing anything to main.

## Non-Goals

- Automatically sending the draft to the main agent.
- Persisting the side thread or bring-to-main selection.
- Mouse selection, multiple disjoint ranges, or character-level selection inside one raw line.
- Model-generated summarization or rewriting.

## Plan

- [x] Add focused failing tests for bring-to-main scope extraction, deterministic formatting, custom line-range selection, cancellation, and no default main-thread mutation; red phase: `tsc -p tsconfig.test.json` failed on the intentionally missing bring-to-main module and action.
- [x] Add pure bring-to-main segment/range helpers and a width-safe `Space`-anchored selector component; focused compiled pi-btw tests pass, including scrolling and terminal-control escaping.
- [x] Integrate `Ctrl+R`, the scope menus, and command-handler editor loading while preserving ordinary submit/close behavior; loop and component tests pass, including cancelled-menu draft restoration.
- [x] Update `extensions/pi-btw/README.md` with the opt-in bring-to-main workflow, exact selection controls, draft behavior, and limitations; documented controls match the tested UI.
- [x] Run `npm run check` and `just pack-btw`, inspect the dry-run package contents, and resolve all failures; all 1,419 tests passed and the tarball contains the intended README, license, manifest, and five source modules.

## Risks

- Rendered Markdown wraps differently from raw source text. The selector must make the raw-line unit explicit and never derive payload text from ANSI-rendered rows.
- A custom selection can cross question/answer boundaries. Formatting must retain role boundaries and exclude failed turns.
- Closing the custom component before editor loading could lose context on a stale session. Keep the command flow synchronous after bring-to-main selection and avoid session replacement APIs.

## Completion Checklist

- [x] Normal `Ctrl+C` exit and cancelled scope selection leave the main editor and session unchanged.
- [x] Latest, suffix, whole-thread, and custom contiguous ranges produce deterministic editable drafts with correct roles and raw text.
- [x] Selector controls, width limits, scrolling, terminal-control escaping, and empty/error exclusions are covered by deterministic tests.
- [x] `/btw <question>` and follow-up behavior remain compatible.
- [x] README, full repository checks, and package dry run are complete.
