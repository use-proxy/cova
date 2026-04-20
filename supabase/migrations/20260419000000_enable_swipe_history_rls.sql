-- Phase 0 RLS hardening: enable RLS on swipe_history
-- Audit: docs/audit/supabase.md — MEDIUM: swipe_history had ENABLE ROW LEVEL SECURITY missing.

ALTER TABLE swipe_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swipe_history_own"
  ON swipe_history
  FOR ALL
  USING (auth.uid() = user_id);
