# Relay Transcript Drift Notes

## Summary

- Desktop client now acts purely as a relay: audio capture → STT relay → rendered transcript.
- Recent recordings surfaced transcripts like `Μέσασεαυτότοπαράδειγμα...` (Greek) where spaces are missing.
- Client forwards text verbatim; introduces no heuristics. Spacing/segmentation must happen upstream.

## Observed Behavior

- Relay emits `PARTIAL`/`TURN_COMPLETE` payloads with dense strings (no whitespace) for certain languages.
- Desktop renders payload unchanged, so UI mirrors the missing spaces.
- Issue reproducible regardless of local platform; occurs before data hits desktop.

## Likely Cause

- Upstream model/relay is returning tokens without language-appropriate separators.
- Potential causes on the relay:
    - Post-processing disabled/misconfigured (e.g., not applying `normalizeText` or provider-provided tokenizer output).
    - Provider/client mismatch: some providers require explicit spacing logic for scripts such as Greek or Chinese.
    - Relay trimming whitespace when combining partials/finals.

## Recommended Server Fix

1. Inspect relay code path handling provider responses before emitting `PARTIAL`/`TURN_COMPLETE`.
2. Ensure provider SDK is invoked with correct segmentation options (`enableAutomaticPunctuation`, etc.).
3. Add a language-aware normalization pass (e.g., break on Unicode script changes, punctuation, or rely on provider token boundaries) before sending text to clients.
4. Add regression tests for languages with spaces (Greek) and without (Chinese/Japanese) to verify normalization.

## Client Context

- Client removed all provider-management code (`modelStateService`, Gemini shims).
- `sttService` simply dispatches relay text; no text manipulation.
- Any fix must be server-side; desktop will automatically render normalized text once the relay sends it.
