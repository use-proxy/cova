-- Add unique constraint on (user_id, room_id) for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_redesign_feedback_user_room
  ON redesign_feedback(user_id, room_id);
