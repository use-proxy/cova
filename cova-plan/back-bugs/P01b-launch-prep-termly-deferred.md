# Back-bug: Termly legal content deferred to V1.5 launch prep

**Status:** OPEN
**Created:** 2026-05-03
**Phase:** P01b
**Severity:** Launch prerequisite (blocking public launch — CCPA exposure)

## What's deferred

Real legal content (Terms of Service + Privacy Policy) generation via Termly is deferred. P01b ships /terms and /privacy routes with placeholder htmlContent.

## Current placeholder content

Both /terms and /privacy render via the LegalPage component with htmlContent:

```html
<p>This document is coming soon. Contact <a href="mailto:hi@covainterior.com">hi@covainterior.com</a> if you have questions.</p>
```

Full LegalPage chrome (sticky header, eyebrow, headline, gold rule, document footer, return-home link) renders correctly. Layout is launch-ready; only htmlContent needs updating.

## Legal exposure during V1

- CCPA requires Privacy Policy for any company collecting PII from California residents
- "No Privacy Policy" is regulatory exposure even at small scale
- Acceptable for invite-only/alpha test users; not acceptable for public V1 launch

## How to enable post-launch (estimated 60-90 min)

Option A: Termly Starter tier ($10/mo)
1. Sign up at termly.io
2. Generate Terms of Service via questionnaire (company info, services, age requirement, FTC affiliate disclosure, liability)
3. Generate Privacy Policy via questionnaire (data collection, processors: Supabase/Modal/Cloudflare/Resend/Anthropic, GDPR/CCPA terms, retention)
4. Copy generated HTML for each policy
5. Save to cova-plan/ui-gen/P01b/legal-content/terms.html and privacy.html
6. Update apps/web/app/terms/page.tsx: replace placeholder htmlContent with imported terms.html content; bump version from "0.1" to "1"
7. Same for apps/web/app/privacy/page.tsx
8. Redeploy

Option B: Hand-write (4-6 hours of legal-grade writing + ongoing maintenance burden)

## Owner

Daksh — to be done in launch-prep window before public V1 launch.
