# Phase 0 — Catalog Isolation Audit

**Date:** 2026-04-19
**Purpose:** Formally isolate the curated product catalog and pgvector infrastructure
as DORMANT. Verify no active v9 code path reads from it. Preserve all data/code
for possible future revival.

**Active v9 product-matching path (reference):**
- `apps/web/app/api/match/route.ts`
- `apps/web/lib/ai/matchUtils.ts`
- `apps/web/lib/ai/clip.ts` (Replicate client-side CLIP)
- `apps/web/app/api/pipeline/furniture-match/route.ts`
- `modal_pipeline/furniture_matching_pipeline.py`

Mechanism: Serper (shopping + Google Lens) → Replicate CLIP batch embed → TypeScript
cosine similarity. No pgvector, no RPC, no curated catalog read.

---

## Sub-task 1 — Inventory of catalog hits

### `apps/web/` TypeScript

| File | Line | Hit | Status | Notes |
|------|------|-----|--------|-------|
| `apps/web/lib/clipSearch.ts` | 69 | `rpc/search_products_by_embedding` fetch | DORMANT | Module not imported anywhere in active code (grep confirms zero importers outside docs). |
| `apps/web/lib/clipSearch.ts` | 122 | `rpc/search_products_by_fusion_embedding` fetch | DORMANT | Same — dormant module. |
| `apps/web/lib/types/supabase.ts` | 585–617 | `clip_embedding_data` column (products table) | DORMANT (type-only) | Auto-generated Supabase types. Preserved by policy — do not edit. |
| `apps/web/lib/types/supabase.ts` | 633–700 | `products_v1` table with `clip_embedding`, `clip_fusion_embedding` | DORMANT (type-only) | Auto-generated types. |
| `apps/web/lib/types/supabase.ts` | 2091, 2110 | RPC type definitions | DORMANT (type-only) | Auto-generated. |
| `apps/web/tests/types/supabase.test.ts` | 129, 145 | references `clip_embedding_data` | DORMANT (test-only) | Type test, not an active DB read. |
| `apps/web/tests/e2e/data-integrity.test.ts` | 83, 264 | `.from('products')` | DORMANT (test-only) | Test asserts catalog data integrity — not part of active request flow. |
| `apps/web/tests/db/hnsw-migration.test.ts` | 46, 49 | tests old HNSW migration targets `clip_embedding_data` | DORMANT (test-only) | Tests the broken migration file; left intact for history. |
| `apps/web/app/design/step-9/page.tsx` | 456 | `.from('products')` select | DORMANT FALLBACK | Legacy catalog branch taken only when `room_products.serp_title` is absent. Active flow populates serp_* columns so this branch is not reached in production. Flagged below. |

### `apps/web/` active v9 flow (verification)

Searched for `products_v1`, `clip_embedding*`, `search_products_by_*`, `.from('products')`,
`.rpc('search_products*`, `match-products` across:

- `apps/web/app/api/match/route.ts` — hits are all SAFE (variable names, Serper `search_type: "products"` param, `products: [...]` arrays). Zero DB reads.
- `apps/web/app/api/pipeline/furniture-match/route.ts` — ZERO hits.
- `apps/web/app/api/pipeline/redesign/route.ts` — ZERO hits.
- `apps/web/lib/ai/matchUtils.ts` — ZERO hits.
- `apps/web/lib/ai/clip.ts` — ZERO hits.

### `modal_pipeline/`

| File | Line | Hit | Status |
|------|------|-----|--------|
| `modal_pipeline/embed_catalog.py` | 95, 124, 172 | writes `clip_embedding`, reads `products` | DORMANT (batch tool) |
| `modal_pipeline/embed_catalog_gpu.py` | 127, 181 | writes `clip_embedding`, reads `products` | DORMANT (batch tool) |
| `modal_pipeline/embed_fusion_gpu.py` | 67, 79, 120, 172 | reads/writes `clip_fusion_embedding` | DORMANT (batch tool) |
| `modal_pipeline/test_catalog.py` | 62, 77 | RPC call `search_products_by_embedding` | DORMANT (legacy test) |
| `modal_pipeline/test_furniture_session4.py` | 92 | RPC call `search_products_by_embedding` | DORMANT (legacy test) |
| `modal_pipeline/furniture_matching_pipeline.py` | 85 (comment), 325 (comment) | Comment: "DEPRECATED — catalog-based CLIP/pgvector matching removed." | SAFE (comment only) |
| `modal_pipeline/generation.py` | — | ZERO hits | SAFE |

