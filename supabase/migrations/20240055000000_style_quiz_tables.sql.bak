-- Style sessions table
CREATE TABLE IF NOT EXISTS style_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  capture_session_id uuid,
  swipes jsonb DEFAULT '[]',
  style_fingerprint jsonb,
  confidence float DEFAULT 0,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE style_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own style sessions" ON style_sessions FOR ALL USING (auth.uid() = user_id);

-- Room cards table (quiz card images with style tags)
CREATE TABLE IF NOT EXISTS room_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  style_tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE room_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read room cards" ON room_cards FOR SELECT USING (true);
