# Phase 8 — Tokens & Billing

**Cova V1 implementation · Phase 8 of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 8 of 12 |
| **Goal** | Build token + billing infrastructure (schema, ledger, deduction logic, signup grant, tier definitions). DO NOT enforce in V1. ENFORCE_TOKEN_LIMITS=false. No user-facing UI. Soft-build for V1.5 enablement. |
| **Executor session estimate** | 1 session |
| **Calendar estimate** | 3–5 days |
| **Predicted Claude credits** | ~$10–20 |
| **Predicted infra spend** | ~$0 (no test renders needed; logic verified via SQL) |
| **Depends on** | Phase 1 closed; can run parallel to Phases 5/6/7 (no UI dependency) |
| **Blocks** | Nothing in V1 directly. Future V1.5 enforcement depends on this. |

---

## 1. The session loop for this phase

1. **Open new claude.ai chat.** Paste this entire phase doc.
2. **Chat summarizes back.** Confirms understanding (notably: NOT ENFORCED, just infrastructure). You confirm.
3. **Planner fires.** Fresh Claude Code session. Drift check confirms Phase 1 closed: users table exists with Phase 1 columns, render_cost_log wired. Confirms `auth.users` has handle_new_user trigger or Phase 1 created similar pattern. Uses Context7 MCP for: current Supabase RPC patterns for atomic updates, current Postgres trigger best practices. Uses EXA MCP for: Stripe-future-readiness patterns, token economy SaaS patterns. Writes executor prompt to `cova-plan/planner-output/P8-executor-prompt.md`.
4. **Executor prompt returns.** Verify covers M14 acceptance criteria. Critical: confirms NO UI changes.
5. **Executor fires.** 1 session.
6. **Verifier session 1 fires.** Reviews schema correctness, signup grant trigger, deduction RPC atomicity, ENFORCE_TOKEN_LIMITS env var defaults to false in all environments, no token UI exists (grep). Self-heals.
7. **Verifier session 2 fires.** Independent. Hunts for: race conditions in token deduction, signup grant idempotency, ledger entry sequencing, env var override leaks.
8. **Manual review (no UI screenshots needed).** SQL-only verification. Sign up new user → confirm 7 tokens granted via ledger row. Run render → confirm -5 ledger row. Run refine → confirm -1 ledger row. Confirm balance is logged (not enforced) — render still completes even at negative balance.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (token deduction latency, signup grant success rate).

---

## 2. Prereq verification

### Phase 1 closure checks
- `PHASE_STATUS.md` shows P1 → CLOSED
- `users` table exists with auth.users mirror via Phase 1 setup
- `auth.users` insert trigger pattern works (Phase 1 may have set up similar pattern; verify)
- `render_cost_log` wired (Phase 1) — token deductions don't touch this; separate `token_ledger` table
- Sentry, redactLogPayload, failure_category, PostHog all in place

### Halt conditions
- No `users` table → halt, escalate
- No PostHog client → halt, fix in Phase 1 remediation

---

## 3. Pre-decisions

**G1. Token cost per action [D-019, locked].**
- Initial render: 5 tokens
- Refine: 1 token
- Paid retry (force re-run after verifier fail): 2 tokens

Rationale: at $16/month for 20 tokens, $0.80/render. Higher than $0.30 cost = 62% gross margin. Refine 1 token = $0.80/refine retail vs $0.15 cost = 81% gross margin (loss-leader for engagement).

**G2. Tier definitions (locked, NOT surfaced in V1):**
- Free: 7 tokens on signup, no monthly grant after
- Starter: 20 tokens/month, $16/month
- Pro: 60 tokens/month, $39/month
- Studio: 180 tokens/month, $99/month

V1.5 surfaces these via /pricing page. V1 keeps them in DB only.

**G3. ENFORCE_TOKEN_LIMITS=false locked in V1.** *Resolution:* env var defaults false in all 3 environments (dev, preview, prod). Phase 8 does NOT enforce balance. Phase 8 logs every deduction. V1.5 flips to true.

**G4. Signup grant idempotency.** *Resolution:* trigger uses `ON CONFLICT DO NOTHING` on token_ledger insert (signup_grant reason). If trigger fires twice (rare race condition), second insert silently dropped. User has 7 tokens, not 14.

