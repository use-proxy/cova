# P01b Verifier — Session 2

**Date:** 2026-05-03
**Mode:** session-2 (read-only, independent re-verification post-remediation 1 + 1.5)
**Source spec:** `cova-plan/phases/P01b-auth-legal-deletion.md` §13 / §14 / §6 1B
**Code SHA at start:** 9fa0652 (HEAD of `main`)
**Code SHA at end:** 9fa0652 (no edits — read-only)

> Per VERIFIER_PROTOCOL.md §5, this session has **no access to session 1's
> heal log** in spirit, but per the explicit fire-prompt I was instructed
> to walk the FAIL list of session 1 plus do a fresh §13 pass. I read
> session 1 + handoff 16 only as a pointer to "what was claimed to be
> fixed"; I re-verified every claim against the live code and live DB.
> Where I disagree with session 1 on PASS calls, I flag below.

---

## Part A — Re-verification of remediation 1 + 1.5

| # | Claim | Status | Evidence |
|---|-------|--------|----------|
| R1 (1.5.2) | Phase doc §1 line 94 says "7-day signed URL" (was "24h-TTL signed URL") | **PASS** | `cova-plan/phases/P01b-auth-legal-deletion.md:94` reads `…with a 7-day signed URL emailed via Resend.` |
| R1 (initial) | Phase doc §13 export-row says "7-day" matching §6 1A/§9 | **PASS** | Phase doc line 677: `signed URL TTL is 7-day (matches §6 1A and §9; locked in phase chat State 2 decision T8)`. Note: line 717 still says "TTL < 24h for downloads" in §14 — this is a *bound* check ("must be ≥24h"), not a cap, so 7-day passes; not a contradiction. |
| R1-grep | No remaining "24h"/"24-hour" in export TTL context | **PASS** | grep for `24h|24-hour|24 hour` in phase doc returns 5 hits, none in export-URL-TTL context: line 178 (verification-token expiry), line 192 (export *rate limit* "1 per 24h per user"), line 275 (verification-link copy), line 556 (rate limit note), line 570 (rate limit table), line 717 (§14 lower bound), line 756 (manual click-script "wait 24h" for token expiry), line 781 (rate-limit retest). All of these refer to either **token expiry** or **rate-limit cadence**, not signed-URL TTL. |
| R2.a (#18a) | `/auth/verify-email-sent` resend button — spinner removed | **PASS** | `apps/web/app/auth/verify-email-sent/page.tsx:122-133`: `isResending` branch now renders `<span className="font-serif italic normal-case tracking-normal text-[14px] text-cova-ivory">Resending…</span>`. No `animate-spin`. `grep animate-spin` against this file returns zero hits. |
| R2.b (#18b) | `/auth/reset-password` VALIDATING state — spinner removed | **PASS** | `apps/web/app/auth/reset-password/page.tsx:434-456` (`ValidatingBlock`): renders `<p … className="font-serif italic … animate-pulse motion-reduce:animate-none">Verifying your link…</p>`. The `animate-pulse` (opacity shimmer) is allowed; `animate-spin` is gone. The 300ms minimum shimmer is enforced by parent useEffect (line 90-92). |
| R1.5.1 (#18c) | `/auth/reset-password` `ValidBlock` submit-button spinner removed | **PASS** | `apps/web/app/auth/reset-password/page.tsx:621-629`: `isLoading` branch renders `<span className="font-serif italic text-[14px] normal-case tracking-normal" …>Updating your password…</span>`. Locked label per §6 1B "Reset password: Updating your password…". No spinner. |
| R3 | `PasswordStrengthMeter` imported + rendered (not placeholder div) | **PASS** | `apps/web/app/auth/reset-password/page.tsx:30` imports `PasswordStrengthMeter`. Line 33-44 defines local `zxcvbnScore()` heuristic. Lines 548-553: `<div id="password-strength-meter-mount"><PasswordStrengthMeter score={zxcvbnScore(passwordValue)} isVisible={passwordValue.length > 0} /></div>`. Component is rendered, not a stub. |
| R4 | `/api/users/export` uses authenticated storage fetch | **PASS** | `apps/web/app/api/users/export/route.ts:35-45` defines `parseSupabaseStorageUrl` to extract `(bucket, path)`. Lines 61-81 define `fetchImageBytes(admin, url)` which calls `admin.storage.from(bucket).download(path)` for Supabase URLs (service-role authenticated, works for private buckets) and falls back to plain `fetch()` for external URLs while validating content-type starts with `image/` or byte length ≥64. Used at line 117 inside `Promise.all`. The previous unauthenticated `fetch(url)` is gone. |
| R4-bonus | Renders candidate-URL list uses real schema columns | **PASS** | `apps/web/app/api/users/export/route.ts:111`: `r.image_url ?? r.panoramic_url ?? r.empty_room_url`. Live MCP query against `information_schema.columns` for `renders` returns exactly these three columns (and no `final_image_url` or `redesign_pano_url`). The remediation correctly switched to live schema. |

**Part A verdict:** All 8 claimed remediations PASS. The remediation log is accurate.

---

## Part B — Fresh full pass on §13 (regression hunt + missed criteria)

| # | Criterion | Status | Evidence | Notes |
|---|-----------|--------|----------|-------|
| 1 | P01a is CLOSED | PASS | `PHASE_STATUS.md:8` "P01a CLOSED — 20 PASS / 3 acknowledged-deferred / 0 FAIL; final commit 0437fc9" | — |
| 2 | Pre-built UI components imported correctly | PARTIAL | All 10 page.tsx files import `@/components/brand/Wordmark`, `@/components/ui/Toast` etc. FV punch-list (25 blockers) is acknowledged P01c polish; not a §13 close blocker. | — |
| 3 | 9 (10) screens functional | PASS | All routes present; build registers them. | — |
| 4 | Turnstile + rate limit | PASS-CODE | `middleware.ts:70-106` enforces per-IP rate limit for 5 auth + 1 export route before session refresh. `verifyTurnstile` in `lib/auth/turnstile.ts` calls Cloudflare siteverify server-side. Live 4-signup test = manual gate. | — |
| 5 | /terms + /privacy live (placeholder) | PASS | Both pass `version="0.1"` to `LegalPage`. Termly back-bug filed. | — |
| 6 | Account-deletion cascade | PASS-CODE | Edge Function `delete-user-cascade` deployed; account_deletions row writes `hashed_user_id` (sha256), `audit_retention_days int NOT NULL DEFAULT 30`, no email/PII. RLS enabled (`relrowsecurity=true` per MCP). | — |
| 7 | GDPR export — signed URL TTL is 7-day | PASS | `app/api/users/export/route.ts:23` uses `SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7`. Phase doc §13 (line 677), §6 1A, §9, and now §1 (line 94) all say 7-day. Internally consistent. **Session 1 had marked this FAIL because of a stale §13 entry; remediation R1 corrected the doc, not the code. The 7-day code value matches the locked T8 decision.** | — |
| 8 | `auth.*` failure categories present | PASS | `lib/errors/categories.ts:31-52` 21-entry `AuthFailure` union; every auth route emits an `auth.*` category. | — |
| 9 | Auth feature flags seeded | PASS | Live MCP: `auth_apple_oauth (enabled=false, percent_rollout=0, environment=all)`, `email_verification_required (enabled=true, percent_rollout=100, environment=all)`. | — |
| 10 | Anti-enumeration on forgot-password | PASS | `forgot-password/route.ts` returns `authSuccess({})` on every public branch. `waitUntil` queues send for both registered + unregistered. | — |
| 11 | Token invalidation | PASS-CODE | Supabase Auth single-use semantics for reset/verify tokens; route uses `exchangeCodeForSession` then `updateUser`. Live "second use returns 401" test = manual gate. | — |
| 12 | Session cookie flags | PASS-CODE | `@supabase/ssr` 0.10.0 defaults. Spec §13 says "SameSite=Strict"; `@supabase/ssr` default is Lax (Strict breaks OAuth callbacks); flagged in session 1 as a spec-vs-reality tension. Pragmatic accept. Live `Set-Cookie` header inspection = manual gate. | — |
| 13 | Demolition ran | PASS | `_archive/web/app/auth/` exists with V0 surface + README. New `apps/web/app/auth/` is clean. | — |
| 14 | /auth root redirect | PASS | `app/auth/page.tsx` calls `redirect("/auth/signin")` (server-side 307). | — |
| 15 | OAuth callback path | PASS | `app/auth/callback/route.ts`. `signup/route.ts` uses `${APP_URL}/auth/callback?next=…` as `emailRedirectTo`. | — |
| 16 | Toast component reused | PASS | All 6 form screens import `@/components/ui/Toast`. None bespoke. | — |
| 17 | Wordmark component reused | PASS | All 10 standalone screens render Wordmark (LegalPage embeds it). | — |
| **18** | **Loading state α — italic-serif label change, no spinner** | **FAIL** | **NEW FINDING — session 1 missed this.** §6 1B (phase doc line 338): `Submit button: italic-serif label change. No spinner, no dot-loader.` Three submit buttons + one resend-POST button still use `<Spinner />` (`animate-spin` ring) instead of the locked italic-serif label: <br>• `apps/web/app/auth/signup/page.tsx:446` — submit button shows `<Spinner />` on isLoading. Locked label "Creating your account…" not used. Spinner defined at line 466-479 (`animate-spin`).<br>• `apps/web/app/auth/signin/page.tsx:377` — submit button shows `<Spinner />` on isLoading. Locked label "Signing you in…" not used. Spinner at line 428-436 (`animate-spin`).<br>• `apps/web/app/auth/forgot-password/page.tsx:443` — submit (PRE-state) shows `<Spinner />`. Locked label "Sending reset link…" not used. Spinner at line 556-564 (`animate-spin`).<br>• `apps/web/app/auth/forgot-password/page.tsx:544` — POST-state Resend button shows `<Spinner />`. Locked label "Resending…" not used.<br>• `apps/web/app/auth/verify-email-invalid/page.tsx:328` — expired-variant resend button shows `<span className="cova-spinner" />` (custom CSS keyframe `covaSpin`, not `animate-spin` class but functionally a rotating ring). Locked label "Sending verification email…" used as `aria-label` only. <br>**Five spinner regressions still live in production code, all fall under "all 6 form screens" of §13 line 688.** | The remediation 1 + 1.5 batch covered only verify-email-sent (resend), reset-password (VALIDATING + ValidBlock submit). The four mainline submit-button spinners on signup/signin/forgot-password (×2) plus verify-email-invalid expired Resend were never touched. **Session 1 marked criterion #18 as PARTIAL but explicitly stated "Italic-serif label change implemented on signup, signin, forgot-password POST states (verified in source)" — this is incorrect; none of those three have the label change.** I flag this as **FAIL** under a strict §6 1B reading, **PARTIAL** under a generous reading. Mechanically: 5 small replacements modeled on the verify-email-sent / reset-password fixes already shipped. |
| 19 | /auth/verify-email-invalid | PASS | `?reason=expired` and `?reason=used` substates render correct copy + CTAs. | — |
| 20 | Account lockout silent | PASS-CODE | `signin/route.ts:55-65` checks `isSigninLockedOut`; surfaces only `auth.signin.invalid_credentials`; logs `auth.signin.silent_lockout`. Live "5 fail + 6th" trial = manual gate. | — |
| 21 | Constant-time forgot-password | PENDING-VERIFIER | Code structure supports it (`waitUntil` pattern); 50ms variance is a live measurement. | Manual gate. |
| 22 | FailureCategory union extension | PASS | `npx tsc --noEmit` exit 0; `silent_lockout` and `email_exists` in union. | — |
| 23 | Cron auth | PARTIAL | `purge-deletion-audit/route.ts:13-23` returns 401 without `Bearer ${CRON_SECRET}`; **does NOT halt at boot** — falls back to runtime check. `lib/rate-limit/upstash.ts` is the only boot-halt example. Spec §13 says "halts at boot if env missing"; implementation halts at request time. Same pattern as `cost-monitor` (P01a precedent). Session 1 read this as "acceptable defense-in-depth"; I concur on pragmatic grounds but flag spec-vs-reality tension for the manual gate. | — |
| 24 | audit_retention_days field | PASS | Live MCP confirms column on `account_deletions` (data_type integer). Cron route reads it; Edge Function writes it. No `retention_period_days` anywhere in repo. | — |
| 25 | Email deferral pattern functional | PASS-CODE | `lib/email/resend.ts:67-74` short-circuits when `EMAIL_SENDING_ENABLED !== "true"`. `signup/route.ts:106-114` triggers admin auto-verify when email off. | Manual gate. |
| 26 | GDPR export sync/queued | PENDING-VERIFIER | 7s timeout pattern at `route.ts:196-225`; on timeout `waitUntil(buildPromise.then(send-email))` and returns `{status: "queued"}`. Live test = manual gate. | — |
| 27 | GDPR export contains bytes | PASS-CODE | After R4, `fetchImageBytes` uses authenticated storage download. Validates content-type or byte length. Live fixture run = manual gate, but code path is now sound. | — |
| 28 | Resend cost telemetry (when enabled) | PASS-CODE | `lib/email/resend.ts:91-105` calls `paidCall<>()` with `category: input.costCategory`. Live test gated on `EMAIL_SENDING_ENABLED=true`. | — |

### Tally

- **PASS:** 18 criteria
- **PASS-CODE (pending live fire):** 6 criteria (#4, #6, #11, #20, #25, #27, #28 — counted once)
- **PARTIAL:** 2 criteria (#2 FV polish punch-list, #23 cron boot-halt deviation)
- **PENDING-VERIFIER (live measurement):** 2 criteria (#21, #26)
- **FAIL:** 1 criterion (**#18 — Loading state α: 5 spinner sites still live; locked italic-serif labels not rendered on signup/signin/forgot-password/verify-email-invalid expired**)

---

## Part C — 6 PENDING-VERIFIER live-env fire-list items (re-confirmed)

These items from the executor's §13 self-check (handoff 15) and session 1 cannot be verified without a deployed environment + Resend + real fixture rooms. They remain pending. For each, what would need to happen post-deployment:

| # | Live check | What to test | Pass criterion |
|---|-----------|--------------|----------------|
| 1 | 4 signups in 1h from same IP → 4th returns 429 | curl `/api/auth/signup` 4× with valid Turnstile token from same IP; 4th returns 429 with `auth.signup.rate_limit` | rate limit fires after 3 in 1h |
| 2 | Small-fixture user export → sync `{downloadUrl}` < 7s | POST `/api/users/export` as test user with 0–10 renders; expect `{downloadUrl, expiresAt}` in <7s | sync path; no queued status |
| 3 | Power-user fixture → `{status: "queued"}` + Resend email arrives < 5min | POST `/api/users/export` as fixture with >50 renders OR force 8s zip delay; expect `{status:"queued"}` and email with download link | queued path + email delivery |
| 4 | Download zip → `images/` contains JPEG/PNG bytes | Download zip from #2 or #3; unzip; verify `images/render-001.jpg` etc. is real image bytes (file command shows JPEG/PNG/WEBP, not 0-byte or HTML) | bytes, not URL stubs |
| 5 | Forgot-password timing: 20 trials, ≤50ms variance | Call `/api/auth/forgot-password` 20× registered + 20× unregistered; measure mean response time per branch | variance ≤ 50ms |
| 6 | 5-failure-then-6th signin trial: 6th returns `invalid_credentials` + log emits `silent_lockout` | curl `/api/auth/signin` 5× with bad password as test user; 6th attempt → expect 401 `auth.signin.invalid_credentials` to user; check Sentry/logs for internal `auth.signin.silent_lockout` event | silent surface, internal log |

(Session 1's items 6 and 8 — Resend telemetry write + email-deferral both branches — overlap with manual gate's `EMAIL_SENDING_ENABLED` env-flip exercise. They are the same env-gated test surface, counted once.)

---

## Adversarial probe results (§14) — re-checked

| Probe | Result |
|-------|--------|
| Any API route without `failure_category` in error path | PASS — every auth + cron route emits `auth.*` |
| Any signed URL TTL < 24h for downloads, or > 1h for uploads | PASS — export TTL is 7-day (>24h floor); no upload signed URLs in P01b scope |
| Any auth route without rate limit middleware | PASS — middleware wires Upstash for 6 user-facing auth routes + export |
| Any forgot-password endpoint that leaks whether email exists | PASS — identical `authSuccess({})` for registered/unregistered/cooldown |
| Any password reset that doesn't invalidate the token after use | PASS — Supabase Auth single-use |
| Any verify-email route that doesn't invalidate the token after use | PASS — Supabase Auth single-use |
| Any session cookie without `SameSite=Strict` and `Secure` | PARTIAL — `@supabase/ssr` default is Lax for OAuth compatibility (spec-vs-reality tension) |
| Any account-deletion path that retains PII in audit row | PASS — only `hashed_user_id` (sha256) + `deletion_reason` + `audit_retention_days` |
| Any Turnstile call without server-side verification | PASS — `verifyTurnstile` calls Cloudflare siteverify |
| Any direct `fetch()` to api.resend.com from outside `lib/paid/call.ts` | PASS — `lib/email/resend.ts` routes through `paidCall<>()`; ESLint rule enforced |
| Any `console.error|log|warn|info|debug` of object not wrapped in `redactLogPayload` | PASS — P01b code paths wrap (export route uses `redactLogPayload({detail})` at line 164/222; eslint-disable only for the wrapped call). 195 baseline warnings are P01a residuals, all in pre-P01b files. |
| Any rate-limit middleware that doesn't actually call Upstash | PASS — `lib/rate-limit/upstash.ts` halts if env missing; real Ratelimit |
| Any signin endpoint surfacing lockout state | PASS — only `invalid_credentials` reaches user |
| Any GDPR export with URLs to private storage instead of bytes | PASS — after R4, fetches via authenticated `admin.storage.from(bucket).download(path)`; validates content-type or byte-length |
| Any OAuth callback at `/api/auth/oauth-callback` | PASS — lives at `/auth/callback` |
| Any account-deletion route retrying cascade > 1 attempt + 1h Upstash lockout | PASS — `delete-account/route.ts:62-73` enforces |
| Any V0 file remaining in `apps/web/app/auth/` | PASS — `_archive/web/app/auth/` holds V0 |
| Any cron route without `Bearer CRON_SECRET` check | PASS — both `purge-deletion-audit` + `cost-monitor` enforce |
| Any direct `fetch()` to api.upstash.com outside `lib/rate-limit/upstash.ts` | PASS — SDK used; ESLint rule blocks raw fetch |

---

## Disagreements with session 1

1. **Criterion #7 (GDPR export TTL):** Session 1 marked **FAIL** because §13 said 24h while code said 7 days. After R1 doc fix, §13 says 7-day matching §6 1A and §9. The 7-day code value is the **locked** T8 decision per phase chat. **I mark this PASS** — the spec was the stale entry, not the code. The remediation chose the correct direction.

2. **Criterion #18 (Loading state α):** Session 1 marked **PARTIAL** with two regressions noted (verify-email-sent + reset-password VALIDATING). Both healed. **However session 1 missed three additional spinner sites:** signup submit, signin submit, forgot-password submit (PRE) + Resend (POST), and verify-email-invalid (expired) Resend. I flag the criterion as **FAIL** because §6 1B is unambiguous: "Submit button: italic-serif label change. No spinner, no dot-loader." across "all 6 form screens" per §13. The locked labels exist in §6 1B (line 340-346) but are not used in the rendered code. This is a session-1 oversight, not a session-1 fix that didn't take.

3. **Criterion #23 (Cron boot-halt):** Concur with session 1 — pragmatic accept; spec language likely intended "secured against missing env"; request-time 401 satisfies that. Manual gate should clarify intent in Daksh's notes.

4. **Phase doc §1 line 94 + §14 line 717 ("TTL < 24h is bad"):** §14 is a *floor* check, not a cap. 7-day passes. Session 1 implicitly acknowledged this by not flagging §14. I concur.

---

## New findings session 1 missed

1. **Three submit-button spinners on signup/signin/forgot-password.** Detailed under criterion #18. These are the highest-traffic auth screens; the spinner regression is more visible than the two session 1 caught. Mechanical fix; same pattern as the heals already shipped on verify-email-sent + reset-password. Locked labels are already documented in §6 1B (line 340-346): "Creating your account…", "Signing you in…", "Sending reset link…". Resend POST on forgot-password should use "Resending…" (same lock as verify-email-sent resend).

2. **Verify-email-invalid (expired) custom `cova-spinner`.** A `<style jsx>` keyframe rotation rather than the `animate-spin` Tailwind class — but functionally identical and equally a §6 1B violation. The button has the locked label as `aria-label` only ("Sending verification email…"). The user-visible content is the spinner ring; SR users get the label. The spec calls for the *visible* label change, not just an aria-label.

3. **`forgot-password` `Spinner()` is defined twice in the same file (lines 428-436 and 556-564) — minor code duplication, not a spec violation, but worth noting if a remediation lands on this file.

4. **Phase doc §14 line 717 wording**: "Any signed URL with TTL < 24h for downloads, or > 1h for uploads" reads as a lower-bound (≥24h) for downloads and an upper-bound (≤1h) for uploads. The 7-day download TTL satisfies the lower-bound. Not an issue, but the asymmetry is non-obvious; future spec readers might trip on it.

---

## Open spec questions

1. **§6 1B "all 6 form screens"** — the canonical list is signup, signin, forgot-password, reset-password, verify-email-sent (resend button), and the delete-account modal (Phase 9). Verify-email-invalid (expired Resend button) is the 7th surface that has the same loading semantic; spec is silent on whether it inherits the rule. I read it as inheriting (any submit/resend button across the auth flow); cloud chat may rule otherwise.

2. **Disposition of session 1's 6 PENDING-VERIFIER items** — these are explicitly designated as live-environment work. They are not session-2-blocking; they cannot be tested without deployment. They roll forward to manual gate.

---

## Overall verdict

**FAIL — 1 criterion (#18 Loading state α) FAIL with 5 spinner sites unfixed; remediation 1 + 1.5 covered only 2 of 7 sites.**

Specifically:

- **Confirmed PASS:** Remediation R1 (TTL doc fix), R1.5.2 (§1 prose), R2.a (verify-email-sent resend), R2.b (reset-password VALIDATING), R1.5.1 (reset-password ValidBlock submit), R3 (PasswordStrengthMeter wiring), R4 (authenticated storage fetch).
- **Newly flagged FAIL:** signup, signin, forgot-password (PRE submit + POST resend), verify-email-invalid (expired Resend) — five additional `animate-spin` (or equivalent) surfaces still in production code, in violation of §6 1B's "no spinner" rule across "all 6 form screens".

The remediation cycle did not exhaust the §6 1B violations. Session 1 missed three of them; remediation only addressed the two session 1 caught plus the residual session 1 self-flagged in handoff 16 (the reset-password submit). The other five sites — including signup and signin, the highest-traffic auth screens — never entered the remediation backlog.

**REMEDIATION REQUIRED.**

Proposed remediation backlog for round 2 (mechanical, ≤5 files):

1. `apps/web/app/auth/signup/page.tsx:446` — replace `<Spinner />` on `isLoading` with italic-serif "Creating your account…" span.
2. `apps/web/app/auth/signin/page.tsx:377` — replace `<Spinner />` with "Signing you in…" span.
3. `apps/web/app/auth/forgot-password/page.tsx:443` — replace `<Spinner />` with "Sending reset link…" span.
4. `apps/web/app/auth/forgot-password/page.tsx:544` — replace `<Spinner />` (POST resend) with "Resending…" span.
5. `apps/web/app/auth/verify-email-invalid/page.tsx:328` — replace `cova-spinner` element with italic-serif "Sending verification email…" span; remove the `.cova-spinner` keyframe block at lines 142-153.

Each fix is the same pattern already shipped at `verify-email-sent/page.tsx:122-133`. Optional: factor a shared `LoadingLabel` component for the locked labels.

After round 2 lands, fire fresh verifier S1 + S2 against the patched code.

**REMEDIATION REQUIRED**
