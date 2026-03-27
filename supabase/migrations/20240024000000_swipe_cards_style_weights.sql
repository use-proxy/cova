-- Add style_weights, active, and phase columns to swipe_cards
-- style_weights: derived from the existing style column (jsonb blend vector)
-- active: soft-delete flag
-- phase: 'baseline' or 'refinement' for adaptive quiz deck

ALTER TABLE swipe_cards ADD COLUMN IF NOT EXISTS style_weights jsonb;
ALTER TABLE swipe_cards ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE swipe_cards ADD COLUMN IF NOT EXISTS phase text DEFAULT 'baseline';

-- Populate style_weights from existing style column
UPDATE swipe_cards SET style_weights =
  CASE style
    WHEN 'coastal'     THEN '{"coastal":1.0,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}'::jsonb
    WHEN 'japandi'     THEN '{"coastal":0.0,"japandi":1.0,"bohemian":0.0,"mid_century":0.0,"minimalist":0.0}'::jsonb
    WHEN 'bohemian'    THEN '{"coastal":0.0,"japandi":0.0,"bohemian":1.0,"mid_century":0.0,"minimalist":0.0}'::jsonb
    WHEN 'mid_century' THEN '{"coastal":0.0,"japandi":0.0,"bohemian":0.0,"mid_century":1.0,"minimalist":0.0}'::jsonb
    WHEN 'minimalist'  THEN '{"coastal":0.0,"japandi":0.0,"bohemian":0.0,"mid_century":0.0,"minimalist":1.0}'::jsonb
    ELSE               '{"coastal":0.2,"japandi":0.2,"bohemian":0.2,"mid_century":0.2,"minimalist":0.2}'::jsonb
  END
WHERE style_weights IS NULL;

-- Set active = true for all existing cards
UPDATE swipe_cards SET active = true WHERE active IS NULL;

-- Index on active + room_type for quiz queries
CREATE INDEX IF NOT EXISTS swipe_cards_active_room_idx ON public.swipe_cards (active, room_type);
