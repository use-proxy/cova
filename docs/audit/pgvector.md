# pgvector Audit Report

**Date:** 2026-04-19
**Codebase:** /Users/daksh/Desktop/cova
**Supabase project:** xdeacbmkdwqrwxonqaqh

---

## 1. Vector Column Inventory

### Table: `products` (legacy table, `001_initial.sql`)

| Column | Type | Dimensions | Notes |
|--------|------|------------|-------|
| `clip_embedding_data` | `jsonb` | N/A | **NOT a vector column.** Stored as JSONB in the `products` table defined in `apps/web/lib/supabase/migrations/001_initial.sql`. No pgvector index possible on JSONB. |

### Table: `products_v1` (main products table from `supabase/migrations/`)

| Column | Type | Dimensions | Notes |
|--------|------|------------|-------|
| `clip_embedding` | `vector(768)` | 768 | Created in migration `20240006`, dropped/recreated to 1024 in `20240012`, dropped/recreated back to 768 in `20240020`. Final dimension: **768**. |
| `clip_fusion_embedding` | `vector(768)` | 768 | Added in migration `20240054`. Fusion = 0.6 * image_embed + 0.4 * text_embed, normalized. |
| `dinov3_embedding` | `vector(1536)` | 1536 | Added in `docs/migrations/002_v2_columns.sql` (status: PENDING). Not yet populated. |
| `siglip2_embedding` | `vector(1152)` | 1152 | Added in `docs/migrations/002_v2_columns.sql` (status: PENDING). Not yet populated. |

### Table: `style_purchase_signals`

| Column | Type | Dimensions | Notes |
|--------|------|------------|-------|
| `style_vector` | `jsonb` | N/A | Stored as JSONB, not pgvector. Has a GIN index (`idx_style_purchase_signals_style`). Used for style analytics, not similarity search. |

### Other tables with vector-like columns (all JSONB, not pgvector)

- `swipe_history.style_vector_before` / `style_vector_after` (JSONB)
- `rooms.final_style_vector` (JSONB)
- `product_impressions.style_vector_at_time` (JSONB)
- `product_interactions.style_vector_at_time` (JSONB)
- `redesign_feedback.style_vector_at_time` (JSONB)
- `user_style_profiles.style_vector` (JSONB)
- `quiz_anchor_images.style_vector` (JSONB)
- `style_vectors` table (has B-tree index on `style_code`, no vector index)

---

## 2. Index Configuration History

The index configuration has been changed **six times** across migrations, indicating significant churn:

| Migration | Index Type | Column | Parameters | Notes |
|-----------|-----------|--------|------------|-------|
| `20240006` (initial) | IVFFlat | `clip_embedding` | lists=100 | **Commented out** ("create AFTER loading data") |
| `20240012` | **HNSW** | `clip_embedding` (1024-dim) | m=16, ef_construction=64 | Created then column was later dropped/recreated as 768-dim |
| `20240020` | *(none)* | `clip_embedding` (768-dim) | N/A | Column recreated at 768-dim, **no index created** |
| `20240034` | IVFFlat | `clip_embedding` | lists=50 | Rebuilt after M6 catalog expansion |
| `20240038` | IVFFlat | `clip_embedding` | lists=50 | Rebuilt after Etsy + Overstock expansion |
| `20240054` | IVFFlat | `clip_fusion_embedding` | lists=100 | For fusion embedding search |
| `20240057` | IVFFlat | `clip_fusion_embedding` | lists=20 | Rebuilt with corrected list count |
| `20260410` | **HNSW** | `clip_embedding_data` | m=16, ef_construction=64 | **CRITICAL: targets wrong column name** |

### Current Expected State (after all migrations)

On `clip_embedding`:
- IVFFlat index `products_clip_embedding_idx` with lists=50 (from `20240038`)
- The HNSW migration `20260410` drops indexes with names `products_clip_embedding_ivfflat_idx`, `products_embedding_ivfflat_idx`, `idx_products_clip_ivfflat`, `idx_products_fusion_ivfflat` -- but **not** `products_clip_embedding_idx` (the actual name from `20240034`/`20240038`).

On `clip_fusion_embedding`:
- IVFFlat index `products_fusion_embedding_idx` with lists=20 (from `20240057`)
- The HNSW migration attempts to drop `idx_products_fusion_ivfflat` but the actual index name is `products_fusion_embedding_idx`, so **this IVFFlat index may still exist**.

