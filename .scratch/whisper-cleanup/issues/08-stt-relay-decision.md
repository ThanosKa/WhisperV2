# STT relay decision

Status: claimed
Type: grilling
Blocked by: 03

## Question

Given the findings in [STT relay: keep or replace](03-stt-relay-options.md): keep the Railway relay, move it to Cloudflare, or connect the desktop straight to Soniox with short-lived keys? Settle how strict quota metering must be, whether the Cloudflare account moves to Paid, and whether option (a) first needs a test of Soniox reconnect with a single-use temporary key.

## Comments

- **Q1 (2026-11-23): replace the relay with option (a).** The desktop opens its WebSocket straight to Soniox with a short-lived temporary key; WhisperAPP (Cloudflare Worker) hands out the key on a plain HTTP route after checking the desktop session and the remaining quota. `../websocket` is retired once old desktop builds are gone. Owner's reasons: no own microservice to deploy, and it is the industry pattern (OpenAI Realtime, Deepgram, AssemblyAI, Soniox's own guide).
  - Quota: each key is charged to the user up front (a lease, never longer than what remains), then corrected to the exact seconds from Soniox usage logs. Both streams (`me` and `them`) keep counting, as today, so the user sees no change.
  - Security: the main Soniox key stays only in WhisperAPP; the temporary key is single-use, STT-only, short, and already paid for. Needs a per-user cap on active keys.
  - Meanwhile: the live relay moves to `stt-rt-v6` before 2026-12-15.
