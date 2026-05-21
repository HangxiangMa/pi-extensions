## Goal

Fix `@narumitw/pi-sync` in code so Cloudflare R2 auto sync no longer fails from accidentally sending `X-Amz-Security-Token`. Do not require users to unset or override environment variables as a quick workaround. The success condition is that when R2 static access keys are used, pi-sync will not include a session token in R2 requests even if one exists in the shell or local config, and the repository checks still pass.

## Context

Previously, `loadPartialConfig()` in `extensions/pi-sync/src/sync.ts` could apply a session token to R2 requests. This is useful for AWS STS/SSO S3, but Cloudflare R2 static keys reject signed requests that include `x-amz-security-token` and return:

```text
InvalidArgument: X-Amz-Security-Token
```

## Assumptions

- This fix targets R2 static access keys and does not require R2 session tokens.
- Regular AWS S3 must still support `AWS_SESSION_TOKEN`.

## Non-Goals

- Do not require users to unset `AWS_SESSION_TOKEN`, edit shell profiles, or launch Pi with `PI_SYNC_SESSION_TOKEN=`.

## Plan

- [x] Update session-token resolution in `extensions/pi-sync/src/sync.ts`: detect Cloudflare R2 endpoints by hostname ending in `.r2.cloudflarestorage.com`, and ignore `PI_SYNC_SESSION_TOKEN`, `AWS_SESSION_TOKEN`, and local config `sessionToken` for R2 endpoints; verified by reviewing `selectSessionToken()` and by an equivalent live `/pisync status` handler check.
- [x] Normalize empty token strings as unset so `PI_SYNC_SESSION_TOKEN=`, whitespace-only strings, or `"sessionToken": ""` in config do not confuse display or later logic; verified by the `normalizeOptionalString()` implementation.
- [x] Strengthen `/pisync doctor` and `/pisync config` diagnostics: when session-token sources exist under an R2 endpoint, show which sources are ignored without leaking token values; verified with live config and doctor handler output.
- [x] Update `extensions/pi-sync/README.md` R2 configuration docs: document that R2 static keys do not need session tokens and that R2 endpoints ignore all session-token sources; verified by the README diff.
- [x] Run formatting and type checks from the repository root with `npm run check`; verified by successful command completion.
- [x] Run a package dry run with `npm run pack:sync`; verified that the tarball contains only `LICENSE`, `README.md`, `package.json`, and `src/sync.ts`.
- [x] Verify against R2: using the real R2 config and a test `AWS_SESSION_TOKEN`, call the extension `config`, `doctor`, and `status` handlers; `config` showed `sessionToken: not configured`, and `status` successfully read the remote pointer without `InvalidArgument X-Amz-Security-Token`.

## Risks

- A non-R2 S3-compatible provider might use a similar endpoint and require a temporary token; mitigated by limiting detection to Cloudflare R2 hostnames.
- If Cloudflare R2 supports session tokens in the future, this version will still ignore tokens for R2 endpoints; an explicit opt-in flag can be added then.

## Rollback / Recovery

- If the new behavior affects AWS S3 STS/SSO users, revert the R2 special case in `selectSessionToken()` to restore the old behavior.

## Completion Checklist

- [x] R2 endpoints with `AWS_SESSION_TOKEN` or local config `sessionToken` no longer produce `x-amz-security-token`, verified by `config` showing `sessionToken: not configured` and actual R2 `status` succeeding.
- [x] Non-R2 AWS S3 endpoints can still use `AWS_SESSION_TOKEN`, verified by a non-R2 config handler showing `sessionToken: configured`.
- [x] User documentation clearly explains that R2 does not need session tokens, verified by the `extensions/pi-sync/README.md` diff.
- [x] Repository quality gates pass, verified by successful `npm run check` output.
- [x] The pi-sync package dry run has no anomalies, verified by successful `npm run pack:sync` output.
