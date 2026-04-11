# Cova V1 — Pre-Deploy Hardening Checklist

**Date:** 2026-04-05  
**Branch:** main  
**Session:** Pre-deploy verification

---

## Summary

All 7 tasks completed. Build passes with zero errors. `npx tsc --noEmit` passes with zero errors.

---

## Task 1: `sharp` in `serverExternalPackages` ✅

**File:** `next.config.mjs`

`sharp` was already present under `serverExternalPackages` (root level). Corrected to the Next.js 14 location:

```js
experimental: {
  serverComponentsExternalPackages: ['sharp'],
}
```

`canvas` not present in `package.json` — no action needed.

---

## Task 2: Image Domain Allowlist ✅

**File:** `next.config.mjs`

Added 9 missing domains to `images.remotePatterns`:

| Domain                            | Purpose                             |
| --------------------------------- | ----------------------------------- |
| `m.media-amazon.com`              | Amazon product images               |
| `images-na.ssl-images-amazon.com` | Amazon product images (legacy)      |
| `encrypted-tbn0.gstatic.com`      | Serper / Google Shopping thumbnails |
| `target.scene7.com`               | Target product images               |
| `www.westelm.com`                 | West Elm product images             |
| `cb2.scene7.com`                  | CB2 product images                  |
| `assets.pbimgs.com`               | Pottery Barn product images         |
| `i5.walmartimages.com`            | Walmart product images              |
| `images.unsplash.com`             | Placeholder / dev images            |

Already present: `*.supabase.co`, `replicate.delivery`, `pbxt.replicate.delivery`, `*.replicate.com`.

---

## Task 3: Security Headers ✅

**File:** `next.config.mjs`

All four headers present on `source: '/(.*)'`:

| Header                   | Value                             |
| ------------------------ | --------------------------------- |
| `X-Frame-Options`        | `DENY`                            |
| `X-Content-Type-Options` | `nosniff`                         |
| `Referrer-Policy`        | `strict-origin-when-cross-origin` |
| `X-XSS-Protection`       | `1; mode=block` ← added           |

---

## Task 4: Environment Variable Audit ✅

**`lib/env.ts`:** `SERPER_API_KEY` already present as optional server-only var. No changes needed.

**Created:** `apps/web/.env.example` with all 22 keys, values redacted, comments describing each.

Keys covered:

- Supabase (URL, anon key, service role, JWT secret)
- PostHog, Sentry
- App URL
- Anthropic, Replicate
- Modal (ID + secret)
- Marble API
- Serper
- 11 affiliate tags (Amazon, Target, Article, Crate&Barrel, CB2, West Elm, Ruggable, One Kings Lane, Pottery Barn, Overstock, Etsy)
- Stripe (post-MVP)

---

## Task 5: Middleware Route Protection ✅

**File:** `middleware.ts`

Verified — no changes needed. Already correct:

- **Protected (require auth):** `/design/step-6` through `/design/step-10`, `/dashboard`, `/room/*`
- **Open (no auth):** `/design/step-1` through `/design/step-5`, `/quiz`, `/auth`, `/api/*`
- **Redirect pattern:** `/?next=/design/step-N` (preserves return URL)
- **API passthrough:** `/api/` routes handled by `isProtected` check — not blocked by middleware

---

## Task 6: `console.log` Cleanup ✅

Removed all `console.log` from production API routes and AI libs. `console.error` calls retained.

### Files modified:

**`app/api/chat/route.ts`** — removed 4 debug logs:

- `"Chat API called"`
- `"API key exists: ..."` (leaked key existence info)
- `"Messages count: ..."` (request data leakage)
- `"Creating stream with model ..."`
- `"Stream completed successfully"`

**`app/api/pipeline/start/route.ts`** — removed 1 milestone log:

- `"[pipeline] Room {id}: video_ready — user can view flythrough"`

**`lib/marble.ts`** — removed 15 verbose step-by-step logs from `processVideoToWorld` and `processRedesignedPanoToWorld`. Functions still throw on error — pipeline failures surface via `console.error` in the calling route.

### Files scanned, no changes needed:

- `components/cova/` — no `console.log` found
- `lib/ai/` — only `console.error` present (retained)

### Pre-existing warnings (acceptable):

- `no-console` ESLint rule flags `console.error` calls — intentionally kept per task spec
- Sentry/OpenTelemetry `require-in-the-middle` webpack warning — third-party dep, not fixable

---

## Task 7: Build Verification ✅

```bash
cd apps/web && npm run build   # PASS — zero errors
cd apps/web && npx tsc --noEmit  # PASS — zero errors
```

**Build output:** 60 static pages generated. All 37 dynamic routes compiled. No TypeScript errors, no missing module errors.

**Remaining ESLint warnings (pre-existing, non-blocking):**

- `no-console` on `console.error` calls in API routes — by design
- `@next/next/no-img-element` on `<img>` tags — pre-existing, not in scope
- `react-hooks/exhaustive-deps` on 3 hooks — pre-existing, not in scope
- Sentry OpenTelemetry `require-in-the-middle` — third-party, not fixable

---

## Files Changed

| File                                    | Change                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `next.config.mjs`                       | Fixed `serverExternalPackages` location; added 9 image domains; added X-XSS-Protection header |
| `app/api/chat/route.ts`                 | Removed 5 `console.log` debug statements                                                      |
| `app/api/pipeline/start/route.ts`       | Removed 1 `console.log` milestone statement                                                   |
| `lib/marble.ts`                         | Removed 15 `console.log` pipeline progress statements                                         |
| `.env.example`                          | Created with all 22 keys (new file)                                                           |
| `docs/sessions/pre-deploy-checklist.md` | Created (this file)                                                                           |
