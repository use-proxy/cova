# P01b §1C.2 — GDPR Export Sync/Queued Integration Test

Documented for § 15 manual gate; not automated due to dependency on a real
authenticated session + variable bytewise zip duration.

## Setup

1. Sign in as a test user with at least 5 rooms + final renders.
2. Capture an authenticated session cookie (e.g., copy from devtools after a
   browser sign-in, or use a long-lived session JWT in dev).
3. Repro environment: `EMAIL_SENDING_ENABLED=false` for the small-user case
   (signed URL returned synchronously, no email assertion needed). Set
   `EMAIL_SENDING_ENABLED=true` and configure RESEND_API_KEY for the
   power-user case to verify the queued-branch email arrives.

## Test 1 — Small user (≤ 5 rooms): expect sync `{ downloadUrl }`

```bash
curl -i -X POST http://localhost:3000/api/users/export \
  -H "Cookie: <session cookie>" \
  -H "Content-Type: application/json"
```

**Expected:**
- Response within < 7 seconds.
- Body: `{ "ok": true, "downloadUrl": "https://...supabase.co/storage/v1/...", "expiresAt": "<ISO date>" }`.
- The signed URL TTL ≈ 7 days from `expiresAt`.
- Download the URL → verify zip contains:
  - `profile.json`, `email.txt`
  - `rooms.json`, `renders.json`, `swipes.json`, `saved-products.json`
  - `images/render-001.jpg` … (actual JPEG/PNG bytes, not URL files).

## Test 2 — Power user (timeout forced): expect `{ status: "queued" }` + email

To force the timeout branch, increase the user's row count past what fits in
7s (or temporarily reduce `SYNC_TIMEOUT_MS` in the route to 100 ms during
test).

```bash
curl -i -X POST http://localhost:3000/api/users/export \
  -H "Cookie: <session cookie>" \
  -H "Content-Type: application/json"
```

**Expected:**
- Response within < 7s timeout window.
- Body: `{ "ok": true, "status": "queued" }`.
- Within ~2 minutes, a Resend email arrives with subject "Your Cova data
  export is ready" and a CTA pointing to the same kind of signed URL.
- The email's signed URL is downloadable → same zip contents as Test 1.

## Test 3 — Cost telemetry (when EMAIL_SENDING_ENABLED=true)

After Test 2, query render_cost_log:

```sql
SELECT category, cost_usd, model, failure_category
FROM render_cost_log
WHERE category = 'auth.email.export'
ORDER BY created_at DESC
LIMIT 5;
```

Expected: a row for the queued-branch email with `cost_usd ≈ 0.0008` and
`failure_category` null.

## Test 4 — Rate limit (1 per 24h per user)

Issue Test 1 twice in succession.

**Expected (second call):**
- HTTP 429.
- `{ "ok": false, "failure_category": "auth.signup.rate_limit", "user_message": "You can request another export in 24 hours.", "detail": "retry-after-..." }`.
