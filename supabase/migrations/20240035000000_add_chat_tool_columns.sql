-- Add tool_calls and tool_results columns to chat_messages if missing
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tool_calls JSONB DEFAULT NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tool_results JSONB DEFAULT NULL;
