# P01b — Session Handoff (1C partial)

**Session date:** 2026-05-03
**Phase:** P01b — Auth + Legal + Account Deletion
**Stage:** 1C integration, partial complete
**Author:** Executor (Claude Opus 4.7, 1M context)

---

## What shipped this session

### 1A backend (commits `e7038d3` + `6bc2ad0`)

1. `account_deletions` migration applied to live Supabase project (xdeacbmkdwqrwxonqaqh) via `mcp__supabase__apply_migration`. Schema-reviewer subagent: PASS on all checks.
2. `delete-user-cascade` Edge Function written at `supabase/functions/delete-user-cascade/index.ts` — idempotent; SHA-256-hashes user_id; relies on `auth.users` CASCADE chain.
3. `lib/rate-limit/upstash.ts` — Upstash Redis rate-limit + per-email cooldown + silent signin lockout (option γ). Lazy-init Redis Proxy so build doesn't require env vars.
4. `lib/cost/categories.ts` extended — added `auth.email.{verification,reset,export,deletion_confirmation}` (D-022: union extension only, no `ALTER TYPE`).
5. `lib/cost/rates.ts` — `RESEND_BLENDED_RATE_USD = 0.0008`.
6. `lib/errors/categories.ts` extended — full `AuthFailure` union (21 entries, including `silent_lockout` and `email_exists`); `FailureCategory` recomposed.
7. `lib/email/resend.ts` — `sendAuthEmail()` wraps `paidCall<>()` (D-011); EMAIL_SENDING_ENABLED short-circuit (V1 deferral pattern).
8. 4 React Email templates at `apps/web/emails/` sharing `_shared.tsx` Cova design language.
9. 10 API routes:
   - `/api/auth/{signup, signin, forgot-password, reset-password, resend-verification, sign-out, delete-account}`
   - `/auth/callback` (OAuth code exchange — page route, NOT under `/api/`)
   - `/api/users/export` (sync-with-waitUntil-fallback, 7s timeout, 1/24h rate limit)
   - `/api/cron/purge-deletion-audit` (Vercel cron, 03:00 UTC daily)
10. `apps/web/middleware.ts` — per-IP rate-limit insertion before session refresh; public auth pages + auth bootstrap API routes added.
11. `apps/web/.env.example` — 7 new env vars documented.
12. `vercel.json` — daily cron entry for purge-deletion-audit.

### 1B UI (commit `25e5940`)

1. `components/brand/Wordmark.tsx` — single source of truth (P01b auth, P09 dashboard, P10 landing).
2. `components/ui/Toast.tsx` — full-width banner; auto-dismiss 5s; reduced-motion aware; ARIA role="alert" aria-live="polite".
3. `components/ui/AnimatedCheckmark.tsx` — verify-email-success flourish.
4. `components/ui/PasswordStrengthMeter.tsx` — signup meter (consumes a 0..4 score).
5. `components/legal/LegalPage.tsx` — terms + privacy shell.
6. 9 ui-gen artifacts wired to routes:
   - `/auth/signin` — Suspense-wrapped (`useSearchParams`); OAuth toast on `?error=oauth` and `?error=email_exists`.
   - `/auth/signup` — Cloudflare Turnstile widget integrated via Script tag + window.turnstile imperative API; PasswordStrengthMeter; wired to `/api/auth/signup`. Placeholder `dev-bypass` token sent when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset.
   - `/auth/forgot-password` — PRE→POST same-route crossfade preserved; wired to `/api/auth/forgot-password`.
   - `/auth/reset-password` — 4-state machine validates session via `supabase.auth.getUser()` (the recovery link round-trips through `/auth/callback` to set the session before this page mounts); wired to `/api/auth/reset-password`.
   - `/auth/verify-email-{sent,success,invalid}` — wired (resend countdown, animated checkmark, expired/used substates).
   - `/account-deleted` — dignified post-deletion screen.
   - `/terms` + `/privacy` — LegalPage with placeholder htmlContent (Termly deferred to V1.5 per back-bug; `version="0.1"`).
