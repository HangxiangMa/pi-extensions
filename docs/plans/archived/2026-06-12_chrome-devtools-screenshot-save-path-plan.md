## Goal

Improve `chrome_devtools_screenshot` so agents can reliably inspect or reuse captured images even when inline image tool results are not usable. Success means every screenshot can be saved as a PNG file, the tool result tells the agent the saved path and byte count, optional `savePath` is documented, and the existing image content result remains available for image-capable models.

## Context

Issue: <https://github.com/narumiruna/pi-extensions/issues/89>

Current evidence:

- `extensions/pi-chrome-devtools/src/chrome-devtools.ts` now returns screenshot data as both `{ type: "image", data, mimeType: "image/png" }` and text/details containing the saved PNG path and byte count.
- The screenshot tool schema accepts `pageId`, `fullPage`, and optional `savePath`.
- `renderScreenshotResult()` uses screenshot text and falls back to `details.savedPath` / `details.bytes` when needed.
- Pi session/tool result types support image content, but the saved file path lets the agent call the built-in `read` tool or attach the file in later steps.

## Architecture

- Keep one screenshot tool and extend its parameters instead of adding a second tool.
- Save PNG bytes from the CDP base64 payload with Node filesystem APIs.
- Use Pi's file mutation queue for explicit `savePath` writes so screenshot writes do not race with other file-writing tools.
- Return both the saved path in text/details and the existing image content block.

## Assumptions

- When `savePath` is omitted, auto-save to a unique PNG under the OS temp directory, for example `/tmp/pi-chrome-devtools-screenshot-<uuid>.png`.
- When `savePath` is relative, resolve it from the tool execution `ctx.cwd`; a single leading `@` is stripped to match Pi file-mention paths.
- Explicit save paths are constrained to relative paths under `ctx.cwd`, or absolute paths under `ctx.cwd` / the OS temp directory. Paths with `..`, NUL bytes, symlinked parent directories, directories as targets, final symlink targets, and other non-regular file targets are rejected.

## Plan

- [x] Extend the `chrome_devtools_screenshot` parameter schema in `extensions/pi-chrome-devtools/src/chrome-devtools.ts` with optional `savePath: string`; verified by Node harness assertion that `screenshot.parameters.properties.savePath` exists.
- [x] Add a `resolveScreenshotPath(savePath, ctx.cwd)` helper that defaults to `join(tmpdir(), "pi-chrome-devtools-screenshot-<uuid>.png")`, resolves relative paths from `ctx.cwd`, rejects invalid/NUL paths, and documents any absolute-path restrictions; verified by Node harness covering omitted/default path, relative path, leading `@`, absolute temp path, `..`, NUL, forbidden absolute path, symlinked parent directory, final symlink rejection, and non-regular target rejection.
- [x] Write the decoded PNG bytes to the resolved path with safe parent-directory creation, an exclusive temp file, rename-based replacement with a Windows existing-file fallback, cleanup on error, and `withFileMutationQueue(path, ...)`; verified by Node harness checking PNG signature bytes, overwrites to an existing explicit path, concurrent writes to the same explicit path, no mutation through symlinked parents, and no leftover temp files after successful writes.
- [x] Update the screenshot tool result text and details to include `savedPath`, byte count, page metadata, and a hint such as `Use read({ path: "..." }) to inspect the screenshot`; verified by Node harness result inspection and source review of returned `details.page`.
- [x] Keep the `{ type: "image", mimeType: "image/png" }` content block for models/providers that can consume images directly; verified by Node harness returned `content` inspection.
- [x] Improve `renderScreenshotResult()` so expanded output shows the saved path and byte count from text/details instead of hiding the useful result; verified by source review of `renderScreenshotResult()` and `screenshotTextContent()`.
- [x] Update `extensions/pi-chrome-devtools/README.md` to document default auto-save, `savePath`, relative path behavior, full-page screenshots, and how to read the saved image afterward; verified by README review.
- [x] Run `npm --workspace @narumitw/pi-chrome-devtools run check` and `npm run check`; verified both commands exit successfully.
- [x] Run `just pack-chrome-devtools`; verified the package dry-run includes `src/chrome-devtools.ts`, `README.md`, `LICENSE`, and `package.json`.

## Risks

- Writing files from an LLM-controlled argument can overwrite or escape intended locations if path rules are too permissive. Mitigated by rejecting `..`, NUL bytes, absolute paths outside `ctx.cwd`/temp, symlinked parent directories, directories as targets, symlink final targets, non-regular file targets, and physical parent-directory escapes, plus temp-file replacement for writes.
- Default auto-saving creates temporary files. Mitigated by making the result text and README show the saved temp path.
- Very large full-page screenshots can produce large files. Mitigated by reporting byte size and relying on CDP/browser limits rather than embedding extra base64 text.

## Rollback / Recovery

- If file-saving causes regressions, disable the new write path by reverting the screenshot parameter/result changes while leaving the existing image content return shape intact.
- If the default temp-file behavior is too noisy, keep `savePath` support but change the default in a follow-up release after documenting the behavior change.

## Completion Checklist

- [x] `chrome_devtools_screenshot({ fullPage: true })` saves a PNG to a unique temp path and reports that path, verified by Node mocked-CDP harness output containing a `pi-chrome-devtools-screenshot-<uuid>.png` default path and file existence check.
- [x] `chrome_devtools_screenshot({ savePath: "foo.png" })` writes or overwrites the PNG relative to `ctx.cwd` and reports the resolved path, verified by Node mocked-CDP harness reading the PNG signature from a temp workspace path.
- [x] Unsafe or unsupported paths are rejected with actionable errors, verified by Node mocked-CDP harness cases for `../escape.png`, NUL byte paths, forbidden absolute paths, symlinked parent directories, final symlink targets, and non-regular file targets.
- [x] The result still includes an image content block for image-capable models, verified by Node mocked-CDP harness returned `content` inspection.
- [x] README documents default save behavior and `savePath`, verified in `extensions/pi-chrome-devtools/README.md`.
- [x] Typecheck, repo check, and package dry-run pass, verified by `npm --workspace @narumitw/pi-chrome-devtools run check`, `npm run check`, and `just pack-chrome-devtools`.
