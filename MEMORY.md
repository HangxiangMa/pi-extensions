# MEMORY

## GOTCHA

- `MEMORY.md` is not auto-loaded; check it before non-trivial debugging or design work when prior project context may matter.
- npm can show a scoped package dist-tag (for example `latest`) while `npm view <package>` still returns 404; fix visibility with `npm access set status=public <package> --otp=<otp>` or publish a bumped version.

## TASTE

- Keep entries short and reusable.
- Keep `just` install recipes resilient by verifying registry visibility and falling back only when it solves the current install path.