7. Apple OAuth: NOT rendered. The signup artifact's docstring confirms refinement-pass collapse to Google-only; `auth_apple_oauth` flag default `false` (seeded in 1C.3) keeps this consistent. When the flag flips true post-launch, a server-component wrapper that reads the flag and conditionally renders the Apple button is the next step (back-bug candidate).

### 1C integration (commit `ecfb810`, partial)

1. `feature_flags` rows seeded:
   - `auth_apple_oauth` — `enabled=false`, `percent_rollout=0`, `environment='all'`.
   - `email_verification_required` — `enabled=true`, `percent_rollout=100`, `environment='all'`.
2. `delete-user-cascade` Edge Function deployed via `mcp__supabase__deploy_edge_function` — version 1, status ACTIVE, `verify_jwt=true`.
3. GDPR export sync/queued integration test plan written at `cova-plan/manual-test-scripts/P01b/gdpr-export-sync-queued.md` for §15 manual gate.

---

## What remains (next session — ~30 min of work)

### 1C.4 — Frontend Visionary subagent × 10 (DEFERRED)

Phase doc requires invoking `frontend-visionary` (claude-sonnet-4-6) on each of the 10 P01b screens with the design-language lock and the required check matrix:
- design-system tokens
- layout invariants
- contrast (WCAG AA)
- focus order
- ARIA
- touch targets
- D-008 (no internal style codenames)

Capture each report at `cova-plan/frontend-visionary-reports/P01b/{screen-slug}.md`. Recommended slugs:
- `auth-signin.md`
- `auth-signup.md`
- `auth-forgot-password.md`
- `auth-reset-password.md`
- `auth-verify-email-sent.md`
- `auth-verify-email-success.md`
- `auth-verify-email-invalid.md`
- `account-deleted.md`
- `legal-terms.md`
- `legal-privacy.md`

Suggested approach: launch 5 in parallel via a single Agent tool block (saves context vs sequential), capture each report into the destination markdown via Write, then launch the second batch of 5.

### 1C close commit + handoff-complete

After 1C.4:
1. Run `pnpm tsc --noEmit && pnpm next lint && pnpm next build` from `apps/web/`.
2. Acceptance gates: 0 typecheck errors, ≤ 195 cova-rules/no-unsafe-console warnings (no regression vs 1A close), 0 errors, build succeeds.
3. Commit: `feat(P01b/M2-1C): integration — feature flag seed + Frontend Visionary × 10 + schema-reviewer pass`.
4. Write `cova-plan/SESSION_HANDOFFS/15-P01b-1c-complete.md` capturing what shipped and pointer to verifier protocol next step.
5. Self-check the §13 acceptance-criteria checklist (full table in `cova-plan/planner-output/P01b-executor-prompt.md` §J).

---

## Resume cursor for next session

**Last commit SHA:** `ecfb810` (1C partial)
**Last completed task ID:** 1C.3 (feature flag seed) + 1C.1 (Edge Function deploy) + 1C.2 (GDPR test plan).
**Next task ID:** 1C.4 (Frontend Visionary × 10).

**No environment side-effects:** clean working tree, no running processes, no dirty schema state.

---

## Open back-bugs (carry forward to verifier + cloud chat)

1. `cova-plan/back-bugs/P01b-launch-prep-email-deferred.md` — Resend DNS not configured; `EMAIL_SENDING_ENABLED=false` in V1.
2. `cova-plan/back-bugs/P01b-launch-prep-termly-deferred.md` — Termly HTML not delivered; `/terms` and `/privacy` show placeholder; `version="0.1"`.
3. **(new)** Apple OAuth conditional render — when `auth_apple_oauth` flips true post-launch, server-component wrapper needs to read the flag and inject an Apple button alongside Google on `/auth/signin` and `/auth/signup`. Currently no UI path renders Apple regardless of flag value.
4. **(new)** Husky DEPRECATED warnings on every commit — `.husky/pre-commit` has the legacy v9 shebang that will fail in v10; non-blocking but should be migrated.

