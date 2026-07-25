# File Context PR review fixes plan

## Goal

Resolve every inline review comment on PR #405 with focused regression coverage, preserve compatibility, run the repository gate, commit, push, reply to each thread, and resolve all review conversations.

## Plan

- [x] Added lifecycle/input/reference regressions and moved quote injection to accepted `before_agent_start` context messages; stale picker ownership, downstream-handled input retention, slash expansion, and quoted whole-file paths now pass.
- [x] Added filesystem regressions and hardened discovery/loading: ignored metadata names are skipped before type dispatch, descriptor open is nonblocking/no-follow with identity revalidation, and normalized lines remove only split sentinels while preserving real blanks.
- [x] Added explorer regressions and fixed terminal-safe width-bounded errors/placeholders, invalid history dates, cursor-owned blame, and detail-request cancellation/loading ownership.
- [x] Added real-repository regressions and fixed no-newline hunk accounting, followed historical rename paths, and per-file ignored-directory status.
- [x] Ran focused tests and `npm run check` (1,409 passing), inspected the seven-file package dry run, loaded isolated Pi, and fixed the adjacent empty-file cursor state found during the bounded sibling scan.
- [x] Committed fixes as `736c67a`, pushed `feat/pi-file-context`, posted evidence replies to all 16 inline comments, and resolved all 16 PR #405 review threads.

## Completion Checklist

- [x] All 16 inline comments are individually verified and covered by focused regressions.
- [x] Pending quotes cannot cross sessions or disappear when another handler owns input.
- [x] File reads remain inside the project under path replacement races and normalize true file lines.
- [x] Every rendered state is terminal-safe and width-safe; async cancellation cannot strand loading or stale blame.
- [x] Git hunk, ignored status, and rename-history behavior match real repositories.
- [x] Current branch is clean, pushed, fully verified, and has no unresolved review threads.
