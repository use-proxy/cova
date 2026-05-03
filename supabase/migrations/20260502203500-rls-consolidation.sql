-- P01a M1 step 6 — RLS consolidation. Every CREATE POLICY uses p1_ prefix (Decision 10).
-- Drops legacy duplicate per-op policies; creates one FOR ALL per kept user-scoped table.
-- Service-role-only tables: RLS enabled, no policies (deny by default).
-- Storage buckets get policy entries here too.

-- 1. Drop redundant per-op policies (consolidate to FOR ALL).
DROP POLICY IF EXISTS rooms_select_own ON rooms;
DROP POLICY IF EXISTS rooms_insert_own ON rooms;
DROP POLICY IF EXISTS rooms_update_own ON rooms;
DROP POLICY IF EXISTS rooms_delete_own ON rooms;
DROP POLICY IF EXISTS users_own_rooms ON rooms;

DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;
DROP POLICY IF EXISTS users_delete_own ON users;
DROP POLICY IF EXISTS users_own_data ON users;

DROP POLICY IF EXISTS chat_messages_select_own ON chat_messages;
DROP POLICY IF EXISTS chat_messages_insert_own ON chat_messages;
DROP POLICY IF EXISTS chat_messages_update_own ON chat_messages;
DROP POLICY IF EXISTS chat_messages_delete_own ON chat_messages;
DROP POLICY IF EXISTS "Users can insert own room messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can read own room messages" ON chat_messages;

DROP POLICY IF EXISTS fingerprints_select_own ON style_fingerprints;
DROP POLICY IF EXISTS fingerprints_insert_own ON style_fingerprints;
DROP POLICY IF EXISTS fingerprints_update_own ON style_fingerprints;
DROP POLICY IF EXISTS users_own_fingerprints ON style_fingerprints;

DROP POLICY IF EXISTS render_sessions_select_own ON render_sessions;
DROP POLICY IF EXISTS render_sessions_insert_own ON render_sessions;
DROP POLICY IF EXISTS users_own_render_sessions ON render_sessions;

DROP POLICY IF EXISTS interactions_select_own ON interactions;
DROP POLICY IF EXISTS interactions_insert_own ON interactions;
DROP POLICY IF EXISTS users_own_interactions ON interactions;

-- renders: drop the unsafe service_insert (`WITH CHECK true`) and replace
DROP POLICY IF EXISTS renders_select_own ON renders;
DROP POLICY IF EXISTS renders_insert_own ON renders;
DROP POLICY IF EXISTS renders_update_own ON renders;
DROP POLICY IF EXISTS renders_delete_own ON renders;
DROP POLICY IF EXISTS renders_service_insert ON renders;

DROP POLICY IF EXISTS swipe_history_own ON swipe_history;
DROP POLICY IF EXISTS "Users can manage own swipe history" ON swipe_history;

-- 2. Confirm RLS enabled on every kept user-scoped table.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE renders ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE render_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE redesign_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sam_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE swipe_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE empty_room_cache ENABLE ROW LEVEL SECURITY;

-- 3. Re-create consolidated FOR ALL policies on kept user-scoped tables (p1_ prefix).
CREATE POLICY p1_users_self_all ON users FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY p1_rooms_self_all ON rooms FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY p1_renders_self_all ON renders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY p1_chat_messages_self_all ON chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY p1_style_fingerprints_self_all ON style_fingerprints FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY p1_interactions_self_all ON interactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY p1_swipe_history_self_all ON swipe_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY p1_redesign_feedback_self_all ON redesign_feedback FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY p1_saved_products_self_all ON saved_products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY p1_sam_embeddings_self_all ON sam_embeddings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- render_sessions: scoping by room ownership (subquery)
CREATE POLICY p1_render_sessions_via_room ON render_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM rooms WHERE rooms.id = render_sessions.room_id AND rooms.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM rooms WHERE rooms.id = render_sessions.room_id AND rooms.user_id = auth.uid()));

-- room_products: scoping by room ownership (read-only for users; writes service-role)
CREATE POLICY p1_room_products_via_room_read ON room_products FOR SELECT
  USING (EXISTS (SELECT 1 FROM rooms WHERE rooms.id = room_products.room_id AND rooms.user_id = auth.uid()));

-- empty_room_cache: read-only for owning user (cache keyed by image hash + user)
CREATE POLICY p1_empty_room_cache_self_read ON empty_room_cache FOR SELECT USING (auth.uid() = user_id);

-- rate_limits stays service-role-only (no policy), so a user cannot tamper with their own counters

-- 4. Storage bucket policies.
-- Ensure required buckets exist (idempotent)
INSERT INTO storage.buckets (id, name, public) VALUES ('quiz-images', 'quiz-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('room-uploads', 'room-uploads', false) ON CONFLICT DO NOTHING;

-- Drop legacy storage policies that we're replacing
DROP POLICY IF EXISTS "Public read quiz-images" ON storage.objects;
DROP POLICY IF EXISTS "uploads_own" ON storage.objects;

-- Create p1_ prefixed storage policies
CREATE POLICY p1_quiz_images_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'quiz-images');

CREATE POLICY p1_room_uploads_user_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'room-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY p1_room_uploads_user_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'room-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY p1_room_uploads_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'room-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY p1_room_uploads_user_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'room-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
