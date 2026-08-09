## Goal

Let users submit Pi-style steering questions while a pi-btw side-thread answer is running, then answer those questions inside the same ephemeral side thread without writing to the main conversation or editor.

## Context

Pi labels messages submitted during streaming as `Steering` and, by default, delivers them one at a time after the current assistant turn finishes.

pi-btw currently replaces its composer with a read-only `BtwAnsweringView` until the side-model request completes.

A pi-btw side turn is one provider request without tools, so its equivalent steering boundary is the completion of the current side-model response.

## Architecture

`runBtwThread` will own an in-memory FIFO steering queue for the current invocation.

`BtwAnsweringView` will keep an editable composer visible while answering, submit non-empty text into that queue, and render bounded `Steering: …` status rows using terminal-safe text.

After the active response succeeds or fails, `runBtwThread` will process the oldest queued question before reopening the idle composer.

Each queued question will receive its own response before the next queued question is delivered, matching Pi's default `one-at-a-time` steering mode.

The existing side-thread thinking control will remain active while answering, and a queued question will use the active side-thread thinking level when its turn begins.

## Non-Goals

- Do not call `pi.sendUserMessage()`, append session entries, or add steering content to the main conversation.
- Do not change Bring to main behavior.
- Do not add follow-up delivery or an `all` steering mode in this change.
- Do not persist the ephemeral steering queue across closing, reload, or session replacement.
- Do not inject text into an already-running provider request.

## Risks

- Answer completion, submission, cancellation, and component disposal can race unless queue ownership and terminal completion are single-settlement.
- A growing queue or editor can hide the transcript or exceed short-terminal bounds unless the bottom area is explicitly budgeted.
- New input must preserve IME focus propagation, large-paste expansion, configured thinking shortcuts, transcript scrolling, and terminal-control sanitization.
- Cancelling the side thread must abort the active request and discard its local draft and queue without reopening another component.

## Plan

- [x] Add focused failing loop tests in `packages/pi-btw/test/side-thread.test.ts` proving FIFO one-at-a-time delivery, processing before the idle composer reopens, continuation after a displayed side-model error, and no main-session mutation.
  Evidence: the initial focused run failed because the answering view and injected ask path did not yet accept steering controls.
- [x] Add focused failing `BtwAnsweringView` tests proving Enter queues expanded editor text as `Steering`, empty submissions stay local with a warning, multiple queued rows remain ordered, and the configured thinking shortcut affects the next queued turn.
  Evidence: the new component tests failed at compile time before the answering composer and focus contract existed.
- [x] Add focused failing lifecycle and layout tests proving Ctrl+C and disposal abort once, late completion cannot process discarded steering, focus reaches the embedded editor, terminal controls are escaped, and every rendered line and short-terminal layout stays bounded.
  Evidence: focused tests cover queued-message discard after abort, single cancellation, IME cursor rendering, sanitized bounded output, and short terminals.
- [x] Update `packages/pi-btw/src/btw.ts` so `runBtwThread` owns and drains a side-thread-only FIFO queue before showing the normal composer; verify with the focused loop tests.
  Evidence: FIFO, error continuation, thinking-level timing, composer ordering, cancellation, and untouched branch assertions pass.
- [x] Update `packages/pi-btw/src/transcript-pager.ts` so the answering state includes an IME-capable editor, `Steering: …` queue feedback, compact overflow/status hints, scrolling, thinking control, and deterministic cancellation; verify with the focused component tests.
  Evidence: all 83 focused side-thread tests and all 133 pi-btw tests pass.
- [x] Update `packages/pi-btw/README.md` to document side-thread steering, one-at-a-time delivery, error and cancellation behavior, and the fact that nothing is sent to the main conversation.
- [x] Add a patch changeset for `@narumitw/pi-btw` because the published extension gains observable behavior.
  Evidence: `npx changeset status --verbose` includes `.changeset/tidy-moles-steer.md` in the pi-btw patch bump.
- [x] Audit the final diff against `docs/extension-conventions.md`, especially asynchronous UI cancellation, disposal, stale context after awaits, session replacement, terminal safety, and custom-component width/focus rules.
  Evidence: the queue is invocation-local, active custom UI remains single-owner, Ctrl+C and disposal settle once, stale notification handling remains guarded, raw messages are sanitized only at display, and both editor containers implement and forward `Focusable`.
- [x] Run `npm test -- packages/pi-btw/test/side-thread.test.ts`, `npm run check --workspace @narumitw/pi-btw`, and `npm run check`; record exact evidence in this plan.
  Evidence: the focused file passed 83 tests, the package check passed Biome and TypeScript, and the root gate passed 231 files with 2,637 tests plus boundaries and all workspace typechecks.

## Completion Checklist

- [x] Enter during `Answering…` visibly queues a side-thread `Steering` question without interrupting the active provider request.
- [x] Queued questions are answered FIFO and one at a time before the idle composer reopens.
- [x] Steering questions, answers, drafts, and queue state remain absent from the main Pi conversation and editor.
- [x] Thinking changes, transcript scrolling, large pastes, IME focus, narrow widths, errors, Ctrl+C, disposal, and session replacement retain deterministic behavior.
- [x] README, patch changeset, focused tests, package checks, root CI-equivalent checks, package preview, load smoke, and the semantic convention audit are complete.
