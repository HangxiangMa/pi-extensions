# pi-statusline model truncation plan

## Goal

Add model-specific truncation controls to `pi-statusline` using its existing JSON and `segmentText` conventions, so long model IDs can be shortened before responsive segment fitting without changing Pi's model identity.

The public JSON surface will extend only `segmentText.model`:

```json
{
  "segmentText": {
    "model": {
      "prefix": "🤖 ",
      "suffix": "",
      "truncationLength": 36,
      "truncationSymbol": "…",
      "truncationDirection": "start"
    }
  }
}
```

`truncationDirection` names the removed portion: `start` keeps the suffix, `end` keeps the prefix, and `middle` keeps both ends. `truncationLength` is the number of model grapheme clusters retained before adding the symbol; `0` explicitly disables truncation. The built-in `36`/`start` defaults intentionally favor an out-of-box llama.cpp and Hugging Face experience. Truncation applies to the existing shortened dynamic model value before `prefix` and `suffix` are added.

## Context

- The balanced default includes `model` but not `provider`. A single oversized model segment can currently be dropped entirely after lower-priority segments are removed.
- `pi-statusline` already owns per-segment text presentation in `segmentText`, validates it in `settings.ts`, and applies it in `formatConfiguredSegment()` before width-aware powerline fitting.
- Common local-model IDs include long `owner/repository` names, variants, quantization suffixes, and absolute paths. Retaining the final 36 graphemes commonly drops owner/path noise while preserving useful model and variant detail; explicit direction overrides remain necessary for exceptional IDs.
- Existing settings are user-level only, load on session start/replacement, preserve unknown fields during menu saves, and use the Advanced JSON editor for complex free-form settings.

## Architecture

- Extend the typed presentation for only the `model` entry in `StatuslineConfig.segmentText`; all other segment entries retain the existing `prefix`/`suffix` shape.
- `extensions/pi-statusline/src/settings.ts` owns defaults, JSON validation, diagnostics, and the complete default editable document.
- `extensions/pi-statusline/src/render.ts` owns display transformation: `ctx.model.id` -> existing `shortenModel()` -> model truncation -> configured model prefix/suffix -> existing powerline fitting.
- Keep the grapheme-safe helper package-local. Do not add a dependency on `pi-starship` or create a shared package for this bounded behavior.

## Non-Goals

- Do not alter model/provider selection, inference IDs, provider display, or non-model segments.
- Do not parse Hugging Face IDs, paths, GGUF suffixes, quantization names, or aliases.
- Do not add automatic basename extraction, `.gguf` removal, `$name`/`$id`, or provider-specific rules.
- Do not dynamically derive truncation length from terminal width or change `SEGMENT_RETENTION_PRIORITY`.
- Do not add a new interactive settings screen; retain Advanced -> Edit settings JSON for these complex values.
- Do not change settings paths, precedence, migration, persistence, commands, package metadata, or `pi-starship`.
- Do not add a large external model catalog as a test fixture; use representative inline IDs.

## Assumptions

- Defaults intentionally change only model values longer than 36 grapheme clusters: `truncationLength = 36`, `truncationSymbol = "…"`, and `truncationDirection = "start"` remove the beginning and retain the suffix. `truncationLength = 0` remains the explicit compatibility escape hatch for full IDs.
- Empty `truncationSymbol` is valid. Prefix, suffix, and symbol remain single-line and reject terminal control characters.
- A configured symbol may contain multiple grapheme clusters and is inserted only when truncation occurs.
- Invalid recognized truncation fields produce field-local warnings and retain the corresponding built-in default, matching existing normalization behavior.
- The complete default settings document will include the three model truncation fields under `segmentText.model`; older partial documents continue to inherit defaults without migration or rewrite.

## Plan