On `clip_embedding_data`:
- HNSW index `products_clip_hnsw_idx` with m=16, ef_construction=64 (from `20260410`)
- **PROBLEM:** The `products_v1` table column is `clip_embedding`, not `clip_embedding_data`. The `products` table has `clip_embedding_data` but it is JSONB, not vector. This index creation would **fail silently** or target the wrong table.

---

## 3. CRITICAL ISSUES

### 3.1 Column Name Mismatch in HNSW Migration

**File:** `supabase/migrations/20260410000000_hnsw_migration.sql`

The HNSW index targets `clip_embedding_data`:
```sql
CREATE INDEX IF NOT EXISTS products_clip_hnsw_idx
  ON products
  USING hnsw (clip_embedding_data vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

But the actual vector column in `products_v1` is `clip_embedding` (type `vector(768)`). The `products` table has `clip_embedding_data` as **JSONB**, which cannot have a HNSW vector index.

**Impact:** The HNSW migration likely **failed** or created an index on the wrong table. The IVFFlat index on `clip_embedding` may still be the active index.

**Resolution:** Run this against the database to check:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('products', 'products_v1')
AND (indexdef LIKE '%hnsw%' OR indexdef LIKE '%ivfflat%');
```

### 3.2 Two Products Tables

The codebase has two product tables:
- `products` — defined in `apps/web/lib/supabase/migrations/001_initial.sql` with `clip_embedding_data` as JSONB
- `products_v1` — defined in `supabase/migrations/20240006000000_products.sql` with `clip_embedding` as `vector(768)`

The auto-generated Supabase types (`apps/web/lib/types/supabase.ts`) confirm both exist. The RPC functions `search_products_by_embedding` and `search_products_by_fusion_embedding` query `FROM products` (not `products_v1`), meaning they rely on whichever table is named `products` in the actual database.

### 3.3 IVFFlat Index Not Dropped by HNSW Migration

The HNSW migration (`20260410`) drops these index names:
- `products_clip_embedding_ivfflat_idx`
- `products_embedding_idx`
- `products_embedding_ivfflat_idx`
- `idx_products_clip_ivfflat`
- `idx_products_fusion_ivfflat`

But the actual IVFFlat indexes created by earlier migrations use different names:
- `products_clip_embedding_idx` (from `20240034`/`20240038`)
- `products_fusion_embedding_idx` (from `20240057`)

These would **survive** the HNSW migration DROP statements.

### 3.4 No ef_search Configuration

The HNSW index comment mentions `SET hnsw.ef_search = 100-200` for quality-critical searches, but **no code actually sets this**. The default `ef_search` in pgvector is 40. For 5,581+ products with m=16, ef_construction=64, the default is adequate but not optimal.

---

## 4. Query Pattern Catalog

### 4.1 RPC: `search_products_by_embedding`

**Defined in:** `supabase/migrations/20240020000000_clip_vector_768.sql`
**Called from:**
- `apps/web/lib/clipSearch.ts` (via REST API `POST /rest/v1/rpc/search_products_by_embedding`)
- `supabase/functions/match-products/index.ts` (via `supabase.rpc()`)

**Query pattern:**
```sql
SELECT ... FROM products p
WHERE p.clip_embedding IS NOT NULL
  AND 1 - (p.clip_embedding <=> query_embedding) > match_threshold
ORDER BY p.clip_embedding <=> query_embedding
LIMIT match_count;
```

**Similarity metric:** Cosine distance (`<=>`)
**Pre-filters:** `clip_embedding IS NOT NULL` (no `in_stock` filter in the 768 version)
**Default threshold:** 0.5 (but callers pass 0.0 and 0.3)

**Performance concern:** The `WHERE 1 - (... <=> ...) > match_threshold` clause with `match_threshold = 0.0` is effectively a no-op filter (all non-null embeddings pass), which is fine for index usage. However, when `match_threshold > 0`, this filter is applied **after** the distance computation, which can cause the planner to prefer a sequential scan if selectivity estimation is poor.

### 4.2 RPC: `search_products_by_fusion_embedding`

**Defined in:** `supabase/migrations/20240054000000_clip_fusion_embedding.sql`
**Called from:** `apps/web/lib/clipSearch.ts` (via REST API)

**Query pattern:** Same as above but on `clip_fusion_embedding` column.
**Default threshold:** 0.0
**Pre-filters:** `clip_fusion_embedding IS NOT NULL`

