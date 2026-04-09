-- Drop legacy 10-dim quiz tables. Everything has been migrated to
-- quiz_anchor_images and quiz_comparison_pairs (created in
-- 20260408000000_quiz_image_library.sql) and the four live quiz routes
-- plus the two mood routes plus fetchTopStyleReference have all been
-- repointed at the new tables (Session C + cleanup).
--
-- Pre-flight checks performed in Session C cleanup:
--   • apps/web/tsconfig.json include path contains zero `.from('swipe_cards')`
--     or `.from('style_references')` calls.
--   • All legacy references live in tests/e2e/** and apps/web/scripts/**
--     which are excluded from the build and are either obsolete 10-dim
--     seeders or dead Playwright tests.
--
-- Both tables were already row-wiped in Session A (17 style_fingerprints,
-- 1292 swipe_cards, 15 style_references rows deleted).

DROP TABLE IF EXISTS public.swipe_cards      CASCADE;
DROP TABLE IF EXISTS public.style_references CASCADE;
