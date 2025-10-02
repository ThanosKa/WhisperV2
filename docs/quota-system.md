# LLM Quota System

## Overview

Server-side quota enforces daily LLM call limits by plan (Free: 20, Pro: 1000) to prevent abuse. Tracks via Supabase `usage_counters`; pre-call check in stream endpoint (blocks at limit); post-call increment. Chat endpoint unlimited. Reports remaining via user profile. Daily reset at midnight (date-based). Client receives headers (X-RateLimit-\*); errors 429 on exceed.

## Limits (`lib/auth/session.utils.ts`)

- Free: 20 calls/day.
- Pro: 1000 calls/day (active sub only).
- Fresh start: New date row (0 used).

## Database Schema

`usage_counters`:

- id (PK), user_id (FK users), usage_date (DATE), calls_used (INT default 0), created_at/updated_at (TS).
- Unique: (user_id, usage_date).

Init: Supabase; atomic increment via RPC function.

## Flow

### Pre-Call (`checkUsageLimit`)

1. Get user_id from clerk_id.
2. Fetch sub (plan/status) → limit (20/1000).
3. Query today’s row → used.
4. If used >= limit: 429 "Daily limit reached".
5. Return {canProceed, plan, used, limit, remaining}.

### Post-Call (`incrementUsage`)

- RPC: INSERT/UPDATE calls_used +1 for today (atomic).
- No block; fire-and-forget.

Chat: No check/increment.

## Endpoints

### `/api/llm/stream` (Enforces)

- POST {messages}; auth X-Session-UUID.
- Pre-check quota → LLM stream if OK.
- Headers: X-RateLimit-Limit/Used/Remaining.
- Increment after success.
- 429 if exceeded: {error: "Used: 20/20", code: 429}.

### `/api/llm/chat` (Unlimited)

- POST {messages}; no quota.

### `/api/auth/user-by-session/[uuid]` (Report)

- Returns {plan, apiQuota: {daily, used, remaining}}.

## Patterns

- Free: Blocks at 21st call; next day resets.
- Pro: Blocks at 1001st; daily reset.
- Errors: 401 auth, 429 quota, 500 server.
- Monitoring: Logs checks/increments; SQL for usage.

## Files (Backend Spec)

- `lib/auth/session.utils.ts`: Limits/check/increment.
- Routes: llm/stream (quota), llm/chat (none), auth/user (report).
- DB: Supabase usage_counters + RPC.

Client: Receives headers; no local tracking. For LLM calls, see `llm-pipeline.md`.
