# Direct-to-Soniox design

Status: open
Type: grilling
Blocked by: 13

## Question

Given [STT relay decision](08-stt-relay-decision.md) and the facts from [Soniox temporary key test](13-soniox-temp-key-test.md): how long is a lease (and how it shrinks on the Free plan's 180 s/day), how the desktop switches leases without splitting the transcript, how it reconnects after a drop, how unused lease seconds are given back (Cron Trigger reading Soniox usage logs, or other), the per-user cap on active keys, which errors map to today's quota screen, the WhisperAPP route's name and contract, and when Railway is switched off for old builds (use the app-version data from [macOS minimum version](12-macos-minimum-version.md)). Also: where this change sits relative to the TypeScript move of `sttService.js` (feeds [Order of the work](07-work-order.md)).
