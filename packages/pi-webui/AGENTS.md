# Pi WebUI Guidelines

## Browser protocol

- Give simultaneous loopback servers on `127.0.0.1` unique cookie names because cookies are shared by hostname across ports.
- For empty SSE replay, call `flushHeaders()` and write an initial SSE comment so EventSource does not remain reconnecting.
- Preserve the exact mutation request ID, payload, and delivery mode across uncertain retries, and never evict in-flight records from bounded deduplication caches.
- Add framework-free browser modules to the authenticated asset allowlist, HTTP asset tests, and package dry-run coverage.
- Give Radix non-submit form actions `type="button"`.
- Provide Radix modal styles a CSP nonce through `__webpack_nonce__`; never loosen CSP to allow unsafe inline styles.
- Add a monotonic generation to lease snapshots and non-replayed events so older HTTP snapshots cannot clear state established by newer SSE data.

## Pi integration

- Preflight idle model and authentication state before acknowledging browser submission because `sendUserMessage()` is fire-and-forget.
- Project final messages only after later `message_end` handlers have had a chance to replace the message.