---

## Sub-task 1 Findings

- **Zero active code paths** (per the task's listed v9 files) read from the curated
  product catalog, RPCs, or vector columns.
- `apps/web/lib/clipSearch.ts` is a genuinely-dormant module: no importers anywhere
  in active app code.
- `apps/web/app/design/step-9/page.tsx:456` has a **legacy fallback branch** that
  reads `.from('products')` when `room_products.serp_title` is empty. The active v9
  flow populates `serp_*` columns so the catalog branch is not reached in
  production. **Documenting as a known dormant fallback** rather than a live
  catalog dependency.
- Auto-generated `supabase.ts` types reflect the DB schema (including `products_v1`
  and catalog RPCs). Not edited per project policy.

---

## Sub-task 5 — Active-flow verification

Re-greped all listed active v9 flow files for `products`, `products_v1`,
`clip_embedding`, `search_products_by`, `match-products`:

| File | Hit count | Resolution |
|------|-----------|------------|
| `apps/web/app/api/match/route.ts` | 8 | ALL SAFE — variable names (`fallbackProducts`, `finalProducts`), Serper request field `search_type: "products"`, prompt text mentioning "products". Zero DB reads. |
| `apps/web/app/api/pipeline/furniture-match/route.ts` | 0 | SAFE. |
| `apps/web/app/api/pipeline/redesign/route.ts` | 0 | SAFE. |
| `apps/web/lib/ai/matchUtils.ts` | 0 | SAFE. |
| `apps/web/lib/ai/clip.ts` | 0 | SAFE. |
| `modal_pipeline/furniture_matching_pipeline.py` | 2 | ALL SAFE — both hits are in comments, one explicitly noting "DEPRECATED — catalog-based CLIP/pgvector matching removed". |
| `modal_pipeline/generation.py` | 0 | SAFE. |

**Active-flow finding count: 0.** No active v9 code path reads from the catalog,
RPCs, or vector columns.

**Incidental note (not a finding):** `apps/web/app/design/step-9/page.tsx:456`
contains a legacy `.from('products')` fallback branch that runs only when
`room_products.serp_title` is null. The active v9 flow always populates
`serp_*` columns, so this branch is unreachable in production. Left unchanged;
the catalog-guard pattern could be extended here in a future pass if a
warning ever fires from step-9.

---

## Summary

- **Files tagged DORMANT:** 8
  - `apps/web/lib/clipSearch.ts`
  - `supabase/functions/match-products/index.ts`
  - `supabase/functions/clip-embed/index.ts`
  - `modal_pipeline/embed_catalog.py`
  - `modal_pipeline/embed_catalog_gpu.py`
  - `modal_pipeline/embed_fusion_gpu.py`
  - `modal_pipeline/insert_products.py`
  - `modal_pipeline/scrape_catalog.py`
- **HNSW migration created:** `supabase/migrations/20260419000003_fix_hnsw_targeting.sql`
  (status: **file-only, not applied to production**).
- **Runtime guard implemented:** `apps/web/lib/ai/catalog-guard.ts` +
  `apps/web/lib/clipSearch.ts` wired to call `logCatalogAccess` at top of both RPC
  caller functions.
- **Active flow audit:** 0 DB-reading hits across 7 listed active files.
- **Verification gate:** PASS (14 failures both runs, matching baseline).
- **Preservation confirmation:** No product catalog data, tables, RPCs, Edge
  Functions, types, batch tools, or code was deleted. All infrastructure
  preserved in DORMANT state.

### Monitor plan

- Review `[CATALOG-DORMANT]` warnings in production logs weekly for 2–4 weeks.
- If **zero** warnings appear, isolation is confirmed and the guard + clipSearch.ts
  import can be removed (or the module can be deleted outright in a future cleanup).
- If **any** warnings appear, investigate the calling `source` string to identify
  which active path unexpectedly reached the dormant catalog, then decide whether
  to migrate that caller off dormant infra or formally un-dormantize the catalog.

