# V3 Empty-Room — Phase A handoff

Written locally only. Nothing deployed yet.

## Files created / modified

**New (no pre-existing file):**

| Path | Purpose |
|---|---|
| `modal_pipeline/empty_room_gemini.py` | Production V3 Modal app (`cova-empty-room-v3`). Occlusion gate → conditional pre-pass → Gemini edit → audit → retry → final response. |
| `supabase/migrations/20260421000000_empty_room_v3_retry_cache.sql` | Additive migration: `render_retries`, `empty_room_cache`, `render_rate_limits`, `render_cost_log`, `prune_expired_empty_room_cache()`. RLS configured. |
| `apps/web/lib/features.ts` | `getRenderPipelineVersion(userId)` — hard-pin → admin list → percentage rollout → default v2. |
| `apps/web/lib/render-config.ts` | All retry/cost/cache constants in one place. |
| `apps/web/lib/tokens.ts` | Stub token balance + `chargeTokens()`. Admins = 999_999, others = 100 in-memory. Marked `// TODO(tokens-schema)`. |
| `apps/web/lib/render/empty-room-v3.ts` | Typed client for the Modal V3 endpoint. |
| `apps/web/app/api/render/retry/route.ts` | Retry API. Enforces free/paid split, hard ceiling, rate limit, token charge, cost log. |
| `apps/web/app/api/render/empty-room/route.ts` | Cache-aware V3 render route. Returns 409 `pipeline_mismatch` if the user is on V2. |
| `apps/web/components/render/RetryButton.tsx` | "Try again" UI with state-specific helper text + confirmation modal for paid retries + optional quality-warning banner. |
| `apps/web/app/api/admin/render-costs/route.ts` | Service-role-gated aggregate stats (cost, retry rate, cache hit rate, pipeline breakdown). |

**Modified:** none. V2 pipeline code was not touched — `apps/web/app/api/render/route.ts` is unchanged.

## Migration SQL (not executed)

Full SQL at `supabase/migrations/20260421000000_empty_room_v3_retry_cache.sql`.

Quick shape:

- `render_retries(user_id, original_render_id UNIQUE, free_retries_used, paid_retries_used, last_retry_at)` — RLS: users SELECT own rows; writes service-role only.
- `empty_room_cache(input_hash UNIQUE, empty_room_url, quality_warning, residual_items, pipeline_path, pipeline_version, cost_usd, expires_at DEFAULT now()+30d)` — service-role only.
- `render_rate_limits(user_id PRIMARY KEY, retries_last_hour, hour_start)` — RLS: users SELECT own rows.
- `render_cost_log(render_id, user_id, pipeline_version, is_retry, retry_type, cost_usd, tokens_charged, cache_hit)` — service-role only.
- `prune_expired_empty_room_cache()` SECURITY DEFINER, GRANT EXECUTE TO `service_role`.

## Modal app file (not deployed)

`modal_pipeline/empty_room_gemini.py` — app name `cova-empty-room-v3`, image Python 3.10 + fal-client + anthropic + requests, secrets `cova-fal-secret` + `cova-anthropic-secret`, single web endpoint `POST /generate_empty_room_v3`.

Expects these Modal secrets to exist (verify before deploy):

- `cova-fal-secret` with `FAL_KEY=…`
- `cova-anthropic-secret` with `ANTHROPIC_API_KEY=…`

If either secret is under a different name on the workspace, update the `SECRETS` list in the module.

## `cova-mask2former-v3` eviction safety check

Grep results for all references in the repo:

```
modal_pipeline/empty_room_v3.py:11:  * ``cova-mask2former-v3`` Modal endpoint
modal_pipeline/empty_room_v3.py:58:    "COVA_MASK2FORMER_V3_URL",
modal_pipeline/empty_room_v3.py:59:    "https://cova-interior--cova-mask2former-v3-mask2formerservice-api.modal.run",
modal_pipeline/mask2former_service.py:3:Modal app: ``cova-mask2former-v3``. A10G. Python 3.11.
modal_pipeline/mask2former_service.py:49:APP_NAME = "cova-mask2former-v3"
modal_pipeline/mask2former_service.py:107:logger = logging.getLogger("cova-mask2former-v3")
```

- `modal_pipeline/empty_room_v3.py` is the deprecated Phase A scaffold (killed 2026-04-21). It is imported **only** by bench scripts under `scripts/` — no production code reaches it.
- `modal_pipeline/mask2former_service.py` is the service file itself — no other code imports it.

**No production code imports from `cova-mask2former-v3`. Safe to stop.**

If you want extra safety, `grep -ri "cova-mask2former-v3\|COVA_MASK2FORMER_V3_URL" apps/web modal_pipeline/redesign*.py modal_pipeline/empty_room.py modal_pipeline/perception.py` returns zero hits outside the two files above.

## Env vars to set (Vercel + local)

