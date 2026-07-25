# Multiple file quotes plan

## Goal

Allow the experimental file explorer to accumulate multiple selected excerpts, show every pending quote compactly, and inject the ordered quote set exactly once into the next ordinary interactive prompt.

## Plan

- [x] Extended focused tests for ordered accumulation, aggregate count/byte bounds, multi-line widget state, one-shot prompt injection, and lifecycle cleanup; the initial TypeScript compile failed on the missing collection APIs.
- [x] Replaced the single pending quote with a bounded ordered collection while retaining the existing one-quote formatter API; all nine focused tests pass.
- [x] Updated the README for multiple quotes, ordered injection, aggregate limits, and the current lack of remove/reorder actions.
- [x] Formatted intended files, passed the isolated repository gate with 1,391 tests, inspected the six-file package dry run, and loaded the extension with isolated Pi.

## Completion Checklist

- [x] Each successful range selection appends rather than replaces earlier pending quotes.
- [x] The widget lists all pending path/range pairs in selection order.
- [x] The next ordinary interactive prompt receives every pending quote in order, then clears the full set.
- [x] More than eight quotes or 100 KB aggregate quote text is rejected without mutating accepted quotes.
- [x] Session start and shutdown clear the complete pending set.
- [x] Root checks, package dry run, and Pi loading pass.
