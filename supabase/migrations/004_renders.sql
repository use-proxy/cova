-- Renders table with all status values, quality_tier CHECK, prompt/seed columns for reproducibility

CREATE TABLE public.renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  style_applied TEXT NOT NULL CHECK (char_length(style_applied) <= 200),
  style_blend_secondary TEXT CHECK (style_blend_secondary IS NULL OR char_length(style_blend_secondary) <= 200),
  style_blend_ratio FLOAT CHECK (style_blend_ratio IS NULL OR (style_blend_ratio BETWEEN 0 AND 1)),
  quality_tier TEXT NOT NULL DEFAULT 'draft' CHECK (quality_tier IN ('draft', 'hd')),
  image_url TEXT CHECK (image_url IS NULL OR char_length(image_url) <= 2000),
  replicate_prediction_id TEXT CHECK (replicate_prediction_id IS NULL OR char_length(replicate_prediction_id) <= 500),
  prompt_used TEXT CHECK (prompt_used IS NULL OR char_length(prompt_used) <= 5000),
  negative_prompt_used TEXT CHECK (negative_prompt_used IS NULL OR char_length(negative_prompt_used) <= 5000),
  denoising_strength FLOAT,
  guidance_scale FLOAT,
  seed INTEGER,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'complete', 'failed', 'quality_rejected')),
  brisque_score FLOAT,
  clip_style_score FLOAT,
  design_rationale TEXT CHECK (design_rationale IS NULL OR char_length(design_rationale) <= 2000),
  tokens_charged INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
