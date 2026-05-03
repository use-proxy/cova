# STORAGE_AUDIT — Supabase Storage, Image Lifecycle, CDN

**Date:** 2026-04-29
**Project:** Cova V1 (Supabase project `xdeacbmkdwqrwxonqaqh`)
**Scope:** Supabase Storage buckets used by `apps/web/`, `modal_pipeline/`, `supabase/functions/`. Excludes `apps/mobile/` (frozen) and Modal-internal disk.
**Method:** Static review of migrations, Edge Functions, Next.js routes, Modal pipeline scripts, and `next.config.mjs`. No live bucket inspection (no SQL/CLI access in this run).

---

## 1. Storage buckets inventory

The repo has **two sources of truth** for bucket names:

- **Migration** `supabase/migrations/20240010000000_storage_rls.sql` — declares RLS for **6 buckets**.
- **Migration** `supabase/migrations/20260419000002_room_photos_storage_rls.sql` — adds `room-photos` (was using admin bypass before this).
- **Code constant** `apps/web/lib/supabase/storage.ts:6-11` — `STORAGE_BUCKETS` enum lists 4: `room-videos`, `room-photos`, `renders`, `depth-maps`.
- **Direct string references** elsewhere — `room-uploads`, `quiz-images`, `product-images`, `swipe-cards`, `3d-models`, `scene-snapshots`, plus `avatars` / `landing-assets` / `showcase` from out-of-scope scripts.

### Buckets used by apps/web (V1) + modal_pipeline

| Bucket | Visibility | RLS source | Purpose / writers |
|---|---|---|---|
| `room-uploads` | Private | `20240010000000_storage_rls.sql:5-6` (FOR ALL, owner = `{userId}/...`) | Multi-frame capture client uploads (`apps/web/app/capture/[roomId]/page.tsx:93-101`) |
| `room-photos` | Private | `20260419000002_room_photos_storage_rls.sql:5-6` (FOR ALL, owner = `{userId}/...`) | **Primary V1 bucket.** Original room photos, intermediate edits, masks, refinement outputs (see §2) |
| `renders` | Private | `20240010000000_storage_rls.sql:9-10` (SELECT only, owner = `{userId}/...`); writes via service-role | Declared in `STORAGE_BUCKETS` (`storage.ts:9`); no `upload(` call against it found in active V3 paths — likely **dormant under V3** |
| `depth-maps` | Private | None in migrations (relies on service-role + private bucket default) | Declared in `STORAGE_BUCKETS` (`storage.ts:10`); no active writers found in V3 |
| `room-videos` | Private | None in migrations | Declared in `STORAGE_BUCKETS` (`storage.ts:7`); used historically for AnySplat splats — **dormant under V3** (V3 outputs flat 2D only, per `apps/web/CLAUDE.md`) |
| `product-images` | **Public** | `20240010000000_storage_rls.sql:13-14` (public SELECT) | Catalog images (`scripts/overnight/embed.ts:94`); written by service-role only |
| `swipe-cards` | **Public** | `20240010000000_storage_rls.sql:16-18` | Style quiz cards; written by service-role only |
| `3d-models` | **Public** | `20240010000000_storage_rls.sql:20-22` | Legacy 3D furniture GLBs — likely dormant under V3 |
| `scene-snapshots` | Private | `20240010000000_storage_rls.sql:24-26` (FOR ALL, owner = `{userId}/...`) | Legacy 3D scene captures — dormant under V3 |
| `quiz-images` | **Public (assumed)** | **No RLS migration found** — `_audit_step2.mjs:15`, `scripts/generate-quiz-library.ts:275`, `scripts/migrate-pair-images.ts:52`, `scripts/generate-missing-anchors.ts:152` use `getPublicUrl` so it must be public | Quiz anchor pair images (dim-1 to dim-8). Bucket created out-of-band in dashboard. **GAP:** no migration codifies its policy. |

### Total objects + total size

**NOT MEASURED.** Requires live `storage.objects` query or dashboard. Estimable proxies:

- `quiz-images`: ~950 quiz cards + per-dimension pair images → ~1,500 objects.
- `product-images`: per CLAUDE.md, ~5,581 products with embeddings; not all have stored images (many use upstream retailer URLs).
- `room-photos`: scales with rooms × (1 original + 1 empty-room + 1 final + N masks + N refinements). Avg per finished room observed in code: ~5-8 objects.

