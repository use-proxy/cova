# P01b — Executor Prompt (Auth + Legal + Account Deletion)

**You are a fresh Claude Code executor session.** No prior context. Read this prompt end-to-end before doing anything.

**Phase doc (single source of truth):** `cova-plan/phases/P01b-auth-legal-deletion.md` — read it in full before §A1 below. Anything in this prompt that conflicts with the phase doc loses; flag the conflict and halt.

**Working directory:** `/Users/daksh/Desktop/cova/`
**Phase status:** P01a CLOSED (verified by planner 2026-05-03). P01b READY TO START.
**Multi-session phase:** split into **1A backend → 1B UI → 1C integration**. Hand off at 93–94% context utilization; write handoff to `cova-plan/SESSION_HANDOFFS/{NN}-P01b-{1a|1b|1c}-{partial|complete}.md`. Numbering continues from `11-P01b-doc-update.md`.

---

## A. Preamble — context the executor must internalize before touching code

### A.1 Read order (do this first)

1. `cova-plan/phases/P01b-auth-legal-deletion.md` (full — ~900 lines, the canonical spec for this phase).
2. `cova-plan/OPEN_DECISIONS.md` (D-001..D-022 lock + DEF-001..DEF-003).
3. `cova-plan/EMPIRICAL_FINDINGS.md` (P01a baseline — schema state, ESLint enforcement, Sentry sample rates, subagents).
4. `cova-plan/PHASE_STATUS.md` (re-confirm P01a still CLOSED at the moment you start).
5. `apps/web/lib/cost/categories.ts` — you will EXTEND this; do not redeclare.
6. `apps/web/lib/errors/categories.ts` — you will EXTEND this; do not redeclare.
7. `apps/web/lib/paid/call.ts` — `paidCall<T>()` wrapper. Every Resend send must go through it.
8. `apps/web/lib/log/redact.ts` — `redactLogPayload()`. Every log of an object must wrap through it.
9. `apps/web/.eslintrc.json` — `cova-rules/no-direct-paid-fetch` (error) and `cova-rules/no-unsafe-console` (warn) are active.
10. `apps/web/app/api/cron/cost-monitor/route.ts` — the established cron-auth pattern. Mirror it exactly for `/api/cron/purge-deletion-audit`.
11. `apps/web/middleware.ts` — current contents. You modify this in 1A step 9.
12. `supabase/migrations/` — observe naming `YYYYMMDDHHmmss-slug.sql` + paired `_down.sql`.
13. `cova-plan/ui-gen/P01b/` — 9 confirmed pre-built UI artifacts; the 10th (`auth-verify-email-invalid.tsx`) **must exist** before 1B begins. Verify its presence as your first 1B step. If missing → halt with the message `auth-verify-email-invalid.tsx ui-gen artifact missing — generate via Manus then resume`.

### A.2 Hard rules — embed in working memory (verbatim)

#### CLAUDE.md hard rules (1–13)

1. **NEVER use localStorage or sessionStorage.** Auth state uses HTTP-only cookies via `@supabase/ssr`. Any localStorage usage will break auth on page refresh. Use `createBrowserClient` from `@supabase/ssr` in Client Components, `createServerClient` in Server Components and API routes. The previous sessionStorage fingerprint-cookie fallback is fully removed.
2. **ALWAYS dynamic import SplatViewer with `ssr: false`.** (Not relevant in P01b but stays as a guardrail.)
3. **NEVER import `@sparkjsdev/spark` at module level in any page file.** (Not relevant in P01b.)
4. **ALWAYS use `createBrowserClient` from `@supabase/ssr` in Client Components (`'use client'`).** Never import from `@supabase/supabase-js` directly in App Router code.
5. **ALWAYS use `createServerClient` from `@supabase/ssr` in Server Components, API routes, and middleware.** Update session in `middleware.ts` using the `updateSession()` pattern from `@supabase/ssr` docs.
6. **NEVER call CLIP embedding from any client-side code.**
7. **NEVER expose `SUPABASE_SERVICE_ROLE_KEY` in any `NEXT_PUBLIC_` variable.** Service role only in server-side code.
8. **NEVER show internal style codenames to the user.** (Stays as guardrail.)
9. **SparkJS import path is `@sparkjsdev/spark`.** (Not relevant.)
10. **QR capture token must be validated.** (Not relevant.)
11. **NEVER modify `apps/mobile/`.**
12. **NEVER modify Supabase Edge Functions** except the one permitted change in `chat-room` (already done). The new `delete-user-cascade` Edge Function is permitted because it's NEW, not a modification of frozen functions. The existing `delete-account` Edge Function (frozen, V0-era) remains untouched — `delete-user-cascade` is the new function with a distinct name.
13. **The capture flow is HYBRID.** (Not relevant in P01b.)

#### Decision lock (D-001..D-022 — verbatim from `cova-plan/OPEN_DECISIONS.md`)

- **D-001:** One photo per room. Not video, not multiple photos, not 360.
- **D-002:** No catalog scraping. Ever. Product matching via Google Lens (SearchApi.io) only.
- **D-003:** No LoRAs.
- **D-004:** No multi-reference style images.
- **D-005:** No depth-conditioning ControlNet on Stage 5.
- **D-006:** No multi-pass FLUX.1 → FLUX.2 averaging.
- **D-007:** 12-pick quiz count locked.
- **D-008:** Display names only — never expose internal style codenames.
- **D-009:** EXIF strip mandatory on every uploaded image. Server-side via Sharp.
- **D-010:** `redactLogPayload` before every log statement. CI grep enforces. *(P01a swapped for ESLint custom rule — same intent.)*
- **D-011:** Cost telemetry on every paid call. CI grep enforces. *(P01a swapped for `paidCall<T>()` wrapper + ESLint rule — same intent.)*
- **D-012:** `failure_category` populated on every failure path.
- **D-013:** 8 render stages locked. Don't add, merge, or reorder.
- **D-014:** THREE.js stays at 0.155.0.
- **D-015:** `fetch()` only for fal.ai and Anthropic. No SDK adoption. *(P01b adds Resend SDK + Upstash SDK; both wrap through paidCall<T>() / dedicated lib helpers — D-015 is unchanged.)*
- **D-016:** Forced-choice A vs B quiz. Not swipe-or-skip.
- **D-017:** 10 styles taxonomy locked.
- **D-018:** Refine UI is free-form text only.
- **D-019:** Build token infrastructure but DO NOT enforce in V1. `ENFORCE_TOKEN_LIMITS=false`.
- **D-020:** Mood feed dropped from V1 entirely.
- **D-021:** Termly free tier for legal pages. *(See A.4 below — Termly free tier is 1 policy per domain. Cova needs 2. Resolution lives with cloud chat; you accept rendered HTML for both `/terms` and `/privacy` from Daksh per G5.)*
- **D-022:** `render_cost_log.category` is `text` at DB layer; validated as TypeScript union at app layer. Phases extend the union without `ALTER TYPE` migrations.

