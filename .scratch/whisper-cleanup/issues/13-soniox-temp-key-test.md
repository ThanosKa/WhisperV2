# Soniox temporary key test

Status: resolved
Type: task
Blocked by: 08

## Question

HITL: the owner puts a Soniox API key in a local, git-ignored file; the agent then writes and runs a throwaway script (not app code) and records the facts. Check against the real Soniox API, with `stt-rt-v6`:

1. Create a temporary key (`usage_type: transcribe_websocket`, `single_use: true`, short `max_session_duration_seconds`, a `client_reference_id`). Open a stream, send audio, drop the socket, and try `enable_reconnect` with the `reconnect_token`: does it resume with a single-use key? With a key past `expires_in_seconds`? Does the session-duration clock keep running across the reconnect?
2. What happens at `max_session_duration_seconds` (error text, close code), so the desktop can map it to today's quota screen.
3. How long until the stream shows up in `GET /v1/usage-logs`, and can it be filtered or found by `client_reference_id`?
4. Can two streams (`me`, `them`) open the new lease's sockets before the old ones close, without a gap in the transcript?

Context: [STT relay decision](08-stt-relay-decision.md), [STT relay: keep or replace](03-stt-relay-options.md).

## Answer

Run on 2026-11-23 against the real Soniox API, model `stt-rt-v6`, with the production project key (copied from the Railway `websocket` service into the git-ignored `.scratch/whisper-cleanup/.env`). Total cost about $0.005. Script, log and raw results: [assets/13-soniox-temp-key-test/](../assets/13-soniox-temp-key-test/) (`test.cjs`, `results.json`; `run.log` stays local, git ignores `*.log`).

**All four checks pass. Nothing blocks the direct-to-Soniox design.**

1. **Reconnect with a temporary key works.** The key was `single_use`, `expires_in_seconds: 10`, `max_session_duration_seconds: 45`. The stream ran 15 s, the socket was dropped without a close frame (code 1006), and audio kept being queued for 3.6 s. Then a new connection went to `reconnect_url` with the same key, which by then was both used and past `expires_in_seconds`. Soniox answered `reconnected` (`last_request: 149`), the 30 queued chunks were resent, and the transcript has no gap.
   - `single_use` works: a second stream opened with the same key, before it expired, got `401 unauthenticated` ("Invalid or expired temporary API key…") and close 1000. So a used key can only reconnect to its own stream, never start a new one.
   - **The session clock keeps running across the reconnect.** The stream ended 45.16 s after it first opened, which is the limit counted from the first open, not from the reconnect. The drop time counts too, and is billed: the usage log shows exactly 45,000 ms.
2. **At `max_session_duration_seconds`** Soniox sends `{"error_code": 403, "error_type": "temp_api_key_session_expired", "error_message": "Temporary API key session duration limit exceeded. Create a new temporary API key to start a new session."}`, then closes with **1000**. Branch on `error_type`. A close of 1000 alone is not enough, because a normal end also closes with 1000.
3. **Usage logs appear in under 20 s** after a stream ends (absent 0.5 s after the end, present at the next poll 20 s later; one stream showed up ≤12.6 s after its end). `GET /v1/usage-logs` **cannot filter** by `client_reference_id` (only `start_time`/`end_time` by request end time, max 31 days, `limit` ≤ 1000, cursor paging), but every entry carries the `client_reference_id` bound to its temporary key, so filtering on our side works. **A stream that ends with `temp_api_key_session_expired` is logged** (the docs' "only successfully completed requests" does not exclude it). `input_audio_duration_ms` is the time the stream was open, not the audio sent: a stream opened 1.1 s before its first audio was billed 13,076 ms for 11.9 s of audio.
4. **Switching both streams to a new lease leaves no gap.** `me` and `them` each had a lease-1 key. 1 s before the switch, two new keys were created and both new sockets opened while the old ones were still streaming (5 connections at once, no 429). At the switch, the next audio chunk went to the new socket and the old one got the end frame (empty text). Old streams returned `finished` about 1 s later. The joined text of old + new was word-for-word the same as an unswitched baseline stream of the same audio. The cut fell between sentences here ("…customer survey. First, | the launch…"); a cut in the middle of a word may split that word, which the design should allow for. Pre-opening is billed from the moment the socket opens (point 3), so it costs about 1 s per stream per switch.

Facts for [Direct-to-Soniox design](14-direct-to-soniox-design.md): the lease can be enforced by `max_session_duration_seconds` alone (a reconnect does not extend it); reconnect needs no new key from WhisperAPP; Soniox bills open time including drops; the usage-log correction can run soon after each stream (seconds, not hours) and must page and filter by `client_reference_id` itself.