**Recommended follow-up:** run `select bucket_id, count(*), sum(metadata->>'size')::bigint from storage.objects group by 1` against prod for ground truth.

---

## 2. What goes where (V3 pipeline)

V3 is the current flow per `apps/web/CLAUDE.md`. Phase 2/5 service docs in root `CLAUDE.md` describe an earlier Phase-5-only pipeline. Where they conflict, V3 wins.

| Artifact | Bucket | Path pattern | Source |
|---|---|---|---|
| **User-uploaded original photo** | `room-photos` | `{userId}/{timestamp}.jpg` (EXIF-rotated, JPEG q=90) | `apps/web/app/api/rooms/capture/route.ts:53-64` |
| **Multi-frame capture (legacy `/capture/[roomId]`)** | `room-uploads` | client `upload(...).getPublicUrl(...)` | `apps/web/app/capture/[roomId]/page.tsx:93-101` |
| **Empty-room intermediate** | `room-photos` | `empty/{room_id}/{timestamp}.jpg` (rehosted from fal.ai) | `modal_pipeline/empty_room.py:121` (`SUPABASE_BUCKET = "room-photos"`), `:260-265` (`_rehost_to_supabase`) |
| **Final redesign render (V3 Pass 3 IC-Light output)** | **fal.ai (NOT Supabase)** | `https://v3.fal.media/...` URLs returned by Modal; persisted as `redesign_pano_url` column only | `modal_pipeline/redesign.py` (V3 rewrite) |
| **Composite art outputs** | **fal.ai (NOT Supabase)** | URL persisted in DB only | `modal_pipeline/composite_art.py:317-321` (`_upload_bytes_to_fal`) |
| **Refinement / tap-to-fix iterations** | `room-photos` | `getPublicUrl` returned to client | `apps/web/app/api/render/tweak/route.ts:191-199` |
| **Swap (room edit) outputs** | `room-photos` | similar | `apps/web/app/api/swap/route.ts:222-230` |
| **Differential-diffusion change maps** | `room-photos` | `masks/{roomId}/change_map.png` (signed URL, 7-day TTL) | `apps/web/lib/ai/mask-assembly.ts:107-112` |
| **Inpainting keep-masks** | `room-photos` | `getPublicUrl` returned | `apps/web/lib/ai/inpainting.ts:333` |
| **Render crops (for Vision)** | `room-photos` | `getPublicUrl` only (no upload found at this path) | `apps/web/lib/ai/renderCrop.ts:124` |
| **User-uploaded art (personalization)** | **NOT WIRED to Supabase** | `app/design/step-7p/page.tsx` collects manifest but custom-art upload path is fal.ai-mediated via `/api/personalization/generate-art-preview` | personalization compiler in `apps/web/lib/ai/personalization-compiler.ts` |

**Key finding:** the only V1/V3 user-data bucket actively written to is `room-photos`. Final render images live on **fal.ai's CDN** (`v3.fal.media`), not Supabase. This drastically reduces Supabase storage growth but creates a third-party-lifetime dependency (see §6 + §7).

---

## 3. Image lifecycle

### 3.1 Cleanup policies / TTL

- **No automatic retention.** Searched for `cron`, `pg_cron`, `lifecycle`, `retention`, `expires`, `TTL` against migrations and Edge Functions — none found.
- **Signed-URL TTL** is set per-call (e.g., 7 days for change maps in `mask-assembly.ts:110`); this gates *access*, not deletion.
- **fal.ai-hosted finals** rely on fal.ai's own retention (per their docs, indefinite for paid accounts). If fal.ai purges, `redesign_pano_url` rows become broken.

### 3.2 Account deletion → bucket purge

`supabase/functions/delete-account/index.ts` is wired and FK-safe but **incomplete**:

```ts
// supabase/functions/delete-account/index.ts:55-64
for (const bucket of ['room-photos', 'renders']) {
  try {
    const { data: files } = await adminClient.storage.from(bucket).list(userId);
    if (files && files.length > 0) {
      await adminClient.storage.from(bucket).remove(
        files.map((f) => `${userId}/${f.name}`)
      );
    }
  } catch { /* best-effort */ }
}
```