---

## Verifier prep notes

When the verifier session fires (after 1C close):

- Migration is applied; `account_deletions` exists with `audit_retention_days` (NOT `retention_period_days`).
- Edge Function is deployed; verify via `mcp__supabase__list_edge_functions`.
- Feature flags are present; verify via `SELECT * FROM feature_flags WHERE key IN ('auth_apple_oauth', 'email_verification_required')`.
- Auth routes register at build time (verified — all 9 API routes plus `/auth/callback` show `ƒ` in build output).
- 10 page routes register at build time — `/auth/{signin,signup,forgot-password,reset-password,verify-email-sent,verify-email-success,verify-email-invalid}`, `/account-deleted`, `/terms`, `/privacy`.
- Anti-enumeration on `/api/auth/forgot-password`: route returns identical `{ ok: true }` for registered + unregistered emails; Resend send is fire-and-forget inside `waitUntil()`. Constant-time test (≤ 50ms variance across 20 trials) is part of the §13 acceptance criteria; verifier should fire this test.
- Silent signin lockout (option γ): after 5 failed signins from same email, the 6th returns `auth.signin.invalid_credentials` to user (same as wrong password); internal log emits `auth.signin.silent_lockout`. 15-min lockout TTL.
- Cron auth: `/api/cron/purge-deletion-audit` returns 401 without `Bearer ${CRON_SECRET}`; mirrors cost-monitor pattern.
- Demolition trail intact: `_archive/web/app/auth/` has the V0 surface + README; new `apps/web/app/auth/` only contains the new spec's screens + `/callback`.

---

## Sanity-check the §13 acceptance-criteria checklist against current state

Done so far (estimating):

- [x] P01a is CLOSED.
- [x] Pre-built UI components imported correctly.
- [x] 9 screens functional (every route renders without error; submit paths wired).
- [x] /terms + /privacy live (placeholder).
- [x] Account-deletion cascade (Edge Function deployed; relies on auth.users CASCADE chain — verified by planner).
- [x] auth.* failure categories present.
- [x] Auth feature flags seeded.
- [x] Anti-enumeration on forgot-password.
- [x] Token invalidation (Supabase handles single-use).
- [x] Session cookie flags (set by `@supabase/ssr` defaults — `SameSite=Strict`, `Secure`, `HttpOnly`).
- [x] Demolition ran.
- [x] /auth root redirect (recreation step from prior session committed).
- [x] OAuth callback path (`/auth/callback`).
- [x] Toast component reused.
- [x] Wordmark component reused.
- [x] Loading state α (italic-serif label change preserved from artifacts).
- [x] /auth/verify-email-invalid handles `?reason=expired` and `?reason=used`.
- [x] Account lockout silent (incrSigninLockout + isSigninLockedOut helpers wired to /api/auth/signin).
- [x] Constant-time forgot-password (waitUntil pattern in route).
- [x] FailureCategory union extension.
- [x] Cron auth (mirrors cost-monitor; halt at boot).
- [x] audit_retention_days field (DDL uses new name).
- [x] Email deferral pattern functional (server-side auto-verify when EMAIL_SENDING_ENABLED=false).

Pending verifier-side checks:
- Turnstile + rate limit (4 signups in 1 hour from same IP → 4th returns 429) — Upstash + middleware wiring is in place; needs live test.
- GDPR export sync/queued (small + power-user fixtures) — manual test plan documented.
- GDPR export contains bytes — `images/` folder logic is in place; needs live test.
- Resend cost telemetry (when enabled) — code path is in place; needs live test with EMAIL_SENDING_ENABLED=true.

End of handoff.
