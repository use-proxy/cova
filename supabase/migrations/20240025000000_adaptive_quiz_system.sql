-- Adaptive quiz system: anchor renders, discriminability scoring, blend cards, product style tags

-- Add discriminability_score to swipe_cards
ALTER TABLE swipe_cards ADD COLUMN IF NOT EXISTS discriminability_score float DEFAULT 0.5;
UPDATE swipe_cards SET discriminability_score = 1.0 WHERE discriminability_score IS NULL OR discriminability_score = 0.5;

-- Relax style CHECK constraint to allow blend styles
ALTER TABLE swipe_cards DROP CONSTRAINT IF EXISTS swipe_cards_style_check;

-- Create anchor_renders table for style blend reference images
CREATE TABLE IF NOT EXISTS anchor_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_weights jsonb NOT NULL,
  image_url text NOT NULL,
  room_type text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE anchor_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anchor_renders_public_read" ON anchor_renders FOR SELECT USING (true);

-- Seed anchor renders with reliable Unsplash images for each pure style
INSERT INTO anchor_renders (style_weights, image_url, room_type, label) VALUES
  ('{"coastal":1.0,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}', 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1024&h=1024&fit=crop', 'living_room', 'Pure Coastal'),
  ('{"coastal":0.0,"japandi":1.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1024&h=1024&fit=crop', 'living_room', 'Pure Japandi'),
  ('{"coastal":0.0,"japandi":0.0,"bohemian":1.0,"mid_century":0.0,"minimalist":0.0}', 'https://images.unsplash.com/photo-1617103996702-96ff29b1c467?w=1024&h=1024&fit=crop', 'living_room', 'Pure Bohemian'),
  ('{"coastal":0.0,"japandi":0.0,"bohemian":0.0,"mid_century":1.0,"minimalist":0.0}', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1024&h=1024&fit=crop', 'living_room', 'Pure Mid-Century'),
  ('{"coastal":0.0,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":1.0}', 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=1024&h=1024&fit=crop', 'living_room', 'Pure Minimalist'),
  ('{"coastal":0.6,"japandi":0.4,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}', 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=1024&h=1024&fit=crop', 'living_room', 'Coastal-Japandi 60/40'),
  ('{"coastal":0.4,"japandi":0.6,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}', 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1024&h=1024&fit=crop', 'living_room', 'Japandi-Coastal 60/40'),
  ('{"coastal":0.0,"japandi":0.5,"bohemian":0.0,"mid_century":0.0,"minimalist":0.5}', 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1024&h=1024&fit=crop', 'living_room', 'Japandi-Minimalist 50/50'),
  ('{"coastal":0.0,"japandi":0.0,"bohemian":0.5,"mid_century":0.5,"minimalist":0.0}', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1024&h=1024&fit=crop', 'living_room', 'Bohemian-MidCentury 50/50'),
  ('{"coastal":0.5,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.5}', 'https://images.unsplash.com/photo-1505693314120-0d443867891c?w=1024&h=1024&fit=crop', 'living_room', 'Coastal-Minimalist 50/50')
ON CONFLICT DO NOTHING;

-- Seed blend cards (refinement phase) into swipe_cards
INSERT INTO swipe_cards (room_type, style, style_weights, phase, active, discriminability_score, image_url) VALUES
  ('living_room', 'coastal_japandi', '{"coastal":0.7,"japandi":0.3,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&h=800&fit=crop'),
  ('living_room', 'coastal_japandi', '{"coastal":0.3,"japandi":0.7,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=800&fit=crop'),
  ('living_room', 'japandi_minimalist', '{"coastal":0.0,"japandi":0.7,"bohemian":0.0,"mid_century":0.0,"minimalist":0.3}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&h=800&fit=crop'),
  ('living_room', 'japandi_minimalist', '{"coastal":0.0,"japandi":0.3,"bohemian":0.0,"mid_century":0.0,"minimalist":0.7}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&h=800&fit=crop'),
  ('living_room', 'bohemian_midcentury', '{"coastal":0.0,"japandi":0.0,"bohemian":0.7,"mid_century":0.3,"minimalist":0.0}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1617103996702-96ff29b1c467?w=800&h=800&fit=crop'),
  ('living_room', 'bohemian_midcentury', '{"coastal":0.0,"japandi":0.0,"bohemian":0.3,"mid_century":0.7,"minimalist":0.0}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=800&fit=crop'),
  ('living_room', 'coastal_minimalist', '{"coastal":0.7,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.3}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&h=800&fit=crop'),
  ('living_room', 'coastal_minimalist', '{"coastal":0.3,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.7}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&h=800&fit=crop'),
  ('bedroom', 'coastal_japandi', '{"coastal":0.7,"japandi":0.3,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1560448205-4d9b3e6bb6db?w=800&h=800&fit=crop'),
  ('bedroom', 'japandi_minimalist', '{"coastal":0.0,"japandi":0.7,"bohemian":0.0,"mid_century":0.0,"minimalist":0.3}', 'refinement', true, 0.8, 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&h=800&fit=crop')
ON CONFLICT DO NOTHING;

-- Tag products with primary style
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_style text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS style_weights jsonb;

UPDATE products SET primary_style = 'coastal'
  WHERE primary_style IS NULL AND LOWER(name) LIKE ANY(ARRAY['%coastal%','%beach%','%nautical%','%driftwood%','%linen%','%rattan%','%wicker%']);
UPDATE products SET primary_style = 'japandi'
  WHERE primary_style IS NULL AND LOWER(name) LIKE ANY(ARRAY['%japandi%','%zen%','%bamboo%','%natural wood%','%oak%']);
UPDATE products SET primary_style = 'bohemian'
  WHERE primary_style IS NULL AND LOWER(name) LIKE ANY(ARRAY['%boho%','%bohemian%','%macrame%','%eclectic%','%colorful%']);
UPDATE products SET primary_style = 'mid_century'
  WHERE primary_style IS NULL AND LOWER(name) LIKE ANY(ARRAY['%mid-century%','%mid century%','%retro%','%walnut%','%teak%','%eames%']);
UPDATE products SET primary_style = 'minimalist'
  WHERE primary_style IS NULL AND LOWER(name) LIKE ANY(ARRAY['%minimalist%','%clean%','%simple%','%white%','%modern%','%sleek%']);

UPDATE products SET style_weights =
  CASE primary_style
    WHEN 'coastal'     THEN '{"coastal":1.0,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}'::jsonb
    WHEN 'japandi'     THEN '{"coastal":0.0,"japandi":1.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}'::jsonb
    WHEN 'bohemian'    THEN '{"coastal":0.0,"japandi":0.0,"bohemian":1.0,"mid_century":0.0,"minimalist":0.0}'::jsonb
    WHEN 'mid_century' THEN '{"coastal":0.0,"japandi":0.0,"bohemian":0.0,"mid_century":1.0,"minimalist":0.0}'::jsonb
    WHEN 'minimalist'  THEN '{"coastal":0.0,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":1.0}'::jsonb
    ELSE NULL
  END
WHERE primary_style IS NOT NULL AND style_weights IS NULL;
