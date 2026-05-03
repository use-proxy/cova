# P01b kickoff notes (from P01a final pre-close audit)

When you start the P01b phase chat, paste this as supplementary context for the planner.

## Legacy auth surface to handle
- apps/web/app/auth/page.tsx exists from V0 era (plain email/password + Google OAuth via createBrowserClient, Cormorant_Garamond + Manrope fonts)
- apps/web/app/auth/callback/ exists
- P01b planner must explicitly schedule: (a) git mv to _archive/web/app/auth/ then build new surface, OR (b) overwrite in place
- Recommendation: (a) — preserves V0 history, gives clean slate for new auth UI

## Type extensions P01b will need to add
- lib/cost/categories.ts: extend CostCategory union with auth-* values (auth_email_verify, auth_password_reset, auth_magic_link, etc.)
- lib/errors/categories.ts: add AuthFailure union to FailureCategory (auth.signup.*, auth.signin.*, auth.deletion.* per Decision 8 dotted format)
- lib/analytics/events.ts: extend CovaEvent union with auth.* events

## New env vars to add (apps/web/lib/env.ts + Vercel)
- RESEND_API_KEY (Resend send)
- TURNSTILE_SECRET_KEY (server verify)
- NEXT_PUBLIC_TURNSTILE_SITE_KEY (client widget)
- (optional, deferred from P01a) CRON_SECRET if not already set

## RLS policy namespace
- P01a uses p1_ prefix
- P01b should use p1b_ prefix for account_deletions and any other tables it creates
- Phase 2+ uses p2_, p3_, etc.

## Deferred items that DON'T affect P01b
- 11 deferred rooms columns (P02/P03 territory; auth surface doesn't touch them)
- 199 unsafe-console residuals (none in auth path because auth path doesn't exist yet)
- Cost-monitor cold-start report (post-deploy)

## Subagent runtime model strings to use in P01b
- verifier: claude-opus-4-7
- schema-reviewer: claude-sonnet-4-6
- frontend-visionary: claude-sonnet-4-6 (P01b's primary user — heavy auth UI work)
- cost-monitor: claude-haiku-4-5-20251001
