# Billing & Token System Audit

**Date:** 2026-04-29
**Repo:** `github.com/pgoel813/cova`
**Status:** Token gating active in render paths (in-memory stub). Stripe schema-only. No purchase flow exists.

---

## 1. Current State

| Concern | State |
|---|---|
| Stripe SDK | **Not installed.** No `stripe` or `@stripe/stripe-js` in `apps/web/package.json`. |
| End-to-end billing flow | **None.** No checkout route, no webhook handler, no signup → trial wiring. |
| Token tracking | **Partial.** Logic in `apps/web/lib/tokens.ts` is an in-memory `Map` stub. DB schema (`token_transactions`, `deduct_tokens_atomic` RPC) is migrated but app code never calls it. |
| Render gating | **Active.** Both `app/api/render/empty-room/route.ts` and `app/api/render/retry/route.ts` import `chargeTokens`/`canAffordPaidRetry` and gate Modal calls on balance. |
| Cost logging | **Active.** Every render writes to `render_cost_log` (cost_usd + tokens_charged + cache_hit + retry_type). Admin dashboard at `app/api/admin/render-costs/route.ts`. |

**Critical fragility:** in-memory balances reset on every serverless cold start. Non-admin users always reseed to 100 tokens. This is fine for admin-only dev; it is a billing-leak in production.

---

## 2. Database Schema for Billing

Source: `apps/web/lib/types/supabase.ts` (canonical types).

### `users`
- `stripe_customer_id: string | null` (line 2126) — placeholder, never populated.
- `token_balance: number` (line 2130) — default 5 per migration; **read by no app code** today.
- `tokens_enabled: boolean` (line 2131) — gate flag, also unused.

### `token_transactions` (lines 2016–2059) — append-only ledger
```
id          UUID PK
user_id     UUID FK users(id)
delta       INTEGER  (negative = debit)
reason      TEXT     (≤200 chars, audit code)
render_id   UUID     (optional link to render_cost_log)
created_at  TIMESTAMPTZ
```
Migration: `supabase/migrations/20240002000000_token_transactions.sql`. Header comment forbids direct UPDATEs to `users.token_balance` — balance is `SUM(delta)` per user. **Status: schema active, never written to by application.**

### `deduct_tokens_atomic(p_user_id, p_amount, p_reason, p_render_id)` RPC (lines 2237–2245)
Atomic Postgres function with `FOR UPDATE` lock. Does balance check + transaction insert in one statement. **Status: deployed, never called.**

### `render_cost_log` (lines 1046–1084) — actively written
```
id, render_id, user_id, pipeline_version,
is_retry, retry_type ('free'|'paid'),
cost_usd NUMERIC, tokens_charged INTEGER,
cache_hit BOOLEAN, created_at
```

### `render_rate_limits` (1085–1105), `render_retries` (1106–1135)
Per-user hourly retry bucket and per-render free/paid retry counters. Active.

**No tables for:** subscriptions, plans, prices, invoices, payments, top-up packs.

---

## 3. Stripe Integration

| Item | Status |
|---|---|
| SDK installed | **No** — no `stripe` package, no `@stripe/stripe-js`. |
| API route handlers | **None** — no `app/api/stripe/`, no `app/api/billing/`, no checkout/portal/webhook routes. |
| Webhook configured | **No** — no signature verification code, no webhook secret in use. |
| Products/prices in Stripe dashboard | **Unknown but assume no** — there is no client to consume them and `STRIPE_SECRET_KEY` is blank in `.env.example`. |
| Env vars stubbed | **Yes** — `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` exist in `apps/web/.env.example` lines 51–53 under "Stripe (post-MVP)". |
| Customer ID column | **Yes** — `users.stripe_customer_id`, never populated. |

The only mention of subscription pricing in the repo is in `COVA_MVP_SPEC_v1.1.md:1301`:

> Post-MVP plan: Model C hybrid — 5 free tokens on signup + token packs (pay per use) + subscription tiers ($15 / $29 / $49 / month) via Apple In-App Purchase with server-side receipt validation.

This pre-dates the V1 web pivot. The user's tier directive ($16 / $39 / $99) supersedes it.

---

## 4. Token System

### Tracking
Single counter per user, intended to be `users.token_balance` derived from `SUM(token_transactions.delta)`. Today: `Map<userId, number>` in `apps/web/lib/tokens.ts`.