- [x] Add focused failing normalization cases in `extensions/pi-statusline/test/settings.test.ts` for the built-in `36`/`start` model presentation, explicit `0` opt-out, partial valid overrides, length bounds, all direction values, empty/custom symbols, invalid types/directions/control characters, and unknown fields; verify each invalid field falls back independently while unknown content remains preservable by existing save flows.
- [x] Extend `extensions/pi-statusline/src/types.ts` with exact model truncation direction/constants and a model-specific `segmentText` type, then update `DEFAULT_STATUSLINE_CONFIG` and `DEFAULT_STATUSLINE_DOCUMENT` in `extensions/pi-statusline/src/settings.ts`; verify missing files still return defaults without creating a file and existing documents require no migration.
- [x] Extend `normalizeStatuslineConfig()` in `extensions/pi-statusline/src/settings.ts` to accept `truncationLength`, `truncationSymbol`, and `truncationDirection` only under `segmentText.model`; enforce a non-negative bounded integer, the existing single-line/control-safe text policy for the symbol, and exact enum membership, with diagnostics at each precise JSON path.
- [x] Add a grapheme-safe model truncation helper in `extensions/pi-statusline/src/render.ts` or a focused adjacent module and invoke it after `shortenModel()` but before `formatConfiguredSegment()`; verify prefix/suffix are never counted or truncated, length `0` and short values are unchanged, and only the rendered copy changes.
- [x] Add rendering and responsive fitting cases in `extensions/pi-statusline/test/renderer.test.ts` and/or `extensions/pi-statusline/test/statusline.test.ts` for representative Hugging Face, llama.cpp quantized, absolute-path, short, and Unicode IDs; verify the default `start`/36 behavior, explicit full-ID opt-out, `middle` and `end` overrides, odd/even retained lengths, empty/custom symbols, existing Claude/GPT shortening order, and that the built-in cap keeps the model visible with branch/context at a representative 80-column width where the unbounded segment would be dropped, while existing narrow-width priority fallback and per-line width bounds remain intact.
- [x] Update `extensions/pi-statusline/README.md` and `/statusline help` text in `extensions/pi-statusline/src/commands.ts` to document the three `segmentText.model` fields, defaults, exact direction semantics, display-only behavior, and examples for Hugging Face IDs and llama.cpp paths; update focused command/help tests without adding a second settings UI.
- [x] Audit the final pi-statusline diff against `docs/extension-conventions.md` and `docs/extension-settings.md`: confirm absent-file reads, legacy/canonical precedence, malformed/invalid-file protection, unknown-field preservation, atomic publication, rollback, session reload, menu cancellation/disposal, and non-TUI behavior remain intact; record any deviation in the handoff.
- [x] Run `npm test` and `npm run check`; verify all root tests, Biome checks, boundary checks, and workspace typechecks pass with no package metadata or generated dependency changes.

## Risks

- Direction terminology is easy to reverse. Tests and docs must consistently define values by the portion removed.
- Adding model-only fields inside a generally shaped `segmentText` map can weaken typing if represented as a broad optional interface. Keep the model entry exact and continue rejecting those fields on other segments.
- Grapheme-count semantics do not guarantee a fixed cell width for wide Unicode. Existing powerline width fitting remains authoritative.
- Truncation can make a previously oversized model survive fitting and thereby change which lower-priority segments remain visible. Cover that intended interaction without changing retention priorities.
- The approved finite default deliberately changes established output for model IDs longer than 36 grapheme clusters. Keep the change limited to the model value, document `truncationLength: 0` as the full-ID escape hatch, and verify ordinary short provider IDs remain byte-for-byte unchanged.

## Completion Checklist

- [x] `segmentText.model` accepts and validates `truncationLength`, `truncationSymbol`, and `truncationDirection`; other segment text schemas remain unchanged.
- [x] `start`, `middle`, and `end` produce deterministic grapheme-safe model text before prefix/suffix formatting and responsive fitting.
- [x] Built-in `36`/`start` defaults improve long-ID output without affecting short IDs; `0` restores full-ID display, and existing user files need no migration or rewrite.
- [x] Invalid fields warn and fall back independently; malformed-file, unknown-field, save, rollback, and lifecycle behavior remain unchanged.
- [x] README and command help match tested settings and examples.
- [x] `npm test` and `npm run check` pass.

## Verification Evidence

- Focused red tests failed on missing model presentation defaults and missing truncation behavior before implementation.
- Focused config, module, settings, renderer, and command tests passed after implementation.
- The 80-column llama.cpp path regression retains model, branch, and context while staying within width.
- `npm run check` passed: 566-file Biome check, extension boundaries, all workspace typechecks, and 1,759 tests.
- Package-local `npm run check --workspace @narumitw/pi-statusline` passed.
