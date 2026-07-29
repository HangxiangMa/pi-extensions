# pi-starship model truncation plan

## Goal

Add bounded, model-specific truncation settings to `pi-starship` so long llama.cpp, Hugging Face, file-path, and alias model IDs can be shortened without changing the provider model ID or the rest of the footer layout.

The public TOML surface will follow Starship naming:

```toml
[model]
truncation_length = 0
truncation_symbol = "…"
truncation_direction = "end" # start | middle | end
```

`truncation_direction` names the removed portion: `start` keeps the suffix, `end` keeps the prefix, and `middle` keeps both ends. `truncation_length` is the number of model grapheme clusters retained before adding the symbol; `0` disables truncation. Truncation applies after the existing `shortenModel()` rules and affects display only.

## Context

- Pi 0.82.1's llama.cpp provider forwards the router's opaque `model.id` and currently sets `name` to the same value.
- Real-world model IDs include long `owner/repository` names, variants, quantization suffixes, and absolute paths with useful identifying data at different positions; no fixed direction is suitable for every ID shape.
- Upstream Starship uses module-specific `truncation_length` and `truncation_symbol` options but has no model module or direction option. The Pi-specific direction setting is therefore an explicit adaptation, not a compatibility claim.
- The existing `pi-starship` module option loader already owns defaults, type validation, diagnostics, and TOML normalization, but render-time module value contexts do not currently receive their normalized options.

## Architecture

- `extensions/pi-starship/src/modules/model.ts` owns model truncation semantics and remains the only module whose output changes.
- `extensions/pi-starship/src/config.ts` and `extensions/pi-starship/src/modules/types.ts` continue to own generic module option schemas and normalized values. Add the smallest enum-capable schema needed to validate direction and expose the current module's normalized options to its value resolver.
- Use a small grapheme-safe plain-text helper local to `pi-starship`; do not parse Hugging Face IDs, paths, GGUF suffixes, quantization names, or aliases.
- Preserve the existing final ANSI-aware wrapping in `wrapFormattedStatusline()` as a separate last-resort layout behavior.

## Non-Goals

- Do not change provider rendering, model selection, provider IDs, or inference payloads.
- Do not add `$name`, `$id`, aliases, basename extraction, `.gguf` stripping, or semantic model-ID parsing.
- Do not make truncation responsive to terminal width or change fill/wrapping behavior.
- Do not add truncation settings to other pi-starship modules.
- Do not modify `pi-statusline` or create an extension-to-extension/shared-package dependency.
- Do not add a large external model catalog as a test fixture; use a few representative inline IDs.

## Assumptions

- Defaults prioritize compatibility: `truncation_length = 0`, `truncation_symbol = "…"`, and `truncation_direction = "end"` produce the current untruncated output.
- Empty `truncation_symbol` is valid, matching Starship's documented ability to truncate without a marker.
- A configured symbol may contain multiple grapheme clusters; the complete validated symbol is inserted only when truncation occurs.
- Direction values are exact lowercase strings. Invalid values warn and independently fall back to `end` without invalidating other model settings.

## Plan

- [x] Add focused failing cases in `extensions/pi-starship/test/config.test.ts` for valid model truncation options, defaults, empty symbols, integer bounds, invalid directions, and unknown model fields; verify the tests demonstrate field-local diagnostics and fallback before implementation.
- [x] Extend `ModuleOptionSchema` and normalized option typing in `extensions/pi-starship/src/modules/types.ts` and `extensions/pi-starship/src/config.ts` with a bounded string-enum option, then pass each module's normalized options through `valueContext()` in `extensions/pi-starship/src/modules/render.ts`; verify existing option-bearing module tests remain unchanged and the new config tests pass.
- [x] Declare `truncation_length`, `truncation_symbol`, and `truncation_direction` on `modelModule` in `extensions/pi-starship/src/modules/model.ts`, and apply a grapheme-safe helper after `shortenModel()` for `start`, `middle`, and `end`; verify length `0` and values at or below the limit are byte-for-byte unchanged and the symbol appears only on actual truncation.
- [x] Add renderer coverage in `extensions/pi-starship/test/modules.test.ts` using representative Hugging Face, llama.cpp quantized, absolute-path, short, and Unicode IDs; verify all three directions, odd/even retained lengths, empty/custom symbols, existing Claude/GPT shortening order, disabled model behavior, and that runtime `model.id` is never mutated.
- [x] Update `extensions/pi-starship/README.md` to document the three `[model]` options, exact direction semantics, defaults, display-only behavior, representative configuration for Hugging Face IDs and llama.cpp paths, and the explicit deviation from complete upstream Starship compatibility; verify the example TOML parses through `loadStarshipConfig()` in an existing or focused documentation/config test.
- [x] Audit the final pi-starship diff against `docs/extension-conventions.md` and `docs/extension-settings.md`: confirm missing-file reads, malformed-file protection, unknown-field preservation, atomic publication, editor preview/confirmation, lifecycle ownership, and non-TUI behavior were not altered; record any deviation in the handoff.
- [x] Run `npm test` and `npm run check`; verify all root tests, Biome checks, boundary checks, and workspace typechecks pass with no package metadata or generated dependency changes.

## Risks

- Direction terminology is easy to misread. Tests and README examples must define it as the portion removed, not the portion retained.
- Moving or exposing generic module option value types can accidentally widen unrelated module behavior. Keep the data flow read-only and audit all `ModuleDefinition.values()` implementations for unchanged results.
- Grapheme-count semantics do not guarantee a fixed terminal-cell width for wide Unicode. Final footer wrapping remains the terminal-width safety boundary.
- A finite default would silently alter existing footers. Keep the default disabled unless a separate product decision explicitly approves a behavioral default.

## Completion Checklist

- [x] `[model]` accepts and validates `truncation_length`, `truncation_symbol`, and `truncation_direction` with documented defaults.
- [x] `start`, `middle`, and `end` produce deterministic grapheme-safe display output after `shortenModel()` while preserving the underlying model ID.
- [x] Invalid settings warn and fall back per field; malformed TOML and persistence behavior remain unchanged.
- [x] No other module, wrapping, fill, provider, lifecycle, or package boundary behavior changes.
- [x] README examples and option semantics match tested behavior.
- [x] `npm test` and `npm run check` pass.

## Verification Evidence

- Focused red tests failed on missing model option defaults and missing truncation behavior before implementation.
- Focused config, module, settings, renderer, and command tests passed after implementation.
- `npm run check` passed: 566-file Biome check, extension boundaries, all workspace typechecks, and 1,759 tests.
- Package-local `npm run check --workspace @narumitw/pi-starship` passed after the final refactor.
