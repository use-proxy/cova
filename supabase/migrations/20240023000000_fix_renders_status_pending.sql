-- Fix renders.status CHECK constraint to include 'pending'
-- Existing constraint excludes 'pending', causing INSERT failures
-- when the initial render record is created before FLUX starts.

ALTER TABLE renders DROP CONSTRAINT IF EXISTS renders_status_check;

ALTER TABLE renders
  ADD CONSTRAINT renders_status_check
  CHECK (status IN ('pending', 'processing', 'complete', 'completed', 'failed', 'quality_rejected'));