```ts
// lib/tokens.ts:20
const _balances = new Map<string, number>();
// admins (ADMIN_TEST_USER_IDS env): 999_999
// everyone else: seed 100, mutated in-process only
```

### Consumption (current code)
From `apps/web/lib/render-config.ts`:
```
BASE_RENDER_TOKEN_COST    = 5    // primary empty-room render
PAID_RETRY_TOKEN_COST     = 2    // retries beyond the 1 free
FREE_RETRIES_PER_RENDER   = 1
MAX_PAID_RETRIES_PER_RENDER = 5
MAX_RETRIES_PER_HOUR      = 5
```

| Action | Token cost | Where charged |
|---|---|---|
| Cache hit (empty-room re-serve) | 0 | `app/api/render/empty-room/route.ts:112-121` (logged only) |
| Primary empty-room render | 5 | `app/api/render/empty-room/route.ts:134-180` (post-success) |
| First retry per render | 0 (free) | `app/api/render/retry/route.ts:157` |
| Paid retry (#2–#6) | 2 each | `app/api/render/retry/route.ts:161, 192` |
| Refine (step-8b refinement loop) | **0** | `app/api/render/refinement/apply/route.ts` — no `chargeTokens` call |
| Product unlock | **0** | No unlock route exists. The `$0.90 per unlock` figure from the user prompt is **not implemented**. |

Charge ordering: tokens are deducted **after** the Modal call returns success, to avoid billing for provider failures (`docs/render-upgrade-v2/PHASE_A_HANDOFF.md`).

### Out-of-balance behavior
`chargeTokens` throws `InsufficientTokensError`. The empty-room route returns HTTP 402 with `{ error: "insufficient_tokens", balance, required }`. The retry route does the same and the `RetryButton` UI displays balance + a "Get more tokens" link to `/account/tokens` — **a route that does not exist** (`apps/web/components/render/RetryButton.tsx:39-88`).

### Free-token grant on signup
**Not wired.** Default in the `users` migration is 5; the in-memory stub seeds non-admins to 100. Neither matches the prompt's "7 free tokens at signup" target. There is no signup hook that writes a `token_transactions` row.

---

## 5. Recommended V1 Architecture

Standard SaaS pattern: **subscription with included tokens + à-la-carte top-up**, no rollover.

### Pricing (recommended; subject to founder decision)

| Tier | Price | Tokens / mo | $ / token (effective) | Implied use |
|---|---|---|---|---|
| Free (signup grant) | $0 | **7 tokens, one-time** | — | 1 full render + a few refines, then paywall |
| Starter | **$16** | **20 tokens** | $0.80 | ~3 rooms / mo |
| Pro | **$39** | **60 tokens** | $0.65 | ~10 rooms / mo |
| Studio | **$99** | **180 tokens** | $0.55 | ~30 rooms / mo, power user / pro |
| Top-up pack S | $9 | 10 tokens | $0.90 | matches the $0.90 unit anchor |
| Top-up pack M | $39 | 50 tokens | $0.78 | |
| Top-up pack L | $79 | 120 tokens | $0.66 | |

**Rollover policy:** No rollover on monthly subscription tokens. Top-up tokens roll over until consumed (industry standard — separates "use it or lose it" subscription value from purchased credit).

### Token costs per action (recommended)

| Action | Tokens |
|---|---|
| Initial render (full V3 3-pass: detect + Pass 1 + Pass 2 + Pass 3 + QA + product match) | **5** *(unchanged)* |
| Free retry per render | 1 free, then paid |
| Paid retry / regenerate | **2** *(unchanged)* |
| Refine via tap-to-edit (step-8b) | **1** |
| Product unlock | **0** — affiliate revenue covers; do **not** double-charge users for shopping. The original "$0.90 per product unlock" anchor is better used as the top-up-pack price-per-token, not as a per-unlock fee. |

### Cost-of-goods and gross-margin sanity check

From `docs/PRODUCT_STATUS.md:135-143`, COGS per session:
- Detection (GroundingDINO + SAM + Depth-Anything-V2): $0.09
- Schnell preview: $0.001
- FLUX.2 Pro full render: $0.03
- Product matching (Serper × 2 + Google Lens + CLIP): $0.003
- Conditional swap (FLUX Fill Pro): $0.02
- **Per-session total: ~$0.14** (1 swap typical)

Note: V3 pipeline (`apps/web/CLAUDE.md`) is heavier — IC-Light + 3-pass FLUX general — closer to **$0.20–$0.25** per primary render, with an explicit **target COGS ≤ $0.20**. Refines and retries are lighter (single Pass 2 or Kontext call: ~$0.05–$0.08).

Margin check at the recommended tier (Starter, $16 / 20 tokens):

- **Worst-case** user redeems all 20 tokens as primary renders ($0.25 each): COGS = $5.00 → **GM = 69%**.
- **Realistic mix** (20 tokens = 3 primaries + 9 refines + 2 paid retries): $0.25×3 + $0.07×9 + $0.07×2 ≈ $1.52 → **GM = 90%**.
- **Studio worst-case** (180 tokens × $0.25): $45 COGS on $99 → **GM = 55%**. Fix: Studio assumes a healthier mix — if power users do 30 rooms × $0.25 plus 90 refines × $0.07 ≈ $14 COGS → **GM = 86%**.

**The 70–80% gross-margin target is comfortably met at the recommended numbers** even on a pessimistic action mix, with headroom to widen tiers if usage data shows refines dominate.

---

## 6. Stripe Implementation Plan

### Stripe products to create (in dashboard, then mirror IDs in env)

```
prod_starter   price_starter_monthly   $16/mo recurring
prod_pro       price_pro_monthly       $39/mo recurring
prod_studio    price_studio_monthly    $99/mo recurring
prod_topup_s   price_topup_s           $9 one-time   (10 tokens)
prod_topup_m   price_topup_m           $39 one-time  (50 tokens)
prod_topup_l   price_topup_l           $79 one-time  (120 tokens)
```

Encode `tokens_per_period` as Stripe **price metadata** so the webhook can grant tokens without a separate config table. Same approach for top-up `tokens_granted` metadata.

### New API routes
```
app/api/stripe/checkout/route.ts        // POST { price_id } → Checkout Session URL
app/api/stripe/portal/route.ts          // POST → Billing Portal URL (cancel / update card)
app/api/stripe/webhook/route.ts         // POST raw body, verify signature
app/api/tokens/balance/route.ts         // GET current balance from token_transactions
app/api/tokens/history/route.ts         // GET ledger
```

### Webhook events to handle

| Event | Action |
|---|---|
| `checkout.session.completed` (mode=subscription) | Insert `subscription` row, set `users.stripe_customer_id`, **grant tier tokens** via `deduct_tokens_atomic`-paired `grant_tokens` RPC (insert positive `delta`). |
| `checkout.session.completed` (mode=payment, top-up) | Grant `tokens_granted` from price metadata. Mark these rows with `reason='topup'` so rollover logic can distinguish them. |
| `invoice.payment_succeeded` | Monthly renewal — grant tier tokens; **first reset any unused subscription tokens** (no rollover). Top-up tokens (reason='topup' with positive remaining `SUM`) survive. |
| `customer.subscription.updated` | Update tier in `subscriptions` table; do **not** prorate token grants — wait for the next invoice. |
| `customer.subscription.deleted` | Mark subscription canceled; leave already-granted tokens to expire at period end. |
| `invoice.payment_failed` | Flag `subscription.status='past_due'`; UI shows banner, no immediate token revoke. |

### Token-grant logic (key detail)

To make "no rollover on subscription tokens, rollover on top-ups" enforceable:
- Use **two reason codes**: `reason='subscription:starter'` etc. and `reason='topup:pack_m'`.
- On monthly renewal, insert a balancing negative `delta` to zero out **only** the prior month's subscription grants (filter by reason prefix), then insert the new positive grant. This keeps the ledger append-only and auditable.

### Idempotency
Every webhook handler must `INSERT … ON CONFLICT (stripe_event_id) DO NOTHING` against a `stripe_events` dedupe table. Stripe will retry; do not let a retry double-grant.

### Migration plan
1. **Phase B-1:** Create `subscriptions`, `stripe_events`, `grant_tokens` RPC. Replace `lib/tokens.ts` body to call `deduct_tokens_atomic` against the live ledger. Keep the same exported function signatures so route files don't change.
2. **Phase B-2:** Wire signup → grant 7 free tokens (`reason='signup_grant'`).
3. **Phase B-3:** Build checkout + webhook routes. Test with Stripe CLI in dev.
4. **Phase B-4:** Build pricing/account UI surfaces (see §7).

---

## 7. UI Surface

### What exists today
- `apps/web/components/render/RetryButton.tsx` — shows balance + free retries available + cost of next retry. Links to a non-existent `/account/tokens` page.
- `apps/web/app/api/admin/render-costs/route.ts` — admin-only cost dashboard JSON. No corresponding admin UI page yet.

### What needs to exist
| Page | Purpose |
|---|---|
| `/pricing` (public) | Tier comparison, CTAs to checkout. |
| `/account/billing` | Current plan, next renewal, manage card (Stripe Portal link), invoice history. |
| `/account/tokens` | Balance, ledger, top-up pack purchase grid. (RetryButton already links here.) |
| Empty-balance modal | Triggered on 402 from render route. Two CTAs: "Upgrade plan" / "Buy top-up". |
| Tier-required upsell | When a free user tries to render after burning the 7 grant tokens. |

### Manus regen notes
Per the FRONTEND_AUDIT (when produced) the entire pricing + account surface is greenfield — no existing components to refactor. Build `/pricing` and `/account/billing` as fresh Manus screens; reuse the existing dashboard navy/gold tokens. The empty-balance modal and the upsell banner should be small enough to hand-author rather than regenerate.

---

## 8. Open Questions (need human decision)

1. **Token grant on signup: 5 or 7?** DB default is 5, prompt directs 7. *Recommend 7* — better trial conversion, ~$1.40 marginal COGS exposure.
2. **Tier token amounts** — recommendation above is **20 / 60 / 180**. If founder wants more aggressive funnel, 25 / 80 / 250 stays above 70% GM at realistic mix; 15 / 45 / 120 maximizes margin but compresses Studio's "power user" appeal.
3. **Top-up pricing anchor** — does the $0.90/token anchor from the prompt apply to the 10-pack only ($9) or all packs? Recommendation: only the small pack; bulk discount the rest.
4. **Refine cost** — currently free in code. Recommendation 1 token. *Alternative: keep free, since refines drive engagement and product unlocks → affiliate revenue.* Founder call.
5. **Product unlock cost** — keep $0 (affiliate-monetized) or charge? Recommendation: **$0**. Charging users to see products they're about to buy is hostile to the affiliate model.
6. **Rollover policy** — confirmed no-rollover on subscription, rollover on top-ups? Or simpler "no rollover at all" to avoid ledger complexity?
7. **Annual plans** — offer 2 months free (annual = 10× monthly)? Industry standard, lifts LTV, no engineering cost beyond a second Stripe price ID.
8. **Trial structure** — 7 free tokens *is* the trial. Confirm we are not also offering a 7-day free Starter trial.
9. **Failed-payment grace period** — how many days `past_due` before we revoke tokens / hide the room library? Stripe's default is 23 days of dunning; recommend matching that.
10. **App Store / TestFlight path** — the iOS shell (M12) will require Apple IAP for subscriptions, which can't share Stripe pricing. Do we restrict iOS to web-purchased tiers (legal under post-2024 Apple guidelines for "reader" apps with external link), or stand up parallel IAP products?

---

## Appendix — File map

| Purpose | Path |
|---|---|
| Token logic (in-memory stub) | `apps/web/lib/tokens.ts` |
| Render config (token costs) | `apps/web/lib/render-config.ts` |
| Empty-room render (charge 5) | `apps/web/app/api/render/empty-room/route.ts` |
| Retry (charge 0 or 2) | `apps/web/app/api/render/retry/route.ts` |
| RetryButton UI | `apps/web/components/render/RetryButton.tsx` |
| Admin cost dashboard | `apps/web/app/api/admin/render-costs/route.ts` |
| Supabase types (canonical) | `apps/web/lib/types/supabase.ts` |
| Token ledger migration | `supabase/migrations/20240002000000_token_transactions.sql` |
| Env stubs (Stripe) | `apps/web/.env.example` lines 51–53 |
| Spec pricing reference | `COVA_MVP_SPEC_v1.1.md:1301` |
| COGS reference | `docs/PRODUCT_STATUS.md:135–143` |
