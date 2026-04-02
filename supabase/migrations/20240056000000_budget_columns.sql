-- Add budget columns to style_sessions
ALTER TABLE style_sessions ADD COLUMN IF NOT EXISTS budget_tier int;
ALTER TABLE style_sessions ADD COLUMN IF NOT EXISTS budget_range text;
