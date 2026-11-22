# STT relay: keep or replace

Status: resolved
Type: research
Blocked by: none

## Question

Should the Soniox relay on Railway (`../websocket`) stay, or be replaced? Today it relays audio from the desktop app to Soniox, validates the session against `WhisperAPP` and reports STT usage for quotas. Compare at least: (a) the desktop connects straight to Soniox with short-lived keys issued by `WhisperAPP`, (b) the relay moves to Cloudflare (Workers / Durable Objects WebSockets) next to `WhisperAPP`, (c) keep Railway. For each: how session validation and usage metering still work, cost, latency, multi-stream ("me" and "them") support, and how much code changes in each repo.

## Answer

Facts only; the keep-or-replace choice is the owner's, in [STT relay decision](08-stt-relay-decision.md). Full findings: branch `research/stt-relay-options` (commit `0caf1f2`, local only), file `.scratch/whisper-cleanup/research/03-stt-relay-options.md`.

- Soniox costs $0.24 per listening hour in every option, 15-40x the relay hosting. At 1,000 h/month the relay costs about (a) ~$0, (b) ~$6-7, (c) ~$14.
- (a) Direct to Soniox: temporary keys work for real-time WebSocket, up to 3,600 s, single-use, no revoke, expiry checked only at stream open. Quota safety needs pre-charged short "leases" from WhisperAPP. Biggest code change: desktop `sttService.js` (~400-600 lines) plus a WhisperAPP route (~150-300). Unknown: whether `enable_reconnect` works with a single-use temporary key; must be tested before choosing (a).
- (b) Cloudflare Durable Object: outbound WebSockets do not hibernate, so billed for the whole session. Session check and metering stay as today; desktop changes one URL; relay rewritten for Workers (~400-700 lines). The WhisperAPP account looks to be on the Free plan, which would cap usage.
- (c) Keep Railway: no required change; $5 Hobby plus small egress.
- Weaknesses today: unreported seconds are lost on socket close (reconnect-to-talk-free), metering stops if WhisperAPP is down, every redeploy cuts sessions (only `SIGINT` handled), desktop does not reconnect mid-session.
- Urgent in every option: the relay uses `stt-rt-v3`, already retired by Soniox and routed to v5, which retires on 2026-12-15. Move to `stt-rt-v6`.
- Soniox allows 10 concurrent streams by default (5 users at once); raise it in the Soniox Console.
- Old desktop installs call a fixed `*.up.railway.app` host, so Railway stays up for a while whatever is chosen.
