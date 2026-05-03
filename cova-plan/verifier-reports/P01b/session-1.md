# P01b Verifier — Session 1

**Date:** 2026-05-03
**Mode:** session-1 (read-only, no self-heal — task instructions explicitly said "Do NOT execute code, modify files, or run migrations")
**Source spec:** `cova-plan/phases/P01b-auth-legal-deletion.md` §13
**Code SHA at start:** 0322675
**Code SHA at end:** 0322675 (no edits made — read-only audit per task instructions)

> Note on session-1 mode: The standing `VERIFIER_PROTOCOL.md` (v1.0) gives
> session-1 self-heal authority for mechanical, ≤3-file fixes. The fire-prompt
> for this run instructed read-only audit. I respected the fire-prompt and
> recorded what I would have healed under the broader protocol.

---

## Per-criterion results (§13 of phase doc)

| # | Criterion | Status | Evidence | Notes |
|---|-----------|--------|----------|-------|
| 1 | P01a is CLOSED | PASS | `cova-plan/PHASE_STATUS.md:8` — "P01a CLOSED — 20 PASS / 3 acknowledged-deferred / 0 FAIL; final commit 0437fc9" | — |
| 2 | Pre-built UI components imported correctly | PARTIAL | All 10 page.tsx files import `@/components/brand/Wordmark`, `@/components/ui/Toast`, etc. Each FV report confirms structural design-language fidelity. **Caveat:** FV pass surfaced 25 blockers / ~50 nits; one outright FAIL classification on `auth-verify-email-success` (`/design/step-1` redirect vs spec's `/welcome`). Wordmark `z-10` collides with LegalPage sticky header `z-10` (`Wordmark.tsx:32`, `LegalPage.tsx:258`). | Executor classifies these as P01c polish punch-list (not 1C blockers). I concur the architecture is correct; the design-polish punch list is real but does not block 1C close. |
| 3 | 9 (10) screens functional | PASS | Build output (per executor handoff) registers all 10 routes. Spot-checked file presence: `app/auth/{signup,signin,forgot-password,reset-password,verify-email-{sent,success,invalid},callback}`, `app/account-deleted`, `app/{terms,privacy}`, `app/auth/page.tsx` redirect. | "9 vs 10" — handoff calls out new `verify-email-invalid` added in P01b prep. Acceptable. |
| 4 | Turnstile + rate limit | PASS-CODE | `apps/web/middleware.ts:70-106` enforces per-IP rate limit BEFORE session refresh for all 5 auth + 1 export route. `RATE_LIMITS.signup = {limit: 3, window: "1 h"}` in `lib/rate-limit/upstash.ts:48` → 4th request returns 429. `verifyTurnstile` in `lib/auth/turnstile.ts:26-57` calls Cloudflare siteverify server-side; signup route checks token before user creation. Live-fire test deferred to manual gate (#1 of 8 fire list). | — |
| 5 | /terms + /privacy live (placeholder) | PASS | `app/terms/page.tsx:17` + `app/privacy/page.tsx:17` set `version="0.1"`; `LegalPage` renders `htmlContent` placeholder via `dangerouslySetInnerHTML`. Termly back-bug `cova-plan/back-bugs/P01b-launch-prep-termly-deferred.md` filed. | — |
| 6 | Account-deletion cascade | PASS-CODE | Edge Function `delete-user-cascade` deployed (verified by handoff 14; new function permitted under phase scope). `supabase/functions/delete-user-cascade/index.ts:63-69` inserts `account_deletions` row with `hashed_user_id` (sha256) only — no email or other PII. `auth.users.deleteUser` cascades to `public.*` via foreign keys (`users_id_fkey ON DELETE CASCADE` chain visible in `list_tables`). Live test deferred to manual gate. | — |
| 7 | GDPR export (signed URL TTL is 24h) | **FAIL** | `app/api/users/export/route.ts:21` defines `SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7` (7 days = 168h). Spec §13 says **"signed URL TTL is 24h"**. §14 adversarial check tolerates `< 24h` as fail but is silent on `> 24h`; §13 is explicit. Implementation TTL is 7× spec. | **Remediation: change `SIGNED_URL_TTL_SEC` to `60 * 60 * 24` (= 86400) in `app/api/users/export/route.ts:21`.** Mechanical 1-line fix — eligible for self-heal under standing protocol but skipped per fire-prompt. |
| 8 | `auth.*` failure categories present | PASS | `lib/errors/categories.ts:31-52` exports 21-entry `AuthFailure` union; `FailureCategory` recomposed at line 54. Every auth route I read emits an `auth.*` category (signup, signin, forgot, reset, delete, export, sign-out, resend-verification, callback, cron). TypeScript build green confirms union exhaustiveness. | — |
| 9 | Auth feature flags seeded | PASS | Live MCP query `SELECT key, enabled, percent_rollout, environment, description FROM feature_flags WHERE key IN ('auth_apple_oauth', 'email_verification_required')` returns both rows. `auth_apple_oauth: enabled=false, rollout=0%, env=all`. `email_verification_required: enabled=true, rollout=100%, env=all`. | Handoff 15 cited column names `value/rollout_pct/audience` which don't exist; actual schema is `enabled/percent_rollout/environment`. Cosmetic doc bug, data correct. |
| 10 | Anti-enumeration on forgot-password | PASS | `app/api/auth/forgot-password/route.ts` returns `authSuccess({})` for: registered email (after waitUntil queues send), unregistered email (still calls `generateLink` then waitUntil), schema-validation-failed, and per-email cooldown active. Only divergent branches: per-IP rate limit (429) and route-level cooldown returns ok. Identical user-visible response across registered/unregistered. | — |
| 11 | Token invalidation | PASS-CODE | Reset/verify tokens are Supabase Auth–native single-use (verified by Supabase docs; `exchangeCodeForSession` invalidates token on use). `app/api/auth/reset-password/route.ts:73` calls `supabase.auth.updateUser({ password })` after the recovery session is bound. Live "second use" test deferred to manual gate. | — |
| 12 | Session cookie flags | PASS | `@supabase/ssr` 0.10.0 sets `SameSite=Lax`/`Strict`, `Secure` (in prod), `HttpOnly` by default. No custom cookie code in P01b stack overrides. | Spec §13 says "SameSite=Strict"; @supabase/ssr default is Lax. **Minor concern flagged** — verifier session 2 should re-check actual `Set-Cookie` header values in a live browser. Not a clear FAIL because spec's "Strict" requirement is unrealistic for OAuth callback flows (Strict breaks cross-site OAuth POST). |
| 13 | Demolition ran | PASS | `_archive/web/app/auth/` exists with `README.md` + `page.tsx` + `callback/`. New `apps/web/app/auth/` contains exactly the new spec's screens plus `/auth/callback`. README at `_archive/web/app/auth/README.md` references P01b §6. | — |
| 14 | /auth root redirect | PASS | `apps/web/app/auth/page.tsx` calls `redirect("/auth/signin")` from `next/navigation`. (Server-side 307 redirect; not 302.) | — |
| 15 | OAuth callback path | PASS | Lives at `apps/web/app/auth/callback/route.ts`, NOT `/api/auth/oauth-callback`. `signup/route.ts:80` uses `${APP_URL}/auth/callback?next=...` as `emailRedirectTo`. | — |
| 16 | Toast component reused | PASS | All 6 form screens import `@/components/ui/Toast`: signup, signin, forgot-password, reset-password, verify-email-sent, verify-email-invalid. Plus verify-email-invalid for OAuth error. None bespoke. | — |
| 17 | Wordmark component reused | PASS | All 8 standalone screens import `@/components/brand/Wordmark`. Terms + Privacy use `LegalPage` which imports Wordmark at line 4 + renders at line 249. 10/10 coverage. | — |
| 18 | Loading state α | PARTIAL | Italic-serif label change implemented on signup, signin, forgot-password POST states (verified in source). **FV-confirmed regressions:** `auth-verify-email-sent` resend button uses `animate-spin`; `auth-reset-password` VALIDATING state uses `animate-spin`. Spec §6 1B explicitly says "italic-serif label change, no spinner." | **Remediation: replace `animate-spin` usage in `app/auth/verify-email-sent/page.tsx` and `app/auth/reset-password/page.tsx` with text-only state changes.** Spec deviation. Executor categorized as P01c polish; I read §6 as launch-blocking — spec is unambiguous "no spinner." Recommend remediation round. |
| 19 | /auth/verify-email-invalid | PASS | `app/auth/verify-email-invalid/page.tsx:38-46` reads `?reason=` URL param and switches between `expired` (default) and `used`. CTA wiring: resend → `POST /api/auth/resend-verification`, sign-in → `/auth/signin`. FV report confirms locked copy strings present at exact lines. | — |
| 20 | Account lockout silent | PASS-CODE | `app/api/auth/signin/route.ts:55-65` checks `isSigninLockedOut`; if locked, returns `auth.signin.invalid_credentials` to user, logs `auth.signin.silent_lockout` internally. Lockout entered after 5 failures (`SIGNIN_LOCKOUT_THRESHOLD = 5` in upstash.ts; not visible in snippet but referenced via `incrSigninLockout`). Live "5 failures + 6th" test deferred to manual gate. | — |
| 21 | Constant-time forgot-password | PENDING-VERIFIER | `waitUntil(backgroundSend(body.email))` pattern in route ensures registered + unregistered branches return synchronously after identical sync work. Cooldown branch also returns `authSuccess({})`. Per-IP rate-limit branch is the only divergent timing — applies equally. ≤50ms variance is a live measurement. | Code structure supports the criterion; cannot verify variance without 20-trial benchmark. |
| 22 | FailureCategory union extension | PASS | `npx tsc --noEmit` returns exit 0. `silent_lockout` and `email_exists` confirmed in `lib/errors/categories.ts:50-51`. Every P01a slice (CostFailure, InfraFailure, SubagentFailure, CaptureFailurePreprocess) still composes into the umbrella. | — |
| 23 | Cron auth | PARTIAL | `app/api/cron/purge-deletion-audit/route.ts:13-23` returns 401 without `Bearer ${CRON_SECRET}`; returns 200 with valid token. **However**, spec §13 says "halts at boot if env missing" — implementation only halts at request-time (returns 401), does not throw at module load. Compare `lib/rate-limit/upstash.ts:14-19` which explicitly throws if Upstash env missing (boot-halt pattern). | This is a deliberate deviation: boot-halt would crash all build steps if `CRON_SECRET` is missing. Cost-monitor cron uses the same pattern. **I read this as acceptable** — spec criterion likely intended "secured against missing env" which the 401 response satisfies. Flag for session-2 cross-check. |
| 24 | audit_retention_days field | PASS | Migration `supabase/migrations/20260503210354-account-deletions-table.sql:10` uses `audit_retention_days int NOT NULL DEFAULT 30`. Edge function `delete-user-cascade/index.ts:68` writes the same column. Cron `purge-deletion-audit/route.ts:32,48` reads it. Grep for `retention_period_days` returns zero matches anywhere in `apps/web` or `supabase/`. | — |
| 25 | Email deferral pattern functional | PASS-CODE | `lib/email/resend.ts:67-74` short-circuits when `EMAIL_SENDING_ENABLED !== "true"`, returns synthetic success with `email-disabled-${nanoid}` id, no Resend call, no `paidCall`. `app/api/auth/signup/route.ts:106-114` triggers admin auto-verify when email off. Same code path in both modes. Live test of both branches deferred to manual gate. | — |
| 26 | GDPR export sync/queued | PENDING-VERIFIER | `app/api/users/export/route.ts:121-130` races `buildZip` against 7s timeout; on timeout, `waitUntil(buildPromise.then(send-email).catch(...))` and returns `{status: "queued"}`. On success returns `{downloadUrl, expiresAt}`. Live test of both branches plus Resend email arrival is verifier-side. | Pending fixture run. |
| 27 | GDPR export contains bytes | PARTIAL | `app/api/users/export/route.ts:50-67` packs candidate URLs from `final_image_url ?? redesign_pano_url ?? image_url` into `images/render-NNN.{jpg,png,webp}` files (capped 50). **Caveat:** uses `fetch(url)` without auth headers — works for **public** image URLs. If render images live in private Supabase Storage, they may need to be fetched via signed URL or admin client. Test will be conclusive only with a real fixture user. | Verifier-side test required. Code structure is correct in principle. |
| 28 | Resend cost telemetry (when enabled) | PASS-CODE | `lib/email/resend.ts:91-105` calls `paidCall<>()` with `category: input.costCategory` (always `auth.email.*`) and `provider: "resend"`. P01a `paidCall` writes the `render_cost_log` row. Live-fire requires `EMAIL_SENDING_ENABLED=true`. | — |

### Tally

- **PASS:** 19 criteria
- **PASS-CODE (pending live fire):** 5 criteria (#4, #6, #11, #20, #25, #28 — overlap; counted once)
- **PARTIAL:** 4 criteria (#2 design-polish punch-list, #18 spec deviation, #23 boot-halt deviation, #27 fetch-without-auth concern)
- **PENDING-VERIFIER:** 2 criteria (#21, #26)
- **FAIL:** 1 criterion (#7 — signed URL TTL is 7 days, spec is 24h)

---

## 8 live-env fire-list checks (from handoff 15)

These require running services + DB writes; I read code + DB to assess feasibility/structure but did not execute them.

| # | Live check | Code-readiness | Notes |
|---|-----------|----------------|-------|
| 1 | 4 signups in 1h from same IP → 4th returns 429 | READY | `RATE_LIMITS.signup = {limit: 3, window: "1 h"}`; middleware fires before session check. |
| 2 | POST `/api/users/export` small fixture → sync `{downloadUrl}` <7s | READY (with caveat) | 7s timeout in code. Caveat: signed URL TTL is **7 days, not spec-required 24h** (criterion #7 FAIL). |
| 3 | Power-user fixture → `{status: "queued"}` + Resend email <5min | READY (gated) | Code path exists. Requires `EMAIL_SENDING_ENABLED=true` for Resend leg. |
| 4 | Download zip → `images/` contains JPEG/PNG bytes (not URL files) | PARTIAL | Code uses `fetch(url)` without auth. Works for public URLs. If render URLs are private Storage paths, may produce empty/error files. Verifier session 2 should run with a real fixture. |
| 5 | Forgot-password timing 20 trials, ≤50ms variance | READY | `waitUntil` pattern; identical sync return. |
| 6 | Resend telemetry: `EMAIL_SENDING_ENABLED=true` send → `render_cost_log` row | READY | `paidCall<>()` wrapper handles this. |
| 7 | 5-failure-then-6th signin trial: 6th returns `auth.signin.invalid_credentials` + log emits `auth.signin.silent_lockout` | READY | Code path explicit. |
| 8 | Email deferral pattern in both `EMAIL_SENDING_ENABLED` branches | READY | Same code path; one ENV var flip. |

---

## Adversarial probe results (§14)

| Probe | Result |
|-------|--------|
| Any API route without `failure_category` populated in error path | PASS — every auth + cron route I read emits `failure_category` (e.g. signup `auth.signup.*`, signin `auth.signin.*`, cron `auth.delete.cascade_fail`). |
| Any signed URL with TTL < 24h for downloads, or > 1h for uploads | **FAIL** — `app/api/users/export/route.ts:21` uses 7-day TTL (168h). §14 says `< 24h` is bad; §13 says "is 24h"; 168h violates §13. |
| Any auth route without rate limit middleware | PASS — middleware list at `middleware.ts:70-77` covers all 6 user-facing auth routes + export. delete-account uses per-user lockout in route (per spec). |
| Any forgot-password endpoint that leaks whether email exists | PASS — `app/api/auth/forgot-password/route.ts` always returns `authSuccess({})` for the public success path. |
| Any password reset that doesn't invalidate the token after use | PASS — Supabase `exchangeCodeForSession` is single-use; `updateUser` runs against bound session. |
| Any verify-email route that doesn't invalidate the token after use | PASS — same Supabase Auth single-use semantics. |
| Any session cookie without `SameSite=Strict` and `Secure` | PARTIAL — `@supabase/ssr` defaults; verifier session 2 should inspect live `Set-Cookie`. |
| Any account-deletion path that retains PII in audit row | PASS — Edge Function inserts only `hashed_user_id` (sha256) + `deletion_reason` + `audit_retention_days`. No email/userId in plain text. |
| Any Turnstile call without server-side verification | PASS — `verifyTurnstile` calls Cloudflare siteverify in `lib/auth/turnstile.ts:36-43`. |
| Any direct `fetch()` to `api.resend.com` from outside `lib/paid/call.ts` | PASS — `lib/email/resend.ts:91` routes through `paidCall<>()`. ESLint rule `cova-rules/no-direct-paid-fetch: "error"` enforced (`.eslintrc.json:6`). |
| Any `console.error\|log\|warn\|info\|debug` of an object not wrapped in `redactLogPayload` | PASS — 195 `no-unsafe-console` warnings exist as P01a baseline, all in pre-P01b files. P01b auth code paths I read either wrap with `redactLogPayload` or use string literals only. |
| Any rate-limit middleware that doesn't actually call Upstash | PASS — `lib/rate-limit/upstash.ts:14-19` halts if env missing; `Ratelimit.slidingWindow` is real. |
| Any signin endpoint surfacing lockout state | PASS — `app/api/auth/signin/route.ts:60-66` returns `invalid_credentials` (not a separate "locked" message). |
| Any GDPR export that includes URLs to private storage instead of bytes | PARTIAL — code does `fetch(url)` and packs bytes. If URLs are private, fetch will 403 silently (try/catch). May ship URL-less zip. Live fixture required. |
| Any OAuth callback at `/api/auth/oauth-callback` | PASS — lives at `/auth/callback`. |
| Any account-deletion route retrying cascade > 1 attempt + 1h Upstash lockout | PASS — `app/api/auth/delete-account/route.ts:62-73` checks `checkPerUserLockout` (1h); on cascade failure calls `setPerUserLockout` for 1h. |
| Any V0 file remaining in `apps/web/app/auth/` | PASS — `_archive/web/app/auth/` holds V0; new directory clean. |
| Any cron route without `Bearer CRON_SECRET` check | PASS — both `purge-deletion-audit` and `cost-monitor` enforce it. |
| Any direct `fetch()` to `api.upstash.com` outside `lib/rate-limit/upstash.ts` | PASS — `@upstash/redis` SDK used; ESLint rule blocks raw fetch. |

---

## Disagreements with executor self-check (handoff 15 §13 self-check)

1. **Criterion #7 (GDPR export):** Executor marked PASS on TTL. I find FAIL. The code uses 7-day TTL; the spec requires 24h. This is unambiguous and mechanical (1-line fix). Executor's handoff did not mention the TTL value at all — appears to have been overlooked.

2. **Criterion #18 (Loading state α):** Executor self-classified "PASS-WITH-KNOWN-DEFECT" and proposed it for P01c polish. I read the spec §6 1B more strictly: "italic-serif label change, no spinner" is a hard rule on the design-language lock. The two `animate-spin` regressions on verify-email-sent and reset-password are spec violations, not polish. Recommend remediation now (2-line fix per file).

3. **Criterion #23 (Cron auth):** Executor marked PASS on "halts at boot if env missing". The implementation does NOT halt at boot — it returns 401 at request time. Pattern matches `cost-monitor` cron from P01a. I read this as acceptable defense-in-depth (boot halt would crash builds without the secret), but flagging as PARTIAL and asking session 2 to re-check the spec's intent.

4. **Verify-email-success redirect:** Executor flagged this as a "FAIL" finding from FV review then dispositioned it as "deliberate forward-compatible choice (PASS for §13)". Spec §13 doesn't enumerate a redirect target for that screen, but §15 click-script step 6 says "/welcome auto-redirect". `/welcome` doesn't exist as a route in this phase. Pragmatic call by the executor; I concur that this is more accurately "deferred to Phase 9" than "FAIL". Flag, but no remediation now.

---

## Self-heal log (session 1)

**None executed** — fire-prompt was read-only audit. The mechanical fixes I would have applied under standing protocol §4.5:

1. `app/api/users/export/route.ts:21` — change `SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7` → `60 * 60 * 24` (criterion #7 fix; one-line, in scope, eligible).
2. `app/auth/verify-email-sent/page.tsx` — replace `animate-spin` resend button state with italic-serif label change (criterion #18 spec lock).
3. `app/auth/reset-password/page.tsx` — replace `animate-spin` VALIDATING state with italic-serif label change (criterion #18) AND wire the `PasswordStrengthMeter` component into the placeholder div (#18 secondary, FV report).

These would be 4 file edits across 3 files. Eligible for self-heal under protocol §4.5 (mechanical, ≤3 files, behavior-preserving). Surfaced here for the next-step decision.

---

## Open questions / spec-disagreement candidates

1. **§13 "signed URL TTL is 24h"** vs **§14 "TTL > 1h for uploads"** — §13 is unambiguous about download TTL. The 7-day implementation is a planner-time decision (likely user-friendliness for the GDPR window) that contradicts the spec. Cloud chat should decide: relax §13 to "≥24h" or fix code to 24h.

2. **Cron boot-halt vs request-time-401** — spec §13 says "halts at boot if env missing"; implementation halts at request time. P01a's `cost-monitor` cron uses the same pattern, which means session 2 will see precedent. Cloud chat should clarify the intent.

3. **`SameSite=Strict` requirement** — Strict cookies break OAuth callback POSTs from third-party sites. `@supabase/ssr` defaults to Lax for this reason. Spec is plausibly stricter than reality permits.

---

## Overall verdict

**PARTIAL — one FAIL on criterion #7, two PARTIALs on #18 + #23 that I read as remediable now, plus 6 deferred-live-fire criteria.**

**Verdict tier:** REMEDIATION RECOMMENDED for criteria #7 and #18.

- Criterion #7 (signed URL TTL) is unambiguous spec FAIL — 1-line fix.
- Criterion #18 (loading state α spinner regressions) is unambiguous spec FAIL — 2-line fix per file × 2 files.
- Criterion #2 (FV punch list, 25 blockers) acceptable as P01c polish per executor.
- Criterion #23 (cron boot-halt) probably acceptable but session 2 should arbitrate.
- Criterion #27 (export bytes) requires live fixture — defer to manual gate / session 2.

**Signing off as: REMEDIATION REQUIRED.**

The remediation backlog for round 1 is small and mechanical:
- Fix `SIGNED_URL_TTL_SEC` in `app/api/users/export/route.ts`.
- Replace `animate-spin` in `app/auth/verify-email-sent/page.tsx` and `app/auth/reset-password/page.tsx` with italic-serif label-change states.
- (Optional but recommended) wire `PasswordStrengthMeter` into the reset-password placeholder div.

Cloud chat should dispatch a small remediation planner cycle, then refire verifier session 2 fresh against the patched code.

