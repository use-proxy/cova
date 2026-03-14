-- Rooms table with ALL 3D columns: calibration_data JSONB, room_dimensions JSONB,
-- scene_state JSONB, updated_at trigger

CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  original_image_url TEXT NOT NULL CHECK (char_length(original_image_url) <= 2000),
  depth_map_url TEXT CHECK (depth_map_url IS NULL OR char_length(depth_map_url) <= 2000),
  depth_map_quality_score FLOAT,
  detected_existing_style TEXT CHECK (detected_existing_style IS NULL OR char_length(detected_existing_style) <= 100),
  room_type TEXT DEFAULT 'living_room' CHECK (room_type IN ('living_room', 'bedroom', 'kitchen', 'bathroom', 'office', 'dining')),
  calibration_data JSONB,
  room_dimensions JSONB,
  scene_state JSONB,
  listing_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER rooms_updated_at
BEFORE UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