Problems:
- **Only 2 buckets purged.** Missing: `room-uploads`, `room-videos`, `depth-maps`, `scene-snapshots`. Any user data in those persists forever.
- **`list(userId)` is non-recursive.** It returns immediate children of `{userId}/`. The actual paths used include subfolders: `empty/{roomId}/...` (Python pipeline writes), `masks/{roomId}/...` (mask-assembly), and Phase 2 outputs at `{userId}/{timestamp}.jpg`. Only the flat `{userId}/{timestamp}.jpg` files get caught. Subfolders are **silently leaked**.
- **fal.ai-hosted images are never deleted.** `redesign_pano_url` URLs survive deletion entirely.
- **Best-effort `try/catch`** swallows all errors — caller cannot tell if cleanup succeeded.
- **Client invokes `signOut()` synchronously without awaiting** the Edge Function in `apps/web/app/dashboard/settings/page.tsx:521-535` (per Explore agent's read), so the redirect fires before the cleanup confirms.

### 3.3 Per-room deletion

`apps/web/app/api/rooms/[roomId]/route.ts` deletes the `rooms` row but **does not cascade to storage**. Photos for deleted rooms remain in `room-photos` indefinitely.

### 3.4 Orphaned objects / files

- **Orphaned files (file in bucket, no DB row):** Highly likely.
  - Per-room deletion does not touch storage (above).
  - Account deletion misses 4 buckets and subfolders.
  - Capture route uploads photo *before* `rooms` row insert (`api/rooms/capture/route.ts:59-93`); if room insert fails, the JPEG is orphaned (no rollback).
- **Orphaned references (DB row → file missing):** Possible for fal.ai-hosted finals if fal purges, but Supabase-hosted refs are stable (no auto-delete).
- **No reconciliation script** exists. Searched `scripts/` for `orphan` / `reconcile` — none.

---

## 4. CDN / serving

### 4.1 Direct serving

All image URLs are served directly from **Supabase Storage's built-in CDN** at `https://xdeacbmkdwqrwxonqaqh.supabase.co/storage/v1/object/{public|sign}/...`. Supabase fronts storage with a Smart CDN (Cloudflare-backed per their docs) automatically; **no custom CDN layer (Cloudflare Workers, AWS CloudFront, Bunny) is wired.**

### 4.2 Vercel Image Optimization

`apps/web/next.config.mjs:6-32` whitelists `*.supabase.co` and `*.replicate.com` etc. for `next/image`. When the app uses `<Image src="https://...supabase.co/...">`, Vercel's image optimizer fetches once, transcodes (AVIF/WebP), and caches at edge. **This is the de-facto CDN layer for in-app rendering.** Plain `<img>` tags hit Supabase directly with no Vercel caching.

### 4.3 Cache headers

- **No explicit `Cache-Control`** set in any API route serving images (grep for `Cache-Control` in `apps/web/app/api/**` returned nothing relevant).
- Supabase Storage default: public objects → `cache-control: max-age=3600` (1 hour). Signed URLs → `max-age=3600` plus the signed-token expiry.
- Vercel Image Optimization sets its own immutable cache for transformed variants.
- **Verdict:** acceptable for product/quiz images (rarely change) but **conservative for room-photos** (one-shot user assets that never mutate — could safely be `max-age=31536000, immutable`). No correctness bug, just minor egress overspend.

### 4.4 Egress cost estimate

Supabase pricing: **$0.09/GB egress**, **$0.021/GB-month storage**. Pro tier includes 250GB egress + 100GB storage; Team tier 500GB / 200GB.

Today's volume is unmeasured. See §5 for a 1k-renders/day projection.

---

## 5. Cost projection at 1,000 renders/day

Assumed sizes per render (sharp JPEG q=90, 1024-1536px longest edge):

| Asset | Size | Bucket |
|---|---|---|
| Original photo (post-EXIF) | ~1.5 MB | `room-photos` |
| Empty-room intermediate | ~1.0 MB | `room-photos` |
| ~3 mask PNGs (change map + 2 surfaces) | ~0.6 MB total | `room-photos` |
| Final render | ~1.2 MB | **fal.ai** (not Supabase) |
| Refinement iterations (avg 2/render) | ~2.4 MB | `room-photos` |

**Per render → Supabase: ~5.5 MB. fal.ai: ~1.2 MB.**

### 5.1 Storage growth (Supabase only)

- 1,000 renders/day × 5.5 MB = **5.5 GB/day** ≈ **165 GB/month** new.
- **Cumulative storage cost:** $0.021/GB-mo × cumulative GB. Month 1: ~$3.50. Month 12 (1.98 TB cumulative if no cleanup): **~$42/month**. Year-2: $84/mo and rising linearly.
- Without lifecycle rules, this grows unbounded. With aggressive 30-day retention: steady-state ~165 GB → $3.50/month flat.

### 5.2 Egress

Assume each render is viewed 5× by the owner + 1× shared average = 6× × 5.5 MB delivery = 33 MB egress per render (Supabase).

- 1,000/day × 33 MB = **33 GB/day** ≈ **990 GB/month** egress.
- Supabase Pro includes 250 GB. Overage: 740 GB × $0.09 = **$66.60/month**. (Vercel image optimization absorbs most of this for `<Image>` views — actual could be 50-70% lower.)

### 5.3 fal.ai

Final renders served from fal.ai are not billed by Supabase egress, but they fall under fal.ai's hosting policy (no SLA documented for indefinite retention). Cost externalized; not on the Supabase bill but adds **third-party-lifetime risk**.

### 5.4 Comparison vs alternatives

| Architecture | Storage @ 12 mo | Egress / mo (1k/day) | Notes |
|---|---|---|---|
| **Current** (Supabase + fal.ai for finals) | ~$42 (uncapped growth) | ~$66 | Vendor lock to fal for final assets |
| **All Supabase, 30-day TTL on intermediates** | ~$3.50 flat | same | Adds cleanup cron; loses replay |
| **Supabase + Cloudflare R2 for finals** | ~$3.50 + R2 $0.015/GB | R2 $0 egress | $0.015/GB R2 storage; saves ~$66/mo egress; adds infra |
| **Supabase + Vercel Blob** | $5+ + Vercel Blob $0.15/GB | Vercel $0.05/GB egress | Most expensive but tightest Next integration |

**Recommendation for V1:** keep Supabase as-is, add 30-day TTL on `masks/` and `empty/` subfolders (regeneratable from original), keep originals + finals indefinitely. R2 migration is a post-launch optimization once volume crosses 5k/day.

---

## 6. Compliance posture

### 6.1 GDPR data export

- **NOT IMPLEMENTED.** `apps/web/app/dashboard/settings/page.tsx:517-520` has a `handleDownloadData()` UI handler but it only emits a toast — no backend route, no archive generation. The "Download my data" button is a stub.
- A working export would need to: list `room-photos/{userId}/...` and `room-uploads/{userId}/...`, download all blobs, plus all DB rows for the user, ZIP, sign, email/redirect.

### 6.2 CCPA delete request

- **PARTIAL.** Edge Function `delete-account` exists but (per §3.2) misses 4 buckets, ignores subfolders, and never deletes fal.ai-hosted finals. **A user invoking "delete my account" today does not get a true data purge.**
- Compliance risk: under strict CCPA reading, this is non-compliance. CA AG has fined for similar gaps.

### 6.3 Encryption at rest

- Supabase Storage uses S3-backed encryption (SSE-S3, AES-256) by default. No application-level encryption added — not needed for product images, may be worth it for any future PII attachments.

### 6.4 PII risk in image metadata (EXIF)

- **EXIF orientation is corrected on the main capture path** via `sharp().rotate().jpeg()` in `apps/web/app/api/rooms/capture/route.ts:8-21`. Sharp's `.jpeg()` re-encode strips most EXIF tags by default (it does NOT preserve EXIF unless you call `.withMetadata()`).
- **GAP:** the multi-frame `app/capture/[roomId]/page.tsx:93` path uploads `blob`s straight from the browser — **no EXIF strip, no re-encode.** Phone cameras embed `GPSLatitude`/`GPSLongitude` here. Anyone with read access (the user themselves, plus any future shared-link feature) gets precise home GPS coordinates.
- **GAP (ingest size):** root `CLAUDE.md` flags a P0 — Anthropic Vision rejects >5MB images, and there is no resize guard outside `api/rooms/capture/route.ts`. Adding a Sharp downscale also implicitly strips EXIF — kill two birds.

### 6.5 RLS coverage summary

| Bucket | RLS migrated | Effective protection |
|---|---|---|
| `room-photos`, `room-uploads`, `scene-snapshots` | ✅ | Path-prefix owner check |
| `renders` | ✅ (read-only) | Service-role for writes |
| `product-images`, `swipe-cards`, `3d-models` | ✅ | Public read OK (catalog) |
| `depth-maps`, `room-videos` | ❌ | Bucket privacy + service-role only — works, but undocumented |
| `quiz-images` | ❌ | **Inferred public via `getPublicUrl` calls; not codified** |

---

## 7. Recommended changes for V1 (priority-ordered)

1. **Fix delete-account purge (HIGH — compliance).**
   - Recurse into subfolders (`empty/`, `masks/`, etc.) using a helper that walks the prefix or use `listAll`-style pagination.
   - Add `room-uploads`, `depth-maps`, `room-videos`, `scene-snapshots` to the bucket loop.
   - Drop the silent `try/catch`; surface errors and retry once.
   - Best-effort delete fal.ai-hosted finals (or document the limitation).
   - Make the client `await` the Edge Function before signing out.
2. **EXIF strip on every upload path (HIGH — privacy).**
   - Apply Sharp re-encode (or just `sharp(buf).rotate().jpeg().toBuffer()`) inside `app/capture/[roomId]/page.tsx` upload, ideally server-side via a `/api/capture/frame` route.
   - Combine with the P0 size-resize guard for >5MB images flagged in root `CLAUDE.md`.
3. **Wire data export (HIGH — GDPR).**
   - New `/api/account/export` route: stream a ZIP of all owned blobs + a JSON of all rows. Sign URL, email link.
   - Or remove the stub button until implemented.
4. **Add room-deletion cascade (MEDIUM).**
   - In `apps/web/app/api/rooms/[roomId]/route.ts`, after row delete, list and remove `{userId}/{roomId}/...` (and any `empty/{roomId}/...`, `masks/{roomId}/...`).
5. **Codify `quiz-images` RLS in a migration (MEDIUM).**
   - Add `CREATE POLICY "quiz_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'quiz-images');` so config matches code.
6. **Lifecycle / TTL for regeneratable assets (MEDIUM — cost).**
   - Schedule (pg_cron or Modal cron) to delete `room-photos` objects under `masks/` and `empty/` older than 30 days. Saves ~70% of `room-photos` growth at scale.
7. **Set explicit Cache-Control for finals (LOW — cost).**
   - When uploading user-immutable assets, pass `cacheControl: '31536000, immutable'` to `.upload()`. Cuts egress on repeat dashboard views.
8. **Don't fire Vercel CDN through plain `<img>` for room photos (LOW).**
   - Audit any `<img src=` in dashboard / step-8a / step-9 and convert to `<Image>` to take advantage of Vercel's per-edge cache + AVIF transcoding.
9. **Decommission dormant buckets (LOW — clarity).**
   - `room-videos`, `3d-models`, `scene-snapshots`, `depth-maps`, possibly `renders` are V0/V1-legacy. Confirm zero new writes for 30 days, then remove from `STORAGE_BUCKETS` enum and archive RLS migrations.
10. **Reconciliation script (LOW — hygiene).**
    - One-shot `scripts/storage-reconcile.ts` that diffs `storage.objects` against `rooms.original_photo_url` / `rooms.redesign_pano_url` / mask refs and reports orphans. Run monthly.

---

## 8. Open questions

1. **What is current production object count + size per bucket?** Need a one-shot SQL query against `storage.objects` to baseline §1 and §5.
2. **Does fal.ai retain rendered images indefinitely, or is there a TTL?** Affects whether `redesign_pano_url` URLs rot over time and whether we need to mirror finals into Supabase.
3. **Is Supabase Pro or Team tier in use?** Determines included-egress allowance and the breakeven for switching final hosting to R2.
4. **Was `quiz-images` created via the Supabase dashboard with public access enabled, or is it private with anon-key reads?** Code uses `getPublicUrl`, which only works for public buckets — but no migration confirms this.
5. **Is `renders` bucket actually written to anywhere in V3?** No `upload(` against it found in `apps/web/`. If unused, remove from `STORAGE_BUCKETS` and delete the policy.
6. **What does Vercel Image Optimization actually cost at 1k/day?** Vercel Pro includes 5K source images/mo; 1k renders/day × 6 views = 180k requests/mo. May exceed the included tier and push into per-1K transformations pricing.
7. **Are there shared-link / public-room features planned (M9–M14)?** If yes, GPS-EXIF leak (§6.4) becomes externally exploitable, not just self-disclosure.
8. **Should originals be retained forever or auto-deleted N days after the last refinement?** Drives whether retention is cost-driven (keep) or privacy-driven (delete).