#### P01b-specific reinforcement (not new rules, just emphasis)

- **No localStorage / sessionStorage** anywhere in auth flow.
- `createBrowserClient` in Client Components; `createServerClient` in Server / API / middleware.
- `SUPABASE_SERVICE_ROLE_KEY` never in `NEXT_PUBLIC_*`.
- D-008 stays as guardrail.
- D-010: every log of an object goes through `redactLogPayload`. ESLint catches misses.
- D-011: every Resend send goes through `paidCall<T>()`. ESLint `no-direct-paid-fetch` catches misses.
- D-012: every error path emits a typed `failure_category` in the `auth.*` namespace.
- D-022: extend `apps/web/lib/cost/categories.ts` union — DO NOT migrate `ALTER TYPE`.
- Rule 11: `apps/mobile/` untouched.
- Rule 12: Edge Functions frozen; new `delete-user-cascade` is permitted because it's NEW, not a modification of existing frozen functions.

### A.3 Drift confirmation before you write any code

Run these checks at session start. Halt and write `cova-plan/drift/P01b-{slug}.md` if any fail:

- `cova-plan/PHASE_STATUS.md` shows P01a CLOSED. Halt if not.
- Supabase MCP `list_tables` returns `feature_flags` and `render_cost_log`; halt if either missing.
- `apps/web/lib/cost/categories.ts`, `apps/web/lib/errors/categories.ts`, `apps/web/lib/paid/call.ts`, `apps/web/lib/log/redact.ts`, `apps/web/.eslintrc.json`, `apps/web/middleware.ts`, `apps/web/app/api/cron/cost-monitor/route.ts` all exist; halt if any missing.
- `_archive/` directory exists at REPO ROOT (not under `apps/web/`). Halt if missing.
- `git status` clean (the only acceptable untracked file at session start is the executor's own work-in-progress).

### A.4 Research findings the executor inherits from the planner

The planner ran research via Context7, EXA, Web Search, and Supabase MCP. You inherit these findings — do not re-research.

1. **Supabase SSR API (current):** `createBrowserClient(url, key)` for Client Components (auto-manages cookies). `createServerClient(url, key, { cookies: { getAll, setAll } })` for Server Components / route handlers / middleware. In Next 14 App Router, `cookies()` from `next/headers` is async — `const cookieStore = await cookies()`. Cookie security flags (`SameSite=Strict`, `Secure`, `HttpOnly`) are set via `cookieOptions: { sameSite: 'strict' }` — `httpOnly` and `secure` default to true on production builds. Publishable/secret key format (`sb_publishable_*`, `sb_secret_*`) is current; the legacy anon-key env-var name `NEXT_PUBLIC_SUPABASE_ANON_KEY` continues to accept the publishable key value (no env-var rename needed).
2. **Resend Node SDK + React Email:** `resend.emails.send({ from, to, subject, react: WelcomeEmail({ ...props }), tags: [{ name, value }] })` — React component passed as **function call**, not JSX. Returns `{ data: { id }, error: null }` on success; `{ data: null, error: { message, name } }` on failure. Tags max 256 chars per name+value, ASCII letters/numbers/underscores/dashes only.
3. **Cloudflare Turnstile siteverify:** `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with body `{ secret, response, remoteip? }`. Returns `{ success, "error-codes": [...], hostname, challenge_ts, action }`. Error codes: `invalid-input-response`, `timeout-or-duplicate`, `internal-error`, etc.
4. **Upstash @upstash/ratelimit:** `new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(N, "1 h"), prefix: "cova" })`. `await ratelimit.limit(identifier)` returns `{ success, limit, remaining, reset, pending }`. The `pending` Promise is for analytics; safe to ignore on Vercel Node runtime, but on Vercel Edge wrap with `waitUntil(pending)`. For per-email silent lockout (option γ), use raw `redis.incr(key)` + `redis.expire(key, 900)` directly — the Ratelimit primitive does not naturally express "5 failures = silent lockout for 15min returning the same string as wrong-password".
5. **zxcvbn-ts (modern fork — preferred over original `zxcvbn`):** `@zxcvbn-ts/core` + `@zxcvbn-ts/language-common` + `@zxcvbn-ts/language-en`. Use `ZxcvbnFactory({ translations, graphs, dictionary })` then `factory.check(password)` → `{ score: 0|1|2|3|4, feedback: { warning, suggestions } }`. **Score ≥ 2 = acceptable** (locked threshold). Bundle: ~30KB gzipped with EN dictionary.
6. **jose (`/panva/jose`):** stable. `SignJWT` + `jwtVerify`. HS256 with `new TextEncoder().encode(secret)`. P01b's only JWT need is the Apple OAuth client_secret JWT, but Supabase Auth dashboard handles regeneration when configured with .p8 key + IDs — no executor code generates this JWT.
7. **Vercel waitUntil — Next.js 14:** `import { waitUntil } from "@vercel/functions"`. Used in route handlers to extend the function isolate's lifetime past the response without delaying the user-visible response. **Use this for forgot-password constant-time pattern, GDPR export queued path, and Resend send fire-and-forget.** (Next 15.1+ replaces this with `import { after } from "next/server"`; we are on 14.2.x — use `@vercel/functions`.)
8. **Anti-enumeration constant-time:** OWASP-blessed pattern. Route returns `{ ok: true }` immediately for both registered and unregistered email; the registered branch's Resend send happens inside `waitUntil()`. Verifier checks ≤ 50ms response-time variance across 20 trials.
9. **Resend transactional subdomain (G4):** `auth@send.covainterior.com` lives on its own SPF/DKIM/DMARC on `send.covainterior.com`. Best practice (2025): isolate transactional from marketing reputation; distinct DKIM keys; gradual DMARC policy (monitor → quarantine → reject). Resend handles SPF/DKIM automatically per added domain. **You do not configure DNS — Daksh confirms verification status before this phase starts.** If `send.covainterior.com` is unverified, halt at boot of any route that sends from `auth@send.covainterior.com`.
10. **auth.users CASCADE chain — verified live via Supabase MCP at planner time:**
    - Direct CASCADE FKs to `auth.users`: `public.users`, `public.rate_limits`, `public.redesign_feedback`, `public.sam_embeddings`, `public.saved_products`.
    - SET NULL: `public.render_cost_log` (preserves cost audit; nulls user_id), `public.interactions`.
    - Through public.users CASCADE: `chat_messages`, `renders`, `rooms`, `style_fingerprints`, `swipe_history`. Transitively `room_products` (via rooms), `render_sessions` (via renders).
    - **Conclusion:** `delete-user-cascade` Edge Function only needs `await supabaseAdmin.auth.admin.deleteUser(user_id)` — the DB layer cascades the rest. No manual table-by-table delete needed.
11. **Termly free tier (DEF-002 resolution):** **Free tier supports only 1 policy per domain.** Cova needs 2 (ToS + Privacy). Daksh's resolution: either upgrade to Starter $10/mo or hand-write second policy. **You receive rendered HTML for both `/terms` and `/privacy` from Daksh via G5 — you do not generate them.** If Daksh has not delivered HTML for both, halt 1A step 8 (legal pages wiring) until he does.
12. **Apple Sign In Supabase (G8):** Service ID + Team ID + Key ID + .p8 signing key. JWT client_secret max 6mo validity, Supabase Auth handles regeneration. **G8a + G8b two-step gate:** Apple Developer Program membership active (G8a) AND Supabase provider configured in dashboard (G8b). Default `auth_apple_oauth` flag: `false` unless Daksh confirms both — flag value is your runtime gate; UI checks the flag and conditionally renders the Apple button.
13. **pg_cron is installed but unused — `/api/cron/purge-deletion-audit` runs as Vercel Cron** via `vercel.json` schedule, not pg_cron.

### A.5 New env vars introduced this phase (document in `apps/web/.env.example` if present)

```
RESEND_API_KEY                    # server-only
TURNSTILE_SECRET_KEY              # server-only
NEXT_PUBLIC_TURNSTILE_SITE_KEY    # client-allowed (public site key)
UPSTASH_REDIS_REST_URL            # server-only
UPSTASH_REDIS_REST_TOKEN          # server-only
CRON_SECRET                       # server-only (already in P01a; reuse same secret)
```

Halt at boot of any route that needs an env var that's missing.

---

## B. Step 0 — V0 demolition (FIRST executable step in 1A)

Before any new auth file lands:

1. **Confirm `_archive/` exists at REPO ROOT** (not `apps/web/_archive/`). It does — created by P01a. If absent → halt.
2. Run `git mv apps/web/app/auth/ _archive/web/app/auth/`. This is destructive against `apps/web/app/auth/` but reversible via `git mv` back. Mirrors P01a's M2 demolition pattern. Commit immediately:
   ```
   git commit -m "chore(P01b): demolish V0 auth surface to _archive/web/app/auth/ before luxury auth ships"
   ```
3. Create `_archive/web/app/auth/README.md` with this exact content:
   ```markdown
   # _archive/web/app/auth — V0 auth surface (deprecated)

   The V0 plain email/password + Google OAuth auth surface that lived at `apps/web/app/auth/` was archived here when the luxury auth flow shipped in Phase 1B (P01b).

   Reference: `cova-plan/phases/P01b-auth-legal-deletion.md` § 6 (1A → "V0 demolition is the first step of M2 implementation"). Archive trigger: prevents `/auth/callback` path collision between V0 and the new spec's callback at the same path.

   Do not import from this directory. The new auth surface lives at `apps/web/app/auth/` (signup, signin, forgot-password, reset-password, verify-email-{sent,success,invalid}, callback) and `apps/web/app/{terms,privacy,account-deleted}/`.
   ```
4. Recreate `apps/web/app/auth/page.tsx` as a **redirect-to-signin server component**:
   ```tsx
   import { redirect } from "next/navigation";

   export default function AuthRoot() {
     redirect("/auth/signin");
   }
   ```
5. Commit:
   ```
   git commit -m "feat(P01b/M2): /auth root redirects to /auth/signin (post-demolition recreation)"
   ```

Steps 2 + 5 are two separate commits — preserves V0 history cleanly.

---

## C. Step 1 — Subphase 1A backend (in dependency order)

Each numbered item below is a discrete commit. Test after each. Use `npm --workspace apps/web run typecheck` and `npm --workspace apps/web run lint` to validate before committing.

### 1A.1 Migration: `account_deletions` table + paired `_down.sql`

Create `supabase/migrations/{ts}-account-deletions-table.sql` with the DDL from §10 of the phase doc. **Use `audit_retention_days` (NOT `retention_period_days`).** Pair with `{ts}-account-deletions-table_down.sql` containing `DROP TABLE IF EXISTS account_deletions;`. Generate `{ts}` as `YYYYMMDDHHmmss` matching the convention in `supabase/migrations/`. Apply via `mcp__supabase__apply_migration` — DO NOT execute raw `mcp__supabase__execute_sql` for DDL.

After apply, invoke the **schema-reviewer subagent** on the migration: it checks idempotency, paired down, RLS-enabled-no-policies pattern, and naming. PARTIAL/FAIL exits 1 — block your own progress and remediate.

### 1A.2 Edge Function: `supabase/functions/delete-user-cascade/index.ts`

NEW Edge Function (Rule 12 permits NEW functions). Idempotent. Auth via service-role JWT on `Authorization` header (passed by API route — see 1A.8). Steps:

1. Verify caller's session: anon-client `auth.getUser()` with the Bearer token from the calling request.
2. Compute `hashed_user_id` = `sha256(user.id)` (hex, 64 chars).
3. Insert `account_deletions` row with `hashed_user_id`, `deletion_reason='user_initiated'`, `audit_retention_days=30`. **Insert this BEFORE the auth.users delete** so we have audit even if delete fails partway.
4. Call `supabaseAdmin.auth.admin.deleteUser(user.id)` — DB CASCADE chain handles app-table cleanup automatically (verified by planner; see A.4 #10).
5. Return `{ ok: true }`. On failure, return `{ ok: false, failure_category: 'auth.delete.cascade_fail', user_message, detail }` with status 500. Idempotency: if `auth.admin.deleteUser` returns "user not found", treat as success (already deleted).

Deploy via Supabase dashboard / CLI — **do not** run any migration apply. Do not modify any other Edge Function (Rule 12).

### 1A.3 Upstash client + rate-limit helper at `apps/web/lib/rate-limit/upstash.ts`

Create `Redis` instance from env. Export:

- `RATE_LIMITS` map (per-route table from phase doc §6 1A and §9):
  - `/api/auth/signup`: 3/hr/IP — Ratelimit.slidingWindow(3, "1 h")
  - `/api/auth/signin`: 20/hr/IP — Ratelimit.slidingWindow(20, "1 h"). Plus per-email silent lockout (see below).
  - `/api/auth/forgot-password`: 5/hr/IP — Ratelimit.slidingWindow(5, "1 h"). Plus 60s per-email cooldown.
  - `/api/auth/reset-password`: 10/hr/IP — Ratelimit.slidingWindow(10, "1 h").
  - `/api/auth/resend-verification`: 5/hr/IP. Plus 60s per-email cooldown.
  - `/api/auth/delete-account`: 1 attempt per user with 1h Upstash lockout on failure.
  - `/api/users/export`: 1 per 24h per user — Ratelimit.slidingWindow(1, "24 h").
  - `/api/auth/sign-out`: no limit.
- `checkPerIp(route, ip): Promise<{ ok: boolean, retryAfterSec?: number }>` — wrapper using the Ratelimit primitive.
- `checkPerEmailCooldown(route, email, cooldownSec): Promise<{ ok, retryAfterSec? }>` — uses raw `redis.set(key, '1', { nx: true, ex: cooldownSec })`. Returns `ok=false` if NX failed.
- `incrSigninLockout(email): Promise<{ count: number, lockedUntilTs?: number }>` — `redis.incr('lockout:signin:' + email.toLowerCase())` + `redis.expire(..., 900)` on first increment. At count ≥ 5, lockout returns its expiry timestamp.
- `clearSigninLockout(email): Promise<void>` — called on successful signin.
- All keys prefixed with `cova:p01b:` — collision-safe.

Halt at boot if `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is missing.

