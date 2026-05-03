# Back-bug: Email infrastructure deferred to V1.5 launch prep

**Status:** OPEN
**Created:** 2026-05-03
**Phase:** P01b
**Severity:** Launch prerequisite (blocking public launch)

## What's deferred

Resend email sending is gated behind EMAIL_SENDING_ENABLED env var (default false). All email-sending code is fully implemented and ready to activate. P01b ships with this flag set to false.

## What works in V1

- Signup creates accounts; users are auto-marked as verified server-side
- OAuth (Google) signup/signin works fully (no email needed)
- Email/password signin works once auto-verified user has signed up
- Account deletion + cascade works
- GDPR export generates zip and signed URLs (just doesn't email them)

## What's broken in V1

- "Forgot password" flow: user submits email, sees "If an account exists, we sent a reset link", but never receives email. Cannot recover password without manual admin intervention.
- Email verification: bypassed entirely. Anyone can claim any email address without proving ownership.
- GDPR export: user gets sync downloadUrl response if zip completes in <7s; if queued, user is told to check email but no email arrives.
- Account deletion confirmation: deletion works but no confirmation email sent.

## Mitigation during V1

- Either restrict signup to OAuth-only (Google) until email is enabled
- OR accept the support burden: users contact hi@covainterior.com for password resets, manually reset via Supabase admin dashboard
- OR launch in invite-only / alpha mode where users have direct access to founder

## How to enable post-launch (estimated 30-60 min)

1. Sign up for Resend account at resend.com
2. Add `send.covainterior.com` as transactional subdomain
3. Add SPF/DKIM/DMARC DNS records to Namecheap
4. Wait for Resend domain verification (5-30 min DNS propagation)
5. Generate API key with sending permission scoped to send.covainterior.com
6. Add to production env: EMAIL_SENDING_ENABLED=true and RESEND_API_KEY=re_xxx
7. Redeploy
8. Send test email via Resend dashboard to verify delivery
9. Test full signup flow with real verification email

## Code present but inactive

- apps/web/lib/email/resend.ts — sendAuthEmail wrapper (active when flag true)
- apps/web/emails/signup-verify.tsx — React Email template (referenced when flag true)
- apps/web/emails/forgot-password.tsx — same
- apps/web/emails/gdpr-export-ready.tsx — same
- apps/web/emails/deletion-confirmation.tsx — same

When EMAIL_SENDING_ENABLED=false, sendAuthEmail short-circuits with synthetic success ({data: {id: 'email-disabled-' + nanoid(8)}, error: null}). paidCall<> still wraps but cost recorded as 0. console.info logs each skipped send for dev visibility.

## Owner

Daksh — to be done in launch-prep window before public V1 launch.