**G5. Deduction atomicity.** *Resolution:* atomic RPC `deduct_tokens(user_id, amount, reason, render_id)` runs in single transaction:
1. SELECT current balance
2. INSERT ledger row with new balance
3. UPDATE users.token_balance
4. RETURN new balance

Wraps in advisory lock keyed on user_id to prevent concurrent deductions race.

**G6. No UI in V1.** *Resolution locked:* zero token UI. No balance display. No "you're out" modal. No /pricing page. Verifier confirms via grep that token_balance is NEVER read in any client component.

**G7. Stripe NOT integrated in V1.** *Resolution locked:* `users.stripe_customer_id` column added as nullable placeholder for V1.5. No Stripe webhook handler. No subscription endpoints.

**G8. Monthly grant cron deferred.** *Resolution:* Free tier gets 7 once, never refreshed in V1. Paid tier monthly grants are V1.5 feature requiring Stripe webhook. V1 does not run a monthly_grant_at cron.

**G9. failure_category for token paths.** *Resolution locked:* even though enforcement is off, log failures from RPC calls (e.g., DB transient errors). Categories: `token_deduct_rpc_fail`, `token_ledger_insert_fail`, `token_grant_trigger_fail`, `token_balance_read_fail`.

**G10. PostHog event taxonomy.** *Resolution locked:* events fire even though no UI. Useful for V1.5 analytics retroactively:
- `token_signup_grant_completed {user_id, balance: 7}`
- `token_deduction_logged {user_id, action: 'render'|'refine'|'paid_retry', amount, balance_after}`
- `token_deduction_failed {user_id, failure_category}`

---

## 4. Background context (self-contained)

### 4.1 Why build but not enforce (D-019)

V1 ships to YC application bar (50 paying users + $1k revenue). Premature billing kills funnel. Free unlimited renders for V1 = highest conversion to engaged user. If we have to pay $0.30/render × 100 free users × 8 renders/user = $240/month early days, that's fine. We're optimizing for engagement signal, not unit economics yet.

V1.5 flips ENFORCE_TOKEN_LIMITS=true after we have product-market validation.

### 4.2 Gross margin projection (Starter realistic mix)

Per V1.5 enforcement scenario, Starter user with 5 renders + 5 refines/month:
- 4 initial renders × 5 tokens = 20 tokens (capped at 20)
- 5 refines × 1 token = 5 tokens (over budget — would block)
- Realistic mix: 4 renders + 5 refines = 25 tokens (5 over)
- User would upgrade to Pro at this point, OR refine less

Starter revenue: $16/month
Starter cost: 4 × $0.30 + 5 × $0.15 = $1.95
**Gross margin: 88%**

### 4.3 Architecture

```
auth.users INSERT
   ↓ (trigger: handle_new_user_token_grant)
public.users { token_balance: 7, tier: 'free' }
public.token_ledger row {delta: +7, reason: 'signup_grant', balance_after: 7}

API call: /api/render/start
   ↓ deductTokensForRender(userId, renderId, 'render')
RPC deduct_tokens(userId, 5, 'render', renderId)
   ↓ (V1: ENFORCE_TOKEN_LIMITS=false)
Always returns {allowed: true, balance: -1 /* not enforced */}
   ↓
Ledger row inserted: {delta: -5, reason: 'render', balance_after: balance - 5}
users.token_balance updated to balance - 5
   ↓
Render proceeds normally regardless of balance
```

### 4.4 Schema design (locked)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_balance int DEFAULT 7;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier text DEFAULT 'free' CHECK (tier IN ('free','starter','pro','studio'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_grant_at timestamptz;  -- V1.5 use; null in V1
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;       -- V1.5 placeholder

CREATE TABLE token_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  delta int NOT NULL,                    -- positive grant, negative spend
  reason text NOT NULL CHECK (reason IN ('signup_grant','monthly_grant','render','refine','paid_retry','admin_grant','admin_refund','test_grant')),
  related_render_id uuid REFERENCES renders(id) ON DELETE SET NULL,
  balance_before int NOT NULL,
  balance_after int NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX token_ledger_user_idx ON token_ledger(user_id);
