# Electron 45 re-baseline (ticket 04)

On Electron 45.5.0 (Chromium 156), three of the six window screenshots no longer matched the ticket 02 baselines taken on Electron 30.5.1 (Chromium 124). They were re-baselined once, on 2026-11-28.

| Window | Pixels over Playwright's threshold | Pixels that differ at all | Largest channel difference |
|---|---|---|---|
| Header | 5 | 4275 | 80 of 255 |
| Ask | 8 | 8362 | 112 of 255 |
| Settings | 9 | 2198 | 116 of 255 |

**Why this is anti-aliasing only.** Every differing pixel sits on the edge of a glyph or icon: the letters of "Upgrade to Pro", "Show / Hide", "AI Response" and the answer text, the move icon, the sparkle icon and Settings' Stealth Mode icon. The rest are alpha changes of 1 or 2 levels in the translucent window backgrounds. No element moved, changed size, color or content: the size of each image is unchanged, and the `-expected` and `-actual` images look the same side by side. The Listen, Plan and Screenshot windows still matched exactly.

Files: `<window>-expected.png` (ticket 02 baseline), `<window>-actual.png` (Electron 45, now the baseline), `<window>-diff.png` (Playwright's diff, the differing pixels in red/yellow).
