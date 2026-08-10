# Separate Pi Chat network smokes from mocked tests

## Goal

Keep Pi Chat's normal automated tests deterministic and mocked while preserving real local DHT, process-boundary discovery, relay, retry, directory, delivery, and cleanup coverage in an explicit local script.

## Plan

- [x] Inspect the failed Actions job and current network coverage; the failure came from a real local DHT smoke running amid the parallel full suite after both child processes had started.
- [x] Move every real-network scenario and its child fixture out of `packages/pi-chat/test/` into `packages/pi-chat/scripts/network-smoke.ts`; all six retained local scenarios passed.
- [x] Replace the normal transport tests with deterministic Hyperswarm and directory transport mocks covering limits, startup, refresh scheduling, discovery results, completed-signal ownership, and cleanup; all 86 Pi Chat tests passed.
- [x] Add `npm run smoke:chat-network` and `just smoke-chat-network`, and document the local-only boundary in `packages/pi-chat/README.md`.
- [x] Run the mocked Pi Chat tests, the local network smoke, and the CI-equivalent `npm run check` gate; the gate passed 274 files and 2,954 tests.
- [x] Audit process, timer, discovery, socket, and DHT cleanup against `docs/extension-conventions.md` and the touched-area checklist; each local scenario retains `finally` cleanup, child startup is tracked before waits, child exit is bounded by forced termination, and mocked tests verify discovery/swarm teardown.

## Completion Checklist

- [x] No normal Pi Chat test opens a real DHT or network socket; `packages/pi-chat/test/` contains no HyperDHT testnet import, and the Hyperswarm constructor is mocked.
- [x] The opt-in local smoke proves real networking and exits cleanly; all six scenarios passed in one invocation.
- [x] The repository CI-equivalent check passes without the real-network smoke; `npm run check` passed.
- [x] No changeset is added because test orchestration and contributor commands do not change published behavior.
