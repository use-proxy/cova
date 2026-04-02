-- Chat messages table for conversation persistence (v2 — session-based)
CREATE TABLE IF NOT EXISTS chat_messages_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text CHECK (role IN ('user', 'assistant')),
  content text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat messages"
  ON chat_messages_v2 FOR ALL
  USING (auth.uid() = user_id);
