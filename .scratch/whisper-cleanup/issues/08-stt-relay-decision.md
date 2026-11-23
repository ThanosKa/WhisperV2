# STT relay decision

Status: resolved
Type: grilling
Blocked by: 03

## Question

Given the findings in [STT relay: keep or replace](03-stt-relay-options.md): keep the Railway relay, move it to Cloudflare, or connect the desktop straight to Soniox with short-lived keys? Settle how strict quota metering must be, whether the Cloudflare account moves to Paid, and whether option (a) first needs a test of Soniox reconnect with a single-use temporary key.

## Comments

- **Q1 (2026-11-23): replace the relay with option (a).** The desktop opens its WebSocket straight to Soniox with a short-lived temporary key; WhisperAPP (Cloudflare Worker) hands out the key on a plain HTTP route after checking the desktop session and the remaining quota. `../websocket` is retired once old desktop builds are gone. Owner's reasons: no own microservice to deploy, and it is the industry pattern (OpenAI Realtime, Deepgram, AssemblyAI, Soniox's own guide).
  - Quota: each key is charged to the user up front (a lease, never longer than what remains), then corrected to the exact seconds from Soniox usage logs. Both streams (`me` and `them`) keep counting, as today, so the user sees no change.
  - Security: the main Soniox key stays only in WhisperAPP; the temporary key is single-use, STT-only, short, and already paid for. Needs a per-user cap on active keys.
  - Meanwhile: the live relay moves to `stt-rt-v6` before 2026-12-15.
- **Q2 (2026-11-23): yes, test first.** Before designing the change, a small script checks against Soniox whether `enable_reconnect` works with a single-use temporary key, and how fast usage logs appear and whether they can be found per user (`client_reference_id`). See [Soniox temporary key test](13-soniox-temp-key-test.md).
- **Cloudflare plan (fact, no question):** option (a) does not need Workers Paid. WhisperAPP gets about 2 key requests per lease instead of ~1,440 usage POSTs per listening-hour, and the usage-log correction can run on a Cron Trigger, which Free has.

## Answer

**Replace the Railway relay: the desktop connects straight to Soniox with temporary keys that WhisperAPP hands out (option (a) in [STT relay: keep or replace](03-stt-relay-options.md)).**

- WhisperAPP gets one plain HTTP route that checks the desktop session and remaining quota, creates a single-use Soniox temporary key no longer than what remains, and charges it up front (a lease). Seconds are later corrected to the exact usage from Soniox usage logs. Both streams keep counting, as today.
- The main Soniox key never leaves WhisperAPP. Per-user cap on active keys.
- `../websocket` keeps running for old desktop builds, then is deleted. Until then its only change is the model move to `stt-rt-v6` before 2026-12-15.
- Workers Paid is not needed for this.
- First: [Soniox temporary key test](13-soniox-temp-key-test.md). Then the details in [Direct-to-Soniox design](14-direct-to-soniox-design.md).