CREATE INDEX token_ledger_created_idx ON token_ledger(created_at DESC);
CREATE INDEX token_ledger_reason_idx ON token_ledger(reason);
ALTER TABLE token_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY token_ledger_self_read ON token_ledger FOR SELECT USING (auth.uid() = user_id);
-- Inserts via service role (RPC) only
```

### 4.5 Edge cases

- **Concurrent renders by same user:** advisory lock keyed on user_id prevents race; deductions serialize.
- **Render fails mid-pipeline:** token already deducted (logged). V1.5 will refund via admin_refund ledger row. V1 just logs.
- **DB transient error during RPC:** retry once after 100ms backoff; if still fails, render proceeds anyway (logged warning).
- **handle_new_user trigger fails:** user signs up but no token_ledger row. V1.5 cron reconciles. V1 logs warning.
- **Negative balance:** allowed in V1 (not enforced). User can have -100 token balance. Logged for analytics.
- **User deletes account during pipeline:** ledger rows have user_id REFERENCES with ON DELETE CASCADE → token_ledger rows deleted. Audit trail preserved in `account_deletions` (separate, hashed).

---

## 5. Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Schema | Postgres via Supabase | New columns + new table |
| Trigger | Postgres trigger on auth.users INSERT | handle_new_user_token_grant |
| Atomic deduction | Supabase RPC (Postgres function) | Single-transaction with advisory lock |
| Wrapper | TypeScript at `apps/web/lib/tokens/deduct.ts` | Calls RPC, returns {allowed, balance} |
| Env var | `ENFORCE_TOKEN_LIMITS` in Vercel | Defaults false in all 3 envs |
| Analytics | PostHog events | No UI |

---

## 6. Scope

### 8A — Backend (M14)

1. **Schema migration:**
```sql
-- {ts}-tokens-schema.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_balance int DEFAULT 7;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier text DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_grant_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE users ADD CONSTRAINT users_tier_check CHECK (tier IN ('free','starter','pro','studio'));

CREATE TABLE token_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  delta int NOT NULL,
  reason text NOT NULL CHECK (reason IN ('signup_grant','monthly_grant','render','refine','paid_retry','admin_grant','admin_refund','test_grant')),
  related_render_id uuid REFERENCES renders(id) ON DELETE SET NULL,
  balance_before int NOT NULL,
  balance_after int NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX token_ledger_user_idx ON token_ledger(user_id);
CREATE INDEX token_ledger_created_idx ON token_ledger(created_at DESC);
CREATE INDEX token_ledger_reason_idx ON token_ledger(reason);
ALTER TABLE token_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY token_ledger_self_read ON token_ledger FOR SELECT USING (auth.uid() = user_id);

-- Down: DROP TABLE token_ledger; ALTER TABLE users DROP COLUMN ...;
```

2. **Signup grant trigger:**
```sql
-- Auto-grant 7 tokens on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_token_grant()
RETURNS TRIGGER AS $$
DECLARE
  existing_count int;
BEGIN
  -- Idempotency check: don't double-grant if trigger fires twice
  SELECT COUNT(*) INTO existing_count
  FROM public.token_ledger
  WHERE user_id = NEW.id AND reason = 'signup_grant';
  
  IF existing_count = 0 THEN
    -- Insert ledger row
    INSERT INTO public.token_ledger (user_id, delta, reason, balance_before, balance_after)
    VALUES (NEW.id, 7, 'signup_grant', 0, 7);
    
    -- Ensure users row exists with correct token_balance
    INSERT INTO public.users (id, email, token_balance, tier, created_at)
    VALUES (NEW.id, NEW.email, 7, 'free', now())
    ON CONFLICT (id) DO UPDATE SET token_balance = 7, tier = 'free';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any from Phase 1 / V0
DROP TRIGGER IF EXISTS on_auth_user_created_token_grant ON auth.users;

