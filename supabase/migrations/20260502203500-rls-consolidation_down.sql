-- Reverse step 6. Drop every p1_* policy created in the up migration.
-- Recreate legacy policies from cova-plan/snapshots/P01a-pre-drop-*.sql at rollback time.

DROP POLICY IF EXISTS p1_users_self_all ON users;
DROP POLICY IF EXISTS p1_rooms_self_all ON rooms;
DROP POLICY IF EXISTS p1_renders_self_all ON renders;
DROP POLICY IF EXISTS p1_chat_messages_self_all ON chat_messages;
DROP POLICY IF EXISTS p1_style_fingerprints_self_all ON style_fingerprints;
DROP POLICY IF EXISTS p1_interactions_self_all ON interactions;
DROP POLICY IF EXISTS p1_swipe_history_self_all ON swipe_history;
DROP POLICY IF EXISTS p1_redesign_feedback_self_all ON redesign_feedback;
DROP POLICY IF EXISTS p1_saved_products_self_all ON saved_products;
DROP POLICY IF EXISTS p1_sam_embeddings_self_all ON sam_embeddings;
DROP POLICY IF EXISTS p1_render_sessions_via_room ON render_sessions;
DROP POLICY IF EXISTS p1_room_products_via_room_read ON room_products;
DROP POLICY IF EXISTS p1_empty_room_cache_self_read ON empty_room_cache;

DROP POLICY IF EXISTS p1_quiz_images_public_read ON storage.objects;
DROP POLICY IF EXISTS p1_room_uploads_user_insert ON storage.objects;
DROP POLICY IF EXISTS p1_room_uploads_user_read ON storage.objects;
DROP POLICY IF EXISTS p1_room_uploads_user_update ON storage.objects;
DROP POLICY IF EXISTS p1_room_uploads_user_delete ON storage.objects;

\echo 'See cova-plan/snapshots/P01a-pre-drop-*.sql for the legacy policy DDL to recreate'
