-- Phase 0 RLS hardening: public-read policies for reference tables
-- Audit: docs/audit/supabase.md — LOW: style_loras, style_vectors, app_config had RLS enabled
-- but no policies. Adds public SELECT; service_role-only writes where applicable.

CREATE POLICY "style_loras_public_read"
  ON style_loras
  FOR SELECT
  USING (true);

CREATE POLICY "style_loras_service_write"
  ON style_loras
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "style_vectors_public_read"
  ON style_vectors
  FOR SELECT
  USING (true);

CREATE POLICY "app_config_public_read"
  ON app_config
  FOR SELECT
  USING (true);
