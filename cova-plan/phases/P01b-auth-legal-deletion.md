# Phase 1B — Auth + Legal + Account Deletion

**Cova V1 implementation · Phase 1B of 12 · Self-contained**

---

## Phase identity

| | |
|---|---|
| **Phase number** | 1B of 12 |
| **Goal** | Ship the entire user-facing auth surface (6 screens), 9 auth API routes, the `delete-user-cascade` Supabase Edge Function, GDPR data export endpoint, Termly-templated `/terms` and `/privacy` pages, and `/account-deleted`. Seed the auth feature flags. |
| **Executor session estimate** | 3–4 sessions across M2 (1A backend → 1B UI → 1C integration), handoffs at 93–94% context |
| **Calendar estimate** | ~1.5 weeks focused work |
| **Predicted Claude credits** | ~$30–45 |
| **Predicted infra spend** | ~$1 (Resend test sends) |
| **Depends on** | **P01a CLOSED in `PHASE_STATUS.md`** + Resend DNS for `hi@covainterior.com` (G4) + Termly templates rendered (G5) + Apple OAuth status resolved (G8) |
| **Blocks** | Phase 2 (Quiz) and every later phase |

---

## 1. The session loop for this phase

How Phase 1B actually executes, end-to-end.

1. **You open a new claude.ai chat.** Paste this entire phase doc as the first message.
2. **Chat summarizes back.** Reads the doc, summarizes what it understands, lists gaps it sees, lists what it will research. You confirm or correct.
3. **Planner fires.** Chat invokes a fresh Claude Code planner session in `/Users/daksh/Desktop/cova/`. Planner uses Supabase MCP, EXA MCP, Context7 MCP, and web search to: verify drift against `PHASE_STATUS.md`, **confirm P01a is CLOSED**, look up current docs for Supabase Auth (publishable/secret keys), Resend, Termly, Cloudflare Turnstile, zxcvbn, Apple OAuth (if G8 resolves). Then it writes the executor prompt to `cova-plan/planner-output/P1b-executor-prompt.md` and stops.
4. **Executor prompt returns.** You paste the executor prompt back into the cloud chat. Chat verifies it covers every acceptance criterion, includes failure handling, references all hard rules. Approve or send back for revision.
5. **Executor fires.** Verified prompt goes into a fresh Claude Code session. Session executes M2 (1A backend → 1B UI → 1C integration) across 3–4 sessions with handoffs at 93–94% context written to `cova-plan/SESSION_HANDOFFS/`.
6. **Verifier session 1 fires.** Fresh Claude Code session, no executor context. Reads acceptance criteria + live state via Supabase MCP + actual code. Reviews by criterion, not by file. Self-heals detected issues in-session.
7. **Verifier session 2 fires.** Fresh again. No knowledge of session 1 fixes. Reads now-current code, runs same review independently. Session 2 reviews spec from scratch against current code. Session 1 completion claims are ignored. Session 2 is the source of truth.
8. **Manual screenshot review.** You run the manual click-script in §15, capture screenshots into `cova-plan/manual-evidence/P1b/`, paste them back into the cloud chat. Chat reviews against spec. Decision: close phase or remediate.
9. **Document updates.** `PHASE_STATUS.md`, `OPEN_DECISIONS.md`, `EMPIRICAL_FINDINGS.md` (created at this point — zxcvbn threshold validation, Resend deliverability, etc.), Phase 2 prereq section if assumptions changed.

---

## 2. Prereq verification (chat runs before anything else)

If reality diverges from `PHASE_STATUS.md`, halt and write `cova-plan/drift/P1b-detected.md`.

### Filesystem checks
- Repo at `/Users/daksh/Desktop/cova/` accessible
- `apps/web/` exists with Next.js 14.x app router structure
- `cova-plan/PHASE_STATUS.md` shows **Phase 1A as CLOSED** and Phase 1B as NOT STARTED. **Halt if P01a status ≠ CLOSED.**
- `cova-plan/SESSION_HANDOFFS/` exists; the P01a close handoff is present
- `apps/web/.env.local` contains `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `apps/web/.env.local` contains `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### External dependency checks
- Supabase project `xdeacbmkdwqrwxonqaqh` reachable via Supabase MCP; `p1_*` policies from P01a present
- Vercel project deployed at covainterior.com
- Supabase tier: Pro · Vercel tier: Pro
- EXA MCP, Context7 MCP, Supabase MCP all connected in Claude Code
- Resend DNS for both `hi@covainterior.com` (existing G4) AND `auth@send.covainterior.com` (new transactional subdomain — SPF/DKIM/DMARC on `send.covainterior.com`) verified in Resend dashboard
- Termly free-tier templates rendered with Cova specifics (16+ age gate, FTC disclosure, processor list — see G5) and HTML in hand
- Apple OAuth status known (G8): if Apple Developer Program membership active, Apple OAuth ships in V1; else V1.5

### Halt conditions
- P01a not CLOSED → halt
- Resend DNS unverified → halt (cannot send verification emails)
- Transactional subdomain `send.covainterior.com` DNS unverified → halt (cannot send anti-enumeration verification emails)
- Termly templates not rendered → halt (cannot populate `/terms` and `/privacy`)
- Any required MCP not connected → halt, install MCP first

---

## 3. Pre-decisions (resolve before planner fires)

Three gaps owned by P01b. Cloud chat resolves them in conversation with Daksh before invoking the planner. Numbering preserved from the pre-split doc for traceability.

**G4. Resend DNS records.** Two domains required: (a) `hi@covainterior.com` for human-reply email (existing); (b) `auth@send.covainterior.com` for all transactional auth/account email (new — verification, reset, deletion confirmation, GDPR export delivery). Transactional separation prevents bounce/spam reputation damage to the primary `hi@` mailbox. *Resolution:* Daksh checks Namecheap before cloud chat. Both configured → verifier confirms test send from each. Either unconfigured → Phase 1B blocker (see §2 halt conditions).

**G5. Termly templating output.** Free tier locked. Templates not generated yet. *Resolution:* Daksh logs into Termly, generates ToS + Privacy with Cova specifics (16+ age gate, FTC affiliate disclosure, processor list: fal.ai, Anthropic, SearchApi.io, Hive, PhotoDNA, Resend, PostHog, Sentry, Cloudflare, Vercel, Supabase, Modal). Hands rendered HTML to executor. **DEF-002:** Termly free-tier capability check (badge insertion, policy count caps, impression limits) — verified before P01b ships, not before P01a. If free tier insufficient, decision pivots to paid tier or alternative.

**G8. Apple Sign In approval status — two-step gate.** Apple OAuth is enabled in V1 only when BOTH conditions are true: **G8a** Apple Developer Program membership active, **G8b** Apple OAuth provider configured in Supabase Auth dashboard with valid Service ID + Team ID + Key ID + signing key. *Resolution:* Daksh confirms G8a (developer account active) and G8b (Supabase provider wired) before Phase 1B. If either is false, Apple OAuth deferred to V1.5 — only Google OAuth ships in V1. The `auth_apple_oauth` feature flag (seeded in M3 of this phase) reflects: `true` only when G8a AND G8b both verified, `false` otherwise.

---

## 4. Background context (self-contained)

### 4.1 What Cova is

AI interior design product for end consumers. User signs up → takes a 12-pick forced-choice style quiz → sees their style fingerprint with personalized italic descriptor → uploads one photo of a real room → goes through three personalization slots (art, smart tech, lighting mood) → sees an editorial-grade redesigned photo via 8-stage pipeline → can refine with free-form text → can shop the items via Google Lens-powered hotspots with affiliate links. V1 ships when this works end-to-end with ≥80% verifier first-pass and ≤$0.32 cost per render.

### 4.2 What Phase 1B is

The auth + legal + account-deletion half of the original P01. Three things happen:

