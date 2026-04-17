-- Add q_align_score column to renders table for 3-model ensemble scoring
-- Q-Align measures technical quality (artifacts, blur, noise) on 0-10 scale
ALTER TABLE renders ADD COLUMN IF NOT EXISTS q_align_score FLOAT;