| Name | Value | Scope | Notes |
|---|---|---|---|
| `COVA_EMPTY_ROOM_V3_URL` | `https://cova-interior--cova-empty-room-v3-generate-empty-room-v3.modal.run` | server | Placeholder — update with the URL Modal prints after `modal deploy`. |
| `COVA_V3_ROLLOUT_PERCENTAGE` | `0` | server | Keep at 0 for admin-only rollout. Bump only with explicit approval. |
| `ADMIN_TEST_USER_IDS` | see below | server | Comma-separated uuids. |
| `COVA_RENDER_PIPELINE` | *(unset)* | server-only | Set to `v3` or `v2` only for staging / rollback pin. No `NEXT_PUBLIC_` prefix — rollback is env-var-only, no client-bundle rebuild required. |

### `ADMIN_TEST_USER_IDS` candidates from Supabase auth

Three accounts matched a founder email pattern — include whichever ones should get V3 routing. Comma-separated.

| uuid | email | created |
|---|---|---|
| `f39aac20-10bb-410d-8463-58fe2d9213a5` | `goelp@berkeley.edu` | 2026-04-01 |
| `62126d57-42df-405c-a38d-3a621f1fe3a8` | `daksh_parikh@berkeley.edu` | 2026-03-28 |
| `863c7799-accd-42e6-bac2-d4697b111542` | `daksh.parikh11@gmail.com` | 2026-03-19 |

Recommended default: `f39aac20-10bb-410d-8463-58fe2d9213a5,62126d57-42df-405c-a38d-3a621f1fe3a8,863c7799-accd-42e6-bac2-d4697b111542`.

## Deviations from spec

1. **Modal file path.** Per your direction, deployed new app lives at `modal_pipeline/empty_room_gemini.py` (not `modal_pipeline/empty_room_v3/`) because a Python file of the same name already exists from the killed Phase A pipeline and is still imported by bench scripts. Modal app name is still `cova-empty-room-v3`.
2. **Cache control.** Spec said `skip_cache` bypasses cache at the Modal side. Cache lives in the web layer (Supabase), not in Modal — the Modal endpoint does a full generation each call. `skip_cache` is accepted but is a no-op at the Modal side and is instead honored by the web route (`/api/render/retry` always calls with `skip_cache=true` and never reads/writes cache on retries). Kept the parameter in the Modal signature per spec so the API is stable.
3. **Charge ordering.** Spec did not explicitly say when to charge tokens relative to Gemini success. I charge *after* the Modal call returns successfully, to avoid billing the user for provider failures. If you prefer pre-charge-then-refund semantics, flip the order in `retry/route.ts`.
4. **429 responses.** Spec said "return 429 with message". I return 429 with a structured body `{error, code, minutes_until_reset?}` so the UI can render differently per code (`max_paid_retries` vs `rate_limited`). `RetryButton` branches on `code`.
5. **Cache key.** Spec said `SHA256(imageUrl + canonicalPreprocessingParams + pipeline_version)`. Implemented as such, with canonicalization via sorted JSON keys for stability across equivalent param objects.
6. **`render_cost_log` RLS.** Spec said service-role only. Implemented by enabling RLS with no policies — service-role always bypasses RLS, other roles get zero rows. No explicit deny policy needed.

## Test plan (to run during Phase B)

### 0. Pre-deploy sanity

```bash
# TypeScript check (local; CI will also run)
cd apps/web && npx tsc --noEmit

# Python parse check on the Modal file
python3 -c "import ast; ast.parse(open('modal_pipeline/empty_room_gemini.py').read()); print('ok')"
```

### 1. Modal deploy

```bash
# Verify secrets exist
modal secret list | grep -E "cova-fal-secret|cova-anthropic-secret"

# Verify you have the eviction slot: stop cova-mask2former-v3 first
modal app stop cova-mask2former-v3

# Deploy V3
modal deploy modal_pipeline/empty_room_gemini.py

# Note the printed URL and set it as COVA_EMPTY_ROOM_V3_URL
```

### 2. Supabase migration

```bash
# Dry-run by diffing against remote
npx supabase db diff --linked --schema public

# Apply
npx supabase db push --linked

# Verify tables exist
psql "$SUPABASE_DB_URL" -c "\dt public.render_retries public.empty_room_cache public.render_rate_limits public.render_cost_log"
```

### 3. Vercel env vars

Set via CLI or dashboard:

```bash
vercel env add COVA_EMPTY_ROOM_V3_URL production
vercel env add COVA_V3_ROLLOUT_PERCENTAGE production   # value: 0
vercel env add ADMIN_TEST_USER_IDS production     # value: <uuid list>
```

### 4. Verify admin routing

Log in as admin account. Call empty-room render. Confirm response has `pipeline_path: "standard" | "anti_hallucination"` and `cache_hit: false` (first call).

