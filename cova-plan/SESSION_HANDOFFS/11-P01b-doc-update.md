# P01b doc update — session handoff

**Date:** 2026-05-03
**Phase:** P01b
**Session type:** Doc update only (no planner, no executor)
**Source:** Cloud chat of 2026-05-03 resolved 15 technical gaps (T1-T15) + 14 UI gaps (T16-T29) + B-2a, B-2b, B-6a, B-12a, C-3a, C-8a, C-8b, C-14a, C-15a sub-decisions.

## What changed

Tech:
- Upstash rate-limit table locked (T2): per-route limits + per-email lockout for signin
- Silent-lockout option γ adopted (T3 + C-3a): 5 fails → 15min lockout that returns `auth.signin.invalid_credentials` to the user; logs `auth.signin.silent_lockout` internally
- Constant-time forgot-password via `waitUntil()` (T4): identical timing/body for registered + unregistered emails
- `account_deletions.retention_period_days` renamed to `audit_retention_days` (T5); nightly cron at `/api/cron/purge-deletion-audit` enforces; user account hard-deleted at t=0
- OAuth callback path standardized to `/auth/callback` per Supabase SSR docs (T7); §8 file path updated, §9 stub added, verifier/adversarial entries hunt for the rejected `/api/auth/oauth-callback` path
- GDPR export 7-day TTL + sync-with-`waitUntil()`-fallback (T8); zip packs actual image bytes (final renders only), not URLs; forward-extensible across phases
- Resend split into transactional subdomain `auth@send.covainterior.com` (T9); §2 halt condition added
- POST /api/auth/sign-out contract added (T11) including `posthog.reset()` requirement
- Email-verification flag scope clarified (T12); identity merge rules locked (B-12a) with new `auth.oauth.email_exists` AuthFailure entry
- Apple flag two-step gate G8a + G8b (T13)
- `apps/web/lib/errors/categories.ts` must extend the umbrella, not redeclare (T14)
- Resend cost telemetry categories + `RESEND_BLENDED_RATE_USD = 0.0008` (T15)

UI:
- Loading state pattern α locked (T16) — italic-serif label change, no spinner; per-screen labels locked
- Reset-password 4-state motion timings (T17): 300ms shimmer min on VALIDATING, 200ms ease-out crossfades
- Footer copy table aligned to ui-gen artifacts (T18); /account-deleted RETURN HOME → `/`
- Mobile form-column scaling: `width: min(360px, calc(100vw - 32px))` (T19)
- §15 step 28 reduce-motion behavior replaced (T20)
- New shared `apps/web/components/ui/Toast.tsx` (T21) used for all 6 form screens' network errors + OAuth-error toast
- /account-deleted RETURN HOME destination locked to `/` (T22)
- Legal page eyebrow left-aligned (T23) — confirmed against locked `legal-page.tsx`
- V0 demolition to `_archive/web/app/auth/` runs FIRST in M2 (T24); /auth root recreated as redirect to /auth/signin
- OAuth provider error → /auth/signin?error=oauth → toast (T25); no separate `/auth/oauth-error` page
- New 10th screen `/auth/verify-email-invalid` with `?reason=expired` and `?reason=used` substates, copy locked (T26 + B-6a)
- Shared `apps/web/components/brand/Wordmark.tsx` (T27)
- Forgot-password PRE→POST same-route 200ms crossfade (T28)
- Frontend Visionary subagent fires per-screen × 10 post-implementation (T29)

§15 manual click-script extended with steps 6a, 6b, 17a, 30, 31, 32, 33 covering verify-link reuse, OAuth error, identity merge, GDPR queued path, GDPR zip content verification. Step 18 expanded to full T2 table.

## What did NOT change

- §17 (remediation budget) — no structural change
- §19 (rollback plan) — no structural change required, but rollback of new account_deletions schema name uses the new column
- Pre-locked UI artifacts in cova-plan/ui-gen/P01b/ — none modified by this update; the new `auth-verify-email-invalid.tsx` artifact will be generated separately via Manus AFTER this doc update commits.

## Open follow-ups

- Generate `cova-plan/ui-gen/P01b/auth-verify-email-invalid.tsx` via Manus using established design language. Same prompt template as the other 9 auth screens. Required before executor M2-1B subphase begins.
- Run Prompt 2 (planner) when ready.

## Next step

Run Prompt 2 in a fresh Claude Code session to fire the planner.
