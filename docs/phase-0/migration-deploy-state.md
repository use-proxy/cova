
## Migration 1: 20260419000001_ref_table_policies
### Pre-deploy snapshot
 schemaname | tablename | policyname | roles | cmd 
------------+-----------+------------+-------+-----
(0 rows)


## Migration 2: 20260419000003_fix_hnsw_targeting
### Pre-deploy snapshot
           indexname           |  tablename  
-------------------------------+-------------
 idx_products_clip_embedding   | products
 products_clip_hnsw_idx        | products
 products_pkey1                | products
 idx_products_in_stock         | products_v1
 idx_products_linked           | products_v1
 idx_products_retailer_3d      | products_v1
 products_clip_embedding_idx   | products_v1
 products_clip_ivfflat         | products_v1
 products_fusion_embedding_idx | products_v1
 products_pkey                 | products_v1
(10 rows)

 table_name  |      column_name      | udt_name 
-------------+-----------------------+----------
 products_v1 | clip_embedding        | vector
 products_v1 | clip_fusion_embedding | vector
(2 rows)


## Migration 3: 20260419000004_lora_default_scales
### Pre-deploy snapshot
 style_name | recommended_scale 
------------+-------------------
(0 rows)


## Migration 3: 20260419000004_lora_default_scales — SKIPPED (DEFERRED)

**Decision:** Option A — skip entirely. File moved to
`supabase/migrations/_deferred/20260419000004_lora_default_scales.sql.deferred`.

**Why:**
- Migration targets `style_loras.style_name = 'COVA<X>'`, but production schema
  uses display names (`Warm & Grounded`) and app code keys lookups on
  `trigger_word` (cvwmn, cvscn, ...).
- Only 1 of 10 referenced LoRAs exists in prod DB. Applying would be a no-op.
- A correctly-targeted rewrite is deferred to post-LoRA-training or moved
  to `lora-registry.ts` as single source of truth.

**No production writes made for migration 3.**

## Migration 4: 20260419000002_room_photos_storage_rls
### Pre-deploy snapshot
       policyname        |  cmd   |               qual                
-------------------------+--------+-----------------------------------
 Public read room-photos | SELECT | (bucket_id = 'room-photos'::text)
(1 row)


## Migration 5: 20260419000000_enable_swipe_history_rls
### Pre-deploy snapshot
    relname    | relrowsecurity 
---------------+----------------
 swipe_history | t
(1 row)

             policyname             | cmd 
------------------------------------+-----
 Users can manage own swipe history | ALL
(1 row)

