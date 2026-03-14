-- Async job tracking for Replicate API calls

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('render', 'depth_map', 'product_match', 'inpaint')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  replicate_id TEXT CHECK (replicate_id IS NULL OR char_length(replicate_id) <= 500),
  input_params JSONB,
  result_url TEXT CHECK (result_url IS NULL OR char_length(result_url) <= 2000),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