### 1A.4 Cost categories extension at `apps/web/lib/cost/categories.ts`

The current contents are (from planner read at session start):

```ts
// D-022: render_cost_log.category is text at the DB layer.
// This TypeScript union is the app-layer source of truth.
// Phases extend this union without ALTER TYPE migrations.

export type CostCategory =
  | "render"
  | "refine"
  | "quiz_descriptor"
  | "hard_room_classify"
  | "art_composite"
  | "art_generate"
  | "smart_tech_recommend"
  | "lighting_recommend"
  | "lens_query"
  | "clip_rerank"
  | "verifier"
  | "verifier_light"
  | "moderation_nsfw"
  | "moderation_borderline"
  | "moderation_csam";

export const ALL_COST_CATEGORIES: ReadonlyArray<CostCategory> = [ /* same list */ ] as const;
```

**Extend** (do not redeclare). Append four new union members and four new array entries:
- `"auth.email.verification"`
- `"auth.email.reset"`
- `"auth.email.export"`
- `"auth.email.deletion_confirmation"`

Note the dotted-namespace style mirrors phase doc §6 1A (T15). Both the union and the array are kept in sync.

### 1A.5 Cost rates at `apps/web/lib/cost/rates.ts` (new file)

```ts
export const RESEND_BLENDED_RATE_USD = 0.0008;
```