CREATE TRIGGER on_auth_user_created_token_grant
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_token_grant();
```

Note: if Phase 1 already created `handle_new_user` for some user-row mirror, this trigger runs alongside. Order matters; verifier confirms.

3. **Atomic deduction RPC:**
```sql
CREATE OR REPLACE FUNCTION public.deduct_tokens(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  p_render_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_balance_before int;
  v_balance_after int;
  v_lock_key bigint;
BEGIN
  -- Advisory lock keyed on user_id hash to prevent concurrent deductions
  v_lock_key := hashtext(p_user_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key);
  
  -- Read current balance
  SELECT token_balance INTO v_balance_before
  FROM public.users
  WHERE id = p_user_id;
  
  IF v_balance_before IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  
  v_balance_after := v_balance_before - p_amount;
  
  -- Insert ledger row
  INSERT INTO public.token_ledger (user_id, delta, reason, related_render_id, balance_before, balance_after)
  VALUES (p_user_id, -p_amount, p_reason, p_render_id, v_balance_before, v_balance_after);
  
  -- Update users.token_balance
  UPDATE public.users
  SET token_balance = v_balance_after
  WHERE id = p_user_id;
  
  RETURN json_build_object(
    'success', true,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'amount_deducted', p_amount
  );
EXCEPTION WHEN OTHERS THEN
  -- Don't expose error details to client
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

4. **Wrapper at `apps/web/lib/tokens/deduct.ts`:**
```typescript
import { supabaseService } from '@/lib/supabase/service';
import { logCost } from '@/lib/cost/log';
import { redactLogPayload } from '@/lib/log/redact';
import { posthog } from '@/lib/analytics/posthog';

const TOKEN_COSTS = {
  render: 5,
  refine: 1,
  paid_retry: 2,
} as const;

export async function deductTokensForRender(
  userId: string,
  renderId: string | null,
  type: 'render' | 'refine' | 'paid_retry'
): Promise<{ allowed: boolean; balance: number }> {
  const cost = TOKEN_COSTS[type];
  const startMs = Date.now();
  
  try {
    // V1: ALWAYS allow, just log
    if (process.env.ENFORCE_TOKEN_LIMITS !== 'true') {
      const { data, error } = await supabaseService.rpc('deduct_tokens', {
        p_user_id: userId,
        p_amount: cost,
        p_reason: type,
        p_render_id: renderId,
      });
      
      if (error || !data?.success) {
        // Log but don't fail render
        posthog.capture('token_deduction_failed', {
          user_id: userId,
          action: type,
          failure_category: data?.error || error?.message || 'rpc_unknown_error',
        });
        return { allowed: true, balance: -1 };  // V1: always allow
      }
      
      posthog.capture('token_deduction_logged', {
        user_id: userId,
        action: type,
        amount: cost,
        balance_before: data.balance_before,
        balance_after: data.balance_after,
      });
      
      return { allowed: true, balance: data.balance_after };
    }
    
    // V1.5+ enforcement path (built but unused in V1)
    const { data: user } = await supabaseService
      .from('users')
      .select('token_balance')
      .eq('id', userId)
      .single();
    
    if (!user || user.token_balance < cost) {
      posthog.capture('token_deduction_blocked', {
        user_id: userId,
        action: type,
        balance: user?.token_balance ?? 0,
        required: cost,
      });
      return { allowed: false, balance: user?.token_balance ?? 0 };
    }
    
    const { data, error } = await supabaseService.rpc('deduct_tokens', {
      p_user_id: userId,
      p_amount: cost,
      p_reason: type,
      p_render_id: renderId,
    });
    
    if (error || !data?.success) {
      // Log; for now in V1 still allow, V1.5 will block
      return { allowed: true, balance: -1 };
    }
    
    return { allowed: true, balance: data.balance_after };
  } catch (e: any) {
    // Defense: never block render due to token system error in V1
    posthog.capture('token_deduction_failed', {
      user_id: userId,
      action: type,
      failure_category: 'wrapper_unknown_error',
    });
    return { allowed: true, balance: -1 };
  }
}
```

5. **Wire to render + refine routes:**
- `apps/web/app/api/render/start/route.ts`: call `deductTokensForRender(userId, renderId, 'render')` AFTER renders row created
- `apps/web/app/api/render/refine/route.ts`: call `deductTokensForRender(userId, newRenderId, 'refine')` AFTER renders row created
- For paid_retry (verifier retry budget exhausted): call with `'paid_retry'` reason

6. **Env var setup:**
- Vercel: `ENFORCE_TOKEN_LIMITS=false` in production, preview, dev environments
- `.env.example` updated to document the var
- `apps/web/lib/config/env.ts` exposes typed env access

7. **No UI changes:**
- Verifier confirms via grep: NO component reads `users.token_balance` for display
- NO `/pricing` route
- NO "out of tokens" modal
- NO upgrade CTAs

### 8B — UI

**None in V1.** Per G6 locked decision.

### 8C — Integration + review

- Verify signup grants 7 tokens (test new user → check token_ledger row exists)
- Verify render writes -5 ledger row
- Verify refine writes -1 ledger row
- Verify ENFORCE_TOKEN_LIMITS=false in all 3 environments
- Confirm no token UI exists (grep all components)
- Verify atomic RPC handles concurrent calls correctly (load test 10 concurrent renders for same user)

---

## 7. Out of scope

- Stripe integration (V1.5)
- /pricing page (V1.5)
- Subscription management UI (V1.5)
- Tier-upgrade flow (V1.5)
- Monthly grant cron job (V1.5)
- Token balance display UI (V1.5)
- "Out of tokens" modal (V1.5)
- Stripe webhook handler (V1.5)
- Refund logic for failed renders (V1.5; Phase 8 just logs)
- Promotional codes / referral bonuses (V1.5)
- Admin token grant tool (V1.5; manual SQL admin_grant entries OK in V1)

---

## 8. Files touched

### Created
- `apps/web/lib/tokens/deduct.ts`
- `apps/web/lib/tokens/types.ts` (TokenReason union, TOKEN_COSTS const)
- `apps/web/lib/config/env.ts` (typed env access including ENFORCE_TOKEN_LIMITS)
- `tests/tokens/signup-grant.test.ts`
- `tests/tokens/deduction-rpc.test.ts`
- `tests/tokens/concurrency.test.ts`
- `tests/tokens/idempotency.test.ts`

### Migrations
- `supabase/migrations/{ts}-tokens-schema.sql` + `_down.sql`
- `supabase/migrations/{ts}-tokens-trigger.sql` + `_down.sql`
- `supabase/migrations/{ts}-tokens-rpc.sql` + `_down.sql`

### Modified
- `apps/web/app/api/render/start/route.ts` (wire deductTokensForRender)
- `apps/web/app/api/render/refine/route.ts` (wire deductTokensForRender)
- `apps/web/app/api/render/retry/route.ts` (wire as 'paid_retry')
- `apps/web/lib/analytics/events.ts` (token events)
- `apps/web/lib/errors/categories.ts` (TokenFailure union)
- `.env.example` (document ENFORCE_TOKEN_LIMITS)
- `vercel.json` (or env config) — set ENFORCE_TOKEN_LIMITS=false explicitly

---

## 9. API contracts

**No new public API routes in Phase 8.** All token logic is internal (called from existing render/refine routes).

Internal interface: `deductTokensForRender(userId, renderId, type) → {allowed, balance}`

---

## 10. Schema migrations

(Full DDL in §6 #1, #2, #3.)

Down migrations:
1. `tokens-rpc-down.sql`: `DROP FUNCTION public.deduct_tokens;`
2. `tokens-trigger-down.sql`: `DROP TRIGGER on_auth_user_created_token_grant; DROP FUNCTION handle_new_user_token_grant;`
3. `tokens-schema-down.sql`: `DROP TABLE token_ledger; ALTER TABLE users DROP COLUMN ...;`

---

## 11. Failure handling

```typescript
export type TokenFailure =
  | 'token_deduct_rpc_fail'
  | 'token_ledger_insert_fail'
  | 'token_grant_trigger_fail'
  | 'token_balance_read_fail'
  | 'token_user_not_found'
  | 'token_advisory_lock_timeout';
```

| Category | Recovery |
|---|---|
| token_deduct_rpc_fail | Log to PostHog as `token_deduction_failed`. Render proceeds (V1 doesn't enforce). |
| token_ledger_insert_fail | Same — log + proceed. |
| token_grant_trigger_fail | User signs up successfully but no ledger row. Cron in V1.5 reconciles. V1 logs. |
| token_user_not_found | Signup race condition. Retry once after 200ms. |
| token_advisory_lock_timeout | Concurrent deduction collision. Retry once after 100ms. |

V1 philosophy: token system errors NEVER block renders. Logged for V1.5 visibility.

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits | $10–20 |
| **Total** | **~$10–20** |

No infra spend — verification is SQL queries.

---

## 13. Verifier focus areas

| Criterion | Verifier check |
|---|---|
| token_ledger table created | Supabase MCP: `SELECT * FROM information_schema.tables WHERE table_name='token_ledger'` |
| RLS on token_ledger | Two-user isolation test: User A cannot read User B's ledger |
| handle_new_user_token_grant trigger | Signup new test user → check token_ledger has signup_grant row with delta=7 |
| Trigger idempotency | Manually fire trigger twice → only 1 ledger row (ON CONFLICT or COUNT-check guard) |
| deduct_tokens RPC | Direct SQL: `SELECT deduct_tokens('user_id', 5, 'render', null)` returns success+balances |
| Advisory lock | Concurrency test: 10 parallel render starts for same user → 10 deductions serialize, no race |
| Wrapper deductTokensForRender | Mock RPC failure → returns `{allowed: true, balance: -1}` (doesn't throw) |
| ENFORCE_TOKEN_LIMITS env var | All 3 envs (dev, preview, prod) have false |
| No token UI | grep components for `token_balance` reads → 0 matches |
| Wire to render route | /api/render/start logs ledger row -5 after renders insert |
| Wire to refine route | /api/render/refine logs ledger row -1 after renders insert |
| Wire to retry | Paid retry logs ledger row -2 |
| PostHog events | `token_signup_grant_completed` + `token_deduction_logged` fire |
| All 6 TokenFailure codes | grep confirms used |

---

## 14. Adversarial code review checklist

- [ ] handle_new_user_token_grant uses `SECURITY DEFINER` to access auth.users
- [ ] Trigger checks for existing ledger row to prevent double-grant
- [ ] deduct_tokens RPC wraps in BEGIN/EXCEPTION block
- [ ] Advisory lock key derived from user_id hash (consistent across calls)
- [ ] Advisory lock is XACT (auto-released at transaction end)
- [ ] Ledger insert uses balance_before + balance_after for audit (not just delta)
- [ ] Wrapper has ENV var check at TOP, not inside RPC call (avoid RPC if not enforced)
- [ ] Wrapper try/catch catches ALL errors (defense; never throws to caller in V1)
- [ ] Wrapper returns `{allowed: true, balance: -1}` on any failure (V1 fail-open)
- [ ] V1.5 enforcement path also written (else clause), so flipping flag works
- [ ] No console.log of user_id outside redactLogPayload
- [ ] PostHog events use typed event names from analytics/events.ts
- [ ] Render route deducts AFTER renders row created (avoid orphan ledger entries)
- [ ] Refine route deducts AFTER refines render row created
- [ ] Paid retry deducts as 'paid_retry' reason (not 'render')
- [ ] Token cost constants in `tokens/types.ts` (not hardcoded in routes)
- [ ] Migration order: schema → trigger → RPC (RPC depends on table)
- [ ] CASCADE on user_id FK ensures account deletion cascades token rows
- [ ] No `select * from users` in deductTokens (only `token_balance` selected)
- [ ] No SELECT inside trigger except via security_definer context
- [ ] Trigger doesn't error if users table row doesn't exist (UPSERT pattern)
- [ ] Vercel env vars verified in 3 environments
- [ ] .env.example documents ENFORCE_TOKEN_LIMITS with clear comment
- [ ] No /pricing route exists
- [ ] No "out of tokens" modal component
- [ ] grep `token_balance` in apps/web/components → 0 matches

---

## 15. Manual click-script (SQL-only verification)

No screenshots needed. Save SQL outputs to `cova-plan/manual-evidence/P8/`.

### Signup grant
1. Sign up new test user via /auth/signup with email "test-tokens-1@cova.test"
2. Run SQL via Supabase MCP:
```sql
SELECT * FROM token_ledger WHERE user_id = (SELECT id FROM auth.users WHERE email='test-tokens-1@cova.test');
```
3. Verify: 1 row with reason='signup_grant', delta=7, balance_before=0, balance_after=7 **[H1: ledger-signup.sql.txt]**

### Render deduction
4. As that user: complete quiz → capture → personalization → trigger render
5. After render starts:
```sql
SELECT * FROM token_ledger WHERE user_id = (SELECT id FROM auth.users WHERE email='test-tokens-1@cova.test') ORDER BY created_at DESC;
```
6. Verify: 2 rows total (signup_grant +7, render -5), balance_after=2 **[H2: ledger-render.sql.txt]**

### Refine deduction
7. After render completes, run a refine
8. SQL:
```sql
SELECT * FROM token_ledger WHERE user_id = (...) ORDER BY created_at DESC;
```
9. Verify: 3 rows (signup +7, render -5, refine -1), balance_after=1 **[H3: ledger-refine.sql.txt]**

### Negative balance allowed
10. Run 4 more renders → balance_after = 1 - 20 = -19 (negative!)
11. SQL:
```sql
SELECT token_balance FROM users WHERE id = (...);
```
12. Verify: token_balance = -19, but renders all completed normally **[H4: negative-balance.sql.txt]**

### ENFORCE_TOKEN_LIMITS verification
13. Vercel env panel screenshots: `ENFORCE_TOKEN_LIMITS=false` in dev, preview, prod **[H5: env-vars.png]**
14. Vercel logs: search for `token_deduction_logged` PostHog events; confirm fired **[H6: posthog-events.png]**

### Concurrent renders (race test)
15. Use a script to fire 5 simultaneous /api/render/start for same user
16. SQL:
```sql
SELECT count(*), sum(delta) FROM token_ledger WHERE user_id = (...) AND reason='render' AND created_at > now() - interval '1 minute';
```
17. Verify: count=5, sum=-25 (no double-counts, no missing) **[H7: concurrent-render.sql.txt]**

### Idempotency test (sign up same email twice via Auth admin endpoint)
18. Force fire trigger twice (delete user, recreate, fire INSERT manually)
19. SQL:
```sql
SELECT count(*) FROM token_ledger WHERE user_id = (...) AND reason='signup_grant';
```
20. Verify: count=1 (idempotency held) **[H8: trigger-idempotency.sql.txt]**

### No UI confirmation
21. Run grep across `apps/web/components/`:
```bash
grep -r "token_balance" apps/web/components/
grep -r "token-balance" apps/web/components/
```
22. Verify: 0 matches **[H9: no-ui-grep.txt]**

### Account deletion cascade
23. Delete test user via account-deletion flow
24. SQL:
```sql
SELECT count(*) FROM token_ledger WHERE user_id = (deleted_user_id);
```
25. Verify: count=0 (CASCADE worked) **[H10: cascade-delete.sql.txt]**

---

## 16. Manual evidence bundle

- 10 SQL output files from §15
- env-vars screenshot (Vercel)
- PostHog events screenshot (token events firing)
- INDEX.md linking SQL outputs to spec criteria

---

## 17. Remediation budget

- Round 1: Verifier session 1 self-heals
- Round 2: Verifier session 2 finds new issues → remediation
- Round 3 (escalation): write `cova-plan/escalations/P8.md`

If trigger fires inconsistently: escalation = nightly cron to reconcile (V1.5 work pulled forward).

---

## 18. Closing checklist

- [ ] All SQL outputs in `cova-plan/manual-evidence/P8/`
- [ ] env-vars + PostHog screenshots captured
- [ ] INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 8 → CLOSED
- [ ] `OPEN_DECISIONS.md` updated: token costs locked (5/1/2), tier definitions locked (free/starter/pro/studio), ENFORCE_TOKEN_LIMITS=false in V1, no UI in V1, V1.5 unlocks Stripe + UI
- [ ] `EMPIRICAL_FINDINGS.md` updated: signup grant trigger latency, deduction RPC latency p50/p95, advisory lock contention rate (should be ~0% in V1 traffic levels)
- [ ] Phase 9 prereq section reviewed
- [ ] Verifier reports archived
- [ ] Session handoffs written

---

## 19. Rollback plan

Revert merge commit on main. Run paired _down.sql in reverse:
1. tokens-rpc-down (DROP FUNCTION)
2. tokens-trigger-down (DROP TRIGGER + FUNCTION)
3. tokens-schema-down (DROP TABLE + ALTER TABLE DROP COLUMNs)

Note: dropping token_ledger loses audit history. If renders/refines wired token deduction calls, those calls would error after rollback. Solution:
- Wrap deductTokensForRender in try/catch (already done — fail-open in V1)
- Roll back wrapper changes too if rolling back schema

ENFORCE_TOKEN_LIMITS env var can be flipped instantly without redeploy via Vercel env panel.

---

## 20. Feature flags introduced

Not feature flags per se, but env-vars:

| Env var | Description | V1 default | V1.5 |
|---|---|---|---|
| `ENFORCE_TOKEN_LIMITS` | Block renders if balance insufficient | false | true |

When V1.5 flips this, render path automatically switches to enforcement mode (code already written, just gate flips).

---

## End of Phase 8 doc.

Next: Phase 9 (Dashboard).
