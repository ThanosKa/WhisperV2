# LLM Quota System Documentation

## Overview

The WhisperAPP backend implements a comprehensive quota system for LLM API calls that enforces daily usage limits based on user plans (Free/Pro). The system prevents abuse while ensuring fair resource allocation.

## Architecture

### Core Components

1. **Plan Limits** (`src/lib/auth/session.utils.ts`)
2. **Usage Tracking** (Database: `usage_counters` table)
3. **Pre-call Validation** (Stream route only)
4. **Post-call Increment** (Stream route only)
5. **Quota Reporting** (User profile endpoint)

## Plan Limits

### Current Limits

```typescript
PLAN_LIMITS = {
    FREE: { DAILY_CALLS: 20 },
    PRO: { DAILY_CALLS: 1000 },
};
```

### How Limits Are Applied

- **Free Plan**: 20 LLM calls per day
- **Pro Plan**: 1000 LLM calls per day
- **Fresh Start**: Daily at midnight (automatic)
- **Tracking**: Per user, per day basis
- **Behavior**: Each day starts with 0 usage, previous days' usage preserved in database

## Database Schema

### `usage_counters` Table

```sql
CREATE TABLE usage_counters (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  usage_date DATE NOT NULL,
  calls_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Composite unique constraint prevents duplicate entries
ALTER TABLE usage_counters ADD CONSTRAINT unique_user_date
UNIQUE (user_id, usage_date);
```

## API Endpoints

### 1. Stream Route (`/api/llm/stream`) - ENFORCES QUOTA

**Request Flow:**

```
1. Authenticate session
2. 🔍 Check quota limits (PRE-CALL VALIDATION)
3. ❌ If exceeded: Return 429 "Daily limit reached"
4. ✅ If OK: Proceed with LLM call
5. 📈 Increment usage counter (POST-CALL)
6. Return streaming response
```

**Key Behaviors:**

- **Blocking**: Prevents calls when limit exceeded
- **Real-time**: Checks current usage before each call
- **Increment**: Updates counter after successful streaming
- **Fire-and-forget**: Usage tracking doesn't block response

### 2. Chat Route (`/api/llm/chat`) - NO QUOTA ENFORCEMENT

**Request Flow:**

```
1. Authenticate session
2. ⚠️  NO QUOTA CHECK (unlimited calls)
3. Make LLM call
4. Return response
```

**Note**: Chat route currently has no quota enforcement.

### 3. User Profile Route (`/api/auth/user-by-session/[uuid]`)

**Response includes quota data:**

```json
{
  "success": true,
  "data": {
    "uid": "clerk_user_id",
    "email": "user@example.com",
    "displayName": "User Name",
    "plan": "free" | "pro",
    "apiQuota": {
      "daily": 20,          // Plan limit
      "used": 2,            // Calls used today
      "remaining": 18       // Available calls
    }
  }
}
```

## Quota Logic Details

### Pre-Call Check (`checkUsageLimit`)

```typescript
async function checkUsageLimit(clerkUserId) {
    // 1. Get user_id from clerk_id
    const user = await supabase.from('users').select('id').eq('clerk_id', clerkUserId);

    // 2. Get subscription status
    const sub = await supabase.from('subscriptions').select('plan, status').eq('user_id', user.id);

    // 3. Determine plan and limit
    const plan = sub?.plan || 'free';
    const isActivePro = plan === 'pro' && sub?.status === 'active';
    const limit = isActivePro ? 1000 : 20;

    // 4. Get current usage
    const today = new Date().toISOString().slice(0, 10);
    const usage = await supabase.from('usage_counters').select('calls_used').eq('user_id', user.id).eq('usage_date', today);

    const used = usage?.calls_used || 0;
    const remaining = Math.max(0, limit - used);

    // 5. Return decision
    return {
        canProceed: used < limit,
        plan,
        used,
        limit,
        remaining,
    };
}
```

### Post-Call Increment (`incrementUsage`)

**Database Level (Primary):**

