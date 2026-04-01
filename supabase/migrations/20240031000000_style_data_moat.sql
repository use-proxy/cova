-- 001_style_data_moat.sql
-- Cova Style Data Moat Schema Migration
-- Adds style tracking, product analytics, and user profile tables

BEGIN;

-- ============================================================
-- PART 1: Enrich swipe_history
-- ============================================================
ALTER TABLE swipe_history ADD COLUMN IF NOT EXISTS card_style text;
ALTER TABLE swipe_history ADD COLUMN IF NOT EXISTS card_phase text;
ALTER TABLE swipe_history ADD COLUMN IF NOT EXISTS style_vector_before jsonb;
ALTER TABLE swipe_history ADD COLUMN IF NOT EXISTS style_vector_after jsonb;
ALTER TABLE swipe_history ADD COLUMN IF NOT EXISTS session_position integer;
ALTER TABLE swipe_history ADD COLUMN IF NOT EXISTS card_image_url text;

-- ============================================================
-- PART 2: Enrich rooms table
-- ============================================================
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS final_style_vector jsonb;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS redesign_style text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS user_feedback_score integer;

-- ============================================================
-- PART 3: Create product_impressions table
-- ============================================================
CREATE TABLE IF NOT EXISTS product_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  shown_at timestamptz DEFAULT now(),
  position_in_results integer,
  style_vector_at_time jsonb,
  clip_score float,
  room_style text
);
ALTER TABLE product_impressions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own impressions' AND tablename = 'product_impressions') THEN
    CREATE POLICY "Users see own impressions" ON product_impressions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- PART 4: Create product_interactions table
-- ============================================================
CREATE TABLE IF NOT EXISTS product_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  interaction_type text CHECK (interaction_type IN ('unlocked', 'clicked', 'purchased')),
  token_cost integer DEFAULT 0,
  affiliate_retailer text,
  price_at_time float,
  style_vector_at_time jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE product_interactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own interactions' AND tablename = 'product_interactions') THEN
    CREATE POLICY "Users see own interactions" ON product_interactions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- PART 5: Create redesign_feedback table
-- ============================================================
CREATE TABLE IF NOT EXISTS redesign_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  feedback_score integer CHECK (feedback_score BETWEEN 1 AND 5),
  redesign_style text,
  style_vector_at_time jsonb,
  time_spent_in_viewer_ms bigint,
  hotspots_clicked integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE redesign_feedback ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own feedback' AND tablename = 'redesign_feedback') THEN
    CREATE POLICY "Users see own feedback" ON redesign_feedback FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- PART 6: Create user_style_profiles table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  style_vector jsonb,
  swipe_count integer DEFAULT 0,
  rooms_completed integer DEFAULT 0,
  products_unlocked integer DEFAULT 0,
  products_purchased integer DEFAULT 0,
  dominant_style text,
  style_certainty float,
  price_range_preference jsonb,
  preferred_retailers text[],
  category_affinity jsonb,
  last_updated_at timestamptz DEFAULT now()
);
ALTER TABLE user_style_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own profile' AND tablename = 'user_style_profiles') THEN
    CREATE POLICY "Users see own profile" ON user_style_profiles FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- PART 7: Create style_purchase_signals table
-- ============================================================
CREATE TABLE IF NOT EXISTS style_purchase_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  style_vector jsonb,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  product_category text,
  product_retailer text,
  product_price float,
  clip_score float,
  signal_type text CHECK (signal_type IN ('unlocked', 'purchased', 'shared')),
  room_style text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE style_purchase_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users see own signals' AND tablename = 'style_purchase_signals') THEN
    CREATE POLICY "Users see own signals" ON style_purchase_signals FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- PART 8: Indexes for query performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_swipe_history_user_id ON swipe_history(user_id);
CREATE INDEX IF NOT EXISTS idx_swipe_history_card_style ON swipe_history(card_style);
CREATE INDEX IF NOT EXISTS idx_product_impressions_user_room ON product_impressions(user_id, room_id);
CREATE INDEX IF NOT EXISTS idx_product_interactions_user_type ON product_interactions(user_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_style_purchase_signals_user ON style_purchase_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_style_purchase_signals_style ON style_purchase_signals USING gin(style_vector);

COMMIT;
