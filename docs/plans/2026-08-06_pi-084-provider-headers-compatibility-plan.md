# Pi 0.84 provider headers compatibility plan

## Goal

Restore PR #574's latest-Pi CI compatibility by adopting Pi 0.84's nullable provider-header contract
without losing header-deletion markers or breaking the repository's pinned Pi 0.83 support.

## Context

The GitHub CI installs the latest Pi packages after the pinned install. Pi 0.84 changes
`ModelRegistry.getApiKeyAndHeaders()` to return `ProviderHeaders` (`Record<string, string | null>`),
where `null` suppresses lower-level default headers. Its release guidance says extensions forwarding
resolved headers to pi-ai streams must pass them through unchanged.

The confirmed CI failures are:

- `extensions/pi-btw/src/btw.ts`: a custom model-registry interface narrows resolved headers to
  `Record<string, string>` and is no longer compatible with Pi's registry.
- `experimental/pi-codex-compact/src/codex-compact.ts`: resolved nullable headers are passed to a
  locally narrowed remote-compaction request type.

Applicable guidance: `docs/extension-conventions.md`, the latest Pi 0.84 changelog and public
`ProviderHeaders`/stream declarations, and the TDD behavior boundary. Touched areas are request-auth
typing, credential availability, remote stream forwarding, and focused tests; no settings, command,
UI, package metadata, or lifecycle behavior changes are planned.

## Plan

- [x] Add a focused `pi-btw` regression test proving mixed string/null headers remain available and
  unchanged while null-only deletion markers do not become credentials. Evidence: before the fix,
  the null-only case incorrectly selected the configured model.
- [x] Replace `pi-btw`'s duplicated registry contract with a `Pick` of Pi's context registry and adopt
  Pi's public `ProviderHeaders` type through the side-thread boundary. Evidence: nullable markers pass
  unchanged, null-only maps are rejected as credentials, and all 120 compiled `pi-btw` tests passed
  under pinned Pi.
- [x] Adopt Pi's public `ProviderHeaders` type at experimental `pi-codex-compact`'s remote request
  boundary and add coverage proving nullable deletion markers reach `Provider.stream()` unchanged.
  Evidence: the exact mixed header map reached the provider, and all 40 compiled experimental tests
  passed under pinned Pi.
- [x] Reproduce CI's latest-Pi install in an external temporary clone, run the full latest-Pi gate,
  then run the pinned `npm run check`; audit sibling resolved-auth consumers for the same narrowing
  pattern. Evidence: Pi 0.84 and pinned Pi each passed all 2,431 tests; `pi-accounts`' compatibility
  adapter now also reflects `ProviderHeaders`, while other consumers infer Pi's type, ignore headers,
  or already handle nullable values.
- [ ] Commit and push the focused compatibility fix, update PR #574's notes, verify GitHub CI passes,
  and archive this completed plan.

## Risks

- Filtering out `null` would compile but break Pi's header-deletion semantics. Preserve nullable
  markers through every stream boundary and test exact values.
- Treating a null-only map as credentials could select a model with no usable authentication. Count
  only string header values for availability while still forwarding mixed maps unchanged.
- Updating the current checkout to latest Pi would rewrite manifests and dependencies. Use an
  external temporary clone for the alternate-version matrix and leave the pinned checkout intact. A
  linked worktree is unsuitable because Git injects its administrative `GIT_DIR` into subprocess
  tests.

## Completion Checklist

- [x] `pi-btw` derives its registry contract from Pi and forwards `ProviderHeaders` unchanged.
- [x] Experimental `pi-codex-compact` accepts and forwards `ProviderHeaders` unchanged.
- [x] Null-only headers do not satisfy `pi-btw` credential availability.
- [x] Pinned and latest-Pi full repository gates pass with 2,431 tests each.
- [ ] PR #574 is updated and GitHub CI is green.