1. **Auth surface (9 screens + 8 API routes).** Email + password signup with Resend verification, Google OAuth (Apple OAuth conditional on G8), forgot-password with anti-enumeration, reset-password with zxcvbn meter, Cloudflare Turnstile invisible mode, rate limiting via Upstash Redis or Cloudflare WAF, 60s resend cooldowns.

2. **Legal pages.** `/terms` and `/privacy` rendered from Termly templates (16+ age gate, FTC affiliate disclosure, processor list, GDPR/CCPA rights). `/account-deleted` thank-you page.

3. **Account deletion + GDPR export.** `account_deletions` table (service-role-only RLS). `delete-user-cascade` Supabase Edge Function. `POST /api/auth/delete-account` triggers the cascade. `account_deletions` row written with hashed user_id only (no PII retained). `POST /api/users/export` produces a zip of all user data with a 24h-TTL signed URL emailed via Resend.

> **Demolition, ops hardening, subagent setup are out of scope here.** They were completed in P01a — verifier confirms before P01b starts.

### 4.3 Audit findings driving this phase

| Audit | Gap | Phase 1B fix |
|---|---|---|
| AUTH_AUDIT | No Apple OAuth, no anti-enumeration on forgot, no Turnstile, no rate limit, no account-deletion flow | M2 rebuilds entire auth surface |
| INFRA_AUDIT (DNS) | DNS for Resend not set | M2 wires Resend after DNS confirmed (G4 resolves before phase start) |

### 4.4 Existing infrastructure to preserve

- Supabase project `xdeacbmkdwqrwxonqaqh` — DO NOT recreate. Project uses publishable/secret key format (`sb_publishable_*` / `sb_secret_*`). Legacy JWT keys are disabled. Executor uses publishable key in client code, secret key in server code via env.
- Cova landing page already deployed at covainterior.com — Phase 10 redesigns it; Phase 1B leaves it alone
- **iOS app source code is never modified during V1. iOS app runtime behavior against the live backend is NOT protected — destructive backend changes (table drops, column drops, RLS changes) may break the iOS app for current users; iOS gets recoded at redeploy time, not before.**
- 4 Modal apps to keep: `cova-perception`, `cova-empty-room`, `cova-redesign`, `cova-composite-art`. Verifier confirms they're deployed and reachable.
- Test user UUID `62126d57-42df-405c-a38d-3a621f1fe3a8` — preserve for testing
- Vercel project + Pro tier + auto-deploy on push to main
- Supabase Auth: keep, do not recreate; new publishable/secret key format active
- All P01a artifacts: `feature_flags` table, `render_cost_log`, `redactLogPayload`, `paidCall<T>()` wrapper, ESLint custom rules, dotted-namespace `failure_category` union, Sentry across all runtimes, PostHog, Cloudflare Images + R2 wiring, timeout chain, EXIF strip pipeline, `p1_*` RLS policies

---

## 5. Tech stack for this phase

| Layer | Tool | Version / config |
|---|---|---|
| Frontend | Next.js | 14.x (Phase 12 may upgrade to 15) |
| Frontend | React | 18 |
| Language | TypeScript | strict mode |
| Validation | Zod | latest stable |
| Hosting (web) | Vercel | Pro tier |
| Hosting (media) | Cloudflare R2 + Cloudflare Images | Pro |
| Backend | Supabase | Pro tier; publishable/secret keys |
| Email | Resend + React Email | DNS for `hi@covainterior.com` |
| Errors | Sentry | client + server + edge runtimes |
| Analytics | PostHog | EU instance |
| Bot protection | Cloudflare Turnstile | invisible mode |
| Rate limiting | Upstash Redis (per-route/per-user) + Cloudflare WAF (coarse IP layer) | Free tier |
| Password strength | zxcvbn | client-side meter |
| Image processing | Sharp (libvips) | EXIF strip via `.withMetadata({})` |
| Legal templating | Termly | free tier (DEF-002 caveat) |
| Forms | React Hook Form + Zod | |
| State | Zustand (UI) + TanStack Query (server) | |
| Smooth scroll | Lenis | (used Phase 10) |
| Scroll-pin | GSAP ScrollTrigger | (used Phase 10) |
| Component motion | Framer Motion | |
| MCP (planning + verifier) | Supabase, EXA, Context7 | |

### Hard locked rules (D-001..D-022 — apply globally)

- **D-001:** One photo per room. Not video, not multiple photos, not 360.
- **D-002:** No catalog scraping. Ever. Product matching via Google Lens (SearchApi.io) only.
- **D-003:** No LoRAs.
- **D-004:** No multi-reference style images.
- **D-005:** No depth-conditioning ControlNet on Stage 5.
- **D-006:** No multi-pass FLUX.1 → FLUX.2 averaging.
- **D-007:** 12-pick quiz count locked.
- **D-008:** Display names only — never expose internal style codenames.
- **D-009:** EXIF strip mandatory on every uploaded image. Server-side via Sharp.
- **D-010:** `redactLogPayload` before every log statement. ESLint custom rule (from P01a) enforces.
- **D-011:** Cost telemetry on every paid call. `paidCall<T>()` wrapper + ESLint rule (from P01a) enforce.
- **D-012:** `failure_category` populated on every failure path. Dotted namespace format: `auth.signup.email_taken`, `render.stage5.fal_timeout`, etc. P01b adds the full `auth.*` union.
- **D-013:** 8 render stages locked. Don't add, merge, or reorder.
- **D-014:** THREE.js stays at 0.155.0.
- **D-015:** `fetch()` only for fal.ai and Anthropic. No SDK adoption.
- **D-016:** Forced-choice A vs B quiz. Not swipe-or-skip.
- **D-017:** 10 styles taxonomy locked.
- **D-018:** Refine UI is free-form text only.
- **D-019:** Build token infrastructure but DO NOT enforce in V1. `ENFORCE_TOKEN_LIMITS=false`.
- **D-020:** Mood feed dropped from V1 entirely.
- **D-021:** Termly free tier for legal pages. Sarah M Brooklyn placeholder testimonial (Phase 10).
- **D-022:** `render_cost_log.category` is `text` at DB layer; validated as TypeScript union at app layer (`apps/web/lib/cost/categories.ts`). Phases extend the union without `ALTER TYPE` migrations.

---

## 6. Scope

Split into 1A backend / 1B UI / 1C integration. Run in this order.

### 1A — Backend / Auth APIs

**M2 — Auth + Legal**
- Email + password signup with Resend verification (subject "Verify your email — Cova", from `auth@send.covainterior.com` on transactional subdomain, single CTA, 24h token expiry, single-use)
- Google OAuth via Supabase Auth dashboard config
- Apple OAuth (if G8 resolves; else V1.5)
- Forgot-password with anti-enumeration. **Constant-time response via `waitUntil()`**: the API route returns 200 with `{ok:true}` immediately for both registered and unregistered emails (identical body, identical timing). Resend send happens asynchronously inside `waitUntil()` for the registered branch only; send failures captured to Sentry as `auth.forgot.send_fail` (logged, never surfaced to user). User-visible message at the UI layer: "If that email is registered, we sent a reset link."
- Reset-password with zxcvbn 5-segment strength meter, min 8 chars (NIST), 1h token expiry, single-use
- Cloudflare Turnstile invisible mode on signup form, server-side verification
- Rate limiting via **Upstash Redis** for per-route/per-user limits, with Cloudflare WAF as a coarse outer IP layer. Per-route limits:
  - `/api/auth/signup` — 3/hr/IP
  - `/api/auth/signin` — 20/hr/IP. Plus per-email lockout: 5 failed attempts → 15-minute silent lockout (option γ — see below)
  - `/api/auth/forgot-password` — 5/hr/IP. Plus 60s per-email cooldown.
  - `/api/auth/reset-password` — 10/hr/IP. Token-bound single-use enforced by Supabase.
  - `/api/auth/resend-verification` — 5/hr/IP. Plus 60s per-email cooldown.
  - `/api/auth/delete-account` — 1 attempt per user. On failure, 1-hour Upstash lockout before retry permitted.
  - `/api/users/export` — 1 per 24h per user.
  - `/api/auth/sign-out` — no limit.
  **Account lockout (option γ — silent):** Upstash key `lockout:signin:{lowercased_email}`, 15min sliding TTL, increment on every failed signin. At count ≥ 5, the route silently rejects with `auth.signin.invalid_credentials` to the user (identical to a wrong-password response — preserves anti-enumeration AND prevents enumeration via the lockout message itself). Internal log entry uses `auth.signin.silent_lockout` for ops visibility. Accepted UX cost: a legitimate user who keeps trying their correct password during a lockout window sees "Email or password is incorrect" — they may be confused. Documented in EMPIRICAL_FINDINGS.md at phase close. Upstash client wrapper at `apps/web/lib/rate-limit/upstash.ts`.