Refined post-launch in `EMPIRICAL_FINDINGS.md` after first-month actuals. No other rates added in P01b. If the file already exists from P01a (verify before writing — P01a did NOT create it per planner read), append the constant and re-export existing values unchanged.

### 1A.6 AuthFailure union extension at `apps/web/lib/errors/categories.ts`

Current contents (verbatim from planner read):

```ts
// Dotted-namespace failure_category. Each phase owns its prefix.
// P01a owns: cost.*, infra.*, subagent.*, capture.* (preprocess only — full
// capture stage names land in Phase 3).

export type CostFailure = /* … */ ;
export type InfraFailure = /* … */ ;
export type SubagentFailure = /* … */ ;
export type CaptureFailurePreprocess = /* … */ ;

export type FailureCategory =
  | CostFailure
  | InfraFailure
  | SubagentFailure
  | CaptureFailurePreprocess;
// Phase 1B will extend with AuthFailure; Phase 2 with QuizFailure; etc.
```

**Extend** by:
1. Importing existing slices unchanged.
2. Adding the full `AuthFailure` union from phase doc §11 (verbatim — 21 entries including the two new ones below).
3. Redefining `FailureCategory = CostFailure | InfraFailure | SubagentFailure | CaptureFailurePreprocess | AuthFailure`.

The full AuthFailure union (must match phase doc §11 exactly):

