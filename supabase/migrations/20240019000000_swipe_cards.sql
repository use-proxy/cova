-- Swipe cards table for style fingerprint quiz
-- Stores AI-generated room images used in the onboarding swipe UX

CREATE TABLE public.swipe_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type TEXT NOT NULL CHECK (room_type IN ('living_room', 'bedroom', 'dining_room', 'home_office')),
  style TEXT NOT NULL CHECK (style IN ('coastal', 'japandi', 'bohemian', 'mid_century', 'minimalist')),
  image_url TEXT NOT NULL CHECK (char_length(image_url) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by room_type + style (used during quiz)
CREATE INDEX swipe_cards_room_type_style_idx ON public.swipe_cards (room_type, style);

-- RLS: public read, no direct writes (service role only)
ALTER TABLE public.swipe_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swipe_cards_public_read" ON public.swipe_cards
  FOR SELECT USING (true);
