-- pgTAP tests for Cova RLS policies
-- Run with: npx supabase test db
-- Tests run inside a transaction that automatically rolls back.

BEGIN;
SELECT plan(14);

-- Test 1: products table has all required columns
SELECT has_column('public', 'products', 'id', 'products has id column');

-- Test 2: products has name column
SELECT has_column('public', 'products', 'name', 'products has name column');

-- Test 3: products has price column
SELECT has_column('public', 'products', 'price', 'products has price column');

-- Test 4: products has image_url column
SELECT has_column('public', 'products', 'image_url', 'products has image_url column');

-- Test 5: products has clip_embedding_data column
SELECT has_column('public', 'products', 'clip_embedding_data', 'products has clip_embedding_data column');

-- Test 6: products has category column
SELECT has_column('public', 'products', 'category', 'products has category column');

-- Test 7: products has retailer column
SELECT has_column('public', 'products', 'retailer', 'products has retailer column');

-- Test 8: rooms table has user_id column (for RLS)
SELECT has_column('public', 'rooms', 'user_id', 'rooms has user_id column');

-- Test 9: rooms table has RLS enabled
SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname = 'rooms'
    AND c.relrowsecurity = true
  ),
  'rooms table has RLS enabled'
);

-- Test 10: products table exists and has data
SELECT ok(
  (SELECT count(*)::int FROM products) > 0,
  'products table has data'
);

-- Test 11: style_fingerprints table exists
SELECT has_table('public', 'style_fingerprints', 'style_fingerprints table exists');

-- Test 12: render_sessions table exists
SELECT has_table('public', 'render_sessions', 'render_sessions table exists');

-- Test 13: interactions table exists
SELECT has_table('public', 'interactions', 'interactions table exists');

-- Test 14: An index exists on products for embedding search
SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'products'
    AND (indexdef LIKE '%hnsw%' OR indexdef LIKE '%ivfflat%')
  ),
  'vector index exists on products table'
);

SELECT finish();
ROLLBACK;
