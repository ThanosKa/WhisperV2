# Direct-to-Soniox design

Status: claimed
Type: grilling
Blocked by: 13

## Question

Given [STT relay decision](08-stt-relay-decision.md) and the facts from [Soniox temporary key test](13-soniox-temp-key-test.md): how long is a lease (and how it shrinks on the Free plan's 180 s/day), how the desktop switches leases without splitting the transcript, how it reconnects after a drop, how unused lease seconds are given back (Cron Trigger reading Soniox usage logs, or other), the per-user cap on active keys, which errors map to today's quota screen, the WhisperAPP route's name and contract, and when Railway is switched off for old builds (use the app-version data from [macOS minimum version](12-macos-minimum-version.md)). Also: where this change sits relative to the TypeScript move of `sttService.js` (feeds [Order of the work](07-work-order.md)).

## Comments

- **Q1 (2026-11-24): daily quotas stay exactly as today** (Free 180 s, Pro 1,200 s, Pro Plus 5,400 s, Ultra 18,000 s of STT audio per usage day; both audio streams count). Only who meters them changes: WhisperAPP, through leases, instead of the Railway relay. Chat stays outside the quota (WhisperAPP ADR 0002). Owner understood the lease flow (ask → reserve → stream straight to Soniox → next lease before the end → give back unused seconds → same quota screen) and delegated the technical details (lease size, switching, reconnect, give-back, cap, errors, route) to the agent, following the industry. No glossary edits now; terms (Lease, audio stream vs LLM Stream, Chat) are written with the docs at the end.