### 4.3 Client-side CLIP Similarity (app/api/match/route.ts)

The current M8 product matching pipeline does **NOT use pgvector at all**. Instead:

1. Crops item from render image
2. Claude Vision extracts product attributes
3. Serper Google Shopping + SearchAPI Google Lens find candidate products
4. Replicate CLIP (`andreasjansson/clip-features`) embeds crop + all candidate images in a batch
5. **Client-side cosine similarity** computed in TypeScript (`matchUtils.ts:cosineSimilarity`)
6. Products scored with weighted formula (visual, budget, fit, quality)

This means the pgvector database is **bypassed entirely** for the primary matching flow (M8). pgvector is only used by:
- The `match-products` Supabase Edge Function (legacy/fallback path)
- `clipSearch.ts` (available but not called from the main pipeline)

### 4.4 Edge Function: `match-products`

**File:** `supabase/functions/match-products/index.ts`

Calls `search_products_by_embedding` RPC with:
- `match_threshold: 0.3`
- `match_count: 15` (default)

Then applies style-vector re-ranking:
```javascript
final_score = 0.7 * clipScore + 0.3 * styleScore
```
where `styleScore` is the dot product of product `style_weights` and user `style_blend` vectors across 5 style dimensions (coastal, japandi, bohemian, mid_century, minimalist).

Falls back to style_tags-based filtering if RPC returns no results.

### 4.5 Edge Function: `clip-embed`

**File:** `supabase/functions/clip-embed/index.ts`

Generates embeddings via HuggingFace Inference API using `openai/clip-vit-large-patch14` (768-dim output). Does NOT write to database -- returns embedding to caller.

### 4.6 Replicate CLIP (apps/web/lib/ai/clip.ts)

Uses `andreasjansson/clip-features` on Replicate for image embedding. This is the same model used for batch embedding in the M8 match route. Returns 768-dim embeddings.

---

## 5. Embedding Dimension Consistency

| Component | Model | Dimensions | Consistent? |
|-----------|-------|------------|-------------|
| `clip-embed` Edge Function | `openai/clip-vit-large-patch14` (HuggingFace) | 768 | Yes |
| `clip.ts` (Replicate) | `andreasjansson/clip-features` | 768 | Yes |
| `clipSearch.ts` (text embedding) | Caller-provided `clipEmbedUrl` | Depends on caller | Unknown |
| `products.clip_embedding` column | `vector(768)` | 768 | Yes |
| `products.clip_fusion_embedding` column | `vector(768)` | 768 | Yes |
| `search_products_by_embedding` RPC | `vector(768)` parameter | 768 | Yes |
| Migration `20240012` (historical) | `vector(1024)` | 1024 | **Reversed in 20240020** |

All current production paths use 768-dim. The 1024-dim detour was corrected.

---

## 6. IVFFlat Parameter Analysis

For ~5,581 products with 768-dim vectors:

**Recommended `lists` value:** `sqrt(5581) ~= 75`. The rule of thumb is `sqrt(n)` for datasets under 1M rows.

| Index | Current `lists` | Recommended | Assessment |
|-------|----------------|-------------|------------|
| `products_clip_embedding_idx` | 50 | ~75 | Slightly low but acceptable. Lower lists = higher recall but slower scan. |
| `products_fusion_embedding_idx` | 20 | ~75 | **Too low.** Only 20 lists for 5,581 rows means each list averages ~279 rows. This provides high recall but negates much of the indexing benefit. |

**`probes` setting:** Not set anywhere in code. Default is 1, which means only 1 out of 50/20 lists is searched. For lists=50, this gives ~98 rows per probe, adequate for top-k=15 queries but recall will be ~60-80%. For lists=20 with probes=1, recall is better (~80-95%) due to larger lists.

---

## 7. HNSW Parameter Analysis

**If the HNSW index on `clip_embedding_data` actually succeeded** (uncertain due to column name mismatch):

| Parameter | Value | Assessment |
|-----------|-------|------------|
| `m` | 16 | Standard default. Good for 768-dim vectors at ~5K scale. |
| `ef_construction` | 64 | Adequate for 5K products. Higher (128-200) would improve recall slightly but slow build. |
| `ef_search` | 40 (default, never set) | Should be set to 80-100 for production. Default 40 may miss ~1-2% of true nearest neighbors. |

