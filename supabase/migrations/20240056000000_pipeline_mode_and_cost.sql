-- Pipeline mode feature flag + cost tracking
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pipeline_mode TEXT DEFAULT 'mini_async_plus';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pipeline_cost_log JSONB DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
