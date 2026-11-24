# Direct-to-Soniox design

Status: resolved
Type: grilling
Blocked by: 13

## Question

Given [STT relay decision](08-stt-relay-decision.md) and the facts from [Soniox temporary key test](13-soniox-temp-key-test.md): how long is a lease (and how it shrinks on the Free plan's 180 s/day), how the desktop switches leases without splitting the transcript, how it reconnects after a drop, how unused lease seconds are given back (Cron Trigger reading Soniox usage logs, or other), the per-user cap on active keys, which errors map to today's quota screen, the WhisperAPP route's name and contract, and when Railway is switched off for old builds (use the app-version data from [macOS minimum version](12-macos-minimum-version.md)). Also: where this change sits relative to the TypeScript move of `sttService.js` (feeds [Order of the work](07-work-order.md)).

## Comments

- **Q1 (2026-11-24): daily quotas stay exactly as today** (Free 180 s, Pro 1,200 s, Pro Plus 5,400 s, Ultra 18,000 s of STT audio per usage day; both audio streams count). Only who meters them changes: WhisperAPP, through leases, instead of the Railway relay. Chat stays outside the quota (WhisperAPP ADR 0002). Owner understood the lease flow (ask → reserve → stream straight to Soniox → next lease before the end → give back unused seconds → same quota screen) and delegated the technical details (lease size, switching, reconnect, give-back, cap, errors, route) to the agent, following the industry. No glossary edits now; terms (Lease, audio stream vs LLM Stream, Chat) are written with the docs at the end.
- **Q2 (2026-11-24): Railway is switched off once no paying user has used it for 30 days in a row.** Old builds are found without new code: the relay validates every session through WhisperAPP, and after the change any STT usage that still arrives through the relay's internal route comes from an old build, so WhisperAPP knows which users and plans. Free users left on an old build lose Listen when it closes (most can update; macOS 11-12 cannot, and their OS version stays unknown because old builds do not send it). Keeping it costs about $5/month.
- **Q3 (2026-11-24): owner accepted the technical design below**, on the condition that it is the industry standard. It is: short-lived keys minted by the backend are how OpenAI Realtime, Deepgram, AssemblyAI and Soniox's own guide put a client straight on a speech socket, and charging a hold up front and settling to the measured amount is the usual pre-authorization pattern (like a card hold).

## Answer

Resolved 2026-11-24 with the owner. Facts behind it: [Soniox temporary key test](13-soniox-temp-key-test.md).

**For the user nothing changes:** same daily quotas (Free 180 s, Pro 1,200 s, Pro Plus 5,400 s, Ultra 18,000 s of STT audio per usage day, both audio streams counting), same quota screen. Only the meter moves from the Railway relay to WhisperAPP.

**Lease** (one temporary Soniox key for one audio stream, `me` or `them`, charged up front):
- Length: `min(300 s, floor(remaining / 2))` per audio stream; both keys of a lease are created in one request. Free (180 s) gets one 90 s lease per audio stream, which covers the whole day. Below 1 s each, the request is refused as quota exceeded.
- Key: `usage_type: transcribe_websocket`, `single_use: true`, `expires_in_seconds: 30` (only needs to open the stream), `max_session_duration_seconds` = lease length (this alone enforces the lease; reconnects do not extend it), `client_reference_id` = `<leaseId>:<me|them>`. The main Soniox key needs the "Temporary API keys" permission.
- Charged to the usage day on which the lease is issued.

**WhisperAPP routes** (desktop session in `X-Session-UUID`, plus the app and OS version headers from [macOS minimum version](12-macos-minimum-version.md)):
- `POST /api/stt/lease` → 200 `{ leaseId, leaseSeconds, expiresAt, keys: { me, them }, quotaStatus }`; 429 `STT_AUDIO_QUOTA_EXCEEDED` with the real `resetAt`; 429 `STT_LEASE_LIMIT` when the user already has 2 open leases (current + next); 401/404 for a bad session, worded per WhisperAPP ADR 0004. Rate-limited per user with the existing Upstash limiter.
- `POST /api/stt/lease/{leaseId}/end` with `{ seconds: { me, them } }`: the desktop's own count when a lease ends early (stop, quota, error).
- Leases are stored in a new Supabase table next to `stt_usage_counters`; the charge and the give-back go through the existing counter.

**Give-back (no Cron Trigger):** when a lease ends early, WhisperAPP first gives back the unused seconds using the desktop's count (so a Free user who stops and starts again within 20 s is not shown a false quota screen). Then it settles every ended lease of that user to the exact Soniox figure (`GET /v1/usage-logs`, filtered by `client_reference_id` on our side; entries appear within 20 s) on that user's next lease request or quota read, before answering. A lease whose keys never opened a stream (no log entry after the key expired and the lease ended) is given back in full. Soniox bills the time a stream is open, drops included; that figure is what the user is charged, as today's relay charged the audio it received.

**Switching leases without splitting the transcript:** ask for the next lease 30 s before the current one ends; open the two new sockets about 1 s before the switch; switch both audio streams at the first endpoint (`<end>` token, a pause) in the last 10 s, or hard at 2 s before the end; send the old sockets the empty end frame and keep reading them until `finished`. If the next lease is refused for quota, the current one runs to its end, then the quota screen shows.

**Reconnect after a drop (new; today the app does not reconnect):** start each stream with `enable_reconnect: true`, ping every 5 s, keep the audio captured during the drop; on a drop, reconnect to `reconnect_url` with the same key, retrying every ~5 s inside the 20 s idle window, then resend from `last_request + 1`. If that fails, take a new lease and start a new stream.

**Errors the user sees:**
- Quota screen (today's `stt:quotaExceeded` path): lease 429 `STT_AUDIO_QUOTA_EXCEEDED`, or Soniox `temp_api_key_session_expired` when no next lease could be had for quota. The countdown uses the real `resetAt` (today the relay sends the current time, so the countdown shows nothing; fixed by this change).
- Signed-out handling as today: lease 401/404.
- Today's generic disconnected state: Soniox 402 (organization balance or budget), 429 `max_concurrent_connections_reached`, 503, or no network after the reconnect window. Soniox's default limit of 10 concurrent streams (5 users listening) must be raised in the Soniox Console before launch.

**Railway** ([STT relay decision](08-stt-relay-decision.md)) is switched off, and `../websocket` deleted, once **no paying user has used it for 30 days in a row**. Old builds are visible without new code: any STT usage that still arrives through the relay's internal route `POST /api/internal/stt/usage` comes from an old build. Free users still on an old build (including macOS 11-12, who cannot update) lose Listen then. Until then the relay only gets the `stt-rt-v6` model fix.

**Where it sits** ([Order of the work](07-work-order.md)): step 7, on the TypeScript `sttService`. The WhisperAPP lease routes ship first; the desktop build that uses them follows.

**Left for the docs step at the end:** the glossary terms (Lease; audio stream as opposed to the LLM Stream route; Chat) and an ADR for "leases charged up front and settled from Soniox usage logs instead of a relay".

**Amended by [Which CLAUDE.md files, and what each says](19-claude-md-files.md):** the glossary terms and the lease ADR are written in step 7, with the lease routes, not at the end.
