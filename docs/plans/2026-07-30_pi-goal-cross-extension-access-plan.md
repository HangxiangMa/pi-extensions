# pi-goal Cross-Extension Access Plan

## Goal

Deliver Phase 1 of `docs/roadmaps/pi-goal-cross-extension-supervision-roadmap.md`: give users a
backward-compatible settings boundary for disabling the existing cross-extension contract,
observing Goal state without control, or retaining the current RPC-owned start/pause behavior.

## Context

- `packages/pi-goal/src/rpc.ts` always registers `pi-goal:rpc:start` and
  `pi-goal:rpc:pause`; session binding currently determines whether a request can act.
- `packages/pi-goal/src/runtime.ts` emits `pi-goal:state` whenever canonical Goal state is
  persisted or cleared.
- `packages/pi-goal/src/settings.ts` owns the user-scoped `pi-goal.json` schema, defaults,
  validation, unknown-field-preserving save, and atomic publication.
- `packages/pi-goal/src/settings-ui.ts` presents four current settings through
  `@narumitw/pi-tui-kit` and applies successful changes immediately with rollback on failure.
- Existing RPC behavior is public and tested in `packages/pi-goal/test/goal-rpc.test.ts`; an
  omitted new setting must preserve it.

## Architecture

Add one user-scoped setting:

```json
{
  "crossExtension": {
    "access": "rpc-owned"
  }
}
```

The accepted access levels and effective policy are:

| Access | Emit `pi-goal:state` | Accept `rpc:start` | Accept correlated `rpc:pause` |
| --- | --- | --- | --- |
| `off` | No | No | No |
| `observe` | Yes | No | No |
| `rpc-owned` | Yes | Yes | Yes |

`rpc-owned` is the compatibility default. The settings parser and writer remain in `settings.ts`.
A small policy helper should answer observation and control questions so `rpc.ts` and Goal-state
publication do not duplicate string comparisons.

The event handlers remain registered at factory load because Pi's shared event bus is process-wide
and supports only subscribe/unsubscribe, not dynamic listener discovery. They consult the current
runtime policy on each request. A valid start request rejected by policy receives a request-scoped
failure reply; pause remains a safe no-op because the established pause channel has no reply
contract.

A request that passes policy validation is considered accepted at that boundary and may complete if
the setting changes while its existing transition is in flight. The access downgrade blocks later
requests and state broadcasts but does not roll back, pause, or clear the current Goal. Replies for
already accepted requests are still delivered so callers are not stranded.

The existing Goal Settings screen gains one direct **Cross-extension access** row. Five total rows
remain below the repository threshold for introducing another submenu. Non-TUI Settings behavior
continues to report the manual settings path.

## Non-Goals

- Add Resume RPC, state-transition provenance, terminal review, or continuation hold.
- Add project-scoped settings or environment-variable overrides.
- Turn the access setting into an extension security sandbox.
- Change the established start or pause payloads, ownership rules, or reply channel.
- Clear or pause a Goal merely because access is downgraded.

## Risks

- Suppressing state events while allowing a request reply can surprise a caller that changes policy
  concurrently; document request acceptance and current-policy event publication separately.
- A listener may interpret `off` as protection from malicious installed code. UI and README wording
  must state that installed extensions remain fully privileged.
- Adding a recognized nested object can accidentally discard unknown sibling fields. Save tests must
  cover unknown top-level and `crossExtension` fields.
- Settings changes occur while RPC work can be pending. Tests must establish the accepted-request
  linearization rule instead of relying on timing.

## Rollback / Recovery

- The setting is additive and has no Goal-state migration. Reverting the feature makes its retained
  JSON object unknown to older versions, which the existing writer must preserve.
- A save or runtime-application failure restores the previous file bytes, runtime setting, RPC
  policy, and displayed value through the existing settings rollback protocol.
- Invalid existing settings remain read-only and byte-for-byte unchanged; built-in defaults remain
  effective until the user repairs the file and reloads.

## Plan

- [ ] Add failing cases to `packages/pi-goal/test/settings.test.ts` for the omitted
      `rpc-owned` default, all three access values, invalid values and container shapes, and
      preservation of unknown top-level and nested fields; verify the intended failures with the
      focused compiled settings test before changing `settings.ts`.
- [ ] Extend `packages/pi-goal/src/settings.ts` with the access enum, normalized default, nested
      read/write behavior, and unknown-field-preserving publication; verify the new settings cases
      and existing malformed-file, missing-file, and atomic-save tests pass.
- [ ] Add failing policy-matrix and concurrency cases to
      `packages/pi-goal/test/goal-rpc.test.ts` for state emission, start replies, correlated pause,
      unbound sessions, live downgrades, and an accepted start completing after downgrade; verify
      failures show the current always-enabled behavior before adding policy checks.
- [ ] Add one cross-extension policy helper and apply it in
      `packages/pi-goal/src/rpc.ts` plus `GoalRuntime.persistGoal()` and clear-event publication so
      each access level matches the documented matrix without changing request ownership; verify the
      focused RPC suite passes, including listener-error isolation and session bind/unbind cases.
- [ ] Add failing settings-menu cases to `packages/pi-goal/test/settings-ui.test.ts` for the fifth
      row, effective value labels, immediate application, save rollback, invalid-file read-only
      output, and non-TUI fallback; then update `packages/pi-goal/src/settings-ui.ts` to use the
      existing declarative settings flow and verify those cases pass at supported widths and keyboard
      paths.
- [ ] Update `packages/pi-goal/README.md` with the JSON schema, compatibility default, access
      matrix, trusted-extension warning, live-change semantics, and non-TUI editing path; verify every
      documented value and channel is covered by settings or RPC tests.
- [ ] Audit request acceptance, state suppression, settings ordering, failure rollback, session
      replacement, and shutdown against `docs/extension-conventions.md` and
      `docs/extension-settings.md`; run `npm run check --workspace @narumitw/pi-goal`,
      `npm run test:runtime --workspace @narumitw/pi-goal`, root `npm test`, root `npm run check`,
      `just pack-goal`, and `git diff --check`, recording any unverified runtime path before handoff.

## Completion Checklist

- [ ] Missing or omitted `crossExtension` settings preserve current state, start, and RPC-owned pause
      behavior.
- [ ] `off`, `observe`, and `rpc-owned` accept and reject exactly the operations in the policy matrix.
- [ ] Downgrading access does not clear, pause, replace, or otherwise mutate the current Goal.
- [ ] Settings UI, JSON persistence, reload, invalid-file protection, unknown-field preservation,
      immediate application, and rollback agree with the README.
- [ ] No Resume RPC, provenance, terminal review, or continuation-hold behavior entered this phase.
- [ ] Focused tests, runtime smoke, root test/check gates, package dry run, and final semantic audits
      pass with any accepted deviation documented.