**For 5,581 products, HNSW with m=16, ef_construction=64 is appropriate.** The index build is fast and recall at ef_search=40 is typically >95% for this dataset size.

---

## 8. Sequential Scan Risk Assessment

### Queries likely safe from sequential scan:
- `search_products_by_embedding` with `match_threshold = 0.0`: The ORDER BY + LIMIT pattern allows pgvector to use the index scan directly.
- `search_products_by_fusion_embedding` with `match_threshold = 0.0`: Same reasoning.

### Queries at risk:
- **Any call with `match_threshold > 0`**: The WHERE clause `1 - (embedding <=> query) > threshold` cannot be pushed into the index scan. The planner may choose a sequential scan if it estimates that the threshold filter eliminates too few rows. With `match_threshold = 0.3` (used by the Edge Function), this is a moderate risk.
- **The original `search_products_by_embedding` from migration `20240006`** had `AND in_stock = true` in the WHERE clause. Composite filtering (vector + boolean) on a vector-only index can force sequential scan. This was removed in migration `20240020`.

### Recommended EXPLAIN ANALYZE queries to run manually:

```sql
-- 1. Check which indexes exist
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('products', 'products_v1')
AND (indexdef LIKE '%hnsw%' OR indexdef LIKE '%ivfflat%' OR indexdef LIKE '%vector%');

-- 2. Test the main search RPC
EXPLAIN ANALYZE
SELECT * FROM search_products_by_embedding(
  (SELECT clip_embedding FROM products WHERE clip_embedding IS NOT NULL LIMIT 1),
  0.0, 15
);

-- 3. Test with threshold (sequential scan risk)
EXPLAIN ANALYZE
SELECT * FROM search_products_by_embedding(
  (SELECT clip_embedding FROM products WHERE clip_embedding IS NOT NULL LIMIT 1),
  0.3, 15
);

-- 4. Test fusion search
EXPLAIN ANALYZE
SELECT * FROM search_products_by_fusion_embedding(
  (SELECT clip_fusion_embedding FROM products WHERE clip_fusion_embedding IS NOT NULL LIMIT 1),
  0.0, 15
);

-- 5. Check actual column types
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'products'
AND column_name LIKE '%embed%' OR column_name LIKE '%vector%';

-- 6. Check row counts
SELECT
  COUNT(*) AS total,
  COUNT(clip_embedding) AS with_clip,
  COUNT(clip_fusion_embedding) AS with_fusion
FROM products;
```

---

## 9. Product Matching Flow Summary

### Active flow (M8 -- `app/api/match/route.ts`):
1. Crop item from render via `renderCrop.ts`
2. Claude Vision (`claude-sonnet-4-6`) extracts structured product attributes
3. 3 Serper Shopping queries + 2 Google Lens queries fired in parallel
4. RRF (Reciprocal Rank Fusion) merges 5 result lists
5. Furniture retailer allowlist filter applied
6. Top 25 candidates sent to Replicate CLIP for batch embedding
7. Cosine similarity computed **in TypeScript** (not pgvector)
8. Weighted scoring: `visual * w1 + budget * w2 + fit * w3 + quality * w4 + lensBoost`
9. **pgvector is NOT used in this flow**

### Legacy flow (`match-products` Edge Function):
1. Receives `render_embedding` (768-dim) from caller
2. Calls `search_products_by_embedding` RPC (**uses pgvector**)
3. Re-ranks with `0.7 * clipScore + 0.3 * styleScore`
4. Falls back to `style_tags` + `room_types` filtering if RPC fails

### Style vector re-ranking:
- Computed in the Edge Function using dot product of `style_weights` (per product) and `style_blend` (per user)
- 5 style dimensions: coastal, japandi, bohemian, mid_century, minimalist
- Weight split: 70% CLIP similarity, 30% style alignment
- **Note:** CLAUDE.md spec says "style vector re-ranking (x1.10 match, x0.85 no match)" but actual code uses a continuous dot product, not discrete multipliers

---

## 10. Recommendations

### P0 -- Must Fix

1. **Verify HNSW index existence.** Run the EXPLAIN ANALYZE queries in Section 8 to determine whether `products_clip_hnsw_idx` actually exists. The column name mismatch (`clip_embedding_data` vs `clip_embedding`) likely caused the migration to fail.

