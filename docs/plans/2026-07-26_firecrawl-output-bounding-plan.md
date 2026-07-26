# Bound pi-firecrawl tool output

## Goal

Keep every `firecrawl_*` tool result within Pi's documented 50 KB / 2,000-line context limit, preserve an actionable path to the complete Firecrawl response when truncation occurs, and stop duplicating large raw payloads in session `details`.

## Context

- `extensions/pi-firecrawl/src/client.ts` currently serializes the complete payload into both `content` and `details`.
- The BBC Live smoke produced about 32 KB of tool text but a roughly 66 KB session entry because of that duplication.
- Pi requires custom tools to bound their own output; the limit is not automatically applied to arbitrary extension results.
- During compaction, serialized tool results are shortened further, so the truncation notice and recovery location must fit inside the bounded visible result.

## Architecture

Add one package-local response formatter/artifact store and route all five tools through it:

1. Serialize the successful Firecrawl payload exactly as today for backward-compatible visible output.
2. Apply Pi's `truncateHead()` with `DEFAULT_MAX_BYTES` and `DEFAULT_MAX_LINES`.
3. If truncation is required, save the complete pretty-printed response in a private session-scoped temporary directory, reserve room for an explicit truncation footer, and truncate again so the final `content` including the footer remains within both hard limits.
4. Return only compact metadata in `details` (`truncated`, counts, and optional full-response path), never the raw response payload.
5. Best-effort remove the temporary directory on `session_shutdown`.
6. Bound non-2xx Firecrawl response bodies separately so a large error page cannot bypass the successful-result protection; retain the complete error response in the same private artifact store when needed.

The first iteration will not add settings or another public tool. The full artifact remains available through its reported filesystem path. If real usage shows that long JSON string fields are difficult to page with Pi's file tools, a separate `firecrawl_read_output` cursor tool should be considered as a follow-up rather than expanding this fix prematurely.

## Non-Goals

- Limiting Firecrawl's network response size before it is buffered.
- Summarizing or semantically rewriting scraped content.
- Changing Firecrawl request parameters, API versions, or crawl pagination.
- Adding user-configurable output limits; Pi's canonical limits remain authoritative.

## Risks

- Appending a footer after truncation can accidentally exceed 50 KB; reserve the footer budget before producing final content and test the complete result, not only the excerpt.
- UTF-8 boundaries and very long JSON string lines can make byte/line behavior non-obvious; cover multibyte and one-line payloads.
- Temporary responses may contain sensitive scraped content; create directories as `0700`, files as `0600`, use unpredictable names, and remove them on shutdown.
- Slimming `details` changes an undocumented internal result shape. Preserve the visible `content` for non-truncated responses and document the intentional session-size improvement.

## Plan

- [x] Add focused failing tests in `extensions/pi-firecrawl/test/firecrawl.test.ts` for byte-limit truncation, line-limit truncation, UTF-8 safety, a final result that includes its footer within both limits, exact full-response artifact contents, compact `details`, unique concurrent artifact paths, private permissions, and shutdown cleanup. Evidence: the initial `npm test` compile failed on the missing formatter/cleanup exports; the completed focused suite passes 26/26 tests.
- [x] Add a package-local response formatter/artifact store under `extensions/pi-firecrawl/src/` using Pi's exported truncation constants/utilities. Evidence: focused tests preserve the exact small visible JSON and cover byte, line, UTF-8, footer-unit, permissions, concurrency, and exact-artifact behavior.
- [x] Update `extensions/pi-firecrawl/src/tools.ts` and `extensions/pi-firecrawl/src/client.ts` so all successful tool responses and oversized non-2xx bodies use the bounded formatter, cancellation behavior remains unchanged, and error messages remain concise and actionable. Evidence: one execution test invokes all five tools, and the oversized error test covers a huge endpoint prefix plus exact raw-body preservation.
- [x] Register best-effort artifact cleanup from `extensions/pi-firecrawl/src/firecrawl.ts` on `session_shutdown`, without disturbing the existing status/settings cleanup. Evidence: tests cover owner isolation, registered-write draining, late-write rejection, and session-owned removal.
- [x] Update tool descriptions and `extensions/pi-firecrawl/README.md` to state the 50 KB / 2,000-line limits, truncation notice, temporary full-response path, cleanup lifetime, and compact session metadata. Evidence: descriptions and README now document the tested behavior.
- [ ] Run `npm run check`, then run `just pack-firecrawl` and inspect that only intended source/docs/package files are included. Evidence so far: Biome, boundaries, all-workspace typechecks, 26 focused tests, and the pack dry run pass; local `npm run check` reaches 1,509/1,510 tests but is blocked by the unchanged `pi-github-pr` branch-watcher timing test, pending PR CI on the target platform.
- [x] Run one local Pi smoke against `https://www.bbc.com/news/live/c3r2nz9ed3lt` and one deterministic oversized mocked response. Evidence: BBC returned 32,256 bytes / 62 lines without truncation; the deterministic 100,016-byte response returned a bounded 217-byte / 3-line notice with a readable complete artifact that cleanup removed.

## Completion Checklist

- [x] Every `firecrawl_*` success result is at most 50 KB and 2,000 lines.
- [x] Oversized non-2xx response text cannot create an unbounded tool error.
- [x] Truncated results state exactly what was omitted and where the full response is stored.
- [x] Full-response artifacts are exact, private, collision-safe, and cleaned up on session shutdown.
- [x] Tool-result `details` no longer duplicates the raw Firecrawl payload.
- [x] Non-truncated visible output remains compatible with the current pretty-printed JSON.
- [ ] Focused tests, full repository checks, package dry run, and runtime smoke all pass; PR CI is pending to resolve the unrelated local `pi-github-pr` watcher-test failure.