- 60s resend cooldown on verification + reset emails
- `/terms` page with Termly-templated ToS (16+ age requirement, FTC affiliate disclosure, governing law: Delaware after incorporation)
- `/privacy` page with full Privacy Policy (lists all processors, GDPR/CCPA rights enumerated)
- Account-deletion flow: type-DELETE-to-confirm modal + email confirmation field → POST `/api/auth/delete-account` → Supabase Edge Function `delete-user-cascade` → **immediate hard-delete** of `auth.users` row at t=0 → cascade delete via FK → `account_deletions` audit row (hashed user_id via SHA256, no PII retained, `deletion_reason='user_initiated'`, `audit_retention_days` defaulted to 30) → redirect to `/account-deleted`. Audit row is purged by nightly cron at `/api/cron/purge-deletion-audit` once `deleted_at + audit_retention_days < now()`. The `audit_retention_days` field controls the audit-row retention window only; the user account itself is gone immediately.
- `account_deletions` table created with RLS service-role-only
- GDPR data export endpoint at `POST /api/users/export`. **Sync-with-fallback execution**: the route attempts to generate the zip synchronously with a 7-second internal timeout. If completed within 7s, returns `{ok:true, downloadUrl, expiresAt}` immediately (downloadUrl signed for 7 days). If the timeout fires, returns `{ok:true, status:'queued'}`, the in-flight zip generation continues via `waitUntil()`, and Resend emails the downloadUrl to the user when ready (also 7-day TTL). No new queue dependency. Zip contents (lock):
  - `rooms.json`, `renders.json`, `swipes.json`, `style_fingerprints.json`, `account_deletions.json` (empty for active users)
  - `refines.json` (empty in P01b — Phase 6 populates), `chat_sessions.json` (empty in P01b — Phase 9 populates)
  - `images/rooms/{room_id}.{ext}` — actual bytes downloaded from Cloudflare Images / R2 and packed
  - `images/renders/{render_id}/final.{ext}` — actual bytes; **final render only**, no intermediate stages
  Forward-extensible: each later phase that adds a user-data table extends this endpoint to include it.
