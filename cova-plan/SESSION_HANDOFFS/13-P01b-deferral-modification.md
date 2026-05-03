# P01b deferral modification — session handoff

**Date:** 2026-05-03
**Phase:** P01b prep
**Session type:** Executor prompt + phase doc modification (no executor fired)

## What changed

- Executor prompt modified to defer Resend (gated by EMAIL_SENDING_ENABLED, default false) and Termly (placeholder htmlContent)
- Phase doc updated with deferral notes in §3 G4, §6 1A, §6 1B, §13
- Two new back-bugs filed: launch-prep-email-deferred.md, launch-prep-termly-deferred.md

## Deferral pattern

**Email:** code fully implemented in lib/email/resend.ts + 4 React Email templates. EMAIL_SENDING_ENABLED env var gates actual sending. When false (V1 default), sendAuthEmail short-circuits with synthetic success. When true (post-launch), full email flow activates with zero code changes. Auto-verification of signup users when email disabled keeps user flow functional.

**Legal:** /terms and /privacy routes wired with LegalPage chrome rendering placeholder htmlContent. When Termly HTML delivered, single htmlContent prop swap activates real content.

## What V1 ships vs doesn't ship

Ships: full auth flow, OAuth, account deletion, GDPR export (sans email delivery), all 10 UI screens, email code (inactive), legal pages (placeholder).

Does not ship: verification emails, password reset emails, GDPR delivery emails, real legal content.

## Open follow-ups

- Daksh resolves email + Termly during launch-prep window
- Both back-bugs tracked: launch-prep-email-deferred.md, launch-prep-termly-deferred.md

## Next step

Run executor prompt at cova-plan/planner-output/P01b-executor-prompt.md in fresh Claude Code session. Multi-session execution: 1A backend → 1B UI → 1C integration with handoffs at 93-94% context.
