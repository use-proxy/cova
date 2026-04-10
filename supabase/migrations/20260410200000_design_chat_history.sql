-- Add design_chat_history JSONB column to rooms for persisting per-tab chat messages.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS design_chat_history JSONB DEFAULT '{}';