```ts
export type AuthFailure =
  | 'auth.signup.email_taken'
  | 'auth.signup.password_weak'
  | 'auth.signup.turnstile_fail'
  | 'auth.signup.rate_limit'
  | 'auth.signup.resend_send_fail'
  | 'auth.signin.invalid_credentials'
  | 'auth.signin.account_locked'
  | 'auth.oauth.provider_error'
  | 'auth.oauth.email_mismatch'
  | 'auth.forgot.send_fail'
  | 'auth.reset.token_expired'
  | 'auth.reset.token_used'
  | 'auth.reset.password_weak'
  | 'auth.verify.token_expired'
  | 'auth.verify.token_used'
  | 'auth.delete.confirm_mismatch'
  | 'auth.delete.cascade_fail'
  | 'auth.export.zip_fail'
  | 'auth.session.expired'
  | 'auth.signin.silent_lockout'
  | 'auth.oauth.email_exists';
```

DO NOT redeclare from scratch — that would silently drop other phases' slices when later phases extend.

### 1A.7 Resend client wrapper + 4 React Email templates

- Create `apps/web/lib/email/resend.ts`:
  - `sendAuthEmail({ to, subject, react, costCategory, tags? })` wraps `paidCall<{ data?: { id: string }, error?: ... }>` so D-011 is structurally enforced.
  - `from` is hardcoded to `'Cova <auth@send.covainterior.com>'` — halt at boot if `send.covainterior.com` Resend domain status query fails.
  - Cost telemetry: `costCategory` is one of the four new `auth.email.*` values; cost is `RESEND_BLENDED_RATE_USD`.
  - On Resend error: return failure category mapped (`auth.signup.resend_send_fail`, `auth.forgot.send_fail`, etc.); never expose the Resend error message to the user.
- Create `apps/web/emails/` (or wherever the project's React Email convention lives — verify there's no existing pattern; if not, create):
  - `signup-verify.tsx` — uses Cova design language (navy bg, ivory text, gold accents, italic serif headline, uppercase tracked microtype).
  - `forgot-password.tsx` — same visual language.
  - `gdpr-export-ready.tsx` — same; CTA "DOWNLOAD YOUR DATA" linking to signed URL.
  - `deletion-confirmation.tsx` — same; copy "Your Cova account has been deleted." (per phase doc §6 1A — sent post-deletion).

### 1A.8 API routes — implement in this order

For each route, mirror the failure-handling table in §F of this prompt (which is the verbatim §11 recovery table from the phase doc). Every error path emits a typed `failure_category` envelope: `{ ok: false, failure_category, user_message, detail? }`. Use `createServerClient` from `@supabase/ssr` for session reads; service-role admin client (`@supabase/supabase-js` `createClient` with service-role key) only for `auth.admin.*` ops + Edge Function invocation.

**Order:**

