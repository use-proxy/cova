# _archive/web/app/auth — V0 auth surface (deprecated)

The V0 plain email/password + Google OAuth auth surface that lived at `apps/web/app/auth/` was archived here when the luxury auth flow shipped in Phase 1B (P01b).

Reference: `cova-plan/phases/P01b-auth-legal-deletion.md` § 6 (1A → "V0 demolition is the first step of M2 implementation"). Archive trigger: prevents `/auth/callback` path collision between V0 and the new spec's callback at the same path.

Do not import from this directory. The new auth surface lives at `apps/web/app/auth/` (signup, signin, forgot-password, reset-password, verify-email-{sent,success,invalid}, callback) and `apps/web/app/{terms,privacy,account-deleted}/`.
