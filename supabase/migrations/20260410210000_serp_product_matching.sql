-- Migration: SERP-based product matching
-- Adds SERP-specific columns to room_products for storing search results
-- from SearchAPI.io / Serper.dev instead of catalog-based CLIP matches.
-- Makes product_id nullable since SERP results are not in the products table.

-- Make product_id nullable (SERP results don't reference the products table)
ALTER TABLE room_products ALTER COLUMN product_id DROP NOT NULL;

-- Add SERP-specific columns
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS serp_title TEXT;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS serp_price FLOAT;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS serp_retailer TEXT;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS serp_product_url TEXT;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS serp_image_url TEXT;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS match_score FLOAT;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS match_label TEXT;
ALTER TABLE room_products ADD COLUMN IF NOT EXISTS is_sale BOOLEAN DEFAULT FALSE;

-- Add render_detection_result column for Section 3 (Claude Vision bounding boxes)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS render_detection_result JSONB;

-- Add redesign_error column for Section 6 (failure handling)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS redesign_error TEXT;

-- Ensure matched_products column exists on rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS matched_products JSONB;
