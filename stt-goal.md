# STT Optimization Goals for WhisperV2

## Overview

The STT (Speech-to-Text) system is the core input pipeline for real-time meeting analysis in WhisperV2. Its primary role is to convert live audio streams (user microphone + system audio) into structured conversation turns that feed the LLM for insights. The goal is to create an **optimized, responsive, and intelligent STT layer** that delivers **spam-free, context-aware insights** without overwhelming the user or the backend.

This document defines the key objectives, success metrics, and optimization priorities to guide development and iteration.

## Core Objectives

### 1. **Real-Time Responsiveness (Low Latency)**

- **Target**: Transcriptions and derived insights should appear within 2-3 seconds of speech ending, even in noisy or multilingual environments.
- **Why**: Users expect "live" assistance during calls/meetings; delays break immersion.
- **How**:
    - Use efficient STT providers (e.g., Gemini Live for streaming, Whisper for batch fallback).
    - Debounce utterance completion intelligently (e.g., 1.2s silence threshold, adjustable via config).
    - Gate LLM calls to avoid processing every micro-utterance—only trigger on meaningful content.
- **Metrics**:
    - End-to-end latency: <3s from audio chunk to UI update.
    - No dropped turns during high-noise scenarios.

### 2. **Spam Reduction and Noise Filtering**

- **Target**: Eliminate "spammy" analysis outputs (e.g., repeating placeholders like "(none)", echoing short fragments like "Απλά").
- **Why**: Spam clutters the UI and erodes trust; users want clean, actionable insights.
- **How**:
    - Implement smart-trigger gating: Accumulate turns until thresholds (e.g., 70 chars, 5 words, or 18 tokens) are met, or max-wait (6 turns) hits.
    - Filter noise at multiple layers:
        - STT level: Discard obvious placeholders (`<noise>`, `[BLANK_AUDIO]`).
        - Pre-LLM: Skip calls on low-quality aggregated text (regex for punctuation-only, length checks).
        - Post-LLM: Parse strictly; omit empty sections, dedupe terms/questions case-insensitively.
    - Cap historical context (e.g., last 8 terms/questions) to prevent prompt bloat.
- **Metrics**:
    - <5% of LLM calls on noise/short turns.
    - No placeholder echoes in 100% of outputs.
    - Analysis frequency: 1-2x per 5-10 meaningful utterances.

### 3. **Multilingual and Mixed-Language Support**

- **Target**: Seamless handling of English, Greek, and code-switching (e.g., "Τι βελτιώθηκε in our Next.js setup?").
- **Why**: Users operate in diverse linguistic contexts; rigid English-only STT fails globally.
- **How**:
    - Auto-detect primary language per session/turn (via STT metadata or LLM inference).
    - Mirror output language exactly (e.g., insights in Greek if transcript is Greek-dominant).
    - Correct STT errors in the detected language (e.g., "σύξ hiδέση" → "σύνοψη").
    - Support technical terms across languages (e.g., keep "Gitbook" as-is).
- **Metrics**:
    - 95% accuracy in language mirroring.
    - <10% misfires on mixed-language turns.

### 4. **Smooth UX and User Feedback**

- **Target**: Intuitive, non-intrusive experience with clear status cues.
- **Why**: Users shouldn't wonder why nothing's happening; feedback builds confidence.
- **How**:
    - Throttled status messages (e.g., "Waiting for more context..." every 1.5s max).
    - UI sections: Dynamic titles (e.g., "Meeting Intro" → "Summary Insights"), auto-scroll to new content.
    - Persistent actions: Accumulate questions/defines across analyses without duplication.
    - Graceful fallbacks: On errors, reuse prior results; show defaults like "What should I say next?".
- **Metrics**:
    - User retention: No complaints of "stuck" or "silent" sessions.
    - Engagement: >80% of sessions generate at least 3 insights/actions.

### 5. **Scalability and Infra Readiness**

- **Target**: Efficient resource use; prepare for preset-driven customization.
- **Why**: Long meetings (30+ mins) shouldn't degrade; future features (e.g., sales/recruiting presets) need modular prompts.
- **How**:
    - Local-first storage (SQLite for transcripts/summaries); optional cloud sync.
    - Configurable knobs (e.g., `smartTrigger.enabled`, thresholds) for tuning per use case.
    - Preset integration: Inject role prefixes dynamically; extend templates for variants (e.g., `sales_analysis` with objection-handling focus).
    - Logging: Optional/rotating `analysis.txt` (max 1MB) for debugging without bloat.
- **Metrics**:
    - Memory/CPU: <50MB peak for 30-min sessions.
    - Preset support: 100% backward-compatible with base `meeting_analysis`.

## Success Criteria

- **User-Centric**: 90% of test sessions produce "useful" insights (no spam, relevant to transcript).
- **Technical**: LLM calls reduced by 60-70% vs. original (every-utterance) mode.
- **Edge Cases**: Handles 1-min silence, rapid speaker switches, 50% noise audio without crashes.
- **Benchmark**: Compare against baseline: Faster insights, cleaner UI, lower token usage.

## Roadmap

1. **Immediate (v1.1)**: Implement gating + noise filters (done); test multilingual edge cases.
2. **Short-Term (v1.2)**: Preset variants; UI polish (e.g., collapsible sections).
3. **Long-Term**: Server-side STT relay enhancements; quota-aware throttling.

This STT infra will power WhisperV2 as a "silent co-pilot"—always listening, rarely interrupting, always helpful.
