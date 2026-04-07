-- Render sessions table for tracking AI render pipeline status
CREATE TABLE IF NOT EXISTS render_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  style_session_id uuid REFERENCES style_sessions(id),
  status text DEFAULT 'processing',
  render_url text,
  video_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE render_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own render sessions"
  ON render_sessions FOR ALL
  USING (auth.uid() = user_id);
