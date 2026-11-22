# STT relay: keep or replace

Status: open
Type: research
Blocked by: none

## Question

Should the Soniox relay on Railway (`../websocket`) stay, or be replaced? Today it relays audio from the desktop app to Soniox, validates the session against `WhisperAPP` and reports STT usage for quotas. Compare at least: (a) the desktop connects straight to Soniox with short-lived keys issued by `WhisperAPP`, (b) the relay moves to Cloudflare (Workers / Durable Objects WebSockets) next to `WhisperAPP`, (c) keep Railway. For each: how session validation and usage metering still work, cost, latency, multi-stream ("me" and "them") support, and how much code changes in each repo.