```sql
CREATE OR REPLACE FUNCTION increment_usage(uid UUID, d DATE)
RETURNS INTEGER AS $$
  INSERT INTO usage_counters (user_id, usage_date, calls_used)
  VALUES (uid, d, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET calls_used = usage_counters.calls_used + 1
  RETURNING calls_used;
$$ LANGUAGE sql;
```

**Application Level (Wrapper):**

```typescript
async function incrementUsage(clerkUserId) {
    // Get user_id from clerk_id
    const user = await supabase.from('users').select('id').eq('clerk_id', clerkUserId);

    // Call database function for atomic increment
    const result = await supabase.rpc('increment_usage', {
        uid: user.id,
        d: new Date().toISOString().slice(0, 10),
    });

    return result.data;
}
```

### Client Headers

The LLM stream endpoint returns quota information in HTTP headers:

```http
X-RateLimit-Limit: 20        # Plan limit (20 for free, 1000 for pro)
X-RateLimit-Used: 5          # Today's usage count
X-RateLimit-Remaining: 15    # Today's remaining calls
```

**Note:** No reset header is sent since quotas don't reset - they just start fresh daily due to date-based tracking.

## Error Handling

### Quota Exceeded Response

```json
{
    "success": false,
    "error": "Daily limit reached. Used: 20/20 calls",
    "code": 429
}
```

### HTTP Status Codes

- `200`: Success
- `401`: Authentication failed
- `429`: Quota exceeded
- `500`: Server error

## Usage Patterns

### Free User Journey

```
Day 1:
- 12:01 AM: used=0 (fresh start - new date)
- Call 1: used=0 < 20 → ✅ OK → used=1
- Call 2: used=1 < 20 → ✅ OK → used=2
...
- Call 20: used=19 < 20 → ✅ OK → used=20
- Call 21: used=20 < 20 → ❌ BLOCKED (429)

Day 2:
- 12:01 AM: used=0 (fresh start - new date)
- Can make 20 more calls (Day 1 usage still exists in database)
```

### Pro User Journey

```
- Daily fresh start: used=0 at midnight (new date)
- Call 1-1000: used < 1000 → ✅ OK
- Call 1001: used=1000 < 1000 → ❌ BLOCKED
- Next day: used=0 (fresh start - new date) → Can make 1000 more calls
```

## Monitoring & Debugging

### Backend Logs

```
[LLM Stream] Checking usage limits for user: clerk_xxx
[LLM Stream] Usage check passed: used=2, limit=20, remaining=18
[LLM Stream] ✅ Usage counter incremented
```

### Database Queries

```sql
-- Check current usage
SELECT calls_used, usage_date
FROM usage_counters
WHERE user_id = ? AND usage_date = CURRENT_DATE;

-- Reset usage (manual)
UPDATE usage_counters
SET calls_used = 0
WHERE user_id = ? AND usage_date = CURRENT_DATE;
```

## Security Considerations

1. **Race Conditions**: Using database constraints to prevent double-counting
2. **Authentication**: All quota checks require valid session
3. **Data Integrity**: Foreign key constraints ensure valid user references
4. **Rate Limiting**: Additional protection against rapid successive calls

## Future Enhancements

1. **Token-based limits** (instead of call-based)
2. **Rolling windows** (last 24 hours instead of calendar days)
3. **Plan upgrades** during quota period
4. **Usage analytics** and reporting
5. **Grace periods** for limit enforcement

## Testing

### Test Cases

- Free user hitting limit (21st call blocked)
- Pro user within limit (calls succeed)
- Daily reset (usage clears at midnight)
- Invalid sessions (authentication fails)
- Database errors (graceful degradation)

### Manual Testing

```bash
# Test quota endpoint
curl -H "X-Session-UUID: <uuid>" \
     http://localhost:3000/api/auth/user-by-session/<uuid>

# Test streaming with quota
curl -X POST \
     -H "X-Session-UUID: <uuid>" \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"Hello"}]}' \
     http://localhost:3000/api/llm/stream
```
