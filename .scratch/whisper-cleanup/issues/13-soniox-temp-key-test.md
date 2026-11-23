# Soniox temporary key test

Status: open
Type: task
Blocked by: 08

## Question

HITL: the owner puts a Soniox API key in a local, git-ignored file; the agent then writes and runs a throwaway script (not app code) and records the facts. Check against the real Soniox API, with `stt-rt-v6`:

1. Create a temporary key (`usage_type: transcribe_websocket`, `single_use: true`, short `max_session_duration_seconds`, a `client_reference_id`). Open a stream, send audio, drop the socket, and try `enable_reconnect` with the `reconnect_token`: does it resume with a single-use key? With a key past `expires_in_seconds`? Does the session-duration clock keep running across the reconnect?
2. What happens at `max_session_duration_seconds` (error text, close code), so the desktop can map it to today's quota screen.
3. How long until the stream shows up in `GET /v1/usage-logs`, and can it be filtered or found by `client_reference_id`?
4. Can two streams (`me`, `them`) open the new lease's sockets before the old ones close, without a gap in the transcript?

Context: [STT relay decision](08-stt-relay-decision.md), [STT relay: keep or replace](03-stt-relay-options.md).