- `/account-deleted` page with copy "We're sorry to see you go." Optional brief survey link.
- Cost telemetry on every Resend send. Add to `apps/web/lib/cost/categories.ts`: `auth.email.verification`, `auth.email.reset`, `auth.email.export`, `auth.email.deletion_confirmation`. Add to `apps/web/lib/cost/rates.ts`: `RESEND_BLENDED_RATE_USD = 0.0008` (refined post-launch in EMPIRICAL_FINDINGS.md). Every Resend send wrapped in `paidCall<>()` with the appropriate category + rate. D-011 enforced by P01a ESLint rule.
- Identity merge on email/password → OAuth same-email collision: merge IS allowed if the existing email/password account is **unverified** (OAuth provider's verification supersedes pending email verification). If the existing account is already verified, the OAuth flow returns `auth.oauth.email_exists` and the user is asked to sign in with their original method. New `auth.oauth.email_exists` entry added to AuthFailure union (§11).
- Email-verification flag scope: `email_verification_required` governs only the email/password signup path. OAuth signups (Google now, Apple-if-G8) bypass the gate — providers deliver pre-verified emails.
- V0 demolition is the first step of M2 implementation. Run `git mv apps/web/app/auth/ _archive/web/app/auth/` BEFORE any new auth files land — prevents `/auth/callback` path collision between V0 and the new spec. Add a README.md inside `_archive/web/app/auth/` documenting that the V0 plain email/password + Google surface was deprecated when the luxury auth flow shipped in P01b. After demolition: `apps/web/app/auth/page.tsx` is recreated as a redirect to `/auth/signin`.
- Nightly cron at `/api/cron/purge-deletion-audit/route.ts` purges `account_deletions` rows where `deleted_at + (audit_retention_days * interval '1 day') < now()`. Auth: `Authorization: Bearer ${CRON_SECRET}` header check matching the pattern P01a established in `apps/web/app/api/cron/*` — read existing P01a cron implementation and mirror exactly. Halt at boot if `CRON_SECRET` env var missing.

### 1B — UI (M2 screens)

**Locked design language (all 9 screens — final via P01b prep iterations):**

Reference vibe: Hermès, Aesop, Loro Piana, Saint Laurent. Modern dark luxury. Quiet, confident, editorial.

Color palette:
- bg-cova-navy (#091829) — full-bleed ground on every screen
- text-cova-ivory (#F5F0E8) — primary text
- text-cova-gold (#C9A84C) — used surgically: eyebrow microtype, brand mark em-dash, hairline rule, focus rings, primary button hover
- text-cova-warm-error (#A8443B) — error states only

Typography:
- font-serif (EB Garamond) — italic for editorial moments (auth screen headlines, helper lines, input placeholders); upright for legal prose (/terms, /privacy headings)
- font-sans (DM Sans) — uppercase tracked microtype for all functional labels (eyebrows, button copy, footer links, input labels)
- Always apply utilities explicitly; never rely on body inheritance (back-bug P01b-prep-globals-css-font-bug.md tracks the underlying body font issue)

Layout invariants (8 form screens — all but verify-email-success and legal):
- Full-bleed bg-cova-navy
- Fixed COVA wordmark top-left (16px tracking-[0.4em] uppercase ivory + gold em-dash beneath at 50% opacity)
- 360px form column centered both axes
- Vertical hairline rule on left of form column (border-l border-cova-ivory/12)
- Eyebrow → italic serif headline → optional helper line → 32px gold hairline rule (left-aligned)
- Italic serif placeholders inside bottom-border-only inputs
- Fixed footer link bottom-right (mirrors wordmark for compositional symmetry)
- Sharp corners (0px radius) everywhere
- No shadows, no glows, no particles, no decorative elements

Intentional breaks from the layout invariants:
- /auth/verify-email-success: NO hairline rule, NO fixed footer, gold rule CENTERED (closing typographic punctuation), animated gold checkmark via Frontend Visionary component
- /account-deleted: NO fixed footer (single inline "RETURN HOME" link below content)
- /terms and /privacy: NO form column, NO hairline rule, NO fixed footer — long-form prose layout, max-w-[720px] reading column, sticky page header, upright (non-italic) serif for legal prose

Motion budget per screen (max 3 moments):
1. Form column mount: opacity 0->1 + translateY(8px->0), 400ms ease-out
2. All hover transitions: 200ms ease-out
3. Error banner: opacity 0->1 + translateY(-4px->0), 150ms ease-out

Reduced-motion: mount fades and crossfades replaced with instant render. Hover transitions stay (state changes, not motion). Auto-redirect timers (verify-email-success 3s, reset-password submitted 2s) remain unchanged regardless of motion preference.

**Pre-built UI components live at cova-plan/ui-gen/P01b/. Executor wires them into apps/web/app/auth/* and apps/web/app/{terms,privacy,account-deleted}/* during M2.**

**The 10 screens:**

| Screen | Route | UI source | Bespoke component | Notes |
|---|---|---|---|---|
| Signup | /auth/signup | cova-plan/ui-gen/P01b/auth-signup.tsx | password-strength-meter | Single Google OAuth (Apple deferred per spec) |
| Sign in | /auth/signin | cova-plan/ui-gen/P01b/auth-signin.tsx | — | Single Google OAuth + forgot-password microtype link below password field |
| Forgot password | /auth/forgot-password | cova-plan/ui-gen/P01b/auth-forgot-password.tsx | — | Anti-enumeration: "If an account exists for that email..." |
| Reset password | /auth/reset-password | cova-plan/ui-gen/P01b/auth-reset-password.tsx | password-strength-meter | 4-state machine (validating/valid/invalid/submitted), token from URL ?token= param |
| Verify email sent | /auth/verify-email-sent | cova-plan/ui-gen/P01b/auth-verify-email-sent.tsx | — | Email displayed inline at full opacity within helper line, 60s resend cooldown |
| Verify email success | /auth/verify-email-success | cova-plan/ui-gen/P01b/auth-verify-email-success.tsx | animated-checkmark | Celebration moment — only screen with bigger motion. 3s auto-redirect to /welcome |
| Account deleted | /account-deleted | cova-plan/ui-gen/P01b/account-deleted.tsx | — | No survey link (deliberate brand decision). Single "RETURN HOME" exit |
| Terms of Service | /terms | cova-plan/ui-gen/P01b/legal-page.tsx | — | Shared LegalPage component, instantiated with documentType="terms" + Termly HTML |
| Privacy Policy | /privacy | cova-plan/ui-gen/P01b/legal-page.tsx | — | Shared LegalPage component, instantiated with documentType="privacy" + Termly HTML |
| Verify email invalid | /auth/verify-email-invalid | cova-plan/ui-gen/P01b/auth-verify-email-invalid.tsx | — | 2 substates via URL `?reason=` param: `?reason=expired` (CTA: RESEND VERIFICATION EMAIL → /api/auth/resend-verification → /auth/verify-email-sent with email pre-populated, 60s cooldown reset) and `?reason=used` (CTA: SIGN IN → /auth/signin). Layout invariants apply (full-bleed navy, fixed wordmark, 360px column, hairline rule, eyebrow, italic serif headline, gold rule, sharp corners). Eyebrow / headline / helper / CTA copy locked per the diff and reproduced in §6 1B verify-invalid sub-spec. |

**/auth/verify-email-invalid — copy lock**

`?reason=expired`:
- Eyebrow: "ACCOUNT — LINK EXPIRED"
- Headline: "This link has expired"
- Helper: "Verification links expire after 24 hours. We can send you a new one."
- Primary CTA: "RESEND VERIFICATION EMAIL" → fires `POST /api/auth/resend-verification` → on success transitions to `/auth/verify-email-sent` with the email pre-populated and the 60s cooldown reset.
- Footer: "ALREADY VERIFIED — SIGN IN" → `/auth/signin`.

`?reason=used`:
- Eyebrow: "ACCOUNT — LINK USED"
- Headline: "This link has already been used"
- Helper: "Looks like you've already verified. You can sign in below."
- Primary CTA: "SIGN IN" → `/auth/signin`.
- No footer (CTA already routes to signin).

The verify-email API route classifies the failure → redirects to `/auth/verify-email-invalid?reason=expired` or `?reason=used`. Success continues to `/auth/verify-email-success`. New ui-gen file `cova-plan/ui-gen/P01b/auth-verify-email-invalid.tsx` is generated post-State-5 via Manus using the established design language.

**Locked copy strings (do not change without product approval):**

Anti-enumeration:
- /auth/signin invalid credentials error (under password input): "Email or password is incorrect" — never disclose which is wrong
- /auth/forgot-password POST_SUBMIT helper: "If an account exists for that email, we sent a reset link." — never confirm or deny email registration

Headlines (no period unless declarative complete sentence):
- Signup: "Create an account"
- Signin: "Sign in"
- Forgot password (PRE): "Reset your password"
- Forgot password (POST): "Check your inbox"
- Reset password (VALID): "Set a new password"
- Reset password (INVALID expired): "This link has expired"
- Reset password (INVALID used): "This link has already been used"
- Reset password (SUBMITTED): "Your password has been reset"
- Verify email sent: "Check your inbox"
- Verify email success: "You're in"
- Account deleted: "Your account has been deleted." (PERIOD — declarative complete sentence)

Eyebrows (uppercase tracked microtype with em-dash separator):
- ACCOUNT — NEW (signup)
- ACCOUNT — RETURNING (signin)
- ACCOUNT — RECOVERY (forgot password PRE)
- INBOX — CHECK YOUR EMAIL (forgot password POST, verify email sent)
- ACCOUNT — VERIFYING / RESET PASSWORD / LINK EXPIRED / LINK USED / PASSWORD UPDATED (reset password 4 states)
- INBOX — VERIFY YOUR EMAIL (verify email sent)
- ACCOUNT — VERIFIED (verify email success)
- ACCOUNT — REMOVED (account deleted)
- LEGAL — TERMS OF SERVICE / PRIVACY POLICY (legal pages)

**Brand decisions locked during P01b prep (diverge from original phase doc spec):**

1. Apple OAuth deferred — V1 ships Google-only on signup AND signin. Apple revisited post-launch. Original spec implied both; spec narrowed for V1 simplicity. Phase doc D-rule G8 covers this.

2. Magic link sign-in dropped from V1 — Original spec described inline expansion on /auth/signin. Removed for V1 simplicity (forgot-password covers password recovery; magic link adds complexity for marginal value). Revisit post-launch.

3. Particles + ambient glow on auth screens dropped — Original spec called for drifting gold particles and ambient navy glow. Removed; modern luxury aesthetic favors restraint. Particles never appear; ambient glow never appears.

4. Account deletion survey link dropped — Original spec called for "optional 1-question survey link" on /account-deleted. Removed; luxury brand pattern is to let users go without exit-data extraction. Survey moved to deletion modal in Phase 9 if needed (closer to point of decision).

**Behavior (functional contract, independent of visual design):**
- OAuth flows on success → /welcome (not /dashboard yet — quiz required first)
- Email signup: Supabase Auth creates user → Resend sends verification → /auth/verify-email-sent
- All `/auth/*` routes check session on load. If authenticated, redirect to /dashboard (or /welcome if quiz incomplete)
- Error states: "Email or password is incorrect" on /auth/signin (don't disclose which); identical message during silent-lockout window per option γ (no "account locked" string ever surfaced to user); generic "If an account exists for that email..." for forgot; toast top-of-card on network error (5s auto-dismiss) using the new shared `apps/web/components/ui/Toast.tsx` component; "Couldn't sign in with Google. Try email instead." toast on /auth/signin when arriving with `?error=oauth` query param (set by `/auth/callback` on OAuth provider error).
- Accessibility: proper `<label>` associations, focus order top-to-bottom, visible gold focus rings on `:focus-visible`, form errors via `aria-live="polite"`, Enter submits, Escape doesn't dismiss, WCAG AA color contrast

**Loading state pattern (option α — locked across all 6 form screens):**

When a form is submitting:
- Submit button: italic-serif label change. No spinner, no dot-loader.
- Inputs: visually disabled at 60% opacity, semantically disabled.
- Per-screen labels (lock):
  - Signup: "Creating your account…"
  - Signin: "Signing you in…"
  - Forgot password: "Sending reset link…"
  - Reset password: "Updating your password…"
  - Resend verification: "Resending…"
  - Delete-account modal (Phase 9 territory): "Deleting your account…" (named here for forward consistency)

**Reset-password 4-state machine motion:**

- VALIDATING: italic-serif "Verifying your link…" with a 300ms minimum shimmer placeholder (prevents jarring sub-100ms flash on fast Supabase responses).
- VALIDATING → terminal state (VALID | INVALID-expired | INVALID-used): 200ms ease-out crossfade.
- VALID → SUBMITTED: 200ms ease-out crossfade after API success.
- SUBMITTED → /auth/signin: 2-second auto-redirect (already locked).

**Forgot-password PRE→POST motion:**

Same-route state change (NOT a route navigation). 200ms ease-out crossfade: form fades out as "Check your inbox" + email-displayed-inline fades in. URL stays `/auth/forgot-password`.

**Mobile form-column scaling:**

`width: min(360px, calc(100vw - 32px))`. On viewports ≥392px the column is the full 360px. On iPhone SE (375px) the column is 343px (16px each side). Hairline rule scales accordingly. Wordmark stays top-left and shrinks from 16px tracking-[0.4em] to 14px tracking-[0.4em] on viewports <400px. Wordmark never rotates to top-center — top-left anchor is the system's compositional invariant.

**Footer link copy (locked, mirrors copy in `cova-plan/ui-gen/P01b/*` artifacts):**

| Screen | Footer copy | Routes to |
|---|---|---|
| /auth/signup | EXISTING ACCOUNT — SIGN IN | /auth/signin |
| /auth/signin | NEW TO COVA — CREATE ACCOUNT | /auth/signup |
| /auth/forgot-password (PRE_SUBMIT) | REMEMBER YOUR PASSWORD — SIGN IN | /auth/signin |
| /auth/forgot-password (POST_SUBMIT) | BACK TO SIGN IN | /auth/signin |
| /auth/reset-password (VALIDATING, VALID, INVALID*) | REMEMBER YOUR PASSWORD — SIGN IN | /auth/signin |
| /auth/reset-password (SUBMITTED) | (no footer — auto-redirect) | — |
| /auth/verify-email-sent | ALREADY VERIFIED — SIGN IN | /auth/signin |
| /auth/verify-email-success | (no fixed footer — locked spec) | — |
| /auth/verify-email-invalid (?reason=expired) | ALREADY VERIFIED — SIGN IN | /auth/signin |
| /auth/verify-email-invalid (?reason=used) | (no footer — CTA already routes to signin) | — |
| /account-deleted | (no fixed footer — single inline RETURN HOME link) | / |

`/account-deleted` RETURN HOME destination is `/` (covainterior.com root marketing landing).

The "DIDN'T REQUEST THIS — CONTACT US" security-affordance pattern was discussed and **deferred to V1.5** — introduces a new pattern not in the locked design system.

**Toast component (new, reusable):**

Built fresh at `apps/web/components/ui/Toast.tsx`. Used from this phase forward across the app. Spec:
- Full-width banner inside the form column (not viewport-wide).
- Mounts with 4px slide-down from top of card + 200ms opacity fade.
- Background: `#A8443B` (warm-error) at 8% opacity.
- Text: italic serif, ivory `#F5F0E8`.
- Auto-dismisses after 5 seconds.
- Manual dismiss via inline "DISMISS" close-X (uppercase tracked microtype, gold).
- Reduced-motion: instant render, no slide.
- ARIA: `role="alert"`, `aria-live="polite"`.

**Wordmark component (new, reusable):**

Extracted to `apps/web/components/brand/Wordmark.tsx`. Single source of truth used across all 10 P01b screens, Phase 9 dashboard navbar, Phase 10 landing redesign. Props:
- `align?: "left" | "center"` (default "left"). "left" = fixed top-left for auth screens. "center" = in-flow for legal pages.
- Renders the COVA wordmark with gold em-dash beneath at 50% opacity.
- Scales font size on viewports <400px per mobile spec above.

**OAuth error landing (T25):**

`/auth/callback` on OAuth provider error redirects to `/auth/signin?error=oauth`. The signin page consumes the query param on mount and renders the Toast with copy "Couldn't sign in with Google. Try email instead." from §11 recovery table. No separate `/auth/oauth-error` page.

**Legal page layout (T23 clarification):**

`/terms` and `/privacy` use the shared `LegalPage` component instantiated with the Termly HTML. Eyebrow + serif headline + 32px gold hairline rule are all **left-aligned** with the body prose's reading flow inside the max-w-[720px] reading column. Centered placement was rejected as inconsistent with left-aligned long-form prose. Matches the existing locked `cova-plan/ui-gen/P01b/legal-page.tsx`.

### 1C — Integration + review

- Wire account-deletion flow end-to-end (modal → API route → Edge Function → cascade → audit row → redirect)
- GDPR data export endpoint generates zip with rooms.json, renders.json, swipes.json, image URLs list. Resend signed URL via email.
- Verifier 7-phase pass on M2 (1A backend, 1B UI, 1C integration separately)
- Schema-reviewer pass on `account_deletions` migration
- Adversarial probes pass (see §14)
- Seed feature flag rows for `auth_apple_oauth`, `email_verification_required`
- Frontend Visionary subagent fires per-screen post-implementation. 10 screens, 10 invocations checking design-system tokens, layout invariants, contrast, focus order, ARIA, touch targets, D-008 (no internal style codenames). Findings filed at `cova-plan/frontend-visionary-reports/P1b/`.

---

## 7. Out of scope (executor MUST NOT touch)

- **Demolition, ops hardening, subagent setup** (completed in P01a — verifier confirms before P01b starts)
- Quiz UI / Bayesian engine / quiz schema (Phase 2)
- Capture flow (Phase 3)
- Personalization slots (Phase 4)
- Render pipeline (Phase 5)
- Refine flow (Phase 6)
- Product matching / shop screen (Phase 7)
- Token enforcement (Phase 8 builds infra; enforce stays false)
- Dashboard (Phase 9)
- Landing page redesign (Phase 10 — current landing stays as-is)
- iOS app (source code never touched in V1; runtime not protected — see §4.4)
- 4 live Modal apps (`cova-perception`, `cova-empty-room`, `cova-redesign`, `cova-composite-art`) — verifier confirms reachable, executor doesn't modify
- Stripe / billing UI (V1.5)
- 2FA / TOTP (V1.5)
- Social sign-in beyond Google + Apple (V1.5)

---

## 8. Files touched (expected paths)

### Created
- `apps/web/middleware.ts` (rate limiting; updated)
- `apps/web/app/auth/signup/page.tsx`
- `apps/web/app/auth/signin/page.tsx`
- `apps/web/app/auth/forgot-password/page.tsx`
- `apps/web/app/auth/reset-password/page.tsx`
- `apps/web/app/auth/verify-email-sent/page.tsx`
- `apps/web/app/auth/verify-email-success/page.tsx`
- `apps/web/app/account-deleted/page.tsx`
- `apps/web/app/terms/page.tsx`
- `apps/web/app/privacy/page.tsx`
- `apps/web/app/api/auth/signup/route.ts`
- `apps/web/app/api/auth/signin/route.ts`
- `apps/web/app/auth/callback/route.ts` (OAuth callback path matches Supabase SSR docs; `/api/auth/oauth-callback` rejected as inconsistent with Supabase pattern)
- `apps/web/app/api/auth/forgot-password/route.ts`
- `apps/web/app/api/auth/reset-password/route.ts`
- `apps/web/app/api/auth/resend-verification/route.ts`
- `apps/web/app/api/auth/delete-account/route.ts`
- `apps/web/app/api/auth/sign-out/route.ts`
- `apps/web/app/auth/verify-email-invalid/page.tsx`
- `apps/web/app/api/cron/purge-deletion-audit/route.ts`
- `apps/web/components/ui/Toast.tsx`
- `apps/web/components/brand/Wordmark.tsx`
- `apps/web/lib/rate-limit/upstash.ts`
- `apps/web/lib/cost/rates.ts` (if not already present from P01a — verify before creating)
- `apps/web/app/api/users/export/route.ts`
- `supabase/functions/delete-user-cascade/index.ts`
- `apps/web/lib/errors/categories.ts` — **extended** with the full `AuthFailure` dotted union (P01b owns the `auth.*` prefix)

### Demolition (runs FIRST in M2)

Before any new auth file is created, run:
- `git mv apps/web/app/auth/ _archive/web/app/auth/` (mirrors P01a Decision 11 demolition pattern; `_archive/` lives at REPO ROOT, NOT under `apps/web/`)
- Write `_archive/web/app/auth/README.md` documenting that the V0 plain email/password + Google OAuth surface was deprecated in P01b when the luxury auth flow shipped. Reference: `cova-plan/phases/P01b-auth-legal-deletion.md`.

After demolition completes, `apps/web/app/auth/page.tsx` is recreated as a single-purpose redirect to `/auth/signin` (server component, `redirect("/auth/signin")` from `next/navigation`).

This step prevents `/auth/callback` path collision between the V0 callback and the new spec's callback at the same path.

### Migrations (reversible with paired _down.sql)
- `supabase/migrations/{ts}-account-deletions-table.sql`

### Modified
- `apps/web/lib/feature-flags/index.ts` (consumer of seeded auth flags)
- Whatever existing files need to wire the new auth screens into the navigation surface (cloud chat may add specifics during planning)
- `apps/web/lib/cost/categories.ts` — extend with `auth.email.verification`, `auth.email.reset`, `auth.email.export`, `auth.email.deletion_confirmation` (T15)
- `apps/web/lib/errors/categories.ts` — extend `FailureCategory` union by importing existing P01a slices unchanged and unioning with the full `AuthFailure` type. **Do NOT redeclare from scratch** — that would silently drop other phases' slices when later phases extend. New AuthFailure entries beyond §11's original list: `auth.signin.silent_lockout` (C-3a γ) and `auth.oauth.email_exists` (B-12a).
- `apps/web/app/auth/page.tsx` — replaced with redirect to `/auth/signin` (post-demolition recreation, T24)

---

## 9. API contracts

### POST /api/auth/signup
```
Body: { email: string, password: string, turnstileToken: string }
Validation: zxcvbn score ≥2, email regex, Turnstile server-verify
Rate limit: 3/hr/IP
Returns: { ok: true } or { ok: false, failure_category, user_message }
Side effects: Supabase Auth user created, Resend verification email sent, token_ledger row +7
```

### POST /api/auth/signin
```
Body: { email: string, password: string }
Returns: { ok: true, redirectTo: string } or error envelope
Side effects: session cookie set, sign-in event PostHog
```

### POST /api/auth/forgot-password
```
Body: { email: string }
Returns: { ok: true } ALWAYS (anti-enumeration)
Side effects: if email registered, Resend reset email; else no-op
Cooldown: 60s per email
```

### POST /api/auth/reset-password
```
Body: { token: string, newPassword: string }
Validation: zxcvbn ≥2, token unused + unexpired
Returns: { ok: true } or error envelope
```

### POST /api/auth/delete-account
```
Body: { confirmText: "DELETE", confirmEmail: string }
Validation: confirmEmail matches user.email; confirmText exact
Returns: { ok: true, redirectTo: "/account-deleted" }
Side effects: triggers Edge Function delete-user-cascade
```

### GET /auth/callback (OAuth)

OAuth callback path matches Supabase SSR docs (was `/api/auth/oauth-callback` — rejected as inconsistent). Planner details full contract; on provider error, redirects to `/auth/signin?error=oauth` (T25).

### POST /api/auth/sign-out
Body: {} (auth from session)
Returns: { ok: true, redirectTo: '/' } or error envelope
Side effects: clears Supabase session cookie via createServerClient signOut(); client also calls posthog.reset() so subsequent anonymous events aren't attributed to the signed-out user
Rate limit: none

### POST /api/users/export
Body: {} (auth from session)
Returns (sync — completed within 7s):
  { ok: true, downloadUrl: string, expiresAt: ISO }
Returns (queued — internal timeout fired):
  { ok: true, status: 'queued' }
Side effects (sync): generates zip in-process; signed URL with 7-day TTL
Side effects (queued): waitUntil() continues zip generation; Resend email at auth@send.covainterior.com with downloadUrl when ready (also 7-day TTL)
Rate limit: 1 per 24h per user

Zip contents per §6 1A. Forward-extensible across phases.

### Rate-limit summary (full T2 table)

| Route | Per-IP | Per-email/user | Storage |
|---|---|---|---|
| /api/auth/signup | 3/hr | — | Upstash |
| /api/auth/signin | 20/hr | 5 fails → 15min silent lockout (option γ) | Upstash |
| /api/auth/forgot-password | 5/hr | 60s cooldown | Upstash |
| /api/auth/reset-password | 10/hr | token-bound (single use, Supabase-managed) | Upstash + Supabase |
| /api/auth/resend-verification | 5/hr | 60s cooldown | Upstash |
| /api/auth/delete-account | — | 1 attempt / user; 1h release on failure | Upstash |
| /api/users/export | — | 1 / 24h / user | Upstash |
| /api/auth/sign-out | — | — | — |

Cloudflare WAF rules sit above Upstash as a coarse outer IP layer (configured in CF dashboard, no code dep).

All routes use Unit-1 error envelope: `{ ok: false, failure_category: '<dotted.category>', user_message: '<safe>', detail: '<dev-only>' }`

---

## 10. Schema migrations (full DDL)

### account_deletions
```sql
CREATE TABLE account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_user_id text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deletion_reason text CHECK (deletion_reason IN ('user_initiated','admin_initiated','gdpr_request','ccpa_request')),
  audit_retention_days int NOT NULL DEFAULT 30
);
CREATE INDEX account_deletions_deleted_at_idx ON account_deletions(deleted_at DESC);
ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;
-- No policies = service-role-only access
```
Down: `DROP TABLE account_deletions;`

> Service-role-only tables get no policies, just RLS enabled — consistent with the P01a pattern for `pipeline_runs`. No `p1_` prefix needed because no policy is created.

> 30-day audit-row retention. The `account_deletions` row holds the audit hash only; the user's auth.users row is hard-deleted at t=0. The audit row is purged by nightly cron at /api/cron/purge-deletion-audit once `deleted_at + audit_retention_days < now()`.

---

## 11. Failure handling

### Dotted-namespace `failure_category` (Decision 8) — `auth.*` prefix owned by P01b

```typescript
// apps/web/lib/errors/categories.ts (P01b extension; merged with P01a-owned slices)
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
  | 'auth.forgot.send_fail'        // returns generic to user, logged as detail
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

The umbrella `FailureCategory` union (defined in P01a) is extended with `AuthFailure` here.

### Recovery actions
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

---

## 12. Cost budget

| Source | Estimated cost |
|---|---|
| Claude credits (planner + executor + verifier × 2) | $30–45 |
| Resend test sends (~50) | <$1 |
| Cloudflare Turnstile | free tier |
| Termly | free tier (DEF-002 caveat) |
| Supabase reads/writes during dev | within Pro tier |
| Vercel deploys | within Pro tier |
| Sentry events | within free tier (<50k/mo) |
| PostHog events | within free tier |
| **Total** | **~$32–47** |

---

## 13. Verifier focus areas (Layer 1 source-of-truth checklist)

Verifier session 1 reviews by criterion. Each acceptance criterion mapped to a verifiable artifact. **Verifier session 2 reviews spec from scratch against current code. Session 1 completion claims are ignored. Session 2 is the source of truth.**

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

### Verifier session 2 cross-check

Session 2 reads now-current code with no knowledge of session 1 fixes. Specifically hunts for:
- New issues introduced by session 1's fixes
- Issues session 1 might have rationalized past
- Disagreements with session 1's fix decisions (flag, don't re-edit)
- Test coverage of edge cases session 1 might have skipped

Session 2's report is binding when it disagrees with session 1.

---

## 14. Adversarial code review checklist

Verifier specifically hunts for these patterns in Phase 1B surface:

- [ ] Any API route without `failure_category` populated in error path (must use `auth.*` for auth routes)
- [ ] Any signed URL with TTL < 24h for downloads, or > 1h for uploads
- [ ] Any auth route without rate limit middleware
- [ ] Any forgot-password endpoint that leaks whether email exists
- [ ] Any password reset that doesn't invalidate the token after use
- [ ] Any verify-email route that doesn't invalidate the token after use
- [ ] Any session cookie without `SameSite=Strict` and `Secure`
- [ ] Any account-deletion path that retains PII in audit row
- [ ] Any Turnstile call without server-side verification (client-only would be bypassable)
- [ ] Any direct `fetch()` to api.resend.com from outside `apps/web/lib/paid/call.ts` (the P01a ESLint rule must catch this)
- [ ] Any `console.error|log|warn|info|debug` of an object not wrapped in `redactLogPayload` (the P01a ESLint rule must catch this)
- [ ] Any rate-limit middleware that doesn't actually call Upstash (mock that always returns "allowed")
- [ ] Any signin endpoint that surfaces lockout state to the user (must be silent per option γ — "Email or password is incorrect" is the only message)
- [ ] Any GDPR export that includes URLs to private storage instead of bytes
- [ ] Any OAuth callback at `/api/auth/oauth-callback` (path must be `/auth/callback`)
- [ ] Any account-deletion route that retries cascade more than the spec allows (1 attempt + 1h Upstash lockout on failure)
- [ ] Any V0 file remaining in `apps/web/app/auth/` that should have moved to `_archive/web/app/auth/`
- [ ] Any cron route without `Authorization: Bearer ${CRON_SECRET}` check
- [ ] Any direct `fetch()` to api.upstash.com from outside `apps/web/lib/rate-limit/upstash.ts`

**CSRF mitigation note (verifier should NOT flag absence as a gap):**

P01b uses defense-in-depth via SameSite=Strict on the session cookie + business-logic confirmation (confirmText="DELETE" + confirmEmail = user.email on /api/auth/delete-account; `/api/users/export` is non-destructive and only emails to the user's own address). No separate CSRF middleware is included. If V1.5 adds non-confirming destructive endpoints, revisit.

---

## 15. Manual click-script (human gate after verifier passes)

> All 9 screens are visually pre-locked via `cova-plan/ui-gen/P01b/*` artifacts (P01b prep, May 2026). Manual click-script verifies functional behavior + brand consistency, not visual design — the design contract is fixed.

You execute this sequence, capturing screenshots at marked steps. Save to `cova-plan/manual-evidence/P1b/`.

### Auth happy path
1. Open `https://covainterior.com` in incognito → click "Sign up" → /auth/signup loads **[screenshot A1: signup-empty.png]**
2. Enter test email + weak password ("123") → see zxcvbn meter at red, submit blocked
3. Enter strong password ("correct horse battery staple") → meter at green
4. Submit → /auth/verify-email-sent loads **[screenshot A2: verify-sent.png]**
5. Open Resend dashboard → confirm email sent → open in inbox → click "Verify email"
6. /auth/verify-email-success loads with gold checkmark animation → 3s auto-redirect to /welcome **[screenshot A3: verify-success.png]**
6a. Open Resend dashboard → resend the verification email to test user → click the same verify link a second time → /auth/verify-email-invalid?reason=used loads with eyebrow ACCOUNT — LINK USED + headline "This link has already been used" + SIGN IN CTA **[screenshot A8a: verify-link-used.png]**
6b. Manually expire a verification token via Supabase admin (or wait 24h) → click the expired link → /auth/verify-email-invalid?reason=expired loads with eyebrow ACCOUNT — LINK EXPIRED + headline "This link has expired" + RESEND VERIFICATION EMAIL CTA. Click the CTA → expects transition to /auth/verify-email-sent with email pre-populated and the 60s cooldown timer reset **[screenshot A8b: verify-link-expired.png]**
7. Sign out → return to /auth/signin **[screenshot A4: signin-empty.png]**
8. Enter wrong password 5 times → see lockout message **[screenshot A5: signin-locked.png]**
9. Wait 15 min OR clear lockout via Supabase admin → sign in successfully → /dashboard or /welcome

### OAuth path
10. Sign out → /auth/signup → click "Continue with Google" → Google OAuth flow → return to /welcome **[screenshot A6: oauth-google.png]**
11. (If Apple OAuth approved) Sign out → /auth/signup → "Continue with Apple" → return to /welcome **[screenshot A7: oauth-apple.png]**

### Forgot/reset password
12. /auth/signin → "Forgot password?" → enter registered email → see "If that email is registered..." message **[screenshot A9: forgot-confirm.png]**
13. Repeat with unregistered email → SAME message (anti-enumeration verified) **[screenshot A10: forgot-anti-enum.png]**
14. Click reset link in email → /auth/reset-password loads with token in URL **[screenshot A11: reset-form.png]**
15. Enter new strong password → submit → success → redirect to /auth/signin
16. Sign in with new password → success
17. Try old reset link → "Token expired" message **[screenshot A12: reset-token-expired.png]**
17a. After successful reset (step 15), reopen the SAME reset link from email → /auth/reset-password renders the INVALID-used state with eyebrow LINK USED + headline "This link has already been used" **[screenshot A12a: reset-link-used.png]**

### Rate limit
18. Test the full T2 rate-limit table (use 4+ incognito windows + Postman as needed):
  - Signup: 4th attempt within 1 hour from same IP returns 429 **[A13a]**
  - Signin: 21st attempt/hour from same IP returns 429 **[A13b]**
  - Signin per-email: 6th failed attempt for the same email from any IP returns `auth.signin.invalid_credentials` (silent lockout — same message as wrong password, NOT a separate "locked" message) **[A13c]**
  - Forgot-password: 6th attempt/hour from same IP returns 429; 2nd attempt within 60s for the same email returns cooldown **[A13d]**
  - Resend-verification: 6th attempt/hour from same IP returns 429 **[A13e]**
  - Export: 2nd attempt within 24h from same user returns 429 **[A13f]**

### Turnstile
19. Disable JS in browser → attempt signup → submit blocked because Turnstile didn't fire **[screenshot A14: turnstile-block.png]**

### Legal pages
20. Open `/terms` → confirm full ToS renders, "Last updated" date present, FTC affiliate disclosure present **[screenshot A15: terms.png]**
21. Open `/privacy` → confirm full Privacy Policy, all processors listed, GDPR/CCPA rights enumerated **[screenshot A16: privacy.png]**

### Account deletion
22. Sign in as test user → navigate to (placeholder; real path lives in Phase 9 settings) → trigger delete-account API directly via Postman/curl
23. POST `/api/auth/delete-account` with `{confirmText: "DELETE", confirmEmail: "<email>"}` → returns 200 with redirectTo
24. Open /account-deleted → confirm page renders **[screenshot A17: account-deleted.png]**
25. Verify Supabase: user row gone from auth.users, all rooms cascade-deleted, `account_deletions` audit row exists with hashed_user_id only (no email)
26. Try to sign in with deleted email → fails normally (not "this account was deleted" — anti-enumeration)

### GDPR export
27. Sign in → POST `/api/users/export` → wait → check email for download link → download zip → confirm contains rooms.json, renders.json, swipes.json, image_urls.txt **[screenshot A18: gdpr-export.png]**

### Reduced motion
28. Enable OS reduce-motion → reload /auth/signup → mount fade replaced with instant render (no opacity/translate animation); hover state changes still trigger (color only, no easing); auto-redirect timers (verify-email-success 3s, reset-password submitted 2s) remain unchanged regardless of motion preference **[screenshot A19: reduced-motion.png]**

### Mobile responsive
29. Open all 6 auth screens on iPhone Safari → confirm card resizes to 100% minus 24px each side **[screenshots A20-A25: mobile-{signup,signin,forgot,reset,verify-sent,verify-success}.png]**

### OAuth + identity merge + GDPR
30. OAuth provider error path: open Google OAuth flow from /auth/signup → click "Cancel" / deny consent on Google's screen → return to /auth/signin?error=oauth → toast renders with copy "Couldn't sign in with Google. Try email instead." **[screenshot A26: oauth-error-toast.png]**

31. Identity merge (B-12a):
  (a) Sign up with email/password using a fresh email; do NOT click the verification link.
  (b) Sign out → /auth/signup → click "Continue with Google" using the SAME email → expect successful merge into Google identity, account flips to verified, redirect to /welcome **[screenshot A27: identity-merge-success.png]**
  (c) Repeat the test but with a verified email/password account; OAuth sign-in attempt with same email returns toast "An account already exists for that email. Sign in with your password instead." (failure category: `auth.oauth.email_exists`) **[screenshot A28: identity-merge-blocked.png]**

32. GDPR export queued path: force a power-user fixture (test user with 100+ rooms) → POST /api/users/export → expects `{ok:true, status:'queued'}` body → check the test inbox within 5min for the Resend email containing the downloadUrl **[screenshot A29: gdpr-export-queued-email.png]**

33. GDPR export zip content verification: open the downloaded zip → confirm `images/rooms/*` directory contains actual JPEG/PNG byte streams (open one in an image viewer to verify) → confirm `rooms.json`, `renders.json`, `swipes.json`, `style_fingerprints.json`, `account_deletions.json` are all present (some may be empty arrays for newly-active users — that's expected) **[screenshot A30: gdpr-export-zip-contents.png]**

---

## 16. Manual evidence bundle

Save to `cova-plan/manual-evidence/P1b/`:

- 25+ screenshots from §15 click-script
- Resend dashboard screenshot showing verification + reset emails sent
- Supabase dashboard screenshot showing `account_deletions` row after test deletion (hashed_user_id only)
- Termly dashboard screenshot showing the templates currently published to `/terms` and `/privacy`
- `INDEX.md` linking each artifact to the spec criterion it evidences

---

## 17. Remediation budget

(Cross-references §14 adversarial checklist.)

- **Round 1:** Verifier session 1 self-heals issues found.
- **Round 2:** Verifier session 2 finds new issues OR introduced regressions → fresh executor session fixes via remediation prompt.
- **Round 3 (escalation):** If verifier still fails → write `cova-plan/escalations/P1b.md` describing what's blocked. Stop. Open planning conversation in cloud chat to revise Phase 1B scope.

If manual click-script fails after verifier passes → fresh executor session via remediation prompt. Manual gate does NOT count against the 2-round budget — your judgment is final.

---

## 18. Closing checklist (run at phase close)

- [ ] All 25+ screenshots captured in `cova-plan/manual-evidence/P1b/`
- [ ] Manual click-script INDEX.md written
- [ ] `PHASE_STATUS.md` Phase 1B → CLOSED with date; Phase 2 → READY TO START
- [ ] `OPEN_DECISIONS.md` updated with any new D-NNN decisions surfaced during P01b execution
- [ ] `EMPIRICAL_FINDINGS.md` **created at this point** with results from P01b verifier reports that constrain later phases (zxcvbn score-2 threshold validated, Resend deliverability rate, etc.)
- [ ] Phase 2 prereq section reviewed for any assumptions changed
- [ ] Sentry dashboard shows Phase 1B deploy events captured cleanly
- [ ] PostHog dashboard shows Phase 1B events firing
- [ ] Verifier reports archived at `cova-plan/verifier-reports/P1b-session-1.md` and `P1b-session-2.md`
- [ ] Session handoffs at `cova-plan/SESSION_HANDOFFS/` for every executor session
- [ ] `git log` shows clean commits per milestone (no fixup commits squashed)
- [ ] EMPIRICAL_FINDINGS.md documents option γ silent-lockout DoS surface + decision rationale
- [ ] EMPIRICAL_FINDINGS.md documents Resend blended cost rate vs actuals after first month of production sends
- [ ] Frontend Visionary reports archived for all 10 screens at `cova-plan/frontend-visionary-reports/P1b/`
- [ ] All V0 auth files moved to `_archive/web/app/auth/` with README
- [ ] /auth root redirects to /auth/signin (verifier confirmed)
- [ ] OAuth callback at /auth/callback (verifier confirmed)

---

## 19. Rollback plan

If Phase 1B merge breaks production:

1. Revert merge commit on main → Vercel auto-deploys previous state → production restored
2. Run paired `_down.sql` migration via Supabase Studio:
   - `account-deletions-table` down (`DROP TABLE account_deletions`)
3. Disable `delete-user-cascade` Edge Function in Supabase dashboard
4. Empty / unpublish `/terms` and `/privacy` Termly content if a content issue triggered the rollback
5. Reset auth feature flag rows (`auth_apple_oauth`, `email_verification_required`) to safe defaults
6. Update `PHASE_STATUS.md` Phase 1B → REMEDIATING
7. Open cloud chat, diagnose, prepare remediation prompt

---

## 20. Feature flags introduced

P01b **seeds** the following rows into the `feature_flags` table (table itself was created in P01a):

| Flag key | Description | Default |
|---|---|---|
| `auth_apple_oauth` | Apple Sign In available on auth screens | `false` by default; `true` only when **both** G8a (Apple Developer Program membership active) AND G8b (Supabase Apple provider configured in dashboard with valid Service ID, Team ID, Key ID, signing key) are verified per §3 |
| `email_verification_required` | Block signup completion until email verified | true |

Phase 5+ adds more flag rows; the table schema does not change.

---

## 21. Document updates at phase close

These docs get updated/created when Phase 1B closes:

1. **`PHASE_STATUS.md`** — Phase 1B → CLOSED with date; Phase 2 → READY TO START
2. **`OPEN_DECISIONS.md`** — append any new D-NNN decisions surfaced during P01b execution; `DEF-002` (Termly free-tier capability check) is resolved here — update accordingly
3. **`EMPIRICAL_FINDINGS.md`** — **created at this point**. Seeded with: zxcvbn score-2 threshold validated against 50 sample passwords; Resend deliverability rate (target: 100% on 50 test sends); Resend blended cost rate ($0.0008 estimated, refined post-launch with first-month actuals); Apple OAuth final ship/defer decision (per G8a + G8b); Termly free-tier sufficiency note; **option γ silent-lockout DoS-surface tradeoff documented** (per-email lockout enables limited DoS against arbitrary email addresses with 15min recovery; accepted as acceptable for early-stage product).
4. **`cova-plan/phases/P02-quiz.md`** — review prereq section (§2 of P02) for any assumptions changed during Phase 1B execution
5. **Phase 1B handoff at `cova-plan/SESSION_HANDOFFS/NN-P1b-close.md`** — final handoff capturing everything done

---

## End of Phase 1B doc.

Next: Phase 2 (Style Quiz). Phase 2 doc lives at `cova-plan/phases/P02-quiz.md`.
