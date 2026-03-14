-- Chat sessions with messages JSONB array, summary column, updated_at trigger

CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  render_id UUID REFERENCES public.renders(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 5000),
  last_action_type TEXT CHECK (last_action_type IS NULL OR char_length(last_action_type) <= 100),
  total_messages INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER chat_sessions_updated_at
BEFORE UPDATE ON public.chat_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
