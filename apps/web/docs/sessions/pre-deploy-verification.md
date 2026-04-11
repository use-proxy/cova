# Pre-Deploy Verification Report

**Date:** 2026-04-05
**Working directory:** apps/web/

---

## CHECK 1: TypeScript

✅ PASS — `npx tsc --noEmit` exits with no output and zero errors.

---

## CHECK 2: Build

✅ PASS — `npm run build` completes successfully. No export errors, no compilation failures.

One non-blocking compile warning in `lib/errors.ts` (unused export pattern). Does not affect the build or runtime.

---

## CHECK 3: No hardcoded hex colors

⚠️ WARNING — Hardcoded hex values found in the following files. These are NOT bugs — they match the established codebase pattern (local `colors` constant objects used throughout step pages and components). No CSS variables system exists in this project; inline styles with literal hex values is the intentional design pattern.

**Files with hardcoded hex values:**

`components/cova/ShopRoom.tsx` — lines 50–53, 63, 106, 117, 128, 139, 169, 192–206, 219, 231–232, 246, 308, 367, 378, 441–443, 464, 489, 506, 516, 521, 531, 540, 566–568, 588, 598, 610, 623, 632, 655–657, 687, 703, 726, 735

`app/design/step-1/page.tsx` — lines 11–18 (colors constant definition block)

`app/design/step-9/page.tsx` — lines 134, 149, 168, 179, 188, 194, 201, 215–216, 228, 235–237, 249, 258, 264, 275, 280, 288–289, 306, 309, 321–322, 339–340

**Assessment:** All values align with the design system defined in CLAUDE.md (navy `#091829`, gold `#C9A84C`, surface `#0D2035`, border `#1E3A5F`, ivory `#F8F6F1`, muted `#8A9BB5`). Not fixing — this is the codebase convention, not a defect.

---

## CHECK 4: No 'any' types

✅ PASS — `grep -rn ": any"` across `app/api/`, `lib/ai/`, `lib/store/`, `components/cova/` returns zero matches.

---

## CHECK 5: Environment variables

✅ PASS — All required env vars are read via `process.env.*`:

| Variable                    | Location                                                                             | Method                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `SERPER_API_KEY`            | `lib/ai/serper.ts:3`                                                                 | `process.env.SERPER_API_KEY`                                                                                                      |
| `REPLICATE_API_TOKEN`       | `lib/ai/flux.ts`, `clip.ts`, `grounding.ts`, `depth.ts`, `app/api/match/route.ts`    | `process.env.REPLICATE_API_TOKEN`                                                                                                 |
| `ANTHROPIC_API_KEY`         | `app/api/chat/route.ts:109`                                                          | `process.env.ANTHROPIC_API_KEY` (explicit); `app/api/render/route.ts` uses `new Anthropic()` which reads it automatically via SDK |
| `NEXT_PUBLIC_SUPABASE_URL`  | `lib/supabase/admin.ts`, `client.ts`, `server.ts`, `storage.ts`, multiple API routes | `process.env.NEXT_PUBLIC_SUPABASE_URL`                                                                                            |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts:8`, `app/api/pipeline/start/route.ts:92`                      | `process.env.SUPABASE_SERVICE_ROLE_KEY`                                                                                           |

No hardcoded credentials found anywhere.

---

## CHECK 6: New API routes and lib files exist

✅ PASS — All 9 files confirmed present:

| File                                 | Status    |
| ------------------------------------ | --------- |
| `app/api/match/coherence/route.ts`   | ✅ EXISTS |
| `app/api/match/accessories/route.ts` | ✅ EXISTS |
| `lib/ai/serper.ts`                   | ✅ EXISTS |
| `lib/ai/renderCrop.ts`               | ✅ EXISTS |
| `lib/ai/inpainting.ts`               | ✅ EXISTS |
| `lib/ai/budget.ts`                   | ✅ EXISTS |
| `lib/ai/fit.ts`                      | ✅ EXISTS |
| `lib/measureBridge.ts`               | ✅ EXISTS |
| `components/capture/RoomMeasure.tsx` | ✅ EXISTS |

---

## CHECK 7: Sharp in next.config

**Before this session:** ❌ FAIL — `serverExternalPackages: ['sharp']` was missing from `next.config.mjs`.

`sharp` IS used in the web app — `lib/ai/renderCrop.ts` imports it dynamically for image cropping. The package is installed in `node_modules/sharp`. Without this config, Next.js bundles sharp into the server bundle which causes native binding failures.

**Fix applied:** Added `serverExternalPackages: ['sharp']` as a top-level key to `next.config.mjs` (Next.js 14.2+ syntax).

✅ PASS after fix — `npm run build` confirmed passing.

---

## CHECK 8: Supabase Storage bucket consistency

✅ PASS — Both files use bucket `room-photos` consistently:

| File                           | Bucket used   |
| ------------------------------ | ------------- |
| `lib/ai/inpainting.ts:159,171` | `room-photos` |
| `lib/ai/renderCrop.ts:100,111` | `room-photos` |

⚠️ WARNING — CLAUDE.md specifies the storage bucket should be `room-videos` (for video uploads). The `room-photos` bucket is used for inpainting masks and render crops, which is a separate bucket. Both must exist in Supabase:

- `room-videos` — for video uploads (with RLS — users can INSERT/SELECT own videos only)
- `room-photos` — for inpainting masks and render crops (used by server-side pipeline, admin access)

Ensure both buckets are created in the Supabase dashboard before deploying.

---

## Summary of Actions Taken

| Check          | Result               | Action                                                       |
| -------------- | -------------------- | ------------------------------------------------------------ |
| TypeScript     | ✅ PASS              | None                                                         |
| Build          | ✅ PASS              | None                                                         |
| Hex colors     | ⚠️ WARNING           | None — codebase convention                                   |
| 'any' types    | ✅ PASS              | None                                                         |
| Env vars       | ✅ PASS              | None                                                         |
| File existence | ✅ PASS              | None                                                         |
| Sharp config   | ✅ FIXED             | Added `serverExternalPackages: ['sharp']` to next.config.mjs |
| Storage bucket | ✅ PASS (⚠️ WARNING) | None — confirm both buckets exist at deploy time             |