1. `apps/web/app/api/auth/signup/route.ts` — Body `{ email, password, turnstileToken }`. Validate via Zod. Call Turnstile siteverify (see A.4 #3). Call zxcvbn-ts; reject score < 2. Call `supabase.auth.signUp({ email, password })`. On success → `sendAuthEmail` with `signup-verify.tsx`. Rate-limit 3/hr/IP via `checkPerIp`. PostHog `auth.signup.attempt` + `auth.signup.success` events.
2. `apps/web/app/api/auth/signin/route.ts` — Body `{ email, password }`. Check `incrSigninLockout` first; if count ≥ 5, return `{ ok: false, failure_category: 'auth.signin.invalid_credentials' }` to user (silent lockout option γ); internal log emits `auth.signin.silent_lockout`. Call `supabase.auth.signInWithPassword`. On success: `clearSigninLockout`, set session cookie via createServerClient. Rate-limit 20/hr/IP.
3. `apps/web/app/auth/callback/route.ts` — OAuth callback (NOT under `/api/`). Exchange code via `supabase.auth.exchangeCodeForSession`. **On provider error → `redirect('/auth/signin?error=oauth')`.** On success → check email existence collision (B-12a identity-merge logic): if existing email/password account is unverified, allow OAuth merge (verify flag flips); if verified, return `auth.oauth.email_exists` → toast on signin.
4. `apps/web/app/api/auth/forgot-password/route.ts` — Body `{ email }`. **Always** return `{ ok: true }` with identical body & timing for both branches. Lookup user via service-role `admin.getUserByEmail` (or equivalent) — if found, kick off Resend send + Supabase `resetPasswordForEmail` inside `waitUntil(...)`. If unfound, do nothing inside `waitUntil()`. Per-email 60s cooldown. Per-IP 5/hr.
5. `apps/web/app/api/auth/reset-password/route.ts` — Body `{ token, newPassword }`. zxcvbn ≥ 2. Call Supabase token-bound update. Rate-limit 10/hr/IP.
6. `apps/web/app/api/auth/resend-verification/route.ts` — Body `{ email }`. 60s per-email cooldown + 5/hr/IP. Re-issues verification token via Supabase admin API + Resend send.
7. `apps/web/app/api/auth/sign-out/route.ts` — Body `{}`. Calls `supabase.auth.signOut()` server-side; client subsequently calls `posthog.reset()` (UI step). Returns `{ ok: true, redirectTo: '/' }`.
8. `apps/web/app/api/auth/delete-account/route.ts` — Body `{ confirmText: 'DELETE', confirmEmail }`. Validate `confirmText === 'DELETE'` and `confirmEmail === user.email`. Invoke `delete-user-cascade` via `supabaseAdmin.functions.invoke('delete-user-cascade')`. Returns `{ ok: true, redirectTo: '/account-deleted' }`. Rate-limit: 1 attempt per user; 1h Upstash lockout on failure.
9. `apps/web/app/api/users/export/route.ts` — Sync-with-`waitUntil()`-fallback per phase doc §9. 7-second internal timeout. Zip contents per phase doc §6 1A — pack actual image bytes from Cloudflare Images / R2 (download via existing infra), final renders only. Sync branch returns `{ ok, downloadUrl, expiresAt }` (Cloudflare Images signed URL, 7-day TTL); queued branch returns `{ ok, status: 'queued' }` and Resend-emails the URL when ready. Rate-limit: 1 per 24h per user.
10. `apps/web/app/api/cron/purge-deletion-audit/route.ts` — **Mirror exactly** the auth pattern from `apps/web/app/api/cron/cost-monitor/route.ts`:
    - `Authorization: Bearer ${CRON_SECRET}` header check; 401 on mismatch.
    - Halt at boot (`if (!process.env.CRON_SECRET)`) — return 401 with `failure_category: 'auth.delete.cascade_fail'` (closest match) and detail `cron-secret-missing`.
    - Body: `DELETE FROM account_deletions WHERE deleted_at + (audit_retention_days * interval '1 day') < now()`.
    - Schedule via `vercel.json` cron entry — daily at 03:00 UTC.

### 1A.9 `apps/web/middleware.ts` — modifications

The current middleware does session refresh + protected-route redirects. Add:

- **Rate-limit insertion before session refresh:** for any `/api/auth/*` and `/api/users/export` route, call the per-IP check from `lib/rate-limit/upstash.ts`. On 429, return early with `{ ok: false, failure_category: 'auth.signup.rate_limit', user_message, detail }`. Per-email and per-user limits enforced inside the route handlers (not middleware) since middleware doesn't have parsed body.
- **Add `/auth/callback`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email-sent`, `/auth/verify-email-success`, `/auth/verify-email-invalid`, `/account-deleted`, `/terms`, `/privacy`** as public-page routes (do not redirect to /auth on them).
- **Add `/api/auth/signup`, `/api/auth/signin`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/resend-verification`, `/api/auth/sign-out`** to PUBLIC_API_ROUTES (they bootstrap the session). `/api/auth/delete-account` and `/api/users/export` stay protected (require authenticated session). `/api/cron/purge-deletion-audit` is bearer-token-authenticated, NOT session-authenticated — add to PUBLIC_API_ROUTES.
- Keep the existing `/auth/callback` exemption from PROTECTED_PAGE_ROUTES.

### 1A.10 .env.local additions documented

Append to `apps/web/.env.example` (or create if absent — verify first) the env-var block from §A.5 of this prompt. Halt-at-boot guards in each route + `lib/rate-limit/upstash.ts` + `lib/email/resend.ts` enforce presence.

### 1A close

Run:
```
npm --workspace apps/web run typecheck
npm --workspace apps/web run lint
npm --workspace apps/web run build
```

All must exit 0 (warnings on `cova-rules/no-unsafe-console` are acceptable per P01a baseline; `no-direct-paid-fetch` errors must be 0). Commit with message `feat(P01b/M2-1A): auth backend (routes + Edge Function + migration + helpers)`.

If you hit 93–94% context here, write `cova-plan/SESSION_HANDOFFS/12-P01b-1a-partial.md` (or appropriate sequential number) capturing the exact route or commit you stopped at and the next step. Then stop.

---

## D. Step 2 — Subphase 1B UI

### 1B.0 Verify ui-gen artifact presence (FIRST step)

```
ls cova-plan/ui-gen/P01b/auth-verify-email-invalid.tsx
```

If missing → halt with the message `auth-verify-email-invalid.tsx ui-gen artifact missing — generate via Manus then resume`. Do not proceed to 1B.1.

### 1B.1 Wordmark component at `apps/web/components/brand/Wordmark.tsx`

Spec from phase doc §6 1B. Single source of truth for COVA wordmark — reused by all 10 P01b screens, Phase 9 dashboard, Phase 10 landing redesign. Props:
- `align?: "left" | "center"` — default "left". Left = fixed top-left absolute. Center = in-flow.
- Renders "COVA" wordmark in uppercase tracked microtype (`tracking-[0.4em]`) with gold em-dash beneath at 50% opacity.
- Mobile: shrinks `tracking-[0.4em]` from 16px → 14px on viewports < 400px. Never rotates to top-center.

### 1B.2 Toast component at `apps/web/components/ui/Toast.tsx`

Spec from phase doc §6 1B. Used from this phase forward across the app:
- Full-width banner inside the form column (NOT viewport-wide).
- Mounts: 4px slide-down from top + 200ms opacity fade.
- Background `#A8443B` at 8% opacity. Text: italic serif, ivory `#F5F0E8`.
- Auto-dismiss after 5s. Manual dismiss via "DISMISS" close-X (uppercase tracked microtype, gold).
- Reduced-motion: instant render, no slide.
- ARIA: `role="alert"`, `aria-live="polite"`.

### 1B.3 Wire 9 ui-gen artifacts → app routes

Map (from phase doc §6 1B "The 10 screens" table):

| Artifact | Destination |
|---|---|
| `cova-plan/ui-gen/P01b/auth-signup.tsx` | `apps/web/app/auth/signup/page.tsx` |
| `cova-plan/ui-gen/P01b/auth-signin.tsx` | `apps/web/app/auth/signin/page.tsx` |
| `cova-plan/ui-gen/P01b/auth-forgot-password.tsx` | `apps/web/app/auth/forgot-password/page.tsx` |
| `cova-plan/ui-gen/P01b/auth-reset-password.tsx` | `apps/web/app/auth/reset-password/page.tsx` |
| `cova-plan/ui-gen/P01b/auth-verify-email-sent.tsx` | `apps/web/app/auth/verify-email-sent/page.tsx` |
| `cova-plan/ui-gen/P01b/auth-verify-email-success.tsx` | `apps/web/app/auth/verify-email-success/page.tsx` |
| `cova-plan/ui-gen/P01b/auth-verify-email-invalid.tsx` | `apps/web/app/auth/verify-email-invalid/page.tsx` |
| `cova-plan/ui-gen/P01b/account-deleted.tsx` | `apps/web/app/account-deleted/page.tsx` |
| `cova-plan/ui-gen/P01b/legal-page.tsx` | shared — instantiated at `apps/web/app/terms/page.tsx` and `apps/web/app/privacy/page.tsx` (different `documentType` prop + Termly HTML) |

For each:
- Use `Wordmark` and `Toast` from §1B.1/1B.2 — **never inline**.
- Wire form submit handlers to the 1A backend routes via fetch.
- Apply locked copy strings from phase doc §6 1B "Locked copy strings".
- Apply locked footer-link table from phase doc §6 1B.
- Apply mobile form-column scaling formula `width: min(360px, calc(100vw - 32px))` (Tailwind `w-[min(360px,calc(100vw-32px))]`).
- Loading state pattern α — italic-serif label change, no spinner; per-screen labels per phase doc.
- Reset-password 4-state machine: VALIDATING (300ms shimmer min) → VALID|INVALID-expired|INVALID-used (200ms ease-out crossfade) → SUBMITTED (2s auto-redirect to /auth/signin).
- Forgot-password PRE→POST: same-route 200ms ease-out crossfade. URL stays `/auth/forgot-password`.
- Reduced-motion: mount fades + crossfades replaced with instant render. Auto-redirect timers unchanged regardless.

### 1B.4 OAuth-error toast on /auth/signin

Page consumes `?error=oauth` query param on mount → renders Toast with copy "Couldn't sign in with Google. Try email instead." (locked from phase doc §11).

### 1B.5 Apple OAuth conditional render

Read the `auth_apple_oauth` feature flag at server-component time. If `true`, render the Apple button on /auth/signup and /auth/signin alongside the Google button. If `false`, only Google. The flag's row is seeded in 1C.3.

### 1B close

Run typecheck + lint + build. Commit with message `feat(P01b/M2-1B): auth UI screens (10 routes + Wordmark + Toast)`.

If at 93–94% context, write `cova-plan/SESSION_HANDOFFS/{NN}-P01b-1b-partial.md` and stop.

---

## E. Step 3 — Subphase 1C integration

### 1C.1 Wire account-deletion flow

The account-deletion modal lives in Phase 9 (dashboard settings). P01b ships the API route + Edge Function only. Manual click-script (§15 step 22-26) tests via Postman/curl — no UI in P01b. Verify the Edge Function is deployed to Supabase and reachable. Verify a test deletion: rooms, renders, swipes cascade; `account_deletions` row written with `hashed_user_id` only (no email, no other PII).

### 1C.2 GDPR export sync/queued integration test

Add a quick smoke test (TypeScript file under `apps/web/tests/integration/` if a tests dir exists; otherwise skip and document for §15 manual). Two fixtures:
- "Small user" (5 rooms) → expect sync `{ downloadUrl }` response, response time < 7s.
- "Power user" forced timeout (mock the zip step to delay 8s) → expect `{ status: 'queued' }` response, then verify Resend email arrives.

### 1C.3 Seed `feature_flags` rows

Insert via service-role admin client (one-time script at `apps/web/scripts/seed-p01b-flags.ts`, gitignored or kept):

```sql
INSERT INTO feature_flags (key, enabled, percent_rollout, environment, description)
VALUES
  ('auth_apple_oauth', false, 0, 'all', 'P01b — Apple Sign In gate (G8a + G8b). Default false; flip true only when Apple Developer Program membership active AND Supabase provider configured.'),
  ('email_verification_required', true, 100, 'all', 'P01b — block signup completion until email verified. Email/password path only; OAuth bypasses.')
ON CONFLICT (key) DO NOTHING;
```

Apply via `mcp__supabase__execute_sql`. Verify both rows present afterward.

### 1C.4 Frontend Visionary subagent — 10 invocations

For each of the 10 screens (listed in §1B.3 + the 9th legal page reused at /terms and /privacy), invoke `frontend-visionary` (claude-sonnet-4-6 per kickoff notes) with:
- The screen's route + file path.
- Reference to design-language lock (phase doc §6 1B).
- Required check matrix: design-system tokens, layout invariants, contrast (WCAG AA), focus order, ARIA, touch targets, D-008 (no internal style codenames).

Capture each report at `cova-plan/frontend-visionary-reports/P01b/{screen-slug}.md`.

### 1C.5 schema-reviewer subagent — `account_deletions` migration

Already invoked in 1A.1 if the executor followed sequence. If not yet, invoke now. PASS exits 0; PARTIAL/FAIL blocks close.

### 1C close

Run typecheck + lint + build + any unit tests. All exit 0.

Write `cova-plan/SESSION_HANDOFFS/{NN}-P01b-1c-complete.md` capturing what shipped, any open issues, and pointer to verifier protocol next step.

Commit: `feat(P01b/M2-1C): integration — feature flag seed + Frontend Visionary × 10 + schema-reviewer pass`.

---

## F. Failure handling per route — recovery table (verbatim from phase doc §11)

| Category | Recovery |
|---|---|
| `auth.signup.turnstile_fail` | Re-render Turnstile, retry |
| `auth.signup.rate_limit` | Show "Try again in X minutes" with countdown |
| `auth.signup.resend_send_fail` | Mark user as unverified-pending, retry email send via cron |
| `auth.oauth.provider_error` | Show generic "Couldn't sign in with Google. Try email instead." |
| `auth.delete.cascade_fail` | Email Daksh + retry once + alert PostHog |
| Network / Sentry / DB transient | Toast "Couldn't reach our servers. Please try again." (5s auto-dismiss) |
| `auth.signin.silent_lockout` | Internal log only. User-facing response is `auth.signin.invalid_credentials` (silent — preserves anti-enumeration per option γ). |
| `auth.oauth.email_exists` | Toast on /auth/signin: "An account already exists for that email. Sign in with your password instead." |
| `auth.forgot.send_fail` | Captured to Sentry only; user-visible response is identical to success branch (anti-enumeration via `waitUntil()`). |

Every route enumerates its possible failure categories in inline JSDoc above the handler. Verifier session 2 spot-checks.

---

## G. Test commands (run at end of each subphase)

```bash
# from repo root
npm --workspace apps/web run typecheck
npm --workspace apps/web run lint
npm --workspace apps/web run build
npm --workspace apps/web test  # if jest config exists
```

Acceptance:
- typecheck: 0 errors.
- lint: 0 `cova-rules/no-direct-paid-fetch` errors. Existing 199 `cova-rules/no-unsafe-console` warnings are P01a baseline — do NOT introduce more.
- build: exit 0.
- tests: any new tests pass; existing failures (16 quiz-flow mock-debt + env-gated integration) are P01a baseline — do NOT introduce new failures.

---

## H. Stopping rule (this executor session)

At 93–94% context utilization:
1. Stop mid-step (commit any safe partial work).
2. Write `cova-plan/SESSION_HANDOFFS/{NN}-P01b-{1a|1b|1c}-partial.md` with:
   - Last commit SHA.
   - Last completed task ID + the next task ID.
   - Exact file/line cursor where work paused.
   - Any environment side-effects (running processes, dirty schema state, partial commits).
   - The next executor session's first instruction (truncated from this prompt to the resume point).
3. Stop. Do not push to remote — hand off to the next session.

---

## I. Hard rule reminders (one-line nags during work)

- `'use client'` files → only `createBrowserClient` from `@supabase/ssr`.
- Server / API / middleware → only `createServerClient` from `@supabase/ssr`.
- Service role key NEVER in `NEXT_PUBLIC_*`.
- Every Resend send → `paidCall<>()` wrapper (D-011, ESLint enforced).
- Every log of an object → `redactLogPayload()` (D-010, ESLint enforced).
- Every error path → typed `failure_category` in `auth.*` namespace (D-012).
- `apps/mobile/` untouched (Rule 11).
- Existing Edge Functions untouched; new `delete-user-cascade` is the only Edge Function added (Rule 12).
- D-022: extend the cost-category union; do not `ALTER TYPE`.
- D-008 (style codenames) — guardrail; not active in P01b but still enforced by ESLint.

---

## J. §13 acceptance-criteria checklist (verbatim from phase doc — self-check before declaring 1C complete)

| Criterion | Verifier check |
|---|---|
| P01a is CLOSED | `cova-plan/PHASE_STATUS.md` shows P01a CLOSED |
| Pre-built UI components imported correctly | `apps/web/app/auth/*/page.tsx` (and `app/{terms,privacy,account-deleted}/page.tsx`) imports from `cova-plan/ui-gen/P01b/*` (or files copied to `apps/web/components/auth/*` with normalized paths). Verifier confirms each of the 9 screens renders with the locked design language: COVA wordmark fixed top-left, navy ground, italic serif headlines, uppercase tracked microtype, sharp corners (0px radius), no shadows, no particles, no ambient glow |
| 9 screens functional | Each route renders without error; form submission paths work |
| Turnstile + rate limit | Trigger 4 signups in 1 hour from same IP; 4th returns 429 |
| /terms + /privacy live | URLs return 200 with non-empty content; FTC disclosure present; processor list present |
| Account-deletion cascade | Test user deletion: rooms, renders, swipes all cascade; `account_deletions` row written with `hashed_user_id` only (no email or other PII) |
| GDPR export | POST `/api/users/export` returns signed URL; downloaded zip contains expected JSON files; signed URL TTL is 24h |
| `auth.*` failure categories present | `lib/errors/categories.ts` exports `AuthFailure` dotted union; every auth route's error path emits an `auth.*` category |
| Auth feature flags seeded | `feature_flags` table contains rows for `auth_apple_oauth`, `email_verification_required` with correct defaults |
| Anti-enumeration on forgot-password | Same response for registered + unregistered email |
| Token invalidation | Reset and verify tokens single-use; second use returns "token used/expired" |
| Session cookie flags | `SameSite=Strict`, `Secure`, `HttpOnly` |
| Demolition ran | `apps/web/app/auth/` contains only files in the new spec; V0 surface lives at `_archive/web/app/auth/` with README; `_archive/` is at repo root |
| /auth root redirect | GET /auth returns 307 to /auth/signin |
| OAuth callback path | Callback at `/auth/callback`, NOT `/api/auth/oauth-callback` |
| Toast component reused | All 6 form screens render network errors via `apps/web/components/ui/Toast.tsx`, not bespoke per-screen |
| Wordmark component reused | All 10 screens render the wordmark via `apps/web/components/brand/Wordmark.tsx` |
| Loading state α | All 6 form screens implement italic-serif label change with locked label strings |
| /auth/verify-email-invalid | Both `?reason=expired` and `?reason=used` substates render correct copy + correct CTA |
| Account lockout silent | After 5 failed signins, the 6th signin returns `auth.signin.invalid_credentials` to user; internal log emits `auth.signin.silent_lockout` |
| Constant-time forgot-password | Response time variance between registered + unregistered email ≤ 50ms across 20 trials |
| GDPR export sync/queued | Small-user fixture returns `{downloadUrl}`; power-user fixture (forced timeout) returns `{status: 'queued'}` and Resend email arrives within 5min |
| GDPR export contains bytes | Downloaded zip's `images/` folder contains actual JPEG/PNG bytes, not URL files |
| Resend cost telemetry | Every Resend send writes a `render_cost_log` row with `category` in `auth.email.*` namespace and `provider='resend'` |
| FailureCategory union extension | TypeScript-level assertion: every P01a-owned slice still resolves; full AuthFailure union including silent_lockout + email_exists is part of the umbrella |
| Cron auth | /api/cron/purge-deletion-audit returns 401 without Bearer CRON_SECRET; returns 200 with it; halts at boot if env missing |
| audit_retention_days field | account_deletions DDL uses the new column name; old name (retention_period_days) absent everywhere |

You self-check this list before writing the 1C-complete handoff. If any criterion is FAIL, do not declare complete — either remediate (preferred) or write a "partial-with-known-gaps" handoff and stop.

---

## End of executor prompt

Read this prompt + the phase doc + the four planner reads (PHASE_STATUS, OPEN_DECISIONS, EMPIRICAL_FINDINGS, kickoff-notes) before you write code. Drift first. Demolition first. Backend → UI → Integration. Hand off cleanly. Verifier comes next, in fresh sessions, twice.

Good luck.
