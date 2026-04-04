-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- USERS
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  auth_provider text NOT NULL DEFAULT 'email',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- STYLE_FINGERPRINTS
CREATE TABLE IF NOT EXISTS public.style_fingerprints (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id)
    ON DELETE CASCADE,
  vector_data jsonb NOT NULL DEFAULT '[]',
  style_name text,
  room_type text,
  budget_tier text,
  quiz_responses jsonb NOT NULL DEFAULT '[]',
  entry_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.style_fingerprints ENABLE ROW LEVEL SECURITY;

-- ROOMS
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id)
    ON DELETE CASCADE,
  fingerprint_id uuid REFERENCES public.style_fingerprints(id)
    ON DELETE SET NULL,
  original_photo_url text,
  depth_map_url text,
  render_url text,
  keep_mask jsonb,
  room_type text,
  dimensions text,
  constraints text[],
  inclusions text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- RENDER_SESSIONS
CREATE TABLE IF NOT EXISTS public.render_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id uuid NOT NULL REFERENCES public.rooms(id)
    ON DELETE CASCADE,
  render_url text,
  prompt text,
  style_strength float,
  iteration integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.render_sessions ENABLE ROW LEVEL SECURITY;

-- PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  retailer text,
  price numeric,
  affiliate_url text,
  image_url text,
  clip_embedding_data jsonb,
  style_tags text[],
  room_types text[],
  in_stock boolean NOT NULL DEFAULT true,
  commission_rate numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- INTERACTIONS
CREATE TABLE IF NOT EXISTS public.interactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id)
    ON DELETE SET NULL,
  action text NOT NULL,
  fingerprint_id uuid REFERENCES public.style_fingerprints(id)
    ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_style_fingerprints_user_id
  ON public.style_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_style_fingerprints_created_at
  ON public.style_fingerprints(created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_user_id
  ON public.rooms(user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type
  ON public.rooms(room_type);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at
  ON public.rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_render_sessions_room_id
  ON public.render_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_interactions_user_id
  ON public.interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_room_id
  ON public.interactions(room_id);
CREATE INDEX IF NOT EXISTS idx_products_in_stock
  ON public.products(in_stock);

-- RLS POLICIES

-- users: users can only read and update their own row
DO $$ BEGIN
  CREATE POLICY "users_select_own" ON public.users
    FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- style_fingerprints: users can CRUD their own
DO $$ BEGIN
  CREATE POLICY "fingerprints_select_own"
    ON public.style_fingerprints
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "fingerprints_insert_own"
    ON public.style_fingerprints
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "fingerprints_update_own"
    ON public.style_fingerprints
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- rooms: users can CRUD their own
DO $$ BEGIN
  CREATE POLICY "rooms_select_own" ON public.rooms
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rooms_insert_own" ON public.rooms
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rooms_update_own" ON public.rooms
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "rooms_delete_own" ON public.rooms
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- render_sessions: users access via room ownership
DO $$ BEGIN
  CREATE POLICY "render_sessions_select_own"
    ON public.render_sessions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = render_sessions.room_id
        AND rooms.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "render_sessions_insert_own"
    ON public.render_sessions
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.rooms
        WHERE rooms.id = render_sessions.room_id
        AND rooms.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- products: public read, no user writes
DO $$ BEGIN
  CREATE POLICY "products_select_all" ON public.products
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- interactions: users can insert and read their own
DO $$ BEGIN
  CREATE POLICY "interactions_insert_own" ON public.interactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "interactions_select_own" ON public.interactions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