```bash
# Hit the route directly (after getting a session cookie via login)
curl -X POST "$APP_URL/api/render/empty-room" \
  -H "cookie: $SESSION_COOKIE" \
  -H "content-type: application/json" \
  -d '{"image_url":"https://.../room.jpg","render_id":"<uuid>"}'
```

Expected: 200 with `empty_room_url`, `pipeline_path`, `cache_hit:false`, `tokens_charged:5`.

Re-call with the same body → expect `cache_hit:true`, `tokens_charged:0`.

### 5. Verify non-admin still hits V2

As a non-admin user, call `/api/render/empty-room` directly → expect 409 `pipeline_mismatch` (meaning the caller should go through the V2 path at `/api/render`). Then confirm the normal `/api/render` flow (existing V2) works unchanged.

### 6. Free retry path

```bash
# First retry — should be free
curl -X POST "$APP_URL/api/render/retry" \
  -H "cookie: $SESSION_COOKIE" -H "content-type: application/json" \
  -d '{"original_render_id":"<uuid>","image_url":"https://.../room.jpg"}'
```

Expected response:

```json
{
  "empty_room_url": "...",
  "retry_was_free": true,
  "tokens_charged": 0,
  "remaining_free_retries": 0,
  "remaining_paid_retry_slots": 5,
  "remaining_hour_budget": 4
}
```

Verify DB state:

```sql
SELECT free_retries_used, paid_retries_used FROM render_retries
  WHERE original_render_id = '<uuid>';
-- expect: 1, 0

SELECT retries_last_hour FROM render_rate_limits
  WHERE user_id = '<admin uuid>';
-- expect: 1
```

### 7. Paid retry path (confirmation modal)

From UI: click "Try again" a second time. Expect confirmation modal "This retry will cost 2 tokens. You have X tokens remaining."

Confirm → expect response `retry_was_free:false, tokens_charged:2, remaining_paid_retry_slots:4`.

Verify:

```sql
SELECT paid_retries_used FROM render_retries WHERE original_render_id='<uuid>';
-- expect: 1

SELECT retry_type, tokens_charged FROM render_cost_log
  WHERE render_id = '<uuid>' ORDER BY created_at DESC LIMIT 2;
-- expect: ('paid', 2), ('free', 0)
```

### 8. Rate limit at 6th retry in one hour

Fire 6 retry calls in quick succession across different `original_render_id`s. The 6th should return 429 with `code:"rate_limited"` and `minutes_until_reset` > 0. `RetryButton` should render "Retry limit reached, try again in N minutes".

### 9. Hard ceiling at 6th paid retry on one render

Use one `original_render_id`. Burn the 1 free + 5 paid retries. The 7th call should return 429 with `code:"max_paid_retries"` and `error:"Maximum retries reached on this render"`. `RetryButton` should render "Maximum retries reached on this render" and be disabled.

### 10. Insufficient tokens

Temporarily lower `tokens.ts` stub's non-admin balance to 1, log in as non-admin (won't route to V3 without rollout, but the retry route ALSO needs a V3 admin setup — so easier to force via `COVA_RENDER_PIPELINE=v3`). Burn the free retry. Next click should:

- Show "Get more tokens to retry" helper text and disabled button.
- If clicked via direct POST: return 402 `{error:"Insufficient tokens", code:"insufficient_tokens"}`.

### 11. Cost log populated

```sql
SELECT pipeline_version, is_retry, retry_type, cost_usd, tokens_charged, cache_hit
  FROM render_cost_log
  WHERE user_id = '<admin uuid>'
  ORDER BY created_at DESC
  LIMIT 10;
```

Expect: non-null `cost_usd` for every row, `tokens_charged` matching policy, `cache_hit` true only for the re-call in step 4.

### 12. Admin cost dashboard

```bash
curl "$APP_URL/api/admin/render-costs?window=24h" -H "cookie: $ADMIN_COOKIE" | jq
```

Expect JSON with `counts`, `totals_usd`, `averages_usd`, `ratios.retry_rate`, `ratios.cache_hit_rate`, `by_pipeline_version`, `retry_revenue`.

### 13. Rollback drill

```bash
# Emergency pin to V2 — server-only var, no client rebuild needed
vercel env add COVA_RENDER_PIPELINE production   # value: v2
# Redeploy
vercel --prod
```

Confirm admin account now receives V2 responses on `/api/render`.

## Known-not-done (deferred for Phase B discussion)

- Nightly cron that calls `SELECT public.prune_expired_empty_room_cache()` — migration defines the function, but the cron job itself needs to be registered in Supabase (pg_cron or Edge Function schedule).
- Real `user_token_balances` schema — `tokens.ts` stub is wired in and exposes the right signatures; swap is a one-file change.
- Integration of `RetryButton` into the render-result screen — spec said "place persistently in render result screen" but the actual render-result component is in `app/design/step-8a/` (per CLAUDE.md) and integrating there touches non-scoped files. Deferred to an explicit Phase B step.