2. **Fix the HNSW migration.** If the index does not exist, create a corrected migration:
   ```sql
   CREATE INDEX IF NOT EXISTS products_clip_hnsw_idx
     ON products
     USING hnsw (clip_embedding vector_cosine_ops)
     WITH (m = 16, ef_construction = 64);
   ```

3. **Verify IVFFlat indexes were actually dropped.** The HNSW migration used wrong index names in its DROP statements. Run:
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename = 'products' AND indexdef LIKE '%ivfflat%';
   ```

### P1 -- Should Fix

4. **Set `hnsw.ef_search` in RPC functions.** Add `SET LOCAL hnsw.ef_search = 80;` at the start of both RPC functions for better recall:
   ```sql
   CREATE OR REPLACE FUNCTION search_products_by_embedding(...)
   LANGUAGE plpgsql AS $$
   BEGIN
     SET LOCAL hnsw.ef_search = 80;
     RETURN QUERY SELECT ...;
   END;
   $$;
   ```

5. **Fix fusion IVFFlat lists parameter.** `lists=20` for ~5,581 products is too low. Rebuild with `lists=75`:
   ```sql
   DROP INDEX IF EXISTS products_fusion_embedding_idx;
   CREATE INDEX products_fusion_embedding_idx
     ON products USING ivfflat (clip_fusion_embedding vector_cosine_ops)
     WITH (lists = 75);
   ```
   Or better: migrate fusion to HNSW as well.

6. **Resolve the products vs products_v1 table ambiguity.** Confirm which table the RPC functions actually query in production. The generated types show both tables exist with different column names for the same concept.

### P2 -- Nice to Have

7. **Consider removing pgvector dependency.** The M8 pipeline does not use pgvector at all (Serper + Lens + client-side CLIP). If the Edge Function `match-products` is also deprecated, the pgvector infrastructure is dead code carrying maintenance cost.

8. **Add composite index for filtered vector search.** If `in_stock` filtering is re-added to the RPC, create a partial index:
   ```sql
   CREATE INDEX products_clip_hnsw_active_idx
     ON products USING hnsw (clip_embedding vector_cosine_ops)
     WITH (m = 16, ef_construction = 64)
     WHERE in_stock = true;
   ```

9. **Monitor for DINOv3/SigLIP2 migration.** Columns are defined in pending migration `002_v2_columns.sql` but not yet populated. When populated, will need corresponding HNSW indexes and new RPC functions.

---

## 11. File Reference

| File | Role |
|------|------|
| `supabase/migrations/20240006000000_products.sql` | Original products table + RPC |
| `supabase/migrations/20240012000000_fix_products_vector.sql` | 1024-dim detour + first HNSW |
| `supabase/migrations/20240020000000_clip_vector_768.sql` | Back to 768-dim + updated RPC |
| `supabase/migrations/20240034000000_rebuild_ivfflat_index.sql` | IVFFlat lists=50 |
| `supabase/migrations/20240038000000_rebuild_ivfflat_expanded.sql` | IVFFlat rebuild after catalog expansion |
| `supabase/migrations/20240054000000_clip_fusion_embedding.sql` | Fusion embedding column + IVFFlat + RPC |
| `supabase/migrations/20240057000000_rebuild_fusion_ivfflat.sql` | Fusion IVFFlat lists=20 |
| `supabase/migrations/20260410000000_hnsw_migration.sql` | HNSW migration (column name bug) |
| `apps/web/lib/clipSearch.ts` | Client-side RPC callers for both search functions |
| `apps/web/lib/ai/clip.ts` | Replicate CLIP embedding + cosine similarity |
| `apps/web/lib/ai/matchUtils.ts` | Client-side scoring utilities |
| `apps/web/app/api/match/route.ts` | M8 match pipeline (does NOT use pgvector) |
| `apps/web/app/api/pipeline/furniture-match/route.ts` | Furniture detection + SERP matching |
| `supabase/functions/match-products/index.ts` | Edge Function using pgvector RPC |
| `supabase/functions/clip-embed/index.ts` | HuggingFace CLIP embedding edge function |
| `supabase/tests/rls_policies.test.sql` | pgTAP test verifying vector index exists |
| `apps/web/tests/db/hnsw-migration.test.ts` | Unit tests for HNSW migration file |
| `scripts/create-vector-index.sql` | Standalone IVFFlat creation script |
| `docs/migrations/002_v2_columns.sql` | Pending DINOv3 + SigLIP2 columns |
