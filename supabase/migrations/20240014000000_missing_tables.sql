-- Add furniture_placements and cart_items tables
-- Note: swipe_cards already exists on remote, using IF NOT EXISTS

CREATE TABLE IF NOT EXISTS public.furniture_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  furniture_catalog_id TEXT NOT NULL,
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  rotation_y FLOAT NOT NULL DEFAULT 0,
  scale FLOAT NOT NULL DEFAULT 1,
  color_override TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.furniture_placements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'furniture_placements' AND policyname = 'placements_via_room'
  ) THEN
    CREATE POLICY "placements_via_room" ON public.furniture_placements
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = room_id AND rooms.user_id = auth.uid()
      )
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cart_items' AND policyname = 'cart_own'
  ) THEN
    CREATE POLICY "cart_own" ON public.cart_items
    FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.swipe_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  room_type TEXT NOT NULL,
  style_weights JSONB NOT NULL DEFAULT '{}',
  batch_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.swipe_cards ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS public.swipe_cards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'swipe_cards' AND policyname = 'swipe_cards_public_read'
  ) THEN
    CREATE POLICY "swipe_cards_public_read" ON public.swipe_cards
    FOR SELECT USING (active = true);
  END IF;
END $$;
